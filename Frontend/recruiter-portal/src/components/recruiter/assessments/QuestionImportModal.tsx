/**
 * QuestionImportModal
 *
 * A 3-step modal for importing questions into the Question Bank:
 *   Step 1 — Choose import path (Generative / Extract / CSV)
 *   Step 2 — Configure & upload file
 *   Step 3 — Processing / Queued confirmation
 *
 * On completion the modal returns the job_id so the parent can show the
 * Review screen when the job finishes.
 */
import { useState, useRef } from 'react';
import {
  X, Upload, Sparkles, FileText, Table2, ChevronRight,
  Loader2, CheckCircle2, AlertTriangle, FileUp
} from 'lucide-react';
import { api } from '../../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type ImportPath = 'generative' | 'extraction' | 'csv';
type Step = 1 | 2 | 3;

interface ImportPreflightInfo {
  is_pdf: boolean;
  total_pages: number | null;
  max_pages_without_chunking: number;
  requires_chunking: boolean;
  chunk_page_size: number;
  chunk_count: number;
  message: string;
}

interface Props {
  onClose: () => void;
  onJobQueued: (jobId: string, importType: ImportPath) => void;
}

// ─── Path cards ───────────────────────────────────────────────────────────────
const PATHS: { id: ImportPath; icon: React.ReactNode; title: string; subtitle: string; accent: string }[] = [
  {
    id: 'generative',
    icon: <Sparkles className="w-6 h-6" />,
    title: 'Generate from Material',
    subtitle: 'Upload a PDF, DOCX — AI writes fresh questions from the content',
    accent: 'var(--accent-purple, #8b5cf6)',
  },
  {
    id: 'extraction',
    icon: <FileText className="w-6 h-6" />,
    title: 'Extract from Document',
    subtitle: 'Upload a PDF, MD or TXT that already has questions — AI structures them',
    accent: 'var(--accent-blue, #3b82f6)',
  },
  {
    id: 'csv',
    icon: <Table2 className="w-6 h-6" />,
    title: 'Import from Spreadsheet',
    subtitle: 'Upload a CSV or XLSX — AI maps your columns to our schema automatically',
    accent: 'var(--accent-green, #10b981)',
  },
];

const ACCEPT: Record<ImportPath, string> = {
  generative: '.pdf,.docx,.doc',
  extraction: '.pdf,.md,.txt,.docx,.doc',
  csv: '.csv,.xlsx,.xls',
};

const LIMITS: Record<ImportPath, string> = {
  generative: 'Max 5 MB · Max 20 pages (PDF)',
  extraction: 'Max 5 MB · Max 20 pages (PDF)',
  csv: 'Max 5 MB',
};

// ─── Component ────────────────────────────────────────────────────────────────
export function QuestionImportModal({ onClose, onJobQueued }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [selectedPath, setSelectedPath] = useState<ImportPath | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mcqCount, setMcqCount] = useState(5);
  const [essayCount, setEssayCount] = useState(5);
  const [mcqEasyCount, setMcqEasyCount] = useState(1);
  const [mcqMediumCount, setMcqMediumCount] = useState(3);
  const [mcqHardCount, setMcqHardCount] = useState(1);
  const [essayEasyCount, setEssayEasyCount] = useState(1);
  const [essayMediumCount, setEssayMediumCount] = useState(3);
  const [essayHardCount, setEssayHardCount] = useState(1);
  const [contextHint, setContextHint] = useState('');
  const [recruiterInstructions, setRecruiterInstructions] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<ImportPreflightInfo | null>(null);
  const [chunkPageSize, setChunkPageSize] = useState(20);
  const [approveChunking, setApproveChunking] = useState(false);
  const [queuedSummary, setQueuedSummary] = useState<{ chunked: boolean; chunkCount: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const isPdfFile = (f: File) => /\.pdf$/i.test(f.name);

  const runPreflight = async (f: File, selectedChunkPageSize: number) => {
    setIsPreflighting(true);
    try {
      const info = await api.recruiter.preflightQuestionImport(f, selectedChunkPageSize);
      setPreflight(info);
      if (info.requires_chunking) {
        setApproveChunking(false);
      }
      setError(null);
    } catch (err: any) {
      setPreflight(null);
      setError(err.message || 'Failed to inspect the file. Please try again.');
    } finally {
      setIsPreflighting(false);
    }
  };

  const handleFileChange = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) {
      setError('File exceeds the 5 MB limit. Please upload a smaller file.');
      return;
    }
    setError(null);
    setFile(f);
    setQueuedSummary(null);

    if (isPdfFile(f)) {
      await runPreflight(f, chunkPageSize);
    } else {
      setPreflight(null);
      setApproveChunking(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      void handleFileChange(dropped);
    }
  };

  const handleSubmit = async () => {
    if (!file || !selectedPath) return;
    const totalQuestions = mcqCount + essayCount;
    const mcqDifficultySum = mcqEasyCount + mcqMediumCount + mcqHardCount;
    const essayDifficultySum = essayEasyCount + essayMediumCount + essayHardCount;

    if (selectedPath === 'generative') {
      if (
        mcqCount < 0 || essayCount < 0 ||
        mcqEasyCount < 0 || mcqMediumCount < 0 || mcqHardCount < 0 ||
        essayEasyCount < 0 || essayMediumCount < 0 || essayHardCount < 0
      ) {
        setError('Question counts cannot be negative.');
        return;
      }
      if (totalQuestions <= 0) {
        setError('Please request at least one generated question.');
        return;
      }
      if (mcqDifficultySum !== mcqCount) {
        setError('MCQ difficulty counts must add up to MCQ total count.');
        return;
      }
      if (essayDifficultySum !== essayCount) {
        setError('Essay difficulty counts must add up to Essay total count.');
        return;
      }
    }

    if (preflight?.requires_chunking && !approveChunking) {
      setError('This PDF exceeds the page limit. Approve chunking to continue.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const types = [
        mcqCount > 0 ? 'mcq' : '',
        essayCount > 0 ? 'essay' : '',
      ].filter(Boolean).join(',') || 'mcq';

      const result = await api.recruiter.startQuestionImport(
        file,
        selectedPath,
        totalQuestions,
        contextHint,
        recruiterInstructions,
        types,
        mcqCount,
        essayCount,
        'Medium',
        'Medium',
        mcqEasyCount,
        mcqMediumCount,
        mcqHardCount,
        essayEasyCount,
        essayMediumCount,
        essayHardCount,
        Boolean(preflight?.requires_chunking),
        chunkPageSize,
      );
      setQueuedSummary({
        chunked: Boolean(result.chunked),
        chunkCount: Number(result.chunk_count || 1),
      });
      setStep(3);
      onJobQueued(result.job_id, selectedPath);
    } catch (err: any) {
      setError(err.message || 'Failed to queue import job. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Renders ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--card-bg, #1a1a2e)', borderRadius: '1rem',
        width: '100%', maxWidth: 580, maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
      }}>
        {/* Header */}
        <div style={{ padding: '1.5rem 1.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
              Import Questions
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #888)' }}>
              {step === 1 ? 'Choose how you want to import' : step === 2 ? 'Configure & upload your file' : 'Job queued!'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #888)', padding: '0.25rem' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>

          {/* Step 1: Choose path */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {PATHS.map(path => (
                <button
                  key={path.id}
                  onClick={() => { setSelectedPath(path.id); setStep(2); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.25rem', borderRadius: '0.75rem',
                    border: '1.5px solid var(--border, rgba(255,255,255,0.1))',
                    background: 'var(--card-bg-secondary, rgba(255,255,255,0.03))',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    color: 'var(--text-primary, #fff)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = path.accent; (e.currentTarget as HTMLButtonElement).style.background = `${path.accent}15`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border, rgba(255,255,255,0.1))'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg-secondary, rgba(255,255,255,0.03))'; }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: '0.6rem', background: `${path.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: path.accent, flexShrink: 0 }}>
                    {path.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{path.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)', marginTop: '0.2rem' }}>{path.subtitle}</div>
                  </div>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted, #888)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Configure & upload */}
          {step === 2 && selectedPath && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Back button */}
              <button
                onClick={() => {
                  setStep(1);
                  setFile(null);
                  setError(null);
                  setPreflight(null);
                  setApproveChunking(false);
                  setQueuedSummary(null);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #888)', fontSize: '0.82rem', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                ← Back
              </button>

              {/* Generative-only options */}
              {selectedPath === 'generative' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.4rem' }}>
                        MCQ count
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={mcqCount}
                        onChange={e => setMcqCount(Math.max(0, Number(e.target.value) || 0))}
                        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.9rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.4rem' }}>
                        Essay count
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={essayCount}
                        onChange={e => setEssayCount(Math.max(0, Number(e.target.value) || 0))}
                        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.35rem' }}>
                        MCQ difficulty split (Easy / Medium / Hard)
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <input type="number" min={0} value={mcqEasyCount} onChange={e => setMcqEasyCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Easy" style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.85rem' }} />
                        <input type="number" min={0} value={mcqMediumCount} onChange={e => setMcqMediumCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Medium" style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.85rem' }} />
                        <input type="number" min={0} value={mcqHardCount} onChange={e => setMcqHardCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Hard" style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: (mcqEasyCount + mcqMediumCount + mcqHardCount) === mcqCount ? '#10b981' : '#f59e0b', marginTop: '0.3rem' }}>
                        Split total: {mcqEasyCount + mcqMediumCount + mcqHardCount} / {mcqCount}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.35rem' }}>
                        Essay difficulty split (Easy / Medium / Hard)
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <input type="number" min={0} value={essayEasyCount} onChange={e => setEssayEasyCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Easy" style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.85rem' }} />
                        <input type="number" min={0} value={essayMediumCount} onChange={e => setEssayMediumCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Medium" style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.85rem' }} />
                        <input type="number" min={0} value={essayHardCount} onChange={e => setEssayHardCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Hard" style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: (essayEasyCount + essayMediumCount + essayHardCount) === essayCount ? '#10b981' : '#f59e0b', marginTop: '0.3rem' }}>
                        Split total: {essayEasyCount + essayMediumCount + essayHardCount} / {essayCount}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)' }}>
                    Total questions to generate: <strong style={{ color: 'var(--text-primary, #fff)' }}>{mcqCount + essayCount}</strong>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.4rem' }}>
                      Topic hint <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      placeholder="e.g. Python OOP, System Design, Data Structures"
                      value={contextHint}
                      onChange={e => setContextHint(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.4rem' }}>
                      Recruiter instructions <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      placeholder="e.g. Focus on practical scenarios, avoid trick questions, keep wording concise."
                      value={recruiterInstructions}
                      onChange={e => setRecruiterInstructions(e.target.value)}
                      rows={3}
                      style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.9rem', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </div>

                </>
              )}

              {/* File drop zone */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.4rem' }}>
                  Upload file <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>({LIMITS[selectedPath]})</span>
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--accent-purple, #8b5cf6)' : 'var(--border, rgba(255,255,255,0.2))'}`,
                    borderRadius: '0.75rem', padding: '2rem', textAlign: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: dragOver ? 'rgba(139,92,246,0.06)' : 'var(--card-bg-secondary, rgba(255,255,255,0.02))',
                  }}
                >
                  {file ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--accent-green, #10b981)' }}>
                      <CheckCircle2 className="w-5 h-5" />
                      <span style={{ fontWeight: 600 }}>{file.name}</span>
                      <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.8rem' }}>({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-8 h-8 mx-auto" style={{ color: 'var(--text-muted, #888)', marginBottom: '0.5rem' }} />
                      <div style={{ color: 'var(--text-primary, #fff)', fontWeight: 500, fontSize: '0.9rem' }}>Drag & drop or click to browse</div>
                      <div style={{ color: 'var(--text-muted, #888)', fontSize: '0.78rem', marginTop: '0.25rem' }}>Accepted: {ACCEPT[selectedPath]}</div>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT[selectedPath]}
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileChange(f); }}
                  />
                </div>
              </div>

              {file && isPreflighting && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem', borderRadius: '0.5rem',
                  background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                  color: '#60a5fa', fontSize: '0.82rem'
                }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking document pages...
                </div>
              )}

              {file && preflight?.is_pdf && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  padding: '0.9rem',
                  borderRadius: '0.7rem',
                  border: `1px solid ${preflight.requires_chunking ? 'rgba(245,158,11,0.35)' : 'rgba(16,185,129,0.35)'}`,
                  background: preflight.requires_chunking ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: preflight.requires_chunking ? '#f59e0b' : '#10b981', fontSize: '0.83rem' }}>
                    {preflight.requires_chunking ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    <div>
                      <div style={{ fontWeight: 600 }}>PDF pages: {preflight.total_pages}</div>
                      <div>{preflight.message}</div>
                    </div>
                  </div>

                  {preflight.requires_chunking && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.35rem' }}>
                            Pages per chunk
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={preflight.max_pages_without_chunking}
                            value={chunkPageSize}
                            onChange={async (e) => {
                              const nextValue = Math.max(1, Math.min(preflight.max_pages_without_chunking, Number(e.target.value) || 1));
                              setChunkPageSize(nextValue);
                              if (file && isPdfFile(file)) {
                                await runPreflight(file, nextValue);
                              }
                            }}
                            style={{ width: '100%', padding: '0.55rem 0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-primary, #fff)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #888)', display: 'block', marginBottom: '0.35rem' }}>
                            Estimated chunks
                          </label>
                          <div style={{ height: '38px', borderRadius: '0.5rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'var(--input-bg, rgba(255,255,255,0.05))', display: 'flex', alignItems: 'center', padding: '0 0.7rem', color: 'var(--text-primary, #fff)', fontWeight: 700, fontSize: '0.95rem' }}>
                            {preflight.chunk_count}
                          </div>
                        </div>
                      </div>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-primary, #fff)' }}>
                        <input
                          type="checkbox"
                          checked={approveChunking}
                          onChange={(e) => setApproveChunking(e.target.checked)}
                          style={{ marginTop: '2px' }}
                        />
                        I approve processing this oversized PDF in {preflight.chunk_count} chunk(s) and start extracting all chunks.
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.82rem' }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!file || isUploading || isPreflighting || (preflight?.requires_chunking && !approveChunking)}
                style={{
                  padding: '0.75rem', borderRadius: '0.6rem', border: 'none',
                  background: !file || isUploading || isPreflighting || (preflight?.requires_chunking && !approveChunking)
                    ? 'var(--border, rgba(255,255,255,0.1))'
                    : 'var(--accent-purple, #8b5cf6)',
                  color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: !file || isUploading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'background 0.15s',
                }}
              >
                {isUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                ) : isPreflighting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
                ) : preflight?.requires_chunking && !approveChunking ? (
                  <>Approve Chunking to Continue</>
                ) : (
                  <><Upload className="w-4 h-4" /> Start Import</>
                )}
              </button>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: '#10b981' }} />
              </div>
              <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary, #fff)', fontWeight: 700 }}>Import Job Queued!</h3>
              <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted, #888)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                {queuedSummary?.chunked
                  ? `Your file was split into ${queuedSummary.chunkCount} chunk(s) and all chunks are now processing in the background.`
                  : 'Your file is being processed in the background.'}
                {' '}You can track progress in <strong>Background Tasks</strong>.
                Once complete, a <strong>Pending Review</strong> badge will appear in the Question Bank.
              </p>
              <button
                onClick={onClose}
                style={{ padding: '0.65rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: 'var(--accent-purple, #8b5cf6)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                Got it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
