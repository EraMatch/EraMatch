import { useState } from 'react';
import { X, Check, RefreshCw, BookOpen, Lightbulb, Link as LinkIcon } from 'lucide-react';
import { Button } from '../ui/button';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  [key: string]: any;
}

interface AIQuestionPreviewProps {
  question: QuestionVariant;
  onAccept: (question: QuestionVariant) => void;
  onRegenerate: () => void;
  onClose: () => void;
  references?: string[];
}

export function AIQuestionPreview({ 
  question, 
  onAccept, 
  onRegenerate, 
  onClose,
  references = [
    'MDN Web Docs - JavaScript Reference',
    'React Documentation - Official Guides',
    'W3C Standards and Best Practices'
  ]
}: AIQuestionPreviewProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Lightbulb size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-[#111827]">AI Generated Question Preview</h2>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Review the generated question before adding it to your assessment
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
          <div className="space-y-6">
            {/* Question Header */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-[12px] font-medium">
                    AI Generated
                  </span>
                  {question.difficulty && (
                    <span className={`px-3 py-1 rounded-full text-[12px] font-medium ${
                      question.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                      question.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {question.difficulty}
                    </span>
                  )}
                  {question.tags?.map((tag: string) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-[#f3f4f6] text-[#6b7280] text-[12px]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Question Text */}
            <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-[12px]">
              <h3 className="font-['Arimo',sans-serif] text-[13px] text-purple-900 font-semibold mb-2">
                Question
              </h3>
              <p className="font-['Arimo',sans-serif] text-[15px] text-[#111827] leading-relaxed">
                {question.questionText}
              </p>
            </div>

            {/* Type-specific Preview */}
            {question.type === 'mcq' && question.options && (
              <div className="space-y-3">
                <h3 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">
                  Answer Options
                </h3>
                <div className="space-y-2">
                  {question.options.map((option: string, idx: number) => {
                    const isCorrect = question.multipleCorrect 
                      ? Array.isArray(question.correctAnswer) && question.correctAnswer.includes(idx)
                      : question.correctAnswer === idx;
                    
                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-[8px] border-2 transition-colors ${
                          isCorrect 
                            ? 'border-green-500 bg-green-50' 
                            : 'border-[#e5e7eb] bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`font-['Arimo',sans-serif] text-[14px] font-semibold ${
                            isCorrect ? 'text-green-700' : 'text-[#6b7280]'
                          }`}>
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span className={`font-['Arimo',sans-serif] text-[14px] flex-1 ${
                            isCorrect ? 'text-green-900 font-medium' : 'text-[#374151]'
                          }`}>
                            {option}
                          </span>
                          {isCorrect && (
                            <Check size={16} className="text-green-600 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {question.explanation && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-[8px]">
                    <h4 className="font-['Arimo',sans-serif] text-[13px] text-blue-900 font-semibold mb-2">
                      Explanation
                    </h4>
                    <p className="font-['Arimo',sans-serif] text-[13px] text-blue-800">
                      {question.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            {question.type === 'essay' && (
              <div className="space-y-4">
                {question.maxWords && (
                  <div className="flex items-center gap-2 text-[13px] text-[#6b7280]">
                    <span className="font-semibold">Max Words:</span>
                    <span>{question.maxWords}</span>
                  </div>
                )}
                {question.rubric && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-[8px]">
                    <h4 className="font-['Arimo',sans-serif] text-[13px] text-amber-900 font-semibold mb-2">
                      Grading Rubric
                    </h4>
                    <p className="font-['Arimo',sans-serif] text-[13px] text-amber-800">
                      {question.rubric}
                    </p>
                  </div>
                )}
                {question.expectedKeywords && question.expectedKeywords.length > 0 && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-[8px]">
                    <h4 className="font-['Arimo',sans-serif] text-[13px] text-indigo-900 font-semibold mb-2">
                      Expected Keywords
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {question.expectedKeywords.map((keyword: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[12px]">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {question.type === 'code' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-[13px] text-[#6b7280]">
                  {question.language && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Language:</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-[12px] font-mono">
                        {question.language}
                      </span>
                    </div>
                  )}
                  {question.timeLimit && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Time:</span>
                      <span>{question.timeLimit}s</span>
                    </div>
                  )}
                  {question.memoryLimit && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Memory:</span>
                      <span>{question.memoryLimit}MB</span>
                    </div>
                  )}
                </div>

                {question.codeTemplate && (
                  <div>
                    <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold mb-2">
                      Code Template
                    </h4>
                    <pre className="p-4 bg-gray-900 text-gray-100 rounded-[8px] overflow-x-auto text-[13px] font-mono">
                      {question.codeTemplate}
                    </pre>
                  </div>
                )}

                {question.testCases && question.testCases.length > 0 && (
                  <div>
                    <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold mb-2">
                      Test Cases ({question.testCases.length})
                    </h4>
                    <div className="space-y-2">
                      {question.testCases.map((tc: any, idx: number) => (
                        <div key={tc.id} className="p-3 bg-gray-50 border border-gray-200 rounded-[8px]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[12px] font-semibold text-gray-700">
                              Test Case {idx + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              {tc.isHidden && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] rounded-full">
                                  Hidden
                                </span>
                              )}
                              <span className="text-[11px] text-gray-600">
                                {tc.points} pts
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-[12px]">
                            <div>
                              <span className="text-gray-600">Input:</span>
                              <code className="block mt-1 px-2 py-1 bg-white rounded font-mono text-gray-800">
                                {tc.input}
                              </code>
                            </div>
                            <div>
                              <span className="text-gray-600">Expected:</span>
                              <code className="block mt-1 px-2 py-1 bg-white rounded font-mono text-gray-800">
                                {tc.expectedOutput}
                              </code>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* References Section */}
            <div className="pt-6 border-t border-[#e5e7eb]">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={16} className="text-[#6b7280]" />
                <h3 className="font-['Arimo',sans-serif] text-[13px] text-[#374151] font-semibold">
                  References & Sources
                </h3>
              </div>
              <div className="space-y-2">
                {references.map((ref, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-3 bg-gray-50 rounded-[8px] hover:bg-gray-100 transition-colors">
                    <LinkIcon size={14} className="text-[#6b7280] flex-shrink-0 mt-0.5" />
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                      {ref}
                    </span>
                  </div>
                ))}
              </div>
              <p className="font-['Arimo',sans-serif] text-[11px] text-[#9ca3af] mt-3">
                This question was generated using AI based on industry-standard references and best practices.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={onRegenerate}
              className="rounded-[8px]"
            >
              <RefreshCw size={16} className="mr-2" />
              Regenerate
            </Button>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="rounded-[8px]"
              >
                Cancel
              </Button>
              <Button
                onClick={() => onAccept(question)}
                className="rounded-[8px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                <Check size={16} className="mr-2" />
                Accept & Add to Assessment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
