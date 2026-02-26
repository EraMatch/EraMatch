import { useState } from 'react';
import { ChevronLeft, Sparkles, Mic, Video } from 'lucide-react';

interface UnifiedAIInterviewSetupProps {
    groupName: string;
    activeFlow: string[];
    onBack: () => void;
    onSetupQuestions?: (settings: any) => void;
    onSetupLiveFlow?: (settings: any) => void;
    initialData?: any;
}

export function UnifiedAIInterviewSetup({ groupName, activeFlow, onBack, onSetupQuestions, onSetupLiveFlow, initialData }: UnifiedAIInterviewSetupProps) {
    const hasRecorded = activeFlow.includes('ai-interview') || activeFlow.includes('ai_interview');
    const hasLive = activeFlow.includes('live-interview') || activeFlow.includes('live_interview');

    const [interviewType, setInterviewType] = useState<'recorded' | 'live'>(
        initialData?.interview_type === 'live_ai'
            ? 'live'
            : initialData?.interview_type === 'recorded'
                ? 'recorded'
                : hasRecorded ? 'recorded' : 'live'
    );

    const [title, setTitle] = useState(initialData?.title || '');
    const [systemPrompt, setSystemPrompt] = useState(initialData?.instructions || '');
    const [description, setDescription] = useState(initialData?.live_interview_context || '');
    const [difficulty, setDifficulty] = useState(initialData?.difficulty || 'Mid Level');
    const [duration, setDuration] = useState(initialData?.duration || 30);

    // Settings Checkboxes
    const [maxRetakes, setMaxRetakes] = useState(initialData?.max_retakes || 0);
    const [showAIFeedback, setShowAIFeedback] = useState(initialData?.show_ai_feedback !== false);
    const [recordingRequired, setRecordingRequired] = useState(initialData?.recording_required !== false);

    return (
        <div className="h-full w-full overflow-auto bg-[#f9fafb]">
            <div className="max-w-[900px] mx-auto px-[48px] py-[32px]">
                {/* Breadcrumb */}
                <button onClick={onBack} className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors">
                    <ChevronLeft size={20} />
                    <span className="font-['Arimo',sans-serif] text-[14px]">Back</span>
                </button>

                <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-8 shadow-sm">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-[8px] bg-[#f3e8ff] flex items-center justify-center text-[#8b5cf6]">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h1 className="text-[20px] font-medium text-[#111827]">Create AI Interview</h1>
                            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Configure your AI-powered interview settings</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Interview Title */}
                        <div>
                            <label className="block text-[12px] font-medium text-[#374151] mb-1.5">Interview Title *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g., Senior React Developer Technical Interview"
                                className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] font-['Arimo',sans-serif] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] transition-colors placeholder:text-[#9ca3af]"
                            />
                        </div>

                        {/* System Prompt */}
                        <div>
                            <label className="block text-[12px] font-medium text-[#374151] mb-1.5">System Prompt (Optional LLM Judge Instructions)</label>
                            <textarea
                                value={systemPrompt}
                                onChange={e => setSystemPrompt(e.target.value)}
                                placeholder="e.g., You are an expert engineering manager. Focus strictly on system design performance answers..."
                                rows={3}
                                className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] font-['Arimo',sans-serif] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] transition-colors placeholder:text-[#9ca3af] resize-none"
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-[12px] font-medium text-[#374151] mb-1.5">Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Describe the purpose and scope of this interview..."
                                rows={3}
                                className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] font-['Arimo',sans-serif] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] transition-colors placeholder:text-[#9ca3af] resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Interview Type Selector */}
                            <div>
                                <label className="block text-[12px] font-medium text-[#374151] mb-1.5">Interview Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setInterviewType('recorded')}
                                        disabled={!hasRecorded}
                                        className={`flex flex-col items-center justify-center py-4 rounded-[6px] border-2 transition-all ${interviewType === 'recorded'
                                            ? 'border-[#8b5cf6] bg-[#f3e8ff] text-[#8b5cf6]'
                                            : 'border-[#e5e7eb] hover:border-[#d1d5db] text-[#6b7280] disabled:opacity-40 disabled:hover:border-[#e5e7eb]'
                                            }`}
                                    >
                                        <Mic size={20} className="mb-2" />
                                        <span className="text-[13px] font-medium font-['Arimo',sans-serif]">Recorded Responses</span>
                                    </button>
                                    <button
                                        onClick={() => setInterviewType('live')}
                                        disabled={!hasLive}
                                        className={`flex flex-col items-center justify-center py-4 rounded-[6px] border-2 transition-all ${interviewType === 'live'
                                            ? 'border-[#8b5cf6] bg-[#f3e8ff] text-[#8b5cf6]'
                                            : 'border-[#e5e7eb] hover:border-[#d1d5db] text-[#6b7280] disabled:opacity-40 disabled:hover:border-[#e5e7eb]'
                                            }`}
                                    >
                                        <Video size={20} className="mb-2" />
                                        <span className="text-[13px] font-medium font-['Arimo',sans-serif]">Live Interview</span>
                                    </button>
                                </div>
                            </div>

                            {/* Attributes */}
                            <div className="space-y-4">

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#374151] mb-1.5">Total Duration (minutes)</label>
                                        <input
                                            type="number"
                                            value={duration}
                                            onChange={e => setDuration(parseInt(e.target.value) || 30)}
                                            className="w-full px-3 py-2.5 border border-[#e5e7eb] rounded-[6px] text-[13px] font-['Arimo',sans-serif] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#374151] mb-1.5">Difficulty Level</label>
                                        <div className="relative">
                                            <select
                                                value={difficulty}
                                                onChange={e => setDifficulty(e.target.value)}
                                                className="w-full px-3 py-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[13px] font-['Arimo',sans-serif] text-[#111827] focus:outline-none appearance-none cursor-pointer"
                                            >
                                                <option value="Junior">Junior</option>
                                                <option value="Mid Level">Mid Level</option>
                                                <option value="Senior">Senior</option>
                                            </select>
                                            <ChevronLeft size={14} className="absolute right-3 top-1/2 -translate-y-1/2 -rotate-90 text-[#6b7280] pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Checkboxes Area */}
                        <div className="bg-[#f9fafb] rounded-[8px] p-5 space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-[13px] font-medium text-[#111827]">Allow Retakes</div>
                                    <div className="text-[12px] text-[#6b7280] font-['Arimo',sans-serif] mt-0.5">Maximum times a candidate can retake the interview</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        max={10}
                                        value={maxRetakes}
                                        onChange={e => setMaxRetakes(parseInt(e.target.value) || 0)}
                                        className="w-[60px] px-3 py-1.5 border border-[#e5e7eb] rounded-[6px] text-[13px] font-['Arimo',sans-serif] text-center focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                                    />
                                    <span className="text-[12px] text-[#6b7280]">times</span>
                                </div>
                            </div>

                            <label className="flex items-start gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={showAIFeedback}
                                    onChange={e => setShowAIFeedback(e.target.checked)}
                                    className="w-[18px] h-[18px] rounded-[4px] border-[#d1d5db] text-[#8b5cf6] focus:ring-[#8b5cf6] focus:ring-offset-0 mt-0.5"
                                />
                                <div>
                                    <div className="text-[13px] font-medium text-[#111827] group-hover:text-[#8b5cf6] transition-colors">Show AI Feedback</div>
                                    <div className="text-[12px] text-[#6b7280] font-['Arimo',sans-serif]">Display AI-generated feedback after the interview</div>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={recordingRequired}
                                    onChange={e => setRecordingRequired(e.target.checked)}
                                    className="w-[18px] h-[18px] rounded-[4px] border-[#d1d5db] text-[#8b5cf6] focus:ring-[#8b5cf6] focus:ring-offset-0 mt-0.5"
                                />
                                <div>
                                    <div className="text-[13px] font-medium text-[#111827] group-hover:text-[#8b5cf6] transition-colors">Recording Required</div>
                                    <div className="text-[12px] text-[#6b7280] font-['Arimo',sans-serif]">Save video/audio recordings for review</div>
                                </div>
                            </label>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={onBack}
                                className="px-[24px] py-[10px] rounded-[6px] border border-[#e5e7eb] text-[#374151] text-[13px] font-medium hover:bg-[#f9fafb] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const settings = {
                                        title,
                                        systemPrompt,
                                        description,
                                        interviewType,
                                        difficulty,
                                        duration,
                                        maxRetakes,
                                        showAIFeedback,
                                        recordingRequired
                                    };
                                    if (interviewType === 'recorded' && onSetupQuestions) {
                                        onSetupQuestions(settings);
                                    } else if (interviewType === 'live' && onSetupLiveFlow) {
                                        onSetupLiveFlow(settings);
                                    }
                                }}
                                className="px-[24px] py-[10px] rounded-[6px] bg-[#8b5cf6] text-white text-[13px] font-medium hover:bg-[#7c3aed] transition-colors shadow-sm"
                            >
                                {interviewType === 'recorded' ? 'Continue to Questions' : 'Continue to Flow Setup'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
