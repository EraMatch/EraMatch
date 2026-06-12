import { Video, RotateCcw, CheckCircle } from 'lucide-react';
import { useStageMonitoring } from '../../../../hooks/groups/useGroups';

const RECOMMENDATION_COLORS: Record<string, string> = {
    pass: 'bg-emerald-50 text-emerald-700',
    borderline: 'bg-amber-50 text-amber-700',
    fail: 'bg-red-50 text-red-700',
};

interface AIInterviewResultsViewProps {
    groupId: string;
    onOpenCandidate: (applicationId: string, candidateId: string) => void;
}

export function AIInterviewResultsView({ groupId, onOpenCandidate }: AIInterviewResultsViewProps) {
    const { data, isLoading, isError } = useStageMonitoring(groupId, 'ai-interview');

    if (isLoading) {
        return <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-[10px] bg-gray-100" />)}</div>;
    }
    if (isError || !data) {
        return <div className="flex items-center justify-center rounded-[14px] border border-dashed border-red-200 bg-red-50 py-10"><p className="text-[13px] text-red-600">Failed to load AI interview results.</p></div>;
    }

    const { total_candidates, completed, avg_score, candidates } = data as any;
    const withRec = (candidates as any[]).filter((c: any) => c.ai_recommendation).length;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Completed', value: `${completed} / ${total_candidates}`, icon: CheckCircle, color: 'text-emerald-600' },
                    { label: 'Avg Score', value: avg_score > 0 ? `${(avg_score as number).toFixed(1)}%` : '—', icon: Video, color: 'text-[#6366f1]' },
                    { label: 'AI Assessed', value: `${withRec} / ${completed}`, icon: CheckCircle, color: 'text-blue-500' },
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

            <div className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                        <thead className="border-b border-gray-100 bg-gray-50">
                            <tr>
                                <th className="px-5 py-3 font-semibold text-gray-600">Candidate</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 tabular-nums">Score</th>
                                <th className="px-4 py-3 font-semibold text-gray-600">AI Recommendation</th>
                                <th className="px-4 py-3 font-semibold text-gray-600">Retakes</th>
                                <th className="px-4 py-3 font-semibold text-gray-600">Verdict</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(candidates as any[]).map((c: any, i: number) => (
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
                                    <td className="px-4 py-3 tabular-nums font-semibold text-gray-900">
                                        {c.score !== null && c.score !== undefined ? `${Math.round(c.score)}%` : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {c.ai_recommendation ? (
                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RECOMMENDATION_COLORS[c.ai_recommendation] ?? 'bg-gray-100 text-gray-600'}`}>
                                                {c.ai_recommendation}
                                            </span>
                                        ) : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-gray-600">
                                        <div className="flex items-center gap-1">
                                            <RotateCcw size={12} className="text-gray-400" />
                                            {c.retakes_used ?? 0}
                                        </div>
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
                                </tr>
                            ))}
                            {(candidates as any[]).length === 0 && (
                                <tr><td colSpan={5} className="px-5 py-10 text-center text-[13px] text-gray-400">No candidates have reached this stage yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
