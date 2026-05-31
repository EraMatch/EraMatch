import { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Search, Filter, Database, Sparkles, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import { Button } from '../../ui/button';

const MAX_VARIANTS_PER_QUESTION = 7;

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
    onClose: () => void;
    onSwitchToAI?: () => void;
}

import { api } from '../../../services/api';

export function QuestionBankModal({ questionType, onSelect, onClose, onSwitchToAI }: QuestionBankModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedTag, setSelectedTag] = useState<string>('all');
    const [favoriteOnly, setFavoriteOnly] = useState<boolean>(false);
    const [usageSort, setUsageSort] = useState<string>('none');

    const [questions, setQuestions] = useState<QuestionVariant[]>([]);
    const [loading, setLoading] = useState(true);

    // Variant state: questionId → list of generated variants
    const [variantMap, setVariantMap] = useState<Record<string, QuestionVariant[]>>({});
    const [generatingFor, setGeneratingFor] = useState<string | null>(null);
    const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({});

    // Fetch questions from API
    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                setLoading(true);
                const data = await api.recruiter.getQuestionBank();

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
                        // New coding fields
                        starterCode: q.starterCode,
                        functionName: q.functionName,
                        inputFormat: q.inputFormat,
                        outputFormat: q.outputFormat,
                        questionExamples: q.examples,
                        questionConstraints: q.constraints,
                        topics: q.topics,
                    } as QuestionVariant;
                });

                // Only show questions matching the section's question type
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

    // Derive filter options from loaded questions
    const categories = useMemo(() => {
        const cats = new Set(questions.map(q => q.category).filter(Boolean));
        return ['all', ...Array.from(cats)] as string[];
    }, [questions]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        questions.forEach(q => q.tags?.forEach((t: string) => tags.add(t)));
        return ['all', ...Array.from(tags).sort()];
    }, [questions]);

    const filteredQuestions = useMemo(() => {
        let result = [...questions];

        result = result.filter(q => selectedDifficulty === 'all' || q.difficulty === selectedDifficulty);
        result = result.filter(q => selectedCategory === 'all' || q.category === selectedCategory);
        result = result.filter(q => selectedTag === 'all' || q.tags?.includes(selectedTag));
        if (favoriteOnly) result = result.filter(q => q.isFavorite);

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result
                .map(q => {
                    const textScore = q.questionText.toLowerCase().includes(query) ? 2 : 0;
                    const tagScore = q.tags?.some((t: string) => t.toLowerCase().includes(query)) ? 1 : 0;
                    const catScore = q.category?.toLowerCase().includes(query) ? 1 : 0;
                    return { ...q, semanticScore: textScore + tagScore + catScore };
                })
                .filter(q => q.semanticScore! > 0)
                .sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
        }

        if (usageSort === 'most') result.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        else if (usageSort === 'least') result.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));

        return result;
    }, [searchQuery, selectedDifficulty, selectedCategory, selectedTag, favoriteOnly, usageSort, questions]);

    const handleGenerateVariant = useCallback(async (question: QuestionVariant) => {
        const existing = variantMap[question.id] || [];
        if (existing.length >= MAX_VARIANTS_PER_QUESTION) return;

        setGeneratingFor(question.id);
        try {
            const result = await api.recruiter.generateQuestionVariant(question.id);
            const variant: QuestionVariant = {
                id: result.id,
                questionText: result.text || result.questionText,
                type: 'code',
                difficulty: result.difficulty,
                category: result.category,
                tags: result.tags || [],
                testCases: result.testCases,
                starterCode: result.starterCode,
                functionName: result.functionName,
                inputFormat: result.inputFormat,
                outputFormat: result.outputFormat,
                questionExamples: result.examples,
                questionConstraints: result.constraints,
                topics: result.topics,
            };
            setVariantMap(prev => ({
                ...prev,
                [question.id]: [...(prev[question.id] || []), variant],
            }));
            setExpandedVariants(prev => ({ ...prev, [question.id]: true }));
        } catch (err) {
            console.error('Variant generation failed:', err);
        } finally {
            setGeneratingFor(null);
        }
    }, [variantMap]);

    const toggleVariantPanel = (questionId: string) => {
        setExpandedVariants(prev => ({ ...prev, [questionId]: !prev[questionId] }));
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
                                    Browse and select questions for your assessment
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

                    {/* Search */}
                    <div className="mt-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#6b7280]" size={16} />
                            <input
                                type="text"
                                placeholder="Search by keywords, tags, or topic..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full h-[44px] pl-10 pr-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-[#6b7280]" />
                            <span className="text-[13px] font-medium text-[#374151]">Filters:</span>
                        </div>

                        <select
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] bg-white"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
                            ))}
                        </select>

                        <select
                            value={selectedDifficulty}
                            onChange={e => setSelectedDifficulty(e.target.value)}
                            className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] bg-white"
                        >
                            <option value="all">All Difficulties</option>
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                        </select>

                        {allTags.length > 1 && (
                            <select
                                value={selectedTag}
                                onChange={e => setSelectedTag(e.target.value)}
                                className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] bg-white"
                            >
                                {allTags.map(tag => (
                                    <option key={tag} value={tag}>{tag === 'all' ? 'All Tags' : tag}</option>
                                ))}
                            </select>
                        )}

                        <select
                            value={usageSort}
                            onChange={e => setUsageSort(e.target.value)}
                            className="h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] bg-white"
                        >
                            <option value="none">Sort by Usage</option>
                            <option value="most">Most Used</option>
                            <option value="least">Least Used</option>
                        </select>

                        <label className="flex items-center gap-2 h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] bg-white cursor-pointer hover:bg-[#f9fafb]">
                            <input
                                type="checkbox"
                                checked={favoriteOnly}
                                onChange={e => setFavoriteOnly(e.target.checked)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[13px] text-[#374151]">Favorites Only</span>
                        </label>
                    </div>
                </div>

                {/* Questions List */}
                <div className="flex-1 overflow-y-auto p-8">
                    {loading ? (
                        <div className="text-center py-12 text-[#6b7280]">Loading questions...</div>
                    ) : filteredQuestions.length === 0 ? (
                        <div className="text-center py-12">
                            <Database size={48} className="text-[#d1d5db] mx-auto mb-4" />
                            <p className="font-['Arimo',sans-serif] text-[16px] text-[#374151] mb-2">No matching questions found</p>
                            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
                                Try adjusting your filters or search query
                            </p>
                            {onSwitchToAI && (
                                <Button
                                    onClick={() => { onClose(); onSwitchToAI(); }}
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
                                {filteredQuestions.map(question => {
                                    const variants = variantMap[question.id] || [];
                                    const isGenerating = generatingFor === question.id;
                                    const variantsExpanded = expandedVariants[question.id];
                                    const canGenerateMore = variants.length < MAX_VARIANTS_PER_QUESTION;

                                    return (
                                        <div key={question.id} className="border border-[#e5e7eb] rounded-[12px] overflow-hidden">
                                            {/* Base question card */}
                                            <div className="p-6 hover:bg-[#fafafa] transition-colors">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex-1">
                                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                                            {question.difficulty && (
                                                                <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${question.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : question.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {question.difficulty}
                                                                </span>
                                                            )}
                                                            {question.category && (
                                                                <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium border border-indigo-100">
                                                                    {question.category}
                                                                </span>
                                                            )}
                                                            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-[11px] border border-gray-200">
                                                                Used {question.usageCount || 0}×
                                                            </span>
                                                            {question.tags?.slice(0, 4).map((tag: string) => (
                                                                <span
                                                                    key={tag}
                                                                    onClick={() => setSelectedTag(tag)}
                                                                    className="px-2 py-1 rounded-full bg-[#f3f4f6] text-[#6b7280] text-[11px] cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                                                    title="Filter by this tag"
                                                                >
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] pr-4 line-clamp-3">
                                                            {question.questionText}
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
                                                        <Button
                                                            onClick={() => onSelect(question)}
                                                            className="rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[13px] h-9 px-4"
                                                        >
                                                            Select
                                                        </Button>
                                                        {question.isFavorite && (
                                                            <span className="text-red-500 text-[11px] font-medium">♥ Favorite</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Type-specific preview */}
                                                {question.type === 'mcq' && question.options && (
                                                    <div className="mt-3 space-y-1">
                                                        {question.options.slice(0, 2).map((opt: string, idx: number) => (
                                                            <div key={idx} className="text-[13px] text-[#6b7280]">
                                                                {String.fromCharCode(65 + idx)}. {opt}
                                                            </div>
                                                        ))}
                                                        {question.options.length > 2 && (
                                                            <div className="text-[13px] text-[#6b7280]">… and {question.options.length - 2} more options</div>
                                                        )}
                                                    </div>
                                                )}

                                                {question.type === 'code' && (
                                                    <div className="mt-3 flex items-center justify-between">
                                                        <div className="text-[13px] text-[#6b7280] flex items-center gap-3">
                                                            {question.functionName && (
                                                                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-[12px]">{question.functionName}()</span>
                                                            )}
                                                            <span>{question.testCases?.length || 0} test cases</span>
                                                            {question.topics?.slice(0, 2).map((t: string) => (
                                                                <span key={t} className="text-indigo-600">{t}</span>
                                                            ))}
                                                        </div>

                                                        {/* Variant controls */}
                                                        <div className="flex items-center gap-2">
                                                            {variants.length > 0 && (
                                                                <button
                                                                    onClick={() => toggleVariantPanel(question.id)}
                                                                    className="flex items-center gap-1.5 text-[12px] text-[#6366f1] hover:text-[#4f46e5] font-medium"
                                                                >
                                                                    <GitBranch size={13} />
                                                                    {variants.length} variant{variants.length !== 1 ? 's' : ''}
                                                                    {variantsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                                </button>
                                                            )}
                                                            {canGenerateMore && (
                                                                <button
                                                                    onClick={() => handleGenerateVariant(question)}
                                                                    disabled={isGenerating}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[#e5e7eb] text-[12px] text-[#374151] hover:border-[#6366f1] hover:text-[#6366f1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {isGenerating ? (
                                                                        <>
                                                                            <div className="w-3 h-3 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
                                                                            Generating…
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Sparkles size={12} />
                                                                            {variants.length === 0 ? 'Generate Variant' : `Another (${variants.length}/${MAX_VARIANTS_PER_QUESTION})`}
                                                                        </>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {question.type === 'essay' && question.maxWords && (
                                                    <div className="mt-3 text-[13px] text-[#6b7280]">Max words: {question.maxWords}</div>
                                                )}
                                            </div>

                                            {/* Variant panel (code questions only) */}
                                            {question.type === 'code' && variantsExpanded && variants.length > 0 && (
                                                <div className="border-t border-[#e5e7eb] bg-[#f9fafb]">
                                                    {variants.map((variant, idx) => (
                                                        <div key={variant.id} className="p-4 border-b border-[#e5e7eb] last:border-b-0 flex items-start justify-between gap-4">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium flex items-center gap-1">
                                                                        <GitBranch size={9} />
                                                                        Variant {idx + 1}
                                                                    </span>
                                                                    {variant.functionName && (
                                                                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-[11px] text-[#6b7280]">{variant.functionName}()</span>
                                                                    )}
                                                                </div>
                                                                <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151] line-clamp-2">
                                                                    {variant.questionText}
                                                                </p>
                                                            </div>
                                                            <Button
                                                                onClick={() => onSelect(variant)}
                                                                variant="outline"
                                                                className="shrink-0 rounded-[8px] text-[12px] h-8 px-3 border-[#6366f1] text-[#6366f1] hover:bg-[#ede9fe]"
                                                            >
                                                                Select Variant
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

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
                                            onClick={() => { onClose(); onSwitchToAI(); }}
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
                        <Button variant="outline" onClick={onClose} className="rounded-[8px]">
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
