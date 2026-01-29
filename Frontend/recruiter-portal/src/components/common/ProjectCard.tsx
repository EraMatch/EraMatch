import { Button } from '../ui/button';
import { Pencil } from 'lucide-react';

interface ProjectCardProps {
  title: string;
  roles: number;
  applicants: number | string;
  isOpen?: boolean;
  showOpenBadge?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  showEditButton?: boolean;
}

export function ProjectCard({ title, roles, applicants, isOpen, showOpenBadge = false, onView, onEdit, showEditButton = true }: ProjectCardProps) {
  // Format applicants for display
  const formattedApplicants = typeof applicants === 'number' 
    ? applicants 
    : applicants;
  
  return (
    <div className="bg-[#f7fafe] h-[88px] rounded-[14px] w-full">
      <div className="flex flex-row items-center size-full">
        <div className="box-border content-stretch flex h-[88px] items-center justify-between px-[24px] py-0 w-full gap-[24px]">
          {/* Title */}
          <div className="flex-1 min-w-0">
            <p className="font-['Arimo',sans-serif] leading-[24px] text-[16px] text-black truncate">
              {title}
            </p>
          </div>
          
          {/* Currently Open Badge, Roles and Applicants */}
          <div className="flex items-center gap-[32px] shrink-0">
            {showOpenBadge && isOpen && (
              <div className="h-[30px] rounded-full border border-[#18ba84] px-[13px] flex items-center justify-center">
                <p className="font-['Arimo',sans-serif] leading-[20px] text-[#18ba84] text-[14px] whitespace-nowrap">
                  currently open
                </p>
              </div>
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