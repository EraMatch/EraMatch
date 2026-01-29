import { useState } from 'react';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  expectedKeywords?: string[];
  maxWords?: number;
  rubric?: string;
  explanation?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

interface EssayEditorProps {
  variant: QuestionVariant;
  onSave: (variant: QuestionVariant) => void;
  onCancel: () => void;
}

export function EssayEditor({ variant, onSave, onCancel }: EssayEditorProps) {
  const [questionData, setQuestionData] = useState<QuestionVariant>({
    ...variant,
    expectedKeywords: variant.expectedKeywords || [],
    maxWords: variant.maxWords || 500,
    difficulty: variant.difficulty || 'Medium',
    tags: variant.tags || []
  });

  const [newKeyword, setNewKeyword] = useState('');
  const [newTag, setNewTag] = useState('');

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !questionData.expectedKeywords?.includes(newKeyword.trim())) {
      setQuestionData({
        ...questionData,
        expectedKeywords: [...(questionData.expectedKeywords || []), newKeyword.trim()]
      });
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setQuestionData({
      ...questionData,
      expectedKeywords: questionData.expectedKeywords?.filter(k => k !== keyword) || []
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
    
    if (!questionData.rubric?.trim()) {
      alert('Please enter a grading rubric');
      return;
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
          <h2 className="text-[#111827] mb-2">Essay Question</h2>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
            Create an essay question with grading criteria
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
                placeholder="Enter your essay question here..."
                rows={4}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
            </div>

            {/* Max Words */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Maximum Words
              </label>
              <input
                type="number"
                value={questionData.maxWords}
                onChange={(e) => setQuestionData({ ...questionData, maxWords: parseInt(e.target.value) || 0 })}
                min="50"
                max="5000"
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>

            {/* Grading Rubric */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Grading Rubric * (Ground Truth)
              </label>
              <textarea
                value={questionData.rubric || ''}
                onChange={(e) => setQuestionData({ ...questionData, rubric: e.target.value })}
                placeholder="Define how this essay should be evaluated. Include key points, structure requirements, and scoring criteria..."
                rows={6}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
            </div>

            {/* Expected Keywords */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Expected Keywords (Optional)
              </label>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-2">
                Add keywords that should appear in a good answer for AI-assisted grading
              </p>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                  placeholder="Add a keyword..."
                  className="flex-1 h-[40px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <Button
                  onClick={handleAddKeyword}
                  variant="outline"
                  className="h-[40px] px-4"
                >
                  Add
                </Button>
              </div>
              {questionData.expectedKeywords && questionData.expectedKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {questionData.expectedKeywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700 font-['Arimo',sans-serif] text-[13px]"
                    >
                      {keyword}
                      <button
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
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
