import { useState } from 'react';
import { ChevronLeft, Clock, RotateCcw, FileText } from 'lucide-react';

interface AIInterviewSetupRecordedProps {
  groupName: string;
  onBack: () => void;
  onSetupQuestions?: () => void;
}

export function AIInterviewSetupRecorded({ groupName, onBack, onSetupQuestions }: AIInterviewSetupRecordedProps) {
  const [timePerQuestion, setTimePerQuestion] = useState(120);
  const [maxRetries, setMaxRetries] = useState(2);
  const [candidateInstructions, setCandidateInstructions] = useState(
    'Please answer each question thoughtfully. You will have 2 minutes per question and can re-record your answer up to 2 times if needed.'
  );

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[900px] mx-auto px-[48px] py-[24px]">
        {/* Breadcrumb */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back to {groupName}</span>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[#111827] mb-2">AI Interview Setup – Recorded</h1>
          <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">
            Configure asynchronous AI interview settings for this group
          </p>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Time per Question */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <div className="flex items-start gap-3 mb-4">
              <Clock size={20} className="text-[#6366f1] mt-1" />
              <div className="flex-1">
                <h3 className="text-[#111827] mb-1">Time per Question</h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  How long should candidates have to answer each question?
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={30}
                max={300}
                step={30}
                value={timePerQuestion}
                onChange={(e) => setTimePerQuestion(parseInt(e.target.value))}
                className="flex-1"
              />
              <div className="flex items-center gap-2 min-w-[120px]">
                <input
                  type="number"
                  value={timePerQuestion}
                  onChange={(e) => setTimePerQuestion(parseInt(e.target.value) || 30)}
                  min={30}
                  max={300}
                  step={30}
                  className="w-[80px] px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] text-center focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">sec</span>
              </div>
            </div>
            <div className="mt-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
              = {Math.floor(timePerQuestion / 60)} minute{Math.floor(timePerQuestion / 60) !== 1 ? 's' : ''} {timePerQuestion % 60 > 0 ? `${timePerQuestion % 60} seconds` : ''}
            </div>
          </div>

          {/* Max Retries */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <div className="flex items-start gap-3 mb-4">
              <RotateCcw size={20} className="text-[#8b5cf6] mt-1" />
              <div className="flex-1">
                <h3 className="text-[#111827] mb-1">Maximum Retries</h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  How many times can candidates re-record their answer?
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {[0, 1, 2, 3, 5].map(value => (
                <button
                  key={value}
                  onClick={() => setMaxRetries(value)}
                  className={`flex-1 h-[48px] rounded-[8px] border-2 font-['Arimo',sans-serif] text-[14px] transition-all ${
                    maxRetries === value
                      ? 'border-[#8b5cf6] bg-[#f3e8ff] text-[#8b5cf6]'
                      : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
                  }`}
                >
                  {value === 0 ? 'None' : value}
                </button>
              ))}
            </div>
            <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mt-3">
              Recommended: 2 retries for most interviews
            </p>
          </div>

          {/* Candidate Instructions */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <div className="flex items-start gap-3 mb-4">
              <FileText size={20} className="text-[#10b981] mt-1" />
              <div className="flex-1">
                <h3 className="text-[#111827] mb-1">Candidate Instructions</h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  Customize the instructions candidates will see before starting
                </p>
              </div>
            </div>
            <textarea
              value={candidateInstructions}
              onChange={(e) => setCandidateInstructions(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              placeholder="Enter instructions for candidates..."
            />
            <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mt-2">
              These instructions will be displayed to candidates before they begin the interview
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6">
            <button
              onClick={onBack}
              className="h-[48px] px-[24px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSetupQuestions}
              className="flex-1 h-[48px] rounded-[8px] border border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#faf5ff] font-['Arimo',sans-serif] text-[14px] transition-colors"
            >
              Setup Interview Questions
            </button>
            <button
              onClick={() => {
                // Handle assign recorded interview
                console.log('Assign Recorded Interview', { 
                  timePerQuestion, 
                  maxRetries, 
                  candidateInstructions
                });
                onBack();
              }}
              className="flex-1 h-[48px] rounded-[8px] bg-[#8b5cf6] hover:bg-[#7c3aed] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              Assign Recorded Interview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
