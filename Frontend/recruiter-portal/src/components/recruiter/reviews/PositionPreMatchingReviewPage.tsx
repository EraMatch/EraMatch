import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { useBackgroundTasksPolling } from '../../../hooks/backgroundTasks/useBackgroundTasks';

interface QAGQuestion {
    id: number;
    question: string;
    category?: string;
    weight?: number;
    approved?: boolean;
    edited?: boolean;
    generation_source?: 'ai' | 'fallback' | 'autofill' | 'manual' | string;
    generation_provider?: string;
    generation_model?: string;
}

interface QAGArtifactMeta {
    provider?: string;
    model?: string;
    generation_source?: string;
    fallback_used?: boolean;
    generation_duration_ms?: number;
}

export function PositionPreMatchingReviewPage() {
    const navigate = useNavigate();
    const { requestId } = useParams();
    const [searchParams] = useSearchParams();

    const positionId = searchParams.get('positionId') || '';
    const positionTitle = searchParams.get('positionTitle') || 'Untitled Position';

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [qagQuestions, setQagQuestions] = useState<QAGQuestion[]>([]);
    const [qagReviewNotes, setQagReviewNotes] = useState('');
    const [qagArtifactMeta, setQagArtifactMeta] = useState<QAGArtifactMeta | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'ai' | 'fallback' | 'autofill' | 'manual'>('all');
    const [submitStage, setSubmitStage] = useState<'idle' | 'saving' | 'finalizing'>('idle');
    const [jdKeywords, setJdKeywords] = useState<Record<string, string[]> | null>(null);
    const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
    const [keywordsMessage, setKeywordsMessage] = useState<string | null>(null);
    const [keywordsError, setKeywordsError] = useState<string | null>(null);
    const [approvalCompleted, setApprovalCompleted] = useState(false);
    const [isQagGenerating, setIsQagGenerating] = useState(false);
    const [qagJobId, setQagJobId] = useState<string | null>(null);
    const [qagGenerationFailed, setQagGenerationFailed] = useState(false);

    const applyArtifact = (artifact: any) => {
        const questions = Array.isArray(artifact?.questions) ? artifact.questions : [];
        setQagQuestions(questions as QAGQuestion[]);
        setQagArtifactMeta({
            provider: artifact?.provider,
            model: artifact?.model,
            generation_source: artifact?.generation_source,
            fallback_used: Boolean(artifact?.fallback_used),
            generation_duration_ms: typeof artifact?.generation_duration_ms === 'number' ? artifact.generation_duration_ms : undefined,
        });
    };

    useEffect(() => {
        const load = async () => {
            if (!positionId) {
                setLoading(false);
                toast.error('Missing position id for pre-matching review.');
                return;
            }

            try {
                setLoading(true);
                setQagGenerationFailed(false);

                // Check whether a generation job is already running for this position before
                // hitting the auto-trigger endpoint below (which would otherwise spawn a duplicate job).
                const tasks = await api.recruiter.getBackgroundTasks().catch(() => [] as any[]);
                const runningJob = Array.isArray(tasks)
                    ? tasks.find((t: any) =>
                        t?.task_category === 'qag' &&
                        t?.qag_job_type === 'qag_generation' &&
                        t?.position_id === positionId &&
                        (t?.status === 'pending' || t?.status === 'processing'))
                    : null;

                if (runningJob) {
                    setQagJobId(runningJob.id);
                    setIsQagGenerating(true);
                    return;
                }

                const artifact = await api.recruiter.getPositionHDEvalQAG(positionId);
                if (artifact?.status === 'pending' && artifact?.job_id) {
                    setQagJobId(artifact.job_id);
                    setIsQagGenerating(true);
                    return;
                }

                applyArtifact(artifact);
            } catch (error) {
                console.error('Failed to load pre-matching criteria:', error);
                toast.error('Failed to load Position Pre-Matching Score criteria');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [positionId]);

    const { data: backgroundTasks } = useBackgroundTasksPolling(isQagGenerating);

    useEffect(() => {
        if (!isQagGenerating || !qagJobId || !Array.isArray(backgroundTasks)) return;
        const job = backgroundTasks.find((t: any) => t?.id === qagJobId);
        if (!job) return;

        if (job.status === 'completed') {
            setIsQagGenerating(false);
            api.recruiter.getPositionHDEvalQAG(positionId)
                .then((artifact) => {
                    applyArtifact(artifact);
                    toast.success('Position pre-matching criteria generated.');
                })
                .catch((error) => {
                    console.error('Failed to load generated pre-matching criteria:', error);
                    toast.error('Criteria generation finished, but loading the results failed. Please reload.');
                });
        } else if (job.status === 'failed' || job.status === 'cancelled') {
            setIsQagGenerating(false);
            setQagGenerationFailed(true);
            toast.error('Position pre-matching criteria generation failed.');
        }
    }, [backgroundTasks, isQagGenerating, qagJobId, positionId]);

    const approvedCount = useMemo(
        () => qagQuestions.filter((q) => Boolean(q.approved ?? true)).length,
        [qagQuestions],
    );

    const sourceStats = useMemo(() => {
        const counts = { ai: 0, fallback: 0, autofill: 0, manual: 0, unknown: 0 };
        qagQuestions.forEach((q) => {
            const source = String(q.generation_source || '').toLowerCase();
            if (source === 'ai') counts.ai += 1;
            else if (source === 'fallback') counts.fallback += 1;
            else if (source === 'autofill') counts.autofill += 1;
            else if (source === 'manual') counts.manual += 1;
            else counts.unknown += 1;
        });
        return counts;
    }, [qagQuestions]);

    const filteredQuestions = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return qagQuestions.filter((q) => {
            const source = String(q.generation_source || '').toLowerCase();
            const sourceMatches = sourceFilter === 'all' ? true : source === sourceFilter;
            const textMatches =
                term.length === 0 ||
                String(q.question || '').toLowerCase().includes(term) ||
                String(q.category || '').toLowerCase().includes(term);
            return sourceMatches && textMatches;
        });
    }, [qagQuestions, searchTerm, sourceFilter]);

    const hasQagEdits = useMemo(
        () => qagQuestions.some((q) => Boolean(q.edited)),
        [qagQuestions],
    );

    const updateQuestionField = (id: number, patch: Partial<QAGQuestion>) => {
        setQagQuestions((prev) => prev.map((q) => {
            if (q.id !== id) return q;
            const contentEdited =
                Object.prototype.hasOwnProperty.call(patch, 'question') ||
                Object.prototype.hasOwnProperty.call(patch, 'category') ||
                Object.prototype.hasOwnProperty.call(patch, 'weight');

            if (contentEdited) {
                return {
                    ...q,
                    ...patch,
                    edited: true,
                    generation_source: 'manual',
                    generation_provider: 'technical_reviewer',
                    generation_model: '',
                };
            }

            return { ...q, ...patch, edited: true };
        }));
    };

    const formatQuestionSource = (q: QAGQuestion) => {
        const source = String(q.generation_source || '').toLowerCase();
        if (source === 'ai') {
            const provider = q.generation_provider || qagArtifactMeta?.provider || 'ai';
            const model = q.generation_model || qagArtifactMeta?.model;
            return model ? `AI (${provider} / ${model})` : `AI (${provider})`;
        }
        if (source === 'fallback') return 'Fallback Template';
        if (source === 'autofill') return 'Auto-Filled (Missing AI Output)';
        if (source === 'manual') return 'Manual';
        return 'Unknown Source';
    };

    const sourceBadgeClass = (q: QAGQuestion) => {
        const source = String(q.generation_source || '').toLowerCase();
        if (source === 'ai') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (source === 'fallback') return 'bg-amber-50 text-amber-700 border-amber-200';
        if (source === 'autofill') return 'bg-orange-50 text-orange-700 border-orange-200';
        if (source === 'manual') return 'bg-sky-50 text-sky-700 border-sky-200';
        return 'bg-gray-100 text-gray-700 border-gray-200';
    };

    const setApprovalForFiltered = (approved: boolean) => {
        const filteredIds = new Set(filteredQuestions.map((q) => q.id));
        setQagQuestions((prev) =>
            prev.map((q) => (filteredIds.has(q.id) ? { ...q, approved, edited: true } : q))
        );
    };

    const handleRegenerateQAG = async () => {
        if (!positionId) return;
        try {
            setQagGenerationFailed(false);
            const artifact = await api.recruiter.regeneratePositionHDEvalQAG(positionId);
            if (artifact?.status === 'pending' && artifact?.job_id) {
                setQagJobId(artifact.job_id);
                setIsQagGenerating(true);
            } else {
                applyArtifact(artifact);
            }
        } catch (error) {
            console.error('Failed to regenerate pre-matching criteria:', error);
            toast.error('Failed to start criteria regeneration');
            setQagGenerationFailed(true);
        }
    };

    const handleSaveQAGDraft = async () => {
        if (!positionId) return;
        try {
            setSubmitting(true);
            setSubmitStage('saving');
            await api.recruiter.updatePositionHDEvalQAG(positionId, qagQuestions);
            setQagQuestions((prev) => prev.map((q) => ({ ...q, edited: false })));
            toast.success('Position pre-matching criteria saved');
        } catch (error) {
            console.error('Failed to save pre-matching criteria draft:', error);
            toast.error('Failed to save criteria draft');
        } finally {
            setSubmitStage('idle');
            setSubmitting(false);
        }
    };

    const handleApproveWithQAG = async () => {
        if (!positionId || !requestId) return;
        try {
            setSubmitting(true);
            setApprovalCompleted(false);
            if (hasQagEdits) {
                setSubmitStage('saving');
                await api.recruiter.updatePositionHDEvalQAG(positionId, qagQuestions);
                setQagQuestions((prev) => prev.map((q) => ({ ...q, edited: false })));
            }

            setSubmitStage('finalizing');
            await Promise.all([
                api.recruiter.reviewRequest(requestId, 'approved', qagReviewNotes || undefined),
                api.recruiter.approvePositionHDEvalQAG(positionId),
            ]);

            setIsGeneratingKeywords(true);
            setKeywordsError(null);
            setKeywordsMessage(null);
            try {
                const kwRes = await api.recruiter.generatePositionKeywords(positionId) as any;
                const generated = kwRes?.keywords ?? null;
                if (generated && Object.keys(generated).length > 0) {
                    setJdKeywords(generated);
                    setKeywordsMessage(`Keywords extracted via ${kwRes?.model ?? 'LLM'}.`);
                } else {
                    const existing = await api.recruiter.getPositionKeywords(positionId) as Record<string, string[]>;
                    if (existing && Object.keys(existing).length > 0) {
                        setJdKeywords(existing);
                        setKeywordsMessage('Keywords loaded from saved position keywords.');
                    } else {
                        setJdKeywords(null);
                        setKeywordsError('No keywords were returned from extraction.');
                    }
                }
            } catch (kwErr) {
                console.error('Keyword extraction error:', kwErr);
                setKeywordsError(
                    kwErr instanceof Error
                        ? kwErr.message
                        : 'Keyword extraction failed. You can re-open this position and retry extraction from Position Details.'
                );
            } finally {
                setIsGeneratingKeywords(false);
            }

            setApprovalCompleted(true);
            toast.success('Position approved and criteria activated. Keywords are shown below.');
        } catch (error) {
            console.error('Failed to approve with pre-matching criteria:', error);
            toast.error('Failed to approve and activate criteria');
        } finally {
            setSubmitStage('idle');
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8 max-w-[1600px] mx-auto">
                <div className="rounded-xl border border-gray-200 bg-white p-12 flex items-center justify-center gap-3 text-gray-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading Position Pre-Matching Score review...
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <button
                            onClick={() => navigate('/recruiter/reviews')}
                            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3"
                        >
                            <ArrowLeft size={16} />
                            Back to Technical Reviews
                        </button>
                        <h1 className="text-3xl font-bold text-gray-900">Position Pre-Matching Score Review (50 Yes/No Criteria)</h1>
                        <p className="text-sm text-gray-500 mt-2">
                            Review, edit, and approve the generated question set. Candidate scoring will use these approved yes/no criteria.
                        </p>
                        <p className="text-sm text-gray-700 mt-2">
                            Position: <span className="font-semibold">{positionTitle}</span>
                        </p>
                    </div>

                    <div className="text-right text-xs text-gray-500 min-w-[220px]">
                        <p>Total Criteria: <span className="font-semibold text-gray-700">{qagQuestions.length}</span></p>
                        <p>Visible: <span className="font-semibold text-gray-700">{filteredQuestions.length}</span></p>
                        <p>Approved: <span className="font-semibold text-emerald-700">{approvedCount}</span></p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
                <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-gray-600">Artifact Source:</span>
                            <span className={`px-2 py-0.5 rounded border ${qagArtifactMeta?.fallback_used ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {qagArtifactMeta?.fallback_used ? 'Fallback Used' : 'AI-Generated'}
                            </span>
                            {(qagArtifactMeta?.provider || qagArtifactMeta?.model) && (
                                <span className="px-2 py-0.5 rounded border bg-white text-gray-700 border-gray-200">
                                    {qagArtifactMeta?.provider || 'ai'}{qagArtifactMeta?.model ? ` / ${qagArtifactMeta.model}` : ''}
                                </span>
                            )}
                            {typeof qagArtifactMeta?.generation_duration_ms === 'number' && (
                                <span className="px-2 py-0.5 rounded border bg-white text-gray-700 border-gray-200">
                                    Generation Time: {(qagArtifactMeta.generation_duration_ms / 1000).toFixed(2)}s
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">AI: {sourceStats.ai}</div>
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Fallback: {sourceStats.fallback}</div>
                            <div className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-orange-700">AutoFill: {sourceStats.autofill}</div>
                            <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">Manual: {sourceStats.manual}</div>
                            <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">Unknown: {sourceStats.unknown}</div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search criteria text or category"
                                className="h-10 rounded-md border border-gray-300 px-3 text-sm"
                            />
                            <select
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value as 'all' | 'ai' | 'fallback' | 'autofill' | 'manual')}
                                className="h-10 rounded-md border border-gray-300 px-3 text-sm bg-white"
                            >
                                <option value="all">All Sources</option>
                                <option value="ai">AI</option>
                                <option value="fallback">Fallback</option>
                                <option value="autofill">AutoFill</option>
                                <option value="manual">Manual</option>
                            </select>
                            <div className="flex items-center gap-2">
                                <Button type="button" variant="outline" className="h-10" onClick={() => setApprovalForFiltered(true)} disabled={submitting || filteredQuestions.length === 0}>
                                    Approve Visible
                                </Button>
                                <Button type="button" variant="outline" className="h-10" onClick={() => setApprovalForFiltered(false)} disabled={submitting || filteredQuestions.length === 0}>
                                    Unapprove Visible
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {isQagGenerating ? (
                            <div
                                role="status"
                                aria-live="polite"
                                className="rounded-xl border border-[#6366f1]/20 bg-[#f5f3ff] p-6 flex items-center gap-3"
                            >
                                <Loader2 className="w-5 h-5 animate-spin text-[#6366f1] flex-shrink-0" />
                                <p className="text-sm text-[#4f46e5]">
                                    Generating Position Pre-Matching Score criteria in the background…
                                    this page will update automatically when it's done.
                                </p>
                            </div>
                        ) : qagGenerationFailed ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-6 flex items-center justify-between gap-3">
                                <p className="text-sm text-red-700">
                                    Criteria generation failed for this position.
                                </p>
                                <Button type="button" variant="outline" onClick={handleRegenerateQAG}>
                                    Regenerate
                                </Button>
                            </div>
                        ) : filteredQuestions.length === 0 ? (
                            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                                No criteria match the current search/filter.
                            </div>
                        ) : (
                            filteredQuestions.map((q) => (
                                <div key={q.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                            <span>Q{q.id} • {q.category || 'general'} • weight {Number(q.weight || 0).toFixed(4)}</span>
                                            <span className={`px-2 py-0.5 rounded border ${sourceBadgeClass(q)}`}>
                                                {formatQuestionSource(q)}
                                            </span>
                                        </div>
                                        <label className="flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(q.approved ?? true)}
                                                onChange={(e) => updateQuestionField(q.id, { approved: e.target.checked })}
                                            />
                                            Approved
                                        </label>
                                    </div>
                                    <Textarea
                                        value={q.question}
                                        onChange={(e) => updateQuestionField(q.id, { question: e.target.value })}
                                        className="min-h-[78px]"
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <aside className="lg:sticky lg:top-6 space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <h2 className="text-base font-semibold text-gray-900">Decision Summary</h2>
                        <div className="mt-3 space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Approved Criteria</span>
                                <span className="font-semibold text-emerald-700">{approvedCount}/{qagQuestions.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Manual Edits</span>
                                <span className="font-semibold text-sky-700">{sourceStats.manual}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Fallback + AutoFill</span>
                                <span className="font-semibold text-amber-700">{sourceStats.fallback + sourceStats.autofill}</span>
                            </div>
                            <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                                Recommendation: review any fallback/autofill criteria carefully before approval.
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <Label htmlFor="qag-notes" className="mb-2 block">Technical Review Notes (optional)</Label>
                        <Textarea
                            id="qag-notes"
                            value={qagReviewNotes}
                            onChange={(e) => setQagReviewNotes(e.target.value)}
                            className="min-h-[120px]"
                            placeholder="Add notes about pre-matching approval/edit decisions..."
                        />
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                        <h2 className="text-base font-semibold text-gray-900">Extracted JD Keywords</h2>
                        {isGeneratingKeywords && (
                            <div className="text-sm text-gray-600 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Extracting keywords from job description...
                            </div>
                        )}
                        {keywordsMessage && (
                            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                                {keywordsMessage}
                            </p>
                        )}
                        {keywordsError && (
                            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                                {keywordsError}
                            </p>
                        )}
                        {!isGeneratingKeywords && !keywordsMessage && !keywordsError && (
                            <p className="text-xs text-gray-500">
                                Keywords will be extracted automatically right after approval.
                            </p>
                        )}
                        {jdKeywords && Object.keys(jdKeywords).length > 0 && (
                            <div className="space-y-2">
                                {Object.entries(jdKeywords).map(([bucket, values]) => (
                                    <div key={bucket}>
                                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{bucket.replace(/_/g, ' ')}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(values || []).map((item) => (
                                                <span key={`${bucket}-${item}`} className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-700">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {approvalCompleted && !isGeneratingKeywords && !keywordsError && (!jdKeywords || Object.keys(jdKeywords).length === 0) && (
                            <p className="text-xs text-gray-500">
                                Approval completed, but no keywords were found for this JD.
                            </p>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                        <div className="flex flex-col gap-2">
                            <Button variant="outline" onClick={() => navigate('/recruiter/reviews')} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button variant="outline" onClick={handleSaveQAGDraft} disabled={submitting || isQagGenerating}>
                                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Draft
                            </Button>
                            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApproveWithQAG} disabled={submitting || isQagGenerating || approvedCount === 0 || approvalCompleted}>
                                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {approvalCompleted ? 'Approved' : 'Approve Request + Activate Criteria'}
                            </Button>
                            {approvalCompleted && (
                                <Button variant="outline" onClick={() => navigate('/recruiter/reviews')}>
                                    Back to Technical Reviews
                                </Button>
                            )}
                            {submitting && (
                                <p className="text-xs text-gray-500 pt-1">
                                    {submitStage === 'saving'
                                        ? 'Saving updated criteria...'
                                        : 'Finalizing approval...'}
                                </p>
                            )}
                        </div>
                    </div>
                </aside>
            </div>
            <div className="h-2" />
        </div>
    );
}
