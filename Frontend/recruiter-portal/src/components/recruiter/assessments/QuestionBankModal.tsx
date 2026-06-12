import { useState, useMemo, useEffect } from 'react';
import { X, Search, Filter, Database, Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import LoadingSpinner from '../../common/LoadingSpinner';

interface QuestionVariant {
    id: string;
    questionText: string;
    type: 'mcq' | 'essay' | 'code';
    difficulty?: 'Easy' | 'Medium' | 'Hard';
    category?: string;
    tags?: string[];
    semanticScore?: number;
    options?: string[];
    correctAnswer?: number;
    multipleCorrect?: boolean;
    maxWords?: number;
    rubric?: string;
    language?: string;
    codeTemplate?: string;
    testCases?: any[];
    usageCount?: number;
    isFavorite?: boolean;
    // New coding fields
    starterCode?: string;
    functionName?: string;
    inputFormat?: string;
    outputFormat?: string;
    questionExamples?: any[];
    questionConstraints?: string[];
    topics?: string[];
    // Reviewer metadata
    evidence?: string;
    referenceAnswer?: string;
    rubricYesNoChecks?: any[];
    needsReview?: boolean;
    criticScore?: number;
    criticWeightedScore?: number;
    criticFeedback?: string;
    criticChecks?: any[];
    retryCount?: number;
    importType?: string;
    importJobId?: string;
    sourceFilename?: string;
    [key: string]: any;
}

interface QuestionBankModalProps {
  questionType: 'mcq' | 'essay' | 'code';
  onSelect: (question: QuestionVariant) => void;
  onSelectMultiple?: (questions: QuestionVariant[]) => void;
  onClose: () => void;
  onSwitchToAI?: () => void;
}

import { api } from '../../../services/api';

const normalizeQuestionType = (value?: string): 'mcq' | 'essay' | 'code' => {
  const normalized = (value || '').trim().toLowerCase();

  if (
    normalized === 'mcq' ||
    normalized === 'multiple choice' ||
    normalized === 'multiple-choice' ||
    normalized === 'true/false' ||
    normalized === 'true false'
  ) {
    return 'mcq';
  }

  if (normalized === 'essay' || normalized === 'descriptive') {
    return 'essay';
  }

  if (normalized === 'code' || normalized === 'coding' || normalized === 'programming') {
    return 'code';
  }

  return 'essay';
};

const hasQuestionOptions = (value: unknown): boolean => {
  if (!Array.isArray(value)) return false;

  return value.filter((option) => String(option ?? '').trim().length > 0).length > 0;
};

const hasNonEmptyText = (value: unknown): boolean => String(value ?? '').trim().length > 0;

const inferQuestionType = (question: any): 'mcq' | 'essay' | 'code' => {
  const options = question.options ?? question.question_config?.options;

  if (hasQuestionOptions(options)) {
    return 'mcq';
  }

  const normalizedType = normalizeQuestionType(question.type || question.question_type);

  if (normalizedType === 'code') return 'code';
  if (normalizedType === 'essay') return 'essay';

  return 'essay';
};

const getQuestionTypeLabel = (type: 'mcq' | 'essay' | 'code') => {
  switch (type) {
    case 'mcq':
      return 'MCQ';
    case 'essay':
      return 'Essay';
    case 'code':
      return 'Coding';
  }
};

export function QuestionBankModal({ questionType, onSelect, onSelectMultiple, onClose, onSwitchToAI }: QuestionBankModalProps) {
  const [searchType, setSearchType] = useState<'traditional' | 'semantic'>('traditional');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [favoriteOnly, setFavoriteOnly] = useState<boolean>(false);
  const [usageSort, setUsageSort] = useState<string>('none');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [previewQuestion, setPreviewQuestion] = useState<QuestionVariant | null>(null);

  const [questions, setQuestions] = useState<QuestionVariant[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const data = await api.recruiter.getQuestionBank();

        // Map backend response and filter by requested questionType
        let mappedData = (data as any[]).map(q => {
          const vType = inferQuestionType(q);
          const options = Array.isArray(q.options) ? q.options : q.question_config?.options;

          return {
            id: q.id,
            questionText: q.text,
            type: vType,
            difficulty: q.difficulty,
            category: q.category || '',
            tags: q.tags || [],
            usageCount: q.usageCount || 0,
            isFavorite: q.isFavorite || false,
            options: Array.isArray(options) ? options.filter((option: any) => String(option ?? '').trim().length > 0).map((option: any) => String(option)) : [],
            correctAnswer: q.correctAnswer,
            multipleCorrect: q.multipleCorrect,
            language: q.codeLanguage,
            codeTemplate: q.codeTemplate,
            testCases: q.testCases,
            maxWords: q.maxWords,
            rubric: q.rubric,
            evidence: q.evidence,
            referenceAnswer: q.referenceAnswer,
            rubricYesNoChecks: q.rubricYesNoChecks,
            needsReview: q.needsReview,
            criticScore: q.criticScore,
            criticWeightedScore: q.criticWeightedScore,
            criticFeedback: q.criticFeedback,
            criticChecks: q.criticChecks,
            retryCount: q.retryCount,
            // Coding fields
            starterCode: q.starterCode,
            functionName: q.functionName,
            inputFormat: q.inputFormat,
            outputFormat: q.outputFormat,
            questionExamples: q.examples,
            questionConstraints: q.constraints,
            topics: q.topics,
          } as QuestionVariant;
        });

        // Only show variants matching the Section's question type
        mappedData = mappedData.filter((q) => {
          if (q.type !== questionType) return false;

          if (questionType === 'essay') {
            return hasNonEmptyText(q.rubric);
          }

          return true;
        });

        setQuestions(mappedData);
      } catch (error) {
        console.error('Failed to fetch questions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [questionType]);

  useEffect(() => {
    const validIds = new Set(questions.map((question) => question.id));
    setSelectedQuestionIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [questions]);

  // Extract dynamic categories
  const categories = useMemo(() => {
    const cats = new Set(questions.map((q) => q.category).filter(Boolean));
    return ['all', ...Array.from(cats)] as string[];
  }, [questions]);

  // Extract dynamic tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    questions.forEach((q) => q.tags?.forEach((t: string) => tags.add(t)));
    return ['all', ...Array.from(tags).sort()];
  }, [questions]);

  // Relevance scoring shared by both search modes (replaces fake random shuffling)
  const scoreQuestion = (q: QuestionVariant, query: string): number => {
    const textScore = q.questionText.toLowerCase().includes(query) ? 2 : 0;
    const tagScore = q.tags?.some((t: string) => t.toLowerCase().includes(query)) ? 1 : 0;
    const catScore = q.category?.toLowerCase().includes(query) ? 1 : 0;
    return textScore + tagScore + catScore;
  };

  // Use useMemo to memoize filtered questions
  const filteredQuestions = useMemo(() => {
    if (!questions.length) return [];

    let result = [...questions];

    // Filter by difficulty
    result = result.filter(q => selectedDifficulty === 'all' || q.difficulty === selectedDifficulty);

    // Filter by category
    result = result.filter(q => selectedCategory === 'all' || q.category === selectedCategory);

    // Filter by tag
    result = result.filter(q => selectedTag === 'all' || q.tags?.includes(selectedTag));

    // Filter by favorites
    if (favoriteOnly) {
      result = result.filter(q => q.isFavorite);
    }

    // Search query filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();

      if (searchType === 'semantic') {
        // Semantic mode: rank all by relevance score, normalized for the match badge
        result = result
          .map(q => {
            const raw = scoreQuestion(q, query);
            return { ...q, semanticScore: raw > 0 ? Math.min(1, 0.6 + raw * 0.1) : 0 };
          })
          .sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
      } else {
        // Traditional match: keep only questions that match
        result = result.filter(q =>
          q.questionText.toLowerCase().includes(query) ||
          q.tags?.some((tag: string) => tag.toLowerCase().includes(query)) ||
          q.category?.toLowerCase().includes(query)
        );
      }
    }

    // Sort by usage count
    if (usageSort === 'most') {
      result.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    } else if (usageSort === 'least') {
      result.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
    }

    return result;
  }, [searchQuery, searchType, selectedDifficulty, selectedCategory, selectedTag, favoriteOnly, usageSort, questions]);

  const selectedQuestions = useMemo(
    () => questions.filter((question) => selectedQuestionIds.includes(question.id)),
    [questions, selectedQuestionIds]
  );

  const isSelected = (questionId: string) => selectedQuestionIds.includes(questionId);

  const toggleQuestionSelection = (questionId: string) => {
    if (!onSelectMultiple) return;

    setSelectedQuestionIds((prev) => (
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    ));
  };

  const handleAddSelectedQuestions = () => {
    if (!onSelectMultiple || selectedQuestions.length === 0) return;

    onSelectMultiple(selectedQuestions);
    setSelectedQuestionIds([]);
  };

  const closePreview = () => setPreviewQuestion(null);

  const handleAddFromPreview = () => {
    if (!previewQuestion) return;

    onSelect(previewQuestion);
    closePreview();
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#ede9fe] flex items-center justify-center">
                <Database size={20} className="text-[#6366f1]" />
              </div>
              <div>
                <h2 className="text-[#111827]">Question Bank</h2>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Semantic search through existing {getQuestionTypeLabel(questionType)} questions
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>

          {/* Search Type Toggle */}
          <div className="mt-4 flex bg-[#f9fafb] p-1 rounded-[8px] border border-[#e5e7eb] w-fit">
            <button
              onClick={() => setSearchType('traditional')}
              className={`px-4 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors ${searchType === 'traditional'
                ? 'bg-white text-[#111827] shadow-sm ring-1 ring-[#e5e7eb]'
                : 'text-[#6b7280] hover:text-[#374151]'
                }`}
            >
              Traditional Search
            </button>
            <button
              onClick={() => setSearchType('semantic')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors ${searchType === 'semantic'
                ? 'bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200'
                : 'text-[#6b7280] hover:text-[#374151]'
                }`}
            >
              <Sparkles size={14} />
              Semantic Search
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[12px] text-[#6b7280]">
            <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium">
              {getQuestionTypeLabel(questionType)} only
            </span>
            <span>Auto-detected from the section type.</span>
          </div>

          {/* Search Bar */}
          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#6b7280]" size={16} />
              <input
                type="text"
                placeholder={searchType === 'semantic' ? "Describe the concept or topic you're looking for..." : "Search by keywords, tags, or question text..."}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full h-[44px] pl-10 pr-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>
          </div>

          {/* Filters Row */}
          {searchType === 'traditional' && (
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-[#6b7280]" />
                <span className="text-[13px] font-medium text-[#374151]">Filters:</span>
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>

              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
              >
                {allTags.map(tag => (
                  <option key={tag} value={tag}>
                    {tag === 'all' ? 'All Tags' : tag}
                  </option>
                ))}
              </select>

              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
              >
                <option value="all">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <select
                value={usageSort}
                onChange={(e) => setUsageSort(e.target.value)}
                className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
              >
                <option value="none">Sort by Usage (None)</option>
                <option value="most">Most Used</option>
                <option value="least">Least Used</option>
              </select>

              <label className="flex items-center gap-2 h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] bg-white cursor-pointer hover:bg-[#f9fafb]">
                <input
                  type="checkbox"
                  checked={favoriteOnly}
                  onChange={(e) => setFavoriteOnly(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[13px] text-[#374151]">Favorites Only</span>
              </label>
            </div>
          )}

          {/* Semantic Search Info */}
          {searchType === 'semantic' && searchQuery && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-[8px]">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-purple-600" />
                <p className="font-['Arimo',sans-serif] text-[12px] text-purple-900">
                  Using semantic search to find questions similar to: "<span className="font-semibold">{searchQuery}</span>"
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Questions List */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="min-h-[320px] flex items-center justify-center">
              <LoadingSpinner message="Loading questions..." fullScreen={false} />
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-12">
              <Database size={48} className="text-[#d1d5db] mx-auto mb-4" />
              <p className="font-['Arimo',sans-serif] text-[16px] text-[#374151] mb-2">
                No matching questions found
              </p>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
                We couldn't find questions matching your search criteria
              </p>
              {onSwitchToAI && (
                <Button
                  onClick={() => {
                    onClose();
                    onSwitchToAI();
                  }}
                  className="rounded-[8px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                >
                  <Sparkles size={16} className="mr-2" />
                  Generate Question with AI Instead
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {filteredQuestions.map((question) => (
                  <div
                    key={question.id}
                    className={`border rounded-[12px] p-6 hover:shadow-md transition-all ${isSelected(question.id)
                      ? 'border-[#6366f1] bg-[#f8f7ff] shadow-sm'
                      : 'border-[#e5e7eb] hover:border-[#6366f1]'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-3 gap-4">
                      <div className="flex-1 flex items-start gap-3">
                        {onSelectMultiple && (
                          <label className="mt-1 flex items-center gap-2 px-2 py-1 rounded-[8px] border border-[#e5e7eb] bg-white cursor-pointer hover:bg-[#f9fafb] shrink-0">
                            <input
                              type="checkbox"
                              checked={isSelected(question.id)}
                              onChange={() => toggleQuestionSelection(question.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[12px] text-[#374151]">Select</span>
                          </label>
                        )}

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {searchQuery && question.semanticScore && (
                              <div className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium flex items-center gap-1">
                                <Sparkles size={10} />
                                {Math.round(question.semanticScore * 100)}% match
                              </div>
                            )}
                            {question.difficulty && (
                              <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${question.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                question.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                {question.difficulty}
                              </span>
                            )}
                            {question.category && (
                              <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium border border-indigo-100">
                                {question.category}
                              </span>
                            )}
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-[11px] border border-gray-200">
                              <span>Used {question.usageCount || 0} times</span>
                            </div>
                            {question.tags?.map((tag: string) => (
                              <span key={tag} className="px-2 py-1 rounded-full bg-[#f3f4f6] text-[#6b7280] text-[11px]">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] pr-4">
                            {question.questionText}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {question.isFavorite && (
                          <div className="flex items-center gap-1 text-red-500 text-[12px] font-medium">
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                            Favorite
                          </div>
                        )}
                        <Button
                          onClick={() => setPreviewQuestion(question)}
                          className="rounded-[8px] bg-white text-[#4f46e5] border border-[#c7d2fe] shadow-sm hover:bg-[#eef2ff] transition-all duration-200 hover:-translate-y-0.5"
                        >
                          Preview
                        </Button>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <Dialog open={!!previewQuestion} onOpenChange={(open) => { if (!open) closePreview(); }}>
          <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-hidden p-0 bg-white/90 backdrop-blur-xl border-white/30 shadow-2xl rounded-[24px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2 duration-300">
            {previewQuestion && (
              <div className="flex flex-col max-h-[88vh]">
                <div className="px-8 py-6 border-b border-[#e5e7eb] bg-gradient-to-r from-indigo-50 via-white to-purple-50">
                  <DialogHeader className="text-left">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <DialogTitle className="text-[22px] font-semibold text-[#111827]">
                          Question Preview
                        </DialogTitle>
                        <DialogDescription className="text-[14px] text-[#6b7280]">
                          Review the question before adding it to the section.
                        </DialogDescription>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium border border-indigo-100">
                          {getQuestionTypeLabel(previewQuestion.type)}
                        </span>
                        {previewQuestion.difficulty && (
                          <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${previewQuestion.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : previewQuestion.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {previewQuestion.difficulty}
                          </span>
                        )}
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                <div className="overflow-y-auto px-8 py-6 space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {previewQuestion.category && (
                        <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium border border-indigo-100">
                          {previewQuestion.category}
                        </span>
                      )}
                      <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-[11px] border border-gray-200">
                        Used {previewQuestion.usageCount || 0} times
                      </span>
                      {previewQuestion.tags?.map((tag) => (
                        <span key={tag} className="px-2 py-1 rounded-full bg-[#f3f4f6] text-[#6b7280] text-[11px]">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
                      <p className="text-[16px] leading-7 text-[#111827] font-['Arimo',sans-serif]">
                        {previewQuestion.questionText}
                      </p>
                    </div>
                  </div>

                  {previewQuestion.type === 'mcq' && previewQuestion.options && (
                    <div className="space-y-3">
                      <h4 className="text-[14px] font-semibold text-[#111827]">Answer choices</h4>
                      <div className="grid gap-3">
                        {previewQuestion.options.map((option, index) => (
                          <div key={index} className="flex items-start gap-3 rounded-[14px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-sm">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[12px] font-semibold text-indigo-700">
                              {String.fromCharCode(65 + index)}
                            </div>
                            <div className="text-[14px] text-[#374151]">{option}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewQuestion.type === 'code' && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[16px] border border-[#e5e7eb] bg-[#0f172a] p-4 text-white shadow-sm">
                        <div className="mb-2 text-[12px] uppercase tracking-wide text-slate-300">Language</div>
                        <div className="text-[16px] font-medium">{previewQuestion.language || 'Not specified'}</div>
                      </div>
                      <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-sm">
                        <div className="mb-2 text-[12px] uppercase tracking-wide text-[#6b7280]">Test cases</div>
                        <div className="text-[16px] font-medium text-[#111827]">{previewQuestion.testCases?.length || 0}</div>
                      </div>
                    </div>
                  )}

                  {previewQuestion.type === 'essay' && previewQuestion.maxWords && (
                    <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <div className="text-[12px] uppercase tracking-wide text-[#6b7280] mb-2">Word limit</div>
                      <div className="text-[16px] font-medium text-[#111827]">Max words: {previewQuestion.maxWords}</div>
                    </div>
                  )}

                  {previewQuestion.rubric && (
                    <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <div className="text-[12px] uppercase tracking-wide text-[#6b7280] mb-2">Rubric</div>
                      <div className="whitespace-pre-wrap text-[14px] leading-6 text-[#374151]">{previewQuestion.rubric}</div>
                    </div>
                  )}
                </div>

                <DialogFooter className="px-8 py-5 border-t border-[#e5e7eb] bg-white/95 backdrop-blur justify-between sm:justify-between">
                  <Button
                    onClick={closePreview}
                    variant="outline"
                    className="rounded-[10px] border-[#d1d5db] bg-white text-[#374151] hover:bg-[#f9fafb]"
                  >
                    Close Preview
                  </Button>
                  <Button
                    onClick={handleAddFromPreview}
                    className="rounded-[10px] bg-[#6366f1] text-white shadow-md shadow-indigo-200 transition-all duration-200 hover:bg-[#4f46e5] hover:-translate-y-0.5"
                  >
                    Add Question
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              {filteredQuestions.length} {filteredQuestions.length === 1 ? 'question' : 'questions'} found
            </span>
            <div className="flex items-center gap-3">
              {onSelectMultiple && selectedQuestionIds.length > 0 && (
                <span className="text-[13px] text-[#6366f1] font-medium">
                  {selectedQuestionIds.length} selected
                </span>
              )}
              <Button
                variant="outline"
                onClick={onClose}
                className="rounded-[8px]"
              >
                Cancel
              </Button>
              {onSelectMultiple && (
                <Button
                  onClick={handleAddSelectedQuestions}
                  disabled={selectedQuestionIds.length === 0}
                  className="rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Selected{selectedQuestionIds.length > 0 ? ` (${selectedQuestionIds.length})` : ''}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
