import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, GripVertical, Eye, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface RecordedInterviewQuestionSetupProps {
  groupName: string;
  onBack: () => void;
  onContinue: () => void;
}

interface Question {
  id: string;
  text: string;
  duration: number;
}

export function RecordedInterviewQuestionSetup({
  groupName,
  onBack,
  onContinue
}: RecordedInterviewQuestionSetupProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch recorded interview questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        const data = await api.recruiter.getRecordedInterviewQuestions();
        // Map API data to component format
        const mappedQuestions: Question[] = data.map((q: any) => ({
          id: String(q.id),
          text: q.question || q.text,
          duration: q.recordingTime || q.duration || 120
        }));
        setQuestions(mappedQuestions);
      } catch (error) {
        console.error('Failed to fetch recorded interview questions:', error);
        // Fallback to default questions
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
              <button
                onClick={handleAddQuestion}
                className="flex items-center gap-2 h-[36px] px-[16px] rounded-[8px] border border-[#6366f1] text-[#6366f1] hover:bg-[#ede9fe] transition-colors"
              >
                <Plus size={16} />
                <span className="font-['Arimo',sans-serif] text-[13px]">Add Question</span>
              </button>
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
                      <textarea
                        value={question.text}
                        onChange={(e) => handleQuestionChange(question.id, 'text', e.target.value)}
                        rows={2}
                        placeholder="Enter your question..."
                        className="w-full px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      />
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
              onClick={onContinue}
              disabled={questions.some(q => !q.text.trim())}
              className="flex-1 h-[48px] rounded-[8px] bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              Continue to Settings
            </button>
          </div>
        </div>
      </div>

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
