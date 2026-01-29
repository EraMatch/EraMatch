import { useState } from 'react';
import { ChevronLeft, Plus, Trash2, Play, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  points: number;
}

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  codeTemplate?: string;
  testCases?: TestCase[];
  language?: string;
  timeLimit?: number;
  memoryLimit?: number;
  explanation?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

interface CodeEditorProps {
  variant: QuestionVariant;
  onSave: (variant: QuestionVariant) => void;
  onCancel: () => void;
}

const LANGUAGES = [
  'JavaScript',
  'Python',
  'Java',
  'C++',
  'C#',
  'Go',
  'Ruby',
  'TypeScript',
  'Rust',
  'Swift'
];

export function CodeEditor({ variant, onSave, onCancel }: CodeEditorProps) {
  const [questionData, setQuestionData] = useState<QuestionVariant>({
    ...variant,
    testCases: variant.testCases || [],
    language: variant.language || 'JavaScript',
    timeLimit: variant.timeLimit || 5,
    memoryLimit: variant.memoryLimit || 256,
    difficulty: variant.difficulty || 'Medium',
    tags: variant.tags || []
  });

  const [newTag, setNewTag] = useState('');

  const handleAddTestCase = () => {
    const newTestCase: TestCase = {
      id: `testcase-${Date.now()}`,
      input: '',
      expectedOutput: '',
      isHidden: false,
      points: 10
    };
    setQuestionData({
      ...questionData,
      testCases: [...(questionData.testCases || []), newTestCase]
    });
  };

  const handleUpdateTestCase = (index: number, field: keyof TestCase, value: any) => {
    const newTestCases = [...(questionData.testCases || [])];
    newTestCases[index] = { ...newTestCases[index], [field]: value };
    setQuestionData({ ...questionData, testCases: newTestCases });
  };

  const handleRemoveTestCase = (index: number) => {
    setQuestionData({
      ...questionData,
      testCases: questionData.testCases?.filter((_, i) => i !== index) || []
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !questionData.tags?.includes(newTag.trim())) {
      setQuestionData({
        ...questionData,
        tags: [...(questionData.tags || []), newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setQuestionData({
      ...questionData,
      tags: questionData.tags?.filter(t => t !== tag) || []
    });
  };

  const handleSave = () => {
    if (!questionData.questionText.trim()) {
      alert('Please enter a question');
      return;
    }
    
    if (!questionData.testCases || questionData.testCases.length === 0) {
      alert('Please add at least one test case');
      return;
    }
    
    if (questionData.testCases.some(tc => !tc.input.trim() || !tc.expectedOutput.trim())) {
      alert('All test cases must have input and expected output');
      return;
    }
    
    onSave(questionData);
  };

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[1200px] mx-auto px-[48px] py-[24px]">
        {/* Header */}
        <button
          onClick={onCancel}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back to Section</span>
        </button>

        <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8">
          <h2 className="text-[#111827] mb-2">Coding Question</h2>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
            Create a coding question with test cases for automated evaluation
          </p>

          <div className="space-y-6">
            {/* Question Text */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Problem Statement *
              </label>
              <textarea
                value={questionData.questionText}
                onChange={(e) => setQuestionData({ ...questionData, questionText: e.target.value })}
                placeholder="Describe the coding problem here. Include requirements, constraints, and examples..."
                rows={6}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none font-mono"
              />
            </div>

            {/* Language & Limits */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Language *
                </label>
                <select
                  value={questionData.language}
                  onChange={(e) => setQuestionData({ ...questionData, language: e.target.value })}
                  className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Time Limit (seconds)
                </label>
                <input
                  type="number"
                  value={questionData.timeLimit}
                  onChange={(e) => setQuestionData({ ...questionData, timeLimit: parseInt(e.target.value) || 0 })}
                  min="1"
                  max="60"
                  className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Memory Limit (MB)
                </label>
                <input
                  type="number"
                  value={questionData.memoryLimit}
                  onChange={(e) => setQuestionData({ ...questionData, memoryLimit: parseInt(e.target.value) || 0 })}
                  min="64"
                  max="1024"
                  className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>
            </div>

            {/* Code Template */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Code Template (Optional)
              </label>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-2">
                Provide a starting template for candidates
              </p>
              <textarea
                value={questionData.codeTemplate || ''}
                onChange={(e) => setQuestionData({ ...questionData, codeTemplate: e.target.value })}
                placeholder={`// Example for ${questionData.language}:\nfunction solution(input) {\n  // Your code here\n  return output;\n}`}
                rows={8}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none font-mono bg-[#1e1e1e] text-[#d4d4d4]"
              />
            </div>

            {/* Test Cases */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                    Test Cases * (Ground Truth)
                  </label>
                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mt-1">
                    Add test cases to validate the solution
                  </p>
                </div>
                <button
                  onClick={handleAddTestCase}
                  className="flex items-center gap-2 h-[36px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] transition-colors"
                >
                  <Plus size={14} className="text-white" />
                  <span className="font-['Arimo',sans-serif] text-[13px] text-white">
                    Add Test Case
                  </span>
                </button>
              </div>

              <div className="space-y-4">
                {questionData.testCases?.map((testCase, index) => (
                  <div
                    key={testCase.id}
                    className="border border-[#e5e7eb] rounded-[12px] p-4 bg-[#f9fafb]"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-medium">
                          Test Case {index + 1}
                        </span>
                        <button
                          onClick={() => handleUpdateTestCase(index, 'isHidden', !testCase.isHidden)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${
                            testCase.isHidden
                              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          }`}
                        >
                          {testCase.isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                          {testCase.isHidden ? 'Hidden' : 'Visible'}
                        </button>
                      </div>
                      <button
                        onClick={() => handleRemoveTestCase(index)}
                        className="w-8 h-8 rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center"
                      >
                        <Trash2 size={14} className="text-red-600" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-1">
                          Input
                        </label>
                        <textarea
                          value={testCase.input}
                          onChange={(e) => handleUpdateTestCase(index, 'input', e.target.value)}
                          placeholder="Input data..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none font-mono bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-1">
                          Expected Output
                        </label>
                        <textarea
                          value={testCase.expectedOutput}
                          onChange={(e) => handleUpdateTestCase(index, 'expectedOutput', e.target.value)}
                          placeholder="Expected output..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none font-mono bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-1">
                        Points
                      </label>
                      <input
                        type="number"
                        value={testCase.points}
                        onChange={(e) => handleUpdateTestCase(index, 'points', parseInt(e.target.value) || 0)}
                        min="1"
                        max="100"
                        className="w-32 h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      />
                    </div>
                  </div>
                ))}

                {(!questionData.testCases || questionData.testCases.length === 0) && (
                  <div className="text-center py-8 border-2 border-dashed border-[#e5e7eb] rounded-[12px]">
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                      No test cases added yet. Click "Add Test Case" to get started.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-3">
                Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['Easy', 'Medium', 'Hard'] as const).map((difficulty) => (
                  <button
                    key={difficulty}
                    onClick={() => setQuestionData({ ...questionData, difficulty })}
                    className={`h-[44px] rounded-[8px] border-2 transition-all font-['Arimo',sans-serif] text-[14px] ${
                      questionData.difficulty === difficulty
                        ? difficulty === 'Easy'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : difficulty === 'Medium'
                          ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1]'
                    }`}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Tags (Optional)
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add a tag..."
                  className="flex-1 h-[40px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <Button
                  onClick={handleAddTag}
                  variant="outline"
                  className="h-[40px] px-4"
                >
                  Add
                </Button>
              </div>
              {questionData.tags && questionData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {questionData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ede9fe] text-[#6366f1] font-['Arimo',sans-serif] text-[13px]"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-[#e5e7eb]">
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
            >
              Save Question
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
