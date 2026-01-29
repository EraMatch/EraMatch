import { AlertCircle, Archive, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';

interface ArchiveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectTitle: string;
  isCompleted: boolean; // New prop to ensure project is completed
  completionDate?: string;
}

export function ArchiveProjectModal({
  isOpen,
  onClose,
  onConfirm,
  projectTitle,
  isCompleted,
  completionDate
}: ArchiveProjectModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  // Don't allow archiving non-completed projects
  if (!isCompleted) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-[40px] h-[40px] rounded-full bg-[#fef3c7] flex items-center justify-center">
                <AlertCircle size={20} className="text-[#f59e0b]" />
              </div>
              <DialogTitle className="font-['Arimo',sans-serif] text-[20px] text-black">
                Cannot Archive Active Project
              </DialogTitle>
            </div>
            <DialogDescription className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] leading-[20px]">
              You must complete the project before archiving it.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-[#fef3c7] border border-[#fcd34d] rounded-[10px] p-[16px]">
            <div className="flex gap-[12px]">
              <AlertCircle size={18} className="text-[#f59e0b] shrink-0 mt-[2px]" />
              <div>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#92400e] leading-[18px]">
                  Projects must be marked as "Complete" before they can be archived. 
                  Complete the project first to freeze all analytics and data.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={onClose}
              className="font-['Arimo',sans-serif] text-[14px] h-[40px] px-[20px]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-[40px] h-[40px] rounded-full bg-[#dbeafe] flex items-center justify-center">
              <Archive size={20} className="text-[#3b82f6]" />
            </div>
            <DialogTitle className="font-['Arimo',sans-serif] text-[20px] text-black">
              Archive Completed Project
            </DialogTitle>
          </div>
          <DialogDescription className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] leading-[20px]">
            Archive <span className="text-black font-medium">"{projectTitle}"</span> to remove it from your workspace.
          </DialogDescription>
        </DialogHeader>

        {/* Project Status */}
        {completionDate && (
          <div className="bg-[#f0fdf4] rounded-[10px] p-[16px]">
            <div className="flex items-center gap-[12px]">
              <CheckCircle size={18} className="text-emerald-600" />
              <div>
                <p className="font-['Arimo',sans-serif] text-[13px] text-emerald-900 font-medium">
                  Project Completed
                </p>
                <p className="font-['Arimo',sans-serif] text-[12px] text-emerald-700">
                  {new Date(completionDate).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info Message */}
        <div className="bg-[#dbeafe] border border-[#93c5fd] rounded-[10px] p-[16px]">
          <div className="flex gap-[12px]">
            <Archive size={18} className="text-[#2563eb] shrink-0 mt-[2px]" />
            <div>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] leading-[18px]">
                This completed project will be moved to archived projects. All frozen analytics and data will be preserved for admin review.
              </p>
            </div>
          </div>
        </div>

        {/* What happens when you archive */}
        <div className="space-y-[10px]">
          <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-medium">
            What happens when you archive:
          </p>
          <ul className="space-y-[6px] pl-[4px]">
            <li className="flex items-start gap-[8px]">
              <div className="w-[4px] h-[4px] rounded-full bg-[#9ca3af] mt-[7px] shrink-0" />
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] leading-[18px]">
                Removed from your active and completed projects list
              </p>
            </li>
            <li className="flex items-start gap-[8px]">
              <div className="w-[4px] h-[4px] rounded-full bg-[#9ca3af] mt-[7px] shrink-0" />
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] leading-[18px]">
                All frozen analytics snapshots are preserved
              </p>
            </li>
            <li className="flex items-start gap-[8px]">
              <div className="w-[4px] h-[4px] rounded-full bg-[#9ca3af] mt-[7px] shrink-0" />
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] leading-[18px]">
                Admin users can view in "Archived Projects" dashboard
              </p>
            </li>
            <li className="flex items-start gap-[8px]">
              <div className="w-[4px] h-[4px] rounded-full bg-[#9ca3af] mt-[7px] shrink-0" />
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] leading-[18px]">
                Historical data maintained for compliance and reporting
              </p>
            </li>
          </ul>
        </div>

        <DialogFooter className="gap-[12px] mt-[8px]">
          <Button
            onClick={onClose}
            variant="outline"
            className="font-['Arimo',sans-serif] text-[14px] h-[40px] px-[20px] border-[#e5e7eb] hover:bg-[#f9fafb]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="font-['Arimo',sans-serif] text-[14px] h-[40px] px-[20px] bg-[#4834ab] hover:bg-[#3d2b91] text-white"
          >
            <Archive size={16} className="mr-2" />
            Archive Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}