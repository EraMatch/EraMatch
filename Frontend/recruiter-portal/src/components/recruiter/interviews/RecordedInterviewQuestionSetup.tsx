import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, GripVertical, Eye, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';
import { recruiterService } from '../../../services/recruiter.service';
import { toast } from 'sonner';

interface RecordedInterviewQuestionSetupProps {
  groupName: string;
  onBack: () => void;
  onSave: (questions: any[]) => void;
  initialQuestions?: { id: string; text: string; duration: number }[];
  positionContext?: {
    positionTitle?: string;
    jobDescription?: string;
    requiredSkills?: string[];
    experienceLevel?: string;
    yearsOfExperience?: number;
  };
}

interface Question {
  id: string;
  text: string;
  duration: number;
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
  const [aiSuggestedQuestions, setAiSuggestedQuestions] = useState<Array<{ text: string; duration: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // Load questions: use initialQuestions (edit mode) or fetch from API (create mode)
  useEffect(() => {
    if (initialQuestions && initialQuestions.length > 0) {
      // Edit mode — use saved questions directly, no API call needed
      setQuestions(initialQuestions.map((q, i) => ({
        id: q.id || String(i + 1),
        text: q.text,
        duration: q.duration || 120
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
          duration: q.recordingTime || q.duration || 120
        }));
        setQuestions(mappedQuestions);
      } catch (error) {
        console.error('Failed to fetch recorded interview questions:', error);
        setQuestions([
          { id: '1', text: 'Tell me about your professional background and key accomplishments.', duration: 120 },
          { id: '2', text: 'Describe a challenging technical problem you solved recently.', duration: 180 },
          { id: '3', text: 'What interests you most about this role?', duration: 120 }
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuestions();
  }, []);

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: Date.now().toString(),
      text: '',
      duration: 120
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleRemoveQuestion = (id: string) => {
    if (questions.length > 1) {
      setQuestions(questions.filter(q => q.id !== id));
    }
  };

  const handleQuestionChange = (id: string, field: 'text' | 'duration', value: string | number) => {
    setQuestions(questions.map(q =>
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const totalDuration = questions.reduce((sum, q) => sum + q.duration, 0);

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[900px] mx-auto px-[48px] py-[24px]">
        {/* Breadcrumb */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back to Interview Setup</span>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[#111827] mb-2">Recorded Interview Questions</h1>
          <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">
            Configure questions for {groupName}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              Total interview time:
            </span>
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
              {Math.floor(totalDuration / 60)} min {totalDuration % 60} sec
            </span>
            <span className="text-[#e5e7eb] mx-2">|</span>
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              {questions.length} question{questions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Questions List */}
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
                      <div className="relative">
                        <textarea
                          value={question.text}
                          onChange={(e) => handleQuestionChange(question.id, 'text', e.target.value)}
                          rows={2}
                          placeholder="Enter your question..."
                          className="w-full px-3 py-2 pr-10 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                        />
                        <button
                          title="Refine with AI"
                          disabled={isRefining === question.id || !question.text.trim()}
                          onClick={async () => {
                            if (!question.text.trim()) return;
                            setIsRefining(question.id);
                            try {
                              const response = await recruiterService.refineAIQuestion(question.text, {
                                useCase: 'recorded_interview_question',
                                metadata: { group_name: groupName },
                              });
                              handleQuestionChange(question.id, 'text', response.refinedText);
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
                      <div className="flex items-center gap-3 mt-3">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Duration:
                        </span>
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
                Drag to reorder, and ensure questions are clear and specific.
              </p>
            </div>
          </div>

          {/* Question Templates */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <h3 className="text-[#111827] mb-3">Quick Add Templates</h3>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
              Click to add commonly used interview questions
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  const newQ: Question = {
                    id: Date.now().toString(),
                    text: 'Walk me through your most recent project from start to finish.',
                    duration: 180
                  };
                  setQuestions([...questions, newQ]);
                }}
                className="p-3 rounded-[8px] border border-[#e5e7eb] hover:border-[#8b5cf6] hover:bg-[#faf5ff] text-left transition-all"
              >
                <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-1">
                  Project Overview
                </div>
                <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                  Recent work experience
                </div>
              </button>
              <button
                onClick={() => {
                  const newQ: Question = {
                    id: Date.now().toString(),
                    text: 'Describe a time when you had to work with a difficult team member.',
                    duration: 120
                  };
                  setQuestions([...questions, newQ]);
                }}
                className="p-3 rounded-[8px] border border-[#e5e7eb] hover:border-[#8b5cf6] hover:bg-[#faf5ff] text-left transition-all"
              >
                <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-1">
                  Teamwork & Collaboration
                </div>
                <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                  Soft skills assessment
                </div>
              </button>
              <button
                onClick={() => {
                  const newQ: Question = {
                    id: Date.now().toString(),
                    text: 'What are your salary expectations for this role?',
                    duration: 90
                  };
                  setQuestions([...questions, newQ]);
                }}
                className="p-3 rounded-[8px] border border-[#e5e7eb] hover:border-[#8b5cf6] hover:bg-[#faf5ff] text-left transition-all"
              >
                <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-1">
                  Compensation
                </div>
                <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                  Salary discussion
                </div>
              </button>
              <button
                onClick={() => {
                  const newQ: Question = {
                    id: Date.now().toString(),
                    text: 'Why do you want to work for our company?',
                    duration: 120
                  };
                  setQuestions([...questions, newQ]);
                }}
                className="p-3 rounded-[8px] border border-[#e5e7eb] hover:border-[#8b5cf6] hover:bg-[#faf5ff] text-left transition-all"
              >
                <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-1">
                  Company Interest
                </div>
                <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                  Motivation check
                </div>
              </button>
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
              onClick={() => onSave(questions)}
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
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Generating suggestions with Ollama...</p>
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
                    const newQ: Question = {
                      id: Date.now().toString() + index,
                      text: suggestion.text,
                      duration: suggestion.duration
                    };
                    setQuestions(prev => [...prev, newQ]);
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
