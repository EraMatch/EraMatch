import { useState } from 'react';
import { ChevronLeft, Plus, Wand2, Database, Save, Trash2, Copy, Edit2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { MCQEditor } from '../common/MCQEditor';
import { EssayEditor } from '../common/EssayEditor';
import { CodeEditor } from '../common/CodeEditor';
import { QuestionBankModal } from './QuestionBankModal';
import { AIGeneratorModal } from './AIGeneratorModal';
import { AIVariantMaker } from './AIVariantMaker';

interface Section {
  id: string;
  order: number;
  type: 'mcq' | 'essay' | 'code';
  variants: QuestionVariant[];
  points: number;
}

interface QuestionVariant {
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
  testCases?: TestCase[];
  language?: string;
  timeLimit?: number;
  memoryLimit?: number;
  explanation?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  points: number;
}

interface SectionEditorProps {
  section: Section;
  onSave: (section: Section) => void;
  onCancel: () => void;
}

type CreationMethod = null | 'manual' | 'ai' | 'bank';
type EditingVariant = { index: number; variant: QuestionVariant } | null;

export function SectionEditor({ section, onSave, onCancel }: SectionEditorProps) {
  const [currentSection, setCurrentSection] = useState<Section>(section);
  const [creationMethod, setCreationMethod] = useState<CreationMethod>(null);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [editingVariant, setEditingVariant] = useState<EditingVariant>(null);
  const [showAIVariantMaker, setShowAIVariantMaker] = useState(false);
  const [selectedVariantForAI, setSelectedVariantForAI] = useState<QuestionVariant | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());

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
    setCurrentSection({ ...currentSection, type });
  };

  const handleAddVariant = (variant: QuestionVariant) => {
    setCurrentSection({
      ...currentSection,
      variants: [...currentSection.variants, { ...variant, id: `variant-${Date.now()}` }]
    });
    setCreationMethod(null);
    setEditingVariant(null);
  };

  const handleUpdateVariant = (index: number, variant: QuestionVariant) => {
    const newVariants = [...currentSection.variants];
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

  const handleAIGenerate = (question: QuestionVariant) => {
    handleAddVariant(question);
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
      return <EssayEditor variant={variant} onSave={handleEditorSave} onCancel={handleEditorCancel} />;
    } else if (currentSection.type === 'code') {
      return <CodeEditor variant={variant} onSave={handleEditorSave} onCancel={handleEditorCancel} />;
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
                className={`p-6 rounded-[12px] border-2 transition-all ${
                  currentSection.type === 'mcq'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-[#e5e7eb] bg-white hover:border-blue-300'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 mx-auto ${
                  currentSection.type === 'mcq' ? 'bg-blue-500' : 'bg-[#f9fafb]'
                }`}>
                  <CheckCircle size={24} className={currentSection.type === 'mcq' ? 'text-white' : 'text-[#6b7280]'} />
                </div>
                <div className="text-center">
                  <div className={`font-['Arimo',sans-serif] text-[14px] mb-1 ${
                    currentSection.type === 'mcq' ? 'text-blue-700' : 'text-[#111827]'
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
                className={`p-6 rounded-[12px] border-2 transition-all ${
                  currentSection.type === 'essay'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-[#e5e7eb] bg-white hover:border-purple-300'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 mx-auto ${
                  currentSection.type === 'essay' ? 'bg-purple-500' : 'bg-[#f9fafb]'
                }`}>
                  <Edit2 size={24} className={currentSection.type === 'essay' ? 'text-white' : 'text-[#6b7280]'} />
                </div>
                <div className="text-center">
                  <div className={`font-['Arimo',sans-serif] text-[14px] mb-1 ${
                    currentSection.type === 'essay' ? 'text-purple-700' : 'text-[#111827]'
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
                className={`p-6 rounded-[12px] border-2 transition-all ${
                  currentSection.type === 'code'
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-[#e5e7eb] bg-white hover:border-emerald-300'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 mx-auto ${
                  currentSection.type === 'code' ? 'bg-emerald-500' : 'bg-[#f9fafb]'
                }`}>
                  <XCircle size={24} className={currentSection.type === 'code' ? 'text-white' : 'text-[#6b7280]'} />
                </div>
                <div className="text-center">
                  <div className={`font-['Arimo',sans-serif] text-[14px] mb-1 ${
                    currentSection.type === 'code' ? 'text-emerald-700' : 'text-[#111827]'
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

          {/* Points */}
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
                return (
                  <div
                    key={variant.id}
                    className="border border-[#e5e7eb] rounded-[12px] overflow-hidden hover:border-[#6366f1] transition-colors"
                  >
                    {/* Variant Header - Clickable to expand */}
                    <div 
                      className="p-6 cursor-pointer"
                      onClick={() => toggleVariantExpansion(variant.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-medium">
                              Variant {index + 1}
                            </span>
                            {variant.difficulty && (
                              <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                                variant.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                variant.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {variant.difficulty}
                              </span>
                            )}
                          </div>
                          <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
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
                          <button
                            onClick={() => handleGenerateVariants(variant)}
                            className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-purple-50 hover:border-purple-200 transition-colors flex items-center justify-center"
                            title="Generate AI Variants"
                          >
                            <Wand2 size={14} className="text-purple-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteVariant(index)}
                            className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center"
                            title="Delete"
                          >
                            <Trash2 size={14} className="text-red-600" />
                          </button>
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
                            <div className="mt-3 flex items-center gap-4 text-[13px] text-[#6b7280]">
                              <span>Language: {variant.language || 'Not set'}</span>
                              <span>Test Cases: {variant.testCases?.length || 0}</span>
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
                                  className={`flex items-start gap-3 p-3 rounded-[8px] ${
                                    isCorrect
                                      ? 'bg-emerald-50 border border-emerald-200'
                                      : 'bg-white border border-[#e5e7eb]'
                                  }`}
                                >
                                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                                    isCorrect
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
                                  <span className="text-[13px] text-[#111827] ml-2 font-medium">{variant.language || 'Not specified'}</span>
                                </div>
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
                                  {variant.testCases.map((testCase, tcIndex) => (
                                    <div key={testCase.id} className="bg-white rounded-[8px] border border-[#e5e7eb] p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[12px] font-medium text-[#374151]">Test Case {tcIndex + 1}</span>
                                        <div className="flex items-center gap-2">
                                          {testCase.isHidden && (
                                            <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Hidden</span>
                                          )}
                                          <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{testCase.points} pts</span>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <div className="text-[11px] text-[#6b7280] mb-1">Input:</div>
                                          <pre className="text-[12px] text-[#111827] bg-[#f9fafb] p-2 rounded-[4px] overflow-x-auto">{testCase.input}</pre>
                                        </div>
                                        <div>
                                          <div className="text-[11px] text-[#6b7280] mb-1">Expected Output:</div>
                                          <pre className="text-[12px] text-[#111827] bg-[#f9fafb] p-2 rounded-[4px] overflow-x-auto">{testCase.expectedOutput}</pre>
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

              {/* Add Another Variant Button */}
              <button
                onClick={() => setCreationMethod('manual')}
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