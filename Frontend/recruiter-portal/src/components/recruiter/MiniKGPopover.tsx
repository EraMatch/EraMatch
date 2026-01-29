import { Network } from 'lucide-react';

interface MiniKGPopoverProps {
  candidateName: string;
  topSkills: string[];
  topRepo: string;
  relatedRole: string;
  onOpenFullKG: () => void;
  onClose: () => void;
  position: { x: number; y: number };
}

export function MiniKGPopover({
  candidateName,
  topSkills,
  topRepo,
  relatedRole,
  onOpenFullKG,
  onClose,
  position
}: MiniKGPopoverProps) {
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Popover */}
      <div
        className="fixed z-50 bg-white rounded-[12px] border border-[#e5e7eb] shadow-xl p-5 w-[300px]"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-50%, -100%) translateY(-12px)'
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#e5e7eb]">
          <div className="w-[36px] h-[36px] rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
            <span className="text-white text-[14px]">
              {candidateName.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] truncate">
              {candidateName}
            </div>
            <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
              Knowledge Graph
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3 mb-4">
          {/* Top Skills */}
          <div>
            <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-2">
              Top Skills
            </div>
            <div className="flex flex-wrap gap-1">
              {topSkills.slice(0, 3).map((skill, i) => (
                <span
                  key={i}
                  className="px-[8px] py-[4px] bg-[#ede9fe] text-[#6366f1] rounded-[6px] font-['Arimo',sans-serif] text-[11px]"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Top Repo */}
          <div>
            <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-1">
              Strongest Repository
            </div>
            <div className="px-[10px] py-[6px] bg-[#f3f4f6] rounded-[6px]">
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#111827]">
                {topRepo}
              </span>
            </div>
          </div>

          {/* Related Role */}
          <div>
            <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-1">
              Related Role
            </div>
            <div className="px-[10px] py-[6px] bg-[#dcfce7] rounded-[6px]">
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#10b981]">
                {relatedRole}
              </span>
            </div>
          </div>
        </div>

        {/* Action */}
        <button
          onClick={onOpenFullKG}
          className="w-full h-[36px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] flex items-center justify-center gap-2 transition-colors"
        >
          <Network size={16} className="text-white" />
          <span className="font-['Arimo',sans-serif] text-[13px] text-white">
            Open Full KG
          </span>
        </button>
      </div>
    </>
  );
}
