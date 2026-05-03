/**
 * LiveInterviewComparison.tsx
 *
 * Side-by-side comparison of all candidates' live interview V2 results
 * within a group. Rows = candidates (sorted by score, best first),
 * columns = rubric dimensions. Each cell shows the dimension score
 * (1/2/3) and anchor matched, color-coded.
 *
 * Data flow:
 *   1. Fetch all sessions via GET /live-interview-v2/group/{groupId}/sessions
 *   2. For each completed session with evaluation, fetch full session
 *      via GET /live-interview-v2/session/{sessionId} to get dimension_scores
 *   3. Build comparison grid
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, Users, ArrowUpDown } from 'lucide-react';
import { fetchAPI } from '../../../services/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DimensionScore {
    score: 1 | 2 | 3;
    anchor_matched: 'substandard' | 'proficient' | 'excellent';
    cited_quote: string;
    reasoning: string;
    weight: number;
    dimension_name: string;
}

interface Evaluation {
    evaluation_id: string;
    overall_score: number;
    overall_score_pct: number;
    auto_verdict: 'strong_pass' | 'pass' | 'borderline' | 'fail';
    meets_criteria: boolean;
    coverage_ratio: number;
    dimension_scores: Record<string, DimensionScore>;
    evaluation_confidence: 'high' | 'medium' | 'low';
    judged_at: string;
}

interface SessionSummary {
    session_id: string;
    candidate_id: string;
    state: string;
    overall_score_pct: number | null;
    auto_verdict: string | null;
    meets_criteria: boolean | null;
    evaluation_confidence: string | null;
}

interface SessionDetail {
    session_id: string;
    candidate_id: string;
    candidate_name: string | null;
    state: string;
    evaluation: Evaluation | null;
}

interface ComparisonRow {
    sessionId: string;
    candidateId: string;
    candidateName: string;
    overallScorePct: number;
    autoVerdict: string;
    dimensionScores: Record<string, DimensionScore>;
}

interface LiveInterviewComparisonProps {
    groupId: string;
    organizationId?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VERDICT_STYLES: Record<string, string> = {
    strong_pass: 'bg-emerald-100 text-emerald-800',
    pass:        'bg-blue-100 text-blue-800',
    borderline:  'bg-amber-100 text-amber-800',
    fail:        'bg-red-100 text-red-800',
};

const VERDICT_LABELS: Record<string, string> = {
    strong_pass: 'Strong Pass',
    pass:        'Pass',
    borderline:  'Borderline',
    fail:        'Fail',
};

const SCORE_CELL_STYLES: Record<number, string> = {
    3: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    2: 'bg-amber-50 text-amber-800 border-amber-200',
    1: 'bg-red-50 text-red-800 border-red-200',
};

const SCORE_DOT_STYLES: Record<number, string> = {
    3: 'bg-emerald-500',
    2: 'bg-amber-500',
    1: 'bg-red-500',
};

const ANCHOR_SHORT: Record<string, string> = {
    excellent:    'Exc',
    proficient:   'Pro',
    substandard:  'Sub',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function LiveInterviewComparison({ groupId }: LiveInterviewComparisonProps) {
    const [summaries, setSummaries] = useState<SessionSummary[]>([]);
    const [rows, setRows] = useState<ComparisonRow[]>([]);
    const [dimensions, setDimensions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchAPI<{ group_id: string; sessions: SessionSummary[] }>(
                `/live-interview-v2/group/${groupId}/sessions`
            );
            setSummaries(res.sessions || []);
        } catch (e: any) {
            setError(e.message || 'Failed to load group sessions');
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Fetch detailed session data for sessions that have evaluations
    useEffect(() => {
        if (summaries.length === 0) return;

        const evalSessions = summaries.filter(
            s => s.state === 'completed' && s.overall_score_pct != null
        );

        if (evalSessions.length === 0) {
            setRows([]);
            setDimensions([]);
            return;
        }

        let cancelled = false;
        setLoadingDetails(true);

        (async () => {
            try {
                const details = await Promise.all(
                    evalSessions.map(s =>
                        fetchAPI<SessionDetail>(`/live-interview-v2/session/${s.session_id}`)
                            .catch(() => null)
                    )
                );

                if (cancelled) return;

                const comparisonRows: ComparisonRow[] = [];
                const dimSet = new Set<string>();

                for (const detail of details) {
                    if (!detail || !detail.evaluation) continue;

                    const ds = detail.evaluation.dimension_scores || {};
                    for (const dimId of Object.keys(ds)) {
                        dimSet.add(dimId);
                    }

                    comparisonRows.push({
                        sessionId: detail.session_id,
                        candidateId: detail.candidate_id,
                        candidateName: detail.candidate_name || detail.candidate_id.slice(0, 8),
                        overallScorePct: detail.evaluation.overall_score_pct,
                        autoVerdict: detail.evaluation.auto_verdict,
                        dimensionScores: ds,
                    });
                }

                // Sort by overall_score_pct descending (best first)
                comparisonRows.sort((a, b) => b.overallScorePct - a.overallScorePct);

                // Collect dimension names from the row with the most dimensions (most complete evaluation)
                const dimNames = new Map<string, string>();
                for (const row of comparisonRows) {
                    for (const [dimId, ds] of Object.entries(row.dimensionScores)) {
                        if (ds.dimension_name && !dimNames.has(dimId)) {
                            dimNames.set(dimId, ds.dimension_name);
                        }
                    }
                }

                // Stable dimension order: sort by the order they appear in the first row that has them
                const orderedDimIds: string[] = [];
                const seenDim = new Set<string>();
                for (const row of comparisonRows) {
                    for (const dimId of Object.keys(row.dimensionScores)) {
                        if (!seenDim.has(dimId)) {
                            seenDim.add(dimId);
                            orderedDimIds.push(dimId);
                        }
                    }
                }

                setDimensions(orderedDimIds);
                setRows(comparisonRows);
            } catch (e: any) {
                if (!cancelled) setError(e.message || 'Failed to load session details');
            } finally {
                if (!cancelled) setLoadingDetails(false);
            }
        })();

        return () => { cancelled = true; };
    }, [summaries]);

    // ─── Render helpers ─────────────────────────────────────────────────────

    const getDimName = (dimId: string, row?: ComparisonRow): string => {
        if (row?.dimensionScores[dimId]?.dimension_name) {
            return row.dimensionScores[dimId].dimension_name;
        }
        // Fallback: scan all rows for this dim name
        for (const r of rows) {
            if (r.dimensionScores[dimId]?.dimension_name) {
                return r.dimensionScores[dimId].dimension_name;
            }
        }
        return dimId;
    };

    // ─── Loading state ──────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Loading comparison data…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-500">
                <AlertCircle className="w-10 h-10" />
                <p className="text-sm">{error}</p>
            </div>
        );
    }

    // ─── No evaluated sessions ──────────────────────────────────────────────

    if (rows.length === 0 && !loadingDetails) {
        const hasSessions = summaries.length > 0;
        return (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
                <Users className="w-10 h-10" />
                <p className="text-sm">
                    {hasSessions
                        ? 'No evaluated sessions yet. Results will appear once the AI Judge completes.'
                        : 'No interview sessions found for this group.'}
                </p>
            </div>
        );
    }

    // ─── Main comparison grid ──────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Candidate Comparison</h3>
                    <span className="text-xs text-gray-400">({rows.length} evaluated)</span>
                </div>
                <button
                    onClick={fetchData}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`w-4 h-4 ${loadingDetails ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Loading details overlay */}
            {loadingDetails && (
                <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 text-sm">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    Loading detailed scores…
                </div>
            )}

            {/* Comparison table */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
                                Candidate
                            </th>
                            <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                                Score
                            </th>
                            <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                                Verdict
                            </th>
                            {dimensions.map(dimId => (
                                <th
                                    key={dimId}
                                    className="text-center px-3 py-3 font-medium text-gray-600 whitespace-nowrap text-xs max-w-[140px] truncate"
                                    title={getDimName(dimId)}
                                >
                                    {getDimName(dimId)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row, rowIdx) => (
                            <tr
                                key={row.sessionId}
                                className={`hover:bg-gray-50/50 transition-colors ${
                                    rowIdx === 0 ? 'bg-emerald-50/30' : ''
                                }`}
                            >
                                {/* Candidate name (sticky) */}
                                <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-inherit z-10">
                                    <span className="flex items-center gap-2">
                                        {rowIdx === 0 && (
                                            <span className="text-xs text-emerald-600 font-bold">★</span>
                                        )}
                                        {row.candidateName}
                                    </span>
                                </td>

                                {/* Overall score */}
                                <td className="px-3 py-3 text-center">
                                    <span className={`inline-flex items-center justify-center w-12 font-bold rounded-md text-xs py-1 ${
                                        row.overallScorePct >= 80
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : row.overallScorePct >= 60
                                                ? 'bg-blue-100 text-blue-700'
                                                : row.overallScorePct >= 40
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-red-100 text-red-700'
                                    }`}>
                                        {row.overallScorePct}%
                                    </span>
                                </td>

                                {/* Verdict */}
                                <td className="px-3 py-3 text-center">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                        VERDICT_STYLES[row.autoVerdict] || 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {VERDICT_LABELS[row.autoVerdict] || row.autoVerdict}
                                    </span>
                                </td>

                                {/* Dimension cells */}
                                {dimensions.map(dimId => {
                                    const ds = row.dimensionScores[dimId];
                                    if (!ds) {
                                        return (
                                            <td key={dimId} className="px-3 py-3 text-center text-gray-300">
                                                —
                                            </td>
                                        );
                                    }

                                    const cellStyle = SCORE_CELL_STYLES[ds.score] || 'bg-gray-50 text-gray-600';
                                    const dotStyle = SCORE_DOT_STYLES[ds.score] || 'bg-gray-400';

                                    return (
                                        <td key={dimId} className="px-3 py-3 text-center">
                                            <div
                                                className={`inline-flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border ${cellStyle}`}
                                                title={`${ds.dimension_name || dimId}: ${ds.anchor_matched} (${ds.score}/3)\n${ds.cited_quote ? 'Quote: "' + ds.cited_quote.slice(0, 80) + '…"' : ''}`}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full ${dotStyle}`} />
                                                    <span className="font-bold text-xs">{ds.score}</span>
                                                    <span className="text-[10px] font-medium opacity-75">
                                                        {ANCHOR_SHORT[ds.anchor_matched] || ds.anchor_matched}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
                <span className="font-medium">Legend:</span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> 3 — Excellent
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> 2 — Proficient
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> 1 — Substandard
                </span>
            </div>
        </div>
    );
}