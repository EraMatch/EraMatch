import React, { useState } from 'react';
import { Settings, Mic, Brain, Volume2, Save, ArrowLeft, CheckCircle2 } from 'lucide-react';

export interface LiveInterviewFlowSettings {
    sttEngine: string;
    llmEngine: string;
    ttsEngine: string;
    voiceId: string;
    language: string;
    instructions: string;
}

interface LiveInterviewFlowSetupProps {
    groupName: string;
    onBack: () => void;
    onSave: (flowSettings: LiveInterviewFlowSettings) => void;
    initialSettings?: Partial<LiveInterviewFlowSettings>;
}

export function LiveInterviewFlowSetup({
    groupName,
    onBack,
    onSave,
    initialSettings
}: LiveInterviewFlowSetupProps) {
    const [settings, setSettings] = useState<LiveInterviewFlowSettings>({
        sttEngine: initialSettings?.sttEngine || 'whisper',
        llmEngine: initialSettings?.llmEngine || 'gpt-4o',
        ttsEngine: initialSettings?.ttsEngine || 'elevenlabs',
        voiceId: initialSettings?.voiceId || 'rachel',
        language: initialSettings?.language || 'en-US',
        instructions: initialSettings?.instructions || ''
    });

    const providers = {
        stt: [
            { id: 'whisper', name: 'OpenAI Whisper', desc: 'Highest accuracy, multiple languages' },
            { id: 'deepgram', name: 'Deepgram Nova', desc: 'Fastest real-time transcription' },
            { id: 'google', name: 'Google Cloud STT', desc: 'Enterprise-grade recognition' }
        ],
        llm: [
            { id: 'gpt-4o', name: 'GPT-4o (OpenAI)', desc: 'Fastest and most capable for reasoning' },
            { id: 'claude-3.5', name: 'Claude 3.5 Sonnet', desc: 'Excellent conversational nuances' },
            { id: 'llama-3', name: 'Llama 3 (Meta)', desc: 'Fast, open-source performance' }
        ],
        tts: [
            { id: 'elevenlabs', name: 'ElevenLabs', desc: 'Ultra-realistic, low latency voices' },
            { id: 'openai-tts', name: 'OpenAI TTS', desc: 'Natural sounding standard voices' },
            { id: 'azure-tts', name: 'Azure Neural TTS', desc: 'Highly customizable pronunciation' }
        ]
    };

    const voices = {
        elevenlabs: [
            { id: 'rachel', name: 'Rachel (Professional Female)' },
            { id: 'drew', name: 'Drew (Calm Male)' },
            { id: 'emily', name: 'Emily (Friendly Female)' }
        ],
        'openai-tts': [
            { id: 'alloy', name: 'Alloy (Neutral)' },
            { id: 'nova', name: 'Nova (Energetic Female)' },
            { id: 'onyx', name: 'Onyx (Deep Male)' }
        ],
        'azure-tts': [
            { id: 'jenny', name: 'Jenny (Clear Female)' },
            { id: 'guy', name: 'Guy (Authoritative Male)' }
        ]
    };

    const handleProviderSelect = (type: 'stt' | 'llm' | 'tts', id: string) => {
        setSettings(prev => {
            const next = { ...prev, [`${type}Engine`]: id };
            // Reset voice if TTS engine changes
            if (type === 'tts') {
                const availableVoices = voices[id as keyof typeof voices];
                next.voiceId = availableVoices ? availableVoices[0].id : '';
            }
            return next;
        });
    };

    const ProviderCard = ({ type, id, name, desc, icon: Icon }: any) => {
        const isSelected = settings[`${type}Engine` as keyof LiveInterviewFlowSettings] === id;

        return (
            <div
                onClick={() => handleProviderSelect(type, id)}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${isSelected
                    ? 'border-[#8b5cf6] bg-[#8b5cf6]/5 shadow-sm'
                    : 'border-white hover:border-[#8b5cf6]/30 hover:bg-gray-50 bg-white'
                    }`}
            >
                {isSelected && (
                    <div className="absolute top-3 right-3 text-[#8b5cf6]">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                )}
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-[#8b5cf6]/10 text-[#8b5cf6]' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="font-medium text-[#111827]">{name}</h4>
                        <p className="text-[13px] text-gray-500 mt-1">{desc}</p>
                    </div>
                </div>
            </div>
        );
    };

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
                        <h1 className="text-[20px] font-semibold text-[#111827]">Live Interview Pipeline</h1>
                        <p className="text-[13px] text-gray-500">Configure the realtime STT → LLM → TTS flow for {groupName}</p>
                    </div>
                </div>
                <button
                    onClick={() => onSave(settings)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#8b5cf6] text-white text-[14px] font-medium rounded-lg hover:bg-[#7c3aed] transition-colors shadow-sm"
                >
                    <Save className="w-4 h-4" />
                    Save Pipeline
                </button>
            </div>

            <div className="max-w-[1000px] mx-auto mt-8 px-8">

                {/* Connection Pipeline Visual */}
                <div className="bg-white rounded-2xl p-8 mb-8 shadow-sm border border-[#e5e7eb]">
                    <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-[#8b5cf6]" />
                        Pipeline Configuration
                    </h2>

                    <div className="grid grid-cols-[1fr_2fr] gap-x-12 gap-y-10">
                        {/* 1. Speech to Text */}
                        <div className="flex flex-col items-center justify-center border-r-2 border-dashed border-[#e5e7eb] relative pr-12">
                            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mb-4 relative z-10">
                                <Mic className="w-8 h-8" />
                            </div>
                            <h3 className="font-semibold text-gray-900">Speech to Text</h3>
                            <p className="text-sm text-gray-500 text-center mt-1">Candidate's voice</p>

                            {/* Arrow Line */}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-0.5 bg-gradient-to-r from-blue-200 to-purple-200"></div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {providers.stt.map(p => (
                                <ProviderCard key={p.id} type="stt" id={p.id} name={p.name} desc={p.desc} icon={Mic} />
                            ))}
                        </div>

                        {/* 2. LLM Engine */}
                        <div className="flex flex-col items-center justify-center border-r-2 border-dashed border-[#e5e7eb] relative pr-12">
                            <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center mb-4 relative z-10">
                                <Brain className="w-8 h-8" />
                            </div>
                            <h3 className="font-semibold text-gray-900">AI Reasoning</h3>
                            <p className="text-sm text-gray-500 text-center mt-1">Interview logic & decisions</p>

                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-0.5 bg-gradient-to-r from-purple-200 to-emerald-200"></div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {providers.llm.map(p => (
                                <ProviderCard key={p.id} type="llm" id={p.id} name={p.name} desc={p.desc} icon={Brain} />
                            ))}
                        </div>

                        {/* 3. Text to Speech */}
                        <div className="flex flex-col items-center justify-center border-r-2 border-dashed border-[#e5e7eb] relative pr-12">
                            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mb-4 relative z-10">
                                <Volume2 className="w-8 h-8" />
                            </div>
                            <h3 className="font-semibold text-gray-900">Text to Speech</h3>
                            <p className="text-sm text-gray-500 text-center mt-1">Interviewer's voice</p>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                {providers.tts.map(p => (
                                    <ProviderCard key={p.id} type="tts" id={p.id} name={p.name} desc={p.desc} icon={Volume2} />
                                ))}
                            </div>

                            {/* Character Voice Selection */}
                            <div className="mt-4 p-5 bg-gray-50 rounded-xl border border-[#e5e7eb]">
                                <label className="block text-[13px] font-medium text-gray-700 mb-3">
                                    Interviewer Voice Profile ({(providers.tts.find(t => t.id === settings.ttsEngine)?.name)})
                                </label>
                                <select
                                    value={settings.voiceId}
                                    onChange={(e) => setSettings({ ...settings, voiceId: e.target.value })}
                                    className="w-full h-[40px] px-3 border border-[#d1d5db] rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] text-[14px]"
                                >
                                    {voices[settings.ttsEngine as keyof typeof voices]?.map((voice) => (
                                        <option key={voice.id} value={voice.id}>
                                            {voice.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Global Settings */}
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#e5e7eb]">
                    <h2 className="text-lg font-semibold text-gray-900 mb-6">Language Settings</h2>
                    <div className="max-w-md">
                        <label className="block text-[14px] font-medium text-gray-700 mb-2">Spoken Language</label>
                        <select
                            value={settings.language}
                            onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                            className="w-full h-[40px] px-3 border border-[#d1d5db] rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] text-[14px]"
                        >
                            <option value="en-US">English (United States)</option>
                            <option value="en-GB">English (United Kingdom)</option>
                            <option value="es-ES">Spanish (Spain)</option>
                            <option value="fr-FR">French (France)</option>
                            <option value="de-DE">German (Germany)</option>
                        </select>
                        <p className="text-[13px] text-gray-500 mt-2">
                            This configures the base language for the Speech-to-Text and Text-to-Speech models.
                        </p>
                    </div>

                    {/* Interview Guidelines */}
                    <div className="mt-8 border-t border-[#e5e7eb] pt-6">
                        <label className="block text-[14px] font-medium text-gray-700 mb-2">
                            Interview Guidelines (System Prompt Supplement)
                        </label>
                        <p className="text-[13px] text-gray-500 mb-3">
                            Provide specific instructions for the AI on how to conduct this interview. This text will be appended to the AI's core systemic instructions.
                        </p>
                        <textarea
                            value={settings.instructions}
                            onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
                            placeholder="e.g. Focus on technical problem solving over syntax. If the candidate struggles, provide a small hint before moving on. Keep a friendly and encouraging tone."
                            className="w-full h-[120px] p-3 text-[14px] text-gray-700 border border-[#d1d5db] rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] resize-y"
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}
