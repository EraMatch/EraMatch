import { useState } from 'react';
import { ChevronLeft, Plus, Trash2, CheckCircle, Circle, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { TextRefiner } from '../recruiter/TextRefiner';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  options?: string[];
  correctAnswer?: number | number[];
  multipleCorrect?: boolean;
  explanation?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

interface MCQEditorProps {
  variant: QuestionVariant;
  onSave: (variant: QuestionVariant) => void;
  onCancel: () => void;
}

export function MCQEditor({ variant, onSave, onCancel }: MCQEditorProps) {
  const [questionData, setQuestionData] = useState<QuestionVariant>({
    ...variant,
    options: variant.options || ['', '', '', ''],
    correctAnswer: variant.correctAnswer || (variant.multipleCorrect ? [] : 0),
    multipleCorrect: variant.multipleCorrect || false,
    difficulty: variant.difficulty || 'Medium',
    tags: variant.tags || []
  });

  const [newTag, setNewTag] = useState('');

  const [showQuestionRefiner, setShowQuestionRefiner] = useState(false);
  const [showOptionRefiner, setShowOptionRefiner] = useState<number | null>(null);
  const [showExplanationRefiner, setShowExplanationRefiner] = useState(false);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...(questionData.options || [])];
    newOptions[index] = value;
    setQuestionData({ ...questionData, options: newOptions });
  };

  const handleAddOption = () => {
    setQuestionData({
      ...questionData,
      options: [...(questionData.options || []), '']
    });
  };

  const handleRemoveOption = (index: number) => {
    if ((questionData.options?.length || 0) <= 2) {
      alert('Must have at least 2 options');
      return;
    }
    const newOptions = questionData.options?.filter((_, i) => i !== index) || [];
    
    // Adjust correct answer if needed
    let newCorrectAnswer = questionData.correctAnswer;
    if (questionData.multipleCorrect && Array.isArray(newCorrectAnswer)) {
      newCorrectAnswer = newCorrectAnswer.filter(i => i !== index).map(i => i > index ? i - 1 : i);
    } else if (typeof newCorrectAnswer === 'number' && newCorrectAnswer === index) {
      newCorrectAnswer = 0;
    } else if (typeof newCorrectAnswer === 'number' && newCorrectAnswer > index) {
      newCorrectAnswer = newCorrectAnswer - 1;
    }
    
    setQuestionData({ 
      ...questionData, 
      options: newOptions,
      correctAnswer: newCorrectAnswer
    });
  };

  const handleToggleCorrectAnswer = (index: number) => {
    if (questionData.multipleCorrect) {
      const currentAnswers = Array.isArray(questionData.correctAnswer) ? questionData.correctAnswer : [];
      const newAnswers = currentAnswers.includes(index)
        ? currentAnswers.filter(i => i !== index)
        : [...currentAnswers, index];
      setQuestionData({ ...questionData, correctAnswer: newAnswers });
    } else {
      setQuestionData({ ...questionData, correctAnswer: index });
    }
  };

  const handleToggleMultipleCorrect = () => {
    const newMultipleCorrect = !questionData.multipleCorrect;
    setQuestionData({
      ...questionData,
      multipleCorrect: newMultipleCorrect,
      correctAnswer: newMultipleCorrect ? [0] : 0
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !questionData.tags?.includes(newTag.trim())) {
      setQuestionData({
        ...questionData,
        tags: [...(questionData.tags || []), newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setQuestionData({
      ...questionData,
      tags: questionData.tags?.filter(t => t !== tag) || []
    });
  };

  const handleSave = () => {
    if (!questionData.questionText.trim()) {
      alert('Please enter a question');
      return;
    }
    
    if (questionData.options?.some(opt => !opt.trim())) {
      alert('All options must be filled');
      return;
    }
    
    if (questionData.multipleCorrect) {
      if (!Array.isArray(questionData.correctAnswer) || questionData.correctAnswer.length === 0) {
        alert('Please select at least one correct answer');
        return;
      }
    } else {
      if (typeof questionData.correctAnswer !== 'number') {
        alert('Please select the correct answer');
        return;
      }
    }
    
    onSave(questionData);
  };

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[1000px] mx-auto px-[48px] py-[24px]">
        {/* Header */}
        <button
          onClick={onCancel}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back to Section</span>
        </button>

        <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8">
          <h2 className="text-[#111827] mb-2">Multiple Choice Question</h2>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
            Create a multiple choice question with options and ground truth
          </p>

          <div className="space-y-6">
            {/* Question Text */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Question Text *
              </label>
              <textarea
                value={questionData.questionText}
                onChange={(e) => setQuestionData({ ...questionData, questionText: e.target.value })}
                placeholder="Enter your question here..."
                rows={4}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
              <button
                onClick={() => setShowQuestionRefiner(true)}
                className="mt-2 flex items-center gap-2 h-[30px] px-[16px] rounded-[8px] border border-dashed border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors"
              >
                <Sparkles size={16} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                  Refine
                </span>
              </button>
              {showQuestionRefiner && (
                <TextRefiner
                  originalText={questionData.questionText}
                  onApply={(refinedText) => {
                    setQuestionData({ ...questionData, questionText: refinedText });
                    setShowQuestionRefiner(false);
                  }}
                  onClose={() => setShowQuestionRefiner(false)}
                  context="question"
                />
              )}
            </div>

            {/* Multiple Correct Toggle */}
            <div className="flex items-center gap-3 p-4 rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb]">
              <input
                type="checkbox"
                checked={questionData.multipleCorrect}
                onChange={handleToggleMultipleCorrect}
                className="w-5 h-5 rounded border-gray-300 text-[#6366f1] focus:ring-[#6366f1]"
              />
              <div>
                <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  Multiple Correct Answers
                </div>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  Allow selecting more than one correct answer
                </p>
              </div>
            </div>

            {/* Options */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-3">
                Answer Options *
              </label>
              <div className="space-y-3">
                {questionData.options?.map((option, index) => {
                  const isCorrect = questionData.multipleCorrect
                    ? Array.isArray(questionData.correctAnswer) && questionData.correctAnswer.includes(index)
                    : questionData.correctAnswer === index;

                  return (
                    <div key={index} className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleCorrectAnswer(index)}
                        className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                          isCorrect
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-300 bg-white hover:border-[#6366f1]'
                        }`}
                        title={`Mark as ${isCorrect ? 'incorrect' : 'correct'}`}
                      >
                        {isCorrect ? (
                          <CheckCircle size={20} className="text-emerald-600" />
                        ) : (
                          <Circle size={20} className="text-gray-400" />
                        )}
                      </button>
                      
                      <div className="flex-1 flex items-center gap-2">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] w-8">
                          {String.fromCharCode(65 + index)}.
                        </span>
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + index)}`}
                          className={`flex-1 h-[44px] px-4 rounded-[8px] border font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent ${
                            isCorrect ? 'border-emerald-300 bg-emerald-50' : 'border-[#e5e7eb] bg-white'
                          }`}
                        />
                        <button
                          onClick={() => setShowOptionRefiner(index)}
                          className="flex-shrink-0 w-10 h-10 rounded-[8px] border border-dashed border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors"
                        >
                          <Sparkles size={16} className="text-[#6366f1]" />
                        </button>
                        {showOptionRefiner === index && (
                          <TextRefiner
                            originalText={option}
                            onApply={(refinedText) => {
                              handleOptionChange(index, refinedText);
                              setShowOptionRefiner(null);
                            }}
                            onClose={() => setShowOptionRefiner(null)}
                            context="option"
                          />
                        )}
                      </div>
                      
                      {(questionData.options?.length || 0) > 2 && (
                        <button
                          onClick={() => handleRemoveOption(index)}
                          className="flex-shrink-0 w-10 h-10 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center"
                        >
                          <Trash2 size={16} className="text-red-600" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <button
                onClick={handleAddOption}
                className="mt-3 flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-dashed border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors"
              >
                <Plus size={16} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                  Add Option
                </span>
              </button>
            </div>

            {/* Explanation */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Explanation (Optional)
              </label>
              <textarea
                value={questionData.explanation || ''}
                onChange={(e) => setQuestionData({ ...questionData, explanation: e.target.value })}
                placeholder="Explain why this is the correct answer..."
                rows={3}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
              <button
                onClick={() => setShowExplanationRefiner(true)}
                className="mt-2 flex items-center gap-2 h-[30px] px-[16px] rounded-[8px] border border-dashed border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors"
              >
                <Sparkles size={16} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                  Refine
                </span>
              </button>
              {showExplanationRefiner && (
                <TextRefiner
                  originalText={questionData.explanation || ''}
                  onApply={(refinedText) => {
                    setQuestionData({ ...questionData, explanation: refinedText });
                    setShowExplanationRefiner(false);
                  }}
                  onClose={() => setShowExplanationRefiner(false)}
                  context="explanation"
                />
              )}
            </div>

            {/* Difficulty */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-3">
                Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['Easy', 'Medium', 'Hard'] as const).map((difficulty) => (
                  <button
                    key={difficulty}
                    onClick={() => setQuestionData({ ...questionData, difficulty })}
                    className={`h-[44px] rounded-[8px] border-2 transition-all font-['Arimo',sans-serif] text-[14px] ${
                      questionData.difficulty === difficulty
                        ? difficulty === 'Easy'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : difficulty === 'Medium'
                          ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1]'
                    }`}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Tags (Optional)
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add a tag..."
                  className="flex-1 h-[40px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <Button
                  onClick={handleAddTag}
                  variant="outline"
                  className="h-[40px] px-4"
                >
                  Add
                </Button>
              </div>
              {questionData.tags && questionData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {questionData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ede9fe] text-[#6366f1] font-['Arimo',sans-serif] text-[13px]"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-[#e5e7eb]">
            <Button
              variant="outline"
              className="rounded-[8px] px-6"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              className="rounded-[8px] px-6 bg-[#6366f1] hover:bg-[#4f46e5] text-white"
              onClick={handleSave}
            >
              Save Question
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}