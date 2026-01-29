import { XCircle, CheckCircle, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { useState } from 'react';
import { Textarea } from '../ui/textarea';

interface ClosePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (outcome: PositionOutcome) => void;
  positionTitle: string;
  candidatesCount: number;
  groupsCount: number;
}

export type PositionClosureStatus = 'Filled' | 'Cancelled';

export interface PositionOutcome {
  status: PositionClosureStatus;
  reason: string;
  closureDate: string;
}

export function ClosePositionModal({
  isOpen,
  onClose,
  onConfirm,
  positionTitle,
  candidatesCount,
  groupsCount
}: ClosePositionModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<PositionClosureStatus | null>(null);
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (!selectedStatus) return;

    const outcome: PositionOutcome = {
      status: selectedStatus,
      reason: reason.trim() || getDefaultReason(selectedStatus),
      closureDate: new Date().toISOString()
    };

    onConfirm(outcome);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setSelectedStatus(null);
    setReason('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const getDefaultReason = (status: PositionClosureStatus): string => {
    switch (status) {
      case 'Filled':
        return 'Position successfully filled';
      case 'Cancelled':
        return 'Position cancelled';
    }
  };

  const outcomeOptions: Array<{
    status: PositionClosureStatus;
    icon: typeof CheckCircle;
    color: string;
    bgColor: string;
    title: string;
    description: string;
  }> = [
    {
      status: 'Filled',
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      title: 'Position Filled',
      description: 'Successfully hired candidate(s)'
    },
    {
      status: 'Cancelled',
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      title: 'Position Cancelled',
      description: 'No longer recruiting for this role'
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="font-['Arimo',sans-serif] text-[20px] text-black">
            Close Position
          </DialogTitle>
          <DialogDescription className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] leading-[20px]">
            You are closing <span className="text-black font-medium">"{positionTitle}"</span>. 
            Select the outcome and provide details.
          </DialogDescription>
        </DialogHeader>

        {/* Position Summary */}
        <div className="bg-[#f9fafb] rounded-[10px] p-[16px] space-y-[8px]">
          <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
            Position Summary:
          </p>
          <div className="flex items-center gap-[16px]">
            <div className="flex items-center gap-[6px]">
              <User size={14} className="text-[#9ca3af]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                <span className="font-medium">{candidatesCount}</span> candidates
              </span>
            </div>
            <div className="flex items-center gap-[6px]">
              <div className="w-[4px] h-[4px] rounded-full bg-[#9ca3af]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                <span className="font-medium">{groupsCount}</span> groups created
              </span>
            </div>
          </div>
        </div>

        {/* Outcome Selection */}
        <div className="space-y-[12px]">
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#374151] font-medium">
            Select Outcome:
          </p>
          <div className="grid grid-cols-2 gap-[12px]">
            {outcomeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedStatus === option.status;
              
              return (
                <button
                  key={option.status}
                  onClick={() => setSelectedStatus(option.status)}
                  className={`p-[16px] rounded-[10px] border-2 transition-all ${
                    isSelected
                      ? 'border-[#6366f1] bg-[#eef2ff]'
                      : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
                  }`}
                >
                  <div className={`w-[40px] h-[40px] rounded-full ${option.bgColor} flex items-center justify-center mx-auto mb-[12px]`}>
                    <Icon size={20} className={option.color} />
                  </div>
                  <p className={`font-['Arimo',sans-serif] text-[13px] font-medium mb-[4px] ${
                    isSelected ? 'text-[#6366f1]' : 'text-[#374151]'
                  }`}>
                    {option.title}
                  </p>
                  <p className="font-['Arimo',sans-serif] text-[11px] text-[#9ca3af] leading-[16px]">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reason/Notes */}
        {selectedStatus && (
          <div className="space-y-[8px]">
            <label className="font-['Arimo',sans-serif] text-[14px] text-[#374151] font-medium">
              {selectedStatus === 'Filled' ? 'Notes (Optional):' : 'Reason (Optional):'}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                selectedStatus === 'Filled' 
                  ? 'Add any notes about the hire...'
                  : selectedStatus === 'Cancelled'
                  ? 'e.g., Budget constraints, role no longer needed...'
                  : 'e.g., Pending budget approval, strategic review...'
              }
              rows={3}
              className="font-['Arimo',sans-serif] text-[13px] resize-none"
            />
          </div>
        )}

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
            disabled={!selectedStatus}
            className={`font-['Arimo',sans-serif] text-[14px] h-[40px] px-[20px] ${
              selectedStatus === 'Filled'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : selectedStatus === 'Cancelled'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#9ca3af]'
            } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Close Position
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}