import { AlertTriangle, RefreshCw, X, CheckCircle } from 'lucide-react';

interface EmptyStateProps {
  onBroadenFilters: () => void;
  onLoadSavedFilter: (filterName: string) => void;
  suggestedFilters?: string[];
}

export function EmptyFilterResults({
  onBroadenFilters,
  onLoadSavedFilter,
  suggestedFilters = [
    'Senior Developers (Remote)',
    'Mid-Level Engineers',
    'All Active Candidates'
  ]
}: EmptyStateProps) {

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div className="w-[80px] h-[80px] rounded-full bg-[#f3f4f6] flex items-center justify-center mb-6">
        <AlertTriangle size={36} className="text-[#6b7280]" />
      </div>
      <h3 className="text-[#111827] text-[20px] mb-2">
        No Candidates Found
      </h3>
      <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] text-center max-w-[400px] mb-6">
        Your current filter combination returned zero candidates. Try broadening your criteria or use a saved filter.
      </p>
      <div className="flex gap-3 mb-6">
        <button
          onClick={onBroadenFilters}
          className="h-[44px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white font-['Arimo',sans-serif] text-[14px] transition-colors"
        >
          Broaden Filters
        </button>
        <button
          onClick={() => { }}
          className="h-[44px] px-[24px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] text-[#374151] font-['Arimo',sans-serif] text-[14px] transition-colors"
        >
          Clear All Filters
        </button>
      </div>
      <div className="w-full max-w-[400px]">
        <div className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-3">
          Suggested Saved Filters:
        </div>
        <div className="space-y-2">
          {suggestedFilters.map((filter, index) => (
            <button
              key={index}
              onClick={() => onLoadSavedFilter(filter)}
              className="w-full h-[40px] px-[16px] rounded-[8px] bg-[#f9fafb] hover:bg-[#f3f4f6] border border-[#e5e7eb] text-left font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CandidateOverlapWarningProps {
  candidateName: string;
  existingGroups: string[];
  onOverride: () => void;
  onCancel: () => void;
}

export function CandidateOverlapWarning({
  candidateName,
  existingGroups,
  onOverride,
  onCancel
}: CandidateOverlapWarningProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[500px] p-6 animate-scaleIn">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-[48px] h-[48px] rounded-full bg-[#fef3c7] flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={24} className="text-[#f59e0b]" />
          </div>
          <div className="flex-1">
            <h3 className="text-[#111827] text-[18px] mb-2">
              Candidate Already in Groups
            </h3>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-3">
              <span className="text-[#111827]">{candidateName}</span> is already part of the following groups:
            </p>
            <div className="space-y-2 mb-4">
              {existingGroups.map((group, index) => (
                <div
                  key={index}
                  className="px-[12px] py-[8px] bg-[#f9fafb] rounded-[6px] border border-[#e5e7eb]"
                >
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                    {group}
                  </span>
                </div>
              ))}
            </div>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
              Adding them to this group will create duplicate assignments. Do you want to continue?
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onOverride}
            className="flex-1 h-[44px] rounded-[8px] bg-[#f59e0b] hover:bg-[#d97706] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
          >
            Override & Add
          </button>
        </div>
      </div>
    </div>
  );
}

interface PartialActionFailureProps {
  totalAttempted: number;
  failedCount: number;
  failedCandidates: Array<{ name: string; reason: string }>;
  onRetry: (candidateNames: string[]) => void;
  onClose: () => void;
}

export function PartialActionFailure({
  totalAttempted,
  failedCount,
  failedCandidates,
  onRetry,
  onClose
}: PartialActionFailureProps) {
  const successCount = totalAttempted - failedCount;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-[40px] h-[40px] rounded-full bg-[#fef3c7] flex items-center justify-center">
                <AlertTriangle size={20} className="text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-[#111827] text-[18px]">
                  Partial Action Failure
                </h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  {failedCount} of {totalAttempted} actions failed
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
            >
              <X size={18} className="text-[#6b7280]" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-[#f9fafb] border-b border-[#e5e7eb]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-[#10b981]" />
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                {successCount} succeeded
              </span>
            </div>
            <div className="w-[1px] h-[20px] bg-[#e5e7eb]" />
            <div className="flex items-center gap-2">
              <X size={18} className="text-[#ef4444]" />
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                {failedCount} failed
              </span>
            </div>
          </div>
        </div>

        {/* Failed Candidates List */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="space-y-3">
            {failedCandidates.map((candidate, index) => (
              <div
                key={index}
                className="p-4 bg-[#fef2f2] border border-[#fecaca] rounded-[8px]"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    {candidate.name}
                  </div>
                  <button
                    onClick={() => onRetry([candidate.name])}
                    className="flex items-center gap-1 h-[28px] px-[10px] rounded-[6px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] transition-colors"
                  >
                    <RefreshCw size={12} className="text-[#6b7280]" />
                    <span className="font-['Arimo',sans-serif] text-[11px] text-[#374151]">
                      Retry
                    </span>
                  </button>
                </div>
                <div className="font-['Arimo',sans-serif] text-[12px] text-[#ef4444]">
                  Error: {candidate.reason}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => onRetry(failedCandidates.map(c => c.name))}
            className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} />
            Retry All Failed
          </button>
        </div>
      </div>
    </div>
  );
}

interface MissingKGDataProps {
  candidateName: string;
  onRequestSync: () => void;
  onClose: () => void;
}

export function MissingKGData({ candidateName, onRequestSync, onClose }: MissingKGDataProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-8">
      <div className="w-[80px] h-[80px] rounded-full bg-[#f3f4f6] flex items-center justify-center mb-6">
        <RefreshCw size={36} className="text-[#6b7280]" />
      </div>
      <h3 className="text-[#111827] text-[20px] mb-2">
        Knowledge Graph Data Missing
      </h3>
      <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] text-center max-w-[400px] mb-6">
        Knowledge graph data for <span className="text-[#111827]">{candidateName}</span> is incomplete or not yet synchronized.
      </p>
      <button
        onClick={onRequestSync}
        className="h-[44px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white font-['Arimo',sans-serif] text-[14px] transition-colors flex items-center gap-2"
      >
        <RefreshCw size={16} />
        Request Full Sync
      </button>
      <div className="mt-6 px-4 py-3 bg-[#f9fafb] rounded-[8px] border border-[#e5e7eb] max-w-[400px]">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-[16px] h-[16px] border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
          <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
            Sync in progress...
          </span>
        </div>
        <div className="w-full h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
          <div className="h-full bg-[#6366f1] w-[60%] transition-all" />
        </div>
      </div>
    </div>
  );
}

export function CandidateWithdrawnOverlay({ candidateName, onReplace, onArchive }: {
  candidateName: string;
  onReplace: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="p-4 bg-[#fef3c7] border border-[#fbbf24] rounded-[8px] flex items-start gap-3">
      <AlertTriangle size={20} className="text-[#f59e0b] flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-['Arimo',sans-serif] text-[14px] text-[#92400e] mb-2">
          <span className="font-medium">{candidateName}</span> has withdrawn from the process
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReplace}
            className="h-[32px] px-[12px] rounded-[6px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
          >
            Replace Candidate
          </button>
          <button
            onClick={onArchive}
            className="h-[32px] px-[12px] rounded-[6px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
          >
            Archive from Group
          </button>
        </div>
      </div>
    </div>
  );
}

<style>{`
  @keyframes scaleIn {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .animate-scaleIn {
    animation: scaleIn 200ms ease-out;
  }
`}</style>
