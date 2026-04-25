/**
 * LiveInterviewMonitor.tsx
 *
 * Real-time session monitoring dashboard for Live Interview V2.
 * Displays all sessions for a group with reconstructed event timelines,
 * judge pipeline status, and live candidate name + score indicators.
 *
 * Polling: every 3s when sessions are active, every 10s when all done.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, RefreshCw, CircleDot, UserCheck, Bot, MessageSquare,
  CheckCircle, Zap, Star, AlertTriangle, Clock,
  ChevronDown, ChevronRight, Activity, Users, Brain, AlertCircle, Eye,
} from 'lucide-react';
import { fetchAPI } from '../../../services/client';

// ─── Types ─────────────────────────────────────────────────────────────────

interface SessionEvent {
  time: string;
  type: string;
  icon: string;
  label: string;
  detail: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

interface SessionRow {
  session_id: string;
  candidate_id: string;
  candidate_name: string;
  room_name: string | null;
  state: string;
  transcript_turns: number;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  judge_status: 'pending' | 'running' | 'complete';
  evaluation: {
    overall_score_pct: number | null;
    auto_verdict: string | null;
    evaluation_confidence: string | null;
    judged_at: string | null;
  } | null;
  events: SessionEvent[];
}

interface MonitorData {
  group_id: string;
  summary: {
    active: number;
    judging: number;
    completed: number;
    failed: number;
    total: number;
  };
  sessions: SessionRow[];
}

interface LiveInterviewMonitorProps {
  groupId: string;
  groupName?: string;
  onClose: () => void;
  onViewResults?: (sessionId: string) => void;
  mockMode?: boolean;
}

// ─── Icon resolver ──────────────────────────────────────────────────────────
const EventIcon = ({ type, level }: { type: string; level: string }) => {
  const cls = `w-3.5 h-3.5 flex-shrink-0 ${
    level === 'success' ? 'text-emerald-500' :
    level === 'warning' ? 'text-amber-500' :
    level === 'error'   ? 'text-red-500' :
    'text-blue-400'
  }`;
  switch (type) {
    case 'session_created':   return <CircleDot className={cls} />;
    case 'candidate_joined':  return <UserCheck className={cls} />;
    case 'agent_dispatched':  return <Bot className={cls} />;
    case 'transcript_turns':  return <MessageSquare className={cls} />;
    case 'session_completed': return <CheckCircle className={cls} />;
    case 'judge_queued':      return <Zap className={cls} />;
    case 'evaluation_complete':return <Star className={cls} />;
    default:                  return <CircleDot className={cls} />;
  }
};

// ─── Verdict badge ──────────────────────────────────────────────────────────
const VerdictBadge = ({ verdict }: { verdict: string | null }) => {
  if (!verdict) return null;
  const map: Record<string, string> = {
    strong_pass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    pass:        'bg-blue-100 text-blue-800 border-blue-200',
    borderline:  'bg-amber-100 text-amber-800 border-amber-200',
    fail:        'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${map[verdict] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {verdict.replace('_', ' ').toUpperCase()}
    </span>
  );
};

// ─── State badge ─────────────────────────────────────────────────────────────
const StateBadge = ({ state, judgeStatus }: { state: string; judgeStatus: string }) => {
  if (state === 'in_progress') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        LIVE
      </span>
    );
  }
  if (state === 'completed' && judgeStatus === 'running') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
        <Brain className="w-3 h-3 animate-pulse" />
        GRADING
      </span>
    );
  }
  if (state === 'completed' && judgeStatus === 'complete') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
        <CheckCircle className="w-3 h-3" />
        GRADED
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
        FAILED
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
      {state.toUpperCase()}
    </span>
  );
};

// ─── Format helpers ──────────────────────────────────────────────────────────
const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const fmtDuration = (secs: number | null) => {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
};

// ─── Main Component ──────────────────────────────────────────────────────────
export function LiveInterviewMonitor({ groupId, groupName, onClose, onViewResults, mockMode }: LiveInterviewMonitorProps) {
  const [data, setData] = useState<MonitorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async () => {
    if (mockMode) {
      const now = Date.now();
      setData({
        group_id: groupId,
        summary: { active: 1, judging: 1, completed: 1, failed: 0, total: 3 },
        sessions: [
          {
            session_id: 'a1b2c3d4-e5f6-7890-1234-56789abcdef0',
            candidate_id: 'c1-123',
            candidate_name: 'Maya Hassan',
            room_name: 'li-v2-abc123',
            state: 'in_progress',
            transcript_turns: 8,
            duration_seconds: 720,
            started_at: new Date(now - 720000).toISOString(),
            ended_at: null,
            created_at: new Date(now - 800000).toISOString(),
            judge_status: 'pending',
            evaluation: null,
            events: [
              { time: new Date(now - 800000).toISOString(), type: 'session_created', icon: 'circle-dot', label: 'Session Created', detail: 'Room allocated', level: 'info' },
              { time: new Date(now - 720000).toISOString(), type: 'candidate_joined', icon: 'user-check', label: 'Candidate Joined', detail: 'Maya Hassan connected', level: 'success' },
              { time: new Date(now - 718000).toISOString(), type: 'agent_dispatched', icon: 'bot', label: 'Agent Dispatched', detail: 'AI Interviewer connected', level: 'info' },
              { time: new Date(now - 360000).toISOString(), type: 'transcript_turns', icon: 'message-square', label: 'Conversation Active', detail: '8 turns recorded', level: 'info' },
            ],
          },
          {
            session_id: 'b2c3d4e5-f6a7-8901-2345-6789abcdef01',
            candidate_id: 'c2-123',
            candidate_name: 'Omar Farid',
            room_name: 'li-v2-def456',
            state: 'completed',
            transcript_turns: 15,
            duration_seconds: 1680,
            started_at: new Date(now - 2000000).toISOString(),
            ended_at: new Date(now - 320000).toISOString(),
            created_at: new Date(now - 2100000).toISOString(),
            judge_status: 'running',
            evaluation: null,
            events: [
              { time: new Date(now - 2100000).toISOString(), type: 'session_created', icon: 'circle-dot', label: 'Session Created', detail: 'Room allocated', level: 'info' },
              { time: new Date(now - 2000000).toISOString(), type: 'candidate_joined', icon: 'user-check', label: 'Candidate Joined', detail: 'Omar Farid connected', level: 'success' },
              { time: new Date(now - 1998000).toISOString(), type: 'agent_dispatched', icon: 'bot', label: 'Agent Dispatched', detail: 'AI Interviewer connected', level: 'info' },
              { time: new Date(now - 1000000).toISOString(), type: 'transcript_turns', icon: 'message-square', label: 'Conversation Active', detail: '15 turns recorded', level: 'info' },
              { time: new Date(now - 320000).toISOString(), type: 'session_completed', icon: 'check-circle', label: 'Session Completed', detail: 'Candidate finished interview', level: 'success' },
              { time: new Date(now - 310000).toISOString(), type: 'judge_queued', icon: 'zap', label: 'Judge Pipeline Queued', detail: 'Processing transcript', level: 'info' },
            ],
          },
          {
            session_id: 'c3d4e5f6-a7b8-9012-3456-789abcdef012',
            candidate_id: 'c3-123',
            candidate_name: 'Sara Nasser',
            room_name: 'li-v2-ghi789',
            state: 'completed',
            transcript_turns: 22,
            duration_seconds: 1920,
            started_at: new Date(now - 4000000).toISOString(),
            ended_at: new Date(now - 2080000).toISOString(),
            created_at: new Date(now - 4100000).toISOString(),
            judge_status: 'complete',
            evaluation: {
              overall_score_pct: 78,
              auto_verdict: 'pass',
              evaluation_confidence: 'high',
              judged_at: '2026-04-25T19:45:00Z',
            },
            events: [
              { time: new Date(now - 4100000).toISOString(), type: 'session_created', icon: 'circle-dot', label: 'Session Created', detail: 'Room allocated', level: 'info' },
              { time: new Date(now - 4000000).toISOString(), type: 'candidate_joined', icon: 'user-check', label: 'Candidate Joined', detail: 'Sara Nasser connected', level: 'success' },
              { time: new Date(now - 3998000).toISOString(), type: 'agent_dispatched', icon: 'bot', label: 'Agent Dispatched', detail: 'AI Interviewer connected', level: 'info' },
              { time: new Date(now - 3000000).toISOString(), type: 'transcript_turns', icon: 'message-square', label: 'Conversation Active', detail: '22 turns recorded', level: 'info' },
              { time: new Date(now - 2080000).toISOString(), type: 'session_completed', icon: 'check-circle', label: 'Session Completed', detail: 'Candidate finished interview', level: 'success' },
              { time: new Date(now - 2070000).toISOString(), type: 'judge_queued', icon: 'zap', label: 'Judge Pipeline Queued', detail: 'Processing transcript', level: 'info' },
              { time: new Date('2026-04-25T19:45:00Z').toISOString(), type: 'evaluation_complete', icon: 'star', label: 'Evaluation Complete', detail: 'Score and verdict generated', level: 'success' },
            ],
          },
        ],
      });
      setLastPoll(new Date());
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetchAPI<MonitorData>(`/live-interview-v2/group/${groupId}/sessions-monitor`);
      setData(res);
      setLastPoll(new Date());
      setError(null);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to fetch monitoring data');
    } finally {
      setIsLoading(false);
    }
  }, [groupId, mockMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Adaptive polling: 3s if active sessions, 10s if all done
  useEffect(() => {
    if (mockMode) return;
    
    const hasActive = data?.sessions.some(s =>
      s.state === 'in_progress' || s.judge_status === 'running'
    );
    const interval = hasActive ? 3000 : 10000;

    pollRef.current = setTimeout(() => fetchData(), interval);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [data, fetchData, mockMode]);

  // Auto-scroll log area when expanded session's events change
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [expandedSession, data]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950/95 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white">
          <Activity className="w-8 h-8 animate-pulse text-blue-400" />
          <p className="text-sm text-gray-400">Connecting to session monitor...</p>
        </div>
      </div>
    );
  }

  const expandedData = expandedSession
    ? data?.sessions.find(s => s.session_id === expandedSession)
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/98 flex flex-col font-mono">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm tracking-wide">
              Live Interview Monitor
              {groupName && <span className="text-gray-400 font-normal ml-2">— {groupName}</span>}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Live · polling every {(data?.sessions.some(s => s.state === 'in_progress' || s.judge_status === 'running') ? 3 : 10)}s
              {lastPoll && <span className="text-gray-600">· last: {fmtTime(lastPoll.toISOString())}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {data && (
        <div className="flex gap-3 px-6 py-4 border-b border-gray-800/60">
          {[
            { label: 'Live Now',   value: data.summary.active,    color: 'text-blue-400',   bg: 'bg-blue-500/10',   icon: <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> },
            { label: 'Grading',   value: data.summary.judging,   color: 'text-amber-400',  bg: 'bg-amber-500/10',  icon: <Brain className="w-3 h-3 text-amber-400 animate-pulse" /> },
            { label: 'Graded',    value: data.summary.completed, color: 'text-emerald-400',bg: 'bg-emerald-500/10',icon: <CheckCircle className="w-3 h-3 text-emerald-400" /> },
            { label: 'Failed',    value: data.summary.failed,    color: 'text-red-400',    bg: 'bg-red-500/10',    icon: <AlertTriangle className="w-3 h-3 text-red-400" /> },
            { label: 'Total',     value: data.summary.total,     color: 'text-gray-300',   bg: 'bg-gray-500/10',   icon: <Users className="w-3 h-3 text-gray-400" /> },
          ].map(card => (
            <div key={card.label} className={`flex items-center gap-3 ${card.bg} border border-white/5 rounded-lg px-4 py-2.5 flex-1`}>
              {card.icon}
              <div>
                <div className={`text-xl font-bold ${card.color} leading-none`}>{card.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">{card.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Session List ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {!data || data.sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-600">
            <Bot className="w-10 h-10 mb-3" />
            <p className="text-sm">No sessions started for this group yet.</p>
            <p className="text-xs mt-1">Sessions will appear here once candidates join.</p>
          </div>
        ) : (
          data.sessions.map((session) => {
            const isExpanded = expandedSession === session.session_id;
            return (
              <div
                key={session.session_id}
                className={`bg-gray-900 border rounded-xl overflow-hidden transition-all ${
                  session.state === 'in_progress'
                    ? 'border-blue-500/40 shadow-blue-500/10 shadow-lg'
                    : 'border-gray-700/50'
                }`}
              >
                {/* Session row header */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/50 transition-colors text-left"
                  onClick={() => setExpandedSession(isExpanded ? null : session.session_id)}
                >
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <StateBadge state={session.state} judgeStatus={session.judge_status} />
                    <span className="text-sm text-white font-medium truncate">
                      {session.candidate_name}
                    </span>
                    {session.evaluation?.auto_verdict && (
                      <VerdictBadge verdict={session.evaluation.auto_verdict} />
                    )}
                    {session.evaluation?.overall_score_pct != null && (
                      <span className="text-xs text-gray-400 font-mono">
                        {session.evaluation.overall_score_pct}%
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
                    {session.transcript_turns > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {session.transcript_turns} turns
                      </span>
                    )}
                    {session.duration_seconds && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDuration(session.duration_seconds)}
                      </span>
                    )}
                    <span className="font-mono text-gray-600 text-[10px] truncate max-w-[120px]">
                      {session.room_name}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded event log */}
                {isExpanded && (
                  <div className="border-t border-gray-700/50">
                    <div
                      ref={isExpanded ? logRef : null}
                      className="max-h-64 overflow-y-auto px-5 py-4 space-y-2 text-xs bg-gray-950/50"
                    >
                      {session.events.length === 0 ? (
                        <p className="text-gray-600">No events recorded yet.</p>
                      ) : (
                        session.events.map((ev, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <span className="font-mono text-gray-600 w-[84px] flex-shrink-0 text-[10px] tabular-nums pt-0.5">
                              {fmtTime(ev.time)}
                            </span>
                            <EventIcon type={ev.type} level={ev.level} />
                            <div>
                              <span className={`font-medium ${
                                ev.level === 'success' ? 'text-emerald-400' :
                                ev.level === 'warning' ? 'text-amber-400' :
                                ev.level === 'error'   ? 'text-red-400'   :
                                'text-blue-300'
                              }`}>
                                {ev.label}
                              </span>
                              {ev.detail && (
                                <span className="text-gray-500 ml-2">· {ev.detail}</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}

                      {/* Live indicator for in-progress sessions */}
                      {session.state === 'in_progress' && (
                        <div className="flex items-center gap-3 pt-1">
                          <span className="font-mono text-gray-700 w-[84px] text-[10px]">now</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                          <span className="text-blue-400 animate-pulse">Interview in progress…</span>
                        </div>
                      )}

                      {/* Judge running indicator */}
                      {session.state === 'completed' && session.judge_status === 'running' && (
                        <div className="flex items-center gap-3 pt-1">
                          <span className="font-mono text-gray-700 w-[84px] text-[10px]">now</span>
                          <Brain className="w-3.5 h-3.5 text-amber-400 animate-pulse flex-shrink-0" />
                          <span className="text-amber-400 animate-pulse">Judge pipeline running…</span>
                        </div>
                      )}
                    </div>

                    {/* Session metadata strip */}
                    <div className="flex items-center gap-4 px-5 py-2.5 border-t border-gray-700/30 text-[10px] text-gray-600 font-mono">
                      <span>ID: {session.session_id.slice(0, 8)}…</span>
                      <span>·</span>
                      <span>Created: {fmtTime(session.created_at)}</span>
                      {session.started_at && <><span>·</span><span>Started: {fmtTime(session.started_at)}</span></>}
                      {session.ended_at && <><span>·</span><span>Ended: {fmtTime(session.ended_at)}</span></>}
                      {session.evaluation?.judged_at && (
                        <><span>·</span><span>Judged: {fmtTime(session.evaluation.judged_at)}</span></>
                      )}
                      {session.evaluation?.evaluation_confidence && (
                        <><span>·</span><span>Confidence: {session.evaluation.evaluation_confidence}</span></>
                      )}
                    </div>

                    {/* View Results button for graded sessions */}
                    {session.judge_status === 'complete' && onViewResults && (
                      <div className="px-5 py-3 border-t border-gray-700/30">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewResults(session.session_id);
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Full Results
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/60 flex items-center justify-between text-[10px] text-gray-600 font-mono">
        <span>Group: {groupId.slice(0, 8)}…</span>
        <span>
          {data?.sessions.length ?? 0} sessions · Polling every {
            (data?.sessions.some(s => s.state === 'in_progress' || s.judge_status === 'running') ? 3 : 10)
          }s
        </span>
      </div>
    </div>
  );
}
