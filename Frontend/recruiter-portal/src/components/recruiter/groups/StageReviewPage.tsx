import { useState, useMemo } from 'react';
import {
    ChevronLeft, Search, Filter, Users, Award, CheckCircle, XCircle,
    AlertCircle, TrendingUp, TrendingDown, BarChart3, Target, Flag,
    ArrowRight, Ban, Clock, Archive, MessageSquare, Shield, AlertTriangle,
    ChevronDown, X, Sparkles, SlidersHorizontal, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ───────────────────────────────────────────────────────────

interface CandidateData {
    id: number;
    name: string;
    avatar: string;
    assessmentScore: number;
    aiInterviewScore: number;
    liveInterviewScore?: number;
    flags: string[];
    meetsCriteria?: boolean;
    technicalVerdict?: 'strong_pass' | 'pass' | 'fail' | 'conditional' | 'borderline';
    progressionState?: 'selected' | 'rejected' | 'on-hold' | 'archived' | 'active';
    overrideApplied?: boolean;
    email?: string;
    phone?: string;
    assessment: string;
    aiInterview: string;
    liveInterview: string;
    // Semantic enrichment fields
    topSkills?: string[];
    weakAreas?: string[];
    interviewHighlights?: string[];
}

interface StageReviewPageProps {
    stageName: string;
    stageId: string;
    candidates: CandidateData[];
    pipelineSteps: { id: string; name: string }[];
    currentStageIndex: number;
    isLastStage: boolean;
    startDate: Date;
    endDate: Date;
    acceptanceCriteria: {
        minimumTechnicalScore: number;
        allowedIntegrityRisk: string;
        requiredVerdict: string;
    };
    onBack: () => void;
    onProgressCandidates: (selectedIds: number[], action: 'progress' | 'reject' | 'hold') => void;
    onFinalDecision: () => void;
    onViewCandidate: (candidateId: number) => void;
}

// ─── Sort options ────────────────────────────────────────────────────

type SortField = 'score-desc' | 'score-asc' | 'name-asc' | 'name-desc' | 'flags-desc';

// ─── Component ───────────────────────────────────────────────────────

export function StageReviewPage({
    stageName,
    stageId,
    candidates,
    pipelineSteps,
    currentStageIndex,
    isLastStage,
    startDate,
    endDate,
    acceptanceCriteria,
    onBack,
    onProgressCandidates,
    onFinalDecision,
    onViewCandidate
}: StageReviewPageProps) {
    // ─── Selection state ─────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [action, setAction] = useState<'progress' | 'reject'>('progress');

    // ─── Filter state ────────────────────────────────────────────────
    const [showFilters, setShowFilters] = useState(true);
    const [keywordSearch, setKeywordSearch] = useState('');
    const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
    const [flagsFilter, setFlagsFilter] = useState<'all' | 'none' | 'has-flags'>('all');
    const [meetsCriteriaFilter, setMeetsCriteriaFilter] = useState<'all' | 'yes' | 'no'>('all');
    const [verdictFilter, setVerdictFilter] = useState<'all' | 'strong_pass' | 'pass' | 'fail' | 'conditional' | 'borderline'>('all');
    const [progressionFilter, setProgressionFilter] = useState<'all' | 'active' | 'selected' | 'rejected' | 'on-hold'>('all');
    const [sortBy, setSortBy] = useState<SortField>('score-desc');

    // ─── Collapsible sections ────────────────────────────────────────
    const [showTopPerformers, setShowTopPerformers] = useState(true);
    const [showScoreDistribution, setShowScoreDistribution] = useState(true);
    const [showConcerns, setShowConcerns] = useState(true);

    // ─── Helpers ─────────────────────────────────────────────────────

    const getScore = (c: CandidateData) =>
        stageId === 'assessment' ? c.assessmentScore
            : stageId === 'ai-interview' ? c.aiInterviewScore
                : stageId === 'live-interview' ? (c.liveInterviewScore || 0)
                    : Math.max(c.assessmentScore, c.aiInterviewScore || 0, c.liveInterviewScore || 0);

    // ─── Calculated stats ────────────────────────────────────────────

    const completedCandidates = candidates.filter(c => {
        if (stageId === 'assessment') return c.assessment === 'completed';
        if (stageId === 'ai-interview') return c.aiInterview === 'completed';
        return false;
    });

    const averageScore = completedCandidates.length > 0
        ? completedCandidates.reduce((sum, c) => sum + getScore(c), 0) / completedCandidates.length
        : 0;

    const meetsCriteriaCount = candidates.filter(c => c.meetsCriteria).length;
    const flaggedCount = candidates.filter(c => c.flags.length > 0).length;
    const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    const topPerformers = [...completedCandidates]
        .sort((a, b) => getScore(b) - getScore(a))
        .slice(0, 5);

    // ─── Filtered + sorted candidates ────────────────────────────────

    const filteredCandidates = useMemo(() => {
        let result = [...candidates];

        // Keyword search
        if (keywordSearch.trim()) {
            const kw = keywordSearch.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(kw) ||
                c.flags.some(f => f.toLowerCase().includes(kw)) ||
                (c.topSkills || []).some(s => s.toLowerCase().includes(kw)) ||
                (c.weakAreas || []).some(s => s.toLowerCase().includes(kw)) ||
                (c.email || '').toLowerCase().includes(kw)
            );
        }

        // Score range
        result = result.filter(c => {
            const score = getScore(c);
            return score >= scoreRange[0] && score <= scoreRange[1];
        });

        // Flags filter
        if (flagsFilter === 'none') result = result.filter(c => c.flags.length === 0);
        if (flagsFilter === 'has-flags') result = result.filter(c => c.flags.length > 0);

        // Meets criteria
        if (meetsCriteriaFilter === 'yes') result = result.filter(c => c.meetsCriteria);
        if (meetsCriteriaFilter === 'no') result = result.filter(c => !c.meetsCriteria);

        // Verdict
        if (verdictFilter !== 'all') result = result.filter(c => c.technicalVerdict === verdictFilter);

        // Progression state
        if (progressionFilter !== 'all') result = result.filter(c => (c.progressionState || 'active') === progressionFilter);

        // Sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'score-desc': return getScore(b) - getScore(a);
                case 'score-asc': return getScore(a) - getScore(b);
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                case 'flags-desc': return b.flags.length - a.flags.length;
                default: return 0;
            }
        });

        return result;
    }, [candidates, keywordSearch, scoreRange, flagsFilter, meetsCriteriaFilter, verdictFilter, progressionFilter, sortBy]);

    // ─── Smart selection helpers ─────────────────────────────────────

    const smartSelect = (ids: number[]) => setSelectedIds(ids);

    const selectNoFlags = () => smartSelect(filteredCandidates.filter(c => c.flags.length === 0).map(c => c.id));
    const selectMeetsCriteria = () => smartSelect(filteredCandidates.filter(c => c.meetsCriteria).map(c => c.id));
    const selectTopN = (n: number) => smartSelect(
        [...filteredCandidates].sort((a, b) => getScore(b) - getScore(a)).slice(0, n).map(c => c.id)
    );
    const selectScoreRange = (min: number, max: number) => smartSelect(
        filteredCandidates.filter(c => { const s = getScore(c); return s >= min && s <= max; }).map(c => c.id)
    );
    const selectAll = () => smartSelect(filteredCandidates.map(c => c.id));
    const selectNone = () => smartSelect([]);

    const toggleCandidate = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // ─── Score distribution buckets ──────────────────────────────────

    const scoreBuckets = [
        { range: '90-100%', min: 90, max: 100, color: '#10b981' },
        { range: '80-89%', min: 80, max: 89, color: '#6366f1' },
        { range: '70-79%', min: 70, max: 79, color: '#8b5cf6' },
        { range: '60-69%', min: 60, max: 69, color: '#f59e0b' },
        { range: 'Below 60%', min: 0, max: 59, color: '#ef4444' }
    ];

    const nextStageName = currentStageIndex < pipelineSteps.length - 1
        ? pipelineSteps[currentStageIndex + 1].name
        : 'Review & Offer';

    // ─── Render ──────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col">
            {/* ═══ HEADER ═══ */}
            <div className="bg-white border-b border-[#e5e7eb] px-8 py-5">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 mb-3 font-['Arimo',sans-serif] text-[14px] text-[#6366f1] hover:underline"
                >
                    <ChevronLeft size={16} />
                    Back to Group Overview
                </button>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <BarChart3 size={24} className="text-[#6366f1]" />
                            <h1 className="text-[22px] font-bold text-[#111827]">{stageName} — Review & Filter Results</h1>
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-[6px] text-[13px] font-medium">
                                Stage Closed
                            </span>
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            Review performance stats, filter candidates, then select who progresses to {nextStageName}
                        </p>
                    </div>
                </div>

                {/* Timeline mini */}
                <div className="mt-4 flex items-center gap-4 text-[13px] text-[#6b7280]">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                            <CheckCircle size={14} className="text-emerald-600" />
                        </div>
                        <span>Started {startDate.toLocaleDateString()}</span>
                    </div>
                    <div className="w-16 h-[2px] bg-gradient-to-r from-emerald-300 to-blue-300" />
                    <span className="px-3 py-1 bg-blue-50 rounded-[6px] text-blue-700 font-medium">
                        {duration} day{duration !== 1 ? 's' : ''}
                    </span>
                    <div className="w-16 h-[2px] bg-gradient-to-r from-blue-300 to-purple-300" />
                    <div className="flex items-center gap-2">
                        <span>Closed {endDate.toLocaleDateString()}</span>
                        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                            <Target size={14} className="text-purple-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ CONTENT ═══ */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto px-8 py-6 space-y-6">

                    {/* ─── KPI Cards ─── */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-[16px] border border-blue-200">
                            <div className="flex items-center justify-between mb-2">
                                <Users size={22} className="text-blue-600" />
                                <TrendingUp size={18} className="text-blue-400" />
                            </div>
                            <div className="text-[28px] font-bold text-blue-900">{completedCandidates.length}</div>
                            <div className="text-[13px] text-blue-700">Completed</div>
                            <div className="text-[11px] text-blue-500 mt-1">out of {candidates.length} total</div>
                        </div>

                        <div className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[16px] border border-emerald-200">
                            <div className="flex items-center justify-between mb-2">
                                <Award size={22} className="text-emerald-600" />
                                <TrendingUp size={18} className="text-emerald-400" />
                            </div>
                            <div className="text-[28px] font-bold text-emerald-900">{averageScore.toFixed(1)}%</div>
                            <div className="text-[13px] text-emerald-700">Average Score</div>
                            <div className="text-[11px] text-emerald-500 mt-1">across all candidates</div>
                        </div>

                        <div className="p-5 bg-gradient-to-br from-purple-50 to-purple-100 rounded-[16px] border border-purple-200">
                            <div className="flex items-center justify-between mb-2">
                                <CheckCircle size={22} className="text-purple-600" />
                                <Target size={18} className="text-purple-400" />
                            </div>
                            <div className="text-[28px] font-bold text-purple-900">{meetsCriteriaCount}</div>
                            <div className="text-[13px] text-purple-700">Meets Criteria</div>
                            <div className="text-[11px] text-purple-500 mt-1">
                                {candidates.length > 0 ? ((meetsCriteriaCount / candidates.length) * 100).toFixed(0) : 0}% pass rate
                            </div>
                        </div>

                        <div className="p-5 bg-gradient-to-br from-red-50 to-red-100 rounded-[16px] border border-red-200">
                            <div className="flex items-center justify-between mb-2">
                                <AlertCircle size={22} className="text-red-600" />
                                <TrendingDown size={18} className="text-red-400" />
                            </div>
                            <div className="text-[28px] font-bold text-red-900">{flaggedCount}</div>
                            <div className="text-[13px] text-red-700">Flagged</div>
                            <div className="text-[11px] text-red-500 mt-1">integrity concerns</div>
                        </div>
                    </div>

                    {/* ─── Top Performers (collapsible) ─── */}
                    <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden">
                        <button
                            onClick={() => setShowTopPerformers(!showTopPerformers)}
                            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#f9fafb] transition-colors"
                        >
                            <h3 className="text-[15px] font-semibold text-[#111827] flex items-center gap-2">
                                <Award size={18} className="text-[#f59e0b]" />
                                Top 5 Performers
                            </h3>
                            <ChevronDown size={18} className={`text-[#6b7280] transition-transform ${showTopPerformers ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                            {showTopPerformers && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-6 pb-5 space-y-2">
                                        {topPerformers.map((candidate, index) => {
                                            const score = getScore(candidate);
                                            return (
                                                <div
                                                    key={candidate.id}
                                                    className="flex items-center gap-4 p-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-[10px]"
                                                >
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] ${index === 0 ? 'bg-yellow-400 text-yellow-900' :
                                                            index === 1 ? 'bg-gray-300 text-gray-700' :
                                                                index === 2 ? 'bg-orange-300 text-orange-800' :
                                                                    'bg-amber-200 text-amber-700'
                                                        }`}>
                                                        #{index + 1}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-[13px] text-[#111827]">{candidate.name}</div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {candidate.meetsCriteria && (
                                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full">✓ Meets Criteria</span>
                                                            )}
                                                            {candidate.technicalVerdict === 'pass' && (
                                                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full">Pass</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[22px] font-bold text-[#111827]">{score}%</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {topPerformers.length === 0 && (
                                            <p className="text-center text-[13px] text-[#6b7280] py-4">No completed candidates yet</p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ─── Score Distribution (collapsible) ─── */}
                    <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden">
                        <button
                            onClick={() => setShowScoreDistribution(!showScoreDistribution)}
                            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#f9fafb] transition-colors"
                        >
                            <h3 className="text-[15px] font-semibold text-[#111827] flex items-center gap-2">
                                <BarChart3 size={18} className="text-[#6366f1]" />
                                Score Distribution
                            </h3>
                            <ChevronDown size={18} className={`text-[#6b7280] transition-transform ${showScoreDistribution ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                            {showScoreDistribution && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-6 pb-5 space-y-3">
                                        {scoreBuckets.map(bucket => {
                                            const count = completedCandidates.filter(c => {
                                                const s = getScore(c);
                                                return s >= bucket.min && s <= bucket.max;
                                            }).length;
                                            const pct = completedCandidates.length > 0 ? (count / completedCandidates.length) * 100 : 0;
                                            return (
                                                <div key={bucket.range}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[13px] text-[#374151] font-medium">{bucket.range}</span>
                                                        <span className="text-[12px] text-[#6b7280]">{count} ({pct.toFixed(0)}%)</span>
                                                    </div>
                                                    <div className="h-[8px] bg-gray-200 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all"
                                                            style={{ width: `${pct}%`, backgroundColor: bucket.color }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ─── Flagged Concerns (collapsible) ─── */}
                    {flaggedCount > 0 && (
                        <div className="bg-white rounded-[16px] border border-red-200 overflow-hidden">
                            <button
                                onClick={() => setShowConcerns(!showConcerns)}
                                className="w-full flex items-center justify-between px-6 py-4 hover:bg-red-50/50 transition-colors"
                            >
                                <h3 className="text-[15px] font-semibold text-[#111827] flex items-center gap-2">
                                    <AlertCircle size={18} className="text-red-600" />
                                    Candidates Requiring Attention ({flaggedCount})
                                </h3>
                                <ChevronDown size={18} className={`text-[#6b7280] transition-transform ${showConcerns ? 'rotate-180' : ''}`} />
                            </button>
                            <AnimatePresence>
                                {showConcerns && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-6 pb-5 space-y-2">
                                            {candidates.filter(c => c.flags.length > 0).map(candidate => (
                                                <div
                                                    key={candidate.id}
                                                    className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-[10px]"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                                                            <span className="font-semibold text-[12px] text-red-700">{candidate.avatar}</span>
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-[13px] text-[#111827]">{candidate.name}</div>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                {candidate.flags.map((flag, idx) => (
                                                                    <span key={idx} className="px-2 py-0.5 bg-red-200 text-red-800 text-[10px] rounded-full">{flag}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[18px] font-bold text-red-700">{getScore(candidate)}%</div>
                                                        <div className="text-[10px] text-red-500">Needs Review</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* ═══ CANDIDATE REVIEW TABLE ═══ */}
                    <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden">
                        {/* Table Header */}
                        <div className="px-6 py-4 border-b border-[#e5e7eb]">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-[16px] font-bold text-[#111827] flex items-center gap-2">
                                    <Users size={20} className="text-[#6366f1]" />
                                    Candidate Selection
                                    <span className="text-[13px] font-normal text-[#6b7280]">
                                        — {filteredCandidates.length} of {candidates.length} shown
                                    </span>
                                </h2>
                                <div className="flex items-center gap-2">
                                    {selectedIds.length > 0 && (
                                        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-[13px] rounded-[6px] font-medium">
                                            {selectedIds.length} selected
                                        </span>
                                    )}
                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={`flex items-center gap-2 h-[36px] px-[14px] rounded-[8px] border transition-colors ${showFilters
                                                ? 'bg-[#f5f3ff] border-[#6366f1] text-[#6366f1]'
                                                : 'bg-white hover:bg-[#f9fafb] border-[#e5e7eb] text-[#111827]'
                                            }`}
                                    >
                                        <SlidersHorizontal size={15} />
                                        <span className="text-[13px]">Filters</span>
                                        <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Smart Selection Presets */}
                            <div className="flex items-center gap-2 flex-wrap mb-3">
                                <span className="text-[12px] text-[#6b7280] font-medium flex items-center gap-1">
                                    <Sparkles size={13} /> Smart Selection:
                                </span>
                                <button onClick={selectNoFlags} className="px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[12px] hover:bg-emerald-100 transition-colors">
                                    No Flags ({candidates.filter(c => c.flags.length === 0).length})
                                </button>
                                <button onClick={selectMeetsCriteria} className="px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-[12px] hover:bg-blue-100 transition-colors">
                                    Meets Criteria ({meetsCriteriaCount})
                                </button>
                                <button onClick={() => selectTopN(5)} className="px-3 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-[12px] hover:bg-purple-100 transition-colors">
                                    ✨ Top 5
                                </button>
                                <button onClick={() => selectTopN(10)} className="px-3 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-[12px] hover:bg-purple-100 transition-colors">
                                    ✨ Top 10
                                </button>
                                <button onClick={() => selectScoreRange(80, 100)} className="px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[12px] hover:bg-amber-100 transition-colors">
                                    Score 80-100 ({candidates.filter(c => { const s = getScore(c); return s >= 80 && s <= 100; }).length})
                                </button>
                                <button onClick={() => selectScoreRange(70, 79)} className="px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 text-[12px] hover:bg-gray-100 transition-colors">
                                    Score 70-79 ({candidates.filter(c => { const s = getScore(c); return s >= 70 && s <= 79; }).length})
                                </button>
                            </div>

                            {/* Filter Panel */}
                            <AnimatePresence>
                                {showFilters && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 bg-[#f9fafb] rounded-[12px] border border-[#e5e7eb] space-y-4">
                                            {/* Row 1: Search + Sort */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[12px] text-[#6b7280] mb-1.5 font-medium">Search (name, skills, flags...)</label>
                                                    <div className="relative">
                                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                                                        <input
                                                            type="text"
                                                            value={keywordSearch}
                                                            onChange={(e) => setKeywordSearch(e.target.value)}
                                                            placeholder="Search candidates..."
                                                            className="w-full h-[36px] pl-9 pr-3 rounded-[8px] border border-[#e5e7eb] bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                                                        />
                                                        {keywordSearch && (
                                                            <button onClick={() => setKeywordSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                                                <X size={14} className="text-[#9ca3af]" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[12px] text-[#6b7280] mb-1.5 font-medium">Sort By</label>
                                                    <select
                                                        value={sortBy}
                                                        onChange={(e) => setSortBy(e.target.value as SortField)}
                                                        className="w-full h-[36px] px-3 rounded-[8px] border border-[#e5e7eb] bg-white text-[13px]"
                                                    >
                                                        <option value="score-desc">Score (High → Low)</option>
                                                        <option value="score-asc">Score (Low → High)</option>
                                                        <option value="name-asc">Name (A → Z)</option>
                                                        <option value="name-desc">Name (Z → A)</option>
                                                        <option value="flags-desc">Most Flags First</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Row 2: Score Range */}
                                            <div>
                                                <label className="block text-[12px] text-[#6b7280] mb-1.5 font-medium">
                                                    Score Range: {scoreRange[0]}% — {scoreRange[1]}%
                                                </label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={100}
                                                        value={scoreRange[0]}
                                                        onChange={(e) => setScoreRange([Math.min(parseInt(e.target.value), scoreRange[1]), scoreRange[1]])}
                                                        className="flex-1"
                                                    />
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={100}
                                                        value={scoreRange[1]}
                                                        onChange={(e) => setScoreRange([scoreRange[0], Math.max(parseInt(e.target.value), scoreRange[0])])}
                                                        className="flex-1"
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 3: Dropdowns */}
                                            <div className="grid grid-cols-4 gap-4">
                                                <div>
                                                    <label className="block text-[12px] text-[#6b7280] mb-1.5 font-medium">Flags</label>
                                                    <select
                                                        value={flagsFilter}
                                                        onChange={(e) => setFlagsFilter(e.target.value as any)}
                                                        className="w-full h-[36px] px-2 rounded-[8px] border border-[#e5e7eb] bg-white text-[13px]"
                                                    >
                                                        <option value="all">All</option>
                                                        <option value="none">No Flags</option>
                                                        <option value="has-flags">Has Flags</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[12px] text-[#6b7280] mb-1.5 font-medium">Meets Criteria</label>
                                                    <select
                                                        value={meetsCriteriaFilter}
                                                        onChange={(e) => setMeetsCriteriaFilter(e.target.value as any)}
                                                        className="w-full h-[36px] px-2 rounded-[8px] border border-[#e5e7eb] bg-white text-[13px]"
                                                    >
                                                        <option value="all">All</option>
                                                        <option value="yes">Yes</option>
                                                        <option value="no">No</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[12px] text-[#6b7280] mb-1.5 font-medium">Verdict</label>
                                                    <select
                                                        value={verdictFilter}
                                                        onChange={(e) => setVerdictFilter(e.target.value as any)}
                                                        className="w-full h-[36px] px-2 rounded-[8px] border border-[#e5e7eb] bg-white text-[13px]"
                                                    >
                                                        <option value="all">All</option>
                                                        <option value="strong_pass">Strong Pass</option>
                                                        <option value="pass">Pass</option>
                                                        <option value="borderline">Borderline</option>
                                                        <option value="conditional">Conditional</option>
                                                        <option value="fail">Fail</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[12px] text-[#6b7280] mb-1.5 font-medium">Status</label>
                                                    <select
                                                        value={progressionFilter}
                                                        onChange={(e) => setProgressionFilter(e.target.value as any)}
                                                        className="w-full h-[36px] px-2 rounded-[8px] border border-[#e5e7eb] bg-white text-[13px]"
                                                    >
                                                        <option value="all">All</option>
                                                        <option value="active">Active</option>
                                                        <option value="selected">Selected</option>
                                                        <option value="rejected">Rejected</option>
                                                        <option value="on-hold">On Hold</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Clear filters */}
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        setKeywordSearch('');
                                                        setScoreRange([0, 100]);
                                                        setFlagsFilter('all');
                                                        setMeetsCriteriaFilter('all');
                                                        setVerdictFilter('all');
                                                        setProgressionFilter('all');
                                                        setSortBy('score-desc');
                                                    }}
                                                    className="text-[12px] text-[#6366f1] hover:underline"
                                                >
                                                    Reset all filters
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                    <tr>
                                        <th className="p-4 text-left w-12">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.length === filteredCandidates.length && filteredCandidates.length > 0}
                                                onChange={() => selectedIds.length === filteredCandidates.length ? selectNone() : selectAll()}
                                                className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                                            />
                                        </th>
                                        <th className="p-4 text-left">
                                            <span className="text-[12px] text-[#6b7280] font-semibold">Candidate</span>
                                        </th>
                                        <th className="p-4 text-center">
                                            <span className="text-[12px] text-[#6b7280] font-semibold">Score</span>
                                        </th>
                                        <th className="p-4 text-center">
                                            <span className="text-[12px] text-[#6b7280] font-semibold">Criteria</span>
                                        </th>
                                        <th className="p-4 text-center">
                                            <span className="text-[12px] text-[#6b7280] font-semibold">Verdict</span>
                                        </th>
                                        <th className="p-4 text-center">
                                            <span className="text-[12px] text-[#6b7280] font-semibold">Flags</span>
                                        </th>
                                        <th className="p-4 text-center">
                                            <span className="text-[12px] text-[#6b7280] font-semibold">Status</span>
                                        </th>
                                        <th className="p-4 text-center">
                                            <span className="text-[12px] text-[#6b7280] font-semibold">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCandidates.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-12 text-center">
                                                <div className="flex flex-col items-center text-[#6b7280]">
                                                    <Filter size={36} className="mb-3 opacity-30" />
                                                    <p className="text-[14px] font-medium">No candidates match your current filters</p>
                                                    <p className="text-[12px] mt-1">Try adjusting your filter criteria</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredCandidates.map(candidate => {
                                        const score = getScore(candidate);
                                        const isSelected = selectedIds.includes(candidate.id);
                                        return (
                                            <tr
                                                key={candidate.id}
                                                className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors ${isSelected ? 'bg-purple-50/50' : ''}`}
                                            >
                                                <td className="p-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleCandidate(candidate.id)}
                                                        className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-[38px] h-[38px] rounded-full bg-[#ede9fe] flex items-center justify-center flex-shrink-0">
                                                            <span className="font-semibold text-[13px] text-[#6366f1]">{candidate.avatar}</span>
                                                        </div>
                                                        <div>
                                                            <button
                                                                onClick={() => onViewCandidate(candidate.id)}
                                                                className="text-[13px] text-[#111827] font-medium hover:text-[#6366f1] hover:underline"
                                                            >
                                                                {candidate.name}
                                                            </button>
                                                            {candidate.overrideApplied && (
                                                                <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded-full inline-flex items-center gap-0.5">
                                                                    <AlertTriangle size={9} /> Override
                                                                </span>
                                                            )}
                                                            {/* Semantic tags */}
                                                            {candidate.topSkills && candidate.topSkills.length > 0 && (
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    {candidate.topSkills.slice(0, 3).map((skill, i) => (
                                                                        <span key={i} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] rounded">{skill}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className={`text-[16px] font-bold ${score >= 80 ? 'text-emerald-600' :
                                                            score >= 60 ? 'text-amber-600' :
                                                                'text-red-600'
                                                        }`}>
                                                        {score}%
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {candidate.meetsCriteria ? (
                                                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[11px] rounded-full font-medium">
                                                            ✓ Meets
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 bg-red-100 text-red-600 text-[11px] rounded-full font-medium">
                                                            ✗ Below
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {candidate.technicalVerdict ? (
                                                        <span className={`px-2.5 py-1 text-[11px] rounded-full font-medium ${
                                                            candidate.technicalVerdict === 'strong_pass' ? 'bg-emerald-200 text-emerald-800' :
                                                            candidate.technicalVerdict === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                                                                candidate.technicalVerdict === 'borderline' ? 'bg-orange-100 text-orange-700' :
                                                                candidate.technicalVerdict === 'conditional' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-red-100 text-red-700'
                                                            }`}>
                                                            {candidate.technicalVerdict.replace('_', ' ')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-[#9ca3af]">—</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {candidate.flags.length > 0 ? (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Flag size={13} className="text-red-500" />
                                                            <span className="text-[12px] text-red-600 font-medium">{candidate.flags.length}</span>
                                                        </div>
                                                    ) : (
                                                        <CheckCircle size={15} className="text-emerald-400 mx-auto" />
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {candidate.progressionState && candidate.progressionState !== 'active' ? (
                                                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${candidate.progressionState === 'selected' ? 'bg-blue-100 text-blue-700' :
                                                                candidate.progressionState === 'rejected' ? 'bg-red-100 text-red-700' :
                                                                    candidate.progressionState === 'on-hold' ? 'bg-yellow-100 text-yellow-700' :
                                                                        'bg-gray-100 text-gray-700'
                                                            }`}>
                                                            {candidate.progressionState.replace('-', ' ')}
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">Active</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => onViewCandidate(candidate.id)}
                                                        className="p-2 rounded-[6px] border border-[#e5e7eb] hover:bg-[#f5f3ff] transition-colors"
                                                        title="View Profile"
                                                    >
                                                        <Eye size={14} className="text-[#6b7280]" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ FOOTER ACTION BAR ═══ */}
            <div className="bg-white border-t border-[#e5e7eb] px-8 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-[#f5f3ff] rounded-[8px]">
                            <BarChart3 size={20} className="text-[#6366f1]" />
                        </div>
                        <div>
                            <div className="text-[13px] font-semibold text-[#111827]">
                                {selectedIds.length > 0
                                    ? `${selectedIds.length} candidate${selectedIds.length !== 1 ? 's' : ''} selected`
                                    : 'Select candidates to proceed'}
                            </div>
                            <div className="text-[12px] text-[#6b7280]">
                                {isLastStage
                                    ? 'Move to Final Decision & Offers'
                                    : `Progress to ${nextStageName}`
                                }
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {selectedIds.length > 0 && (
                            <>
                                <button
                                    onClick={() => onProgressCandidates(selectedIds, 'reject')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] border border-red-300 text-red-600 hover:bg-red-50 transition-colors text-[13px] font-medium"
                                >
                                    <Ban size={15} />
                                    Reject ({selectedIds.length})
                                </button>
                                <button
                                    onClick={() => onProgressCandidates(selectedIds, 'hold')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] border border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors text-[13px] font-medium"
                                >
                                    <Clock size={15} />
                                    Hold
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => {
                                if (selectedIds.length === 0) return;
                                if (isLastStage) {
                                    onProgressCandidates(selectedIds, 'progress');
                                    onFinalDecision();
                                } else {
                                    onProgressCandidates(selectedIds, 'progress');
                                }
                            }}
                            disabled={selectedIds.length === 0}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] text-white text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                        >
                            {isLastStage ? (
                                <>
                                    <CheckCircle size={16} />
                                    Move {selectedIds.length} to Final Decision
                                </>
                            ) : (
                                <>
                                    <ArrowRight size={16} />
                                    Progress {selectedIds.length} to {nextStageName}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
