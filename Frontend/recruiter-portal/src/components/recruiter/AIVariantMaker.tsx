import { useState } from 'react';
import { X, Wand2, Check, Edit2, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { api } from '../../services/api';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  [key: string]: any;
}

interface AIVariantMakerProps {
  baseVariant: QuestionVariant;
  onGenerate: (variants: QuestionVariant[]) => void;
  onClose: () => void;
}

export function AIVariantMaker({ baseVariant, onGenerate, onClose }: AIVariantMakerProps) {
  const [numVariants, setNumVariants] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVariants, setGeneratedVariants] = useState<QuestionVariant[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedText, setEditedText] = useState('');
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

  const handleGenerate = async () => {
    setIsGenerating(true);

    try {
      const variants = await api.recruiter.generateQuestionVariants(baseVariant, numVariants);
      setGeneratedVariants(variants);
    } catch (error) {
      console.error('Failed to generate variants:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditedText(generatedVariants[index].questionText);
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null) {
      const updatedVariants = [...generatedVariants];
      updatedVariants[editingIndex] = {
        ...updatedVariants[editingIndex],
        questionText: editedText
      };
      setGeneratedVariants(updatedVariants);
      setEditingIndex(null);
      setEditedText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditedText('');
  };

  const handleRemoveVariant = (index: number) => {
    setGeneratedVariants(generatedVariants.filter((_, i) => i !== index));
  };

  const handleSaveAll = () => {
    if (generatedVariants.length === 0) {
      alert('No variants to save');
      return;
    }
    onGenerate(generatedVariants);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center">
                <Wand2 size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-[#111827]">AI Variant Generator</h2>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Generate similar questions with equal difficulty
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {generatedVariants.length === 0 ? (
            <>
              {/* Base Question */}
              <div className="mb-6">
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Base Question
                </label>
                <div className="p-4 bg-[#f9fafb] rounded-[12px] border border-[#e5e7eb]">
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    {baseVariant.questionText}
                  </p>
                </div>
              </div>

              {/* Number of Variants */}
              <div className="mb-6">
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Number of Variants to Generate
                </label>
                <input
                  type="number"
                  value={numVariants}
                  onChange={(e) => setNumVariants(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  min="1"
                  max="10"
                  className="w-32 h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Info Box */}
              <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-[12px]">
                <p className="font-['Arimo',sans-serif] text-[13px] text-purple-900 mb-2">
                  <strong>AI will create {numVariants} variant{numVariants !== 1 ? 's' : ''}:</strong>
                </p>
                <ul className="font-['Arimo',sans-serif] text-[13px] text-purple-800 list-disc list-inside space-y-1">
                  <li>Equal difficulty to the original question</li>
                  <li>Similar structure and format</li>
                  <li>Different wording and examples</li>
                  <li>You can edit each variant before saving</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              {/* Generated Variants */}
              <div className="mb-4">
                <h3 className="text-[#111827] mb-1">Generated Variants</h3>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Review and edit variants before saving. All variants will be added to your section.
                </p>
              </div>

              <div className="space-y-3">
                {generatedVariants.map((variant, index) => {
                  const isExpanded = expandedVariants.has(variant.id);
                  return (
                    <div
                      key={variant.id}
                      className="border border-[#e5e7eb] rounded-[12px] overflow-hidden hover:border-purple-300 transition-colors cursor-pointer"
                      onClick={() => toggleVariantExpansion(variant.id)}
                    >
                      {/* Variant Header */}
                      <div className="bg-[#f9fafb] p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                              <span className="text-purple-700 text-[12px] font-medium">{index + 1}</span>
                            </div>
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-medium">
                              Variant {index + 1}
                            </span>
                            {variant.difficulty && (
                              <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${variant.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                variant.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                {variant.difficulty}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveVariant(index);
                            }}
                            className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center"
                            title="Remove"
                          >
                            <X size={14} className="text-red-600" />
                          </button>
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                          {variant.questionText}
                        </p>

                        {/* Collapsed Preview */}
                        {!isExpanded && (
                          <div className="mt-3">
                            {variant.type === 'mcq' && variant.options && (
                              <div className="text-[13px] text-[#6b7280]">
                                {variant.options.length} options • Click to see details
                              </div>
                            )}
                            {variant.type === 'code' && (
                              <div className="text-[13px] text-[#6b7280]">
                                Language: {variant.language || 'Not set'} • {variant.testCases?.length || 0} test cases • Click to see details
                              </div>
                            )}
                            {variant.type === 'essay' && (
                              <div className="text-[13px] text-[#6b7280]">
                                {variant.maxWords && `Max ${variant.maxWords} words • `}Click to see details
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 bg-white">
                          {/* MCQ Full Details */}
                          {variant.type === 'mcq' && variant.options && (
                            <div className="space-y-2">
                              <div className="text-[12px] font-medium text-[#374151] mb-2">Answer Options:</div>
                              {variant.options.map((option: string, oIndex: number) => {
                                const isCorrect = Array.isArray(variant.correctAnswer)
                                  ? variant.correctAnswer.includes(oIndex)
                                  : variant.correctAnswer === oIndex;
                                return (
                                  <div
                                    key={oIndex}
                                    className={`flex items-start gap-2 p-2 rounded-[6px] ${isCorrect
                                      ? 'bg-emerald-50 border border-emerald-200'
                                      : 'bg-[#f9fafb] border border-[#e5e7eb]'
                                      }`}
                                  >
                                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${isCorrect
                                      ? 'border-emerald-600 bg-emerald-600'
                                      : 'border-gray-300'
                                      }`}>
                                      {isCorrect && <CheckCircle size={10} className="text-white" />}
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
                                <div className="text-[11px] text-[#6b7280] bg-blue-50 border border-blue-200 rounded-[4px] p-2">
                                  ℹ️ Multiple correct answers allowed
                                </div>
                              )}
                            </div>
                          )}

                          {/* Code Full Details */}
                          {variant.type === 'code' && (
                            <div className="space-y-3">
                              <div>
                                <div className="text-[12px] font-medium text-[#374151] mb-2">Language & Constraints:</div>
                                <div className="bg-[#f9fafb] rounded-[6px] border border-[#e5e7eb] p-2 text-[12px] text-[#374151]">
                                  Language: <span className="font-medium">{variant.language || 'Not specified'}</span>
                                  {variant.timeLimit && ` • Time: ${variant.timeLimit}s`}
                                  {variant.memoryLimit && ` • Memory: ${variant.memoryLimit}MB`}
                                </div>
                              </div>

                              {variant.codeTemplate && (
                                <div>
                                  <div className="text-[12px] font-medium text-[#374151] mb-2">Code Template:</div>
                                  <pre className="bg-gray-900 text-gray-100 rounded-[6px] p-3 text-[11px] overflow-x-auto">
                                    <code>{variant.codeTemplate}</code>
                                  </pre>
                                </div>
                              )}

                              {variant.testCases && variant.testCases.length > 0 && (
                                <div>
                                  <div className="text-[12px] font-medium text-[#374151] mb-2">Test Cases ({variant.testCases.length}):</div>
                                  <div className="space-y-2">
                                    {variant.testCases.map((testCase: any, tcIndex: number) => (
                                      <div key={testCase.id} className="bg-[#f9fafb] rounded-[6px] border border-[#e5e7eb] p-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[11px] font-medium text-[#374151]">Test Case {tcIndex + 1}</span>
                                          <div className="flex items-center gap-1">
                                            {testCase.isHidden && (
                                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Hidden</span>
                                            )}
                                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{testCase.points} pts</span>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <div className="text-[10px] text-[#6b7280] mb-0.5">Input:</div>
                                            <pre className="text-[11px] text-[#111827] bg-white p-1.5 rounded-[4px] overflow-x-auto">{testCase.input}</pre>
                                          </div>
                                          <div>
                                            <div className="text-[10px] text-[#6b7280] mb-0.5">Output:</div>
                                            <pre className="text-[11px] text-[#111827] bg-white p-1.5 rounded-[4px] overflow-x-auto">{testCase.expectedOutput}</pre>
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
                            <div className="space-y-3">
                              {variant.maxWords && (
                                <div className="bg-[#f9fafb] rounded-[6px] border border-[#e5e7eb] p-2">
                                  <span className="text-[11px] text-[#6b7280]">Maximum Words:</span>
                                  <span className="text-[12px] text-[#111827] ml-2 font-medium">{variant.maxWords}</span>
                                </div>
                              )}

                              {variant.expectedKeywords && variant.expectedKeywords.length > 0 && (
                                <div>
                                  <div className="text-[12px] font-medium text-[#374151] mb-2">Expected Keywords:</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {variant.expectedKeywords.map((keyword: string, kIndex: number) => (
                                      <span key={kIndex} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] rounded-full border border-blue-200">
                                        {keyword}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {variant.rubric && (
                                <div>
                                  <div className="text-[12px] font-medium text-[#374151] mb-2">Evaluation Rubric:</div>
                                  <div className="bg-[#f9fafb] rounded-[6px] border border-[#e5e7eb] p-3">
                                    <p className="font-['Arimo',sans-serif] text-[12px] text-[#374151] whitespace-pre-wrap">
                                      {variant.rubric}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Explanation (if exists) */}
                          {variant.explanation && (
                            <div className="mt-3 pt-3 border-t border-[#e5e7eb]">
                              <div className="text-[12px] font-medium text-[#374151] mb-2">Explanation:</div>
                              <div className="bg-emerald-50 border border-emerald-200 rounded-[6px] p-2">
                                <p className="font-['Arimo',sans-serif] text-[12px] text-emerald-900">
                                  {variant.explanation}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Tags (if exists) */}
                          {variant.tags && variant.tags.length > 0 && (
                            <div className="mt-3">
                              <div className="text-[12px] font-medium text-[#374151] mb-2">Tags:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {variant.tags.map((tag: string, tIndex: number) => (
                                  <span key={tIndex} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded-[4px]">
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
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            {generatedVariants.length > 0 && (
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                {generatedVariants.length} variant{generatedVariants.length !== 1 ? 's' : ''} ready
              </span>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <Button
                variant="outline"
                onClick={onClose}
                className="rounded-[8px]"
                disabled={isGenerating}
              >
                Cancel
              </Button>
              {generatedVariants.length === 0 ? (
                <Button
                  onClick={handleGenerate}
                  className="rounded-[8px] bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 size={16} className="mr-2" />
                      Generate Variants
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleSaveAll}
                  className="rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check size={16} className="mr-2" />
                  Save All Variants
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}