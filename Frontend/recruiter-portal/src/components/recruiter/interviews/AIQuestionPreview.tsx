import { useState } from 'react';
import { X, Check, RefreshCw, Lightbulb, Edit2, Save, ExternalLink } from 'lucide-react';
import { Button } from '../../ui/button';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code' | 'interview';
  [key: string]: any;
}

interface AIQuestionPreviewProps {
  question: QuestionVariant;
  onAccept: (question: QuestionVariant) => void;
  onRegenerate?: () => void;
  onClose: () => void;
  references?: string[];
  /** When true: shows "Approve & Back" instead of "Accept & Add", hides Regenerate */
  approveMode?: boolean;
}

export function AIQuestionPreview({
  question,
  onAccept,
  onRegenerate,
  onClose,
  approveMode = false,
}: AIQuestionPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [edited, setEdited] = useState<QuestionVariant>({ ...question });

  const set = (field: string, value: any) =>
    setEdited(prev => ({ ...prev, [field]: value }));

  const setOption = (idx: number, value: string) => {
    const opts = [...(edited.options || [])];
    opts[idx] = value;
    set('options', opts);
  };

  const setTestCase = (idx: number, field: string, value: string) => {
    const tcs = [...(edited.testCases || [])];
    tcs[idx] = { ...tcs[idx], [field]: value };
    set('testCases', tcs);
  };

  const handleAccept = () => onAccept(edited);

  const realRefs: Array<{ title: string; url: string }> =
    Array.isArray(question.references) ? question.references : [];

  const diffBadge = edited.difficulty || question.difficulty;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-7 py-5 border-b border-[#e5e7eb] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <Lightbulb size={17} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[#111827] text-[16px]">Preview Generated Question</h2>
                  {isEditing && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium">
                      Editing
                    </span>
                  )}
                </div>
                <p className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af] mt-0.5">
                  {isEditing
                    ? 'Make changes below, then approve.'
                    : approveMode
                    ? 'Review and approve to include in the batch.'
                    : 'Review before adding to the assessment.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIsEditing(!isEditing); if (isEditing) setEdited({ ...question }); }}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-[7px] border text-[12px] font-medium transition-colors ${
                  isEditing
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1] hover:text-[#6366f1]'
                }`}
              >
                {isEditing ? <><X size={13} /> Discard edits</> : <><Edit2 size={13} /> Edit</>}
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
              >
                <X size={18} className="text-[#6b7280]" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-7">
          <div className="space-y-5">

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-[#ede9fe] text-[#6366f1] text-[11px] font-medium">AI Generated</span>
              {diffBadge && (
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                  diffBadge === 'Easy' ? 'bg-green-100 text-green-700' :
                  diffBadge === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {diffBadge}
                </span>
              )}
              {(edited.topics || edited.tags || []).slice(0, 4).map((t: string) => (
                <span key={t} className="px-2.5 py-1 rounded-full bg-[#f3f4f6] text-[#6b7280] text-[11px]">{t}</span>
              ))}
            </div>

            {/* Question Text */}
            <div className={`p-5 rounded-[12px] border ${isEditing ? 'border-[#6366f1]/40 bg-[#fafafa]' : 'bg-gradient-to-r from-[#f5f3ff] to-[#fdf2f8] border-[#ede9fe]'}`}>
              <label className="block font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold mb-2 uppercase tracking-wide">
                Problem Statement
              </label>
              {isEditing ? (
                <textarea
                  value={edited.questionText}
                  onChange={e => set('questionText', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] text-[#111827] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
                />
              ) : (
                <p className="font-['Arimo',sans-serif] text-[15px] text-[#111827] leading-relaxed whitespace-pre-wrap">
                  {edited.questionText}
                </p>
              )}
            </div>

            {/* ── MCQ ── */}
            {edited.type === 'mcq' && edited.options && (
              <div className="space-y-3">
                <h3 className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide">Answer Options</h3>
                <div className="space-y-2">
                  {edited.options.map((option: string, idx: number) => {
                    const isCorrect = edited.multipleCorrect
                      ? Array.isArray(edited.correctAnswer) && edited.correctAnswer.includes(idx)
                      : edited.correctAnswer === idx;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-3 p-3 rounded-[8px] border-2 transition-colors ${
                          isCorrect ? 'border-green-400 bg-green-50' : 'border-[#e5e7eb] bg-white'
                        }`}
                      >
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => set('correctAnswer', idx)}
                              className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isCorrect ? 'border-green-500 bg-green-500' : 'border-[#d1d5db]'}`}
                            />
                            <input
                              value={option}
                              onChange={e => setOption(idx, e.target.value)}
                              className="flex-1 px-2 py-1 rounded border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
                            />
                          </>
                        ) : (
                          <>
                            <span className={`font-semibold text-[14px] w-5 flex-shrink-0 ${isCorrect ? 'text-green-700' : 'text-[#9ca3af]'}`}>
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            <span className={`flex-1 font-['Arimo',sans-serif] text-[14px] ${isCorrect ? 'text-green-900 font-medium' : 'text-[#374151]'}`}>
                              {option}
                            </span>
                            {isCorrect && <Check size={14} className="text-green-600 flex-shrink-0" />}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {(edited.explanation || isEditing) && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-[8px]">
                    <h4 className="font-['Arimo',sans-serif] text-[12px] text-blue-700 font-semibold uppercase tracking-wide mb-2">Explanation</h4>
                    {isEditing ? (
                      <textarea
                        value={edited.explanation || ''}
                        onChange={e => set('explanation', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded border border-blue-200 font-['Arimo',sans-serif] text-[13px] text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none bg-white"
                      />
                    ) : (
                      <p className="font-['Arimo',sans-serif] text-[13px] text-blue-800">{edited.explanation}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Essay ── */}
            {edited.type === 'essay' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide">Max Words</span>
                  {isEditing ? (
                    <input
                      type="number"
                      value={edited.maxWords || 500}
                      onChange={e => set('maxWords', parseInt(e.target.value) || 500)}
                      className="w-24 h-8 px-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
                    />
                  ) : (
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151] font-medium">{edited.maxWords}</span>
                  )}
                </div>

                {(edited.rubric || isEditing) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-[8px]">
                    <h4 className="font-['Arimo',sans-serif] text-[12px] text-amber-700 font-semibold uppercase tracking-wide mb-2">Grading Rubric</h4>
                    {isEditing ? (
                      <textarea
                        value={edited.rubric || ''}
                        onChange={e => set('rubric', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded border border-amber-200 font-['Arimo',sans-serif] text-[13px] text-amber-800 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none bg-white"
                      />
                    ) : (
                      <p className="font-['Arimo',sans-serif] text-[13px] text-amber-800 whitespace-pre-wrap">{edited.rubric}</p>
                    )}
                  </div>
                )}

                {edited.expectedKeywords && edited.expectedKeywords.length > 0 && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-[8px]">
                    <h4 className="font-['Arimo',sans-serif] text-[12px] text-indigo-700 font-semibold uppercase tracking-wide mb-2">Expected Keywords</h4>
                    <div className="flex flex-wrap gap-2">
                      {edited.expectedKeywords.map((kw: string, i: number) => (
                        <span key={i} className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[12px]">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}

                {edited.rubricYesNoChecks && edited.rubricYesNoChecks.length > 0 && (
                  <div className="p-4 bg-[#f9fafb] border border-[#e5e7eb] rounded-[8px]">
                    <h4 className="font-['Arimo',sans-serif] text-[12px] text-[#374151] font-semibold uppercase tracking-wide mb-2">
                      Rubric Checks ({edited.rubricYesNoChecks.length})
                    </h4>
                    <div className="space-y-1">
                      {edited.rubricYesNoChecks.slice(0, 10).map((check: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-[12px] text-[#6b7280] py-0.5">
                          <span>{idx + 1}. {check.check}</span>
                          <span className="font-mono text-[11px]">{Number(check.weight || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Code ── */}
            {edited.type === 'code' && (
              <div className="space-y-4">
                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#6b7280]">
                  {edited.language && (
                    <span className="px-2 py-1 bg-gray-100 rounded font-mono text-[12px]">{edited.language}</span>
                  )}
                  {edited.functionName && (
                    <span className="font-mono bg-gray-900 text-emerald-400 px-3 py-1 rounded-[6px] text-[13px]">{edited.functionName}()</span>
                  )}
                  {edited.timeLimit && <span>{edited.timeLimit}s limit</span>}
                </div>

                {/* Starter code */}
                {(edited.starterCode || edited.codeTemplate) && (
                  <div>
                    <h4 className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide mb-2">Starter Code</h4>
                    {isEditing ? (
                      <textarea
                        value={edited.starterCode || edited.codeTemplate || ''}
                        onChange={e => set('starterCode', e.target.value)}
                        rows={6}
                        className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-mono text-[13px] text-gray-100 bg-gray-900 focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
                      />
                    ) : (
                      <pre className="p-4 bg-gray-900 text-gray-100 rounded-[8px] overflow-x-auto text-[13px] font-mono">
                        {edited.starterCode || edited.codeTemplate}
                      </pre>
                    )}
                  </div>
                )}

                {/* I/O format */}
                {(edited.inputFormat || edited.outputFormat) && (
                  <div className="grid grid-cols-2 gap-4">
                    {edited.inputFormat && (
                      <div>
                        <h4 className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide mb-1">Input Format</h4>
                        {isEditing ? (
                          <textarea value={edited.inputFormat} onChange={e => set('inputFormat', e.target.value)} rows={2}
                            className="w-full px-3 py-2 rounded border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-1 focus:ring-[#6366f1] resize-none"
                          />
                        ) : (
                          <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">{edited.inputFormat}</p>
                        )}
                      </div>
                    )}
                    {edited.outputFormat && (
                      <div>
                        <h4 className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide mb-1">Output Format</h4>
                        {isEditing ? (
                          <textarea value={edited.outputFormat} onChange={e => set('outputFormat', e.target.value)} rows={2}
                            className="w-full px-3 py-2 rounded border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-1 focus:ring-[#6366f1] resize-none"
                          />
                        ) : (
                          <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">{edited.outputFormat}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Constraints */}
                {edited.questionConstraints && edited.questionConstraints.length > 0 && (
                  <div>
                    <h4 className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide mb-2">Constraints</h4>
                    <ul className="space-y-1">
                      {edited.questionConstraints.map((c: string, i: number) => (
                        <li key={i} className="font-mono text-[12px] text-[#374151] bg-[#f9fafb] px-3 py-1.5 rounded-[4px] border border-[#e5e7eb]">{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Test cases */}
                {edited.testCases && edited.testCases.length > 0 && (
                  <div>
                    <h4 className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide mb-2">
                      Test Cases ({edited.testCases.length}) — {edited.testCases.filter((tc: any) => tc.isHidden || tc.is_hidden).length} hidden
                    </h4>
                    <div className="space-y-2">
                      {edited.testCases.map((tc: any, idx: number) => {
                        const hidden = tc.isHidden || tc.is_hidden;
                        return (
                          <div key={tc.id || idx} className={`p-3 rounded-[8px] border ${hidden ? 'border-amber-200 bg-amber-50/50' : 'border-[#e5e7eb] bg-[#f9fafb]'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[12px] font-semibold text-[#374151]">Case {idx + 1}</span>
                              <div className="flex items-center gap-2">
                                {hidden && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full">Hidden</span>}
                                {tc.points != null && <span className="text-[11px] text-[#6b7280]">{tc.points} pts</span>}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[12px]">
                              <div>
                                <span className="text-[#6b7280] block mb-1">Input</span>
                                {isEditing ? (
                                  <textarea value={tc.input} onChange={e => setTestCase(idx, 'input', e.target.value)} rows={2}
                                    className="w-full px-2 py-1 rounded border border-[#e5e7eb] font-mono text-[12px] focus:outline-none focus:ring-1 focus:ring-[#6366f1] resize-none bg-white"
                                  />
                                ) : (
                                  <code className="block px-2 py-1 bg-white rounded font-mono text-[11px] text-[#374151] border border-[#e5e7eb]">{tc.input}</code>
                                )}
                              </div>
                              <div>
                                <span className="text-[#6b7280] block mb-1">Expected</span>
                                {isEditing ? (
                                  <textarea
                                    value={tc.expectedOutput ?? tc.expected ?? ''}
                                    onChange={e => setTestCase(idx, 'expectedOutput', e.target.value)}
                                    rows={2}
                                    className="w-full px-2 py-1 rounded border border-[#e5e7eb] font-mono text-[12px] focus:outline-none focus:ring-1 focus:ring-[#6366f1] resize-none bg-white"
                                  />
                                ) : (
                                  <code className="block px-2 py-1 bg-white rounded font-mono text-[11px] text-[#374151] border border-[#e5e7eb]">
                                    {tc.expectedOutput ?? tc.expected ?? ''}
                                  </code>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* References — only shown when the backend returned real ones */}
            {realRefs.length > 0 && (
              <div className="pt-4 border-t border-[#e5e7eb]">
                <h3 className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] font-semibold uppercase tracking-wide mb-3">
                  Sources searched by AI
                </h3>
                <div className="space-y-1.5">
                  {realRefs.map((ref, idx) => (
                    <a
                      key={idx}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#f9fafb] hover:bg-[#ede9fe]/50 border border-[#e5e7eb] hover:border-[#6366f1]/30 transition-colors group"
                    >
                      <ExternalLink size={13} className="text-[#6366f1] flex-shrink-0" />
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151] group-hover:text-[#6366f1] transition-colors truncate">
                        {ref.title}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-[#e5e7eb] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              {!approveMode && onRegenerate && (
                <Button variant="outline" onClick={onRegenerate} className="rounded-[8px] h-[38px] text-[13px]">
                  <RefreshCw size={14} className="mr-2" />
                  Regenerate
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} className="rounded-[8px] h-[38px] text-[13px]">
                {approveMode ? '← Back to list' : 'Cancel'}
              </Button>
              {isEditing && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="rounded-[8px] h-[38px] text-[13px] border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <Save size={14} className="mr-2" />
                  Save edits
                </Button>
              )}
              <Button
                onClick={handleAccept}
                className={`rounded-[8px] h-[38px] px-5 text-white text-[13px] ${
                  approveMode
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-[#6366f1] hover:bg-[#4f46e5]'
                }`}
              >
                <Check size={14} className="mr-2" />
                {approveMode ? 'Approve & Back' : 'Accept & Add'}
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
