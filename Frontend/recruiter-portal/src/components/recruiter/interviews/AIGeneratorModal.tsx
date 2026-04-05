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
  onGenerate: (question: any) => void;
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
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [normalizationWarnings, setNormalizationWarnings] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const topicError = topicTouched && !topic.trim() ? 'Topic is required.' : null;
  const canGenerate = !!topic.trim() && !isGenerating;

  const metadataLabel = useMemo(
    () => `Using Ollama | Type: ${effectiveType.toUpperCase()} | Difficulty: ${difficulty} | Variants: ${variantCount}`,
    [effectiveType, difficulty, variantCount]
  );

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
        if (typeof normalized.codeTemplate !== 'string') {
          warnings.push('Code template was normalized to an empty template.');
          normalized.codeTemplate = '';
        }
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
    setGenerationStatus('Generating question(s) with Ollama...');
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
      };

      const responses = await Promise.all(
        Array.from({ length: variantCount }, () => recruiterService.generateAIQuestion(requestPayload, controller.signal))
      );

      const normalizedResults = responses.map((response) => normalizeGeneratedQuestion(response));
      const combinedWarnings = normalizedResults.flatMap((result) => result.warnings);
      const variants = normalizedResults.map((result) => result.question);

      setNormalizationWarnings(combinedWarnings);
      setGeneratedVariants(variants);
      setSelectedVariantIndex(0);
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
        toast.success(`Generated ${variants.length} variants. Select one to preview.`);
        setGenerationStatus(`Generated ${variants.length} variants. Select your preferred draft.`);
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

  const handleAcceptQuestion = (question: QuestionVariant) => {
    onGenerate(question);
    setShowPreview(false);
    setGeneratedQuestion(null);
    setGeneratedVariants([]);
    setSelectedVariantIndex(0);
  };

  const handleRegenerate = () => {
    setShowPreview(false);
    setGeneratedQuestion(null);
    void generateQuestion();
  };

  const handleClosePreview = () => {
    setShowPreview(false);
  };

  const handleRetry = () => {
    void generateQuestion();
  };

  const handlePreviewSelectedVariant = () => {
    if (!generatedVariants[selectedVariantIndex]) {
      return;
    }
    setGeneratedQuestion(generatedVariants[selectedVariantIndex]);
    setShowPreview(true);
  };

  if (showPreview && generatedQuestion) {
    return (
      <AIQuestionPreview
        question={generatedQuestion}
        onAccept={handleAcceptQuestion}
        onRegenerate={handleRegenerate}
        onClose={handleClosePreview}
        references={[
          `${topic} - Official Documentation`,
          'Industry Best Practices and Standards',
          'Academic Research and Technical Papers',
          'Community Guidelines and Recommendations'
        ]}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" aria-busy={isGenerating}>
      <div className="bg-white rounded-[16px] shadow-2xl max-w-2xl w-full">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Wand2 size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-[#111827]">AI Question Generator</h2>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Generate a {effectiveType === 'mcq' ? 'multiple choice' : effectiveType} question with AI
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isGenerating}
              className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
              aria-label="Close AI generator"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="space-y-6">
            {/* Topic */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Topic or Concept *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onBlur={() => setTopicTouched(true)}
                disabled={isGenerating}
                placeholder="e.g., React Hooks, Database Normalization, Binary Search..."
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
              {topicError && (
                <p className="mt-2 font-['Arimo',sans-serif] text-[12px] text-red-700" role="alert">{topicError}</p>
              )}
            </div>

            {/* Difficulty */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-3">
                Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['Easy', 'Medium', 'Hard'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setDifficulty(level)}
                    disabled={isGenerating}
                    className={`h-[44px] rounded-[8px] border-2 transition-all font-['Arimo',sans-serif] text-[14px] ${difficulty === level
                      ? level === 'Easy'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : level === 'Medium'
                          ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-purple-300'
                      }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Generation Mode
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    onClick={() => setVariantCount(count as 1 | 2 | 3)}
                    disabled={isGenerating}
                    className={`h-[36px] px-4 rounded-[8px] border text-[13px] font-['Arimo',sans-serif] transition-colors ${
                      variantCount === count
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-[#e5e7eb] text-[#6b7280] hover:border-purple-300'
                    }`}
                  >
                    {count} Variant{count > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 py-2 rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb]">
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#4b5563]">{metadataLabel}</p>
            </div>

            {/* Additional Context */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Additional Context (Optional)
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={isGenerating}
                placeholder="Provide any specific requirements, focus areas, or constraints..."
                rows={3}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>

            {/* AI Info Box */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-[12px]">
              <div className="flex items-start gap-3">
                <Sparkles size={20} className="text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-['Arimo',sans-serif] text-[13px] text-purple-900 mb-1">
                    <strong>AI will generate:</strong>
                  </p>
                  <ul className="font-['Arimo',sans-serif] text-[13px] text-purple-800 list-disc list-inside space-y-1">
                    {effectiveType === 'mcq' && (
                      <>
                        <li>A relevant multiple-choice question</li>
                        <li>4 plausible options with marked correct answer</li>
                        <li>An explanation for the correct answer</li>
                        <li>References from trusted sources</li>
                      </>
                    )}
                    {effectiveType === 'essay' && (
                      <>
                        <li>A thought-provoking essay question</li>
                        <li>Grading rubric with key evaluation criteria</li>
                        <li>Expected keywords and concepts</li>
                        <li>References from academic sources</li>
                      </>
                    )}
                    {effectiveType === 'code' && (
                      <>
                        <li>A coding problem with clear requirements</li>
                        <li>Code template in your preferred language</li>
                        <li>Test cases for validation</li>
                        <li>References to relevant documentation</li>
                      </>
                    )}
                    {effectiveType === 'interview' && (
                      <>
                        <li>Relevant interview questions</li>
                        <li>Evaluation criteria and key points</li>
                        <li>Tailored to the selected difficulty</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {isGenerating && (
              <div className="p-4 border border-indigo-200 bg-indigo-50 rounded-[12px]" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <p className="font-['Arimo',sans-serif] text-[13px] text-indigo-900">
                    Generating question with Ollama. This may take a few seconds.
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
              <div className="p-4 border border-[#e5e7eb] rounded-[12px] bg-[#fcfcff]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">Select a Variant</h3>
                  <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">{generatedVariants.length} generated</span>
                </div>
                <div className="space-y-2 mb-4">
                  {generatedVariants.map((variant, index) => (
                    <button
                      key={`variant-${index}`}
                      onClick={() => setSelectedVariantIndex(index)}
                      className={`w-full p-3 rounded-[8px] border text-left transition-colors ${
                        selectedVariantIndex === index
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-[#e5e7eb] hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Variant {index + 1}</span>
                        {selectedVariantIndex === index && (
                          <span className="font-['Arimo',sans-serif] text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Selected</span>
                        )}
                      </div>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#111827] line-clamp-2">
                        {variant.questionText}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-end">
                  <Button className="rounded-[8px]" onClick={handlePreviewSelectedVariant}>
                    Preview Selected
                  </Button>
                </div>
              </div>
            )}

            <div className="sr-only" aria-live="polite">{generationStatus}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleClose}
              className="rounded-[8px]"
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void generateQuestion()}
              className="rounded-[8px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              disabled={!canGenerate}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 size={16} className="mr-2" />
                  {variantCount === 1 ? 'Generate Question' : `Generate ${variantCount} Variants`}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
