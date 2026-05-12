import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Edit3, Loader2, Save, Shield, Sparkles, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { useCandidateDetail } from '../../../hooks/candidates/useCandidates';

type ReviewPage = 'all' | 'mcq' | 'essay' | 'coding';

interface CandidateGitHubAnalysisReviewPageProps {
  candidateId?: string;
  applicationId?: string;
}

interface ReviewQuestion {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'coding';
  difficulty: string;
  sourceFile: string;
  referenceAnswer: string;
  rubric: string;
  rubricYesNoChecks: Array<{ id?: number; check?: string; weight?: number }>;
  selectionReason: string;
  jdRelation: string;
  evidence: string;
  criticScore: number | null;
  criticFeedback: string;
  criticChecks: Array<{ criterion?: string; verdict?: string; reason?: string; weight?: number }>;
  selected: boolean;
  expanded: boolean;
  editing: boolean;
  edited: {
    questionText: string;
    referenceAnswer: string;
    sourceFile: string;
    rubric: string;
    rubricYesNoChecks: Array<{ id?: number; check?: string; weight?: number }>;
    selectionReason: string;
    jdRelation: string;
    difficulty: string;
    type: 'mcq' | 'essay' | 'coding';
    evidence: string;
  };
}

const tabStyles = (active: boolean) =>
  active
    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
    : 'border-transparent bg-slate-50 text-slate-600 hover:bg-indigo-50/60 hover:text-slate-800';

const normalizeType = (value: unknown): 'mcq' | 'essay' | 'coding' => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'mcq' || raw === 'multiple choice') return 'mcq';
  if (raw === 'code' || raw === 'coding') return 'coding';
  return 'essay';
};

const normalizeText = (value: unknown): string => String(value || '').trim();

const buildQuestions = (candidateData: any): ReviewQuestion[] => {
  const analysis = candidateData?.githubAnalysis || {};
  const rawQuestions = Array.isArray(analysis?.questions) ? analysis.questions : [];

  return rawQuestions
    .map((item: any, index: number) => {
      const questionText = normalizeText(item?.questionText ?? item?.question ?? item?.question_text);
      if (!questionText) return null;

      const type = normalizeType(item?.questionType ?? item?.type ?? item?.question_type);
      const sourceFile = normalizeText(item?.sourceFile ?? item?.source_file);
      const referenceAnswer = normalizeText(item?.referenceAnswer ?? item?.reference_answer);
      const rubric = normalizeText(item?.rubric ?? item?.rubric_text);
      const rubricYesNoChecks = Array.isArray(item?.rubricYesNoChecks)
        ? item.rubricYesNoChecks
        : (Array.isArray(item?.rubric_yes_no_checks) ? item.rubric_yes_no_checks : []);
      const selectionReason = normalizeText(item?.selectionReason ?? item?.selection_reason);
      const jdRelation = normalizeText(item?.jdRelation ?? item?.jd_relation);
      const evidence = normalizeText(item?.evidence);
      const difficulty = normalizeText(item?.difficulty) || 'Medium';
      const criticScore = Number.isFinite(Number(item?.criticScore ?? item?.critic_score)) ? Number(item?.criticScore ?? item?.critic_score) : null;
      const criticFeedback = normalizeText(item?.criticFeedback ?? item?.critic_feedback);
      const criticChecks = Array.isArray(item?.criticChecks)
        ? item.criticChecks
        : (Array.isArray(item?.critic_checks) ? item.critic_checks : []);

      return {
        id: normalizeText(item?.questionId ?? item?.question_id ?? `${index + 1}`),
        questionText,
        type,
        difficulty,
        sourceFile,
        referenceAnswer,
        rubric,
        rubricYesNoChecks,
        selectionReason,
        jdRelation,
        evidence,
        criticScore,
        criticFeedback,
        criticChecks,
        selected: true,
        expanded: false,
        editing: false,
        edited: {
          questionText,
          referenceAnswer,
          sourceFile,
          rubric,
          rubricYesNoChecks,
          selectionReason,
          jdRelation,
          difficulty,
          type,
          evidence,
        },
      } satisfies ReviewQuestion;
    })
    .filter(Boolean) as ReviewQuestion[];
};

export function CandidateGitHubAnalysisReviewPage({ candidateId: routedCandidateId, applicationId }: CandidateGitHubAnalysisReviewPageProps) {
  const navigate = useNavigate();
  const { candidateId: paramCandidateId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<ReviewQuestion[]>([]);
  const [rowsInitialized, setRowsInitialized] = useState(false);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);
  const [reviewSortMode, setReviewSortMode] = useState<'risk' | 'chronological'>('risk');
  const candidateId = routedCandidateId || paramCandidateId || '';
  const resolvedApplicationId = applicationId || searchParams.get('applicationId') || undefined;

  const { data: candidate, isLoading: loading, error: queryError } = useCandidateDetail(candidateId || undefined);
  const error = queryError ? (queryError as any)?.message || 'Failed to load GitHub analysis review data.' : null;

  // Build rows from candidate data when it first arrives
  if (candidate && !rowsInitialized) {
    setRows(buildQuestions(candidate));
    setRowsInitialized(true);
  }

  const reviewPage = useMemo<ReviewPage>(() => {
    const value = String(searchParams.get('reviewType') || '').toLowerCase();
    if (value === 'essay' || value === 'coding' || value === 'mcq') return value;
    return 'all';
  }, [searchParams]);

  const setReviewPage = (nextPage: ReviewPage) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage === 'all') {
      nextParams.delete('reviewType');
    } else {
      nextParams.set('reviewType', nextPage);
    }
    setSearchParams(nextParams);
  };


  const updateRow = (rowId: string, patch: Partial<ReviewQuestion> & { edited?: Partial<ReviewQuestion['edited']> }) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        ...patch,
        edited: {
          ...row.edited,
          ...(patch.edited || {}),
        },
      };
    }));
  };

  const startEdit = (rowId: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, editing: true, expanded: true } : row)));
  };

  const saveEdit = (rowId: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        editing: false,
        questionText: row.edited.questionText,
        referenceAnswer: row.edited.referenceAnswer,
        sourceFile: row.edited.sourceFile,
        selectionReason: row.edited.selectionReason,
        jdRelation: row.edited.jdRelation,
        difficulty: row.edited.difficulty,
        type: row.edited.type,
        evidence: row.edited.evidence,
      };
    }));
    setSavingMessage('Saved locally for this review session.');
    window.setTimeout(() => setSavingMessage(null), 2200);
  };

  const discardEdit = (rowId: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        editing: false,
        edited: {
          questionText: row.questionText,
          referenceAnswer: row.referenceAnswer,
          sourceFile: row.sourceFile,
          selectionReason: row.selectionReason,
          jdRelation: row.jdRelation,
          difficulty: row.difficulty,
          type: row.type,
          evidence: row.evidence,
        },
      };
    }));
  };

  const toggleSelected = (rowId: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, selected: !row.selected } : row)));
  };

  const toggleExpanded = (rowId: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, expanded: !row.expanded } : row)));
  };

  const computeRiskScore = (row: ReviewQuestion) => {
    const missingReference = row.referenceAnswer ? 0 : 30;
    const missingSource = row.sourceFile ? 0 : 15;
    const missingReason = row.selectionReason ? 0 : 10;
    const difficultyPenalty = row.difficulty === 'Hard' ? 12 : row.difficulty === 'Medium' ? 6 : 0;
    const typePenalty = row.type === 'coding' ? 12 : row.type === 'essay' ? 8 : 4;
    return missingReference + missingSource + missingReason + difficultyPenalty + typePenalty;
  };

  const selectedCount = rows.filter((row) => row.selected).length;
  const referenceCount = rows.filter((row) => row.referenceAnswer).length;
  const sourceCount = rows.filter((row) => row.sourceFile).length;
  const filteredRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => reviewPage === 'all' ? true : row.type === reviewPage)
    .sort((a, b) => (reviewSortMode === 'chronological' ? a.index - b.index : computeRiskScore(b.row) - computeRiskScore(a.row)));

  const summary = candidate?.githubAnalysis || {};
  const analysisQuestions = Array.isArray(summary?.questions) ? summary.questions : [];
  const githubScore = Number(summary?.overallScore);
  const repoName = summary?.repoSelection?.selected_repo || summary?.repoSelection?.best_repo || candidate?.github_url || 'Unknown repo';

  const exportReview = () => {
    const payload = {
      candidateId,
      candidateName: candidate?.name || candidate?.full_name || candidate?.fullName || 'Candidate',
      githubScore: Number.isFinite(githubScore) ? githubScore : null,
      selectedCount,
      totalCount: rows.length,
      reviewType: reviewPage,
      questions: rows.filter((row) => row.selected).map((row) => ({
        questionText: row.edited.questionText,
        type: row.edited.type,
        difficulty: row.edited.difficulty,
        sourceFile: row.edited.sourceFile,
        referenceAnswer: row.edited.referenceAnswer,
        selectionReason: row.edited.selectionReason,
        jdRelation: row.edited.jdRelation,
        evidence: row.edited.evidence,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `github-analysis-review-${candidateId || 'candidate'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const copyReview = async () => {
    const payload = {
      candidateId,
      reviewType: reviewPage,
      selectedCount,
      totalCount: rows.length,
      questions: rows.filter((row) => row.selected).map((row) => ({
        questionText: row.edited.questionText,
        referenceAnswer: row.edited.referenceAnswer,
        sourceFile: row.edited.sourceFile,
      })),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setSavingMessage('Copied review payload to clipboard.');
    window.setTimeout(() => setSavingMessage(null), 2200);
  };

  if (!candidateId && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Shield size={24} />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Missing candidate id.</h1>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="inline-flex items-center gap-3 text-slate-600">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          <span className="text-[15px] font-medium">Loading GitHub analysis review...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Shield size={24} />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Unable to load GitHub analysis review</h1>
          <p className="mt-2 text-sm text-rose-700">{error}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {savingMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            {savingMessage}
          </div>
        )}

        <div className="rounded-3xl border border-white/70 bg-white/85 backdrop-blur px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <button
                onClick={() => navigate(-1)}
                className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft size={16} />
                Back to candidate profile
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  <Sparkles size={14} />
                  GitHub Analysis Review
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                  Review Page
                </span>
                {resolvedApplicationId && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                    Application {resolvedApplicationId.slice(0, 8)}...
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                {candidate?.name || candidate?.full_name || candidate?.fullName || 'Candidate'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Review the GitHub-generated questions in the same full-page workflow used for question-bank generation.
                Source files, reference answers, selection reasoning, and JD relation are shown together so you can audit the pipeline end to end.
              </p>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-3 text-sm xl:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">GitHub Score</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {Number.isFinite(githubScore) ? githubScore.toFixed(1) : 'N/A'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Questions</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">Highlighted</div>
              <div className="text-xl font-semibold text-slate-900">{selectedCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">With Reference Answer</div>
              <div className="text-xl font-semibold text-slate-900">{referenceCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">With Source File</div>
              <div className="text-xl font-semibold text-slate-900">{sourceCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">Repository</div>
              <div className="text-sm font-semibold text-slate-900 break-all">{repoName}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/70 bg-white/90 backdrop-blur p-2 shadow-sm">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <button onClick={() => setReviewPage('all')} className={`rounded-2xl px-4 py-3 text-left border ${tabStyles(reviewPage === 'all')}`}>
                  <div className="text-xs uppercase tracking-wide font-semibold">All Questions</div>
                  <div className="mt-1 text-2xl font-semibold">{rows.length}</div>
                </button>
                <button onClick={() => setReviewPage('mcq')} className={`rounded-2xl px-4 py-3 text-left border ${tabStyles(reviewPage === 'mcq')}`}>
                  <div className="text-xs uppercase tracking-wide font-semibold">MCQ</div>
                  <div className="mt-1 text-2xl font-semibold">{rows.filter((row) => row.type === 'mcq').length}</div>
                </button>
                <button onClick={() => setReviewPage('essay')} className={`rounded-2xl px-4 py-3 text-left border ${tabStyles(reviewPage === 'essay')}`}>
                  <div className="text-xs uppercase tracking-wide font-semibold">Essay</div>
                  <div className="mt-1 text-2xl font-semibold">{rows.filter((row) => row.type === 'essay').length}</div>
                </button>
                <button onClick={() => setReviewPage('coding')} className={`rounded-2xl px-4 py-3 text-left border ${tabStyles(reviewPage === 'coding')}`}>
                  <div className="text-xs uppercase tracking-wide font-semibold">Coding</div>
                  <div className="mt-1 text-2xl font-semibold">{rows.filter((row) => row.type === 'coding').length}</div>
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/70 bg-white/90 backdrop-blur p-3 shadow-sm flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Queue Priority</span>
              <button
                onClick={() => setReviewSortMode('risk')}
                className={`px-3 py-1.5 rounded-full text-xs border ${reviewSortMode === 'risk' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
              >
                Risk First
              </button>
              <button
                onClick={() => setReviewSortMode('chronological')}
                className={`px-3 py-1.5 rounded-full text-xs border ${reviewSortMode === 'chronological' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
              >
                Chronological
              </button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" onClick={copyReview} className="h-9">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Review
                </Button>
                <Button variant="outline" onClick={exportReview} className="h-9">
                  <Download className="mr-2 h-4 w-4" />
                  Export JSON
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {filteredRows.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-sm text-slate-500 shadow-sm">
                  No GitHub questions match the current filter.
                </div>
              ) : (
                filteredRows.map(({ row, index }) => (
                  <div key={row.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-900">Q{index + 1}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 uppercase">{row.type}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{row.difficulty}</span>
                        {row.sourceFile && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">Source file</span>}
                        {row.referenceAnswer && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">Reference answer</span>}
                      </div>

                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={row.selected} onChange={() => toggleSelected(row.id)} />
                        Highlighted
                      </label>
                    </div>

                    <div className="mt-3 flex items-start justify-between gap-4">
                      {row.editing ? (
                        <Textarea
                          value={row.edited.questionText}
                          onChange={(e) => updateRow(row.id, { edited: { questionText: e.target.value } })}
                          className="min-h-[110px] text-[15px]"
                        />
                      ) : (
                        <p className="text-[15px] leading-relaxed text-slate-900 whitespace-pre-wrap flex-1">
                          {row.questionText}
                        </p>
                      )}

                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => toggleExpanded(row.id)}>
                          {row.expanded ? 'Collapse' : 'Expand'}
                        </Button>
                        {row.editing ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => discardEdit(row.id)}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={() => saveEdit(row.id)}>
                              <Save className="mr-2 h-4 w-4" />
                              Save
                            </Button>
                          </>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => startEdit(row.id)}>
                            <Edit3 className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>

                    {(row.expanded || row.editing) && (
                      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
                        <div className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-xs uppercase tracking-wide text-slate-500">Source File</div>
                              {row.editing ? (
                                <input
                                  value={row.edited.sourceFile}
                                  onChange={(e) => updateRow(row.id, { edited: { sourceFile: e.target.value } })}
                                  className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                                />
                              ) : (
                                <div className="mt-2 text-sm text-slate-800 break-all">{row.sourceFile || 'Unknown'}</div>
                              )}
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-xs uppercase tracking-wide text-slate-500">Difficulty</div>
                              {row.editing ? (
                                <select
                                  value={row.edited.difficulty}
                                  onChange={(e) => updateRow(row.id, { edited: { difficulty: e.target.value } })}
                                  className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                                >
                                  <option value="Easy">Easy</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Hard">Hard</option>
                                </select>
                              ) : (
                                <div className="mt-2 text-sm text-slate-800">{row.difficulty}</div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Reference Answer</div>
                            {row.editing ? (
                              <Textarea
                                value={row.edited.referenceAnswer}
                                onChange={(e) => updateRow(row.id, { edited: { referenceAnswer: e.target.value } })}
                                className="min-h-[130px]"
                              />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-slate-800">{row.referenceAnswer || 'No reference answer provided.'}</p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Rubric</div>
                            <p className="whitespace-pre-wrap text-sm text-slate-800">
                              {row.rubric || 'No rubric provided.'}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">QAG Checklist</div>
                            {row.rubricYesNoChecks.length > 0 ? (
                              <div className="space-y-2">
                                {row.rubricYesNoChecks.slice(0, 10).map((check, checkIndex) => (
                                  <div key={`${row.id}-check-${checkIndex}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                    <div className="flex items-start gap-2">
                                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                                      <span>{check.check || `Check ${checkIndex + 1}`}</span>
                                    </div>
                                    <span className="text-xs text-slate-500">{Number(check.weight || 0).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-slate-800">No QAG checklist provided.</p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Selection Reason</div>
                            {row.editing ? (
                              <Textarea
                                value={row.edited.selectionReason}
                                onChange={(e) => updateRow(row.id, { edited: { selectionReason: e.target.value } })}
                                className="min-h-[96px]"
                              />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-slate-800">{row.selectionReason || 'No selection reason provided.'}</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">JD Relation</div>
                            {row.editing ? (
                              <Textarea
                                value={row.edited.jdRelation}
                                onChange={(e) => updateRow(row.id, { edited: { jdRelation: e.target.value } })}
                                className="min-h-[96px]"
                              />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-slate-800">{row.jdRelation || 'No JD relation provided.'}</p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Evidence</div>
                            {row.editing ? (
                              <Textarea
                                value={row.edited.evidence}
                                onChange={(e) => updateRow(row.id, { edited: { evidence: e.target.value } })}
                                className="min-h-[110px]"
                              />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-slate-800">{row.evidence || 'No evidence available.'}</p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Critic Signals</div>
                            {typeof row.criticScore === 'number' || row.criticFeedback || row.criticChecks.length > 0 ? (
                              <div className="space-y-3 text-sm text-slate-800">
                                <div className="flex items-center gap-3 text-xs text-slate-600">
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">Score: {typeof row.criticScore === 'number' ? row.criticScore.toFixed(2) : 'N/A'}</span>
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">Checks: {row.criticChecks.length}</span>
                                </div>
                                {row.criticFeedback && (
                                  <p className="whitespace-pre-wrap text-sm text-slate-700">{row.criticFeedback}</p>
                                )}
                                {row.criticChecks.length > 0 && (
                                  <div className="space-y-2">
                                    {row.criticChecks.slice(0, 10).map((check, checkIndex) => (
                                      <div key={`${row.id}-critic-${checkIndex}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-medium">{check.criterion || `Criterion ${checkIndex + 1}`}</span>
                                          <span className="rounded-full border border-slate-200 px-2 py-0.5">{String(check.verdict || '').toUpperCase() || 'N/A'}</span>
                                        </div>
                                        {check.reason && <div className="mt-1 text-slate-600">{check.reason}</div>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-slate-800">No critic signals provided.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <div className="rounded-3xl border border-white/70 bg-white/90 backdrop-blur p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Review Summary</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Questions</span>
                  <span className="font-semibold text-slate-900">{rows.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Highlighted</span>
                  <span className="font-semibold text-emerald-700">{selectedCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Reference Answers</span>
                  <span className="font-semibold text-indigo-700">{referenceCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Source Files</span>
                  <span className="font-semibold text-slate-900">{sourceCount}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  GitHub synthesis questions already include reference answers and source files. Use this page to correct them before they enter the assessment flow.
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/70 bg-white/90 backdrop-blur p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Pipeline Signals</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Assessment</span>
                  <span className="font-semibold">{summary?.assessment ? 'Available' : 'Not available'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Archetypes</span>
                  <span className="font-semibold">{Array.isArray(summary?.archetypes) ? summary.archetypes.length : 0}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Analysis Questions</span>
                  <span className="font-semibold">{analysisQuestions.length}</span>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
                  This page mirrors the generated-question review workflow while staying anchored to the GitHub analysis context.
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/70 bg-white/90 backdrop-blur p-5 shadow-sm space-y-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Preview only. No approval or publish action is required for GitHub questions.
              </div>
              <Button className="w-full" onClick={exportReview}>
                <Download className="mr-2 h-4 w-4" />
                Export Preview
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate(-1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Candidate Profile
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}