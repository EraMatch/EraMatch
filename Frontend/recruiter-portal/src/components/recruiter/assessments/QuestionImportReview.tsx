/**
 * QuestionImportReview
 *
 * Full-page staging & review screen for AI-generated/extracted draft questions.
 * Shown when a recruiter clicks "Review" on a completed import job.
 *
 * Features:
 * - Shows all AI-generated draft questions as editable cards
 * - ⚠️ Critic flag badge on questions the Critic Agent marked as needs_review
 * - Per-question inline editing (text, options, correct answer, difficulty, category)
 * - Bulk select / deselect all
 * - "Import N Questions" commits selected to the live Question Bank
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Edit3, Save, RotateCcw, Sparkles, ShieldAlert, ListChecks, Copy, Download
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../services/api';
import { useDraftQuestions, useApproveImportQuestions } from '../../../hooks/questionBank/useQuestionBank';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DraftQuestion {
  type: string;
  text: string;
  difficulty: string;
  category: string;
  tags: string[];
  options: string[] | null;
  correct_answer: number | null;
  evidence: string | null;
  reference_answer: string | null;
  explanation: string | null;
  rubric: string | null;
  max_words: number | null;
  rubric_yes_no_checks?: Array<{
    id: number;
    check: string;
    weight: number;
  }> | null;
  needs_review: boolean;
  critic_score: number;
  critic_weighted_score?: number;
  critic_feedback: string | null;
  critic_checks?: Array<{
    id: number;
    criterion: string;
    verdict: 'YES' | 'NO';
    weight: number;
    weighted_value: number;
  }> | null;
  retry_count: number;
}

interface DraftReviewData {
  job_id: string;
  import_type: string;
  source_filename: string | null;
  critic_stats: {
    approved: number;
    flagged: number;
    rejected: number;
    total_retries: number;
    row_error_count?: number;
    sheet_name?: string | null;
    row_errors?: Array<{
      row?: number;
      error?: string;
      question_type?: string;
      question_text?: string;
    }>;
    auto_fix_enabled?: boolean;
    auto_fix_count?: number;
    auto_fix_actions?: Array<{
      row?: number;
      error?: string;
      fix_applied?: string;
    }>;
  } | null;
  questions: DraftQuestion[];
}

interface ReviewState {
  question: DraftQuestion;
  selected: boolean;
  expanded: boolean;
  editing: boolean;
  edited: DraftQuestion;
  rubricCheckErrors?: string[];
  rubricFormError?: string | null;
}

interface Props {
  jobId: string;
  onBack: () => void;
  onApproved: () => void;
}

type ReviewSubPage = 'mcq' | 'essay';

const difficultyClass: Record<string, string> = {
  Easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Hard: 'bg-rose-50 text-rose-700 border-rose-200',
};

const HIERARCHICAL_CHECK_TEMPLATES = [
  'Does the answer identify the primary concept correctly?',
  'Does the answer include key supporting evidence from the source?',
  'Does the answer avoid factual contradictions?',
  'Does the answer address all parts of the question prompt?',
  'Is the reasoning logically consistent from start to end?',
  'Does the answer use relevant terminology accurately?',
  'Is the explanation concise and free of unnecessary details?',
  'Does the answer avoid unsupported assumptions?',
  'Does the answer clearly differentiate similar concepts when needed?',
  'Does the final conclusion align with the provided evidence?',
];

// ─── Component ────────────────────────────────────────────────────────────────
export function QuestionImportReview({ jobId, onBack, onApproved }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<ReviewState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const approveImportMutation = useApproveImportQuestions();
  const { data: draftData, isLoading: loading, error: queryError } = useDraftQuestions(jobId);
  const data = draftData as DraftReviewData | null ?? null;
  const [approveResult, setApproveResult] = useState<{ imported_count: number; message: string } | null>(null);
  const [refiningQuestionIndex, setRefiningQuestionIndex] = useState<number | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [isDownloadingRowReport, setIsDownloadingRowReport] = useState(false);
  const [rowErrorTypeFilter, setRowErrorTypeFilter] = useState<string>('all');
  const [rowJumpInput, setRowJumpInput] = useState<string>('');
  const [rowJumpError, setRowJumpError] = useState<string | null>(null);
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);
  const [reviewSortMode, setReviewSortMode] = useState<'risk' | 'chronological'>('risk');

  const reviewPage: ReviewSubPage = useMemo(() => {
    const tab = searchParams.get('reviewType')?.toLowerCase();
    return tab === 'essay' ? 'essay' : 'mcq';
  }, [searchParams]);

  const setReviewPage = (nextPage: ReviewSubPage) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('reviewType', nextPage);
    setSearchParams(nextParams);
  };

  // ── Sync query data into rows state ──────────────────────────────────────
  useEffect(() => {
    if (queryError) {
      setError((queryError as any)?.message || 'Failed to load draft questions');
    }
  }, [queryError]);

  useEffect(() => {
    if (!draftData) return;
    const d = draftData as DraftReviewData;
    setRows(
      d.questions.map((q: DraftQuestion) => ({
        question: q,
        selected: !q.needs_review || q.critic_score >= 0.4,
        expanded: false,
        editing: false,
        edited: { ...q },
        rubricCheckErrors: [],
        rubricFormError: null,
      }))
    );
  }, [draftData]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleRow = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  };

  const toggleExpand = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, expanded: !r.expanded } : r));
  };

  const startEdit = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? {
      ...r,
      editing: true,
      edited: { ...r.question },
      rubricCheckErrors: [],
      rubricFormError: null,
    } : r));
  };

  const saveEdit = (i: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;

      const isEssay = (r.edited.type || '').toLowerCase() === 'essay';
      const checks = r.edited.rubric_yes_no_checks || [];

      if (isEssay) {
        const errors = checks.map((check) => {
          if (!(check.check || '').trim()) return 'Question text is required';
          if (!Number.isFinite(check.weight)) return 'Weight must be a number';
          if (check.weight < 0 || check.weight > 1) return 'Weight must be between 0 and 1';
          return '';
        });

        const totalWeight = checks.reduce((sum, check) => sum + (Number.isFinite(check.weight) ? check.weight : 0), 0);
        const hasRowErrors = errors.some(Boolean);
        const weightMismatch = Math.abs(totalWeight - 1) > 0.001;

        if (hasRowErrors || weightMismatch) {
          return {
            ...r,
            rubricCheckErrors: errors,
            rubricFormError: weightMismatch
              ? `Total weight must equal 1.00 (current: ${totalWeight.toFixed(2)}).`
              : 'Please fix invalid checklist rows before saving.',
          };
        }
      }

      return {
        ...r,
        editing: false,
        question: { ...r.edited },
        rubricCheckErrors: [],
        rubricFormError: null,
      };
    }));
  };

  const discardEdit = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? {
      ...r,
      editing: false,
      edited: { ...r.question },
      rubricCheckErrors: [],
      rubricFormError: null,
    } : r));
  };

  const updateEdited = (i: number, field: keyof DraftQuestion, value: any) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, edited: { ...r.edited, [field]: value } } : r));
  };

  const updateRubricCheckText = (i: number, checkIndex: number, value: string) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = [...(r.edited.rubric_yes_no_checks || [])];
      if (!checks[checkIndex]) return r;
      checks[checkIndex] = { ...checks[checkIndex], check: value };
      const errors = [...(r.rubricCheckErrors || [])];
      errors[checkIndex] = value.trim() ? '' : 'Question text is required';
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: checks },
        rubricCheckErrors: errors,
      };
    }));
  };

  const updateRubricCheckWeight = (i: number, checkIndex: number, rawValue: string) => {
    const parsed = Number(rawValue);
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = [...(r.edited.rubric_yes_no_checks || [])];
      if (!checks[checkIndex]) return r;
      checks[checkIndex] = { ...checks[checkIndex], weight: clamped };
      const errors = [...(r.rubricCheckErrors || [])];
      errors[checkIndex] = '';
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: checks },
        rubricCheckErrors: errors,
      };
    }));
  };

  const addRubricCheck = (i: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = [...(r.edited.rubric_yes_no_checks || [])];
      const maxId = checks.reduce((m, c) => Math.max(m, c.id || 0), 0);
      checks.push({ id: maxId + 1, check: '', weight: 0.1 });
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: checks },
        rubricCheckErrors: [...(r.rubricCheckErrors || []), 'Question text is required'],
      };
    }));
  };

  const removeRubricCheck = (i: number, checkIndex: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = [...(r.edited.rubric_yes_no_checks || [])]
        .filter((_, currentIndex) => currentIndex !== checkIndex)
        .map((check, currentIndex) => ({ ...check, id: currentIndex + 1 }));
      const errors = [...(r.rubricCheckErrors || [])].filter((_, currentIndex) => currentIndex !== checkIndex);
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: checks },
        rubricCheckErrors: errors,
      };
    }));
  };

  const moveRubricCheck = (i: number, checkIndex: number, direction: 'up' | 'down') => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = [...(r.edited.rubric_yes_no_checks || [])];
      const errors = [...(r.rubricCheckErrors || [])];
      const nextIndex = direction === 'up' ? checkIndex - 1 : checkIndex + 1;
      if (!checks[checkIndex] || !checks[nextIndex]) return r;

      [checks[checkIndex], checks[nextIndex]] = [checks[nextIndex], checks[checkIndex]];
      [errors[checkIndex], errors[nextIndex]] = [errors[nextIndex], errors[checkIndex]];

      const normalizedChecks = checks.map((check, currentIndex) => ({ ...check, id: currentIndex + 1 }));
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: normalizedChecks },
        rubricCheckErrors: errors,
      };
    }));
  };

  const duplicateRubricCheck = (i: number, checkIndex: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = [...(r.edited.rubric_yes_no_checks || [])];
      if (!checks[checkIndex]) return r;
      checks.splice(checkIndex + 1, 0, { ...checks[checkIndex], id: checks[checkIndex].id + 1 });
      const normalizedChecks = checks.map((check, currentIndex) => ({ ...check, id: currentIndex + 1 }));
      const errors = [...(r.rubricCheckErrors || [])];
      errors.splice(checkIndex + 1, 0, '');
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: normalizedChecks },
        rubricCheckErrors: errors,
      };
    }));
  };

  const normalizeRubricWeights = (i: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = [...(r.edited.rubric_yes_no_checks || [])];
      if (checks.length === 0) return r;

      const baseWeight = Number((1 / checks.length).toFixed(2));
      const normalized = checks.map((check, currentIndex) => ({
        ...check,
        id: currentIndex + 1,
        weight: currentIndex === checks.length - 1
          ? Number((1 - baseWeight * (checks.length - 1)).toFixed(2))
          : baseWeight,
      }));

      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: normalized },
      };
    }));
  };

  const resetRubricChecksToAiDefault = (i: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const base = (r.question.rubric_yes_no_checks || []).map((check, currentIndex) => ({
        ...check,
        id: currentIndex + 1,
      }));
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: base },
        rubricCheckErrors: [],
        rubricFormError: null,
      };
    }));
  };

  const applyRubricTemplateChecks = (i: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const checks = HIERARCHICAL_CHECK_TEMPLATES.map((check, currentIndex) => ({
        id: currentIndex + 1,
        check,
        weight: 0.1,
      }));
      return {
        ...r,
        edited: { ...r.edited, rubric_yes_no_checks: checks },
        rubricCheckErrors: Array.from({ length: checks.length }, () => ''),
        rubricFormError: null,
      };
    }));
  };

  const handleApprove = async () => {
    const selected = rows.filter(r => r.selected).map(r => r.question);
    if (selected.length === 0) return;
    setIsApproving(true);
    try {
      const result = await approveImportMutation.mutateAsync({ jobId, selected });
      setApproveResult(result as any);
      setTimeout(() => { onApproved(); }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to import questions');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRefineQuestion = async (rowIndex: number) => {
    setRefiningQuestionIndex(rowIndex);
    setRefineError(null);
    try {
      const result = await api.recruiter.refineImportQuestion(jobId, rowIndex);
      const refined = result?.refined_question;
      if (!refined || typeof refined !== 'object') {
        throw new Error('AI returned an invalid refined question payload');
      }

      setRows(prev => prev.map((r, idx) => {
        if (idx !== rowIndex) return r;
        return {
          ...r,
          question: { ...refined },
          edited: { ...refined },
          rubricCheckErrors: [],
          rubricFormError: null,
          editing: false,
        };
      }));
    } catch (err: any) {
      setRefineError(err?.message || 'Failed to refine question from critic feedback');
    } finally {
      setRefiningQuestionIndex(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const getNormalizedType = (type?: string) => (type || '').trim().toLowerCase();
  const isMcqQuestion = (type?: string) => getNormalizedType(type) === 'mcq';

  const computeRiskScore = useCallback((q: DraftQuestion) => {
    const criticWeighted = typeof q.critic_weighted_score === 'number' ? q.critic_weighted_score : q.critic_score;
    const qualityPenalty = Math.max(0, (1 - Number(criticWeighted || 0)) * 100);
    const needsReviewPenalty = q.needs_review ? 60 : 0;
    const difficultyBonus = q.difficulty === 'Hard' ? 20 : q.difficulty === 'Medium' ? 10 : 0;
    const typeBonus = getNormalizedType(q.type) === 'essay' ? 8 : 4;
    const critiquePenalty = (q.critic_checks || []).filter((c) => c.verdict === 'NO').length * 6;
    return qualityPenalty + needsReviewPenalty + difficultyBonus + typeBonus + critiquePenalty;
  }, []);

  const mcqCount = rows.filter(r => isMcqQuestion(r.question.type)).length;
  const essayCount = rows.length - mcqCount;

  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => reviewPage === 'mcq' ? isMcqQuestion(row.question.type) : !isMcqQuestion(row.question.type))
    .sort((a, b) => {
      if (reviewSortMode === 'chronological') return a.index - b.index;
      return computeRiskScore(b.row.question) - computeRiskScore(a.row.question);
    });

  const visibleCount = visibleRows.length;
  const visibleSelectedCount = visibleRows.filter(({ row }) => row.selected).length;
  const allVisibleSelected = visibleCount > 0 && visibleRows.every(({ row }) => row.selected);
  const selectedCount = rows.filter(r => r.selected).length;

  const stats = data?.critic_stats;
  const csvRowErrors = useMemo(() => {
    if (!stats?.row_errors || !Array.isArray(stats.row_errors)) return [];
    return stats.row_errors
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        row: Number(item.row || 0),
        error: String(item.error || 'Unknown validation error'),
        question_type: String(item.question_type || ''),
        question_text: String(item.question_text || ''),
      }))
      .filter((item) => item.row > 0);
  }, [stats]);

  const rowErrorTypes = useMemo(() => {
    const unique = Array.from(new Set(csvRowErrors.map((item) => item.error))).filter(Boolean);
    return ['all', ...unique];
  }, [csvRowErrors]);

  useEffect(() => {
    const urlJob = searchParams.get('rowErrorFilterJob');
    const urlFilter = searchParams.get('rowErrorFilter');
    if (urlJob === jobId && urlFilter && rowErrorTypes.includes(urlFilter)) {
      setRowErrorTypeFilter(urlFilter);
      return;
    }
    setRowErrorTypeFilter('all');
  }, [searchParams, jobId, rowErrorTypes]);

  const filteredRowErrors = useMemo(() => {
    if (rowErrorTypeFilter === 'all') return csvRowErrors;
    return csvRowErrors.filter((item) => item.error === rowErrorTypeFilter);
  }, [csvRowErrors, rowErrorTypeFilter]);

  const toggleVisibleRows = () => {
    if (visibleRows.length === 0) return;
    setRows(prev => prev.map((r, idx) => {
      const isVisible = visibleRows.some(vr => vr.index === idx);
      if (!isVisible) return r;
      return { ...r, selected: !allVisibleSelected };
    }));
  };

  if (loading) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center">
        <div className="inline-flex items-center gap-3 text-[#6b7280]">
          <Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" />
          <span className="text-[15px] font-medium">Loading draft questions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[720px] mx-auto mt-8 bg-white border border-rose-200 rounded-2xl p-8 shadow-sm text-center">
        <AlertTriangle className="w-10 h-10 mx-auto text-rose-600 mb-3" />
        <h3 className="text-[18px] font-semibold text-[#111827] mb-1">Unable To Load Draft Questions</h3>
        <p className="text-[14px] text-rose-600 mb-6">{error}</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#6366f1] text-white text-[14px] hover:bg-[#5558e3]"
        >
          <ArrowLeft size={15} /> Back To Question Bank
        </button>
      </div>
    );
  }

  if (approveResult) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center">
        <div className="w-full max-w-[640px] bg-white border border-emerald-200 rounded-2xl p-8 shadow-sm text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-4" />
          <h3 className="text-[20px] font-semibold text-[#111827] mb-2">{approveResult.message}</h3>
          <p className="text-[14px] text-[#6b7280]">Redirecting back to Question Bank...</p>
        </div>
      </div>
    );
  }

  const setRowErrorFilterAndPersist = (nextFilter: string) => {
    setRowErrorTypeFilter(nextFilter);
    const nextParams = new URLSearchParams(searchParams);
    if (nextFilter === 'all') {
      nextParams.delete('rowErrorFilter');
      nextParams.delete('rowErrorFilterJob');
    } else {
      nextParams.set('rowErrorFilter', nextFilter);
      nextParams.set('rowErrorFilterJob', jobId);
    }
    setSearchParams(nextParams);
  };

  const exportFilteredRowErrors = () => {
    if (filteredRowErrors.length === 0) {
      setRowJumpError('No rows to export for the current filter.');
      return;
    }

    const escapeCell = (value: string) => `"${(value || '').replace(/"/g, '""')}"`;
    const header = ['row', 'error', 'question_type', 'question_text'];
    const body = filteredRowErrors.map((item) => [
      String(item.row),
      item.error,
      item.question_type || '',
      item.question_text || '',
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((cell) => escapeCell(String(cell))).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `import_row_errors_filtered_${jobId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const copyRowErrorText = async (item: { row: number; error: string; question_type?: string; question_text?: string }, index: number) => {
    const rowText = `Row ${item.row} | Error: ${item.error} | Type: ${item.question_type || '-'} | Question: ${item.question_text || '-'}`;
    try {
      await navigator.clipboard.writeText(rowText);
      const key = `${item.row}-${index}`;
      setCopiedRowKey(key);
      setTimeout(() => setCopiedRowKey((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      setError('Unable to copy row error text from browser clipboard.');
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[#6b7280] hover:text-[#111827] text-[14px] mb-4"
        >
          <ArrowLeft size={16} /> Back To Question Bank
        </button>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-[30px] font-medium text-[#111827] flex items-center gap-3">
              <Sparkles className="text-[#6366f1]" size={30} />
              Import Staging Review · {reviewPage === 'mcq' ? 'MCQ' : 'Essay'}
            </h2>
            <p className="text-[14px] text-[#6b7280] mt-1">
              {data?.source_filename ? `${data.source_filename} · ` : ''}
              {rows.length} generated question{rows.length !== 1 ? 's' : ''}
            </p>
            {data?.import_type === 'csv' && stats?.sheet_name && (
              <p className="text-[12px] text-[#94a3b8] mt-1">Sheet: {stats.sheet_name}</p>
            )}
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-3 shadow-sm min-w-[240px]">
            <div className="text-[12px] text-[#6b7280] uppercase tracking-wide mb-1">Selection Summary</div>
            <div className="text-[24px] font-semibold text-[#111827]">{visibleSelectedCount}/{visibleCount}</div>
            <div className="text-[13px] text-[#6b7280]">Selected in this review page</div>
            <div className="text-[12px] text-[#9ca3af] mt-1">Overall selected: {selectedCount}/{rows.length}</div>
          </div>
        </div>

        {data?.import_type === 'csv' && (stats?.row_error_count || 0) > 0 && (
          <div className="mt-3">
            <button
              onClick={async () => {
                setIsDownloadingRowReport(true);
                try {
                  await api.recruiter.downloadImportRowErrorsReport(jobId);
                } catch (err: any) {
                  setError(err?.message || 'Failed to download row error report');
                } finally {
                  setIsDownloadingRowReport(false);
                }
              }}
              disabled={isDownloadingRowReport}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] border border-amber-300 text-amber-700 text-[13px] font-medium hover:bg-amber-50 disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {isDownloadingRowReport ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />}
              {isDownloadingRowReport ? 'Downloading row report...' : `Download Row Error Report (${stats?.row_error_count || 0})`}
            </button>
          </div>
        )}
      </div>

      <div className="mb-5 rounded-2xl border border-[#e5e7eb] bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setReviewPage('mcq')}
            className={`rounded-xl px-4 py-3 text-left border transition-colors ${
              reviewPage === 'mcq'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-transparent bg-[#f8fafc] text-[#4b5563] hover:bg-[#eef2ff]'
            }`}
          >
            <div className="text-[12px] uppercase tracking-wide font-semibold">MCQ Review Page</div>
            <div className="text-[20px] font-semibold mt-1">{mcqCount}</div>
            <div className="text-[12px] opacity-80">Multiple choice draft questions</div>
          </button>

          <button
            onClick={() => setReviewPage('essay')}
            className={`rounded-xl px-4 py-3 text-left border transition-colors ${
              reviewPage === 'essay'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-transparent bg-[#f8fafc] text-[#4b5563] hover:bg-[#eef2ff]'
            }`}
          >
            <div className="text-[12px] uppercase tracking-wide font-semibold">Essay Review Page</div>
            <div className="text-[20px] font-semibold mt-1">{essayCount}</div>
            <div className="text-[12px] opacity-80">Essay and open-ended draft questions</div>
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-sm flex flex-wrap items-center gap-2">
        <span className="text-[12px] uppercase tracking-wide text-[#6b7280] font-semibold">Queue Priority</span>
        <button
          onClick={() => setReviewSortMode('risk')}
          className={`px-3 py-1.5 rounded-full text-[12px] border ${reviewSortMode === 'risk' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-[#f8fafc] text-[#4b5563] border-[#e5e7eb]'}`}
        >
          Risk/Impact First
        </button>
        <button
          onClick={() => setReviewSortMode('chronological')}
          className={`px-3 py-1.5 rounded-full text-[12px] border ${reviewSortMode === 'chronological' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-[#f8fafc] text-[#4b5563] border-[#e5e7eb]'}`}
        >
          Chronological
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="text-[12px] text-emerald-700">Passed</div>
            <div className="text-[22px] font-semibold text-emerald-700">{stats.approved}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="text-[12px] text-amber-700">Flagged</div>
            <div className="text-[22px] font-semibold text-amber-700">{stats.flagged}</div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
            <div className="text-[12px] text-rose-700">Rejected</div>
            <div className="text-[22px] font-semibold text-rose-700">{stats.rejected}</div>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
            <div className="text-[12px] text-indigo-700">Total Retries</div>
            <div className="text-[22px] font-semibold text-indigo-700">{stats.total_retries}</div>
          </div>
        </div>
      )}

      {data?.import_type === 'csv' && stats?.auto_fix_enabled && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="text-[14px] font-semibold text-emerald-800">Auto-fix Applied Before Review</div>
          <div className="text-[12px] text-emerald-700 mt-1">
            Applied fixes: {stats.auto_fix_count || 0}
          </div>
          {Array.isArray(stats.auto_fix_actions) && stats.auto_fix_actions.length > 0 && (
            <div className="mt-2 max-h-[140px] overflow-y-auto space-y-1">
              {stats.auto_fix_actions.slice(0, 12).map((item, idx) => (
                <div key={`auto-fix-${idx}`} className="text-[12px] text-emerald-800">
                  Row {item.row || '-'}: {item.fix_applied || item.error || 'Auto-fix applied'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data?.import_type === 'csv' && csvRowErrors.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <div className="text-[14px] font-semibold text-amber-800">Spreadsheet Row Validation Table</div>
              <div className="text-[12px] text-amber-700">{filteredRowErrors.length} visible row issue(s) • {csvRowErrors.length} total</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rowErrorTypeFilter}
                onChange={(e) => {
                  setRowErrorFilterAndPersist(e.target.value);
                  setRowJumpError(null);
                }}
                className="h-[34px] px-2 rounded-[8px] border border-amber-300 bg-white text-[12px] text-amber-900"
              >
                {rowErrorTypes.map((errType) => (
                  <option key={errType} value={errType}>
                    {errType === 'all' ? 'All Error Types' : errType}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                value={rowJumpInput}
                onChange={(e) => {
                  setRowJumpInput(e.target.value);
                  setRowJumpError(null);
                }}
                placeholder="Row #"
                className="h-[34px] w-[92px] px-2 rounded-[8px] border border-amber-300 bg-white text-[12px] text-amber-900"
              />

              <button
                onClick={() => {
                  const rowNum = Number(rowJumpInput);
                  if (!Number.isInteger(rowNum) || rowNum <= 0) {
                    setRowJumpError('Enter a valid row number.');
                    return;
                  }

                  const existsInView = filteredRowErrors.some((item) => item.row === rowNum);
                  if (!existsInView) {
                    setRowJumpError('Row is not in the current filtered view.');
                    return;
                  }

                  setHighlightedRow(rowNum);
                  const target = document.getElementById(`row-error-${rowNum}`);
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className="h-[34px] px-3 rounded-[8px] border border-amber-300 bg-white text-[12px] font-medium text-amber-800 hover:bg-amber-100"
              >
                Jump To Row
              </button>

              <button
                onClick={exportFilteredRowErrors}
                className="h-[34px] px-3 rounded-[8px] border border-amber-300 bg-white text-[12px] font-medium text-amber-800 hover:bg-amber-100 inline-flex items-center gap-1"
              >
                <Download size={14} />
                Export Filtered
              </button>
            </div>
          </div>

          {rowJumpError && (
            <div className="mb-3 text-[12px] text-rose-700">{rowJumpError}</div>
          )}

          <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
            <div className="max-h-[280px] overflow-y-auto">
              <table className="min-w-full text-left">
                <thead className="bg-amber-100/70 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-amber-900">Row</th>
                    <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-amber-900">Error</th>
                    <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-amber-900">Type</th>
                    <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-amber-900">Question Preview</th>
                    <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-amber-900">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRowErrors.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-[12px] text-amber-700">No rows match this error filter.</td>
                    </tr>
                  ) : (
                    filteredRowErrors.map((item, index) => (
                      <tr
                        key={`row-error-${item.row}-${index}`}
                        id={`row-error-${item.row}`}
                        className={highlightedRow === item.row ? 'bg-amber-200/60' : 'border-t border-amber-100'}
                      >
                        <td className="px-3 py-2 text-[12px] font-semibold text-amber-900">{item.row}</td>
                        <td className="px-3 py-2 text-[12px] text-amber-900">{item.error}</td>
                        <td className="px-3 py-2 text-[12px] text-amber-900 uppercase">{item.question_type || '-'}</td>
                        <td className="px-3 py-2 text-[12px] text-amber-900 max-w-[420px] truncate">{item.question_text || '-'}</td>
                        <td className="px-3 py-2 text-[12px] text-amber-900">
                          <button
                            onClick={() => copyRowErrorText(item, index)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-300 hover:bg-amber-100"
                          >
                            <Copy size={12} />
                            {copiedRowKey === `${item.row}-${index}` ? 'Copied' : 'Copy'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#e5e7eb] rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-[#f3f4f6] flex flex-wrap items-center gap-3">
          <button
            onClick={toggleVisibleRows}
            disabled={visibleCount === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] border border-[#d1d5db] text-[#374151] text-[13px] hover:bg-[#f9fafb]"
          >
            <ListChecks size={15} />
            {allVisibleSelected ? 'Deselect Visible' : 'Select Visible'}
          </button>

          <div className="text-[13px] text-[#6b7280]">
            {visibleSelectedCount} of {visibleCount} selected in {reviewPage === 'mcq' ? 'MCQ' : 'Essay'} page
          </div>
          <div className="ml-auto" />

          <button
            onClick={handleApprove}
            disabled={selectedCount === 0 || isApproving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {isApproving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {isApproving ? 'Importing...' : `Import ${selectedCount} Question${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>

        <div className="p-4 space-y-3">
        {refineError && (
          <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            {refineError}
          </div>
        )}
        {visibleRows.map(({ row, index: i }) => (
          <div
            key={i}
            className={`rounded-xl border transition-colors overflow-hidden ${
              row.selected ? 'border-[#6366f1] bg-indigo-50/20' : 'border-[#e5e7eb] bg-white'
            }`}
          >
            <div className="px-4 py-3 flex items-start gap-3">
              <input
                type="checkbox"
                checked={row.selected}
                onChange={() => toggleRow(i)}
                className="mt-1 w-4 h-4 accent-[#6366f1]"
              />

              <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700 border border-indigo-200">
                {row.question.type.toUpperCase()}
              </span>

              {row.question.needs_review && (
                <span title={row.question.critic_feedback || 'Flagged by critic'} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                  <ShieldAlert size={13} /> Needs Review
                </span>
              )}

              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-[#111827] truncate mb-1">{row.question.text}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border ${difficultyClass[row.question.difficulty] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {row.question.difficulty}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md border border-rose-200 bg-rose-50 text-rose-700">
                    Risk: {computeRiskScore(row.question).toFixed(1)}
                  </span>
                  <span className="text-[12px] text-[#6b7280]">Category: {row.question.category || 'Uncategorized'}</span>
                  <span className="text-[12px] text-[#6b7280]">Critic score: {row.question.critic_score.toFixed(2)}</span>
                  {typeof row.question.critic_weighted_score === 'number' && (
                    <span className="text-[12px] text-[#6b7280]">Weighted: {row.question.critic_weighted_score.toFixed(2)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!row.editing ? (
                  <button
                    onClick={() => { startEdit(i); if (!row.expanded) toggleExpand(i); }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[#e5e7eb] text-[#6b7280] hover:text-[#111827] hover:bg-[#f9fafb]"
                    title="Edit"
                  >
                    <Edit3 size={14} />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => saveEdit(i)}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      title="Save"
                    >
                      <Save size={14} />
                    </button>
                    <button
                      onClick={() => discardEdit(i)}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50"
                      title="Discard"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </>
                )}

                <button
                  onClick={() => toggleExpand(i)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[#e5e7eb] text-[#6b7280] hover:text-[#111827] hover:bg-[#f9fafb]"
                  title={row.expanded ? 'Collapse' : 'Expand'}
                >
                  {row.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {row.expanded && (
              <div className="px-4 pb-4 pt-3 border-t border-[#eef0f3] space-y-3">
                {row.editing ? (
                  <textarea
                    value={row.edited.text}
                    onChange={e => updateEdited(i, 'text', e.target.value)}
                    rows={3}
                    className="w-full p-3 rounded-[10px] border border-[#d1d5db] text-[14px] text-[#111827] resize-y focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                  />
                ) : (
                  <p className="text-[14px] text-[#1f2937] leading-6">{row.question.text}</p>
                )}

                {row.question.type === 'mcq' && (row.editing ? row.edited.options : row.question.options) && (
                  <div>
                    <div className="text-[12px] font-semibold text-[#6b7280] mb-2 uppercase tracking-wide">Options</div>
                    {(row.editing ? row.edited.options : row.question.options)?.map((opt, optI) => (
                      <div key={optI} className={`flex items-start gap-2 p-2.5 rounded-[10px] border mb-2 ${optI === (row.editing ? row.edited.correct_answer : row.question.correct_answer) ? 'border-emerald-300 bg-emerald-50' : 'border-[#e5e7eb] bg-white'}`}>
                        {optI === (row.editing ? row.edited.correct_answer : row.question.correct_answer)
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                          : <XCircle className="w-4 h-4 text-[#9ca3af] mt-0.5" />}
                        <span className="text-[13px] text-[#1f2937]">{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!!row.question.rubric && (
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                    <div className="text-[12px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">Rubric</div>
                    <p className="text-[13px] text-[#1f2937] whitespace-pre-wrap leading-6">{row.question.rubric}</p>
                  </div>
                )}

                {!!row.question.reference_answer && (
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                    <div className="text-[12px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">Reference Answer</div>
                    <p className="text-[13px] text-[#1f2937] whitespace-pre-wrap leading-6">{row.question.reference_answer}</p>
                  </div>
                )}

                {!!row.question.evidence && (
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                    <div className="text-[12px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">Evidence</div>
                    <p className="text-[13px] text-[#1f2937] whitespace-pre-wrap leading-6">{row.question.evidence}</p>
                  </div>
                )}

                {(!!row.question.critic_checks?.length || (row.question.type?.toLowerCase() === 'essay' && !!row.question.rubric_yes_no_checks?.length)) && (
                  <div
                    className={`grid grid-cols-1 gap-3 items-start ${
                      row.question.type?.toLowerCase() === 'essay' && !!row.question.rubric_yes_no_checks?.length
                        ? 'md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'
                        : 'md:grid-cols-1'
                    }`}
                  >
                    {row.question.type?.toLowerCase() === 'essay' && !!row.question.rubric_yes_no_checks?.length && (
                      <div className="rounded-[10px] border border-indigo-200 bg-indigo-50/40 p-3 h-full">
                        <div className="text-[12px] font-semibold text-indigo-800 mb-2 uppercase tracking-wide">Hierarchical Rubric YES/NO Checks (10)</div>
                        <p className="text-[12px] text-indigo-700 mb-2">
                          Recruiter can use these binary checks to evaluate answers with lower scoring variance.
                        </p>
                        <div className="space-y-2">
                          {row.question.rubric_yes_no_checks.map((check) => (
                            <div key={check.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_96px] items-start gap-2 rounded-md border border-indigo-100 bg-white px-3 py-2">
                              <div className="text-[12px] text-[#1f2937] leading-5 min-w-0">
                                {check.id}. {check.check}
                              </div>
                              <div className="md:text-right text-left shrink-0">
                                <span className="inline-flex text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                                w={check.weight.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!!row.question.critic_checks?.length && (
                      <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3 h-full">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wide">Critic Checklist (10 Tests)</div>
                          <button
                            type="button"
                            onClick={() => handleRefineQuestion(i)}
                            disabled={refiningQuestionIndex === i || row.editing || !row.question.critic_checks.some(c => c.verdict === 'NO')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-indigo-200 text-indigo-700 text-[11px] font-medium hover:bg-indigo-50 disabled:opacity-50"
                            title="Refine question from failed critic checks"
                          >
                            {refiningQuestionIndex === i ? <Loader2 size={12} className="animate-spin" /> : null}
                            Refine Failed ({row.question.critic_checks.filter(c => c.verdict === 'NO').length})
                          </button>
                        </div>
                        <div className="space-y-2">
                          {row.question.critic_checks.map((check) => {
                            const passed = check.verdict === 'YES';
                            return (
                              <div key={check.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_96px_110px] items-start gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-[12px] text-[#374151] font-medium leading-5">{check.id}. {check.criterion}</div>
                                </div>
                                <div className="md:text-center text-left">
                                  <div className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">w={check.weight.toFixed(2)}</div>
                                </div>
                                <div className="md:text-right text-left shrink-0">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {check.verdict}
                                  </span>
                                  <div className="text-[11px] text-[#6b7280] mt-1">Score: {check.weighted_value.toFixed(2)}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {row.question.type?.toLowerCase() === 'essay' && !row.question.critic_checks?.length && !row.question.rubric_yes_no_checks?.length && (
                  <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[12px] font-semibold text-amber-800 mb-1 uppercase tracking-wide">Critic Checklist Unavailable</div>
                    <p className="text-[13px] text-amber-700 leading-6">
                      This question was generated from a legacy import job that did not store the 10 YES/NO critic checks.
                      Re-run the import to get the full weighted checklist.
                    </p>
                  </div>
                )}

                {row.editing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-[#6b7280] font-semibold mb-1 block">Category</label>
                      <input
                        value={row.edited.category}
                        onChange={e => updateEdited(i, 'category', e.target.value)}
                        className="w-full h-[40px] px-3 rounded-[10px] border border-[#d1d5db] text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-[#6b7280] font-semibold mb-1 block">Difficulty</label>
                      <select
                        value={row.edited.difficulty}
                        onChange={e => updateEdited(i, 'difficulty', e.target.value)}
                        className="w-full h-[40px] px-3 rounded-[10px] border border-[#d1d5db] text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                      >
                        <option>Easy</option><option>Medium</option><option>Hard</option>
                      </select>
                    </div>
                  </div>
                )}

                {row.editing && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-[#6b7280] font-semibold mb-1 block">Evidence</label>
                      <textarea
                        value={row.edited.evidence || ''}
                        onChange={e => updateEdited(i, 'evidence', e.target.value)}
                        rows={2}
                        className="w-full p-3 rounded-[10px] border border-[#d1d5db] text-[13px] text-[#111827] resize-y focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                        placeholder="Material evidence supporting the expected answer"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-[#6b7280] font-semibold mb-1 block">Reference Answer</label>
                      <textarea
                        value={row.edited.reference_answer || ''}
                        onChange={e => updateEdited(i, 'reference_answer', e.target.value)}
                        rows={2}
                        className="w-full p-3 rounded-[10px] border border-[#d1d5db] text-[13px] text-[#111827] resize-y focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                        placeholder="Model answer that recruiter can refine"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-[#6b7280] font-semibold mb-1 block">Explanation</label>
                      <textarea
                        value={row.edited.explanation || ''}
                        onChange={e => updateEdited(i, 'explanation', e.target.value)}
                        rows={2}
                        className="w-full p-3 rounded-[10px] border border-[#d1d5db] text-[13px] text-[#111827] resize-y focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                        placeholder="Why this answer is correct"
                      />
                    </div>
                    {(row.edited.type === 'essay' || row.edited.type === 'code') && (
                      <div>
                        <label className="text-[11px] uppercase tracking-wide text-[#6b7280] font-semibold mb-1 block">Rubric</label>
                        <textarea
                          value={row.edited.rubric || ''}
                          onChange={e => updateEdited(i, 'rubric', e.target.value)}
                          rows={3}
                          className="w-full p-3 rounded-[10px] border border-[#d1d5db] text-[13px] text-[#111827] resize-y focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                          placeholder="Evaluation rubric"
                        />
                      </div>
                    )}

                    {row.edited.type === 'essay' && (
                      <div className="rounded-[10px] border border-indigo-200 bg-indigo-50/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                          <div className="text-[12px] font-semibold text-indigo-800 uppercase tracking-wide">Edit Hierarchical Rubric YES/NO Checks</div>
                          <div className="inline-flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => addRubricCheck(i)}
                              className="inline-flex items-center px-2.5 py-1.5 rounded-md border border-indigo-300 text-indigo-700 text-[12px] font-medium hover:bg-indigo-100"
                            >
                              + Add Check
                            </button>
                            <button
                              type="button"
                              onClick={() => normalizeRubricWeights(i)}
                              disabled={(row.edited.rubric_yes_no_checks || []).length === 0}
                              className="inline-flex items-center px-2.5 py-1.5 rounded-md border border-indigo-300 text-indigo-700 text-[12px] font-medium hover:bg-indigo-100 disabled:opacity-50"
                            >
                              Normalize Weights
                            </button>
                            <button
                              type="button"
                              onClick={() => resetRubricChecksToAiDefault(i)}
                              className="inline-flex items-center px-2.5 py-1.5 rounded-md border border-[#d1d5db] text-[#374151] text-[12px] font-medium hover:bg-white"
                            >
                              Reset To AI Default
                            </button>
                            <button
                              type="button"
                              onClick={() => applyRubricTemplateChecks(i)}
                              disabled={(row.edited.rubric_yes_no_checks || []).length > 0}
                              className="inline-flex items-center px-2.5 py-1.5 rounded-md border border-indigo-300 text-indigo-700 text-[12px] font-medium hover:bg-indigo-100 disabled:opacity-50"
                            >
                              Add 10-Template Checks
                            </button>
                          </div>
                        </div>

                        <div className="mb-2 text-[12px] text-indigo-700">
                          Total Weight: <span className="font-semibold">{(row.edited.rubric_yes_no_checks || []).reduce((sum, check) => sum + (Number.isFinite(check.weight) ? check.weight : 0), 0).toFixed(2)}</span>
                          {Math.abs((row.edited.rubric_yes_no_checks || []).reduce((sum, check) => sum + (Number.isFinite(check.weight) ? check.weight : 0), 0) - 1) > 0.001 && (
                            <span className="ml-2 text-amber-700 font-medium">Target is 1.00</span>
                          )}
                        </div>

                        {!!row.rubricFormError && (
                          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                            {row.rubricFormError}
                          </div>
                        )}

                        <div className="space-y-2">
                          {(row.edited.rubric_yes_no_checks || []).map((check, checkIndex) => (
                            <div key={`${check.id}-${checkIndex}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px] xl:grid-cols-[minmax(0,1fr)_120px_280px] items-start gap-2 rounded-md border border-indigo-100 bg-white px-3 py-2">
                              <div>
                                <input
                                  value={check.check}
                                  onChange={e => updateRubricCheckText(i, checkIndex, e.target.value)}
                                  className="w-full h-[36px] px-2.5 rounded-md border border-[#d1d5db] text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                                  placeholder={`Check ${checkIndex + 1} question`}
                                />
                                {!!row.rubricCheckErrors?.[checkIndex] && (
                                  <div className="text-[11px] text-rose-600 mt-1">{row.rubricCheckErrors[checkIndex]}</div>
                                )}
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.01}
                                value={check.weight}
                                onChange={e => updateRubricCheckWeight(i, checkIndex, e.target.value)}
                                className="w-full h-[36px] px-2.5 rounded-md border border-[#d1d5db] text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                                placeholder="Weight"
                              />
                              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-1 md:col-span-2 xl:col-span-1">
                                <button
                                  type="button"
                                  onClick={() => moveRubricCheck(i, checkIndex, 'up')}
                                  disabled={checkIndex === 0}
                                  className="h-[36px] w-full rounded-md border border-[#d1d5db] text-[#374151] text-[11px] font-medium hover:bg-[#f8fafc] disabled:opacity-40"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveRubricCheck(i, checkIndex, 'down')}
                                  disabled={checkIndex === (row.edited.rubric_yes_no_checks || []).length - 1}
                                  className="h-[36px] w-full rounded-md border border-[#d1d5db] text-[#374151] text-[11px] font-medium hover:bg-[#f8fafc] disabled:opacity-40"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => duplicateRubricCheck(i, checkIndex)}
                                  className="h-[36px] w-full rounded-md border border-indigo-200 text-indigo-700 text-[11px] font-medium hover:bg-indigo-50"
                                >
                                  Duplicate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRubricCheck(i, checkIndex)}
                                  className="h-[36px] w-full rounded-md border border-rose-200 text-rose-700 text-[11px] font-medium hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}

                          {(row.edited.rubric_yes_no_checks || []).length === 0 && (
                            <div className="rounded-md border border-dashed border-indigo-200 bg-white/70 px-3 py-3 text-[12px] text-indigo-700">
                              No rubric checks yet. Add checks and weights, then click Save.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {row.question.needs_review && row.question.critic_feedback && (
                  <div className="flex gap-2 p-3 rounded-[10px] bg-amber-50 border border-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5" />
                    <div className="text-[13px] text-amber-800">
                      <span className="font-semibold">Critic feedback:</span> {row.question.critic_feedback}
                      {row.question.retry_count > 0 && <span className="ml-1 text-amber-700">({row.question.retry_count} retries)</span>}
                    </div>
                  </div>
                )}

                {row.question.explanation && (
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                    <div className="text-[12px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">Explanation</div>
                    <p className="text-[13px] text-[#1f2937] whitespace-pre-wrap leading-6">{row.question.explanation}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

          {visibleRows.length === 0 && (
            <div className="p-10 text-center border border-dashed border-[#d1d5db] rounded-xl bg-[#fafafa]">
              <p className="text-[15px] font-medium text-[#374151]">
                No {reviewPage === 'mcq' ? 'MCQ' : 'Essay'} draft questions available in this import.
              </p>
              <p className="text-[13px] text-[#6b7280] mt-1">
                Switch to the other review page or run another import with mixed question types.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
