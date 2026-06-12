import { Users } from 'lucide-react';

interface StageStatus {
    score: number | null;
    status: string;
    passed: boolean | null;
}

interface CandidateRow {
    application_id: string;
    candidate_id: string;
    name: string;
    email?: string;
    assessment?: StageStatus;
    ai_interview?: StageStatus;
    live_interview?: StageStatus;
    meets_criteria?: boolean;
    verdict?: string;
    status?: string;
}

interface OverviewMatrixViewProps {
    candidates: CandidateRow[];
    onOpenCandidate: (applicationId: string, candidateId: string) => void;
}

function ScoreCell({ stage }: { stage?: StageStatus }) {
    if (!stage || stage.status === 'pending' || stage.status === 'locked') {
        return <span className="text-[12px] text-gray-400">—</span>;
    }
    const score = stage.score ?? null;
    const color =
        stage.passed === true ? 'text-emerald-700 bg-emerald-50'
        : stage.passed === false ? 'text-red-700 bg-red-50'
        : 'text-gray-700 bg-gray-100';
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${color}`}>
            {score !== null ? `${Math.round(score)}%` : stage.status}
        </span>
    );
}

export function OverviewMatrixView({ candidates, onOpenCandidate }: OverviewMatrixViewProps) {
    if (candidates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-gray-200 bg-gray-50 py-16">
                <Users size={32} className="mb-3 text-gray-300" />
                <p className="text-[14px] font-medium text-gray-500">No candidates in this group yet.</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <h2 className="text-[14px] font-semibold text-gray-800">Candidate Progress Matrix</h2>
                <span className="text-[12px] text-gray-500">{candidates.length} candidates</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                    <thead className="border-b border-gray-100 bg-gray-50">
                        <tr>
                            <th className="px-5 py-3 font-semibold text-gray-600">Candidate</th>
                            <th className="px-4 py-3 font-semibold text-gray-600">Assessment</th>
                            <th className="px-4 py-3 font-semibold text-gray-600">AI Interview</th>
                            <th className="px-4 py-3 font-semibold text-gray-600">Live Interview</th>
                            <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {candidates.map((c, i) => (
                            <tr
                                key={c.application_id}
                                className={`cursor-pointer border-b border-gray-50 hover:bg-[#f5f3ff] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                onClick={() => onOpenCandidate(c.application_id, c.candidate_id)}
                            >
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6366f1]/10 text-[12px] font-bold text-[#6366f1]">
                                            {c.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{c.name}</p>
                                            {c.email && <p className="text-[11px] text-gray-400">{c.email}</p>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3"><ScoreCell stage={c.assessment} /></td>
                                <td className="px-4 py-3"><ScoreCell stage={c.ai_interview} /></td>
                                <td className="px-4 py-3"><ScoreCell stage={c.live_interview} /></td>
                                <td className="px-4 py-3">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                        c.status === 'active' ? 'bg-emerald-50 text-emerald-700'
                                        : c.status === 'rejected' ? 'bg-red-50 text-red-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {c.status ?? 'active'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
