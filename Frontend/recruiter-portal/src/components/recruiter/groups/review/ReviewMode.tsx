import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CheckCircle, XCircle, Clock, Shield, ArrowRight, Filter, ChevronDown, Eye, Loader2,
} from 'lucide-react';
import { useStageMonitoring } from '../../../../hooks/groups/useGroups';
import { LiveInterviewResults } from '../../live-interview-v2/LiveInterviewResults';

export interface ReviewStage {
    key: string;       // 'assessment' | 'ai-interview' | 'live-interview'
    label: string;
    state: string;     // 'not-started' | 'active' | 'closed'
}

interface ReviewModeProps {
    groupId: string;
    stages: ReviewStage[];
    recruiterType: 'recruiter' | 'technical';
    onViewCandidate: (candidateId: string, applicationId: string) => void;
    onProceed: (stageKey: string, applicationIds: string[], action: 'progress' | 'reject' | 'hold') => void;
    proceedPending?: boolean;
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[-\s]/g, '_');

const INTEGRITY_STYLE: Record<string, string> = {
    clean: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    monitoring: 'bg-amber-50 text-amber-700 border-amber-200',
    suspicious_review: 'bg-orange-100 text-orange-800 border-orange-200',
    confirmed_cheating: 'bg-red-100 text-red-800 border-red-200',
};
const INTEGRITY_LABEL: Record<string, string> = {
    clean: 'Clean', monitoring: 'Monitoring', suspicious_review: 'Suspicious', confirmed_cheating: 'Confirmed',
};

function scoreColor(v: number | null | undefined): string {
    if (v == null) return 'text-gray-400';
    if (v >= 70) return 'text-emerald-600';
    if (v >= 50) return 'text-amber-600';
    return 'text-red-600';
}

export function ReviewMode({ groupId, stages, recruiterType, onViewCandidate, onProceed, proceedPending }: ReviewModeProps) {
    // Default stage: most-recent closed → active → first
    const defaultStageKey = useMemo(() => {
        const closed = [...stages].reverse().find((s) => norm(s.state) === 'closed');
        const active = stages.find((s) => norm(s.state) === 'active');
        return (closed || active || stages[0])?.key ?? '';
    }, [stages]);

    const [stageKey, setStageKey] = useState(defaultStageKey);
    useEffect(() => {
        if (!stages.some((s) => s.key === stageKey)) setStageKey(defaultStageKey);
    }, [defaultStageKey, stageKey, stages]);

    const { data, isLoading, isError } = useStageMonitoring(groupId, stageKey || undefined);
    const candidates: any[] = (data as any)?.candidates ?? [];
    const passThreshold: number = (data as any)?.pass_threshold ?? 70;

    // Filters
    const [scoreMin, setScoreMin] = useState(0);
    const [verdictFilter, setVerdictFilter] = useState<string | null>(null);
    const [integrityFilter, setIntegrityFilter] = useState<string | null>(null);
    const [subFilters, setSubFilters] = useState<Record<string, number>>({});
    const [showFilters, setShowFilters] = useState(true);

    const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());

    // Reset filters/selection when the stage changes
    useEffect(() => {
        setScoreMin(0); setVerdictFilter(null); setIntegrityFilter(null);
        setSubFilters({}); setChecked(new Set()); setSelectedAppId(null);
    }, [stageKey]);

    // Available per-type sub-score keys (union across candidates)
    const subKeys = useMemo(() => {
        const set = new Set<string>();
        for (const c of candidates) if (c.sub_scores) Object.keys(c.sub_scores).forEach((k) => set.add(k));
        return Array.from(set);
    }, [candidates]);

    const filtered = useMemo(() => candidates.filter((c) => {
        if ((c.score ?? 0) < scoreMin) return false;
        if (verdictFilter && (c.verdict ?? '') !== verdictFilter) return false;
        if (integrityFilter && (c.integrity_verdict ?? 'clean') !== integrityFilter) return false;
        for (const [k, min] of Object.entries(subFilters)) {
            if (min > 0 && ((c.sub_scores?.[k]) ?? 0) < min) return false;
        }
        return true;
    }), [candidates, scoreMin, verdictFilter, integrityFilter, subFilters]);

    const active = filtered.find((c) => c.application_id === selectedAppId) ?? filtered[0];
    const currentStage = stages.find((s) => s.key === stageKey);
    const stageClosed = norm(currentStage?.state) === 'closed';

    const allFilteredChecked = filtered.length > 0 && filtered.every((c) => checked.has(c.application_id));
    const toggleAll = () => {
        setChecked((prev) => {
            const next = new Set(prev);
            if (allFilteredChecked) filtered.forEach((c) => next.delete(c.application_id));
            else filtered.forEach((c) => next.add(c.application_id));
            return next;
        });
    };
    const toggleOne = (appId: string) => setChecked((prev) => {
        const next = new Set(prev); next.has(appId) ? next.delete(appId) : next.add(appId); return next;
    });

    const isLive = norm(stageKey) === 'live_interview';

    return (
        <div className="px-8 py-6 space-y-4">
            {/* Stage selector + filter toggle */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-gray-500">Stage:</span>
                    <div className="flex gap-1 bg-white border border-gray-100 rounded-[10px] p-1 shadow-sm">
                        {stages.map((s) => (
                            <button
                                key={s.key}
                                onClick={() => setStageKey(s.key)}
                                className={`px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-all ${stageKey === s.key ? 'bg-[#f5f3ff] text-[#6366f1] font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                {s.label}
                                <span className={`ml-2 text-[10px] uppercase ${norm(s.state) === 'closed' ? 'text-emerald-500' : norm(s.state) === 'active' ? 'text-indigo-400' : 'text-gray-300'}`}>
                                    {norm(s.state) === 'closed' ? 'closed' : norm(s.state) === 'active' ? 'active' : '—'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    onClick={() => setShowFilters((v) => !v)}
                    className="flex items-center gap-1.5 rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 shadow-sm"
                >
                    <Filter size={13} /> Filters
                    <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Filter bar */}
            {showFilters && (
                <div className="rounded-[14px] border border-gray-200 bg-white p-4 shadow-sm space-y-4">
                    {/* Overall score range */}
                    <div className="flex items-center gap-4 flex-wrap">
                        <label className="text-[12px] font-semibold text-gray-700 w-[140px]">Overall score ≥ {scoreMin}%</label>
                        <input type="range" min={0} max={100} value={scoreMin} onChange={(e) => setScoreMin(Number(e.target.value))} className="flex-1 min-w-[160px] accent-[#6366f1]" />
                    </div>
                    {/* Per-type sub-score ranges */}
                    {subKeys.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-gray-100 pt-3">
                            {subKeys.map((k) => (
                                <div key={k} className="flex items-center gap-2">
                                    <label className="text-[12px] font-medium text-gray-600 capitalize w-[110px] truncate" title={k}>{k} ≥ {subFilters[k] ?? 0}%</label>
                                    <input type="range" min={0} max={100} value={subFilters[k] ?? 0} onChange={(e) => setSubFilters((p) => ({ ...p, [k]: Number(e.target.value) }))} className="flex-1 accent-[#6366f1]" />
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Verdict + integrity chips */}
                    <div className="flex items-center gap-4 flex-wrap border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] font-semibold text-gray-700">Verdict:</span>
                            {['pass', 'fail', 'pending'].map((v) => (
                                <button key={v} onClick={() => setVerdictFilter(verdictFilter === v ? null : v)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors capitalize ${verdictFilter === v ? 'bg-[#6366f1] text-white border-[#6366f1]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                    {v}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] font-semibold text-gray-700">Integrity:</span>
                            {['clean', 'monitoring', 'suspicious_review', 'confirmed_cheating'].map((v) => (
                                <button key={v} onClick={() => setIntegrityFilter(integrityFilter === v ? null : v)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${integrityFilter === v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                    {INTEGRITY_LABEL[v]}
                                </button>
                            ))}
                        </div>
                        <span className="ml-auto text-[12px] text-gray-500">{filtered.length} / {candidates.length} match</span>
                    </div>
                </div>
            )}

            {/* Body: rail + detail */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-[13px]"><Loader2 className="animate-spin mr-2" size={16} /> Loading results…</div>
            ) : isError ? (
                <div className="rounded-[14px] border border-dashed border-red-200 bg-red-50 py-10 text-center text-[13px] text-red-600">Failed to load stage results.</div>
            ) : candidates.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-gray-200 bg-gray-50 py-16 text-center text-[13px] text-gray-400">No candidates have reached this stage yet.</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                    {/* Candidate rail */}
                    <div className="rounded-[14px] border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col max-h-[640px]">
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50">
                            <label className="flex items-center gap-2 text-[12px] font-medium text-gray-600 cursor-pointer">
                                <input type="checkbox" checked={allFilteredChecked} onChange={toggleAll} className="accent-[#6366f1]" />
                                Select all ({filtered.length})
                            </label>
                            <span className="text-[11px] text-gray-400">{checked.size} selected</span>
                        </div>
                        <div className="overflow-y-auto">
                            {filtered.map((c) => {
                                const isActive = active && c.application_id === active.application_id;
                                return (
                                    <button
                                        key={c.application_id}
                                        onClick={() => setSelectedAppId(c.application_id)}
                                        className={`w-full text-left px-3 py-2.5 border-b border-gray-50 flex items-center gap-2.5 transition-colors ${isActive ? 'bg-[#f5f3ff]' : 'hover:bg-gray-50'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked.has(c.application_id)}
                                            onChange={(e) => { e.stopPropagation(); toggleOne(c.application_id); }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="accent-[#6366f1]"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium text-gray-900 truncate">{c.name}</div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className={`text-[11px] font-semibold ${scoreColor(c.score)}`}>{c.score != null ? `${Math.round(c.score)}%` : '—'}</span>
                                                {c.verdict && c.verdict !== 'pending' && (
                                                    <span className={`text-[10px] ${c.verdict === 'pass' ? 'text-emerald-500' : 'text-red-500'}`}>· {c.verdict}</span>
                                                )}
                                            </div>
                                        </div>
                                        {c.integrity_verdict && c.integrity_verdict !== 'clean' && (
                                            <Shield size={13} className="text-orange-500 shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Detail panel */}
                    <div className="rounded-[14px] border border-gray-200 bg-white shadow-sm p-5 min-h-[400px]">
                        {!active ? (
                            <div className="flex items-center justify-center h-full text-gray-400 text-[13px]">Select a candidate to see their breakdown.</div>
                        ) : (
                            <div className="space-y-5">
                                {/* Header */}
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-[18px] font-bold text-gray-900">{active.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[22px] font-bold ${scoreColor(active.score)}`}>{active.score != null ? `${Math.round(active.score)}%` : '—'}</span>
                                            <span className="text-[12px] text-gray-400">overall · threshold {passThreshold}%</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {active.verdict && active.verdict !== 'pending' && (
                                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${active.verdict === 'pass' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {active.verdict === 'pass' ? <CheckCircle size={11} className="inline mr-1" /> : <XCircle size={11} className="inline mr-1" />}
                                                {active.verdict}
                                            </span>
                                        )}
                                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${INTEGRITY_STYLE[active.integrity_verdict ?? 'clean']}`}>
                                            {INTEGRITY_LABEL[active.integrity_verdict ?? 'clean']}
                                        </span>
                                        <button onClick={() => onViewCandidate(String(active.candidate_id), String(active.application_id))}
                                            className="flex items-center gap-1 rounded-[8px] border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                                            <Eye size={12} /> Full profile
                                        </button>
                                    </div>
                                </div>

                                {/* Per-type sub-score bars */}
                                {active.sub_scores && Object.keys(active.sub_scores).length > 0 && (
                                    <div className="space-y-2.5">
                                        <div className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">Breakdown by type</div>
                                        {Object.entries(active.sub_scores as Record<string, number>).map(([k, v]) => (
                                            <div key={k} className="flex items-center gap-3">
                                                <span className="text-[12px] text-gray-600 capitalize w-[120px] truncate" title={k}>{k}</span>
                                                <div className="flex-1 h-[8px] bg-gray-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${v >= 70 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
                                                </div>
                                                <span className={`text-[12px] font-semibold w-[44px] text-right ${scoreColor(v)}`}>{Math.round(v)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Per-stage signal chips */}
                                <div className="flex items-center gap-2 flex-wrap text-[12px]">
                                    {active.ai_recommendation && <span className="px-2 py-1 rounded-[6px] bg-indigo-50 text-indigo-700">AI rec: {active.ai_recommendation}</span>}
                                    {active.retakes_used != null && <span className="px-2 py-1 rounded-[6px] bg-gray-100 text-gray-600">Retakes: {active.retakes_used}</span>}
                                    {active.auto_verdict && <span className="px-2 py-1 rounded-[6px] bg-indigo-50 text-indigo-700">Auto-verdict: {active.auto_verdict}</span>}
                                    {active.completion_time && <span className="px-2 py-1 rounded-[6px] bg-gray-100 text-gray-500 flex items-center gap-1"><Clock size={11} /> {new Date(active.completion_time).toLocaleDateString()}</span>}
                                </div>

                                {/* Flags */}
                                {Array.isArray(active.flags) && active.flags.length > 0 && (
                                    <div className="rounded-[10px] border border-orange-200 bg-orange-50 p-3">
                                        <div className="text-[12px] font-semibold text-orange-800 mb-1">Integrity flags ({active.flags.length})</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {active.flags.map((f: any, i: number) => (
                                                <span key={i} className="px-2 py-0.5 rounded-[6px] bg-white border border-orange-200 text-[11px] text-orange-700">{f.type} · {f.severity}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Full live-interview explainability (standalone component, same as profile) */}
                                {isLive && active.session_id && (
                                    <div className="border-t border-gray-100 pt-4">
                                        <LiveInterviewResults sessionId={String(active.session_id)} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Proceed footer */}
            {stageClosed && (
                <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-[14px] border border-gray-200 bg-white px-5 py-3 shadow-lg">
                    <span className="text-[13px] text-gray-600">{checked.size} candidate(s) selected</span>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={checked.size === 0 || proceedPending}
                            onClick={() => onProceed(stageKey, [...checked], 'hold')}
                            className="rounded-[8px] border border-gray-200 px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >Hold</button>
                        <button
                            disabled={checked.size === 0 || proceedPending}
                            onClick={() => onProceed(stageKey, [...checked], 'reject')}
                            className="rounded-[8px] border border-red-200 px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >Reject</button>
                        <button
                            disabled={checked.size === 0 || proceedPending}
                            onClick={() => onProceed(stageKey, [...checked], 'progress')}
                            className="flex items-center gap-2 rounded-[8px] bg-[#6366f1] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#5558e3] disabled:bg-gray-300 shadow-sm"
                        >
                            {proceedPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                            Proceed {checked.size} → next stage
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
