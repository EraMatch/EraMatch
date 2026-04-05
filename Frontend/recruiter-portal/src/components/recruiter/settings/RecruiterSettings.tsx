import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../ui/dialog';
import {
    Bell, Lock, User, Mic, Brain, Volume2, Cpu, Settings2, CheckCircle2, Zap, Loader2
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import EraMatchLogo from '../../../assets/image-eramatch.png';
import { recruiterService } from '../../../services/recruiter.service';
import { fetchAPI } from '../../../services/client';

interface RecruiterSettingsProps {
    userRole?: string;
}

const PROVIDERS = {
    stt: [
        { id: 'whisper', name: 'OpenAI Whisper', desc: 'Highest accuracy, multiple languages' },
        { id: 'deepgram', name: 'Deepgram Nova', desc: 'Fastest real-time transcription' },
        { id: 'google', name: 'Google Cloud STT', desc: 'Enterprise-grade recognition' },
    ],
    llm: [
        { id: 'gpt-4o', name: 'GPT-4o (OpenAI)', desc: 'Fastest and most capable for reasoning' },
        { id: 'claude-3.5', name: 'Claude 3.5 Sonnet', desc: 'Excellent conversational nuances' },
        { id: 'llama-3', name: 'Llama 3 (Meta)', desc: 'Fast, open-source performance' },
    ],
    tts: [
        { id: 'elevenlabs', name: 'ElevenLabs', desc: 'Ultra-realistic, low latency voices' },
        { id: 'openai-tts', name: 'OpenAI TTS', desc: 'Natural sounding standard voices' },
        { id: 'azure-tts', name: 'Azure Neural TTS', desc: 'Highly customizable pronunciation' },
    ],
};

const VOICES: Record<string, { id: string; name: string }[]> = {
    elevenlabs: [
        { id: 'rachel', name: 'Rachel (Professional Female)' },
        { id: 'drew', name: 'Drew (Calm Male)' },
        { id: 'emily', name: 'Emily (Friendly Female)' },
    ],
    'openai-tts': [
        { id: 'alloy', name: 'Alloy (Neutral)' },
        { id: 'nova', name: 'Nova (Energetic Female)' },
        { id: 'onyx', name: 'Onyx (Deep Male)' },
    ],
    'azure-tts': [
        { id: 'jenny', name: 'Jenny (Clear Female)' },
        { id: 'guy', name: 'Guy (Authoritative Male)' },
    ],
};

const INTERVIEW_STYLES = [
    { id: 'friendly', label: 'Friendly & Encouraging', desc: 'Warm tone; hints given freely.' },
    { id: 'professional', label: 'Professional & Neutral', desc: 'Standard structured interview.' },
    { id: 'rigorous', label: 'Rigorous & Probing', desc: 'Deep follow-up on every answer.' },
    { id: 'socratic', label: 'Socratic', desc: 'Challenge assumptions; guide candidate to self-discover.' },
];

const FOLLOW_UP_MODES = [
    { id: 'never', label: 'Never follow up' },
    { id: 'on_vague', label: 'On vague or shallow answers' },
    { id: 'always', label: 'Always follow up with a deeper question' },
];

type TabId = 'profile' | 'notifications' | 'security' | 'ai_pipeline';

export function RecruiterSettings({ userRole }: RecruiterSettingsProps) {
    const isTechnical = !userRole || userRole === 'technical';

    const tabs: { id: TabId; label: string; icon: any }[] = [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'security', label: 'Security', icon: Lock },
        ...(isTechnical ? [{ id: 'ai_pipeline' as TabId, label: 'AI Pipeline', icon: Cpu }] : []),
    ];

    const [activeTab, setActiveTab] = useState<TabId>('profile');
    const [isLoading, setIsLoading] = useState(true);

    // Profile state
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');

    // Notification state
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [newMemberRequests, setNewMemberRequests] = useState(true);
    const [projectUpdates, setProjectUpdates] = useState(true);
    const [weeklySummary, setWeeklySummary] = useState(false);

    // Security state
    const [twoFactorAuth, setTwoFactorAuth] = useState(false);
    const [sessionTimeout, setSessionTimeout] = useState(true);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    // AI Pipeline state (Technical HR only)
    const [sttEngine, setSttEngine] = useState('whisper');
    const [llmEngine, setLlmEngine] = useState('gpt-4o');
    const [ttsEngine, setTtsEngine] = useState('elevenlabs');
    const [voiceId, setVoiceId] = useState('rachel');
    const [language, setLanguage] = useState('en-US');
    const [interviewStyle, setInterviewStyle] = useState('professional');
    const [followUpMode, setFollowUpMode] = useState('on_vague');
    const [llmTemperature, setLlmTemperature] = useState(0.7);
    const [maxFollowUps, setMaxFollowUps] = useState(2);
    const [forbiddenTopics, setForbiddenTopics] = useState('');
    const [personalityNote, setPersonalityNote] = useState('');
    const [scoringFocus, setScoringFocus] = useState<string[]>(['technical_depth', 'communication']);


    // Fetch settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const data = await recruiterService.getSettings();

                // Profile
                setFirstName(data.first_name || '');
                setLastName(data.last_name || '');
                setEmail(data.email || '');

                // Preferences
                if (data.email_notifications !== undefined) setEmailNotifications(data.email_notifications);
                if (data.new_member_requests !== undefined) setNewMemberRequests(data.new_member_requests);
                if (data.project_updates !== undefined) setProjectUpdates(data.project_updates);
                if (data.weekly_summary !== undefined) setWeeklySummary(data.weekly_summary);
                if (data.two_factor_auth !== undefined) setTwoFactorAuth(data.two_factor_auth);
                if (data.session_timeout !== undefined) setSessionTimeout(data.session_timeout);


                // AI Pipeline Config
                if (data.ai_pipeline_config) {
                    const cfg = data.ai_pipeline_config;
                    if (cfg.sttEngine) setSttEngine(cfg.sttEngine);
                    if (cfg.llmEngine) setLlmEngine(cfg.llmEngine);
                    if (cfg.ttsEngine) setTtsEngine(cfg.ttsEngine);
                    if (cfg.voiceId) setVoiceId(cfg.voiceId);
                    if (cfg.language) setLanguage(cfg.language);
                    if (cfg.interviewStyle) setInterviewStyle(cfg.interviewStyle);
                    if (cfg.followUpMode) setFollowUpMode(cfg.followUpMode);
                    if (cfg.llmTemperature !== undefined) setLlmTemperature(cfg.llmTemperature);
                    if (cfg.maxFollowUps !== undefined) setMaxFollowUps(cfg.maxFollowUps);
                    if (cfg.forbiddenTopics) setForbiddenTopics(cfg.forbiddenTopics);
                    if (cfg.personalityNote) setPersonalityNote(cfg.personalityNote);
                    if (cfg.scoringFocus) setScoringFocus(cfg.scoringFocus);
                }
            } catch (err) {
                console.error("Failed to fetch settings", err);
                toast.error("Failed to load settings data");
            } finally {
                setIsLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSaveProfile = async () => {
        try {
            await recruiterService.updateProfile({
                first_name: firstName,
                last_name: lastName,
                email: email
            });
            toast.success('Profile settings saved! Note: Email changes might require re-login.');
        } catch (err) {
            toast.error('Failed to update profile.');
        }
    };

    const handleSavePreferences = async (updates: any) => {
        try {
            await recruiterService.updatePreferences(updates);
            toast.success('Preferences updated!');
        } catch (err) {
            toast.error('Failed to update preferences.');
        }
    };

    const handleChangePassword = async () => {
        if (!oldPassword || !newPassword || !confirmPassword) {
            toast.error('Please fill in all fields.'); return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match.'); return;
        }
        if (newPassword.length < 8) {
            toast.error('Password must be at least 8 characters.'); return;
        }

        setIsChangingPassword(true);
        try {
            // NOTE: The previous backend implementation we didn't add the ChangePassword endpoint explicitly
            // to the recruiters API, but it might exist under generic auth routes.
            // If it doesn't, this toast acts as a temporary shim or we can add it later.
            await fetchAPI('/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword })
            });
            toast.success('Password changed successfully!');
            setIsPasswordModalOpen(false);
            setOldPassword(''); setNewPassword(''); setConfirmPassword('');
        } catch (err: any) {
            toast.error(err.message || 'Failed to change password');
        } finally {
            setIsChangingPassword(false);
        }
    };

    const handleSavePipeline = async () => {
        const config = { sttEngine, llmEngine, ttsEngine, voiceId, language, interviewStyle, followUpMode, llmTemperature, maxFollowUps, forbiddenTopics, personalityNote, scoringFocus };
        try {
            await recruiterService.updateAIPipeline(config);
            toast.success('AI Pipeline configuration saved!');
        } catch (err) {
            toast.error('Failed to update AI pipeline.');
        }
    };

    const handleTtsChange = (id: string) => {
        setTtsEngine(id);
        const available = VOICES[id];
        setVoiceId(available ? available[0].id : '');
    };

    const toggleScoringFocus = (key: string) => {
        setScoringFocus(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const ProviderCard = ({ id, name, desc, icon: Icon, selectedId, onSelect }: any) => {
        const isSelected = selectedId === id;
        return (
            <div
                onClick={() => onSelect(id)}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${isSelected
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                    : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50 bg-white'}`}
            >
                {isSelected && (
                    <div className="absolute top-3 right-3 text-indigo-600">
                        <CheckCircle2 className="w-4 h-4" />
                    </div>
                )}
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="font-medium text-[13px] text-[#111827]">{name}</h4>
                        <p className="text-[12px] text-gray-500 mt-0.5">{desc}</p>
                    </div>
                </div>
            </div>
        );
    };

    const TabButton = ({ id, label, icon: Icon }: { id: TabId; label: string; icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left ${activeTab === id
                ? 'bg-indigo-50 text-indigo-600 font-medium'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
        >
            <Icon size={20} />
            <span>{label}</span>
        </button>
    );

    return (
        <div className="px-12 py-8">
            <div className="mb-8 flex items-start justify-between">
                <div>
                    <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Settings</h1>
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Manage your account settings and preferences</p>
                </div>
                <img src={EraMatchLogo} alt="EraMatch" className="h-[72px] w-auto object-contain mt-1 mr-6" />
            </div>

            <div className="grid grid-cols-[240px,1fr] gap-10">
                {/* Sidebar Tabs */}
                <div className="flex flex-col gap-2">
                    {tabs.map(t => <TabButton key={t.id} id={t.id} label={t.label} icon={t.icon} />)}
                </div>

                {/* Tab Content */}
                <div className="space-y-6">

                    {/* Profile */}
                    {activeTab === 'profile' && (
                        <Card className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                                    <User className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-gray-700 font-medium">Profile Settings</h3>
                                    <p className="text-gray-500 text-sm">Manage your personal information</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">First Name</Label>
                                        <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-lg" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Last Name</Label>
                                        <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-lg" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="role">Role</Label>
                                    <Input id="role" defaultValue={isTechnical ? 'Technical HR' : 'HR Recruiter'} disabled className="rounded-lg bg-gray-50" />
                                </div>
                            </div>
                            <div className="flex justify-end mt-6">
                                <Button className="bg-[#6366F1] hover:bg-[#5558DD] text-white rounded-full px-6" onClick={handleSaveProfile}>
                                    Save Changes
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Notifications */}
                    {activeTab === 'notifications' && (
                        <Card className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                                    <Bell className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-gray-700 font-medium">Notification Preferences</h3>
                                    <p className="text-gray-500 text-sm">Choose which notifications you receive</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                {[
                                    { id: 'email', label: 'Email Notifications', desc: 'Receive notifications via email', val: emailNotifications, set: setEmailNotifications },
                                    { id: 'candidates', label: 'New Candidate Alerts', desc: 'Get notified when high-match candidates are found', val: newMemberRequests, set: setNewMemberRequests },
                                    { id: 'assessments', label: 'Assessment Updates', desc: 'Receive updates when candidates complete assessments', val: projectUpdates, set: setProjectUpdates },
                                    { id: 'summary', label: 'Weekly Summary', desc: 'Get a weekly summary of recruitment activities', val: weeklySummary, set: setWeeklySummary },
                                ].map((item, idx, arr) => (
                                    <div key={item.id} className={`flex items-center justify-between py-4 ${idx !== arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                        <div>
                                            <p className="text-gray-700 font-medium">{item.label}</p>
                                            <p className="text-gray-500 text-sm">{item.desc}</p>
                                        </div>
                                        <Switch checked={item.val} onCheckedChange={item.set} />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Security */}
                    {activeTab === 'security' && (
                        <Card className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                                    <Lock className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-gray-700 font-medium">Security Settings</h3>
                                    <p className="text-gray-500 text-sm">Manage your security preferences</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                                    <div>
                                        <p className="text-gray-700 font-medium">Two-Factor Authentication</p>
                                        <p className="text-gray-500 text-sm">Add an extra layer of security to your account</p>
                                    </div>
                                    <Switch checked={twoFactorAuth} onCheckedChange={setTwoFactorAuth} />
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                                    <div>
                                        <p className="text-gray-700 font-medium">Session Timeout</p>
                                        <p className="text-gray-500 text-sm">Auto-logout after 30 minutes of inactivity</p>
                                    </div>
                                    <Switch checked={sessionTimeout} onCheckedChange={setSessionTimeout} />
                                </div>
                                <Button variant="outline" className="rounded-full px-6 border-indigo-200 text-indigo-600 hover:bg-indigo-50" onClick={() => setIsPasswordModalOpen(true)}>
                                    Change Password
                                </Button>
                            </div>

                        </Card>
                    )}

                    {/* AI Pipeline (Technical HR only) */}
                    {activeTab === 'ai_pipeline' && isTechnical && (
                        <div className="space-y-6">
                            <Card className="p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                                        <Cpu className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-gray-700 font-medium flex items-center gap-2">
                                            AI Interview Pipeline Configuration
                                            <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-700 rounded-full">Technical HR</span>
                                        </h3>
                                        <p className="text-gray-500 text-sm">Configure the global STT → LLM → TTS engine stack</p>
                                    </div>
                                </div>

                                {/* STT */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Mic className="w-4 h-4 text-blue-500" />
                                        <h4 className="font-medium text-[14px] text-gray-800">Speech to Text Engine</h4>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {PROVIDERS.stt.map(p => (
                                            <ProviderCard key={p.id} id={p.id} name={p.name} desc={p.desc} icon={Mic} selectedId={sttEngine} onSelect={setSttEngine} />
                                        ))}
                                    </div>
                                </div>

                                {/* LLM */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Brain className="w-4 h-4 text-purple-500" />
                                        <h4 className="font-medium text-[14px] text-gray-800">AI Reasoning Model</h4>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {PROVIDERS.llm.map(p => (
                                            <ProviderCard key={p.id} id={p.id} name={p.name} desc={p.desc} icon={Brain} selectedId={llmEngine} onSelect={setLlmEngine} />
                                        ))}
                                    </div>
                                </div>

                                {/* TTS */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Volume2 className="w-4 h-4 text-emerald-500" />
                                        <h4 className="font-medium text-[14px] text-gray-800">Text to Speech Engine</h4>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {PROVIDERS.tts.map(p => (
                                            <ProviderCard key={p.id} id={p.id} name={p.name} desc={p.desc} icon={Volume2} selectedId={ttsEngine} onSelect={handleTtsChange} />
                                        ))}
                                    </div>
                                    <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                        <label className="block text-[13px] font-medium text-gray-700 mb-2">
                                            Interviewer Voice ({PROVIDERS.tts.find(t => t.id === ttsEngine)?.name})
                                        </label>
                                        <select
                                            value={voiceId}
                                            onChange={(e) => setVoiceId(e.target.value)}
                                            className="w-full h-[40px] px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 text-[14px]"
                                        >
                                            {VOICES[ttsEngine]?.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </Card>

                            {/* Language & Behavior */}
                            <Card className="p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                                        <Settings2 className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-gray-700 font-medium">Language & Behavior</h3>
                                        <p className="text-gray-500 text-sm">Configure language, temperature, and interview style</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <label className="block text-[13px] font-medium text-gray-700 mb-2">Spoken Language</label>
                                        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full h-[40px] px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 text-[14px]">
                                            <option value="en-US">English (United States)</option>
                                            <option value="en-GB">English (United Kingdom)</option>
                                            <option value="es-ES">Spanish (Spain)</option>
                                            <option value="fr-FR">French (France)</option>
                                            <option value="de-DE">German (Germany)</option>
                                            <option value="ar-AE">Arabic (UAE)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-medium text-gray-700 mb-2">
                                            LLM Temperature: <strong className="text-indigo-600">{llmTemperature}</strong>
                                        </label>
                                        <input type="range" min={0} max={1} step={0.05} value={llmTemperature} onChange={(e) => setLlmTemperature(parseFloat(e.target.value))} className="w-full accent-indigo-600" />
                                        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                                            <span>Consistent</span><span>Creative</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Interview Style */}
                                <div className="mb-6">
                                    <label className="block text-[13px] font-medium text-gray-700 mb-3">Interview Style</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {INTERVIEW_STYLES.map(style => (
                                            <div
                                                key={style.id}
                                                onClick={() => setInterviewStyle(style.id)}
                                                className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${interviewStyle === style.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'}`}
                                            >
                                                <p className="text-[13px] font-semibold text-gray-800">{style.label}</p>
                                                <p className="text-[12px] text-gray-500 mt-0.5">{style.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Follow-up */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[13px] font-medium text-gray-700 mb-2">AI Follow-up Behavior</label>
                                        <select value={followUpMode} onChange={(e) => setFollowUpMode(e.target.value)} className="w-full h-[40px] px-3 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500">
                                            {FOLLOW_UP_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-medium text-gray-700 mb-2">
                                            Max Follow-ups per Topic: <strong className="text-indigo-600">{maxFollowUps}</strong>
                                        </label>
                                        <input type="range" min={0} max={5} step={1} value={maxFollowUps} onChange={(e) => setMaxFollowUps(parseInt(e.target.value))} className="w-full accent-indigo-600" />
                                    </div>
                                </div>
                            </Card>

                            {/* Scoring & Instructions */}
                            <Card className="p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                                        <Zap className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-gray-700 font-medium">Scoring & Prompt Override</h3>
                                        <p className="text-gray-500 text-sm">Define scoring priorities and global AI instructions</p>
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-[13px] font-medium text-gray-700 mb-3">Scoring Focus Areas</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { key: 'technical_depth', label: 'Technical Depth' },
                                            { key: 'communication', label: 'Communication' },
                                            { key: 'problem_solving', label: 'Problem Solving' },
                                            { key: 'culture_fit', label: 'Culture Fit' },
                                            { key: 'leadership', label: 'Leadership' },
                                            { key: 'adaptability', label: 'Adaptability' },
                                        ].map(f => (
                                            <button
                                                key={f.key}
                                                onClick={() => toggleScoringFocus(f.key)}
                                                className={`px-3 py-1.5 rounded-full text-[13px] border transition-colors ${scoringFocus.includes(f.key) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-[13px] font-medium text-gray-700 mb-2">Forbidden Topics</label>
                                    <p className="text-[12px] text-gray-500 mb-2">Comma-separated list of topics the AI must never bring up.</p>
                                    <Input placeholder="e.g. personal health, family, religion, age, politics" value={forbiddenTopics} onChange={(e) => setForbiddenTopics(e.target.value)} className="rounded-lg" />
                                </div>

                                <div>
                                    <label className="block text-[13px] font-medium text-gray-700 mb-2">Global LLM Personality & Instruction Override</label>
                                    <p className="text-[12px] text-gray-500 mb-2">High-level instructions appended to every AI interview system prompt.</p>
                                    <textarea
                                        value={personalityNote}
                                        onChange={(e) => setPersonalityNote(e.target.value)}
                                        placeholder="e.g. You are an expert technical interviewer at a leading SaaS company. Always maintain a professional tone. Prioritize problem-solving ability over rote memorization."
                                        className="w-full h-[120px] p-3 text-[14px] text-gray-700 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 resize-y"
                                    />
                                </div>

                                <div className="flex justify-end mt-6">
                                    <Button className="bg-[#6366F1] hover:bg-[#5558DD] text-white rounded-full px-6" onClick={handleSavePipeline}>
                                        Save Pipeline Configuration
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </div>

            {/* Change Password Modal */}
            <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Password</DialogTitle>
                        <DialogDescription>Update your account password securely.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="oldPassword">Current Password</Label>
                            <Input id="oldPassword" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Current password" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">New Password</Label>
                            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm New Password</Label>
                            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleChangePassword} disabled={isChangingPassword} className="bg-[#6366F1] hover:bg-[#5558DD] text-white">
                            {isChangingPassword ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : 'Update Password'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
