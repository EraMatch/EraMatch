import { useState, useEffect } from 'react';
import { ChevronLeft, GripVertical, Plus, Trash2, Calendar, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface AIInterviewSetupLiveProps {
  groupName: string;
  onBack: () => void;
}

interface InterviewSection {
  id: string;
  title: string;
  duration: number;
}

export function AIInterviewSetupLive({ groupName, onBack }: AIInterviewSetupLiveProps) {
  const [tone, setTone] = useState('friendly');
  const [systemPrompt, setSystemPrompt] = useState('You are a professional AI interviewer conducting a technical interview. Be thorough, encouraging, and professional.');
  const [duration, setDuration] = useState(30);
  const [includeCandidateHistory, setIncludeCandidateHistory] = useState(false);
  const [sections, setSections] = useState<InterviewSection[]>([]);
  const [toneOptions, setToneOptions] = useState<Array<{ value: string; label: string; description: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch AI interview configuration from API
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setIsLoading(true);
        const config = await api.recruiter.getAIInterviewConfig();
        // Map API data to component format
        if (config && typeof config === 'object') {
          const apiConfig = config as any;
          setSections(apiConfig.defaultSections || apiConfig.sections || []);
          setToneOptions(apiConfig.toneOptions || []);
          if (apiConfig.defaultSystemPrompt || apiConfig.systemPrompt) {
            setSystemPrompt(apiConfig.defaultSystemPrompt || apiConfig.systemPrompt);
          }
        }
      } catch (error) {
        console.error('Failed to fetch AI interview config:', error);
        // Fallback to defaults
        setSections([
          { id: '1', title: 'Introduction & Background', duration: 5 },
          { id: '2', title: 'Technical Skills Assessment', duration: 10 },
          { id: '3', title: 'Problem Solving', duration: 10 },
          { id: '4', title: 'Closing Questions', duration: 5 }
        ]);
        setToneOptions([
          { value: 'friendly', label: 'Friendly', description: 'Warm and conversational' },
          { value: 'neutral', label: 'Neutral', description: 'Professional and balanced' },
          { value: 'formal', label: 'Formal', description: 'Structured and business-like' }
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleAddSection = () => {
    const newSection: InterviewSection = {
      id: Date.now().toString(),
      title: 'New Section',
      duration: 5
    };
    setSections([...sections, newSection]);
  };

  const handleRemoveSection = (id: string) => {
    setSections(sections.filter(s => s.id !== id));
  };

  const handleSectionChange = (id: string, field: 'title' | 'duration', value: string | number) => {
    setSections(sections.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const totalDuration = sections.reduce((sum, s) => sum + s.duration, 0);

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
          <h1 className="text-[#111827] mb-2">AI Interview Setup – Live</h1>
          <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">
            Configure real-time AI interview settings for this group
          </p>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Tone Selection */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <h3 className="text-[#111827] mb-4">Tone</h3>
            <div className="grid grid-cols-3 gap-3">
              {toneOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setTone(option.value)}
                  className={`p-4 rounded-[8px] border-2 transition-all text-left ${tone === option.value
                    ? 'border-[#6366f1] bg-[#ede9fe]'
                    : 'border-[#e5e7eb] hover:border-[#d1d5db]'
                    }`}
                >
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-1">
                    {option.label}
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* System Prompt */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <h3 className="text-[#111827] mb-4">System Prompt</h3>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-3">
              Define the AI interviewer's behavior and instructions
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              placeholder="Enter system prompt..."
            />
          </div>

          {/* Include Candidate History Data */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCandidateHistory}
                onChange={(e) => setIncludeCandidateHistory(e.target.checked)}
                className="w-[20px] h-[20px] rounded border-[#d1d5db] text-[#6366f1] focus:ring-2 focus:ring-[#6366f1] mt-0.5"
              />
              <div className="flex-1">
                <h3 className="text-[#111827] mb-1">Include from Candidate History Data</h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  Allow the AI to reference candidate's CV, previous assessments, and application data during the interview for more contextual questions
                </p>
              </div>
            </label>
          </div>

          {/* Interview Sections */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[#111827] mb-1">Interview Sections</h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  Total Duration: {totalDuration} minutes
                </p>
              </div>
              <button
                onClick={handleAddSection}
                className="flex items-center gap-2 h-[36px] px-[16px] rounded-[8px] border border-[#6366f1] text-[#6366f1] hover:bg-[#ede9fe] transition-colors"
              >
                <Plus size={16} />
                <span className="font-['Arimo',sans-serif] text-[13px]">Add Section</span>
              </button>
            </div>

            <div className="space-y-3">
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className="flex items-center gap-3 p-3 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
                >
                  <GripVertical size={18} className="text-[#9ca3af] cursor-grab" />
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                      className="flex-1 px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={section.duration}
                        onChange={(e) => handleSectionChange(section.id, 'duration', parseInt(e.target.value) || 0)}
                        min={1}
                        className="w-[80px] px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] text-center focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      />
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">min</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveSection(section.id)}
                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#fef2f2] text-[#ef4444] transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Duration Selector */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
            <h3 className="text-[#111827] mb-4">Total Interview Duration</h3>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={15}
                max={90}
                step={5}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="flex-1"
              />
              <div className="flex items-center gap-2 min-w-[100px]">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 15)}
                  min={15}
                  max={90}
                  className="w-[70px] px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] text-center focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">min</span>
              </div>
            </div>
            <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mt-2">
              Recommended: 30-45 minutes for technical roles
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6">
            <button
              onClick={onBack}
              className="flex-1 h-[48px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Handle schedule live AI interview
                console.log('Schedule Live AI Interview', { tone, systemPrompt, sections, duration });
                onBack();
              }}
              className="flex-1 h-[48px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors flex items-center justify-center gap-2"
            >
              <Calendar size={18} />
              Schedule Live AI Interview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
