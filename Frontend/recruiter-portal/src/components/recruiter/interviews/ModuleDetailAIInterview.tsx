import { useState } from 'react';
import { X, ChevronLeft, Download, AlertTriangle, ThumbsUp, ThumbsDown, Flag, MessageCircle, Video } from 'lucide-react';
import { motion } from 'motion/react';
import { useAIInterviewResult } from '../../../hooks/interviews/useInterviews';

interface TranscriptSegment {
  id: number;
  timestamp: string;
  speaker: 'AI' | 'Candidate';
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  flagged: boolean;
  accordionData?: { score?: number; feedback?: string; criteriaScores?: any[] };
}

interface IntegrityFlag {
  id: number;
  timestamp: string;
  type: 'evasive-response' | 'inconsistent' | 'suspicious-pause' | 'background-noise';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

interface ModuleDetailAIInterviewProps {
  candidateId: number;
  candidateName: string;
  score: number;
  completedDate: string;
  onClose: () => void;
  onMoveToNextStage: () => void;
  videoQuestionsData?: any[];
}

// Normalize interview score: backend may send 0-10 or 0-100
function normalizeInterviewScore(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 10 ? Math.round(n) / 10 : Math.round(n * 10) / 10;
}

function interviewScoreColor(score: number) {
  return score >= 7 ? 'bg-[#dcfce7] text-[#065f46]' : score >= 5 ? 'bg-[#fffbeb] text-[#92400e]' : 'bg-[#fef2f2] text-[#991b1b]';
}

function InterviewAccordion({ score, feedback, criteriaScores }: { score?: number; feedback?: string; criteriaScores?: any[] }) {
  const [open, setOpen] = useState(false);
  const normalized = score != null ? normalizeInterviewScore(score) : null;
  const hasContent = feedback || (Array.isArray(criteriaScores) && criteriaScores.length > 0);
  if (!hasContent) return null;
  return (
    <div className="mt-2 border border-[#e5e7eb] rounded-[8px] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#f5f3ff] hover:bg-[#ede9fe] transition-colors"
      >
        <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#5b21b6]">
          {open ? '▾' : '▸'} Score Breakdown
        </span>
        {normalized != null && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${interviewScoreColor(normalized)}`}>
            {normalized}/10
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 py-3 space-y-3 bg-white">
          {Array.isArray(criteriaScores) && criteriaScores.length > 0 && (
            <div>
              <div className="font-['Arimo',sans-serif] text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-2">Criteria</div>
              <div className="space-y-2">
                {criteriaScores.map((c: any, i: number) => {
                  const val = Number(c.score ?? c.value ?? 0);
                  const maxVal = Number(c.maxScore ?? c.max ?? 10);
                  const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#374151]">{c.criteria || c.label || c.name}</span>
                        <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#111827]">{val}/{maxVal}</span>
                      </div>
                      <div className="w-full h-[5px] bg-[#f3f4f6] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 70 ? 'bg-[#10b981]' : pct >= 50 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {feedback && (
            <div>
              <div className="font-['Arimo',sans-serif] text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">AI Feedback</div>
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#374151] leading-relaxed whitespace-pre-wrap">{feedback}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ModuleDetailAIInterview({
  candidateId,
  candidateName,
  score,
  completedDate,
  onClose,
  onMoveToNextStage,
  videoQuestionsData,
}: ModuleDetailAIInterviewProps) {
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [showRequestReview, setShowRequestReview] = useState(false);

  const { data: interviewResult } = useAIInterviewResult(
    videoQuestionsData ? undefined : String(candidateId)
  );

  const transcript: TranscriptSegment[] = videoQuestionsData
    ? videoQuestionsData.flatMap((q: any, i: number) => [
        {
          id: i * 2,
          timestamp: q.duration || '',
          speaker: 'AI' as const,
          text: q.question || '',
          sentiment: 'neutral' as const,
          flagged: false,
        },
        {
          id: i * 2 + 1,
          timestamp: q.duration || '',
          speaker: 'Candidate' as const,
          text: q.transcript || 'No transcript recorded.',
          sentiment: 'neutral' as const,
          flagged: false,
          accordionData: {
            score: q.score,
            feedback: q.feedback,
            criteriaScores: q.criteriaScores,
          },
        },
      ])
    : ((interviewResult as any)?.transcript || []);
  const integrityFlags: IntegrityFlag[] = (interviewResult as any)?.integrityFlags || [];
  const performanceMetrics: any[] = (interviewResult as any)?.performanceMetrics || [];

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-[#dcfce7] border-[#86efac]';
      case 'negative':
        return 'bg-[#fef2f2] border-[#fecaca]';
      default:
        return 'bg-[#f9fafb] border-[#e5e7eb]';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-[#ef4444] bg-[#fef2f2] border-[#fecaca]';
      case 'medium':
        return 'text-[#f59e0b] bg-[#fffbeb] border-[#fde68a]';
      case 'low':
        return 'text-[#3b82f6] bg-[#eff6ff] border-[#bfdbfe]';
      default:
        return 'text-[#6b7280] bg-[#f9fafb] border-[#e5e7eb]';
    }
  };

  return (
    <div className="w-full bg-[#f9fafb]">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-8 py-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-white text-[20px] mb-1">AI Interview Details</h2>
                <div className="flex items-center gap-3">
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white/90">
                    {candidateName}
                  </span>
                  <span className="text-white/60">•</span>
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white/90">
                    Completed {completedDate}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-['Arimo',sans-serif] text-[12px] text-white/80 mb-1">
                Overall Score
              </div>
              <div className="text-white text-[32px] leading-none">
                {score}%
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div>
          <div className="grid grid-cols-12 gap-6 p-8">
            {/* Left Column - Transcript */}
            <div className="col-span-8 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111827] text-[16px]">Interview Transcript</h3>
                <div className="flex items-center gap-2">
                  <button className="h-[32px] px-[12px] rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[12px] text-[#111827] transition-colors">
                    <Download size={14} className="inline mr-1" />
                    Download
                  </button>
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    Duration: 12:45
                  </span>
                </div>
              </div>

              {/* Sentiment Timeline */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle size={16} className="text-[#6366f1]" />
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Sentiment Timeline
                  </h4>
                </div>
                <div className="flex items-center gap-1 h-[24px]">
                  {transcript.filter(t => t.speaker === 'Candidate').map((segment, index) => (
                    <div
                      key={index}
                      className={`flex-1 h-full rounded-[2px] cursor-pointer transition-all hover:opacity-80 ${segment.sentiment === 'positive'
                        ? 'bg-[#10b981]'
                        : segment.sentiment === 'negative'
                          ? 'bg-[#ef4444]'
                          : 'bg-[#6b7280]'
                        }`}
                      onClick={() => setSelectedSegment(segment.id)}
                      title={segment.timestamp}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <div className="w-[12px] h-[12px] bg-[#10b981] rounded-[2px]" />
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                        Positive
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-[12px] h-[12px] bg-[#6b7280] rounded-[2px]" />
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                        Neutral
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-[12px] h-[12px] bg-[#ef4444] rounded-[2px]" />
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                        Negative
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transcript Messages */}
              <div className="space-y-3">
                {transcript.map((segment) => (
                  <div
                    key={segment.id}
                    className={`border rounded-[12px] p-4 transition-all ${segment.flagged
                      ? 'border-[#fecaca] bg-[#fef2f2]'
                      : getSentimentColor(segment.sentiment)
                      } ${selectedSegment === segment.id ? 'ring-2 ring-[#6366f1]' : ''
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-[32px] h-[32px] rounded-full flex items-center justify-center flex-shrink-0 ${segment.speaker === 'AI'
                        ? 'bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]'
                        : 'bg-[#10b981]'
                        }`}>
                        {segment.speaker === 'AI' ? (
                          <Video size={16} className="text-white" />
                        ) : (
                          <span className="font-['Arimo',sans-serif] text-[12px] text-white">
                            {candidateName.split(' ').map(n => n[0]).join('')}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                              {segment.speaker === 'AI' ? 'AI Interviewer' : candidateName}
                            </span>
                            <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                              {segment.timestamp}
                            </span>
                          </div>
                          {segment.flagged && (
                            <Flag size={14} className="text-[#ef4444]" />
                          )}
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151] leading-relaxed">
                          {segment.text}
                        </p>
                        {segment.speaker === 'Candidate' && (
                          <>
                            <div className="flex items-center gap-2 mt-2">
                              {segment.sentiment === 'positive' && (
                                <div className="flex items-center gap-1">
                                  <ThumbsUp size={12} className="text-[#10b981]" />
                                  <span className="font-['Arimo',sans-serif] text-[11px] text-[#10b981]">
                                    Confident
                                  </span>
                                </div>
                              )}
                              {segment.sentiment === 'negative' && (
                                <div className="flex items-center gap-1">
                                  <ThumbsDown size={12} className="text-[#ef4444]" />
                                  <span className="font-['Arimo',sans-serif] text-[11px] text-[#ef4444]">
                                    Hesitant
                                  </span>
                                </div>
                              )}
                            </div>
                            {segment.accordionData && (
                              <InterviewAccordion
                                score={segment.accordionData.score}
                                feedback={segment.accordionData.feedback}
                                criteriaScores={segment.accordionData.criteriaScores}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column - Integrity & Actions */}
            <div className="col-span-4 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111827] text-[16px]">Integrity Flags</h3>
                <span className={`px-[8px] py-[2px] rounded-[4px] font-['Arimo',sans-serif] text-[11px] ${integrityFlags.length > 0
                  ? 'bg-[#fffbeb] text-[#f59e0b]'
                  : 'bg-[#dcfce7] text-[#10b981]'
                  }`}>
                  {integrityFlags.length} flags
                </span>
              </div>

              {integrityFlags.length > 0 ? (
                <div className="space-y-3">
                  {integrityFlags.map((flag) => (
                    <div
                      key={flag.id}
                      className={`border rounded-[12px] p-4 ${getSeverityColor(flag.severity)}`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-['Arimo',sans-serif] text-[13px] mb-1">
                            {flag.description}
                          </div>
                          <div className="flex items-center justify-between text-[11px] opacity-70">
                            <span className="font-['Arimo',sans-serif]">
                              {flag.timestamp}
                            </span>
                            <span className="font-['Arimo',sans-serif] uppercase">
                              {flag.severity}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const segment = transcript.find(t => t.timestamp === flag.timestamp);
                          if (segment) setSelectedSegment(segment.id);
                        }}
                        className="w-full h-[28px] px-[10px] rounded-[6px] border border-current hover:bg-white/50 font-['Arimo',sans-serif] text-[11px] transition-colors"
                      >
                        Jump to Timestamp
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#dcfce7] border border-[#86efac] rounded-[12px] p-6 text-center">
                  <ThumbsUp size={32} className="text-[#10b981] mx-auto mb-3" />
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#10b981] mb-1">
                    No Issues Detected
                  </div>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#059669]">
                    Interview completed without integrity concerns
                  </p>
                </div>
              )}

              {/* Performance Metrics */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-4">
                  Performance Breakdown
                </h4>
                <div className="space-y-3">
                  {performanceMetrics.map((metric, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                          {metric.label}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                          {metric.value}%
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#f3f4f6] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${metric.color} transition-all`}
                          style={{ width: `${metric.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
                  Quick Actions
                </h4>
                <div className="space-y-2">
                  <button className="w-full h-[36px] px-[14px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors text-left flex items-center gap-2">
                    <Flag size={14} className="text-[#6b7280]" />
                    Add Flag
                  </button>
                  <button
                    onClick={() => setShowRequestReview(true)}
                    className="w-full h-[36px] px-[14px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors text-left flex items-center gap-2"
                  >
                    <MessageCircle size={14} className="text-[#6b7280]" />
                    Request Human Review
                  </button>
                  <button className="w-full h-[36px] px-[14px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors text-left flex items-center gap-2">
                    <Download size={14} className="text-[#6b7280]" />
                    Download Full Transcript
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* Request Review Modal */}
        {showRequestReview && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center" onClick={() => setShowRequestReview(false)}>
            <div className="bg-white rounded-[12px] p-6 w-[400px]" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[#111827] text-[16px] mb-4">Request Human Review</h3>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
                A senior recruiter will be assigned to review this interview and provide additional assessment.
              </p>
              <textarea
                placeholder="Add notes for the reviewer..."
                className="w-full h-[80px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] mb-4 resize-none"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowRequestReview(false)}
                  className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] text-[#111827]"
                >
                  Cancel
                </button>
                <button className="h-[36px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[13px] text-white">
                  Send Request
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}