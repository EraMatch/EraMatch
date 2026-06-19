import { useState, useEffect } from 'react';
import { X, ChevronLeft, AlertTriangle, Clock, CheckCircle, FileText, Flag, MessageSquare, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../../services/api';

interface Question {
  id: number;
  text: string;
  answer: string;
  timeSpent: number;
  flagged: boolean;
  questionType?: string;
  options?: string[];
  correctIndex?: number | null;
  selectedIndex?: number | null;
  isCorrect?: boolean;
  rawAnswer?: any;
  rubric?: string;
}

interface IntegritySignal {
  id: number;
  type: 'tab-switch' | 'copy-paste' | 'suspicious-timing' | 'multiple-attempts';
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  description: string;
  evidence: string;
}

interface ModuleDetailAssessmentProps {
  candidateId: number;
  candidateName: string;
  score: number;
  completedDate: string;
  onClose: () => void;
  onMoveToNextStage: () => void;
  questionsData?: any[];
  assessmentStats?: { duration?: string; questionsCorrect?: number; questionsTotal?: number; topicScores?: { topic: string; score: number }[] };
}

// Backend sends ai_score on 0-1 scale; normalize to 0-100
function normalizeAiScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function scoreColor(pct: number) {
  return pct >= 70 ? 'bg-[#dcfce7] text-[#065f46]' : pct >= 50 ? 'bg-[#fffbeb] text-[#92400e]' : 'bg-[#fef2f2] text-[#991b1b]';
}

function EssayAccordion({ rubric, aiFeedback, aiScore }: { rubric?: string; aiFeedback?: string; aiScore?: number }) {
  const [open, setOpen] = useState(false);
  const pct = aiScore != null ? normalizeAiScore(aiScore) : null;
  return (
    <div className="border border-[#e5e7eb] rounded-[8px] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#f5f3ff] hover:bg-[#ede9fe] transition-colors"
      >
        <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#5b21b6]">
          {open ? '▾' : '▸'} Rubric &amp; Score Justification
        </span>
        {pct != null && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${scoreColor(pct)}`}>
            {pct}/100
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 py-3 space-y-3 bg-white">
          {rubric && (
            <div>
              <div className="font-['Arimo',sans-serif] text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Rubric</div>
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#374151] leading-relaxed whitespace-pre-wrap">{rubric}</p>
            </div>
          )}
          {aiFeedback && (
            <div>
              <div className="font-['Arimo',sans-serif] text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">AI Evaluation</div>
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#374151] leading-relaxed whitespace-pre-wrap">{aiFeedback}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ModuleDetailAssessment({
  candidateId,
  candidateName,
  score,
  completedDate,
  onClose,
  onMoveToNextStage,
  questionsData,
  assessmentStats,
}: ModuleDetailAssessmentProps) {
  const [note, setNote] = useState('');
  const [showEscalateModal, setShowEscalateModal] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [integritySignals, setIntegritySignals] = useState<IntegritySignal[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (questionsData) {
      const mapped: Question[] = questionsData.map((q: any, i: number) => {
        const raw = q.answer;
        const qType = (q.questionType || '').toLowerCase();

        // Resolve selected index for MCQ
        const selectedIdx = raw != null && typeof raw === 'object'
          ? (raw.selected_index ?? raw.selected_option ?? raw.selected_value ?? null)
          : (q.selected ?? null);

        // Resolve options as plain strings
        const resolveOptions = (opts: any[]): string[] =>
          opts.map(o => (typeof o === 'object' ? (o.text || o.label || String(o)) : String(o)));

        let answerText = '';
        if (raw === null || raw === undefined) {
          answerText = 'No answer submitted';
        } else if (qType === 'mcq') {
          if (selectedIdx !== null && Array.isArray(q.options) && q.options[selectedIdx] != null) {
            const opt = q.options[selectedIdx];
            answerText = typeof opt === 'object' ? (opt.text || opt.label || String(selectedIdx + 1)) : String(opt);
          } else {
            answerText = selectedIdx !== null ? `Option ${Number(selectedIdx) + 1}` : 'N/A';
          }
        } else if (typeof raw === 'object') {
          answerText = raw.text || raw.answer || raw.response || '';
        } else {
          answerText = String(raw);
        }

        return {
          id: q.id ?? i,
          text: q.question || q.text || '',
          answer: answerText,
          timeSpent: (() => {
            // backend sends duration as "45s" string per question
            if (typeof q.duration === 'string') {
              const m = q.duration.match(/(\d+)/);
              if (m) return parseInt(m[1]);
            }
            return q.time_spent_seconds || q.timeSpent || 0;
          })(),
          flagged: q.flagged || false,
          questionType: qType,
          options: Array.isArray(q.options) ? resolveOptions(q.options) : undefined,
          correctIndex: q.correctIndex ?? null,
          selectedIndex: selectedIdx !== null ? Number(selectedIdx) : null,
          isCorrect: q.isCorrect,
          rawAnswer: raw,
          rubric: q.rubric,
        } as Question;
      });
      setQuestions(mapped);
      const palette = ['bg-[#10b981]', 'bg-[#3b82f6]', 'bg-[#6366f1]', 'bg-[#8b5cf6]', 'bg-[#f59e0b]', 'bg-[#ef4444]'];
      const topicScores = assessmentStats?.topicScores;
      setPerformanceMetrics(
        topicScores && topicScores.length > 0
          ? topicScores.map((t, i) => ({ label: t.topic, value: t.score, color: palette[i % palette.length] }))
          : [
              { label: 'Technical Accuracy', value: 90, color: 'bg-[#10b981]' },
              { label: 'Code Quality', value: 85, color: 'bg-[#3b82f6]' },
              { label: 'Best Practices', value: 88, color: 'bg-[#6366f1]' },
              { label: 'Problem Solving', value: 82, color: 'bg-[#8b5cf6]' },
            ]
      );
      setLoading(false);
      return;
    }

    const fetchAssessmentDetails = async () => {
      try {
        setLoading(true);
        const data: any = await api.recruiter.getAssessmentDetails(candidateId);
        setQuestions(data.questions || []);
        setIntegritySignals(data.integritySignals || []);
        setPerformanceMetrics(data.performanceMetrics || [
          { label: 'Technical Accuracy', value: 90, color: 'bg-[#10b981]' },
          { label: 'Code Quality', value: 85, color: 'bg-[#3b82f6]' },
          { label: 'Best Practices', value: 88, color: 'bg-[#6366f1]' },
          { label: 'Problem Solving', value: 82, color: 'bg-[#8b5cf6]' },
        ]);
      } catch {
        setPerformanceMetrics([
          { label: 'Technical Accuracy', value: 90, color: 'bg-[#10b981]' },
          { label: 'Code Quality', value: 85, color: 'bg-[#3b82f6]' },
          { label: 'Best Practices', value: 88, color: 'bg-[#6366f1]' },
          { label: 'Problem Solving', value: 82, color: 'bg-[#8b5cf6]' },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchAssessmentDetails();
  }, [candidateId, questionsData]);

  // Parse duration string like "45:30" or "45m 30s" → seconds
  const parseDurationToSeconds = (dur?: string): number | null => {
    if (!dur || dur === 'N/A') return null;
    const colonMatch = dur.match(/^(\d+):(\d+)$/);
    if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
    const parts = dur.match(/(\d+)m\s*(\d+)s/);
    if (parts) return parseInt(parts[1]) * 60 + parseInt(parts[2]);
    const minOnly = dur.match(/(\d+)\s*min/);
    if (minOnly) return parseInt(minOnly[1]) * 60;
    return null;
  };

  const totalTimeSeconds = parseDurationToSeconds(assessmentStats?.duration);
  const questionCount = assessmentStats?.questionsTotal || questions.length || 1;
  const avgSeconds = totalTimeSeconds !== null ? Math.round(totalTimeSeconds / questionCount) : null;

  const fmtSeconds = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
  const fmtMinutes = (s: number) => `${Math.floor(s / 60)} minutes`;

  // Legacy path: per-question timeSpent if provided
  const totalTimeLegacy = questions.reduce((sum, q) => sum + q.timeSpent, 0);
  const avgTimeLegacySec = totalTimeLegacy > 0 ? totalTimeLegacy / questions.length : null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-[#ef4444] bg-[#fef2f2] border-[#fecaca]';
      case 'medium':
        return 'text-[#f59e0b] bg-[#fffbeb] border-[#fde68a]';
      case 'low':
        return 'text-[#3b82f6] bg-[#eff6ff] border-[#bfdbfe]';
      default:
        return 'text-[#6b7280] bg-[#f9fafb] border-[#e5e7eb]';
    }
  };

  return (
    <div className="w-full bg-[#f9fafb]">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-8 py-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-white text-[20px] mb-1">Assessment Details</h2>
                <div className="flex items-center gap-3">
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white/90">
                    {candidateName}
                  </span>
                  <span className="text-white/60">•</span>
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white/90">
                    Completed {completedDate}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-['Arimo',sans-serif] text-[12px] text-white/80 mb-1">
                Overall Score
              </div>
              <div className="text-white text-[32px] leading-none">
                {score}%
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div>
          <div className="grid grid-cols-12 gap-6 p-8">
            {/* Left Column - Questions */}
            <div className="col-span-5 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111827] text-[16px]">Questions & Answers</h3>
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  {questions.length} questions
                </span>
              </div>
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  className={`bg-white border rounded-[12px] p-5 transition-all ${question.flagged
                    ? 'border-[#fecaca] bg-[#fef2f2]'
                    : 'border-[#e5e7eb] hover:border-[#6366f1]'
                    }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-[28px] h-[28px] rounded-full bg-[#6366f1] flex items-center justify-center flex-shrink-0">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-white">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
                        {question.text}
                      </div>
                      {/* MCQ — option chips */}
                      {question.questionType === 'mcq' && Array.isArray(question.options) && question.options.length > 0 ? (
                        <div className="mb-3 space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText size={14} className="text-[#6b7280]" />
                            <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] uppercase tracking-wide">Choices</span>
                          </div>
                          {question.options.map((opt, oi) => {
                            const isCorrect = question.correctIndex === oi;
                            const isSelected = question.selectedIndex === oi;
                            let cls = 'border border-[#e5e7eb] bg-[#f9fafb] text-[#374151]';
                            if (isCorrect && isSelected) cls = 'border-[#10b981] bg-[#dcfce7] text-[#065f46] font-semibold';
                            else if (isCorrect) cls = 'border-[#10b981] bg-[#dcfce7] text-[#065f46]';
                            else if (isSelected) cls = 'border-[#ef4444] bg-[#fef2f2] text-[#991b1b] font-semibold';
                            return (
                              <div key={oi} className={`flex items-center gap-3 px-3 py-2 rounded-[8px] ${cls}`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                                  isCorrect && isSelected ? 'bg-[#10b981] text-white'
                                  : isCorrect ? 'bg-[#10b981] text-white'
                                  : isSelected ? 'bg-[#ef4444] text-white'
                                  : 'bg-[#e5e7eb] text-[#6b7280]'
                                }`}>
                                  {String.fromCharCode(65 + oi)}
                                </span>
                                <span className="font-['Arimo',sans-serif] text-[13px] flex-1">{opt}</span>
                                {isCorrect && <CheckCircle size={15} className="text-[#10b981] flex-shrink-0" />}
                                {isSelected && !isCorrect && <span className="text-[11px] text-[#ef4444] font-semibold flex-shrink-0">Selected</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : question.questionType === 'coding' && question.rawAnswer && typeof question.rawAnswer === 'object' ? (
                        /* Coding — code block + test results */
                        <div className="mb-3 space-y-3">
                          {question.rawAnswer.code && (
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <FileText size={14} className="text-[#6b7280]" />
                                <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] uppercase tracking-wide">
                                  Code {question.rawAnswer.language ? `(${question.rawAnswer.language})` : ''}
                                </span>
                              </div>
                              <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-[8px] p-4 text-[12px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                {question.rawAnswer.code}
                              </pre>
                            </div>
                          )}
                          {question.rawAnswer.ai_feedback && (
                            <div className="flex items-start gap-2 px-3 py-2 rounded-[8px] bg-[#fffbeb] border border-[#fde68a]">
                              <AlertTriangle size={14} className="text-[#f59e0b] mt-0.5 flex-shrink-0" />
                              <span className="font-['Arimo',sans-serif] text-[13px] text-[#92400e]">{question.rawAnswer.ai_feedback}</span>
                            </div>
                          )}
                          {Array.isArray(question.rawAnswer.test_results) && question.rawAnswer.test_results.length > 0 && (
                            <div>
                              <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] uppercase tracking-wide mb-2">Test Results</div>
                              <div className="space-y-1.5">
                                {question.rawAnswer.test_results.map((t: any, ti: number) => (
                                  <div key={ti} className={`flex items-start gap-3 px-3 py-2 rounded-[8px] border text-[12px] font-['Arimo',sans-serif] ${
                                    t.passed ? 'bg-[#dcfce7] border-[#86efac] text-[#065f46]' : 'bg-[#fef2f2] border-[#fecaca] text-[#991b1b]'
                                  }`}>
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                                      t.passed ? 'bg-[#10b981] text-white' : 'bg-[#ef4444] text-white'
                                    }`}>{t.test_case ?? ti + 1}</span>
                                    <div className="flex-1 min-w-0">
                                      {t.passed ? (
                                        <span className="font-semibold">Passed</span>
                                      ) : t.error ? (
                                        <span className="break-words">{t.error}</span>
                                      ) : (
                                        <span>Expected: <strong>{t.expected}</strong> · Got: <strong>{t.actual || 'N/A'}</strong></span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Essay / fallback */
                        <div className="mb-3 space-y-2">
                          <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-[8px] p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText size={14} className="text-[#6b7280]" />
                              <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">CANDIDATE ANSWER</span>
                              {question.rawAnswer?.ai_score != null && (() => {
                                const pct = normalizeAiScore(question.rawAnswer.ai_score);
                                return (
                                  <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${scoreColor(pct)}`}>
                                    Score: {pct}/100
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151] leading-relaxed whitespace-pre-wrap">
                              {question.answer || 'No answer submitted'}
                            </p>
                          </div>
                          {/* Rubric accordion — essay only */}
                          {question.questionType === 'essay' && (question.rawAnswer?.ai_feedback || question.rawAnswer?.rubric || (question as any).rubric) && (
                            <EssayAccordion
                              rubric={(question as any).rubric || question.rawAnswer?.rubric}
                              aiFeedback={question.rawAnswer?.ai_feedback}
                              aiScore={question.rawAnswer?.ai_score}
                            />
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-[#6b7280]" />
                          <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                            {Math.floor(question.timeSpent / 60)}m {question.timeSpent % 60}s
                          </span>
                        </div>
                        {question.flagged && (
                          <div className="flex items-center gap-1">
                            <Flag size={14} className="text-[#ef4444]" />
                            <span className="font-['Arimo',sans-serif] text-[12px] text-[#ef4444]">
                              Flagged
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Middle Column - Metrics */}
            <div className="col-span-4 space-y-4">
              <h3 className="text-[#111827] text-[16px] mb-4">Performance Metrics</h3>

              {/* Score Breakdown */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-[#6366f1]" />
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Score Components
                  </h4>
                </div>
                <div className="space-y-3">
                  {performanceMetrics.map((component, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                          {component.label}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                          {component.value}%
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#f3f4f6] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${component.color} transition-all`}
                          style={{ width: `${component.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Time Analysis */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-[#6366f1]" />
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">Time Analysis</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-[#e5e7eb]">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Total Time</span>
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      {totalTimeSeconds !== null
                        ? fmtMinutes(totalTimeSeconds)
                        : assessmentStats?.duration || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[#e5e7eb]">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Avg per Question</span>
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      {avgSeconds !== null ? fmtSeconds(avgSeconds)
                        : avgTimeLegacySec !== null ? fmtSeconds(Math.round(avgTimeLegacySec))
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Response Time Chart — only show if per-question time data is available */}
              {totalTimeLegacy > 0 && (
                <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-4">
                    Response Times by Question
                  </h4>
                  <div className="flex items-end justify-between gap-2 h-[120px]">
                    {questions.map((question, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div
                          className={`w-full ${question.flagged ? 'bg-[#ef4444]' : 'bg-[#6366f1]'} rounded-t-[4px] transition-all hover:opacity-80`}
                          style={{ height: `${(question.timeSpent / 420) * 100}%` }}
                        />
                        <span className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280] mt-2">Q{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Integrity Signals */}
            <div className="col-span-3 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111827] text-[16px]">Integrity Signals</h3>
                <span className={`px-[8px] py-[2px] rounded-[4px] font-['Arimo',sans-serif] text-[11px] ${integritySignals.length > 0
                  ? 'bg-[#fef2f2] text-[#ef4444]'
                  : 'bg-[#dcfce7] text-[#10b981]'
                  }`}>
                  {integritySignals.length} alerts
                </span>
              </div>

              {integritySignals.length > 0 ? (
                <div className="space-y-3">
                  {integritySignals.map((signal) => (
                    <div
                      key={signal.id}
                      className={`border rounded-[12px] p-4 ${getSeverityColor(signal.severity)}`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-['Arimo',sans-serif] text-[13px] mb-1">
                            {signal.description}
                          </div>
                          <div className="font-['Arimo',sans-serif] text-[11px] opacity-80">
                            {signal.evidence}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] opacity-70">
                        <span className="font-['Arimo',sans-serif]">
                          {signal.timestamp}
                        </span>
                        <span className="font-['Arimo',sans-serif] uppercase">
                          {signal.severity}
                        </span>
                      </div>
                    </div>
                  ))}

                  <button className="w-full h-[36px] px-[14px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors">
                    Re-run Integrity Detection
                  </button>
                </div>
              ) : (
                <div className="bg-[#dcfce7] border border-[#86efac] rounded-[12px] p-6 text-center">
                  <CheckCircle size={32} className="text-[#10b981] mx-auto mb-3" />
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#10b981] mb-1">
                    No Issues Detected
                  </div>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#059669]">
                    Assessment completed without integrity concerns
                  </p>
                </div>
              )}

              {/* Notes Section */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={16} className="text-[#6b7280]" />
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Add Note
                  </h4>
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add internal notes about this assessment..."
                  className="w-full h-[100px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] text-[#111827] placeholder-[#9ca3af] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <button className="w-full mt-3 h-[32px] px-[14px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[13px] text-white transition-colors">
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>


        {/* Escalate Modal */}
        {showEscalateModal && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center" onClick={() => setShowEscalateModal(false)}>
            <div className="bg-white rounded-[12px] p-6 w-[400px]" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[#111827] text-[16px] mb-4">Escalate to HR</h3>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
                This will flag the assessment for HR review and notify the assigned recruiter.
              </p>
              <textarea
                placeholder="Reason for escalation..."
                className="w-full h-[80px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] mb-4 resize-none"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowEscalateModal(false)}
                  className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] text-[#111827]"
                >
                  Cancel
                </button>
                <button className="h-[36px] px-[16px] rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] font-['Arimo',sans-serif] text-[13px] text-white">
                  Escalate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}