import { useState } from 'react';
import { ChevronLeft, Plus, Trash2, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { TextRefiner } from '../recruiter/shared/TextRefiner';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  expectedKeywords?: string[];
  maxWords?: number;
  rubric?: string;
  explanation?: string;
  evidence?: string;
  referenceAnswer?: string;
  rubricYesNoChecks?: Array<{ id: number; check: string; weight: number }>;
  needsReview?: boolean;
  criticScore?: number;
  criticWeightedScore?: number;
  criticFeedback?: string;
  criticChecks?: Array<{ id?: number; criterion: string; verdict: 'YES' | 'NO'; weight?: number; weighted_value?: number }>;
  retryCount?: number;
  category?: string;
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
    rubricYesNoChecks: variant.rubricYesNoChecks || [],
    difficulty: variant.difficulty || 'Medium',
    category: variant.category || '',
    tags: variant.tags || []
  });

  const [newKeyword, setNewKeyword] = useState('');
  const [newTag, setNewTag] = useState('');

  const [showQuestionRefiner, setShowQuestionRefiner] = useState(false);
  const [showRubricRefiner, setShowRubricRefiner] = useState(false);
  const [showEvidenceRefiner, setShowEvidenceRefiner] = useState(false);
  const [showReferenceRefiner, setShowReferenceRefiner] = useState(false);
  const [showCriticFeedbackRefiner, setShowCriticFeedbackRefiner] = useState(false);

  const addRubricCheck = () => {
    const checks = [...(questionData.rubricYesNoChecks || [])];
    checks.push({ id: checks.length + 1, check: '', weight: Number((1 / Math.max(1, checks.length + 1)).toFixed(2)) });
    setQuestionData({ ...questionData, rubricYesNoChecks: checks });
  };

  const removeRubricCheck = (index: number) => {
    const checks = (questionData.rubricYesNoChecks || [])
      .filter((_, currentIndex) => currentIndex !== index)
      .map((check, currentIndex) => ({ ...check, id: currentIndex + 1 }));
    setQuestionData({ ...questionData, rubricYesNoChecks: checks });
  };

  const updateRubricCheck = (index: number, patch: Partial<{ check: string; weight: number }>) => {
    const checks = [...(questionData.rubricYesNoChecks || [])];
    if (!checks[index]) return;
    checks[index] = { ...checks[index], ...patch };
    setQuestionData({ ...questionData, rubricYesNoChecks: checks });
  };

  const normalizeRubricWeights = () => {
    const checks = [...(questionData.rubricYesNoChecks || [])];
    if (checks.length === 0) return;
    const base = Number((1 / checks.length).toFixed(2));
    const normalized = checks.map((check, idx) => ({
      ...check,
      id: idx + 1,
      weight: idx === checks.length - 1 ? Number((1 - base * (checks.length - 1)).toFixed(2)) : base,
    }));
    setQuestionData({ ...questionData, rubricYesNoChecks: normalized });
  };

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
              <button
                onClick={() => setShowQuestionRefiner(true)}
                className="mt-2 flex items-center gap-2 h-[30px] px-[16px] rounded-[8px] border border-dashed border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors"
              >
                <Sparkles size={16} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                  Fix text
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
              <button
                onClick={() => setShowRubricRefiner(true)}
                className="mt-2 flex items-center gap-2 h-[30px] px-[16px] rounded-[8px] border border-dashed border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors"
              >
                <Sparkles size={16} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                  Fix text
                </span>
              </button>
              {showRubricRefiner && (
                <TextRefiner
                  originalText={questionData.rubric || ''}
                  onApply={(refinedText) => {
                    setQuestionData({ ...questionData, rubric: refinedText });
                    setShowRubricRefiner(false);
                  }}
                  onClose={() => setShowRubricRefiner(false)}
                  context="rubric"
                />
              )}
            </div>

            <div className="rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb] p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                  Rubric YES/NO Checks
                </label>
                <div className="flex items-center gap-2">
                  <Button onClick={addRubricCheck} variant="outline" className="h-[32px] px-3 text-[12px]">Add Check</Button>
                  <Button onClick={normalizeRubricWeights} variant="outline" className="h-[32px] px-3 text-[12px]">Normalize</Button>
                </div>
              </div>
              <div className="space-y-2">
                {(questionData.rubricYesNoChecks || []).map((check, idx) => (
                  <div key={`${check.id}-${idx}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_110px_88px] gap-2">
                    <input
                      type="text"
                      value={check.check}
                      onChange={(e) => updateRubricCheck(idx, { check: e.target.value })}
                      placeholder={`Check ${idx + 1}`}
                      className="h-[40px] px-3 rounded-[8px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[13px]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={check.weight}
                      onChange={(e) => updateRubricCheck(idx, { weight: Number(e.target.value || 0) })}
                      className="h-[40px] px-3 rounded-[8px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[13px]"
                    />
                    <Button onClick={() => removeRubricCheck(idx)} variant="outline" className="h-[40px] text-[12px] text-red-600 border-red-200">Remove</Button>
                  </div>
                ))}
                {(questionData.rubricYesNoChecks || []).length === 0 && (
                  <div className="text-[12px] text-[#6b7280]">No checks yet. Add checks to enforce consistent review criteria.</div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                  Evidence (Optional)
                </label>
                <button
                  onClick={() => setShowEvidenceRefiner(true)}
                  disabled={!questionData.evidence?.trim()}
                  className="flex items-center gap-1.5 text-[12px] text-[#6366f1] hover:text-[#4f46e5] disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  Fix text
                </button>
              </div>
              <textarea
                value={questionData.evidence || ''}
                onChange={(e) => setQuestionData({ ...questionData, evidence: e.target.value })}
                placeholder="Source evidence supporting this question and rubric"
                rows={3}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
              {showEvidenceRefiner && (
                <TextRefiner
                  originalText={questionData.evidence || ''}
                  onApply={(refinedText) => {
                    setQuestionData({ ...questionData, evidence: refinedText });
                    setShowEvidenceRefiner(false);
                  }}
                  onClose={() => setShowEvidenceRefiner(false)}
                  context="evidence"
                />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                  Reference Answer (Optional)
                </label>
                <button
                  onClick={() => setShowReferenceRefiner(true)}
                  disabled={!questionData.referenceAnswer?.trim()}
                  className="flex items-center gap-1.5 text-[12px] text-[#6366f1] hover:text-[#4f46e5] disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  Fix text
                </button>
              </div>
              <textarea
                value={questionData.referenceAnswer || ''}
                onChange={(e) => setQuestionData({ ...questionData, referenceAnswer: e.target.value })}
                placeholder="Ground-truth answer notes for reviewers"
                rows={3}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
              {showReferenceRefiner && (
                <TextRefiner
                  originalText={questionData.referenceAnswer || ''}
                  onApply={(refinedText) => {
                    setQuestionData({ ...questionData, referenceAnswer: refinedText });
                    setShowReferenceRefiner(false);
                  }}
                  onClose={() => setShowReferenceRefiner(false)}
                  context="reference_answer"
                />
              )}
            </div>

            <div className="rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">Critic Signals (Optional)</div>
                <button
                  onClick={() => setShowCriticFeedbackRefiner(true)}
                  disabled={!questionData.criticFeedback?.trim()}
                  className="flex items-center gap-1.5 text-[12px] text-[#6366f1] hover:text-[#4f46e5] disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  Fix feedback
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={questionData.criticScore ?? ''}
                  onChange={(e) => setQuestionData({ ...questionData, criticScore: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder="Critic Score (0-1)"
                  className="h-[40px] px-3 rounded-[8px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[13px]"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={questionData.criticWeightedScore ?? ''}
                  onChange={(e) => setQuestionData({ ...questionData, criticWeightedScore: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder="Weighted Score (0-1)"
                  className="h-[40px] px-3 rounded-[8px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[13px]"
                />
                <label className="flex items-center gap-2 h-[40px] px-3 rounded-[8px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                  <input
                    type="checkbox"
                    checked={!!questionData.needsReview}
                    onChange={(e) => setQuestionData({ ...questionData, needsReview: e.target.checked })}
                  />
                  Needs Review
                </label>
              </div>
              <textarea
                value={questionData.criticFeedback || ''}
                onChange={(e) => setQuestionData({ ...questionData, criticFeedback: e.target.value })}
                placeholder="Critic feedback"
                rows={2}
                className="w-full px-3 py-2 rounded-[8px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[13px] resize-none"
              />
              {showCriticFeedbackRefiner && (
                <TextRefiner
                  originalText={questionData.criticFeedback || ''}
                  onApply={(refinedText) => {
                    setQuestionData({ ...questionData, criticFeedback: refinedText });
                    setShowCriticFeedbackRefiner(false);
                  }}
                  onClose={() => setShowCriticFeedbackRefiner(false)}
                  context="critic_feedback"
                />
              )}
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

            {/* Category */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Category (Optional)
              </label>
              <input
                type="text"
                value={questionData.category || ''}
                onChange={(e) => setQuestionData({ ...questionData, category: e.target.value })}
                placeholder="e.g., General Knowledge, System Design, soft skills..."
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
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
                    className={`h-[44px] rounded-[8px] border-2 transition-all font-['Arimo',sans-serif] text-[14px] ${questionData.difficulty === difficulty
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
