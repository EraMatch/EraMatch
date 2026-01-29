import { useState } from 'react';
import { X, Wand2, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { AIQuestionPreview } from './AIQuestionPreview';

interface QuestionVariant {
  id: string;
  questionText: string;
  type: 'mcq' | 'essay' | 'code';
  [key: string]: any;
}

interface AIGeneratorModalProps {
  questionType: 'mcq' | 'essay' | 'code';
  onGenerate: (question: QuestionVariant) => void;
  onClose: () => void;
}

export function AIGeneratorModal({ questionType, onGenerate, onClose }: AIGeneratorModalProps) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestion, setGeneratedQuestion] = useState<QuestionVariant | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const generateQuestion = async () => {
    if (!topic.trim()) {
      alert('Please enter a topic');
      return;
    }

    setIsGenerating(true);
    
    // Simulate AI generation
    setTimeout(() => {
      let question: QuestionVariant;

      if (questionType === 'mcq') {
        question = {
          id: `ai-mcq-${Date.now()}`,
          type: 'mcq',
          questionText: `${topic}: Which of the following best describes ${topic.toLowerCase()}?`,
          options: [
            `A key concept in ${topic}`,
            `An alternative approach to ${topic}`,
            `A common misconception about ${topic}`,
            `A deprecated method in ${topic}`
          ],
          correctAnswer: 0,
          difficulty,
          explanation: `This question tests understanding of core concepts in ${topic}. The correct answer highlights the fundamental principles that define ${topic}.`,
          tags: [topic, 'AI-Generated']
        };
      } else if (questionType === 'essay') {
        question = {
          id: `ai-essay-${Date.now()}`,
          type: 'essay',
          questionText: `Discuss the key principles of ${topic} and provide examples of how they apply in real-world scenarios.`,
          maxWords: 400,
          rubric: `Answer should demonstrate understanding of ${topic}, provide relevant examples, and show critical thinking. Look for: clear explanation of concepts, practical examples, and analytical depth.`,
          expectedKeywords: [topic, 'principles', 'examples', 'application', 'best practices'],
          difficulty,
          tags: [topic, 'AI-Generated']
        };
      } else { // code
        question = {
          id: `ai-code-${Date.now()}`,
          type: 'code',
          questionText: `Implement a solution for ${topic}. ${context || 'Your solution should be efficient and well-documented.'}`,
          language: 'JavaScript',
          codeTemplate: `function solution(input) {\n  // Implement ${topic} here\n  // TODO: Add your implementation\n  return output;\n}`,
          testCases: [
            {
              id: 'tc1',
              input: 'input1',
              expectedOutput: 'output1',
              isHidden: false,
              points: 10
            },
            {
              id: 'tc2',
              input: 'input2',
              expectedOutput: 'output2',
              isHidden: true,
              points: 15
            },
            {
              id: 'tc3',
              input: 'edge_case',
              expectedOutput: 'edge_output',
              isHidden: true,
              points: 10
            }
          ],
          difficulty,
          timeLimit: 5,
          memoryLimit: 256,
          tags: [topic, 'AI-Generated']
        };
      }

      setIsGenerating(false);
      setGeneratedQuestion(question);
      setShowPreview(true);
    }, 1500);
  };

  const handleAcceptQuestion = (question: QuestionVariant) => {
    onGenerate(question);
    setShowPreview(false);
    setGeneratedQuestion(null);
  };

  const handleRegenerate = () => {
    setShowPreview(false);
    setGeneratedQuestion(null);
    generateQuestion();
  };

  const handleClosePreview = () => {
    setShowPreview(false);
  };

  if (showPreview && generatedQuestion) {
    return (
      <AIQuestionPreview
        question={generatedQuestion}
        onAccept={handleAcceptQuestion}
        onRegenerate={handleRegenerate}
        onClose={handleClosePreview}
        references={[
          `${topic} - Official Documentation`,
          'Industry Best Practices and Standards',
          'Academic Research and Technical Papers',
          'Community Guidelines and Recommendations'
        ]}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-2xl w-full">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Wand2 size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-[#111827]">AI Question Generator</h2>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Generate a {questionType === 'mcq' ? 'multiple choice' : questionType} question with AI
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
        <div className="p-8">
          <div className="space-y-6">
            {/* Topic */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Topic or Concept *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., React Hooks, Database Normalization, Binary Search..."
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Difficulty */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-3">
                Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['Easy', 'Medium', 'Hard'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setDifficulty(level)}
                    className={`h-[44px] rounded-[8px] border-2 transition-all font-['Arimo',sans-serif] text-[14px] ${
                      difficulty === level
                        ? level === 'Easy'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : level === 'Medium'
                          ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-purple-300'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Context */}
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Additional Context (Optional)
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Provide any specific requirements, focus areas, or constraints..."
                rows={3}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>

            {/* AI Info Box */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-[12px]">
              <div className="flex items-start gap-3">
                <Sparkles size={20} className="text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-['Arimo',sans-serif] text-[13px] text-purple-900 mb-1">
                    <strong>AI will generate:</strong>
                  </p>
                  <ul className="font-['Arimo',sans-serif] text-[13px] text-purple-800 list-disc list-inside space-y-1">
                    {questionType === 'mcq' && (
                      <>
                        <li>A relevant multiple-choice question</li>
                        <li>4 plausible options with marked correct answer</li>
                        <li>An explanation for the correct answer</li>
                        <li>References from trusted sources</li>
                      </>
                    )}
                    {questionType === 'essay' && (
                      <>
                        <li>A thought-provoking essay question</li>
                        <li>Grading rubric with key evaluation criteria</li>
                        <li>Expected keywords and concepts</li>
                        <li>References from academic sources</li>
                      </>
                    )}
                    {questionType === 'code' && (
                      <>
                        <li>A coding problem with clear requirements</li>
                        <li>Code template in your preferred language</li>
                        <li>Test cases for validation</li>
                        <li>References to relevant documentation</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="rounded-[8px]"
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={generateQuestion}
              className="rounded-[8px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
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
                  Generate Question
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
