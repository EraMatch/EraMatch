import { useState, useMemo } from 'react';
import {
    ChevronLeft, CheckCircle, Send, Download, Mail, AlertCircle,
    Users, Award, BarChart3, FileText, TrendingUp, Flag, Eye,
    ArrowRight, Shield, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ───────────────────────────────────────────────────────────

interface CandidateJourney {
    id: number;
    name: string;
    avatar: string;
    email: string;
    phone: string;
    assessmentScore: number;
    aiInterviewScore: number;
    liveInterviewScore?: number;
    flags: string[];
    meetsCriteria?: boolean;
    technicalVerdict?: 'pass' | 'fail' | 'conditional';
    progressionState?: string;
    overrideApplied?: boolean;
}

interface StageInfo {
    id: string;
    name: string;
}

interface FinalDecisionPageProps {
    groupName: string;
    positionTitle: string;
    candidates: CandidateJourney[];
    stages: StageInfo[];
    onBack: () => void;
    onSendOffers: (selectedCandidateIds: number[], emailContent: string) => void;
    onExportContacts: (selectedCandidateIds: number[]) => void;
}

// ─── Component ───────────────────────────────────────────────────────

export function FinalDecisionPage({
    groupName,
    positionTitle,
    candidates,
    stages,
    onBack,
    onSendOffers,
    onExportContacts
}: FinalDecisionPageProps) {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [emailSubject, setEmailSubject] = useState(`Offer for ${positionTitle} Position`);
    const [emailBody, setEmailBody] = useState(`Dear [Candidate Name],

We are pleased to inform you that you have been selected for the ${positionTitle} position at our organization.

After careful review of your qualifications and performance throughout the recruitment process, we believe you would be an excellent fit for our team.

We would like to extend a formal offer to you. Please find the details attached.

We look forward to welcoming you to our team!

Best regards,
[Your Company Name]`);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [actionType, setActionType] = useState<'send' | 'export' | null>(null);
    const [activeTab, setActiveTab] = useState<'selection' | 'email'>('selection');

    // ─── Helpers ─────────────────────────────────────────────────────

    const toggleCandidate = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedIds.length === candidates.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(candidates.map(c => c.id));
        }
    };

    const selectedCandidatesData = candidates.filter(c => selectedIds.includes(c.id));

    const avgFinalScore = selectedCandidatesData.length > 0
        ? Math.round(selectedCandidatesData.reduce((sum, c) => sum + c.assessmentScore, 0) / selectedCandidatesData.length)
        : 0;

    const getStageScore = (candidate: CandidateJourney, stageId: string) => {
        if (stageId === 'assessment') return candidate.assessmentScore;
        if (stageId === 'ai-interview') return candidate.aiInterviewScore;
        if (stageId === 'live-interview') return candidate.liveInterviewScore || 0;
        return 0;
    };

    const handleSendOffers = () => {
        setActionType('send');
        setShowConfirmation(true);
    };

    const handleExportContacts = () => {
        setActionType('export');
        setShowConfirmation(true);
    };

    const confirmAction = () => {
        if (actionType === 'send') {
            onSendOffers(selectedIds, emailBody);
        } else if (actionType === 'export') {
            onExportContacts(selectedIds);
        }
        setShowConfirmation(false);
        setActionType(null);
    };

    // ─── Render ──────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col">
            {/* ═══ HEADER ═══ */}
            <div className="bg-white border-b border-[#e5e7eb] px-8 py-5">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 mb-3 font-['Arimo',sans-serif] text-[14px] text-[#6366f1] hover:underline"
                >
                    <ChevronLeft size={16} />
                    Back to Group Overview
                </button>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-[10px]">
                                <CheckCircle size={24} className="text-emerald-600" />
                            </div>
                            <div>
                                <h1 className="text-[22px] font-bold text-[#111827]">Final Decision — Send Offers</h1>
                                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                                    Group: <span className="font-semibold text-[#374151]">{groupName}</span> • Position: <span className="font-semibold text-[#374151]">{positionTitle}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ CONTENT ═══ */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto px-8 py-6 space-y-6">

                    {/* ─── Stats Summary Cards ─── */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-[16px] border-2 border-indigo-200">
                            <div className="text-[12px] text-indigo-700 mb-1 font-medium">Total Candidates</div>
                            <div className="text-[32px] font-bold text-indigo-900">{candidates.length}</div>
                        </div>
                        <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[16px] border-2 border-emerald-200">
                            <div className="text-[12px] text-emerald-700 mb-1 font-medium">Selected for Offer</div>
                            <div className="text-[32px] font-bold text-emerald-900">{selectedIds.length}</div>
                        </div>
                        <div className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 rounded-[16px] border-2 border-purple-200">
                            <div className="text-[12px] text-purple-700 mb-1 font-medium">Avg. Final Score</div>
                            <div className="text-[32px] font-bold text-purple-900">{avgFinalScore || '—'}</div>
                        </div>
                        <div className="p-5 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-[16px] border-2 border-amber-200">
                            <div className="text-[12px] text-amber-700 mb-1 font-medium">Pipeline Stages</div>
                            <div className="text-[32px] font-bold text-amber-900">{stages.length}</div>
                        </div>
                    </div>

                    {/* ─── Tabs ─── */}
                    <div className="flex gap-1 bg-[#f1f5f9] rounded-[10px] p-1">
                        <button
                            onClick={() => setActiveTab('selection')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] text-[13px] font-medium transition-all ${activeTab === 'selection'
                                    ? 'bg-white text-[#111827] shadow-sm'
                                    : 'text-[#6b7280] hover:text-[#374151]'
                                }`}
                        >
                            <Users size={16} />
                            Candidate Selection & Journey
                        </button>
                        <button
                            onClick={() => setActiveTab('email')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] text-[13px] font-medium transition-all ${activeTab === 'email'
                                    ? 'bg-white text-[#111827] shadow-sm'
                                    : 'text-[#6b7280] hover:text-[#374151]'
                                }`}
                        >
                            <Mail size={16} />
                            Compose Offer Email
                            {selectedIds.length > 0 && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[11px]">
                                    {selectedIds.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* ─── Tab: Candidate Selection ─── */}
                    {activeTab === 'selection' && (
                        <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden">
                            <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
                                <h3 className="text-[15px] font-semibold text-[#111827] flex items-center gap-2">
                                    <Award size={18} className="text-indigo-600" />
                                    Candidate Journey Overview
                                </h3>
                                <button
                                    onClick={toggleAll}
                                    className="px-4 py-1.5 rounded-[6px] border border-[#e5e7eb] text-[12px] text-[#374151] hover:bg-[#f9fafb] transition-colors"
                                >
                                    {selectedIds.length === candidates.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                        <tr>
                                            <th className="p-4 text-left w-12">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.length === candidates.length && candidates.length > 0}
                                                    onChange={toggleAll}
                                                    className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                                                />
                                            </th>
                                            <th className="p-4 text-left">
                                                <span className="text-[12px] text-[#6b7280] font-semibold">Candidate</span>
                                            </th>
                                            <th className="p-4 text-left">
                                                <span className="text-[12px] text-[#6b7280] font-semibold">Email</span>
                                            </th>
                                            <th className="p-4 text-left">
                                                <span className="text-[12px] text-[#6b7280] font-semibold">Phone</span>
                                            </th>
                                            {stages.map(stage => (
                                                <th key={stage.id} className="p-4 text-center">
                                                    <span className="text-[12px] text-[#6b7280] font-semibold">{stage.name}</span>
                                                </th>
                                            ))}
                                            <th className="p-4 text-center">
                                                <span className="text-[12px] text-[#6b7280] font-semibold">Flags</span>
                                            </th>
                                            <th className="p-4 text-center">
                                                <span className="text-[12px] text-[#6b7280] font-semibold">Verdict</span>
                                            </th>
                                            <th className="p-4 text-center">
                                                <span className="text-[12px] text-[#6b7280] font-semibold">Request Verdict</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {candidates.map(candidate => {
                                            const isSelected = selectedIds.includes(candidate.id);
                                            return (
                                                <tr
                                                    key={candidate.id}
                                                    className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors ${isSelected ? 'bg-indigo-50/50' : ''
                                                        }`}
                                                >
                                                    <td className="p-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleCandidate(candidate.id)}
                                                            className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                                                        />
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-[36px] h-[36px] rounded-full bg-[#ede9fe] flex items-center justify-center flex-shrink-0">
                                                                <span className="font-semibold text-[12px] text-[#6366f1]">{candidate.avatar}</span>
                                                            </div>
                                                            <span className="font-semibold text-[13px] text-[#111827]">{candidate.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-[12px] text-[#374151]">{candidate.email}</td>
                                                    <td className="p-4 text-[12px] text-[#374151]">{candidate.phone}</td>
                                                    {stages.map(stage => {
                                                        const score = getStageScore(candidate, stage.id);
                                                        return (
                                                            <td key={stage.id} className="p-4 text-center">
                                                                <div className={`text-[14px] font-bold ${score >= 80 ? 'text-emerald-600' :
                                                                        score >= 60 ? 'text-amber-600' :
                                                                            score > 0 ? 'text-red-600' : 'text-[#9ca3af]'
                                                                    }`}>
                                                                    {score > 0 ? `${score}%` : '—'}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="p-4 text-center">
                                                        {candidate.flags.length > 0 ? (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <Flag size={13} className="text-red-500" />
                                                                <span className="text-[11px] text-red-600">{candidate.flags.length}</span>
                                                            </div>
                                                        ) : (
                                                            <CheckCircle size={15} className="text-emerald-400 mx-auto" />
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {candidate.technicalVerdict ? (
                                                            <span className={`px-2.5 py-1 text-[11px] rounded-full font-medium ${candidate.technicalVerdict === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                                                                    candidate.technicalVerdict === 'conditional' ? 'bg-amber-100 text-amber-700' :
                                                                        'bg-red-100 text-red-700'
                                                                }`}>
                                                                {candidate.technicalVerdict}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-[#9ca3af]">—</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${candidate.meetsCriteria ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {candidate.meetsCriteria ? 'Pass' : 'Pending'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {candidates.length === 0 && (
                                            <tr>
                                                <td colSpan={7 + stages.length} className="p-12 text-center text-[#6b7280]">
                                                    <Users size={36} className="mx-auto mb-3 opacity-30" />
                                                    <p className="text-[14px]">No candidates have reached the final decision stage</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ─── Tab: Email Composer ─── */}
                    {activeTab === 'email' && (
                        <div className="space-y-6">
                            {selectedIds.length === 0 ? (
                                <div className="bg-white rounded-[16px] border-2 border-dashed border-[#e5e7eb] p-12 text-center">
                                    <Users size={40} className="mx-auto mb-3 text-[#9ca3af]" />
                                    <p className="text-[14px] text-[#6b7280] font-medium">Select candidates first</p>
                                    <p className="text-[12px] text-[#9ca3af] mt-1">
                                        Go to the "Candidate Selection" tab and select candidates to receive offers
                                    </p>
                                    <button
                                        onClick={() => setActiveTab('selection')}
                                        className="mt-4 px-4 py-2 rounded-[8px] bg-[#6366f1] text-white text-[13px] hover:bg-[#5558e3] transition-colors"
                                    >
                                        Go to Selection
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-white rounded-[16px] border-2 border-indigo-200 p-6">
                                    {/* Selected summary */}
                                    <div className="mb-6 p-4 bg-indigo-50 rounded-[12px]">
                                        <div className="text-[12px] text-indigo-700 mb-2 font-medium">
                                            Sending to {selectedIds.length} candidate{selectedIds.length !== 1 ? 's' : ''}:
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedCandidatesData.map(c => (
                                                <span key={c.id} className="px-3 py-1 bg-white border border-indigo-200 rounded-full text-[12px] text-indigo-700 flex items-center gap-1.5">
                                                    <CheckCircle size={12} className="text-emerald-500" />
                                                    {c.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <h3 className="text-[15px] font-semibold text-[#111827] mb-4 flex items-center gap-2">
                                        <Mail size={18} className="text-indigo-600" />
                                        Compose Offer Email
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">Email Subject</label>
                                            <input
                                                type="text"
                                                value={emailSubject}
                                                onChange={(e) => setEmailSubject(e.target.value)}
                                                className="w-full h-[40px] px-4 rounded-[8px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                                                placeholder="Enter email subject..."
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">Email Body</label>
                                            <textarea
                                                value={emailBody}
                                                onChange={(e) => setEmailBody(e.target.value)}
                                                rows={14}
                                                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] text-[13px] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                                                placeholder="Compose your offer email..."
                                            />
                                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#6b7280]">
                                                <AlertCircle size={12} />
                                                Use [Candidate Name] as a placeholder — it will be replaced automatically for each candidate
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ FOOTER ACTION BAR ═══ */}
            <div className="bg-white border-t border-[#e5e7eb] px-8 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-50 rounded-[8px]">
                            <CheckCircle size={20} className="text-emerald-600" />
                        </div>
                        <div>
                            <div className="text-[13px] font-semibold text-[#111827]">
                                {selectedIds.length > 0
                                    ? `${selectedIds.length} candidate${selectedIds.length !== 1 ? 's' : ''} selected for offer`
                                    : 'Select candidates to send offers'}
                            </div>
                            <div className="text-[12px] text-[#6b7280]">
                                Review selection and compose offer email before sending
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExportContacts}
                            disabled={selectedIds.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] border-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Download size={16} />
                            Export Contacts
                        </button>
                        <button
                            onClick={handleSendOffers}
                            disabled={selectedIds.length === 0}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-[8px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                        >
                            <Send size={16} />
                            Send Offers to {selectedIds.length} Candidate{selectedIds.length !== 1 ? 's' : ''}
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ CONFIRMATION OVERLAY ═══ */}
            <AnimatePresence>
                {showConfirmation && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-[16px] shadow-2xl max-w-md w-full p-8"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-amber-100 rounded-full">
                                    <AlertCircle size={22} className="text-amber-600" />
                                </div>
                                <h3 className="text-[18px] font-bold text-[#111827]">Confirm Action</h3>
                            </div>

                            <p className="text-[14px] text-[#374151] mb-4">
                                {actionType === 'send' ? (
                                    <>
                                        You are about to send offer emails to <span className="font-bold text-indigo-600">{selectedIds.length}</span> candidate{selectedIds.length !== 1 ? 's' : ''}.
                                        <br /><br />
                                        Subject: <span className="font-semibold">"{emailSubject}"</span>
                                    </>
                                ) : (
                                    <>
                                        You are about to export contact details for <span className="font-bold text-indigo-600">{selectedIds.length}</span> candidate{selectedIds.length !== 1 ? 's' : ''}.
                                        <br /><br />
                                        A CSV file will be downloaded.
                                    </>
                                )}
                            </p>

                            <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-4 mb-6">
                                <div className="text-[12px] font-semibold text-[#374151] mb-2">Selected Candidates:</div>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {selectedCandidatesData.map(c => (
                                        <div key={c.id} className="text-[12px] text-[#6b7280] flex items-center gap-2">
                                            <CheckCircle size={13} className="text-emerald-600" />
                                            {c.name}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="flex-1 px-4 py-2.5 rounded-[8px] border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f9fafb] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmAction}
                                    className="flex-1 px-4 py-2.5 rounded-[8px] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-[13px] font-semibold transition-colors"
                                >
                                    {actionType === 'send' ? 'Send Offers' : 'Export Contacts'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
