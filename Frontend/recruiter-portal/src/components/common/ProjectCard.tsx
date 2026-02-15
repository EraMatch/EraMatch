import { Button } from '../ui/button';
import { Pencil } from 'lucide-react';

interface ProjectCardProps {
  title: string;
  roles: number;
  applicants: number | string;
  isOpen?: boolean;
  status?: string;
  showOpenBadge?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  showEditButton?: boolean;
}

export function ProjectCard({ title, roles, applicants, isOpen, status, showOpenBadge = false, onView, onEdit, showEditButton = true }: ProjectCardProps) {
  // Format applicants for display
  const formattedApplicants = typeof applicants === 'number'
    ? applicants
    : applicants;

  const isPending = status?.toLowerCase() === 'pending';
  const isRejected = status?.toLowerCase() === 'rejected';

  return (
    <div className="bg-[#f7fafe] h-[88px] rounded-[14px] w-full">
      <div className="flex flex-row items-center size-full">
        <div className="box-border content-stretch flex h-[88px] items-center justify-between px-[24px] py-0 w-full gap-[24px]">
          {/* Title */}
          <div
            className={`flex-1 min-w-0 ${onView ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}`}
            onClick={onView}
          >
            <p className="font-['Arimo',sans-serif] leading-[24px] text-[16px] text-black truncate">
              {title}
            </p>
          </div>

          {/* Status Badges, Roles and Applicants */}
          <div className="flex items-center gap-[32px] shrink-0">
            {showOpenBadge && (
              <>
                {isPending && (
                  <div className="h-[30px] rounded-full border border-[#f59e0b] px-[13px] flex items-center justify-center bg-[#fffbeb]">
                    <p className="font-['Arimo',sans-serif] leading-[20px] text-[#f59e0b] text-[14px] whitespace-nowrap">
                      Pending Approval
                    </p>
                  </div>
                )}
                {isRejected && (
                  <div className="h-[30px] rounded-full border border-[#ef4444] px-[13px] flex items-center justify-center bg-[#fef2f2]">
                    <p className="font-['Arimo',sans-serif] leading-[20px] text-[#ef4444] text-[14px] whitespace-nowrap">
                      Rejected
                    </p>
                  </div>
                )}
                {status?.toLowerCase() === 'technical_review' && (
                  <div className="h-[30px] rounded-full border border-indigo-400 px-[13px] flex items-center justify-center bg-indigo-50">
                    <p className="font-['Arimo',sans-serif] leading-[20px] text-indigo-600 text-[14px] whitespace-nowrap">
                      Technical Review
                    </p>
                  </div>
                )}
                {isOpen && !isPending && !isRejected && status?.toLowerCase() !== 'technical_review' && (
                  <div className="h-[30px] rounded-full border border-[#18ba84] px-[13px] flex items-center justify-center">
                    <p className="font-['Arimo',sans-serif] leading-[20px] text-[#18ba84] text-[14px] whitespace-nowrap">
                      Currently Open
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="h-[24px]">
              <p className="font-['Arimo',sans-serif] leading-[24px] text-[#9f9f9f] text-[16px] whitespace-nowrap">
                {roles} {roles === 1 ? 'role' : 'roles'}
              </p>
            </div>

            <div className="h-[24px] min-w-[100px]">
              <p className="font-['Arimo',sans-serif] leading-[24px] text-[#aaaaaa] text-[16px] whitespace-nowrap">
                {formattedApplicants} applicants
              </p>
            </div>
          </div>

          {/* Edit Button and View Button */}
          <div className="flex items-center gap-[12px] shrink-0">
            {/* Edit Button - Only shown if showEditButton is true */}
            {showEditButton && onEdit && (
              <button
                onClick={onEdit}
                className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center hover:bg-[#ede9ff] transition-colors"
              >
                <Pencil size={16} className="text-[#9f9f9f]" strokeWidth={1.33} />
              </button>
            )}

            {/* View Button */}
            <div className="bg-[#4834ab] h-[40px] rounded-[10px] min-w-[82px] flex items-center justify-center cursor-pointer hover:bg-[#3d2b91] transition-colors"
              onClick={onView}>
              <p className="font-['Arimo',sans-serif] leading-[24px] text-[16px] text-white">
                View
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}