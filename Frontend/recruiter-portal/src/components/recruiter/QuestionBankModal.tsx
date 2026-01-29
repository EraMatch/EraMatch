import { useState, useMemo, useEffect } from 'react';
import { X, Search, Filter, Database, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
  semanticScore?: number;
  options?: string[];
  correctAnswer?: number;
  maxWords?: number;
  rubric?: string;
  language?: string;
  codeTemplate?: string;
  testCases?: any[];
  [key: string]: any;
}

interface QuestionBankModalProps {
  questionType: 'mcq' | 'essay' | 'code';
  onSelect: (question: QuestionVariant) => void;
  onClose: () => void;
  onSwitchToAI?: () => void;
}

import { api } from '../../services/api';

export function QuestionBankModal({ questionType, onSelect, onClose, onSwitchToAI }: QuestionBankModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [questions, setQuestions] = useState<QuestionVariant[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const data = await api.recruiter.getQuestionBankVariants(questionType);
        setQuestions(data);
      } catch (error) {
        console.error('Failed to fetch questions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [questionType]);

  // Use useMemo to memoize filtered questions
  const filteredQuestions = useMemo(() => {
    if (!questions.length) return [];

    // Sort logic to handle potential undefined semanticScore in API data if we use it for searching later
    // but for now, rely on what we have.

    let result = questions;

    // Filter by difficulty first
    result = result.filter(q => selectedDifficulty === 'all' || q.difficulty === selectedDifficulty);

    if (searchQuery.trim()) {
      // Simulate semantic matching for search
      // In a real implementation, this would call an embedding API
      return result
        .map(q => ({
          ...q,
          semanticScore: Math.random() * 0.4 + 0.6 // Simulate relevance score
        }))
        .filter(q => {
          const matchesSearch = q.questionText.toLowerCase().includes(searchQuery.toLowerCase()) ||
            q.tags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
          return matchesSearch;
        })
        .sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
    }

    return result;
  }, [searchQuery, selectedDifficulty, questions]);

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

          {/* Search and Filters */}
          <div className="flex gap-3 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#6b7280]" size={16} />
              <input
                type="text"
                placeholder="Describe the concept or topic you're looking for..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full h-[44px] pl-10 pr-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
            >
              <option value="all">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>

          {/* Semantic Search Info */}
          {searchQuery && (
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
                          {question.tags?.map((tag: string) => (
                            <span key={tag} className="px-2 py-1 rounded-full bg-[#f3f4f6] text-[#6b7280] text-[11px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                          {question.questionText}
                        </p>
                      </div>
                      <Button
                        onClick={() => onSelect(question)}
                        className="ml-4 rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] text-white"
                      >
                        Select
                      </Button>
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