import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, GripVertical, Eye, Loader2, Sparkles, RefreshCw, X } from 'lucide-react';
import { api } from '../../../services/api';
import { recruiterService } from '../../../services/recruiter.service';
import { toast } from 'sonner';

interface RecordedInterviewQuestionSetupProps {
  groupName: string;
  onBack: () => void;
  onSave: (questions: any[]) => void;
  initialQuestions?: { id: string; text: string; duration: number; rubricYesNoChecks?: RubricCheck[] }[];
  positionContext?: {
    positionTitle?: string;
    jobDescription?: string;
    requiredSkills?: string[];
    experienceLevel?: string;
    yearsOfExperience?: number;
  };
}

interface RubricCheck {
  id: number;
  check: string;
  weight: number;
}

interface Question {
  id: string;
  text: string;
  duration: number;
  rubricChecks: RubricCheck[];
}

export function RecordedInterviewQuestionSetup({
  groupName,
  onBack,
  onSave,
  initialQuestions,
  positionContext
}: RecordedInterviewQuestionSetupProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [isRefining, setIsRefining] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestingRubricFor, setSuggestingRubricFor] = useState<string | null>(null);
  const [aiSuggestedQuestions, setAiSuggestedQuestions] = useState<Array<{ text: string; duration: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const createBlankQuestion = (): Question => ({
    id: Date.now().toString(),
    text: '',
    duration: 120,
    rubricChecks: [],
  });

  const buildSuggestedQuestion = (text: string): { text: string; duration: number } => {
    const normalizedText = text.trim();
    const charCount = normalizedText.length;
    const computedDuration = Math.max(90, Math.min(240, Math.ceil(charCount / 35) * 30));
    return { text: normalizedText, duration: computedDuration };
  };

  const generateSuggestedQuestions = async () => {
    setIsSuggesting(true);
    try {
      const contextParts = [
        `Group: ${groupName}`,
        positionContext?.positionTitle ? `Position title: ${positionContext.positionTitle}` : '',
        positionContext?.experienceLevel ? `Experience level: ${positionContext.experienceLevel}` : '',
        typeof positionContext?.yearsOfExperience === 'number' ? `Years of experience: ${positionContext.yearsOfExperience}` : '',
        positionContext?.requiredSkills?.length ? `Required skills: ${positionContext.requiredSkills.join(', ')}` : '',
        positionContext?.jobDescription ? `Job description:\n${positionContext.jobDescription}` : '',
        'Generate concise, role-relevant open-ended screening questions for a recorded video interview.',
      ].filter(Boolean).join('\n\n');

      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          recruiterService.generateAIQuestion({
            question_type: 'interview',
            topic: positionContext?.positionTitle || groupName,
            difficulty: 'Medium',
            context: contextParts,
            use_case: 'recorded_interview_suggest',
            metadata: {
              group_name: groupName,
              position_title: positionContext?.positionTitle,
              job_description: positionContext?.jobDescription,
              required_skills: positionContext?.requiredSkills || [],
              experience_level: positionContext?.experienceLevel,
              years_of_experience: positionContext?.yearsOfExperience,
              desired_count: 8,
            },
          })
        )
      );

      const collected: Array<{ text: string; duration: number }> = [];
      for (const response of responses as any[]) {
        const interviewQuestions = Array.isArray(response?.questions) ? response.questions : [];
        for (const item of interviewQuestions) {
          const questionText = typeof item?.question === 'string' ? item.question : '';
          if (questionText.trim()) {
            collected.push(buildSuggestedQuestion(questionText));
          }
        }
        if (typeof response?.questionText === 'string' && response.questionText.trim()) {
          collected.push(buildSuggestedQuestion(response.questionText));
        }
      }

      const deduped = Array.from(
        new Map(collected.map((item) => [item.text.toLowerCase(), item])).values()
      ).slice(0, 8);

      if (deduped.length === 0) {
        toast.error('No AI suggestions returned. Please try again.');
      }
      setAiSuggestedQuestions(deduped);
    } catch (error) {
      console.error('Failed to generate suggested interview questions:', error);
      toast.error('Failed to generate AI suggestions');
    } finally {
      setIsSuggesting(false);
    }
  };

  const openSuggestModal = () => {
    setShowSuggestModal(true);
    if (aiSuggestedQuestions.length === 0) {
      void generateSuggestedQuestions();
    }
  };

  useEffect(() => {
    if (initialQuestions && initialQuestions.length > 0) {
      setQuestions(initialQuestions.map((q, i) => ({
        id: q.id || String(i + 1),
        text: q.text,
        duration: q.duration || 120,
        rubricChecks: Array.isArray(q.rubricYesNoChecks) ? q.rubricYesNoChecks : [],
      })));
      setIsLoading(false);
      return;
    }

    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        const data = (await api.recruiter.getRecordedInterviewQuestions('new')) as any[];
        const mappedQuestions: Question[] = data.map((q: any) => ({
          id: String(q.id),
          text: q.question || q.text,
          duration: q.recordingTime || q.duration || 120,
          rubricChecks: Array.isArray(q.rubricYesNoChecks) ? q.rubricYesNoChecks : [],
        }));
        setQuestions(mappedQuestions);
      } catch (error) {
        console.error('Failed to fetch recorded interview questions:', error);
        setQuestions([
          { id: '1', text: 'Tell me about your professional background and key accomplishments.', duration: 120, rubricChecks: [] },
          { id: '2', text: 'Describe a challenging technical problem you solved recently.', duration: 180, rubricChecks: [] },
          { id: '3', text: 'What interests you most about this role?', duration: 120, rubricChecks: [] },
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuestions();
  }, []);

  const handleAddQuestion = () => setQuestions(prev => [...prev, createBlankQuestion()]);

  const handleRemoveQuestion = (id: string) => {
    if (questions.length > 1) {
      setQuestions(questions.filter(q => q.id !== id));
    }
  };

  const handleQuestionChange = (id: string, field: 'text' | 'duration', value: string | number) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  // ── Rubric helpers ────────────────────────────────────────────────────────

  const updateRubricCheck = (qId: string, ci: number, field: 'check' | 'weight', value: string | number) => {
    setQuestions(prev => prev.map(q =>
      q.id !== qId ? q : {
        ...q,
        rubricChecks: q.rubricChecks.map((c, i) => i !== ci ? c : { ...c, [field]: value }),
      }
    ));
  };

  const addRubricCheck = (qId: string) => {
    setQuestions(prev => prev.map(q =>
      q.id !== qId ? q : {
        ...q,
        rubricChecks: [...q.rubricChecks, { id: Date.now(), check: '', weight: 0 }],
      }
    ));
  };

  const removeRubricCheck = (qId: string, ci: number) => {
    setQuestions(prev => prev.map(q =>
      q.id !== qId ? q : { ...q, rubricChecks: q.rubricChecks.filter((_, i) => i !== ci) }
    ));
  };

  const totalWeight = (q: Question) =>
    Math.round(q.rubricChecks.reduce((s, c) => s + (Number(c.weight) || 0), 0) * 1000) / 1000;

  const handleSuggestRubric = async (q: Question) => {
    if (!q.text.trim()) return;
    setSuggestingRubricFor(q.id);
    try {
      const res = await recruiterService.suggestQuestionRubric(q.text, {
        context: {
          position_title: positionContext?.positionTitle,
          job_description: positionContext?.jobDescription,
          group_name: groupName,
          experience_level: positionContext?.experienceLevel,
        },
      });
      if (res?.rubric_checks?.length) {
        setQuestions(prev => prev.map(qq =>
          qq.id !== q.id ? qq : { ...qq, rubricChecks: res.rubric_checks }
        ));
        toast.success('Rubric criteria suggested');
      }
    } catch (e) {
      console.error('Failed to suggest rubric:', e);
      toast.error('Failed to suggest criteria');
    } finally {
      setSuggestingRubricFor(null);
    }
  };

  const handleSave = () => {
    onSave(questions.map(q => ({
      id: q.id,
      text: q.text,
      duration: q.duration,
      rubricYesNoChecks: q.rubricChecks.length > 0 ? q.rubricChecks : undefined,
    })));
  };

  const totalDuration = questions.reduce((sum, q) => sum + q.duration, 0);

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[900px] mx-auto px-[48px] py-[24px]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back to Interview Setup</span>
        </button>

        <div className="mb-8">
          <h1 className="text-[#111827] mb-2">Recorded Interview Questions</h1>
          <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">
            Configure questions for {groupName}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Total interview time:</span>
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
              {Math.floor(totalDuration / 60)} min {totalDuration % 60} sec
            </span>
            <span className="text-[#e5e7eb] mx-2">|</span>
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              {questions.length} question{questions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111827]">Interview Questions</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={openSuggestModal}
                  className="flex items-center gap-2 h-[36px] px-[16px] rounded-[8px] border border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#faf5ff] transition-colors"
                >
                  <Sparkles size={16} />
                  <span className="font-['Arimo',sans-serif] text-[13px]">Suggest Questions</span>
                </button>
                <button
                  onClick={handleAddQuestion}
                  className="flex items-center gap-2 h-[36px] px-[16px] rounded-[8px] border border-[#6366f1] text-[#6366f1] hover:bg-[#ede9fe] transition-colors"
                >
                  <Plus size={16} />
                  <span className="font-['Arimo',sans-serif] text-[13px]">Add Question</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  className="border border-[#e5e7eb] rounded-[8px] p-4 hover:bg-[#f9fafb] transition-colors"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <GripVertical size={18} className="text-[#9ca3af] cursor-grab mt-3 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Question {index + 1}
                        </span>
                      </div>
                      {/* Question text */}
                      <div className="relative">
                        <textarea
                          value={question.text}
                          onChange={(e) => handleQuestionChange(question.id, 'text', e.target.value)}
                          rows={2}
                          placeholder="Enter your question..."
                          className="w-full px-3 py-2 pr-10 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                        />
                        <button
                          title="Fix text with AI"
                          disabled={isRefining === question.id || !question.text.trim()}
                          onClick={async () => {
                            if (!question.text.trim()) return;
                            setIsRefining(question.id);
                            try {
                              const response = await recruiterService.enhanceText(question.text, {
                                useCase: 'recorded_interview_question',
                                metadata: { group_name: groupName },
                              });
                              handleQuestionChange(question.id, 'text', response?.enhancedText || question.text);
                              toast.success('Question refined with AI!');
                            } catch (error) {
                              console.error('Failed to refine question:', error);
                              toast.error('Failed to refine question');
                            } finally {
                              setIsRefining(null);
                            }
                          }}
                          className="absolute right-2 top-2 p-1.5 text-[#8b5cf6] hover:bg-[#8b5cf6]/10 rounded-md transition-colors disabled:opacity-50"
                        >
                          {isRefining === question.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Sparkles size={16} />
                          )}
                        </button>
                      </div>

                      {/* Duration */}
                      <div className="flex items-center gap-3 mt-3">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Duration:</span>
                        <input
                          type="number"
                          value={question.duration}
                          onChange={(e) => handleQuestionChange(question.id, 'duration', parseInt(e.target.value) || 0)}
                          min={30}
                          max={300}
                          step={30}
                          className="w-[80px] px-3 py-1.5 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                        />
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          seconds ({Math.floor(question.duration / 60)}:{(question.duration % 60).toString().padStart(2, '0')})
                        </span>
                      </div>

                      {/* ── Rubric Criteria ───────────────────────────────── */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide">
                            Rubric Criteria
                            <span className="ml-1 font-normal text-[#9ca3af]">(weights must sum to 1.0)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleSuggestRubric(question)}
                            disabled={!question.text.trim() || suggestingRubricFor === question.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#eef2ff] text-[#4f46e5] rounded-[6px] text-[11px] font-semibold disabled:opacity-50 hover:bg-[#e0e7ff] transition-colors"
                          >
                            {suggestingRubricFor === question.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <Sparkles size={11} />}
                            Suggest criteria
                          </button>
                        </div>

                        {question.rubricChecks.length > 0 && (
                          <div className="border border-[#e5e7eb] rounded-[8px] overflow-hidden mb-2">
                            {/* Header */}
                            <div className="grid gap-2 px-3 py-2 bg-[#f9fafb] border-b border-[#e5e7eb]" style={{ gridTemplateColumns: '1fr 72px 28px' }}>
                              <span className="text-[10px] font-bold uppercase text-[#9ca3af]">Does the answer...</span>
                              <span className="text-[10px] font-bold uppercase text-[#9ca3af] text-center">Weight</span>
                              <span />
                            </div>
                            {/* Rows */}
                            {question.rubricChecks.map((c, ci) => (
                              <div
                                key={c.id}
                                className="grid gap-2 px-3 py-2 border-b border-[#f3f4f6] items-center last:border-0"
                                style={{ gridTemplateColumns: '1fr 72px 28px' }}
                              >
                                <input
                                  type="text"
                                  value={c.check}
                                  onChange={e => updateRubricCheck(question.id, ci, 'check', e.target.value)}
                                  placeholder="...explain this with a concrete example?"
                                  className="w-full text-[12px] border border-[#e5e7eb] rounded-[5px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#6366f1] font-['Arimo',sans-serif]"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={1}
                                  step={0.05}
                                  value={c.weight}
                                  onChange={e => updateRubricCheck(question.id, ci, 'weight', parseFloat(e.target.value) || 0)}
                                  className="w-full text-[12px] border border-[#e5e7eb] rounded-[5px] px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-[#6366f1] font-['Arimo',sans-serif]"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeRubricCheck(question.id, ci)}
                                  className="flex items-center justify-center text-[#ef4444] hover:text-[#dc2626]"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                            {/* Footer */}
                            <div className="flex items-center justify-between px-3 py-2 bg-[#f9fafb] border-t border-[#e5e7eb]">
                              <button
                                type="button"
                                onClick={() => addRubricCheck(question.id)}
                                disabled={question.rubricChecks.length >= 8}
                                className="flex items-center gap-1 text-[11px] text-[#6366f1] border border-dashed border-[#c7d2fe] rounded-[5px] px-2.5 py-1 hover:bg-[#eef2ff] disabled:opacity-40 font-['Arimo',sans-serif]"
                              >
                                <Plus size={11} /> Add criterion
                              </button>
                              <span className={`text-[12px] font-semibold font-['Arimo',sans-serif] ${Math.abs(totalWeight(question) - 1) < 0.01 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                                {Math.abs(totalWeight(question) - 1) < 0.01 ? '✓' : '⚠'} Total: {totalWeight(question).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}

                        {question.rubricChecks.length === 0 && (
                          <p className="text-[11px] text-[#9ca3af] italic font-['Arimo',sans-serif]">
                            No criteria yet — click "Suggest criteria" or add manually.
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveQuestion(question.id)}
                      disabled={questions.length === 1}
                      className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#fef2f2] text-[#ef4444] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-[#f9fafb] rounded-[8px] border border-[#e5e7eb]">
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                <strong>Tip:</strong> Questions will be presented to candidates in this order.
                Rubric criteria are used by the AI judge to score each video answer with citations.
              </p>
            </div>
          </div>

          {/* Quick Add Templates */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <h3 className="text-[#111827] mb-3">Quick Add Templates</h3>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
              Click to add commonly used interview questions
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { title: 'Project Overview', desc: 'Recent work experience', text: 'Walk me through your most recent project from start to finish.', duration: 180 },
                { title: 'Teamwork & Collaboration', desc: 'Soft skills assessment', text: 'Describe a time when you had to work with a difficult team member.', duration: 120 },
                { title: 'Compensation', desc: 'Salary discussion', text: 'What are your salary expectations for this role?', duration: 90 },
                { title: 'Company Interest', desc: 'Motivation check', text: 'Why do you want to work for our company?', duration: 120 },
              ].map(t => (
                <button
                  key={t.title}
                  onClick={() => setQuestions(prev => [...prev, { id: Date.now().toString(), text: t.text, duration: t.duration, rubricChecks: [] }])}
                  className="p-3 rounded-[8px] border border-[#e5e7eb] hover:border-[#8b5cf6] hover:bg-[#faf5ff] text-left transition-all"
                >
                  <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-1">{t.title}</div>
                  <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6">
            <button
              onClick={onBack}
              className="h-[48px] px-[24px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className="h-[48px] px-[24px] rounded-[8px] border border-[#6366f1] text-[#6366f1] hover:bg-[#ede9fe] font-['Arimo',sans-serif] text-[14px] transition-colors flex items-center gap-2"
            >
              <Eye size={18} />
              Preview
            </button>
            <button
              onClick={handleSave}
              disabled={questions.some(q => !q.text.trim())}
              className="flex-1 h-[48px] rounded-[8px] bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              Save AI Interview
            </button>
          </div>
        </div>
      </div>

      {/* AI Suggest Questions Modal */}
      {showSuggestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[#faf5ff] flex items-center justify-center">
                  <Sparkles size={18} className="text-[#8b5cf6]" />
                </div>
                <h3 className="text-[#111827] text-[20px]">AI Question Suggestions</h3>
              </div>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mt-1">
                Click any question to add it to your interview
              </p>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6 space-y-3">
              {isSuggesting && (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <Loader2 size={28} className="animate-spin text-[#8b5cf6] mb-3" />
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Generating suggestions...</p>
                </div>
              )}
              {!isSuggesting && aiSuggestedQuestions.length === 0 && (
                <div className="py-10 text-center border border-dashed border-[#d1d5db] rounded-[10px]">
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-3">No suggestions available yet.</p>
                  <button
                    onClick={() => void generateSuggestedQuestions()}
                    className="inline-flex items-center gap-2 h-[36px] px-[14px] rounded-[8px] border border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#faf5ff] transition-colors"
                  >
                    <RefreshCw size={14} />
                    <span className="font-['Arimo',sans-serif] text-[13px]">Try Again</span>
                  </button>
                </div>
              )}
              {!isSuggesting && aiSuggestedQuestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.text}-${index}`}
                  onClick={() => {
                    setQuestions(prev => [...prev, { id: Date.now().toString() + index, text: suggestion.text, duration: suggestion.duration, rubricChecks: [] }]);
                    setShowSuggestModal(false);
                  }}
                  className="w-full p-4 rounded-[10px] border border-[#e5e7eb] hover:border-[#8b5cf6] hover:bg-[#faf5ff] text-left transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] flex-1">{suggestion.text}</p>
                    <span className="font-['Arimo',sans-serif] text-[12px] text-[#8b5cf6] group-hover:text-[#7c3aed] whitespace-nowrap flex-shrink-0 bg-[#ede9fe] px-2 py-1 rounded-md">
                      {Math.floor(suggestion.duration / 60)}:{(suggestion.duration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <Plus size={12} className="text-[#8b5cf6] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="font-['Arimo',sans-serif] text-[12px] text-[#8b5cf6] opacity-0 group-hover:opacity-100 transition-opacity">Add to interview</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-8 py-6 border-t border-[#e5e7eb]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void generateSuggestedQuestions()}
                  disabled={isSuggesting}
                  className="h-[44px] px-[16px] rounded-[8px] border border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#faf5ff] font-['Arimo',sans-serif] text-[14px] transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  <RefreshCw size={14} className={isSuggesting ? 'animate-spin' : ''} />
                  Regenerate
                </button>
                <button
                  onClick={() => setShowSuggestModal(false)}
                  className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-[#e5e7eb]">
              <h3 className="text-[#111827] text-[20px]">Interview Preview</h3>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mt-1">
                This is how candidates will experience the interview
              </p>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
              {questions.map((question, index) => (
                <div key={question.id} className="border border-[#e5e7eb] rounded-[8px] p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#8b5cf6]">
                      Question {index + 1} of {questions.length}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      {Math.floor(question.duration / 60)}:{(question.duration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <p className="font-['Arimo',sans-serif] text-[15px] text-[#111827]">
                    {question.text || '(Empty question)'}
                  </p>
                  {question.rubricChecks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#f3f4f6]">
                      <p className="text-[11px] text-[#9ca3af] font-['Arimo',sans-serif]">
                        {question.rubricChecks.length} rubric {question.rubricChecks.length === 1 ? 'criterion' : 'criteria'} defined
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-8 py-6 border-t border-[#e5e7eb]">
              <button
                onClick={() => setShowPreview(false)}
                className="w-full h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
