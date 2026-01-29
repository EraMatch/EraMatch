import { useState } from 'react';
import { Sparkles, X, Check, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

interface TextRefinerProps {
  originalText: string;
  onApply: (refinedText: string) => void;
  onClose: () => void;
  context?: string; // e.g., "question", "option", "explanation"
}

export function TextRefiner({ originalText, onApply, onClose, context = "text" }: TextRefinerProps) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinedText, setRefinedText] = useState('');
  const [showResult, setShowResult] = useState(false);

  const handleRefine = async () => {
    setIsRefining(true);
    
    // Simulate AI refinement
    setTimeout(() => {
      // Mock AI refinement - in real implementation, this would call an AI API
      let refined = originalText;
      
      // Simulate improvements
      if (context === 'question') {
        refined = originalText
          .replace(/\?$/, '') // Remove trailing question mark
          .trim();
        refined = refined + '?'; // Add clean question mark
        
        // Add clarity if the question is too short
        if (refined.length < 30) {
          refined = `Which of the following statements about ${refined.toLowerCase().replace('?', '')} is most accurate?`;
        }
      } else if (context === 'option') {
        // Capitalize first letter, remove trailing punctuation for options
        refined = originalText.trim();
        refined = refined.charAt(0).toUpperCase() + refined.slice(1);
        refined = refined.replace(/[.,!?;:]$/, '');
      } else if (context === 'explanation') {
        // Improve explanation text
        refined = originalText.trim();
        if (!refined.endsWith('.')) {
          refined += '.';
        }
        if (refined.length < 50) {
          refined = `This is correct because ${refined.toLowerCase()}`;
        }
      } else {
        // General refinement
        refined = originalText.trim();
        refined = refined.charAt(0).toUpperCase() + refined.slice(1);
        if (!refined.match(/[.!?]$/)) {
          refined += '.';
        }
      }
      
      setRefinedText(refined);
      setShowResult(true);
      setIsRefining(false);
    }, 1200);
  };

  const handleRegenerate = () => {
    setShowResult(false);
    handleRefine();
  };

  if (!showResult && !isRefining) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
        <div className="bg-white rounded-[16px] shadow-2xl max-w-2xl w-full">
          {/* Header */}
          <div className="px-8 py-6 border-b border-[#e5e7eb]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-[#111827]">Refine Text with AI</h2>
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                    Improve clarity, grammar, and professionalism
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
            <div className="space-y-4">
              <div>
                <label className="block font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-2">
                  Original Text
                </label>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-[8px]">
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                    {originalText}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-[12px]">
                <div className="flex items-start gap-3">
                  <Sparkles size={18} className="text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-['Arimo',sans-serif] text-[13px] text-purple-900 mb-2">
                      <strong>AI will improve:</strong>
                    </p>
                    <ul className="font-['Arimo',sans-serif] text-[12px] text-purple-800 list-disc list-inside space-y-1">
                      <li>Grammar and punctuation</li>
                      <li>Clarity and conciseness</li>
                      <li>Professional tone</li>
                      <li>Technical accuracy</li>
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
              >
                Cancel
              </Button>
              <Button
                onClick={handleRefine}
                className="rounded-[8px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                <Sparkles size={16} className="mr-2" />
                Refine Text
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isRefining) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
        <div className="bg-white rounded-[16px] shadow-2xl max-w-2xl w-full p-12">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4">
              <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
            <h3 className="text-[#111827] mb-2">Refining your text...</h3>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              AI is improving clarity, grammar, and professionalism
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-3xl w-full">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-[#111827]">Refined Text Preview</h2>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Review the AI-refined version
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
            {/* Before */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  Original
                </label>
                <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-[10px] rounded-full">
                  Before
                </span>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-[8px]">
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  {originalText}
                </p>
              </div>
            </div>

            {/* After */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] font-semibold">
                  Refined Version
                </label>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full flex items-center gap-1">
                  <Sparkles size={10} />
                  AI Enhanced
                </span>
              </div>
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-[8px]">
                <p className="font-['Arimo',sans-serif] text-[15px] text-[#111827] leading-relaxed">
                  {refinedText}
                </p>
              </div>
            </div>

            {/* Improvements Highlight */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-[8px]">
              <p className="font-['Arimo',sans-serif] text-[12px] text-blue-900 mb-2">
                <strong>Improvements made:</strong>
              </p>
              <ul className="font-['Arimo',sans-serif] text-[12px] text-blue-800 list-disc list-inside space-y-1">
                <li>Enhanced clarity and readability</li>
                <li>Corrected grammar and punctuation</li>
                <li>Professional tone applied</li>
                <li>Optimized wording for {context}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleRegenerate}
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
                Keep Original
              </Button>
              <Button
                onClick={() => onApply(refinedText)}
                className="rounded-[8px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                <Check size={16} className="mr-2" />
                Apply Refined Text
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
