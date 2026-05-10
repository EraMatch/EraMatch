import { useState } from 'react';
import { X, AlertTriangle, UserCheck, UserX, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { useResolveHeldCandidates } from '../../../hooks/groups/useGroups';

interface HeldCandidate {
  application_id: string;
  name: string;
  score?: number | null;
  heldFromStage?: string;
}

interface HoldReviewModalProps {
  groupId: string;
  heldCandidates: HeldCandidate[];
  hasActiveStage: boolean;
  onClose: () => void;
  onResolved: () => void;
}

type CandidateAction = 'reject' | 'reactivate' | 'skip';

export function HoldReviewModal({
  groupId,
  heldCandidates,
  hasActiveStage,
  onClose,
  onResolved,
}: HoldReviewModalProps) {
  const [actions, setActions] = useState<Record<string, CandidateAction>>(
    Object.fromEntries(heldCandidates.map(c => [c.application_id, 'skip']))
  );

  const resolveMutation = useResolveHeldCandidates();

  const setAction = (applicationId: string, action: CandidateAction) => {
    setActions(prev => ({ ...prev, [applicationId]: action }));
  };

  const handleApply = async () => {
    const resolveActions = Object.entries(actions)
      .filter(([, action]) => action !== 'skip')
      .map(([application_id, action]) => ({ application_id, action: action as 'reject' | 'reactivate' }));

    if (resolveActions.length === 0) {
      onClose();
      return;
    }

    await resolveMutation.mutateAsync({ groupId, actions: resolveActions });
    onResolved();
    onClose();
  };

  const activeCount = Object.values(actions).filter(a => a !== 'skip').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb] bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
                <AlertTriangle size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-[#111827]">Review On-Hold Candidates</h2>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mt-0.5">
                  {heldCandidates.length} candidate{heldCandidates.length !== 1 ? 's' : ''} currently on hold
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-amber-100 transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>
        </div>

        {/* Info banner */}
        {!hasActiveStage && (
          <div className="mx-8 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-[8px]">
            <p className="font-['Arimo',sans-serif] text-[13px] text-blue-700">
              No stage is currently active. Start a stage first to reactivate candidates.
            </p>
          </div>
        )}

        {/* Candidate List */}
        <div className="flex-1 overflow-auto px-8 py-4 space-y-3">
          {heldCandidates.map(candidate => (
            <div
              key={candidate.application_id}
              className="flex items-center gap-4 p-4 rounded-[10px] border border-[#e5e7eb] bg-white"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center text-white font-medium text-[14px] flex-shrink-0">
                {candidate.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-['Arimo',sans-serif] text-[14px] font-medium text-[#111827] truncate">
                  {candidate.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {candidate.score !== null && candidate.score !== undefined && (
                    <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      Score: <span className="font-semibold">{Math.round(candidate.score)}</span>
                    </span>
                  )}
                  {candidate.heldFromStage && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-[4px] text-[11px]">
                      Held from {candidate.heldFromStage}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setAction(candidate.application_id, actions[candidate.application_id] === 'reject' ? 'skip' : 'reject')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                    actions[candidate.application_id] === 'reject'
                      ? 'bg-red-500 text-white'
                      : 'bg-white border border-[#e5e7eb] text-[#374151] hover:border-red-300 hover:bg-red-50'
                  }`}
                >
                  <UserX size={14} />
                  Reject
                </button>
                <button
                  onClick={() => {
                    if (!hasActiveStage) return;
                    setAction(candidate.application_id, actions[candidate.application_id] === 'reactivate' ? 'skip' : 'reactivate');
                  }}
                  disabled={!hasActiveStage}
                  title={!hasActiveStage ? 'Start a stage first to reactivate' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                    actions[candidate.application_id] === 'reactivate'
                      ? 'bg-emerald-500 text-white'
                      : !hasActiveStage
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white border border-[#e5e7eb] text-[#374151] hover:border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  <UserCheck size={14} />
                  Reactivate
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb] bg-gray-50 flex items-center justify-between gap-3">
          <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
            {activeCount > 0
              ? `${activeCount} action${activeCount !== 1 ? 's' : ''} selected`
              : 'No actions selected — click Apply to dismiss'}
          </p>
          <div className="flex gap-3">
            <Button onClick={onClose} variant="outline" className="h-11 px-6">
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={resolveMutation.isPending}
              className="h-11 px-6 bg-[#111827] hover:bg-[#374151]"
            >
              {resolveMutation.isPending ? (
                <><Loader2 size={16} className="inline mr-2 animate-spin" />Applying...</>
              ) : activeCount > 0 ? (
                `Apply ${activeCount} Action${activeCount !== 1 ? 's' : ''}`
              ) : (
                'Dismiss'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
