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
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Edit3, Save, RotateCcw, Sparkles, ShieldAlert, ListChecks
} from 'lucide-react';
import { api } from '../../../services/api';

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
  needs_review: boolean;
  critic_score: number;
  critic_feedback: string | null;
  retry_count: number;
}

interface DraftReviewData {
  job_id: string;
  import_type: string;
  source_filename: string | null;
  critic_stats: { approved: number; flagged: number; rejected: number; total_retries: number } | null;
  questions: DraftQuestion[];
}

interface ReviewState {
  question: DraftQuestion;
  selected: boolean;
  expanded: boolean;
  editing: boolean;
  edited: DraftQuestion;
}

interface Props {
  jobId: string;
  onBack: () => void;
  onApproved: () => void;
}

const difficultyClass: Record<string, string> = {
  Easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Hard: 'bg-rose-50 text-rose-700 border-rose-200',
};

// ─── Component ────────────────────────────────────────────────────────────────
export function QuestionImportReview({ jobId, onBack, onApproved }: Props) {
  const [data, setData] = useState<DraftReviewData | null>(null);
  const [rows, setRows] = useState<ReviewState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<{ imported_count: number; message: string } | null>(null);

  // ── Load draft questions ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.recruiter.getDraftQuestions(jobId);
      setData(d);
      setRows(
        d.questions.map((q: DraftQuestion) => ({
          question: q,
          selected: !q.needs_review || q.critic_score >= 0.4, // auto-select passing questions
          expanded: false,
          editing: false,
          edited: { ...q },
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load draft questions');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleAll = () => {
    const allSelected = rows.every(r => r.selected);
    setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  const toggleRow = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  };

  const toggleExpand = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, expanded: !r.expanded } : r));
  };

  const startEdit = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, editing: true, edited: { ...r.question } } : r));
  };

  const saveEdit = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, editing: false, question: { ...r.edited } } : r));
  };

  const discardEdit = (i: number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, editing: false, edited: { ...r.question } } : r));
  };

  const updateEdited = (i: number, field: keyof DraftQuestion, value: any) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, edited: { ...r.edited, [field]: value } } : r));
  };

  const handleApprove = async () => {
    const selected = rows.filter(r => r.selected).map(r => r.question);
    if (selected.length === 0) return;
    setIsApproving(true);
    try {
      const result = await api.recruiter.approveImportQuestions(jobId, selected);
      setApproveResult(result);
      setTimeout(() => { onApproved(); }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to import questions');
    } finally {
      setIsApproving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedCount = rows.filter(r => r.selected).length;

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

  const stats = data?.critic_stats;

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
              Import Staging Review
            </h2>
            <p className="text-[14px] text-[#6b7280] mt-1">
              {data?.source_filename ? `${data.source_filename} · ` : ''}
              {rows.length} generated question{rows.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-3 shadow-sm min-w-[240px]">
            <div className="text-[12px] text-[#6b7280] uppercase tracking-wide mb-1">Selection Summary</div>
            <div className="text-[24px] font-semibold text-[#111827]">{selectedCount}/{rows.length}</div>
            <div className="text-[13px] text-[#6b7280]">Questions selected for import</div>
          </div>
        </div>
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

      <div className="bg-white border border-[#e5e7eb] rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-[#f3f4f6] flex flex-wrap items-center gap-3">
          <button
            onClick={toggleAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] border border-[#d1d5db] text-[#374151] text-[13px] hover:bg-[#f9fafb]"
          >
            <ListChecks size={15} />
            {rows.every(r => r.selected) ? 'Deselect All' : 'Select All'}
          </button>

          <div className="text-[13px] text-[#6b7280]">{selectedCount} of {rows.length} selected</div>
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
        {rows.map((row, i) => (
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
                  <span className="text-[12px] text-[#6b7280]">Category: {row.question.category || 'Uncategorized'}</span>
                  <span className="text-[12px] text-[#6b7280]">Critic score: {row.question.critic_score.toFixed(2)}</span>
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

                {row.question.type === 'mcq' && row.question.options && (
                  <div>
                    <div className="text-[12px] font-semibold text-[#6b7280] mb-2 uppercase tracking-wide">Options</div>
                    {row.question.options.map((opt, optI) => (
                      <div key={optI} className={`flex items-start gap-2 p-2.5 rounded-[10px] border mb-2 ${optI === row.question.correct_answer ? 'border-emerald-300 bg-emerald-50' : 'border-[#e5e7eb] bg-white'}`}>
                        {optI === row.question.correct_answer
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                          : <XCircle className="w-4 h-4 text-[#9ca3af] mt-0.5" />}
                        <span className="text-[13px] text-[#1f2937]">{opt}</span>
                      </div>
                    ))}
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
                  <div className="text-[13px] text-[#6b7280]">
                    <span className="font-semibold text-[#4b5563]">Explanation:</span> {row.question.explanation}
                  </div>
                )}
                {row.question.reference_answer && (
                  <div className="text-[13px] text-[#6b7280]">
                    <span className="font-semibold text-[#4b5563]">Reference answer:</span> {row.question.reference_answer}
                  </div>
                )}
                {row.question.evidence && (
                  <div className="text-[13px] text-[#6b7280]">
                    <span className="font-semibold text-[#4b5563]">Evidence:</span> {row.question.evidence}
                  </div>
                )}
                {row.question.rubric && (
                  <div className="text-[13px] text-[#6b7280]">
                    <span className="font-semibold text-[#4b5563]">Rubric:</span> {row.question.rubric}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

          {rows.length === 0 && (
            <div className="p-10 text-center border border-dashed border-[#d1d5db] rounded-xl bg-[#fafafa]">
              <p className="text-[15px] font-medium text-[#374151]">No draft questions available for this import.</p>
              <p className="text-[13px] text-[#6b7280] mt-1">Try running another import or verify AI generation settings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
