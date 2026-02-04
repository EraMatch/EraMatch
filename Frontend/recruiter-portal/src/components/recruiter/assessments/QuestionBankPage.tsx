import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Filter, BookOpen, Code, Database, Globe, Cpu, ArrowLeft, Edit2, Trash2, Copy, Star, Clock, ChevronDown, Download, Upload, Tag, FileText, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../../services/api';
import { MCQEditor } from '../../common/MCQEditor';
import { EssayEditor } from '../../common/EssayEditor';
import { CodeEditor } from '../../common/CodeEditor';

// --- Interfaces ---

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
  // Extended properties (matching QuestionVariant somewhat)
  options?: string[];
  correctAnswer?: number | number[];
  multipleCorrect?: boolean;
  codeLanguage?: string;
  codeTemplate?: string;
  testCases?: { input: string; output: string; isHidden?: boolean; points?: number; id?: string }[];
  maxWords?: number;
  explanation?: string;
  expectedKeywords?: string[];
  rubric?: string;
}

// Interface used by the shared editors
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
  // Essay
  expectedKeywords?: string[];
  maxWords?: number;
  rubric?: string;
  // Code
  codeTemplate?: string;
  testCases?: any[];
  language?: string;
  timeLimit?: number;
  memoryLimit?: number;
}

interface QuestionBankPageProps {
  onBack: () => void;
}

export function QuestionBankPage({ onBack }: QuestionBankPageProps) {
  // --- State ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list');
  const [editorType, setEditorType] = useState<'mcq' | 'essay' | 'code' | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [currentVariant, setCurrentVariant] = useState<QuestionVariant | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const data = await api.recruiter.getQuestionBank();
        // Ensure data matches interface and has defaults
        const mappedData = (data as any[]).map(q => ({
          ...q,
          options: q.options || [],
          tags: q.tags || [],
          usageCount: q.usageCount || 0,
          avgScore: q.avgScore || 0,
          createdAt: q.createdAt || new Date().toISOString().split('T')[0],
          createdBy: q.createdBy || 'System'
        }));
        setQuestions(mappedData);
      } catch (error) {
        console.error('Failed to fetch questions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, []);

  // --- Data Conversion Helpers ---

  const toVariant = (q: Question): QuestionVariant => {
    // Map Question -> QuestionVariant
    let vType: 'mcq' | 'essay' | 'code' = 'mcq';
    if (q.type === 'Multiple Choice' || q.type === 'True/False') vType = 'mcq';
    else if (q.type === 'Code') vType = 'code';
    else if (q.type === 'Essay') vType = 'essay';

    return {
      id: q.id,
      questionText: q.text,
      type: vType,
      difficulty: q.difficulty,
      tags: q.tags,
      explanation: q.explanation,
      // MCQ
      options: q.options,
      correctAnswer: q.correctAnswer,
      multipleCorrect: q.multipleCorrect,
      // Code
      language: q.codeLanguage,
      codeTemplate: q.codeTemplate,
      testCases: q.testCases,
      // Essay
      maxWords: q.maxWords,
      expectedKeywords: q.expectedKeywords,
      rubric: q.rubric
    };
  };

  const fromVariant = (v: QuestionVariant, originalId?: string): Question => {
    // Map QuestionVariant -> Question
    let qType: Question['type'] = 'Multiple Choice';
    if (v.type === 'mcq') qType = 'Multiple Choice'; // Simplified
    else if (v.type === 'code') qType = 'Code';
    else if (v.type === 'essay') qType = 'Essay';

    return {
      id: originalId || Date.now().toString(),
      text: v.questionText,
      category: 'Uncategorized', // Editor doesn't have category field yet, default
      difficulty: v.difficulty || 'Medium',
      type: qType,
      tags: v.tags || [],
      usageCount: 0,
      avgScore: 0,
      createdAt: new Date().toISOString().split('T')[0],
      createdBy: 'Me',
      isFavorite: false,
      // Extended fields
      options: v.options,
      correctAnswer: v.correctAnswer,
      multipleCorrect: v.multipleCorrect,
      explanation: v.explanation,
      codeLanguage: v.language,
      codeTemplate: v.codeTemplate,
      testCases: v.testCases,
      maxWords: v.maxWords,
      expectedKeywords: v.expectedKeywords,
      rubric: v.rubric
    };
  };

  // --- Handlers ---

  const handleCreateClick = (type: 'mcq' | 'essay' | 'code') => {
    setEditingQuestionId(null);
    setEditorType(type);
    setCurrentVariant({
      id: `new-${Date.now()}`,
      questionText: '',
      type: type,
      difficulty: 'Medium',
      options: type === 'mcq' ? ['', '', '', ''] : undefined,
      correctAnswer: type === 'mcq' ? 0 : undefined
    });
    setViewMode('editor');
    setShowCreateMenu(false);
  };

  const handleEditClick = (q: Question) => {
    setEditingQuestionId(q.id);
    const variant = toVariant(q);
    setEditorType(variant.type);
    setCurrentVariant(variant);
    setViewMode('editor');
  };

  const handleEditorSave = (variant: QuestionVariant) => {
    if (editingQuestionId) {
      // Update existing
      setQuestions(questions.map(q => {
        if (q.id === editingQuestionId) {
          const updated = fromVariant(variant, editingQuestionId);
          // Preserve fields not in editor (like usageCount, createdBy, category)
          return { ...q, ...updated, category: q.category };
        }
        return q;
      }));
    } else {
      // Create new
      const newQuestion = fromVariant(variant);
      setQuestions([newQuestion, ...questions]);
    }
    setViewMode('list');
    setEditingQuestionId(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this question?')) {
      setQuestions(questions.filter(q => q.id !== id));
    }
  };

  const handleDuplicate = (q: Question) => {
    const newQuestion = {
      ...q,
      id: Date.now().toString(),
      text: `${q.text} (Copy)`,
      usageCount: 0,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setQuestions([newQuestion, ...questions]);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(questions, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `question_bank_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedData)) {
          const newQuestions = importedData.map((q: any) => ({
            ...q,
            id: `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            isFavorite: false
          }));
          setQuestions([...newQuestions, ...questions]);
          alert(`Successfully imported ${newQuestions.length} questions.`);
        } else {
          alert('Invalid JSON format. Expected an array of questions.');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Render Helpers ---

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

  // --- Main Render ---

  if (viewMode === 'editor' && currentVariant) {
    // Render the specific editor
    if (editorType === 'mcq') {
      return <MCQEditor variant={currentVariant} onSave={handleEditorSave} onCancel={() => setViewMode('list')} />;
    } else if (editorType === 'essay') {
      return <EssayEditor variant={currentVariant} onSave={handleEditorSave} onCancel={() => setViewMode('list')} />;
    } else if (editorType === 'code') {
      return <CodeEditor variant={currentVariant} onSave={handleEditorSave} onCancel={() => setViewMode('list')} />;
    }
  }

  return (
    <div className="min-h-screen p-8" onClick={() => setShowCreateMenu(false)}>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm">Back to Dashboard</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[#111827] mb-2 text-[32px] font-['Arimo',sans-serif]">Question Bank</h1>
              <p className="font-['Arimo',sans-serif] text-[14px] text-gray-600">Manage and organize your assessment questions</p>
            </div>
            <div className="flex items-center gap-3 relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".json"
              />
              <button
                onClick={handleImportClick}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-[10px] hover:bg-[#f9fafb] transition-colors font-['Arimo',sans-serif] text-[14px] text-[#374151]"
              >
                <Upload size={18} className="text-[#6b7280]" />
                <span>Import</span>
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-[10px] hover:bg-[#f9fafb] transition-colors font-['Arimo',sans-serif] text-[14px] text-[#374151]"
              >
                <Download size={18} className="text-[#6b7280]" />
                <span>Export</span>
              </button>

              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreateMenu(!showCreateMenu);
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#6366f1] text-white rounded-[10px] hover:bg-[#5558e3] transition-colors font-['Arimo',sans-serif] text-[14px]"
                >
                  <Plus size={18} />
                  <span>Create Question</span>
                  <ChevronDown size={16} />
                </button>

                {showCreateMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-[10px] shadow-xl border border-[#e5e7eb] py-1 z-20">
                    <button
                      onClick={() => handleCreateClick('mcq')}
                      className="w-full text-left px-4 py-2 text-[14px] text-[#374151] hover:bg-[#f3f4f6] hover:text-[#6366f1] flex items-center gap-2"
                    >
                      <CheckCircle size={16} />
                      Multiple Choice
                    </button>
                    <button
                      onClick={() => handleCreateClick('code')}
                      className="w-full text-left px-4 py-2 text-[14px] text-[#374151] hover:bg-[#f3f4f6] hover:text-[#6366f1] flex items-center gap-2"
                    >
                      <Code size={16} />
                      Coding
                    </button>
                    <button
                      onClick={() => handleCreateClick('essay')}
                      className="w-full text-left px-4 py-2 text-[14px] text-[#374151] hover:bg-[#f3f4f6] hover:text-[#6366f1] flex items-center gap-2"
                    >
                      <FileText size={16} />
                      Essay
                    </button>
                  </div>
                )}
              </div>
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
                      {/* Action Buttons */}
                      <button
                        onClick={() => handleEditClick(question)}
                        className="p-2 text-[#9ca3af] hover:text-[#6366f1] hover:bg-[#e0e7ff] rounded-[8px] transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDuplicate(question)}
                        className="p-2 text-[#9ca3af] hover:text-[#6366f1] hover:bg-[#e0e7ff] rounded-[8px] transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(question.id)}
                        className="p-2 text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#fee2e2] rounded-[8px] transition-colors"
                        title="Delete"
                      >
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
