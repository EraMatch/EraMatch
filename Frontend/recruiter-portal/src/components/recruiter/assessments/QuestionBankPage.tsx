import { useState, useEffect } from 'react';
import { Search, Plus, Filter, BookOpen, Code, Database, Globe, Cpu, ArrowLeft, Edit2, Trash2, Copy, Star, Clock, ChevronDown, Download, Upload, Tag } from 'lucide-react';
import { api } from '../../../services/api';

interface Question {
  id: string;
  text: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  type: 'Multiple Choice' | 'Code' | 'Essay' | 'True/False';
  tags: string[];
  usageCount: number;
  avgScore: number;
  createdAt: string;
  createdBy: string;
  isFavorite: boolean;
}

interface QuestionBankPageProps {
  onBack: () => void;
}

export function QuestionBankPage({ onBack }: QuestionBankPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const data = await api.recruiter.getQuestionBank();
        setQuestions(data as Question[]);
      } catch (error) {
        console.error('Failed to fetch questions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, []);

  const categories = [
    { id: 'all', label: 'All Categories', icon: BookOpen, count: questions.length },
    { id: 'React', label: 'React', icon: Code, count: questions.filter(q => q.category === 'React').length },
    { id: 'JavaScript', label: 'JavaScript', icon: Globe, count: questions.filter(q => q.category === 'JavaScript').length },
    { id: 'Algorithms', label: 'Algorithms', icon: Cpu, count: questions.filter(q => q.category === 'Algorithms').length },
    { id: 'Database', label: 'Database', icon: Database, count: questions.filter(q => q.category === 'Database').length },
    { id: 'System Design', label: 'System Design', icon: Code, count: questions.filter(q => q.category === 'System Design').length }
  ];

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || q.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'all' || q.difficulty === selectedDifficulty;
    const matchesType = selectedType === 'all' || q.type === selectedType;

    return matchesSearch && matchesCategory && matchesDifficulty && matchesType;
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Hard': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm">Back</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[#111827] mb-2 text-[32px] font-['Arimo',sans-serif]">Question Bank</h1>
              <p className="font-['Arimo',sans-serif] text-[14px] text-gray-600">Manage and organize your assessment questions</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-[10px] hover:bg-[#f9fafb] transition-colors font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                <Upload size={18} className="text-[#6b7280]" />
                <span>Import</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-[10px] hover:bg-[#f9fafb] transition-colors font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                <Download size={18} className="text-[#6b7280]" />
                <span>Export</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#6366f1] text-white rounded-[10px] hover:bg-[#5558e3] transition-colors font-['Arimo',sans-serif] text-[14px]"
              >
                <Plus size={18} />
                <span>Create Question</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="font-['Arimo',sans-serif] text-[14px] text-gray-600">Total Questions</div>
            </div>
            <div className="text-[32px] font-['Arimo',sans-serif] text-[#111827]">{questions.length}</div>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Star className="w-5 h-5 text-purple-600" />
              </div>
              <div className="font-['Arimo',sans-serif] text-[14px] text-gray-600">Favorites</div>
            </div>
            <div className="text-[32px] font-['Arimo',sans-serif] text-[#111827]">
              {questions.filter(q => q.isFavorite).length}
            </div>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="font-['Arimo',sans-serif] text-[14px] text-gray-600">Avg Usage</div>
            </div>
            <div className="text-[32px] font-['Arimo',sans-serif] text-[#111827]">
              {Math.round(questions.reduce((sum, q) => sum + q.usageCount, 0) / (questions.length || 1))}
            </div>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Tag className="w-5 h-5 text-amber-600" />
              </div>
              <div className="font-['Arimo',sans-serif] text-[14px] text-gray-600">Categories</div>
            </div>
            <div className="text-[32px] font-['Arimo',sans-serif] text-[#111827]">
              {categories.filter(c => c.id !== 'all').length}
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Categories Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-4 shadow-sm">
              <h3 className="font-['Arimo',sans-serif] text-[14px] font-medium text-[#111827] mb-4">Categories</h3>
              <div className="space-y-1">
                {categories.map(category => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[8px] transition-colors font-['Arimo',sans-serif] ${selectedCategory === category.id
                        ? 'bg-[#f5f3ff] text-[#6366f1]'
                        : 'text-[#374151] hover:bg-[#f9fafb]'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} />
                        <span className="text-[14px]">{category.label}</span>
                      </div>
                      <span className={`text-[12px] px-2 py-0.5 rounded-full ${selectedCategory === category.id
                        ? 'bg-[#ede9fe] text-[#6366f1]'
                        : 'bg-[#f3f4f6] text-[#6b7280]'
                        }`}>
                        {category.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Search and Filters */}
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-4 mb-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#9ca3af]" size={20} />
                  <input
                    type="text"
                    placeholder="Search questions by text or tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-[44px] pl-10 pr-4 border border-[#e5e7eb] rounded-[10px] bg-white font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 h-[44px] px-4 border rounded-[10px] transition-colors font-['Arimo',sans-serif] text-[14px] ${showFilters
                    ? 'bg-[#f5f3ff] border-[#6366f1] text-[#6366f1]'
                    : 'border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]'
                    }`}
                >
                  <Filter size={18} />
                  <span>Filters</span>
                </button>
              </div>

              {/* Filter Options */}
              {showFilters && (
                <div className="mt-4 pt-4 border-t border-[#e5e7eb] flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex-1">
                    <label className="text-[13px] font-medium font-['Arimo',sans-serif] text-[#374151] mb-1.5 block">Difficulty</label>
                    <div className="relative">
                      <select
                        value={selectedDifficulty}
                        onChange={(e) => setSelectedDifficulty(e.target.value)}
                        className="w-full h-[40px] pl-3 pr-10 bg-white border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent appearance-none"
                      >
                        <option value="all">All Difficulties</option>
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[13px] font-medium font-['Arimo',sans-serif] text-[#374151] mb-1.5 block">Question Type</label>
                    <div className="relative">
                      <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="w-full h-[40px] pl-3 pr-10 bg-white border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent appearance-none"
                      >
                        <option value="all">All Types</option>
                        <option value="Multiple Choice">Multiple Choice</option>
                        <option value="Code">Code</option>
                        <option value="Essay">Essay</option>
                        <option value="True/False">True/False</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Results Summary */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing <span className="font-medium text-gray-900">{filteredQuestions.length}</span> questions
              </p>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {filteredQuestions.map(question => (
                <div
                  key={question.id}
                  className="bg-white border border-gray-200 rounded-xl p-6 hover:border-indigo-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-[16px] font-medium font-['Arimo',sans-serif] text-[#111827]">{question.text}</h3>
                        {question.isFavorite && (
                          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap font-['Arimo',sans-serif]">
                        <span className={`px-2.5 py-1 text-[12px] rounded-full border ${getDifficultyColor(question.difficulty)}`}>
                          {question.difficulty}
                        </span>
                        <span className="px-2.5 py-1 text-[12px] rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                          {question.type}
                        </span>
                        {question.tags.map(tag => (
                          <span key={tag} className="px-2.5 py-1 text-[12px] rounded-full bg-[#e0e7ff] text-[#4338ca] border border-[#c7d2fe]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button className="p-2 text-[#9ca3af] hover:text-[#6366f1] hover:bg-[#e0e7ff] rounded-[8px] transition-colors">
                        <Edit2 size={18} />
                      </button>
                      <button className="p-2 text-[#9ca3af] hover:text-[#6366f1] hover:bg-[#e0e7ff] rounded-[8px] transition-colors">
                        <Copy size={18} />
                      </button>
                      <button className="p-2 text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#fee2e2] rounded-[8px] transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Question Stats */}
                  <div className="flex items-center gap-6 text-[13px] text-[#6b7280] pt-4 border-t border-[#f3f4f6] font-['Arimo',sans-serif]">
                    <div className="flex items-center gap-2">
                      <Clock size={16} />
                      <span>Used {question.usageCount} times</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Avg Score: <span className="font-medium text-[#111827]">{question.avgScore}%</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Created by <span className="font-medium text-[#111827]">{question.createdBy}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#9ca3af]">{question.createdAt}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredQuestions.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No questions found</h3>
                <p className="text-gray-600">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
