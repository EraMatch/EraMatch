/**
 * LiveInterviewResults.tsx — Recruiter view of Phase 4 Judge evaluation.
 *
 * Shows:
 * - Overall score + verdict badge
 * - Per-dimension breakdown with cited quotes, anchor matched, and confidence
 * - Full transcript accordion
 * - Auto-tags (strong_on, weak_on)
 *
 * Data flow:
 *   Recruiter clicks candidate → fetches GET /api/v1/live-interview-v2/session/{id}
 *   If evaluation is null → judge is still running → show "Evaluating..." state
 *   Poll every 5s while state === "completed" but evaluation === null
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle, Clock, Award, TrendingUp, MessageSquare, RefreshCw, MinusCircle } from 'lucide-react';
import { fetchAPI } from '../../../services/client';

interface Anchor {
    substandard: string;
    proficient: string;
    excellent: string;
}

interface DimensionScore {
    score: 1 | 2 | 3;
    anchor_matched: 'substandard' | 'proficient' | 'excellent';
    cited_quote: string;
    reasoning: string;
    weight: number;
    dimension_name: string;
}

interface PerQuestionSubCriterion {
    name: string;
    score: 1 | 2 | 3;
    covered: boolean;
    cited_quote: string;
}

interface PerQuestionResult {
    question_text: string;
    question_score: number;
    dimension_id: string;
    dimension_name: string;
    sub_criteria: PerQuestionSubCriterion[];
    reasoning: string;
    anchor_matched: 'substandard' | 'proficient' | 'excellent';
    cited_quote: string;
    weight: number;
}

interface Evaluation {
    evaluation_id: string;
    overall_score: number;
    overall_score_pct: number;
    auto_verdict: 'strong_pass' | 'pass' | 'borderline' | 'fail';
    meets_criteria: boolean;
    coverage_ratio: number;
    dimension_scores: Record<string, DimensionScore>;
    per_question_results?: Record<string, PerQuestionResult>;
    auto_tags: Record<string, string[]>;
    integrity_flags?: {
        validation_warnings?: Array<{ type: string; dimension_id?: string; pillar_idx?: number }>;
        flagged_turns?: Array<{ flags?: string[]; phase?: string; pillar_idx?: number }>;
        short_transcript?: boolean;
        empty_transcript?: boolean;
        control_events?: number;
    };
    evaluation_confidence: 'high' | 'medium' | 'low';
    judged_at: string;
}

interface TranscriptTurn {
    role: 'ai' | 'agent' | 'candidate';
    text: string;
    pillar_idx?: number;
}

interface SessionData {
    session_id: string;
    state: string;
    started_at: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
    transcript: TranscriptTurn[];
    evaluation: Evaluation | null;
    context_pool?: Record<string, any>;
}

interface LiveInterviewResultsProps {
    sessionId: string;
    onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VERDICT_CONFIG = {
    strong_pass: { label: 'Strong Pass', color: 'bg-emerald-500', icon: CheckCircle, text: 'text-emerald-700' },
    pass:         { label: 'Pass',        color: 'bg-blue-500',    icon: CheckCircle, text: 'text-blue-700'    },
    borderline:   { label: 'Borderline',  color: 'bg-amber-500',   icon: AlertCircle, text: 'text-amber-700'  },
    fail:         { label: 'Fail',        color: 'bg-red-500',     icon: XCircle,     text: 'text-red-700'    },
};

const ANCHOR_COLOR: Record<string, string> = {
    excellent:   'bg-emerald-100 text-emerald-800 border-emerald-200',
    proficient:  'bg-blue-100    text-blue-800    border-blue-200',
    substandard: 'bg-red-100     text-red-800     border-red-200',
};

const CONFIDENCE_COLOR: Record<string, string> = {
    high:   'text-emerald-600',
    medium: 'text-amber-600',
    low:    'text-red-600',
};

function formatDuration(seconds: number | null) {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------
function ScoreRing({ pct, size = 120 }: { pct: number; size?: number }) {
    const r = (size - 16) / 2;
    const circumference = 2 * Math.PI * r;
    const dash = (pct / 100) * circumference;
    const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444';

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
                <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke={color} strokeWidth={8}
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                />
            </svg>
            <span className="absolute text-2xl font-bold text-gray-800">{pct}%</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Dimension card
// ---------------------------------------------------------------------------
function DimensionCard({ dimId, result }: { dimId: string; result: DimensionScore }) {
    const [expanded, setExpanded] = useState(false);
    const anchorClass = ANCHOR_COLOR[result.anchor_matched] || '';
    const scoreLabel = ['', 'Substandard', 'Proficient', 'Excellent'][result.score];

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            const next = (e.currentTarget.parentElement?.parentElement?.nextElementSibling?.querySelector('button') as HTMLElement);
            if (next) next.focus();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = (e.currentTarget.parentElement?.parentElement?.previousElementSibling?.querySelector('button') as HTMLElement);
            if (prev) prev.focus();
        }
    };

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden h-full flex flex-col">
            <button
                aria-expanded={expanded}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                onClick={() => setExpanded(v => !v)}
                onKeyDown={handleKeyDown}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-700 text-sm font-bold">
                        {result.score}
                    </div>
                    <div className="text-left">
                        <p className="font-medium text-gray-800 text-sm">{result.dimension_name || dimId}</p>
                        <p className="text-xs text-gray-500">Weight: {Math.round(result.weight)}%</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${anchorClass}`}>
                        {result.score === 3 ? <CheckCircle className="w-3 h-3" /> : result.score === 2 ? <MinusCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {scoreLabel}
                    </span>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
            </button>

            {expanded && (
                <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50 space-y-4">
                    {result.cited_quote && (
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cited Quote</p>
                            <blockquote className="border-l-4 border-indigo-400 pl-3 text-sm md:text-base text-gray-700 italic">
                                "{result.cited_quote}"
                            </blockquote>
                        </div>
                    )}
                    {result.reasoning && (
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Reasoning</p>
                            <p className="text-sm md:text-base text-gray-700">{result.reasoning}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Per-Question Card
// ---------------------------------------------------------------------------
function PerQuestionCard({ result }: { result: PerQuestionResult }) {
    const [expanded, setExpanded] = useState(false);
    const anchorClass = ANCHOR_COLOR[result.anchor_matched] || '';
    const scoreLabel = result.question_score.toFixed(1);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
        }
    };

    return (
        <details 
            className="border border-gray-200 rounded-xl overflow-hidden bg-white group" 
            aria-expanded={expanded} 
            open={expanded}
            onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }}
        >
            <summary
                className="w-full flex flex-col md:flex-row items-start md:items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:outline-none list-none [&::-webkit-details-marker]:hidden gap-3"
                aria-label={`Question: ${result.question_text}. Score: ${scoreLabel} out of 3`}
                onKeyDown={handleKeyDown}
                tabIndex={0}
            >
                <div className="flex items-center gap-3 overflow-hidden w-full md:w-auto md:flex-1">
                    <div className="text-left truncate flex-1">
                        <p className="font-medium text-gray-800 text-sm md:text-base truncate" title={result.question_text}>
                            {result.question_text}
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-between w-full md:w-auto gap-3 shrink-0">
                    <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${anchorClass}`}>
                        {result.question_score >= 2.5 ? <CheckCircle className="w-3 h-3" /> : result.question_score >= 1.5 ? <MinusCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        Score: {scoreLabel} / 3.0
                    </span>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 group-open:block" /> : <ChevronDown className="w-4 h-4 text-gray-400 group-open:hidden" />}
                </div>
            </summary>

            <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50 space-y-4 pt-4">
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sub-Criteria</p>
                        <div role="list" aria-label="Sub-criteria" className="space-y-2">
                            {result.sub_criteria.map((sub, idx) => (
                                <div role="listitem" aria-label={`${sub.name}: ${sub.score} out of 3`} key={idx} className="flex items-start gap-2">
                                    {sub.score === 3 ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                    ) : sub.score === 2 ? (
                                        <MinusCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                    ) : (
                                        <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                                    )}
                                    <div>
                                        <p className="text-sm md:text-base text-gray-800 font-medium">{sub.name}</p>
                                        <p className="text-xs md:text-sm text-gray-600">Score: {sub.score}/3</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {result.cited_quote && (
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cited Quote</p>
                            <blockquote className="border-l-4 border-indigo-400 pl-3 text-sm md:text-base text-gray-700 italic">
                                "{result.cited_quote}"
                            </blockquote>
                        </div>
                    )}
                    
                    {result.reasoning && (
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Reasoning</p>
                            <p className="text-sm md:text-base text-gray-700">{result.reasoning}</p>
                        </div>
                    )}
                </div>
        </details>
    );
}

// ---------------------------------------------------------------------------
// Transcript accordion
// ---------------------------------------------------------------------------
function TranscriptAccordion({ turns }: { turns: TranscriptTurn[] }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                onClick={() => setOpen(v => !v)}
            >
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700 text-sm">Full Transcript ({turns.length} turns)</span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {open && (
                <div className="border-t border-gray-100 max-h-96 overflow-y-auto divide-y divide-gray-50">
                    {turns.map((t, i) => (
                        <div key={i} className={`px-5 py-3 ${t.role === 'ai' || t.role === 'agent' ? 'bg-indigo-50' : 'bg-white'}`}>
                            <span className={`text-xs font-bold uppercase tracking-wide ${t.role === 'ai' || t.role === 'agent' ? 'text-indigo-500' : 'text-gray-500'} mr-2`}>
                                {t.role === 'ai' || t.role === 'agent' ? 'Interviewer' : 'Candidate'}
                            </span>
                            <span className="text-sm md:text-base text-gray-700">{t.text}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function LiveInterviewResults({ sessionId, onClose }: LiveInterviewResultsProps) {
    const [data, setData] = useState<SessionData | null>(null);
    const [activeTab, setActiveTab] = useState<'evaluation' | 'transcript' | 'context'>('evaluation');

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [onClose]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const json = await fetchAPI<SessionData>(`/live-interview-v2/session/${sessionId}`);
            setData(json);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Failed to load results');
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Poll while completed but evaluation is not yet ready
    useEffect(() => {
        if (!data) return;
        if (data.state === 'completed' && !data.evaluation) {
            const timer = setTimeout(fetchData, 5000);
            return () => clearTimeout(timer);
        }
    }, [data, fetchData]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Loading interview results…</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-500">
                <AlertCircle className="w-10 h-10" />
                <p className="text-sm">{error || 'Results unavailable'}</p>
            </div>
        );
    }

    const ev = data.evaluation;
    const verdictCfg = ev ? VERDICT_CONFIG[ev.auto_verdict] : null;
    const VerdictIcon = verdictCfg?.icon;

    return (
        <div className="max-w-4xl mx-auto space-y-6 py-6 px-4">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-xl md:text-2xl font-semibold text-gray-800">Live Interview Results</h2>
                    <p className="text-gray-500 text-sm mt-1">
                        Duration: {formatDuration(data.duration_seconds)}
                        {data.ended_at && ` · ${new Date(data.ended_at).toLocaleDateString()}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchData}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                            Close
                        </button>
                    )}
                </div>
            </div>

            {/* Awaiting evaluation */}
            {data.state === 'completed' && !ev && (
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
                    <Clock className="w-5 h-5 animate-spin" />
                    <p className="text-sm">The AI Judge is analyzing the interview. This usually takes under a minute. Results will appear automatically.</p>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('evaluation')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'evaluation'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Evaluation
                    </button>
                    <button
                        onClick={() => setActiveTab('transcript')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'transcript'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Transcript ({data.transcript?.length || 0})
                    </button>
                    <button
                        onClick={() => setActiveTab('context')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'context'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Context Used
                    </button>
                </nav>
            </div>

            {/* Tab Panels */}
            <div className="pt-2">
                {activeTab === 'evaluation' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {ev ? (
                            <>
                                {/* Score + verdict */}
                                <div role="region" aria-label={`Interview evaluation for session`} className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col md:flex-row items-center md:items-start gap-8 shadow-sm">
                                    <div role="img" aria-label={`Score: ${ev.overall_score_pct} percent, ${ev.auto_verdict} verdict`} className="w-full md:w-auto flex justify-center">
                                    <ScoreRing pct={ev.overall_score_pct} />
                                    </div>
                                    <div className="space-y-3 flex-1 w-full text-center md:text-left">
                                        {verdictCfg && VerdictIcon && (
                                            <div className={`inline-flex items-center gap-2 text-white text-sm font-semibold px-4 py-1.5 rounded-full ${verdictCfg.color}`}>
                                                <VerdictIcon className="w-4 h-4" />
                                                {verdictCfg.label}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <p className="text-gray-400 text-xs">Meets Criteria</p>
                                                <p className={`font-semibold ${ev.meets_criteria ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {ev.meets_criteria ? 'Yes' : 'No'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-xs">Coverage</p>
                                                <p className="font-semibold text-gray-700">{Math.round(ev.coverage_ratio * 100)}% of dimensions</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-xs">Confidence</p>
                                                <p className={`font-semibold capitalize ${CONFIDENCE_COLOR[ev.evaluation_confidence]}`}>
                                                    {ev.evaluation_confidence}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-xs">Judged at</p>
                                                <p className="font-semibold text-gray-700 text-xs">{new Date(ev.judged_at).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {ev.integrity_flags && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                                        <p className="font-semibold mb-2">Validation & Control Trace</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                            <span>Control events: {ev.integrity_flags.control_events ?? 0}</span>
                                            <span>Flagged turns: {ev.integrity_flags.flagged_turns?.length ?? 0}</span>
                                            <span>Warnings: {ev.integrity_flags.validation_warnings?.length ?? 0}</span>
                                        </div>
                                        {(ev.integrity_flags.validation_warnings?.length || 0) > 0 && (
                                            <p className="mt-2 text-xs">
                                                Some cited quotes could not be verified exactly against the transcript. Review transcript before final decision.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Dimension breakdown */}
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4" />
                                        Dimension Breakdown
                                    </h3>
                                    <div role="list" aria-label="Dimension scores" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {Object.entries(ev.dimension_scores || {}).map(([dimId, result]) => (
                                            <div role="listitem" key={dimId} aria-label={`${result.dimension_name || dimId}: ${result.score} out of 3`}>
                                                <DimensionCard dimId={dimId} result={result} />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Per-Question Breakdown */}
                                {ev.per_question_results && Object.keys(ev.per_question_results).length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4" />
                                            Per-Question Breakdown
                                        </h3>
                                        <div className="space-y-2">
                                            {Object.entries(
                                                Object.entries(ev.per_question_results).reduce((acc, [, result]) => {
                                                    const dim = result.dimension_name || result.dimension_id || 'Other';
                                                    if (!acc[dim]) acc[dim] = [];
                                                    acc[dim].push(result);
                                                    return acc;
                                                }, {} as Record<string, PerQuestionResult[]>)
                                            ).map(([dimName, results]) => (
                                                <div key={dimName} className="space-y-2">
                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mt-4 mb-2">{dimName}</h4>
                                                    {results.map((result, idx) => (
                                                        <PerQuestionCard key={`${dimName}-${idx}`} result={result} />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Auto-tags */}
                                {ev.auto_tags && Object.keys(ev.auto_tags).length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                                            <Award className="w-4 h-4" />
                                            Tags
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(ev.auto_tags).flatMap(([tag, values]) =>
                                                (Array.isArray(values) ? values : [String(values)]).map(v => (
                                                    <span key={`${tag}-${v}`} className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full border border-gray-200">
                                                        {tag}: {v}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-10 text-gray-400">
                                No evaluation available right now.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'transcript' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {data.transcript && data.transcript.length > 0 ? (
                            <div className="bg-white border border-gray-200 rounded-xl max-h-[600px] overflow-y-auto divide-y divide-gray-50 shadow-sm">
                                {data.transcript.map((t, i) => (
                                    <div key={i} className={`px-5 py-4 ${t.role === 'ai' || t.role === 'agent' ? 'bg-indigo-50/50' : 'bg-white'}`}>
                                        <span className={`text-xs font-bold uppercase tracking-wide ${t.role === 'ai' || t.role === 'agent' ? 'text-indigo-600' : 'text-gray-500'} mr-2 block mb-1`}>
                                            {t.role === 'ai' || t.role === 'agent' ? 'Interviewer' : 'Candidate'}
                                        </span>
                                        <span className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{t.text}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-400">
                                No transcript recorded.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'context' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {data.context_pool && Object.keys(data.context_pool).length > 0 ? (
                            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-700">Context Provided to AI</h3>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {Object.entries(data.context_pool).map(([key, value]) => {
                                        if (value === null || (Array.isArray(value) && value.length === 0)) return null;
                                        
                                        let displayValue = value;
                                        if (Array.isArray(value)) {
                                            displayValue = value.join(', ');
                                        } else if (typeof value === 'object') {
                                            displayValue = JSON.stringify(value, null, 2);
                                        }

                                        return (
                                            <div key={key} className="p-5 flex flex-col md:flex-row gap-4">
                                                <div className="w-1/3">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                        {key.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                                <div className="w-2/3">
                                                    <span className="text-sm text-gray-800 break-words">
                                                        {displayValue}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-400">
                                No background context was injected into this interview.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
