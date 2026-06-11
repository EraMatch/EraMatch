import { useState } from 'react';
import { ChevronLeft, Plus, Wand2, Database, Save, Trash2, Copy, Edit2, CheckCircle, XCircle, Loader2, Check, ChevronDown } from 'lucide-react';
import { Button } from '../../ui/button';
import { MCQEditor } from '../../common/MCQEditor';
import { EssayEditor } from '../../common/EssayEditor';
import { CodeEditor } from '../../common/CodeEditor';
import { QuestionBankModal } from '../assessments/QuestionBankModal';
import { AIGeneratorModal } from './AIGeneratorModal';
import { AIVariantMaker } from './AIVariantMaker';
import { recruiterService } from '../../../services/recruiter.service';

export interface Section {
  id: string;
  order: number;
  type: 'mcq' | 'essay' | 'code';
  variants: QuestionVariant[];
  points: number;
  variantsToSelect: number;
  selectionStrategy?: 'random' | 'sequential';
}

export interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  options?: string[];
  correctAnswer?: number | number[];
  multipleCorrect?: boolean;
  expectedKeywords?: string[];
  maxWords?: number;
  rubric?: string;
  codeTemplate?: string;
  starterCode?: string;
  functionName?: string;
  inputFormat?: string;
  outputFormat?: string;
  questionExamples?: any[];
  questionConstraints?: string[];
  topics?: string[];
  testCases?: any[];
  language?: string;
  timeLimit?: number;
  memoryLimit?: number;
  explanation?: string;
  evidence?: string;
  referenceAnswer?: string;
  rubricYesNoChecks?: Array<{ id?: number; check?: string; weight?: number }>;
  needsReview?: boolean;
  criticScore?: number;
  criticWeightedScore?: number;
  criticFeedback?: string;
  criticChecks?: Array<{ id?: number; criterion: string; verdict: 'YES' | 'NO'; reason?: string; weight?: number; weighted_value?: number }>;
  retryCount?: number;
  category?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

interface SectionEditorProps {
  section: Section;
  onSave: (section: Section) => void;
  onCancel: () => void;
}

type CreationMethod = null | 'manual' | 'ai' | 'bank';
type EditingVariant = { index: number; variant: QuestionVariant } | null;

export function SectionEditor({ section, onSave, onCancel }: SectionEditorProps) {
  // Ensure defaults exist when editing older section payloads.
  const initialSection: Section = {
    ...section,
    selectionStrategy: section.selectionStrategy || 'random',
    variantsToSelect: section.variantsToSelect || 1,
  };
  const [currentSection, setCurrentSection] = useState<Section>(initialSection);
  const [creationMethod, setCreationMethod] = useState<CreationMethod>(null);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [editingVariant, setEditingVariant] = useState<EditingVariant>(null);
  const [showAIVariantMaker, setShowAIVariantMaker] = useState(false);
  const [selectedVariantForAI, setSelectedVariantForAI] = useState<QuestionVariant | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());
  // Batch variant generation flow (code type only)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [variantGenerateCount, setVariantGenerateCount] = useState(1);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [generatedVariants, setGeneratedVariants] = useState<QuestionVariant[]>([]);
  const [selectedGeneratedIds, setSelectedGeneratedIds] = useState<Set<number>>(new Set());

  const toggleVariantExpansion = (variantId: string) => {
    const newExpanded = new Set(expandedVariants);
    if (newExpanded.has(variantId)) {
      newExpanded.delete(variantId);
    } else {
      newExpanded.add(variantId);
    }
    setExpandedVariants(newExpanded);
  };

  const handleQuestionTypeSelect = (type: 'mcq' | 'essay' | 'code') => {
    if (currentSection.variants.length > 0) {
      alert('You cannot change the section type while it has existing variants. Please delete all variants first.');
      return;
    }
    setCurrentSection({ ...currentSection, type });
  };

  const handleAddVariant = (variant: QuestionVariant) => {
    let newId = variant.id || `variant-${Date.now()}`;
    // Prevent duplicate keys if the same bank question is added twice
    if (currentSection.variants.some(v => v.id === newId)) {
      newId = `${newId}-${Date.now()}`;
    }

    setCurrentSection({
      ...currentSection,
      variants: [...currentSection.variants, { ...variant, id: newId }]
    });
    setCreationMethod(null);
    setEditingVariant(null);
  };

  const handleUpdateVariant = (index: number, variant: QuestionVariant) => {
    const newVariants = [...currentSection.variants];
    const oldVariant = newVariants[index];

    // If the variant was edited and its ID is a UUID (meaning it came from DB),
    // we fork it by assigning a new frontend ID. This signals the backend to create 
    // a new QuestionBank entry instead of linking to the unchanged one.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oldVariant.id);
    if (isUUID && JSON.stringify(oldVariant) !== JSON.stringify(variant)) {
      variant.id = `variant-${Date.now()}`;
    }

    newVariants[index] = variant;
    setCurrentSection({ ...currentSection, variants: newVariants });
    setEditingVariant(null);
  };

  const handleDeleteVariant = (index: number) => {
    setCurrentSection({
      ...currentSection,
      variants: currentSection.variants.filter((_, i) => i !== index)
    });
  };

  const handleDuplicateVariant = (index: number) => {
    const variantToDuplicate = currentSection.variants[index];
    const duplicated = {
      ...variantToDuplicate,
      id: `variant-${Date.now()}`,
      questionText: variantToDuplicate.questionText + ' (Copy)'
    };
    setCurrentSection({
      ...currentSection,
      variants: [...currentSection.variants, duplicated]
    });
  };

  const handleGenerateVariants = (baseVariant: QuestionVariant) => {
    setSelectedVariantForAI(baseVariant);
    setShowAIVariantMaker(true);
  };

  const MAX_VARIANTS = 7;

  const handleGenerateVariantsBatch = async () => {
    const baseVariant = currentSection.variants.find(v => v.id === selectedVariantId);
    if (!baseVariant) return;

    const remaining = MAX_VARIANTS - currentSection.variants.length;
    const count = Math.min(variantGenerateCount, remaining);
    if (count <= 0) {
      alert(`Maximum ${MAX_VARIANTS} variants already reached.`);
      return;
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(baseVariant.id);
    setGeneratingVariants(true);

    try {
      let questionId = baseVariant.id;

      if (!isUUID) {
        const saved = await recruiterService.createQuestionBank({
          text: baseVariant.questionText,
          type: 'Code',
          codeLanguage: (baseVariant.language || 'python').toLowerCase(),
          codeTemplate: baseVariant.starterCode || baseVariant.codeTemplate || '',
          starterCode: baseVariant.starterCode || baseVariant.codeTemplate || '',
          functionName: baseVariant.functionName || '',
          testCases: baseVariant.testCases || [],
          difficulty: baseVariant.difficulty || 'Medium',
          category: baseVariant.category || '',
          tags: baseVariant.tags || [],
          inputFormat: baseVariant.inputFormat || '',
          outputFormat: baseVariant.outputFormat || '',
          constraints: baseVariant.questionConstraints || [],
          examples: baseVariant.questionExamples || [],
          topics: baseVariant.topics || [],
        });
        questionId = saved.id;
        const idx = currentSection.variants.findIndex(v => v.id === selectedVariantId);
        if (idx >= 0) {
          const updated = [...currentSection.variants];
          updated[idx] = { ...updated[idx], id: questionId };
          setCurrentSection({ ...currentSection, variants: updated });
          setSelectedVariantId(questionId);
        }
      }

      const results = await Promise.all(
        Array.from({ length: count }, () => recruiterService.generateQuestionVariant(questionId))
      );

      const mapped: QuestionVariant[] = results.map(result => ({
        ...result,
        type: currentSection.type as 'mcq' | 'essay' | 'code',
        questionText: result.questionText || result.question_text || baseVariant.questionText,
        questionExamples: result.questionExamples || result.examples,
        questionConstraints: result.questionConstraints || result.constraints,
        starterCode: result.starterCode || result.codeTemplate,
      }));

      setGeneratedVariants(mapped);
      setSelectedGeneratedIds(new Set(Array.from({ length: count }, (_, i) => i)));
    } catch {
      alert('Failed to generate variants. Please check the AI service and try again.');
    } finally {
      setGeneratingVariants(false);
    }
  };

  const toggleGeneratedSelection = (index: number) => {
    const newSet = new Set(selectedGeneratedIds);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedGeneratedIds(newSet);
  };

  const handleAddSelectedGeneratedVariants = () => {
    const toAdd = generatedVariants.filter((_, i) => selectedGeneratedIds.has(i));
    if (toAdd.length === 0) return;
    setCurrentSection({
      ...currentSection,
      variants: [
        ...currentSection.variants,
        ...toAdd.map(v => ({ ...v, id: v.id || `variant-${Date.now()}-${Math.random().toString(36).slice(2)}` })),
      ],
    });
    setGeneratedVariants([]);
    setSelectedGeneratedIds(new Set());
    setSelectedVariantId(null);
  };

  const handleAIVariantsGenerated = (variants: QuestionVariant[]) => {
    setCurrentSection({
      ...currentSection,
      variants: [...currentSection.variants, ...variants]
    });
    setShowAIVariantMaker(false);
    setSelectedVariantForAI(null);
  };

  const handleQuestionBankSelect = (question: QuestionVariant) => {
    handleAddVariant(question);
    setShowQuestionBank(false);
  };

  const handleSwitchToAIFromBank = () => {
    setShowQuestionBank(false);
    setShowAIGenerator(true);
  };

  const handleAIGenerate = (question: QuestionVariant | QuestionVariant[] | any) => {
    const list = (Array.isArray(question) ? question : [question]) as QuestionVariant[];
    // Use functional setState so each variant is appended to the result of
    // the previous update — avoids the stale-closure overwrite in a forEach loop.
    setCurrentSection(prev => {
      let variants = [...prev.variants];
      for (const variant of list) {
        let newId = variant.id || `variant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (variants.some(v => v.id === newId)) {
          newId = `${newId}-${Date.now()}`;
        }
        variants = [...variants, { ...variant, id: newId }];
      }
      return { ...prev, variants };
    });
    setCreationMethod(null);
    setEditingVariant(null);
    setShowAIGenerator(false);
  };

  const handleSave = () => {
    if (currentSection.variants.length === 0) {
      alert('Please add at least one question variant to this section');
      return;
    }
    onSave(currentSection);
  };

  // If editing a variant
  if (editingVariant !== null || creationMethod === 'manual') {
    const variant = editingVariant?.variant || {
      id: `variant-${Date.now()}`,
      questionText: '',
      type: currentSection.type,
      difficulty: 'Medium'
    } as QuestionVariant;

    const handleEditorSave = (updatedVariant: QuestionVariant) => {
      if (editingVariant !== null) {
        handleUpdateVariant(editingVariant.index, updatedVariant);
      } else {
        handleAddVariant(updatedVariant);
      }
    };

    const handleEditorCancel = () => {
      setEditingVariant(null);
      setCreationMethod(null);
    };

    if (currentSection.type === 'mcq') {
      return <MCQEditor variant={variant} onSave={handleEditorSave} onCancel={handleEditorCancel} />;
    } else if (currentSection.type === 'essay') {
      return <EssayEditor variant={variant as any} onSave={handleEditorSave} onCancel={handleEditorCancel} />;
    } else if (currentSection.type === 'code') {
      return <CodeEditor variant={variant as any} onSave={handleEditorSave} onCancel={handleEditorCancel} />;
    }
  }

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[1400px] mx-auto px-[48px] py-[24px]">
        {/* Header */}
        <button
          onClick={onCancel}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back to Sections</span>
        </button>

        <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8 mb-6">
          <h1 className="text-[#111827] mb-2">Section {section.order}</h1>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
            Configure the question type and add variants. Candidates will see one random variant from this section.
          </p>

          {/* Question Type Selection */}
          <div className="mb-6">
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-3">
              Question Type
            </label>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => handleQuestionTypeSelect('mcq')}
                disabled={currentSection.variants.length > 0 && currentSection.type !== 'mcq'}
                className={`p-6 rounded-[12px] border-2 transition-all ${currentSection.type === 'mcq'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-[#e5e7eb] bg-white hover:border-blue-300'
                  } ${(currentSection.variants.length > 0 && currentSection.type !== 'mcq') ? 'opacity-50 cursor-not-allowed hover:border-[#e5e7eb]' : ''}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 mx-auto ${currentSection.type === 'mcq' ? 'bg-blue-500' : 'bg-[#f9fafb]'
                  }`}>
                  <CheckCircle size={24} className={currentSection.type === 'mcq' ? 'text-white' : 'text-[#6b7280]'} />
                </div>
                <div className="text-center">
                  <div className={`font-['Arimo',sans-serif] text-[14px] mb-1 ${currentSection.type === 'mcq' ? 'text-blue-700' : 'text-[#111827]'
                    }`}>
                    Multiple Choice
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Single or multiple answers
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleQuestionTypeSelect('essay')}
                disabled={currentSection.variants.length > 0 && currentSection.type !== 'essay'}
                className={`p-6 rounded-[12px] border-2 transition-all ${currentSection.type === 'essay'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-[#e5e7eb] bg-white hover:border-purple-300'
                  } ${(currentSection.variants.length > 0 && currentSection.type !== 'essay') ? 'opacity-50 cursor-not-allowed hover:border-[#e5e7eb]' : ''}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 mx-auto ${currentSection.type === 'essay' ? 'bg-purple-500' : 'bg-[#f9fafb]'
                  }`}>
                  <Edit2 size={24} className={currentSection.type === 'essay' ? 'text-white' : 'text-[#6b7280]'} />
                </div>
                <div className="text-center">
                  <div className={`font-['Arimo',sans-serif] text-[14px] mb-1 ${currentSection.type === 'essay' ? 'text-purple-700' : 'text-[#111827]'
                    }`}>
                    Essay
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Free-form text response
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleQuestionTypeSelect('code')}
                disabled={currentSection.variants.length > 0 && currentSection.type !== 'code'}
                className={`p-6 rounded-[12px] border-2 transition-all ${currentSection.type === 'code'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-[#e5e7eb] bg-white hover:border-emerald-300'
                  } ${(currentSection.variants.length > 0 && currentSection.type !== 'code') ? 'opacity-50 cursor-not-allowed hover:border-[#e5e7eb]' : ''}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 mx-auto ${currentSection.type === 'code' ? 'bg-emerald-500' : 'bg-[#f9fafb]'
                  }`}>
                  <XCircle size={24} className={currentSection.type === 'code' ? 'text-white' : 'text-[#6b7280]'} />
                </div>
                <div className="text-center">
                  <div className={`font-['Arimo',sans-serif] text-[14px] mb-1 ${currentSection.type === 'code' ? 'text-emerald-700' : 'text-[#111827]'
                    }`}>
                    Coding
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Code with test cases
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Points & Strategy */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Points for this Section
              </label>
              <input
                type="number"
                value={currentSection.points}
                onChange={(e) => setCurrentSection({ ...currentSection, points: parseInt(e.target.value) || 0 })}
                min="1"
                max="100"
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Questions per candidate
              </label>
              <input
                type="number"
                value={currentSection.variantsToSelect || 1}
                onChange={(e) => {
                  let val = parseInt(e.target.value) || 1;
                  if (val < 1) val = 1;
                  setCurrentSection({ ...currentSection, variantsToSelect: val });
                }}
                min="1"
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Variant Selection Strategy
              </label>
              <div className="flex bg-[#f9fafb] p-1 rounded-[8px] border border-[#e5e7eb]">
                <button
                  type="button"
                  onClick={() => setCurrentSection({ ...currentSection, selectionStrategy: 'random' })}
                  className={`flex-1 h-[34px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] font-medium transition-all ${currentSection.selectionStrategy === 'random' || !currentSection.selectionStrategy
                    ? 'bg-[#6366f1] text-white shadow-sm'
                    : 'text-[#6b7280] hover:text-[#374151]'
                    }`}
                >
                  Random
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentSection({ ...currentSection, selectionStrategy: 'sequential' })}
                  className={`flex-1 h-[34px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] font-medium transition-all ${currentSection.selectionStrategy === 'sequential'
                    ? 'bg-[#6366f1] text-white shadow-sm'
                    : 'text-[#6b7280] hover:text-[#374151]'
                    }`}
                >
                  Sequential
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Variants Section */}
        <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[#111827] mb-1">Question Variants</h2>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                Add multiple variants of equal difficulty. One random variant will be shown to each candidate.
              </p>
            </div>
          </div>

          {/* Add Question Methods */}
          {currentSection.variants.length === 0 || creationMethod === null ? (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => setCreationMethod('manual')}
                className="p-6 rounded-[12px] border-2 border-[#e5e7eb] bg-white hover:border-[#6366f1] hover:bg-[#f9fafb] transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-[#ede9fe] flex items-center justify-center mb-3 mx-auto">
                  <Plus size={24} className="text-[#6366f1]" />
                </div>
                <div className="text-center">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-1">
                    Create Manually
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Write your own question
                  </div>
                </div>
              </button>

              <button
                onClick={() => setShowAIGenerator(true)}
                className="p-6 rounded-[12px] border-2 border-[#e5e7eb] bg-white hover:border-[#6366f1] hover:bg-[#f9fafb] transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-[#ede9fe] flex items-center justify-center mb-3 mx-auto">
                  <Wand2 size={24} className="text-[#6366f1]" />
                </div>
                <div className="text-center">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-1">
                    Generate with AI
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    AI-powered creation
                  </div>
                </div>
              </button>

              <button
                onClick={() => setShowQuestionBank(true)}
                className="p-6 rounded-[12px] border-2 border-[#e5e7eb] bg-white hover:border-[#6366f1] hover:bg-[#f9fafb] transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-[#ede9fe] flex items-center justify-center mb-3 mx-auto">
                  <Database size={24} className="text-[#6366f1]" />
                </div>
                <div className="text-center">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-1">
                    Question Bank
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Browse existing questions
                  </div>
                </div>
              </button>
            </div>
          ) : null}

          {/* Variants List */}
          {currentSection.variants.length > 0 && (
            <div className="space-y-4">
              {currentSection.variants.map((variant, index) => {
                const isExpanded = expandedVariants.has(variant.id);
                const isSelected = selectedVariantId === variant.id;
                const isCodeSection = currentSection.type === 'code';
                return (
                  <div
                    key={variant.id}
                    className={`border-2 rounded-[12px] overflow-hidden transition-all ${
                      isSelected
                        ? 'border-[#6366f1] shadow-sm shadow-indigo-100'
                        : 'border-[#e5e7eb] hover:border-[#6366f1]/40'
                    }`}
                  >
                    {/* Variant Header */}
                    <div
                      className="p-6 cursor-pointer"
                      onClick={() => {
                        if (isCodeSection) {
                          setSelectedVariantId(isSelected ? null : variant.id);
                          if (!isSelected) setGeneratedVariants([]);
                        }
                        toggleVariantExpansion(variant.id);
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {isCodeSection && (
                              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                isSelected ? 'border-[#6366f1] bg-[#6366f1]' : 'border-[#d1d5db]'
                              }`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                            )}
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-medium">
                              Variant {index + 1}
                            </span>
                            {variant.difficulty && (
                              <div className="flex items-center gap-2">
                                {variant.category && (
                                  <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700">
                                    {variant.category}
                                  </span>
                                )}
                                <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${variant.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                  variant.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-red-100 text-red-700'
                                  }`}>
                                  {variant.difficulty}
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] line-clamp-2">
                            {variant.questionText}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setEditingVariant({ index, variant })}
                            className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors flex items-center justify-center"
                            title="Edit"
                          >
                            <Edit2 size={14} className="text-[#6b7280]" />
                          </button>
                          <button
                            onClick={() => handleDuplicateVariant(index)}
                            className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors flex items-center justify-center"
                            title="Duplicate"
                          >
                            <Copy size={14} className="text-[#6b7280]" />
                          </button>
                          {!isCodeSection && (
                            <button
                              onClick={() => handleGenerateVariants(variant)}
                              className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-purple-50 hover:border-purple-200 transition-colors flex items-center justify-center"
                              title="Generate AI Variants"
                            >
                              <Wand2 size={14} className="text-purple-600" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteVariant(index)}
                            className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center"
                            title="Delete"
                          >
                            <Trash2 size={14} className="text-red-600" />
                          </button>
                          <ChevronDown size={16} className={`text-[#9ca3af] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {/* Collapsed Preview */}
                      {!isExpanded && (
                        <>
                          {variant.type === 'mcq' && variant.options && (
                            <div className="mt-3 space-y-2">
                              {variant.options.slice(0, 2).map((option, oIndex) => (
                                <div key={oIndex} className="text-[13px] text-[#6b7280] truncate">
                                  {String.fromCharCode(65 + oIndex)}. {option}
                                </div>
                              ))}
                              {variant.options.length > 2 && (
                                <div className="text-[13px] text-[#6366f1] font-medium">
                                  Click to see all {variant.options.length} options
                                </div>
                              )}
                            </div>
                          )}

                          {variant.type === 'code' && (
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-[#6b7280]">
                              {variant.functionName && (
                                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-[12px] text-[#111827]">{variant.functionName}()</span>
                              )}
                              <span>{variant.language || 'Python'}</span>
                              <span>{variant.testCases?.length || 0} test cases</span>
                              {variant.topics?.slice(0, 2).map((t: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[11px]">{t}</span>
                              ))}
                              <span className="text-[#6366f1] font-medium">Click to see details</span>
                            </div>
                          )}

                          {variant.type === 'essay' && (
                            <div className="mt-3 text-[13px] text-[#6b7280]">
                              {variant.maxWords && <span>Max words: {variant.maxWords}</span>}
                              <span className="text-[#6366f1] font-medium ml-3">Click to see details</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-6 pb-6 border-t border-[#e5e7eb] pt-4 bg-[#f9fafb]">
                        {/* MCQ Full Details */}
                        {variant.type === 'mcq' && variant.options && (
                          <div className="space-y-3">
                            <div className="text-[13px] font-medium text-[#374151] mb-2">Answer Options:</div>
                            {variant.options.map((option, oIndex) => {
                              const isCorrect = Array.isArray(variant.correctAnswer)
                                ? variant.correctAnswer.includes(oIndex)
                                : variant.correctAnswer === oIndex;
                              return (
                                <div
                                  key={oIndex}
                                  className={`flex items-start gap-3 p-3 rounded-[8px] ${isCorrect
                                    ? 'bg-emerald-50 border border-emerald-200'
                                    : 'bg-white border border-[#e5e7eb]'
                                    }`}
                                >
                                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${isCorrect
                                    ? 'border-emerald-600 bg-emerald-600'
                                    : 'border-gray-300'
                                    }`}>
                                    {isCorrect && (
                                      <CheckCircle size={12} className="text-white" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                                      <span className="font-medium">{String.fromCharCode(65 + oIndex)}.</span> {option}
                                    </div>
                                    {isCorrect && (
                                      <div className="text-[11px] text-emerald-700 mt-1 font-medium">
                                        ✓ Correct Answer
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {variant.multipleCorrect && (
                              <div className="text-[12px] text-[#6b7280] bg-blue-50 border border-blue-200 rounded-[6px] p-2">
                                ℹ️ Multiple correct answers allowed
                              </div>
                            )}
                          </div>
                        )}

                        {/* Code Full Details */}
                        {variant.type === 'code' && (
                          <div className="space-y-4">
                            <div>
                              <div className="text-[13px] font-medium text-[#374151] mb-2">Language & Constraints:</div>
                              <div className="bg-white rounded-[8px] border border-[#e5e7eb] p-3 grid grid-cols-2 gap-3">
                                <div>
                                  <span className="text-[12px] text-[#6b7280]">Language:</span>
                                  <span className="text-[13px] text-[#111827] ml-2 font-medium">{variant.language || 'Python'}</span>
                                </div>
                                {variant.functionName && (
                                  <div>
                                    <span className="text-[12px] text-[#6b7280]">Function:</span>
                                    <span className="text-[13px] text-[#111827] ml-2 font-mono font-medium">{variant.functionName}()</span>
                                  </div>
                                )}
                                {variant.timeLimit && (
                                  <div>
                                    <span className="text-[12px] text-[#6b7280]">Time Limit:</span>
                                    <span className="text-[13px] text-[#111827] ml-2 font-medium">{variant.timeLimit}s</span>
                                  </div>
                                )}
                                {variant.memoryLimit && (
                                  <div>
                                    <span className="text-[12px] text-[#6b7280]">Memory Limit:</span>
                                    <span className="text-[13px] text-[#111827] ml-2 font-medium">{variant.memoryLimit}MB</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {variant.topics && variant.topics.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {variant.topics.map((t: string, i: number) => (
                                  <span key={i} className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[11px] border border-indigo-100">{t}</span>
                                ))}
                              </div>
                            )}

                            {variant.codeTemplate && (
                              <div>
                                <div className="text-[13px] font-medium text-[#374151] mb-2">Code Template:</div>
                                <pre className="bg-gray-900 text-gray-100 rounded-[8px] p-4 text-[12px] overflow-x-auto">
                                  <code>{variant.codeTemplate}</code>
                                </pre>
                              </div>
                            )}

                            {variant.testCases && variant.testCases.length > 0 && (
                              <div>
                                <div className="text-[13px] font-medium text-[#374151] mb-2">Test Cases ({variant.testCases.length}):</div>
                                <div className="space-y-2">
                                  {variant.testCases.map((testCase: any, tcIndex: number) => (
                                    <div key={testCase.id || tcIndex} className="bg-white rounded-[8px] border border-[#e5e7eb] p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[12px] font-medium text-[#374151]">Test Case {tcIndex + 1}</span>
                                        <div className="flex items-center gap-2">
                                          {(testCase.isHidden || testCase.is_hidden) && (
                                            <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Hidden</span>
                                          )}
                                          {testCase.points != null && (
                                            <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{testCase.points} pts</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <div className="text-[11px] text-[#6b7280] mb-1">Input:</div>
                                          <pre className="text-[12px] text-[#111827] bg-[#f9fafb] p-2 rounded-[4px] overflow-x-auto">{testCase.input}</pre>
                                        </div>
                                        <div>
                                          <div className="text-[11px] text-[#6b7280] mb-1">Expected Output:</div>
                                          <pre className="text-[12px] text-[#111827] bg-[#f9fafb] p-2 rounded-[4px] overflow-x-auto">{testCase.expectedOutput ?? testCase.expected ?? ''}</pre>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Essay Full Details */}
                        {variant.type === 'essay' && (
                          <div className="space-y-4">
                            {variant.maxWords && (
                              <div className="bg-white rounded-[8px] border border-[#e5e7eb] p-3">
                                <span className="text-[12px] text-[#6b7280]">Maximum Words:</span>
                                <span className="text-[13px] text-[#111827] ml-2 font-medium">{variant.maxWords}</span>
                              </div>
                            )}

                            {variant.expectedKeywords && variant.expectedKeywords.length > 0 && (
                              <div>
                                <div className="text-[13px] font-medium text-[#374151] mb-2">Expected Keywords:</div>
                                <div className="flex flex-wrap gap-2">
                                  {variant.expectedKeywords.map((keyword, kIndex) => (
                                    <span key={kIndex} className="px-3 py-1 bg-blue-50 text-blue-700 text-[12px] rounded-full border border-blue-200">
                                      {keyword}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {variant.rubric && (
                              <div>
                                <div className="text-[13px] font-medium text-[#374151] mb-2">Evaluation Rubric:</div>
                                <div className="bg-white rounded-[8px] border border-[#e5e7eb] p-4">
                                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151] whitespace-pre-wrap">
                                    {variant.rubric}
                                  </p>
                                </div>
                              </div>
                            )}

                            {variant.rubricYesNoChecks && variant.rubricYesNoChecks.length > 0 && (
                              <div>
                                <div className="text-[13px] font-medium text-[#374151] mb-2">Rubric YES/NO Checks:</div>
                                <div className="bg-white rounded-[8px] border border-[#e5e7eb] p-3 space-y-2">
                                  {variant.rubricYesNoChecks.slice(0, 10).map((check, checkIndex) => (
                                    <div key={`${check.id}-${checkIndex}`} className="flex items-center justify-between gap-3 text-[12px]">
                                      <span className="text-[#374151]">{checkIndex + 1}. {check.check}</span>
                                      <span className="text-[#6b7280]">{Number(check.weight || 0).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Explanation (if exists) */}
                        {variant.explanation && (
                          <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
                            <div className="text-[13px] font-medium text-[#374151] mb-2">Explanation:</div>
                            <div className="bg-emerald-50 border border-emerald-200 rounded-[8px] p-3">
                              <p className="font-['Arimo',sans-serif] text-[13px] text-emerald-900">
                                {variant.explanation}
                              </p>
                            </div>
                          </div>
                        )}

                        {(variant.evidence || variant.referenceAnswer) && (
                          <div className="mt-4 space-y-3">
                            {variant.evidence && (
                              <div>
                                <div className="text-[13px] font-medium text-[#374151] mb-2">Evidence:</div>
                                <div className="bg-blue-50 border border-blue-200 rounded-[8px] p-3">
                                  <p className="font-['Arimo',sans-serif] text-[13px] text-blue-900 whitespace-pre-wrap">{variant.evidence}</p>
                                </div>
                              </div>
                            )}
                            {variant.referenceAnswer && (
                              <div>
                                <div className="text-[13px] font-medium text-[#374151] mb-2">Reference Answer:</div>
                                <div className="bg-indigo-50 border border-indigo-200 rounded-[8px] p-3">
                                  <p className="font-['Arimo',sans-serif] text-[13px] text-indigo-900 whitespace-pre-wrap">{variant.referenceAnswer}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {(variant.criticFeedback || typeof variant.criticScore === 'number') && (
                          <div className="mt-4">
                            <div className="text-[13px] font-medium text-[#374151] mb-2">Critic Signals:</div>
                            <div className="bg-amber-50 border border-amber-200 rounded-[8px] p-3">
                              <div className="text-[12px] text-amber-900">
                                Score: {typeof variant.criticScore === 'number' ? variant.criticScore.toFixed(2) : 'N/A'}
                                {typeof variant.criticWeightedScore === 'number' && (
                                  <span className="ml-3">Weighted: {variant.criticWeightedScore.toFixed(2)}</span>
                                )}
                              </div>
                              {variant.criticFeedback && (
                                <p className="mt-2 font-['Arimo',sans-serif] text-[13px] text-amber-900 whitespace-pre-wrap">{variant.criticFeedback}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tags (if exists) */}
                        {variant.tags && variant.tags.length > 0 && (
                          <div className="mt-4">
                            <div className="text-[13px] font-medium text-[#374151] mb-2">Tags:</div>
                            <div className="flex flex-wrap gap-2">
                              {variant.tags.map((tag, tIndex) => (
                                <span key={tIndex} className="px-2 py-1 bg-gray-100 text-gray-700 text-[11px] rounded-[4px]">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Batch Variant Generation Panel — code sections only, appears when a variant is selected */}
              {currentSection.type === 'code' && selectedVariantId && generatedVariants.length === 0 && (
                <div className="rounded-[12px] border border-[#6366f1]/30 bg-indigo-50/50 p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151] font-medium mb-1">
                        Generate variants from selected
                      </p>
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                        The AI will rewrite the problem narrative while keeping the same test cases and code structure.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Count:</span>
                      {[1, 2, 3].filter((n) => currentSection.variants.length + n <= MAX_VARIANTS).map((n) => (
                        <button
                          key={n}
                          onClick={() => setVariantGenerateCount(n)}
                          className={`w-8 h-8 rounded-[6px] border text-[13px] font-medium transition-colors ${
                            variantGenerateCount === n
                              ? 'border-[#6366f1] bg-[#6366f1] text-white'
                              : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        onClick={() => void handleGenerateVariantsBatch()}
                        disabled={generatingVariants}
                        className="h-[34px] px-4 rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] text-white font-['Arimo',sans-serif] text-[13px] disabled:opacity-60 flex items-center gap-2 transition-colors"
                      >
                        {generatingVariants
                          ? <><Loader2 size={13} className="animate-spin" /> Generating...</>
                          : <><Wand2 size={13} /> Generate</>
                        }
                      </button>
                      <button
                        onClick={() => setSelectedVariantId(null)}
                        className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#374151] px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Generated Variants Preview — select which to add */}
              {generatedVariants.length > 0 && (
                <div className="rounded-[12px] border border-[#6366f1]/30 bg-indigo-50/30 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                        {generatedVariants.length} variant{generatedVariants.length > 1 ? 's' : ''} generated — select which to add
                      </p>
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mt-0.5">
                        All are pre-selected. Uncheck any you don't want.
                      </p>
                    </div>
                    <button
                      onClick={() => { setGeneratedVariants([]); setSelectedGeneratedIds(new Set()); }}
                      className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] hover:text-[#374151]"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="space-y-3 mb-4">
                    {generatedVariants.map((v, i) => (
                      <div
                        key={i}
                        onClick={() => toggleGeneratedSelection(i)}
                        className={`flex items-start gap-3 p-4 rounded-[10px] border-2 cursor-pointer transition-all ${
                          selectedGeneratedIds.has(i)
                            ? 'border-[#6366f1] bg-white'
                            : 'border-[#e5e7eb] bg-white/60 opacity-60'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-[4px] border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                          selectedGeneratedIds.has(i) ? 'border-[#6366f1] bg-[#6366f1]' : 'border-[#d1d5db]'
                        }`}>
                          {selectedGeneratedIds.has(i) && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-['Arimo',sans-serif] text-[13px] text-[#111827] line-clamp-3 mb-2">
                            {v.questionText || '(Problem narrative not returned — AI service may be unavailable)'}
                          </p>
                          <div className="flex items-center gap-3 text-[12px] text-[#6b7280]">
                            {v.functionName && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{v.functionName}()</span>}
                            <span>{v.testCases?.length || 0} test cases</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      {selectedGeneratedIds.size} of {generatedVariants.length} selected
                    </span>
                    <button
                      onClick={handleAddSelectedGeneratedVariants}
                      disabled={selectedGeneratedIds.size === 0}
                      className="h-[36px] px-5 rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] text-white font-['Arimo',sans-serif] text-[13px] disabled:opacity-50 transition-colors"
                    >
                      Add {selectedGeneratedIds.size > 0 ? `${selectedGeneratedIds.size} ` : ''}Selected
                    </button>
                  </div>
                </div>
              )}

              {/* Add Another Variant / Show creation methods */}
              <button
                onClick={() => setCreationMethod(null)}
                className="w-full p-4 rounded-[12px] border-2 border-dashed border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-all flex items-center justify-center gap-2"
              >
                <Plus size={16} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                  Add Another Variant
                </span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {currentSection.variants.length === 0 && (
            <div className="text-center py-8">
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                No variants added yet. Choose a method above to get started.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-6">
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
            disabled={currentSection.variants.length === 0}
          >
            <Save size={16} className="mr-2" />
            Save Section
          </Button>
        </div>
      </div>

      {/* Modals */}
      {showQuestionBank && (
        <QuestionBankModal
          questionType={currentSection.type}
          onSelect={handleQuestionBankSelect}
          onClose={() => setShowQuestionBank(false)}
          onSwitchToAI={handleSwitchToAIFromBank}
        />
      )}

      {showAIGenerator && (
        <AIGeneratorModal
          questionType={currentSection.type}
          onGenerate={handleAIGenerate}
          onClose={() => setShowAIGenerator(false)}
        />
      )}

      {showAIVariantMaker && selectedVariantForAI && (
        <AIVariantMaker
          baseVariant={selectedVariantForAI}
          onGenerate={handleAIVariantsGenerated}
          onClose={() => {
            setShowAIVariantMaker(false);
            setSelectedVariantForAI(null);
          }}
        />
      )}
    </div>
  );
}
