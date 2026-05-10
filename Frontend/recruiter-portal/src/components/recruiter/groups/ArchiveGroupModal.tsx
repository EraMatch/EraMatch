import { useState } from 'react';
import { Archive, Mail, X, Loader2, AlertTriangle } from 'lucide-react';

interface ArchiveGroupModalProps {
    groupName: string;
    nonRejectedCount: number;
    onConfirm: (sendRejections: boolean) => Promise<void>;
    onClose: () => void;
}

export function ArchiveGroupModal({ groupName, nonRejectedCount, onConfirm, onClose }: ArchiveGroupModalProps) {
    const [sendRejections, setSendRejections] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            await onConfirm(sendRejections);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[480px]">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-[#e5e7eb]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[8px] bg-[#fef3c7] flex items-center justify-center">
                            <Archive size={20} className="text-[#d97706]" />
                        </div>
                        <div>
                            <h2 className="text-[16px] font-semibold text-[#111827]">Archive Group</h2>
                            <p className="text-[12px] text-[#6b7280] font-['Arimo',sans-serif]">{groupName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-[#9ca3af] hover:text-[#374151] transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <p className="text-[13px] text-[#374151] font-['Arimo',sans-serif]">
                        All pipeline stages are closed. Choose what happens to candidates before archiving.
                    </p>

                    {/* Option 1 — Reject non-passed */}
                    <button
                        onClick={() => setSendRejections(true)}
                        className={`w-full text-left p-4 rounded-[8px] border-2 transition-all ${
                            sendRejections
                                ? 'border-[#ef4444] bg-[#fef2f2]'
                                : 'border-[#e5e7eb] hover:border-[#d1d5db]'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                                sendRejections ? 'border-[#ef4444] bg-[#ef4444]' : 'border-[#d1d5db]'
                            }`}>
                                {sendRejections && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <Mail size={14} className={sendRejections ? 'text-[#ef4444]' : 'text-[#6b7280]'} />
                                    <span className="text-[13px] font-medium text-[#111827]">Send rejection emails</span>
                                </div>
                                <p className="text-[12px] text-[#6b7280] font-['Arimo',sans-serif] mt-1">
                                    Notify <strong>{nonRejectedCount}</strong> candidate{nonRejectedCount !== 1 ? 's' : ''} that the position has been filled.
                                    Candidates already rejected mid-pipeline are skipped automatically.
                                </p>
                            </div>
                        </div>
                    </button>

                    {/* Option 2 — Archive only */}
                    <button
                        onClick={() => setSendRejections(false)}
                        className={`w-full text-left p-4 rounded-[8px] border-2 transition-all ${
                            !sendRejections
                                ? 'border-[#6366f1] bg-[#eef2ff]'
                                : 'border-[#e5e7eb] hover:border-[#d1d5db]'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                                !sendRejections ? 'border-[#6366f1] bg-[#6366f1]' : 'border-[#d1d5db]'
                            }`}>
                                {!sendRejections && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <Archive size={14} className={!sendRejections ? 'text-[#6366f1]' : 'text-[#6b7280]'} />
                                    <span className="text-[13px] font-medium text-[#111827]">Archive only</span>
                                </div>
                                <p className="text-[12px] text-[#6b7280] font-['Arimo',sans-serif] mt-1">
                                    Archive the group without sending any notifications to candidates.
                                </p>
                            </div>
                        </div>
                    </button>

                    <div className="flex items-start gap-2 bg-[#fffbeb] border border-[#fde68a] rounded-[6px] p-3">
                        <AlertTriangle size={14} className="text-[#d97706] mt-0.5 flex-shrink-0" />
                        <p className="text-[12px] text-[#92400e] font-['Arimo',sans-serif]">
                            This action cannot be undone. The group will be archived and removed from your active pipeline.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5e7eb]">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-[13px] font-medium text-[#374151] border border-[#e5e7eb] rounded-[6px] hover:bg-[#f9fafb] transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-white rounded-[6px] transition-colors disabled:opacity-50 ${
                            sendRejections
                                ? 'bg-[#ef4444] hover:bg-[#dc2626]'
                                : 'bg-[#6366f1] hover:bg-[#5558e3]'
                        }`}
                    >
                        {isLoading ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Archive size={14} />
                        )}
                        {isLoading
                            ? 'Archiving…'
                            : sendRejections
                                ? 'Send Rejections & Archive'
                                : 'Archive Group'}
                    </button>
                </div>
            </div>
        </div>
    );
}
