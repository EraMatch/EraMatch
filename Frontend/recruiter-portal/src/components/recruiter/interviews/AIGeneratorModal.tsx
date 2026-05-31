import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Wand2, Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';
import { AIQuestionPreview } from './AIQuestionPreview';
import { recruiterService } from '../../../services/recruiter.service';
import { toast } from 'sonner';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code' | 'interview';
  [key: string]: any;
}

interface AIGeneratorModalProps {
  questionType?: 'mcq' | 'essay' | 'code' | 'interview';
  onGenerate: (question: QuestionVariant) => void;
  onClose: () => void;
  context?: any;
}

const GENERATOR_STORAGE_KEY = 'recruiter-ai-generator-settings-v1';

export function AIGeneratorModal({ questionType, onGenerate, onClose, context: externalContext }: AIGeneratorModalProps) {
  const effectiveType = (externalContext?.type || questionType || 'mcq') as 'mcq' | 'essay' | 'code' | 'interview';

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [context, setContext] = useState('');
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(1);
  const [topicTouched, setTopicTouched] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState('');
  const [generatedQuestion, setGeneratedQuestion] = useState<QuestionVariant | null>(null);
  const [generatedVariants, setGeneratedVariants] = useState<QuestionVariant[]>([]);
  const [normalizationWarnings, setNormalizationWarnings] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [savingToQB, setSavingToQB] = useState(false);
  // Multi-variant review state
  const [previewingIndex, setPreviewingIndex] = useState<number | null>(null);
  // index → approved (and possibly edited) variant
  const [approvedVariants, setApprovedVariants] = useState<Map<number, QuestionVariant>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const topicError = topicTouched && !topic.trim() ? 'Topic is required.' : null;
  const canGenerate = !!topic.trim() && !isGenerating;

  const normalizeGeneratedQuestion = useCallback(
    (rawQuestion: any): { question: QuestionVariant; warnings: string[] } => {
      const warnings: string[] = [];
      const normalized: any = {
        ...rawQuestion,
        type: rawQuestion?.type || effectiveType,
      };

      if (!normalized.questionText || typeof normalized.questionText !== 'string') {
        warnings.push('Missing question text was replaced with a fallback prompt.');
        normalized.questionText = `Please provide a ${effectiveType} question for ${topic.trim() || 'the selected topic'}.`;
      }

      if (effectiveType === 'mcq') {
        const options = Array.isArray(normalized.options) ? normalized.options.map((o: any) => String(o)) : [];
        if (options.length < 4) {
          warnings.push('MCQ options were padded to 4 choices.');
          while (options.length < 4) {
            options.push(`Option ${options.length + 1}`);
          }
        }
        normalized.options = options.slice(0, 4);

        if (typeof normalized.correctAnswer !== 'number' || normalized.correctAnswer < 0 || normalized.correctAnswer > 3) {
          warnings.push('MCQ correct answer index was normalized to 0.');
          normalized.correctAnswer = 0;
        }
      }

      if (effectiveType === 'essay') {
        if (!Number.isInteger(normalized.maxWords) || normalized.maxWords <= 0) {
          warnings.push('Essay max words was normalized to 500.');
          normalized.maxWords = 500;
        }
        if (!Array.isArray(normalized.expectedKeywords)) {
          warnings.push('Essay expected keywords was normalized to an empty array.');
          normalized.expectedKeywords = [];
        }
      }

      if (effectiveType === 'code') {
        if (!Array.isArray(normalized.testCases)) {
          warnings.push('Code test cases was normalized to an empty array.');
          normalized.testCases = [];
        }
        // Map backend field names to frontend conventions
        normalized.starterCode = normalized.starterCode || normalized.codeTemplate || '';
        normalized.codeTemplate = normalized.starterCode;
        normalized.questionExamples = normalized.questionExamples || normalized.examples || [];
        normalized.questionConstraints = normalized.questionConstraints || normalized.constraints || [];
      }

      return { question: normalized as QuestionVariant, warnings };
    },
    [effectiveType, topic]
  );

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(GENERATOR_STORAGE_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (typeof parsed.topic === 'string') setTopic(parsed.topic);
      if (parsed.difficulty === 'Easy' || parsed.difficulty === 'Medium' || parsed.difficulty === 'Hard') {
        setDifficulty(parsed.difficulty);
      }
      if (typeof parsed.context === 'string') setContext(parsed.context);
      if (parsed.variantCount === 1 || parsed.variantCount === 2 || parsed.variantCount === 3) {
        setVariantCount(parsed.variantCount);
      }
    } catch {
      // Ignore invalid persisted values.
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      GENERATOR_STORAGE_KEY,
      JSON.stringify({ topic, difficulty, context, variantCount })
    );
  }, [topic, difficulty, context, variantCount]);

  const handleClose = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const generateQuestion = useCallback(async () => {
    if (!topic.trim()) {
      setTopicTouched(true);
      setGenerationError('Please enter a topic before generating.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationStatus('Generating question(s) with AI...');
    setNormalizationWarnings([]);
    setGeneratedVariants([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const requestPayload = {
        question_type: effectiveType,
        topic: topic.trim(),
        difficulty,
        context,
        use_case: effectiveType === 'interview' ? 'recorded_interview_suggest' : 'assessment_question_generation',
        metadata: {
          variant_count: variantCount,
          source: 'ai_generator_modal',
        },
      };

      const responses = await Promise.all(
        Array.from({ length: variantCount }, () => recruiterService.generateAIQuestion(requestPayload, controller.signal))
      );

      const normalizedResults = responses.map((response) => normalizeGeneratedQuestion(response));
      const combinedWarnings = normalizedResults.flatMap((result) => result.warnings);
      const variants = normalizedResults.map((result) => result.question);

      setNormalizationWarnings(combinedWarnings);
      setGeneratedVariants(variants);
      setApprovedVariants(new Map());
      setPreviewingIndex(null);
      setGeneratedQuestion(variants[0] || null);

      if (combinedWarnings.length > 0) {
        toast.warning(`Generated with ${combinedWarnings.length} normalization warning(s).`);
      }

      if (variantCount === 1) {
        toast.success('AI question generated successfully. Opening preview...');
        setGenerationStatus('Generation complete. Opening preview...');
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!controller.signal.aborted) {
          setShowPreview(true);
        }
      } else {
        toast.success(`${variants.length} variants generated — preview and approve each one.`);
        setGenerationStatus(`${variants.length} variants ready. Preview and approve each before adding.`);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        setGenerationStatus('Generation canceled.');
        return;
      }
      console.error('Failed to generate AI question:', error);
      setGenerationError('Failed to generate AI question. Please try again.');
      setGenerationStatus('Generation failed.');
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }, [context, difficulty, effectiveType, normalizeGeneratedQuestion, topic, variantCount]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showPreview) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTextArea = tagName === 'TEXTAREA';

      if (event.key === 'Escape' && !isGenerating) {
        event.preventDefault();
        handleClose();
        return;
      }

      if (isGenerating) {
        return;
      }

      const shouldTriggerGenerate =
        (event.key === 'Enter' && !isTextArea && !event.ctrlKey && !event.metaKey && !event.shiftKey) ||
        (event.key === 'Enter' && isTextArea && (event.ctrlKey || event.metaKey));

      if (shouldTriggerGenerate) {
        event.preventDefault();
        void generateQuestion();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [generateQuestion, handleClose, isGenerating, showPreview]);

  const TYPE_LABEL: Record<string, string> = {
    code: 'Code',
    essay: 'Essay',
    mcq: 'Multiple Choice',
    interview: 'Multiple Choice',
  };

  const saveToQB = async (question: QuestionVariant): Promise<QuestionVariant> => {
    const qtype = effectiveType;
    try {
      const payload: Record<string, any> = {
        text: question.questionText,
        type: TYPE_LABEL[qtype] || 'Multiple Choice',
        difficulty: question.difficulty || 'Medium',
        category: question.category || '',
        tags: question.tags || [],
      };

      if (qtype === 'code') {
        payload.codeLanguage = (question.language || 'python').toLowerCase();
        payload.codeTemplate = question.starterCode || question.codeTemplate || '';
        payload.starterCode = question.starterCode || question.codeTemplate || '';
        payload.functionName = question.functionName || '';
        payload.testCases = question.testCases || [];
        payload.inputFormat = question.inputFormat || '';
        payload.outputFormat = question.outputFormat || '';
        payload.constraints = question.questionConstraints || (question as any).constraints || [];
        payload.examples = question.questionExamples || (question as any).examples || [];
        payload.topics = question.topics || [];
      } else if (qtype === 'essay') {
        payload.maxWords = question.maxWords || 500;
        payload.rubric = question.rubric || '';
        payload.expectedKeywords = question.expectedKeywords || [];
        payload.rubricYesNoChecks = question.rubricYesNoChecks || [];
        payload.evidence = question.evidence || '';
        payload.referenceAnswer = question.referenceAnswer || '';
      } else if (qtype === 'mcq') {
        payload.options = question.options || [];
        payload.correctAnswer = question.correctAnswer ?? 0;
        payload.multipleCorrect = question.multipleCorrect || false;
        payload.explanation = question.explanation || '';
      }

      const saved = await recruiterService.createQuestionBank(payload);
      return { ...question, id: saved.id };
    } catch {
      return question;
    }
  };

  // Single variant accepted from preview — close modal
  const handleAcceptQuestion = async (question: QuestionVariant) => {
    setSavingToQB(true);
    const final = await saveToQB(question);
    setSavingToQB(false);
    onGenerate(final);
    setShowPreview(false);
    setGeneratedQuestion(null);
    setGeneratedVariants([]);
  };

  // Called from approve-mode preview — mark variant approved + return to list
  const handleApproveVariant = (index: number, question: QuestionVariant) => {
    setApprovedVariants(prev => new Map(prev).set(index, question));
    setPreviewingIndex(null);
  };

  // Add all approved variants — saves code types to QB, then calls onGenerate for each
  const handleAddApproved = async () => {
    if (approvedVariants.size === 0) return;
    setSavingToQB(true);
    const toAdd: QuestionVariant[] = [];
    for (const [, q] of approvedVariants) {
      toAdd.push(await saveToQB(q));
    }
    setSavingToQB(false);
    toAdd.forEach(q => onGenerate(q));
    setGeneratedVariants([]);
    setApprovedVariants(new Map());
    setPreviewingIndex(null);
  };

  const handleRegenerate = () => {
    setShowPreview(false);
    setGeneratedQuestion(null);
    void generateQuestion();
  };

  const handleClosePreview = () => setShowPreview(false);
  const handleRetry = () => void generateQuestion();

  // Single-variant auto-preview (count=1) → accept closes modal
  if (showPreview && generatedQuestion) {
    return (
      <AIQuestionPreview
        question={generatedQuestion}
        onAccept={handleAcceptQuestion}
        onRegenerate={handleRegenerate}
        onClose={handleClosePreview}
      />
    );
  }

  // Multi-variant per-card preview → approve marks it, returns to list
  if (previewingIndex !== null && generatedVariants[previewingIndex]) {
    return (
      <AIQuestionPreview
        question={generatedVariants[previewingIndex]}
        onAccept={(q) => handleApproveVariant(previewingIndex, q)}
        onClose={() => setPreviewingIndex(null)}
        approveMode
      />
    );
  }

  const typeConfig = {
    mcq: { label: 'Multiple Choice', color: 'blue', hint: '4 options · correct answer · explanation' },
    essay: { label: 'Essay', color: 'purple', hint: 'rubric · keywords · word limit' },
    code: { label: 'Coding (Python)', color: 'emerald', hint: 'problem · starter code · 6+ test cases · function name' },
    interview: { label: 'Interview', color: 'orange', hint: 'question · evaluation criteria · key points' },
  }[effectiveType] || { label: effectiveType, color: 'gray', hint: '' };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" aria-busy={isGenerating}>
      <div className="bg-white rounded-[16px] shadow-2xl max-w-xl w-full flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#e5e7eb] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <Wand2 size={17} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[#111827] text-[16px]">Generate with AI</h2>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    effectiveType === 'code' ? 'bg-emerald-100 text-emerald-700' :
                    effectiveType === 'mcq' ? 'bg-blue-100 text-blue-700' :
                    effectiveType === 'essay' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {typeConfig.label}
                  </span>
                </div>
                <p className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af] mt-0.5">
                  {typeConfig.hint}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isGenerating}
              className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
              aria-label="Close AI generator"
            >
              <X size={18} className="text-[#6b7280]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="space-y-5">
            {/* Topic */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] font-medium text-[#374151] mb-1.5">
                Topic *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onBlur={() => setTopicTouched(true)}
                disabled={isGenerating}
                placeholder={effectiveType === 'code'
                  ? 'e.g., Two Sum, Sliding Window, Binary Search...'
                  : 'e.g., React Hooks, Database Normalization, REST APIs...'}
                className="w-full h-[42px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                autoFocus
              />
              {topicError && (
                <p className="mt-1.5 font-['Arimo',sans-serif] text-[12px] text-red-600" role="alert">{topicError}</p>
              )}
            </div>

            {/* Difficulty + Count row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-['Arimo',sans-serif] text-[13px] font-medium text-[#374151] mb-1.5">
                  Difficulty
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Easy', 'Medium', 'Hard'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      disabled={isGenerating}
                      className={`h-[36px] rounded-[7px] border-2 transition-all font-['Arimo',sans-serif] text-[12px] font-medium ${difficulty === level
                        ? level === 'Easy' ? 'border-green-500 bg-green-50 text-green-700'
                          : level === 'Medium' ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1]/40'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[13px] font-medium text-[#374151] mb-1.5">
                  Generate
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      onClick={() => setVariantCount(count as 1 | 2 | 3)}
                      disabled={isGenerating}
                      className={`flex-1 h-[36px] rounded-[7px] border-2 text-[12px] font-medium font-['Arimo',sans-serif] transition-colors ${
                        variantCount === count
                          ? 'border-[#6366f1] bg-[#ede9fe] text-[#6366f1]'
                          : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1]/40'
                      }`}
                    >
                      {count}×
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Additional Context */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] font-medium text-[#374151] mb-1.5">
                Context <span className="text-[#9ca3af] font-normal">(optional)</span>
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={isGenerating}
                placeholder={effectiveType === 'code'
                  ? 'e.g., Focus on O(n) time complexity, avoid sorting...'
                  : 'e.g., For senior engineers, focus on distributed systems...'}
                rows={2}
                className="w-full px-4 py-2.5 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
            </div>

            {/* AI will generate — compact */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] bg-[#f9fafb] border border-[#e5e7eb]">
              <Sparkles size={14} className="text-[#6366f1] flex-shrink-0" />
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                {effectiveType === 'code'
                  ? 'AI generates: problem statement · Python function stub · I/O format · examples · constraints · 6+ test cases (hidden + visible) · reference solution'
                  : effectiveType === 'mcq'
                  ? 'AI generates: question text · 4 answer options · correct answer · explanation'
                  : effectiveType === 'essay'
                  ? 'AI generates: question text · grading rubric · 10 yes/no rubric checks · expected keywords'
                  : 'AI generates: interview questions · evaluation criteria'
                }
              </p>
            </div>

            {isGenerating && (
              <div className="p-3 border border-[#6366f1]/20 bg-[#f5f3ff] rounded-[10px]" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#4f46e5]">
                    Generating{variantCount > 1 ? ` ${variantCount} variants` : ''}… this takes a few seconds.
                  </p>
                </div>
              </div>
            )}

            {generationError && (
              <div className="p-3 border border-red-200 bg-red-50 rounded-[8px]">
                <p className="font-['Arimo',sans-serif] text-[13px] text-red-700 mb-2" role="alert">{generationError}</p>
                <Button variant="outline" className="rounded-[8px]" onClick={handleRetry} disabled={isGenerating}>
                  Retry
                </Button>
              </div>
            )}

            {normalizationWarnings.length > 0 && (
              <div className="p-3 border border-amber-200 bg-amber-50 rounded-[8px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-['Arimo',sans-serif]">Normalized Output</span>
                </div>
                <ul className="font-['Arimo',sans-serif] text-[12px] text-amber-900 list-disc list-inside space-y-1">
                  {normalizationWarnings.slice(0, 3).map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {!isGenerating && generatedVariants.length > 1 && (
              <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fcfcff] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
                  <h3 className="font-['Arimo',sans-serif] text-[13px] font-medium text-[#111827]">
                    {generatedVariants.length} variants generated
                  </h3>
                  <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Preview each, then approve
                  </span>
                </div>
                <div className="divide-y divide-[#f3f4f6]">
                  {generatedVariants.map((variant, index) => {
                    const isApproved = approvedVariants.has(index);
                    return (
                      <div
                        key={`variant-${index}`}
                        className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                          isApproved ? 'bg-emerald-50/60' : 'bg-white hover:bg-[#f9fafb]'
                        }`}
                      >
                        {/* Approve toggle */}
                        <button
                          onClick={() => {
                            if (isApproved) {
                              setApprovedVariants(prev => {
                                const n = new Map(prev); n.delete(index); return n;
                              });
                            } else {
                              setApprovedVariants(prev => new Map(prev).set(index, variant));
                            }
                          }}
                          className={`mt-0.5 w-5 h-5 rounded-[4px] border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            isApproved
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-[#d1d5db] hover:border-[#6366f1]'
                          }`}
                          title={isApproved ? 'Remove approval' : 'Approve without preview'}
                        >
                          {isApproved && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>

                        {/* Question preview */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-['Arimo',sans-serif] text-[11px] text-[#9ca3af]">
                              Variant {index + 1}
                            </span>
                            {isApproved && (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                                Approved
                              </span>
                            )}
                          </div>
                          <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151] line-clamp-2">
                            {variant.questionText}
                          </p>
                        </div>

                        {/* Preview button */}
                        <button
                          onClick={() => setPreviewingIndex(index)}
                          className="flex-shrink-0 h-7 px-3 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#6b7280] hover:border-[#6366f1] hover:text-[#6366f1] transition-colors"
                        >
                          Preview
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Approval summary */}
                <div className="px-4 py-3 border-t border-[#e5e7eb] flex items-center justify-between bg-white">
                  <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    {approvedVariants.size} of {generatedVariants.length} approved
                  </span>
                  <Button
                    onClick={() => void handleAddApproved()}
                    disabled={approvedVariants.size === 0 || savingToQB}
                    className="h-[32px] px-4 rounded-[7px] bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[12px] disabled:opacity-50"
                  >
                    {savingToQB
                      ? 'Saving...'
                      : `Add ${approvedVariants.size > 0 ? approvedVariants.size + ' ' : ''}approved`
                    }
                  </Button>
                </div>
              </div>
            )}

            <div className="sr-only" aria-live="polite">{generationStatus}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af]">
              Press Enter to generate
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="rounded-[8px] h-[38px] px-4 text-[13px]"
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void generateQuestion()}
                className="rounded-[8px] h-[38px] px-5 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[13px]"
                disabled={!canGenerate}
              >
                {isGenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 size={14} className="mr-2" />
                    {variantCount === 1 ? 'Generate' : `Generate ${variantCount}×`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
