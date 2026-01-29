import { useState } from 'react';
import { ChevronLeft, Plus, Settings, Save, Wand2, Database, Pencil, Copy, Trash2, Eye, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { AssessmentSettings } from './AssessmentSettings';
import { SectionEditor } from './SectionEditor';

interface AssessmentConfig {
  title: string;
  description: string;
  duration: number; // in minutes
  passingScore: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  randomizeQuestions: boolean;
  showResults: boolean;
  allowReview: boolean;
  proctoring: boolean;
}

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
  // MCQ specific
  options?: string[];
  correctAnswer?: number | number[]; // index or indices
  multipleCorrect?: boolean;
  // Essay specific
  expectedKeywords?: string[];
  maxWords?: number;
  rubric?: string;
  // Code specific
  codeTemplate?: string;
  testCases?: TestCase[];
  language?: string;
  timeLimit?: number;
  memoryLimit?: number;
  // Common
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

interface CreateAdvancedAssessmentProps {
  onBack: () => void;
  onSave: (assessment: any) => void;
}

type CreationStep = 'settings' | 'sections';

export function CreateAdvancedAssessment({ onBack, onSave }: CreateAdvancedAssessmentProps) {
  const [currentStep, setCurrentStep] = useState<CreationStep>('settings');
  const [assessmentConfig, setAssessmentConfig] = useState<AssessmentConfig>({
    title: '',
    description: '',
    duration: 60,
    passingScore: 70,
    difficulty: 'Medium',
    randomizeQuestions: true,
    showResults: true,
    allowReview: true,
    proctoring: false
  });
  const [sections, setSections] = useState<Section[]>([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());

  const handleSettingsSave = (settings: AssessmentConfig) => {
    setAssessmentConfig(settings);
    setCurrentStep('sections');
  };

  const handleAddSection = () => {
    const newSection: Section = {
      id: `section-${Date.now()}`,
      order: sections.length + 1,
      type: 'mcq',
      variants: [],
      points: 10
    };
    setSections([...sections, newSection]);
    setCurrentSectionIndex(sections.length);
  };

  const handleSectionUpdate = (sectionId: string, updatedSection: Section) => {
    setSections(sections.map(s => s.id === sectionId ? updatedSection : s));
    setCurrentSectionIndex(null);
  };

  const handleDeleteSection = (sectionId: string) => {
    setSections(sections.filter(s => s.id !== sectionId));
  };

  const toggleSectionExpansion = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const toggleVariantExpansion = (variantId: string) => {
    const newExpanded = new Set(expandedVariants);
    if (newExpanded.has(variantId)) {
      newExpanded.delete(variantId);
    } else {
      newExpanded.add(variantId);
    }
    setExpandedVariants(newExpanded);
  };

  const handleSaveAssessment = () => {
    const assessment = {
      config: assessmentConfig,
      sections: sections
    };
    onSave(assessment);
  };

  const getQuestionTypeColor = (type: 'mcq' | 'essay' | 'code') => {
    switch (type) {
      case 'mcq': return 'bg-blue-100 text-blue-700';
      case 'essay': return 'bg-purple-100 text-purple-700';
      case 'code': return 'bg-emerald-100 text-emerald-700';
    }
  };

  const getQuestionTypeLabel = (type: 'mcq' | 'essay' | 'code') => {
    switch (type) {
      case 'mcq': return 'Multiple Choice';
      case 'essay': return 'Essay';
      case 'code': return 'Coding';
    }
  };

  // If editing a section
  if (currentSectionIndex !== null && sections[currentSectionIndex]) {
    return (
      <SectionEditor
        section={sections[currentSectionIndex]}
        onSave={(updatedSection) => handleSectionUpdate(sections[currentSectionIndex].id, updatedSection)}
        onCancel={() => setCurrentSectionIndex(null)}
      />
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[1400px] mx-auto px-[48px] py-[24px]">
        {/* Header */}
        <button
          onClick={() => {
            // Smart back navigation
            if (currentStep === 'sections') {
              setCurrentStep('settings');
            } else {
              onBack();
            }
          }}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back</span>
        </button>

        {currentStep === 'settings' ? (
          <AssessmentSettings
            initialSettings={assessmentConfig}
            onSave={handleSettingsSave}
          />
        ) : (
          <>
            {/* Assessment Header */}
            <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <h1 className="text-[#111827] mb-2">{assessmentConfig.title || 'Untitled Assessment'}</h1>
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                    {assessmentConfig.description || 'No description'}
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('settings')}
                  className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
                >
                  <Settings size={16} className="text-[#6b7280]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                    Edit Settings
                  </span>
                </button>
              </div>

              {/* Assessment Info */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Duration</div>
                  <div className="text-[20px] text-[#111827]">{assessmentConfig.duration} min</div>
                </div>
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Passing Score</div>
                  <div className="text-[20px] text-[#111827]">{assessmentConfig.passingScore}%</div>
                </div>
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Difficulty</div>
                  <div className="text-[20px] text-[#111827]">{assessmentConfig.difficulty}</div>
                </div>
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Sections</div>
                  <div className="text-[20px] text-[#111827]">{sections.length}</div>
                </div>
              </div>
            </div>

            {/* Sections List */}
            <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[#111827] mb-1">Assessment Sections</h2>
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                    Each section represents one question that candidates will see. Add variants for randomization.
                  </p>
                </div>
                <button
                  onClick={handleAddSection}
                  className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] transition-colors"
                >
                  <Plus size={16} className="text-white" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white">
                    Add Section
                  </span>
                </button>
              </div>

              {sections.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-[#f9fafb] flex items-center justify-center mx-auto mb-4">
                    <Plus size={24} className="text-[#6b7280]" />
                  </div>
                  <h3 className="text-[#111827] mb-2">No sections yet</h3>
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
                    Start by adding your first section to build your assessment
                  </p>
                  <button
                    onClick={handleAddSection}
                    className="h-[40px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] transition-colors text-white font-['Arimo',sans-serif] text-[14px]"
                  >
                    Add First Section
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {sections.map((section, index) => {
                    const isExpanded = expandedSections.has(section.id);
                    return (
                      <div
                        key={section.id}
                        className="border border-[#e5e7eb] rounded-[12px] overflow-hidden hover:border-[#6366f1] transition-colors"
                      >
                        {/* Section Header */}
                        <div className="bg-[#f9fafb] px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-full bg-[#6366f1] flex items-center justify-center">
                                <span className="text-white font-['Arimo',sans-serif] text-[14px]">
                                  {index + 1}
                                </span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                                    Section {index + 1}
                                  </span>
                                  <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${getQuestionTypeColor(section.type)}`}>
                                    {getQuestionTypeLabel(section.type)}
                                  </span>
                                </div>
                                <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                                  {section.variants.length} {section.variants.length === 1 ? 'variant' : 'variants'} • {section.points} points
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setCurrentSectionIndex(index)}
                                className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                              >
                                <Pencil size={14} className="text-[#6b7280]" />
                                <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                                  Edit
                                </span>
                              </button>
                              <button
                                onClick={() => toggleSectionExpansion(section.id)}
                                className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                              >
                                <Eye size={14} className="text-[#6b7280]" />
                                <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                                  {isExpanded ? 'Hide' : 'Preview'}
                                </span>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                              <button
                                onClick={() => handleDeleteSection(section.id)}
                                className="w-[32px] h-[32px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center"
                              >
                                <Trash2 size={14} className="text-red-600" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Section Preview (Expanded) */}
                        {isExpanded && section.variants.length > 0 && (
                          <div className="p-6 border-t border-[#e5e7eb]">
                            <div className="space-y-3">
                              {section.variants.map((variant, vIndex) => {
                                const isVariantExpanded = expandedVariants.has(variant.id);
                                return (
                                  <div 
                                    key={variant.id} 
                                    className="border border-[#e5e7eb] rounded-[8px] overflow-hidden hover:border-[#6366f1] transition-colors cursor-pointer"
                                    onClick={() => toggleVariantExpansion(variant.id)}
                                  >
                                    {/* Variant Header */}
                                    <div className="bg-[#f9fafb] p-4">
                                      <div className="flex items-start justify-between mb-2">
                                        <span className="text-[12px] text-[#6b7280] font-medium">
                                          Variant {vIndex + 1}
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
                                      <p className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                                        {variant.questionText}
                                      </p>

                                      {/* Collapsed Preview */}
                                      {!isVariantExpanded && (
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
                                    {isVariantExpanded && (
                                      <div className="px-4 pb-4 bg-white">
                                        {/* MCQ Full Details */}
                                        {variant.type === 'mcq' && variant.options && (
                                          <div className="space-y-2">
                                            <div className="text-[12px] font-medium text-[#374151] mb-2">Answer Options:</div>
                                            {variant.options.map((option, oIndex) => {
                                              const isCorrect = Array.isArray(variant.correctAnswer)
                                                ? variant.correctAnswer.includes(oIndex)
                                                : variant.correctAnswer === oIndex;
                                              return (
                                                <div
                                                  key={oIndex}
                                                  className={`flex items-start gap-2 p-2 rounded-[6px] ${
                                                    isCorrect
                                                      ? 'bg-emerald-50 border border-emerald-200'
                                                      : 'bg-[#f9fafb] border border-[#e5e7eb]'
                                                  }`}
                                                >
                                                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                                                    isCorrect
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
                                                  {variant.testCases.map((testCase, tcIndex) => (
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
                                                  {variant.expectedKeywords.map((keyword, kIndex) => (
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
                                              {variant.tags.map((tag, tIndex) => (
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
                          </div>
                        )}

                        {/* Empty State */}
                        {isExpanded && section.variants.length === 0 && (
                          <div className="p-6 border-t border-[#e5e7eb] text-center">
                            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                              No variants added yet. Click "Edit" to add questions.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Save Button */}
            {sections.length > 0 && (
              <div className="flex items-center justify-end gap-4 mt-6">
                <Button
                  variant="outline"
                  className="rounded-[8px] px-6"
                  onClick={onBack}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-[8px] px-6 bg-[#6366f1] hover:bg-[#4f46e5] text-white"
                  onClick={handleSaveAssessment}
                >
                  <Save size={16} className="mr-2" />
                  Save Assessment
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}