import React, { useState } from 'react';
import { FileText, Save, ArrowLeft, Target, MessageSquare, Cpu, Users, Layers, Sparkles, Loader2 } from 'lucide-react';
import { recruiterService } from '../../../services/recruiter.service';

export interface LiveInterviewFlowSettings {
    instructions: string;
    interviewTheme: 'technical' | 'interpersonal' | 'mixed';
    focusAreas: string[];
    questionCount: number;
    hintPolicy: string;
}

interface LiveInterviewFlowSetupProps {
    groupName: string;
    onBack: () => void;
    onSave: (flowSettings: LiveInterviewFlowSettings) => void;
    initialSettings?: Partial<LiveInterviewFlowSettings>;
}

const HINT_POLICIES = [
    { id: 'none', label: 'No hints', desc: 'Strict mode — no assistance given.' },
    { id: 'on_request', label: 'Only if asked', desc: 'Candidate must ask for a hint.' },
    { id: 'on_struggle', label: 'On struggle', desc: 'AI offers a hint after a 30s pause.' },
    { id: 'always', label: 'Always guide', desc: 'Continuously steer candidate toward the answer.' },
];

const TECHNICAL_FOCUS_AREAS = [
    { key: 'system_design', label: 'System Design' },
    { key: 'algorithms', label: 'Algorithms & DSA' },
    { key: 'database', label: 'Database & SQL' },
    { key: 'devops', label: 'DevOps / Cloud' },
    { key: 'security', label: 'Security' },
    { key: 'architecture', label: 'Architecture Patterns' },
    { key: 'api_design', label: 'API Design' },
    { key: 'performance', label: 'Performance & Scalability' },
];

const INTERPERSONAL_FOCUS_AREAS = [
    { key: 'communication', label: 'Communication' },
    { key: 'leadership', label: 'Leadership' },
    { key: 'teamwork', label: 'Teamwork & Collaboration' },
    { key: 'culture_fit', label: 'Culture Fit' },
    { key: 'conflict_resolution', label: 'Conflict Resolution' },
    { key: 'adaptability', label: 'Adaptability' },
    { key: 'motivation', label: 'Motivation & Drive' },
    { key: 'problem_ownership', label: 'Problem Ownership' },
];

const INTERVIEW_THEMES = [
    {
        id: 'technical' as const,
        label: 'Technical',
        desc: 'Focus entirely on hard skills, system design, and coding ability.',
        icon: Cpu,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-500',
        activeBg: 'bg-blue-50',
    },
    {
        id: 'interpersonal' as const,
        label: 'Interpersonal',
        desc: 'Focus on soft skills, communication, culture fit, and leadership.',
        icon: Users,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        border: 'border-emerald-500',
        activeBg: 'bg-emerald-50',
    },
    {
        id: 'mixed' as const,
        label: 'Mixed',
        desc: 'Blend technical questions with interpersonal topics organically.',
        icon: Layers,
        color: 'text-[#8b5cf6]',
        bg: 'bg-purple-50',
        border: 'border-[#8b5cf6]',
        activeBg: 'bg-purple-50',
    },
];

export function LiveInterviewFlowSetup({
    groupName,
    onBack,
    onSave,
    initialSettings
}: LiveInterviewFlowSetupProps) {
    const [settings, setSettings] = useState<LiveInterviewFlowSettings>({
        instructions: initialSettings?.instructions || '',
        interviewTheme: initialSettings?.interviewTheme || 'technical',
        focusAreas: initialSettings?.focusAreas || ['algorithms', 'system_design'],
        questionCount: initialSettings?.questionCount || 5,
        hintPolicy: initialSettings?.hintPolicy || 'on_struggle',
    });
    const [isRefiningInstructions, setIsRefiningInstructions] = useState(false);

    const handleThemeChange = (theme: 'technical' | 'interpersonal' | 'mixed') => {
        // Reset focus areas to sensible defaults when switching theme
        const defaults: Record<string, string[]> = {
            technical: ['algorithms', 'system_design'],
            interpersonal: ['communication', 'teamwork'],
            mixed: ['algorithms', 'system_design', 'communication', 'culture_fit'],
        };
        setSettings(prev => ({ ...prev, interviewTheme: theme, focusAreas: defaults[theme] }));
    };

    const toggleFocusArea = (key: string) => {
        setSettings(prev => ({
            ...prev,
            focusAreas: prev.focusAreas.includes(key)
                ? prev.focusAreas.filter(k => k !== key)
                : [...prev.focusAreas, key]
        }));
    };

    const visibleTechnicalAreas = settings.interviewTheme === 'technical' || settings.interviewTheme === 'mixed';
    const visibleInterpersonalAreas = settings.interviewTheme === 'interpersonal' || settings.interviewTheme === 'mixed';

    return (
        <div className="min-h-screen bg-[#f3f4f6] pb-20">
            {/* Header */}
            <div className="bg-white border-b border-[#e5e7eb] sticky top-0 z-10 px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-[#111827]"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-[20px] font-semibold text-[#111827]">Live Interview Setup</h1>
                        <p className="text-[13px] text-gray-500">Configure interview behavior for <strong>{groupName}</strong></p>
                    </div>
                </div>
                <button
                    onClick={() => onSave(settings)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#8b5cf6] text-white text-[14px] font-medium rounded-lg hover:bg-[#7c3aed] transition-colors shadow-sm"
                >
                    <Save className="w-4 h-4" />
                    Save Interview
                </button>
            </div>

            <div className="max-w-[800px] mx-auto mt-8 px-8 space-y-6">

                {/* Interview Theme */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e5e7eb]">
                    <h2 className="text-[16px] font-semibold text-gray-900 mb-2">Interview Theme</h2>
                    <p className="text-[13px] text-gray-500 mb-4">Choose the overall character of this interview. This controls the type of questions the AI will ask.</p>
                    <div className="grid grid-cols-3 gap-3">
                        {INTERVIEW_THEMES.map(theme => {
                            const Icon = theme.icon;
                            const isSelected = settings.interviewTheme === theme.id;
                            return (
                                <div
                                    key={theme.id}
                                    onClick={() => handleThemeChange(theme.id)}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? `${theme.border} ${theme.activeBg}` : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                                >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${isSelected ? theme.bg : 'bg-gray-100'}`}>
                                        <Icon className={`w-5 h-5 ${isSelected ? theme.color : 'text-gray-400'}`} />
                                    </div>
                                    <p className={`text-[14px] font-semibold mb-1 ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{theme.label}</p>
                                    <p className="text-[12px] text-gray-500 leading-snug">{theme.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Focus Areas */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e5e7eb]">
                    <h2 className="text-[16px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Target className="w-5 h-5 text-[#8b5cf6]" />
                        Focus Areas
                    </h2>
                    <p className="text-[13px] text-gray-500 mb-4">Select the specific domains the AI should prioritize during this interview.</p>

                    {visibleTechnicalAreas && (
                        <div className="mb-4">
                            {settings.interviewTheme === 'mixed' && (
                                <p className="text-[12px] font-medium text-blue-600 uppercase tracking-wide mb-2">Technical</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {TECHNICAL_FOCUS_AREAS.map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => toggleFocusArea(f.key)}
                                        className={`px-3 py-1.5 rounded-full text-[13px] border font-medium transition-colors ${settings.focusAreas.includes(f.key) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:border-blue-500'}`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {visibleInterpersonalAreas && (
                        <div>
                            {settings.interviewTheme === 'mixed' && (
                                <p className="text-[12px] font-medium text-emerald-600 uppercase tracking-wide mb-2 mt-3">Interpersonal</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {INTERPERSONAL_FOCUS_AREAS.map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => toggleFocusArea(f.key)}
                                        className={`px-3 py-1.5 rounded-full text-[13px] border font-medium transition-colors ${settings.focusAreas.includes(f.key) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300 text-gray-600 hover:border-emerald-500'}`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e5e7eb]">
                    <h2 className="text-[16px] font-semibold text-gray-900 mb-5">Target Questions</h2>
                    <div className="w-full">
                        <label className="block text-[13px] font-medium text-gray-700 mb-4">
                            How many questions should the AI target during the live session? <strong className="text-[#8b5cf6] text-[15px] ml-1">{settings.questionCount}</strong>
                        </label>
                        <input
                            type="range" min={2} max={15} step={1}
                            value={settings.questionCount}
                            onChange={(e) => setSettings({ ...settings, questionCount: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#8b5cf6] mb-2"
                        />
                        <div className="flex justify-between text-[12px] font-medium text-gray-400 px-1">
                            <span>2 questions</span><span>15 questions</span>
                        </div>
                    </div>
                </div>

                {/* Hint Policy */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e5e7eb]">
                    <h2 className="text-[16px] font-semibold text-gray-900 mb-5 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
                        Hint Policy
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        {HINT_POLICIES.map(h => (
                            <div
                                key={h.id}
                                onClick={() => setSettings({ ...settings, hintPolicy: h.id })}
                                className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${settings.hintPolicy === h.id ? 'border-[#8b5cf6] bg-purple-50' : 'border-gray-200 hover:border-[#8b5cf6]/30'}`}
                            >
                                <p className="text-[13px] font-semibold text-gray-800">{h.label}</p>
                                <p className="text-[12px] text-gray-500 mt-0.5">{h.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Interview Guidelines */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e5e7eb]">
                    <h2 className="text-[16px] font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[#8b5cf6]" />
                        Interview-Specific Instructions
                    </h2>
                    <p className="text-[13px] text-gray-500 mb-4">
                        Add context specific to this role or candidate group. These instructions are appended to the AI's system prompt.
                    </p>
                    <textarea
                        value={settings.instructions}
                        onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
                        placeholder="e.g. This interview is for a Senior Backend Engineering role. Focus on distributed systems and API design. If the candidate mentions React, redirect them to backend topics."
                        className="w-full h-[140px] p-3 text-[14px] text-gray-700 border border-[#d1d5db] rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] resize-y"
                    />
                    <button
                        type="button"
                        onClick={async () => {
                            if (!settings.instructions.trim()) return;
                            setIsRefiningInstructions(true);
                            try {
                                const response = await recruiterService.refineAIQuestion(settings.instructions, {
                                    useCase: 'live_interview_flow_instructions',
                                    metadata: {
                                        group_name: groupName,
                                        interview_theme: settings.interviewTheme,
                                        focus_areas: settings.focusAreas,
                                        question_count: settings.questionCount,
                                        hint_policy: settings.hintPolicy,
                                    },
                                });
                                setSettings((prev) => ({
                                    ...prev,
                                    instructions: (response?.refinedText || prev.instructions).trim() || prev.instructions,
                                }));
                            } catch (error) {
                                console.error('Failed to refine live interview flow instructions:', error);
                            } finally {
                                setIsRefiningInstructions(false);
                            }
                        }}
                        disabled={isRefiningInstructions || !settings.instructions.trim()}
                        className="mt-2 flex items-center gap-2 h-[30px] px-[16px] rounded-[8px] border border-dashed border-[#e5e7eb] hover:border-[#8b5cf6] hover:bg-[#faf5ff] transition-colors disabled:opacity-50"
                    >
                        {isRefiningInstructions ? <Loader2 className="w-4 h-4 animate-spin text-[#8b5cf6]" /> : <Sparkles className="w-4 h-4 text-[#8b5cf6]" />}
                        <span className="text-[13px] font-medium text-[#8b5cf6]">Refine with AI</span>
                    </button>
                </div>

            </div>
        </div>
    );
}
