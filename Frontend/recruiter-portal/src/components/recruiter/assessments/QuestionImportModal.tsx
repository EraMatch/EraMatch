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
  Loader2, CheckCircle2, AlertTriangle, FileUp, Download
} from 'lucide-react';
import { api } from '../../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type ImportPath = 'generative' | 'extraction' | 'csv';
type Step = 1 | 2 | 3;
type ImportSubPage = 'generation' | 'existing';

interface ImportPreflightInfo {
  is_pdf: boolean;
  total_pages: number | null;
  max_pages_without_chunking: number;
  requires_chunking: boolean;
  chunk_page_size: number;
  chunk_count: number;
  message: string;
}

interface SpreadsheetPreflightInfo {
  sheets: string[];
  selected_sheet: string | null;
  columns: string[];
  mapping: Record<string, string | null>;
  confidence: Record<string, number>;
  uncertain_fields: string[];
  valid_rows: number;
  invalid_rows: number;
  row_errors_preview: Array<{ row: number; error: string }>;
  auto_fix_suggestions_preview: Array<{ row: number; error: string; suggestion: string; auto_fixable: boolean }>;
  auto_fixable_count: number;
  unfixable_count: number;
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
    accent: '#6366f1',
  },
  {
    id: 'extraction',
    icon: <FileText className="w-6 h-6" />,
    title: 'Extract from Document',
    subtitle: 'Upload a PDF, MD or TXT that already has questions — AI structures them',
    accent: '#3b82f6',
  },
  {
    id: 'csv',
    icon: <Table2 className="w-6 h-6" />,
    title: 'Import from Spreadsheet',
    subtitle: 'Upload a CSV or XLSX — AI maps your columns to our schema automatically',
    accent: '#10b981',
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

const CSV_CANONICAL_FIELDS: string[] = [
  'type', 'text', 'difficulty', 'category', 'tags', 'options', 'correct_answer',
  'evidence', 'reference_answer', 'explanation', 'rubric', 'max_words',
];

// ─── Component ────────────────────────────────────────────────────────────────
export function QuestionImportModal({ onClose, onJobQueued }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [subPage, setSubPage] = useState<ImportSubPage>('generation');
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
  const [spreadsheetPreflight, setSpreadsheetPreflight] = useState<SpreadsheetPreflightInfo | null>(null);
  const [csvSelectedSheet, setCsvSelectedSheet] = useState<string>('');
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [confirmUncertainMapping, setConfirmUncertainMapping] = useState(false);
  const [applyAutoFixes, setApplyAutoFixes] = useState(false);
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

  const runSpreadsheetPreflight = async (f: File, selectedSheet?: string) => {
    setIsPreflighting(true);
    try {
      const info = await api.recruiter.preflightSpreadsheetImport(f, selectedSheet || undefined);
      setSpreadsheetPreflight(info);
      if (info.selected_sheet) {
        setCsvSelectedSheet(info.selected_sheet);
      }
      const nextMapping: Record<string, string> = {};
      for (const field of CSV_CANONICAL_FIELDS) {
        const mapped = info.mapping?.[field];
        if (mapped) nextMapping[field] = mapped;
      }
      setCsvMapping(nextMapping);
      setConfirmUncertainMapping(false);
      setApplyAutoFixes(false);
      setError(null);
    } catch (err: any) {
      setSpreadsheetPreflight(null);
      setError(err.message || 'Failed to inspect spreadsheet columns.');
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
    setSpreadsheetPreflight(null);
    setCsvMapping({});
    setConfirmUncertainMapping(false);
    setApplyAutoFixes(false);

    if (selectedPath === 'csv') {
      await runSpreadsheetPreflight(f, csvSelectedSheet || undefined);
    } else if (isPdfFile(f)) {
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

  const handleDownloadTemplate = async () => {
    try {
      setError(null);
      await api.recruiter.downloadQuestionImportTemplate();
    } catch (err: any) {
      setError(err.message || 'Failed to download template. Please try again.');
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

    if (selectedPath === 'csv') {
      if (!spreadsheetPreflight) {
        setError('Please wait for spreadsheet preflight before starting import.');
        return;
      }
      if (!csvMapping.type || !csvMapping.text) {
        setError('Spreadsheet mapping must include both type and text columns.');
        return;
      }
      if (spreadsheetPreflight.uncertain_fields.length > 0 && !confirmUncertainMapping) {
        setError('Please confirm uncertain column mappings before continuing.');
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
        selectedPath === 'csv' ? (csvSelectedSheet || undefined) : undefined,
        selectedPath === 'csv' ? csvMapping : undefined,
        selectedPath === 'csv' ? applyAutoFixes : false,
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

  const isCsvBlocked = selectedPath === 'csv' && (
    !file ||
    !spreadsheetPreflight ||
    !csvMapping.type ||
    !csvMapping.text ||
    (spreadsheetPreflight.uncertain_fields.length > 0 && !confirmUncertainMapping)
  );

  const csvBlockReasons: string[] = [];
  if (selectedPath === 'csv') {
    if (!file) csvBlockReasons.push('Upload a spreadsheet file first.');
    if (file && !spreadsheetPreflight) csvBlockReasons.push('Wait for spreadsheet preflight to finish.');
    if (spreadsheetPreflight && !csvMapping.type) csvBlockReasons.push("Map required field 'type'.");
    if (spreadsheetPreflight && !csvMapping.text) csvBlockReasons.push("Map required field 'text'.");
    if (spreadsheetPreflight && spreadsheetPreflight.uncertain_fields.length > 0 && !confirmUncertainMapping) {
      csvBlockReasons.push(`Confirm uncertain mappings (${spreadsheetPreflight.uncertain_fields.join(', ')}) to continue.`);
    }
  }

  const csvBlockedButtonLabel = (() => {
    if (selectedPath !== 'csv' || !isCsvBlocked) return '';
    if (file && !spreadsheetPreflight) return 'Inspecting Spreadsheet...';
    if (spreadsheetPreflight && (!csvMapping.type || !csvMapping.text)) return 'Map Required Fields (type, text)';
    if (spreadsheetPreflight && spreadsheetPreflight.uncertain_fields.length > 0 && !confirmUncertainMapping) {
      return `Confirm ${spreadsheetPreflight.uncertain_fields.length} Uncertain Mapping(s)`;
    }
    return 'Resolve Mapping to Continue';
  })();

  // ── Renders ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-[24px] w-full max-w-[580px] max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-100">
          <div>
            <h2 className="m-0 text-xl font-bold text-slate-900 tracking-tight">
              Import Questions
            </h2>
            <p className="m-0 mt-1 text-sm text-slate-500">
              {step === 1 ? 'Choose how you want to import' : step === 2 ? 'Configure & upload your file' : 'Job queued!'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>

          {/* Step 1: Choose path */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl border border-slate-200 bg-slate-50">
                <button
                  onClick={() => setSubPage('generation')}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${subPage === 'generation' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Question Generation
                </button>
                <button
                  onClick={() => setSubPage('existing')}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${subPage === 'existing' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Existing Questions Import
                </button>
              </div>

              {PATHS.map(path => (
                (subPage === 'generation' && path.id !== 'generative') ||
                (subPage === 'existing' && path.id === 'generative')
                  ? null
                  :
                <button
                  key={path.id}
                  onClick={() => { setSelectedPath(path.id); setStep(2); }}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 bg-slate-50 cursor-pointer text-left transition-all hover:bg-indigo-50/30 hover:border-indigo-400/60"

                >
                  <div style={{ width: 44, height: 44, borderRadius: '0.6rem', background: `${path.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: path.accent, flexShrink: 0 }}>
                    {path.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{path.title}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem' }}>{path.subtitle}</div>
                  </div>
                  <ChevronRight className="w-4 h-4" style={{ color: '#6b7280', flexShrink: 0 }} />
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
                  setSpreadsheetPreflight(null);
                  setCsvSelectedSheet('');
                  setCsvMapping({});
                  setConfirmUncertainMapping(false);
                  setApplyAutoFixes(false);
                  setApproveChunking(false);
                  setQueuedSummary(null);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.82rem', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                ← Back
              </button>

              {/* Generative-only options */}
              {selectedPath === 'generative' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                        MCQ count
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={mcqCount}
                        onChange={e => setMcqCount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                        Essay count
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={essayCount}
                        onChange={e => setEssayCount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                        MCQ difficulty split (Easy / Medium / Hard)
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <input type="number" min={0} value={mcqEasyCount} onChange={e => setMcqEasyCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Easy" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                        <input type="number" min={0} value={mcqMediumCount} onChange={e => setMcqMediumCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Medium" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                        <input type="number" min={0} value={mcqHardCount} onChange={e => setMcqHardCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Hard" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: (mcqEasyCount + mcqMediumCount + mcqHardCount) === mcqCount ? '#10b981' : '#f59e0b', marginTop: '0.3rem' }}>
                        Split total: {mcqEasyCount + mcqMediumCount + mcqHardCount} / {mcqCount}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                        Essay difficulty split (Easy / Medium / Hard)
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <input type="number" min={0} value={essayEasyCount} onChange={e => setEssayEasyCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Easy" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                        <input type="number" min={0} value={essayMediumCount} onChange={e => setEssayMediumCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Medium" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                        <input type="number" min={0} value={essayHardCount} onChange={e => setEssayHardCount(Math.max(0, Number(e.target.value) || 0))} placeholder="Hard" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: (essayEasyCount + essayMediumCount + essayHardCount) === essayCount ? '#10b981' : '#f59e0b', marginTop: '0.3rem' }}>
                        Split total: {essayEasyCount + essayMediumCount + essayHardCount} / {essayCount}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    Total questions to generate: <strong style={{ color: '#111827' }}>{mcqCount + essayCount}</strong>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                      Topic hint <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      placeholder="e.g. Python OOP, System Design, Data Structures"
                      value={contextHint}
                      onChange={e => setContextHint(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                      Recruiter instructions <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      placeholder="e.g. Focus on practical scenarios, avoid trick questions, keep wording concise."
                      value={recruiterInstructions}
                      onChange={e => setRecruiterInstructions(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>

                </>
              )}

              {selectedPath === 'csv' && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      padding: '0.9rem',
                      borderRadius: '0.7rem',
                      border: '1px solid rgba(16,185,129,0.35)',
                      background: 'rgba(16,185,129,0.08)',
                    }}
                  >
                    <div style={{ fontSize: '0.84rem', color: '#059669', lineHeight: 1.5 }}>
                      Recommended: use the EraMatch template for deterministic import and cleaner review.
                      If headers do not match the template, we will fallback to AI-assisted mapping.
                    </div>
                    <button
                      onClick={handleDownloadTemplate}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(16,185,129,0.45)',
                        background: 'rgba(16,185,129,0.14)',
                        color: '#059669',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                      }}
                    >
                      <Download className="w-4 h-4" />
                      Download Template (CSV)
                    </button>
                  </div>

                  {spreadsheetPreflight && (
                    <div style={{ border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(59,130,246,0.08)', borderRadius: '0.7rem', padding: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: '#3b82f6' }}>
                          Rows preview: <strong>{spreadsheetPreflight.valid_rows}</strong> valid / <strong>{spreadsheetPreflight.invalid_rows}</strong> invalid
                        </div>
                        {spreadsheetPreflight.sheets.length > 0 && (
                          <div>
                            <label style={{ fontSize: '0.75rem', color: '#3b82f6', marginRight: '0.35rem' }}>Sheet</label>
                            <select
                              value={csvSelectedSheet}
                              onChange={async (e) => {
                                const next = e.target.value;
                                setCsvSelectedSheet(next);
                                if (file) {
                                  await runSpreadsheetPreflight(file, next);
                                }
                              }}
                              style={{ padding: '0.35rem 0.5rem', borderRadius: '0.4rem', border: '1px solid rgba(59,130,246,0.2)', background: '#ffffff', color: '#1e3a8a', fontSize: '0.78rem' }}
                            >
                              {spreadsheetPreflight.sheets.map((sheet) => (
                                <option key={sheet} value={sheet} style={{ backgroundColor: '#ffffff', color: '#111827' }}>{sheet}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto', paddingRight: '0.15rem' }}>
                        {CSV_CANONICAL_FIELDS.map((field) => {
                          const conf = spreadsheetPreflight.confidence[field] ?? 0;
                          const isUncertain = spreadsheetPreflight.uncertain_fields.includes(field);
                          return (
                            <div key={field} style={{ border: '1px solid rgba(59,130,246,0.1)', borderRadius: '0.45rem', padding: '0.45rem' }}>
                              <div style={{ fontSize: '0.72rem', color: '#3b82f6', marginBottom: '0.25rem' }}>
                                {field} {conf > 0 ? `(${Math.round(conf * 100)}%)` : ''} {isUncertain ? '⚠️' : ''}
                              </div>
                              <select
                                value={csvMapping[field] || ''}
                                onChange={(e) => setCsvMapping(prev => ({ ...prev, [field]: e.target.value }))}
                                style={{ width: '100%', padding: '0.35rem 0.45rem', borderRadius: '0.35rem', border: '1px solid rgba(59,130,246,0.2)', background: '#ffffff', color: '#1e3a8a', fontSize: '0.75rem' }}
                              >
                                <option value="" style={{ backgroundColor: '#ffffff', color: '#111827' }}>Not mapped</option>
                                {spreadsheetPreflight.columns.map((col) => (
                                  <option key={`${field}-${col}`} value={col} style={{ backgroundColor: '#ffffff', color: '#111827' }}>{col}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>

                      {spreadsheetPreflight.uncertain_fields.length > 0 && (
                        <label style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#1e3a8a' }}>
                          <input
                            type="checkbox"
                            checked={confirmUncertainMapping}
                            onChange={(e) => setConfirmUncertainMapping(e.target.checked)}
                            style={{ marginTop: '2px' }}
                          />
                          I reviewed and confirm uncertain mappings before queueing this import.
                        </label>
                      )}

                      {spreadsheetPreflight.auto_fix_suggestions_preview.length > 0 && (
                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(59,130,246,0.15)', paddingTop: '0.6rem' }}>
                          <div style={{ fontSize: '0.8rem', color: '#10b981', marginBottom: '0.35rem' }}>
                            Auto-fix suggestions: {spreadsheetPreflight.auto_fixable_count} fixable / {spreadsheetPreflight.unfixable_count} manual
                          </div>
                          <label style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: '#059669' }}>
                            <input
                              type="checkbox"
                              checked={applyAutoFixes}
                              onChange={(e) => setApplyAutoFixes(e.target.checked)}
                            />
                            One-click apply auto-fix suggestions before review
                          </label>

                          <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                            {spreadsheetPreflight.auto_fix_suggestions_preview.slice(0, 8).map((s, idx) => (
                              <div key={`row-fix-${s.row}-${idx}`} style={{ fontSize: '0.74rem', marginBottom: '0.25rem' }}>
                                <span style={{ color: '#3b82f6' }}>Row {s.row}</span>
                                <span style={{ color: '#ef4444' }}> · {s.error}</span>
                                <span style={{ color: '#059669' }}> · {s.suggestion}</span>
                                <span style={{ color: s.auto_fixable ? '#86efac' : '#fcd34d' }}> ({s.auto_fixable ? 'auto-fixable' : 'manual'})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {spreadsheetPreflight.row_errors_preview.length > 0 && (
                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(59,130,246,0.15)', paddingTop: '0.6rem' }}>
                          <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.35rem' }}>Validation preview errors</div>
                          <div style={{ maxHeight: '110px', overflowY: 'auto' }}>
                            {spreadsheetPreflight.row_errors_preview.slice(0, 8).map((r) => (
                              <div key={`row-error-${r.row}-${r.error}`} style={{ fontSize: '0.74rem', color: '#ef4444', marginBottom: '0.2rem' }}>
                                Row {r.row}: {r.error}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* File drop zone */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                  Upload file <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>({LIMITS[selectedPath]})</span>
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? '#6366f1' : '#d1d5db'}`,
                    borderRadius: '0.75rem', padding: '2rem', textAlign: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: dragOver ? 'rgba(99,102,241,0.06)' : '#f9fafb',
                  }}
                >
                  {file ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#10b981' }}>
                      <CheckCircle2 className="w-5 h-5" />
                      <span style={{ fontWeight: 600 }}>{file.name}</span>
                      <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-8 h-8 mx-auto" style={{ color: '#6b7280', marginBottom: '0.5rem' }} />
                      <div style={{ color: '#111827', fontWeight: 500, fontSize: '0.9rem' }}>Drag & drop or click to browse</div>
                      <div style={{ color: '#6b7280', fontSize: '0.78rem', marginTop: '0.25rem' }}>Accepted: {ACCEPT[selectedPath]}</div>
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
                  <Loader2 className="w-4 h-4 animate-spin" /> {selectedPath === 'csv' ? 'Inspecting spreadsheet columns...' : 'Checking document pages...'}
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
                          <label className="block text-sm font-semibold text-slate-600 mb-1.5">
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
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                            Estimated chunks
                          </label>
                          <div style={{ height: '38px', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: '#ffffff', display: 'flex', alignItems: 'center', padding: '0 0.7rem', color: '#111827', fontWeight: 700, fontSize: '0.95rem' }}>
                            {preflight.chunk_count}
                          </div>
                        </div>
                      </div>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', color: '#111827' }}>
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

              {selectedPath === 'csv' && isCsvBlocked && csvBlockReasons.length > 0 && (
                <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#fde68a', fontSize: '0.8rem' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Import is blocked until these are resolved:</div>
                  {csvBlockReasons.map((reason, idx) => (
                    <div key={`csv-block-reason-${idx}`} style={{ marginBottom: '0.18rem' }}>• {reason}</div>
                  ))}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!file || isUploading || isPreflighting || (preflight?.requires_chunking && !approveChunking) || isCsvBlocked}
className="w-full py-3 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                {isUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                ) : isPreflighting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
                ) : selectedPath === 'csv' && isCsvBlocked ? (
                  <>{csvBlockedButtonLabel}</>
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
              <h3 style={{ margin: '0 0 0.5rem', color: '#111827', fontWeight: 700 }}>Import Job Queued!</h3>
              <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.88rem', lineHeight: 1.5 }}>
                {queuedSummary?.chunked
                  ? `Your file was split into ${queuedSummary.chunkCount} chunk(s) and all chunks are now processing in the background.`
                  : 'Your file is being processed in the background.'}
                {' '}You can track progress in <strong>Background Tasks</strong>.
                Once complete, a <strong>Pending Review</strong> badge will appear in the Question Bank.
              </p>
              <button
                onClick={onClose}
                style={{ padding: '0.65rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
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
