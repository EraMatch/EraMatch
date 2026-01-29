import { CheckCircle2, AlertCircle, Lock, TrendingUp, Users, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { useState } from 'react';

interface CompleteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (completionData: ProjectCompletionData) => void;
  projectTitle: string;
  projectStats: {
    totalPositions: number;
    filledPositions: number;
    cancelledPositions: number;
    totalCandidates: number;
    selectedCandidates: number;
  };
}

export interface ProjectCompletionData {
  completionDate: string;
  summaryNotes: string;
  analyticsSnapshot: any; // Will contain frozen analytics data
}

export function CompleteProjectModal({
  isOpen,
  onClose,
  onConfirm,
  projectTitle,
  projectStats
}: CompleteProjectModalProps) {
  const [summaryNotes, setSummaryNotes] = useState('');

  const allPositionsClosed = 
    projectStats.filledPositions + projectStats.cancelledPositions === projectStats.totalPositions;

  const handleConfirm = () => {
    const completionData: ProjectCompletionData = {
      completionDate: new Date().toISOString(),
      summaryNotes: summaryNotes.trim(),
      analyticsSnapshot: {} // This would capture all analytics data in real implementation
    };

    onConfirm(completionData);
    setSummaryNotes('');
    onClose();
  };

  const handleClose = () => {
    setSummaryNotes('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-[40px] h-[40px] rounded-full bg-[#dbeafe] flex items-center justify-center">
              <CheckCircle2 size={20} className="text-[#3b82f6]" />
            </div>
            <DialogTitle className="font-['Arimo',sans-serif] text-[20px] text-black">
              Complete Project
            </DialogTitle>
          </div>
          <DialogDescription className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] leading-[20px]">
            Mark <span className="text-black font-medium">"{projectTitle}"</span> as complete. 
            All analytics and data will be frozen at this point.
          </DialogDescription>
        </DialogHeader>

        {/* Warning if not all positions closed */}
        {!allPositionsClosed && (
          <div className="bg-[#fef3c7] border border-[#fcd34d] rounded-[10px] p-[16px]">
            <div className="flex gap-[12px]">
              <AlertCircle size={18} className="text-[#f59e0b] shrink-0 mt-[2px]" />
              <div>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#92400e] font-medium mb-[4px]">
                  Not all positions are closed
                </p>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#92400e] leading-[18px]">
                  Some positions are still open. We recommend closing all positions before completing the project.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Project Statistics Summary */}
        <div className="bg-[#f9fafb] rounded-[10px] p-[20px]">
          <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-[16px]">
            Final Project Statistics:
          </p>

          <div className="grid grid-cols-2 gap-[16px]">
            {/* Total Positions */}
            <div className="space-y-[6px]">
              <div className="flex items-center gap-[8px]">
                <Target size={14} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af]">
                  Total Positions
                </span>
              </div>
              <p className="font-['Arimo',sans-serif] text-[20px] font-semibold text-black">
                {projectStats.totalPositions}
              </p>
              <div className="space-y-[4px] pl-[22px]">
                <div className="flex items-center justify-between">
                  <span className="font-['Arimo',sans-serif] text-[11px] text-emerald-700">
                    ✓ {projectStats.filledPositions} Filled
                  </span>
                </div>
                {projectStats.cancelledPositions > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="font-['Arimo',sans-serif] text-[11px] text-red-700">
                      ✕ {projectStats.cancelledPositions} Cancelled
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Total Candidates */}
            <div className="space-y-[6px]">
              <div className="flex items-center gap-[8px]">
                <Users size={14} className="text-[#8b5cf6]" />
                <span className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af]">
                  Total Candidates
                </span>
              </div>
              <p className="font-['Arimo',sans-serif] text-[20px] font-semibold text-black">
                {projectStats.totalCandidates}
              </p>
              <div className="pl-[22px]">
                <span className="font-['Arimo',sans-serif] text-[11px] text-emerald-700">
                  {projectStats.selectedCandidates} selected
                </span>
              </div>
            </div>

            {/* Success Rate */}
            <div className="space-y-[6px]">
              <div className="flex items-center gap-[8px]">
                <TrendingUp size={14} className="text-[#10b981]" />
                <span className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af]">
                  Success Rate
                </span>
              </div>
              <p className="font-['Arimo',sans-serif] text-[20px] font-semibold text-black">
                {projectStats.totalCandidates > 0 
                  ? ((projectStats.selectedCandidates / projectStats.totalCandidates) * 100).toFixed(1)
                  : 0}%
              </p>
            </div>

            {/* Completion Status */}
            <div className="space-y-[6px]">
              <div className="flex items-center gap-[8px]">
                <CheckCircle2 size={14} className="text-[#3b82f6]" />
                <span className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af]">
                  Completion
                </span>
              </div>
              <p className="font-['Arimo',sans-serif] text-[20px] font-semibold text-black">
                {projectStats.totalPositions > 0
                  ? Math.round(((projectStats.filledPositions + projectStats.cancelledPositions) / projectStats.totalPositions) * 100)
                  : 0}%
              </p>
            </div>
          </div>
        </div>

        {/* What happens when you complete */}
        <div className="bg-[#dbeafe] border border-[#93c5fd] rounded-[10px] p-[16px]">
          <div className="flex gap-[12px]">
            <Lock size={18} className="text-[#2563eb] shrink-0 mt-[2px]" />
            <div className="space-y-[8px]">
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] font-medium">
                Analytics will be frozen at this point
              </p>
              <ul className="space-y-[4px]">
                <li className="flex items-start gap-[8px]">
                  <div className="w-[4px] h-[4px] rounded-full bg-[#2563eb] mt-[7px] shrink-0" />
                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] leading-[18px]">
                    All analytics dashboards will be preserved as snapshots
                  </p>
                </li>
                <li className="flex items-start gap-[8px]">
                  <div className="w-[4px] h-[4px] rounded-full bg-[#2563eb] mt-[7px] shrink-0" />
                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] leading-[18px]">
                    Project will move to "Completed Projects" section
                  </p>
                </li>
                <li className="flex items-start gap-[8px]">
                  <div className="w-[4px] h-[4px] rounded-full bg-[#2563eb] mt-[7px] shrink-0" />
                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] leading-[18px]">
                    No new positions or candidates can be added
                  </p>
                </li>
                <li className="flex items-start gap-[8px]">
                  <div className="w-[4px] h-[4px] rounded-full bg-[#2563eb] mt-[7px] shrink-0" />
                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] leading-[18px]">
                    You can still view all data and analytics
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Summary Notes */}
        <div className="space-y-[8px]">
          <label className="font-['Arimo',sans-serif] text-[14px] text-[#374151] font-medium">
            Project Summary Notes (Optional):
          </label>
          <Textarea
            value={summaryNotes}
            onChange={(e) => setSummaryNotes(e.target.value)}
            placeholder="Add final notes about this project, key learnings, or outcomes..."
            rows={4}
            className="font-['Arimo',sans-serif] text-[13px] resize-none"
          />
        </div>

        <DialogFooter className="gap-[12px] mt-[8px]">
          <Button
            onClick={handleClose}
            variant="outline"
            className="font-['Arimo',sans-serif] text-[14px] h-[40px] px-[20px] border-[#e5e7eb] hover:bg-[#f9fafb]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="font-['Arimo',sans-serif] text-[14px] h-[40px] px-[20px] bg-[#3b82f6] hover:bg-[#2563eb] text-white"
          >
            <CheckCircle2 size={16} className="mr-2" />
            Complete Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}