import React, { useState } from 'react';
import { Users, Trash2, ArrowRightLeft, UserX } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '../../ui/dialog';
import { api } from '../../../services/api';

interface Group {
  id: string;
  name: string;
  candidate_count?: number;
  candidateCount?: number;
}

interface GroupDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  groupId: string;
  groupName: string;
  candidateCount: number;
  availableGroups: Group[];
}

export function GroupDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  groupId,
  groupName,
  candidateCount,
  availableGroups
}: GroupDeleteModalProps) {
  const [action, setAction] = useState<'release' | 'reject' | 'transfer'>('release');
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (action === 'transfer' && !targetGroupId) {
      alert('Please select a target group for transfer.');
      return;
    }
    
    setIsDeleting(true);
    try {
      await api.recruiter.deleteGroup(groupId, action, action === 'transfer' ? targetGroupId : undefined);
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Failed to delete group:', error);
      alert('Failed to delete group. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-[24px] border-none shadow-2xl">
        <div className="bg-white">
          {/* Warning Header */}
          <div className="bg-red-50 px-6 py-8 flex flex-col items-center text-center border-b border-red-100">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Trash2 className="text-red-600" size={28} />
            </div>
            <DialogTitle className="font-['Arimo',sans-serif] text-[24px] font-bold text-red-800 mb-2">
              Archive Group?
            </DialogTitle>
            <DialogDescription className="font-['Arimo',sans-serif] text-[15px] text-red-700 max-w-[360px]">
              You are about to archive <strong>{groupName}</strong>. This group contains <strong>{candidateCount}</strong> candidates.
            </DialogDescription>
          </div>

          {/* Options Body */}
          <div className="px-6 py-6 space-y-4">
            <p className="font-['Arimo',sans-serif] text-[14px] font-bold text-slate-700 uppercase tracking-wider mb-2">
              Choose Candidate Action
            </p>
            
            {/* Release Option */}
            <div 
              onClick={() => setAction('release')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                action === 'release' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 bg-slate-50'
              }`}
            >
              <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                action === 'release' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
              }`}>
                {action === 'release' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Users size={16} className={action === 'release' ? 'text-indigo-600' : 'text-slate-500'} />
                  <p className="font-['Arimo',sans-serif] text-[15px] font-bold text-slate-800">Move to Unassigned Pool</p>
                </div>
                <p className="font-['Arimo',sans-serif] text-[13px] text-slate-500">Candidates remain active but are unlinked from this specific group.</p>
              </div>
            </div>

            {/* Transfer Option */}
            <div 
              onClick={() => setAction('transfer')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col gap-3 ${
                action === 'transfer' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  action === 'transfer' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                }`}>
                  {action === 'transfer' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowRightLeft size={16} className={action === 'transfer' ? 'text-indigo-600' : 'text-slate-500'} />
                    <p className="font-['Arimo',sans-serif] text-[15px] font-bold text-slate-800">Transfer to Another Group</p>
                  </div>
                  <p className="font-['Arimo',sans-serif] text-[13px] text-slate-500">Move all candidates to a different active group pipeline.</p>
                </div>
              </div>
              
              {action === 'transfer' && (
                <select 
                  className="w-full h-[40px] px-3 rounded-lg border border-slate-200 bg-white font-['Arimo',sans-serif] text-[14px] focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  value={targetGroupId}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="" disabled>Select target group...</option>
                  {availableGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.candidateCount || g.candidate_count || 0} cand.)</option>
                  ))}
                </select>
              )}
            </div>

            {/* Reject Option */}
            <div 
              onClick={() => setAction('reject')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                action === 'reject' ? 'border-red-600 bg-red-50' : 'border-slate-100 hover:border-slate-200 bg-slate-50'
              }`}
            >
              <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                action === 'reject' ? 'border-red-600 bg-red-600' : 'border-slate-300'
              }`}>
                {action === 'reject' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <UserX size={16} className={action === 'reject' ? 'text-red-600' : 'text-slate-500'} />
                  <p className="font-['Arimo',sans-serif] text-[15px] font-bold text-slate-800">Bulk Reject Candidates</p>
                </div>
                <p className="font-['Arimo',sans-serif] text-[13px] text-slate-500">Mark all candidates as 'Rejected' and remove from pipeline.</p>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-6 bg-slate-50 flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 h-[48px] rounded-xl font-['Arimo',sans-serif] text-[15px] font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleConfirm}
              disabled={isDeleting || (action === 'transfer' && !targetGroupId)}
              className={`flex-1 h-[48px] rounded-xl font-['Arimo',sans-serif] text-[15px] font-semibold text-white transition-all shadow-lg ${
                action === 'reject' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isDeleting ? 'Archiving...' : 'Confirm Archival'}
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
