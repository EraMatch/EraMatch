import { useState, useEffect } from 'react';
import { Sparkles, Trash2, Plus, ChevronLeft, X, Edit2, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

export interface Question {
  id: string;
  type: 'Multiple Choice' | 'Coding' | 'Essay';
  question: string;
  options?: string[];
  correctAnswer?: string;
}

interface CreateAssessmentPageProps {
  onBack: () => void;
  onSave: (title: string, questions: Question[]) => void;
  initialTitle?: string;
  initialQuestions?: Question[];
}


export function CreateAssessmentPage({
  onBack,
  onSave,
  initialTitle = '',
  initialQuestions
}: CreateAssessmentPageProps) {
  const [title, setTitle] = useState(initialTitle || 'Technical Assessment');
  const [questions, setQuestions] = useState<Question[]>(initialQuestions || []);
  const [isLoading, setIsLoading] = useState(!initialQuestions);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState<Question['type']>('Multiple Choice');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionOptions, setNewQuestionOptions] = useState(['Option 1', 'Option 2', 'Option 3', 'Option 4']);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editQuestionOptions, setEditQuestionOptions] = useState<string[]>([]);

  // Fetch assessment templates from API
  useEffect(() => {
    if (!initialQuestions) {
      const fetchTemplates = async () => {
        try {
          setIsLoading(true);
          const templates = await api.recruiter.getAssessmentTemplates();
          // Map API templates to Question format
          const mappedQuestions: Question[] = templates.map((template: any) => ({
            id: template.id,
            type: template.type as Question['type'],
            question: template.question,
            options: template.options,
            correctAnswer: template.correctAnswer
          }));
          setQuestions(mappedQuestions);
        } catch (error) {
          console.error('Failed to fetch assessment templates:', error);
          setQuestions([]);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTemplates();
    }
  }, [initialQuestions]);

  const handleDeleteQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const handleEnhanceQuestion = (id: string) => {
    // Simulate AI enhancement
    setQuestions(questions.map(q => {
      if (q.id === id) {
        return {
          ...q,
          question: q.question.includes('(Enhanced)') ? q.question : q.question + ' (Enhanced)'
        };
      }
      return q;
    }));
  };

  const handleAddNewQuestion = () => {
    if (!newQuestionText.trim()) return;

    const newQuestion: Question = {
      id: `q-${Date.now()}`,
      type: newQuestionType,
      question: newQuestionText,
      options: newQuestionType === 'Multiple Choice' ? newQuestionOptions.filter(opt => opt.trim()) : undefined,
    };

    setQuestions([...questions, newQuestion]);
    setNewQuestionText('');
    setNewQuestionOptions(['Option 1', 'Option 2', 'Option 3', 'Option 4']);
    setShowAddQuestion(false);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave(title, questions);
  };

  const updateNewQuestionOption = (index: number, value: string) => {
    const updated = [...newQuestionOptions];
    updated[index] = value;
    setNewQuestionOptions(updated);
  };

  const addNewQuestionOption = () => {
    setNewQuestionOptions([...newQuestionOptions, `Option ${newQuestionOptions.length + 1}`]);
  };

  const removeNewQuestionOption = (index: number) => {
    if (newQuestionOptions.length > 2) {
      setNewQuestionOptions(newQuestionOptions.filter((_, i) => i !== index));
    }
  };

  const startEditQuestion = (question: Question) => {
    setEditingQuestion(question.id);
    setEditQuestionText(question.question);
    setEditQuestionOptions(question.options || []);
  };

  const saveEditQuestion = (id: string) => {
    setQuestions(questions.map(q => {
      if (q.id === id) {
        return {
          ...q,
          question: editQuestionText,
          options: q.type === 'Multiple Choice' ? editQuestionOptions.filter(opt => opt.trim()) : undefined,
        };
      }
      return q;
    }));
    setEditingQuestion(null);
  };

  const cancelEditQuestion = () => {
    setEditingQuestion(null);
    setEditQuestionText('');
    setEditQuestionOptions([]);
  };

  const updateEditQuestionOption = (index: number, value: string) => {
    const updated = [...editQuestionOptions];
    updated[index] = value;
    setEditQuestionOptions(updated);
  };

  const addEditQuestionOption = () => {
    setEditQuestionOptions([...editQuestionOptions, `Option ${editQuestionOptions.length + 1}`]);
  };

  const removeEditQuestionOption = (index: number) => {
    if (editQuestionOptions.length > 2) {
      setEditQuestionOptions(editQuestionOptions.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="flex-1 bg-[#f5f5f9] overflow-y-auto">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[#e5e7eb] sticky top-0 z-10">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#9ca3af] hover:text-black transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="font-['Arimo',sans-serif] text-[14px]">Back</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="h-[40px] px-[24px] rounded-[8px] bg-[#9ca3af] hover:bg-[#6b7280] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="h-[40px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              Create Assessment
            </button>
          </div>
        </div>
        <h1 className="font-['Arimo',sans-serif] text-[32px] text-black mb-6">
          Create Assessment
        </h1>

        <div>
          <label className="font-['Arimo',sans-serif] text-[14px] text-black mb-2 block">
            Assessment Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter assessment title"
            className="w-full h-[48px] bg-[#f9fafb] rounded-[8px] border-0 px-[16px] font-['Arimo',sans-serif] text-[15px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          />
        </div>
      </div>

      {/* Questions Section */}
      <div className="max-w-[1200px] mx-auto px-8 py-8">
        <div className="bg-white rounded-[12px] p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-['Arimo',sans-serif] text-[24px] text-black">
              Questions ({questions.length})
            </h2>
            <button
              onClick={() => setShowAddQuestion(!showAddQuestion)}
              className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#6366f1] bg-white hover:bg-[#f9fafb] transition-colors"
            >
              <Plus size={18} className="text-[#6366f1]" strokeWidth={2} />
              <span className="font-['Arimo',sans-serif] text-[15px] text-[#6366f1]">
                Add Question
              </span>
            </button>
          </div>

          {/* Add New Question Form */}
          {showAddQuestion && (
            <div className="bg-[#f9fafb] rounded-[12px] p-6 mb-6 border-2 border-[#6366f1]">
              <h3 className="font-['Arimo',sans-serif] text-[20px] text-black mb-4">
                Add New Question
              </h3>

              <div className="mb-4">
                <label className="font-['Arimo',sans-serif] text-[14px] text-black mb-2 block">
                  Question Type
                </label>
                <select
                  value={newQuestionType}
                  onChange={(e) => setNewQuestionType(e.target.value as Question['type'])}
                  className="w-full h-[44px] bg-white rounded-[8px] border border-[#d1d5db] px-[12px] font-['Arimo',sans-serif] text-[14px] text-black focus:outline-none focus:ring-2 focus:ring-[#6366f1] cursor-pointer"
                >
                  <option value="Multiple Choice">Multiple Choice</option>
                  <option value="Coding">Coding</option>
                  <option value="Essay">Essay</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="font-['Arimo',sans-serif] text-[14px] text-black mb-2 block">
                  Question
                </label>
                <textarea
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  placeholder="Enter question text"
                  rows={3}
                  className="w-full bg-white rounded-[8px] border border-[#d1d5db] px-[12px] py-[10px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
                />
              </div>

              {newQuestionType === 'Multiple Choice' && (
                <div className="mb-4">
                  <label className="font-['Arimo',sans-serif] text-[14px] text-black mb-2 block">
                    Options
                  </label>
                  <div className="flex flex-col gap-2">
                    {newQuestionOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updateNewQuestionOption(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          className="flex-1 h-[44px] bg-white rounded-[8px] border border-[#d1d5db] px-[12px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                        />
                        {newQuestionOptions.length > 2 && (
                          <button
                            onClick={() => removeNewQuestionOption(index)}
                            className="flex items-center justify-center w-[44px] h-[44px] rounded-[8px] hover:bg-white transition-colors"
                          >
                            <X size={18} className="text-[#ef4444]" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addNewQuestionOption}
                      className="flex items-center gap-2 h-[36px] px-[12px] rounded-[6px] border border-[#6366f1] bg-white hover:bg-[#f9fafb] transition-colors self-start mt-2"
                    >
                      <Plus size={16} className="text-[#6366f1]" />
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">
                        Add Option
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddNewQuestion}
                  className="h-[40px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
                >
                  Add Question
                </button>
                <button
                  onClick={() => setShowAddQuestion(false)}
                  className="h-[40px] px-[24px] rounded-[8px] bg-[#9ca3af] hover:bg-[#6b7280] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Questions List */}
          <div className="flex flex-col gap-4">
            {questions.map((question, index) => (
              <div key={question.id} className="bg-[#f9fafb] rounded-[12px] p-6">
                {editingQuestion === question.id ? (
                  // Edit Mode
                  <div>
                    <div className="mb-4">
                      <label className="font-['Arimo',sans-serif] text-[14px] text-black mb-2 block">
                        Question
                      </label>
                      <textarea
                        value={editQuestionText}
                        onChange={(e) => setEditQuestionText(e.target.value)}
                        rows={3}
                        className="w-full bg-white rounded-[8px] border border-[#d1d5db] px-[12px] py-[10px] font-['Arimo',sans-serif] text-[14px] text-black focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
                      />
                    </div>

                    {question.type === 'Multiple Choice' && (
                      <div className="mb-4">
                        <label className="font-['Arimo',sans-serif] text-[14px] text-black mb-2 block">
                          Options
                        </label>
                        <div className="flex flex-col gap-2">
                          {editQuestionOptions.map((option, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={option}
                                onChange={(e) => updateEditQuestionOption(idx, e.target.value)}
                                placeholder={`Option ${idx + 1}`}
                                className="flex-1 h-[44px] bg-white rounded-[8px] border border-[#d1d5db] px-[12px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                              />
                              {editQuestionOptions.length > 2 && (
                                <button
                                  onClick={() => removeEditQuestionOption(idx)}
                                  className="flex items-center justify-center w-[44px] h-[44px] rounded-[8px] hover:bg-white transition-colors"
                                >
                                  <X size={18} className="text-[#ef4444]" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={addEditQuestionOption}
                            className="flex items-center gap-2 h-[36px] px-[12px] rounded-[6px] border border-[#6366f1] bg-white hover:bg-[#f9fafb] transition-colors self-start mt-2"
                          >
                            <Plus size={16} className="text-[#6366f1]" />
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">
                              Add Option
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => saveEditQuestion(question.id)}
                        className="h-[36px] px-[20px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditQuestion}
                        className="h-[36px] px-[20px] rounded-[8px] bg-[#9ca3af] hover:bg-[#6b7280] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleEnhanceQuestion(question.id)}
                        className="flex items-center gap-2 h-[36px] px-[16px] rounded-[8px] border border-[#6366f1] bg-white hover:bg-[#f9fafb] transition-colors"
                        title="Enhance with AI"
                      >
                        <Sparkles size={16} className="text-[#6366f1]" />
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                          Enhance
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-block px-[12px] py-[4px] rounded-[6px] bg-[#6366f1] font-['Arimo',sans-serif] text-[13px] text-white">
                            {question.type}
                          </span>
                          <span className="font-['Arimo',sans-serif] text-[13px] text-[#9ca3af]">
                            Question {index + 1}
                          </span>
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[16px] text-black">
                          {question.question}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleEnhanceQuestion(question.id)}
                          className="flex items-center justify-center w-[36px] h-[36px] rounded-[6px] hover:bg-white transition-colors"
                          title="Enhance with AI"
                        >
                          <Sparkles size={18} className="text-[#6366f1]" />
                        </button>
                        <button
                          onClick={() => startEditQuestion(question)}
                          className="flex items-center justify-center w-[36px] h-[36px] rounded-[6px] hover:bg-white transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} className="text-[#6366f1]" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(question.id)}
                          className="flex items-center justify-center w-[36px] h-[36px] rounded-[6px] hover:bg-white transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} className="text-[#ef4444]" />
                        </button>
                      </div>
                    </div>

                    {question.options && question.type === 'Multiple Choice' && (
                      <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-3">
                          Options:
                        </p>
                        <div className="flex flex-col gap-2">
                          {question.options.map((option, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <div className="w-[24px] h-[24px] rounded-full border-2 border-[#d1d5db] flex items-center justify-center">
                                <span className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af]">
                                  {String.fromCharCode(65 + idx)}
                                </span>
                              </div>
                              <p className="font-['Arimo',sans-serif] text-[15px] text-black">
                                {option}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
