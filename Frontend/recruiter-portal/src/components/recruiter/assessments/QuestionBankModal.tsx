import { useState, useMemo, useEffect } from 'react';
import { X, Search, Filter, Database, Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';

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
  [key: string]: any;
}

interface QuestionBankModalProps {
  questionType: 'mcq' | 'essay' | 'code';
  onSelect: (question: QuestionVariant) => void;
  onClose: () => void;
  onSwitchToAI?: () => void;
}

import { api } from '../../../services/api';

export function QuestionBankModal({ questionType, onSelect, onClose, onSwitchToAI }: QuestionBankModalProps) {
  const [searchType, setSearchType] = useState<'traditional' | 'semantic'>('traditional');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [favoriteOnly, setFavoriteOnly] = useState<boolean>(false);
  const [usageSort, setUsageSort] = useState<string>('none');

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
          let vType: 'mcq' | 'essay' | 'code' = 'mcq';
          if (q.type === 'Multiple Choice' || q.type === 'True/False') vType = 'mcq';
          else if (q.type === 'Code') vType = 'code';
          else if (q.type === 'Essay') vType = 'essay';

          return {
            id: q.id,
            questionText: q.text,
            type: vType,
            difficulty: q.difficulty,
            category: q.category || '',
            tags: q.tags || [],
            usageCount: q.usageCount || 0,
            isFavorite: q.isFavorite || false,
            options: q.options,
            correctAnswer: q.correctAnswer,
            multipleCorrect: q.multipleCorrect,
            language: q.codeLanguage,
            codeTemplate: q.codeTemplate,
            testCases: q.testCases,
            maxWords: q.maxWords,
            rubric: q.rubric
          } as QuestionVariant;
        });

        // Only show variants matching the Section's question type
        mappedData = mappedData.filter(q => q.type === questionType);

        setQuestions(mappedData);
      } catch (error) {
        console.error('Failed to fetch questions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [questionType]);

  // Extract dynamic categories
  const categories = useMemo(() => {
    const cats = new Set(questions.map((q) => q.category).filter(Boolean));
    return ['all', ...Array.from(cats)] as string[];
  }, [questions]);

  // Use useMemo to memoize filtered questions
  const filteredQuestions = useMemo(() => {
    if (!questions.length) return [];

    let result = [...questions];

    // Filter by difficulty
    result = result.filter(q => selectedDifficulty === 'all' || q.difficulty === selectedDifficulty);

    // Filter by category
    result = result.filter(q => selectedCategory === 'all' || q.category === selectedCategory);

    // Filter by favorites
    if (favoriteOnly) {
      result = result.filter(q => q.isFavorite);
    }

    // Search query filtering
    if (searchQuery.trim()) {
      if (searchType === 'semantic') {
        // Simulate semantic matching
        result = result
          .map(q => ({
            ...q,
            semanticScore: Math.random() * 0.4 + 0.6
          }))
          .sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
      } else {
        // Traditional match
        const query = searchQuery.toLowerCase();
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
  }, [searchQuery, searchType, selectedDifficulty, selectedCategory, favoriteOnly, usageSort, questions]);

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
                  Semantic search through existing questions
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
          {filteredQuestions.length === 0 ? (
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
                    className="border border-[#e5e7eb] rounded-[12px] p-6 hover:border-[#6366f1] hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
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
                          onClick={() => onSelect(question)}
                          className="rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] text-white"
                        >
                          Select
                        </Button>
                      </div>
                    </div>

                    {/* Preview based on type */}
                    {question.type === 'mcq' && question.options && (
                      <div className="mt-3 space-y-1">
                        {question.options.slice(0, 2).map((opt: string, idx: number) => (
                          <div key={idx} className="text-[13px] text-[#6b7280]">
                            {String.fromCharCode(65 + idx)}. {opt}
                          </div>
                        ))}
                        {question.options.length > 2 && (
                          <div className="text-[13px] text-[#6b7280]">
                            ... and {question.options.length - 2} more options
                          </div>
                        )}
                      </div>
                    )}

                    {question.type === 'code' && (
                      <div className="mt-3 text-[13px] text-[#6b7280]">
                        Language: {question.language} • {question.testCases?.length || 0} test cases
                      </div>
                    )}

                    {question.type === 'essay' && question.maxWords && (
                      <div className="mt-3 text-[13px] text-[#6b7280]">
                        Max words: {question.maxWords}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Can't find what you want CTA */}
              {onSwitchToAI && (
                <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-[12px]">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-['Arimo',sans-serif] text-[14px] text-purple-900 mb-1">
                        Can't find exactly what you're looking for?
                      </p>
                      <p className="font-['Arimo',sans-serif] text-[12px] text-purple-700">
                        Generate a custom question tailored to your specific needs using AI
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        onClose();
                        onSwitchToAI();
                      }}
                      className="ml-4 rounded-[8px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    >
                      <Sparkles size={16} className="mr-2" />
                      Generate with AI
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              {filteredQuestions.length} {filteredQuestions.length === 1 ? 'question' : 'questions'} found
            </span>
            <Button
              variant="outline"
              onClick={onClose}
              className="rounded-[8px]"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}