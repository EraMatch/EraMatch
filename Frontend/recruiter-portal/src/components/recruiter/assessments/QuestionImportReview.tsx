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
  ChevronDown, ChevronUp, Edit3, Save, RotateCcw
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

// ─── Helper: difficulty badge color ──────────────────────────────────────────
const DIFF_COLORS: Record<string, string> = {
  Easy: '#10b981',
  Medium: '#f59e0b',
  Hard: '#ef4444',
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--text-muted, #888)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ marginRight: '0.5rem' }} /> Loading draft questions…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <AlertTriangle className="w-8 h-8 mx-auto" style={{ color: '#ef4444', marginBottom: '0.5rem' }} />
        <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>
        <button onClick={onBack} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: 'var(--accent-purple, #8b5cf6)', color: '#fff', cursor: 'pointer' }}>
          Go Back
        </button>
      </div>
    );
  }

  if (approveResult) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: '1rem', color: 'var(--text-primary, #fff)' }}>
        <CheckCircle2 className="w-12 h-12" style={{ color: '#10b981' }} />
        <h3 style={{ margin: 0 }}>{approveResult.message}</h3>
        <p style={{ margin: 0, color: 'var(--text-muted, #888)' }}>Redirecting back to Question Bank…</p>
      </div>
    );
  }

  const stats = data?.critic_stats;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', padding: 0 }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary, #fff)', fontSize: '1.2rem', fontWeight: 700 }}>
            Staging Review
          </h2>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted, #888)' }}>
            {data?.source_filename && <><strong>{data.source_filename}</strong> · </>}
            {rows.length} questions generated
          </p>
        </div>
      </div>

      {/* Critic stats bar */}
      {stats && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Passed', value: stats.approved, color: '#10b981' },
            { label: 'Flagged', value: stats.flagged, color: '#f59e0b' },
            { label: 'Rejected', value: stats.rejected, color: '#ef4444' },
            { label: 'Total Retries', value: stats.total_retries, color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: `${s.color}18`, border: `1px solid ${s.color}30`, fontSize: '0.82rem', color: s.color, fontWeight: 600 }}>
              {s.value} {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button
          onClick={toggleAll}
          style={{ fontSize: '0.82rem', background: 'none', border: '1px solid var(--border, rgba(255,255,255,0.15))', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', cursor: 'pointer', color: 'var(--text-primary, #fff)' }}
        >
          {rows.every(r => r.selected) ? 'Deselect All' : 'Select All'}
        </button>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #888)' }}>
          {selectedCount} of {rows.length} selected
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleApprove}
          disabled={selectedCount === 0 || isApproving}
          style={{
            padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none',
            background: selectedCount === 0 ? 'var(--border, rgba(255,255,255,0.1))' : '#10b981',
            color: '#fff', fontWeight: 600, fontSize: '0.9rem',
            cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}
        >
          {isApproving ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><CheckCircle2 className="w-4 h-4" /> Import {selectedCount} Question{selectedCount !== 1 ? 's' : ''}</>}
        </button>
      </div>

      {/* Question cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              borderRadius: '0.75rem', overflow: 'hidden',
              border: `1.5px solid ${row.selected ? 'var(--accent-purple, #8b5cf6)' : 'var(--border, rgba(255,255,255,0.1))'}`,
              background: 'var(--card-bg, #1a1a2e)', transition: 'border-color 0.15s',
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem' }}>
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={row.selected}
                onChange={() => toggleRow(i)}
                style={{ flexShrink: 0, width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent-purple, #8b5cf6)' }}
              />

              {/* Type badge */}
              <span style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', flexShrink: 0 }}>
                {row.question.type.toUpperCase()}
              </span>

              {/* Critic warning badge */}
              {row.question.needs_review && (
                <span title={row.question.critic_feedback || 'Flagged by critic'} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', cursor: 'help', flexShrink: 0 }}>
                  <AlertTriangle className="w-3 h-3" /> Needs Review
                </span>
              )}

              {/* Question text preview */}
              <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text-primary, #fff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {row.question.text}
              </span>

              {/* Difficulty */}
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: DIFF_COLORS[row.question.difficulty] || '#888', flexShrink: 0 }}>
                {row.question.difficulty}
              </span>

              {/* Edit button */}
              {!row.editing ? (
                <button onClick={() => { startEdit(i); if (!row.expanded) toggleExpand(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #888)', padding: '0.2rem', flexShrink: 0 }} title="Edit"><Edit3 className="w-4 h-4" /></button>
              ) : (
                <>
                  <button onClick={() => saveEdit(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: '0.2rem', flexShrink: 0 }} title="Save"><Save className="w-4 h-4" /></button>
                  <button onClick={() => discardEdit(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.2rem', flexShrink: 0 }} title="Discard"><RotateCcw className="w-4 h-4" /></button>
                </>
              )}

              {/* Expand toggle */}
              <button onClick={() => toggleExpand(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #888)', padding: '0.2rem', flexShrink: 0 }}>
                {row.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {/* Expanded detail */}
            {row.expanded && (
              <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border, rgba(255,255,255,0.06))' }}>

                {/* Full question text */}
                {row.editing ? (
                  <textarea
                    value={row.edited.text}
                    onChange={e => updateEdited(i, 'text', e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.88rem', resize: 'vertical', boxSizing: 'border-box', marginTop: '0.75rem' }}
                  />
                ) : (
                  <p style={{ margin: '0.75rem 0', fontSize: '0.88rem', color: 'var(--text-primary, #fff)', lineHeight: 1.6 }}>{row.question.text}</p>
                )}

                {/* MCQ options */}
                {row.question.type === 'mcq' && row.question.options && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #888)', marginBottom: '0.4rem' }}>OPTIONS</div>
                    {row.question.options.map((opt, optI) => (
                      <div key={optI} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', padding: '0.4rem 0.6rem', borderRadius: '0.4rem', background: optI === row.question.correct_answer ? 'rgba(16,185,129,0.12)' : 'transparent', border: optI === row.question.correct_answer ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent' }}>
                        {optI === row.question.correct_answer ? <CheckCircle2 className="w-4 h-4" style={{ color: '#10b981', flexShrink: 0 }} /> : <XCircle className="w-4 h-4" style={{ color: 'var(--text-muted, #888)', flexShrink: 0 }} />}
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary, #fff)' }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Category + Difficulty controls in edit mode */}
                {row.editing && (
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.25rem' }}>CATEGORY</label>
                      <input
                        value={row.edited.category}
                        onChange={e => updateEdited(i, 'category', e.target.value)}
                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.82rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.25rem' }}>DIFFICULTY</label>
                      <select
                        value={row.edited.difficulty}
                        onChange={e => updateEdited(i, 'difficulty', e.target.value)}
                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.82rem' }}
                      >
                        <option>Easy</option><option>Medium</option><option>Hard</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Critic feedback */}
                {row.question.needs_review && row.question.critic_feedback && (
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', marginTop: '0.5rem' }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b', marginTop: 2 }} />
                    <div style={{ fontSize: '0.8rem', color: '#f59e0b', lineHeight: 1.5 }}>
                      <strong>Critic feedback:</strong> {row.question.critic_feedback}
                      {row.question.retry_count > 0 && <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>({row.question.retry_count} retries)</span>}
                    </div>
                  </div>
                )}

                {/* Explanation / Rubric */}
                {row.question.explanation && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted, #888)', fontStyle: 'italic' }}>
                    <strong>Explanation:</strong> {row.question.explanation}
                  </div>
                )}
                {row.question.rubric && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted, #888)', fontStyle: 'italic' }}>
                    <strong>Rubric:</strong> {row.question.rubric}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
