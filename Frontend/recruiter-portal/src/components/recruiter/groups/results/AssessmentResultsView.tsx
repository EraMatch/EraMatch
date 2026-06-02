import { useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, Shield } from 'lucide-react';
import { useStageMonitoring } from '../../../../hooks/groups/useGroups';

const INTEGRITY_COLORS: Record<string, string> = {
    clean: 'bg-emerald-50 text-emerald-700',
    monitoring: 'bg-amber-50 text-amber-700',
    suspicious_review: 'bg-orange-100 text-orange-800',
    confirmed_cheating: 'bg-red-100 text-red-800',
};

const INTEGRITY_LABELS: Record<string, string> = {
    clean: 'Clean',
    monitoring: 'Monitoring',
    suspicious_review: 'Suspicious',
    confirmed_cheating: 'Confirmed',
};

interface AssessmentResultsViewProps {
    groupId: string;
    onOpenCandidate: (applicationId: string, candidateId: string) => void;
    onOpenSuspectReview?: (applicationId: string) => void;
}

export function AssessmentResultsView({
    groupId,
    onOpenCandidate,
    onOpenSuspectReview,
}: AssessmentResultsViewProps) {
    const { data, isLoading, isError } = useStageMonitoring(groupId, 'assessment');

    const handleIntegrityClick = useCallback(
        (e: React.MouseEvent, applicationId: string, verdict: string) => {
            if (verdict !== 'clean' && onOpenSuspectReview) {
                e.stopPropagation();
                onOpenSuspectReview(applicationId);
            }
        },
        [onOpenSuspectReview],
    );

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-[10px] bg-gray-100" />
                ))}
            </div>
        );
    }
    if (isError || !data) {
        return (
            <div className="flex items-center justify-center rounded-[14px] border border-dashed border-red-200 bg-red-50 py-10">
                <p className="text-[13px] text-red-600">Failed to load assessment results.</p>
            </div>
        );
    }

    const { total_candidates, completed, avg_score, pass_threshold, integrity_summary, candidates } = data as any;

    return (
        <div className="space-y-4">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: 'Completed', value: `${completed} / ${total_candidates}`, icon: CheckCircle, color: 'text-emerald-600' },
                    { label: 'Avg Score', value: `${(avg_score ?? 0).toFixed(1)}%`, icon: Clock, color: 'text-[#6366f1]' },
                    { label: 'Pass Threshold', value: `${pass_threshold ?? 70}%`, icon: Shield, color: 'text-gray-500' },
                    {
                        label: 'Integrity Flags',
                        value: `${((integrity_summary?.suspicious_review ?? 0) + (integrity_summary?.confirmed_cheating ?? 0))} flagged`,
                        icon: AlertTriangle,
                        color: ((integrity_summary?.suspicious_review ?? 0) + (integrity_summary?.confirmed_cheating ?? 0)) > 0 ? 'text-amber-600' : 'text-gray-400',
                    },
                ].map((kpi) => {
                    const Icon = kpi.icon;
                    return (
                        <div key={kpi.label} className="flex flex-col gap-1 rounded-[12px] border border-gray-100 bg-white px-4 py-3 shadow-sm">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{kpi.label}</span>
                            <div className="flex items-center gap-2">
                                <Icon size={14} className={kpi.color} />
                                <span className="text-[18px] font-bold tabular-nums text-gray-900">{kpi.value}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Decision table */}
            <div className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                        <thead className="border-b border-gray-100 bg-gray-50">
                            <tr>
                                <th className="px-5 py-3 font-semibold text-gray-600">Candidate</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 tabular-nums">Score</th>
                                <th className="px-4 py-3 font-semibold text-gray-600">Verdict</th>
                                <th className="px-4 py-3 font-semibold text-gray-600">Integrity</th>
                                <th className="px-4 py-3 font-semibold text-gray-600">Completed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(candidates as any[]).map((c: any, i: number) => {
                                const iv = c.integrity_verdict ?? 'clean';
                                const isFlagged = iv !== 'clean';
                                return (
                                    <tr
                                        key={c.application_id}
                                        className={`cursor-pointer border-b border-gray-50 transition-colors hover:bg-[#f5f3ff] ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                        onClick={() => onOpenCandidate(c.application_id, c.candidate_id)}
                                    >
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6366f1]/10 text-[12px] font-bold text-[#6366f1]">
                                                    {(c.name as string).slice(0, 2).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-gray-900">{c.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="tabular-nums font-semibold text-gray-900">
                                                {c.score !== null && c.score !== undefined ? `${Math.round(c.score)}%` : '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                c.verdict === 'pass' ? 'bg-emerald-50 text-emerald-700'
                                                : c.verdict === 'fail' ? 'bg-red-50 text-red-700'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {c.verdict ?? 'pending'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={(e) => handleIntegrityClick(e, c.application_id, iv)}
                                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${INTEGRITY_COLORS[iv] ?? 'bg-gray-100 text-gray-600'} ${isFlagged && onOpenSuspectReview ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                                title={isFlagged ? 'Click to review integrity flags' : undefined}
                                            >
                                                {INTEGRITY_LABELS[iv] ?? iv}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-gray-500">
                                            {c.completion_time
                                                ? new Date(c.completion_time).toLocaleDateString()
                                                : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {(candidates as any[]).length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-gray-400">
                                        No candidates have reached this stage yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
