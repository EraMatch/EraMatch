import { useState } from 'react';
import { Network, ExternalLink, ChevronRight } from 'lucide-react';

interface MiniKGTreePopoverProps {
  candidateName: string;
  candidateAvatar: string;
  topSkills: Array<{ name: string; strength: number }>;
  topRepos: Array<{ name: string; commits: number }>;
  topRoles: Array<{ name: string; years: number }>;
  onOpenFullKG: () => void;
  onClose: () => void;
  position: { x: number; y: number };
}

export function MiniKGTreePopover({
  candidateName,
  candidateAvatar,
  topSkills,
  topRepos,
  topRoles,
  onOpenFullKG,
  onClose,
  position
}: MiniKGTreePopoverProps) {
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Popover */}
      <div
        className="fixed z-50 bg-white rounded-[12px] border border-[#e5e7eb] shadow-2xl w-[380px] overflow-hidden animate-scaleIn"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-50%, -100%) translateY(-12px)',
          animationDuration: '120ms'
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
          <div className="flex items-center gap-3">
            <div className="w-[40px] h-[40px] rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="font-['Arimo',sans-serif] text-[14px] text-white">
                {candidateAvatar}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-['Arimo',sans-serif] text-[15px] text-white truncate">
                {candidateName}
              </div>
              <div className="font-['Arimo',sans-serif] text-[12px] text-white/80">
                Knowledge Graph Preview
              </div>
            </div>
            <Network size={20} className="text-white/80 flex-shrink-0" />
          </div>
        </div>

        {/* Tree Visualization */}
        <div className="p-5">
          {/* Center Node */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-[60px] h-[60px] rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-lg">
                <span className="font-['Arimo',sans-serif] text-[16px] text-white">
                  {candidateAvatar}
                </span>
              </div>
              {/* Connecting Lines */}
              <div className="absolute top-[60px] left-1/2 w-[2px] h-[20px] bg-[#e5e7eb]" />
            </div>
          </div>

          {/* Three Branches Container */}
          <div className="space-y-4">
            {/* Skills Branch */}
            <div className="relative">
              <button
                onClick={() => setExpandedBranch(expandedBranch === 'skills' ? null : 'skills')}
                className="w-full"
              >
                <div className="flex items-center gap-3 p-3 rounded-[8px] bg-[#f5f3ff] hover:bg-[#ede9fe] transition-colors border border-[#e5e7eb]">
                  <div className="w-[8px] h-[8px] rounded-full bg-[#10b981]" />
                  <div className="flex-1 text-left">
                    <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                      Skills
                    </div>
                    <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                      {topSkills.length} key competencies
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-[#6b7280] transition-transform ${
                      expandedBranch === 'skills' ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>
              
              {/* Expanded Skills */}
              {expandedBranch === 'skills' && (
                <div className="ml-8 mt-2 space-y-2 animate-slideDown">
                  {topSkills.map((skill, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-[6px] bg-white border border-[#e5e7eb]"
                    >
                      <div className="w-[6px] h-[6px] rounded-full bg-[#10b981]" />
                      <div className="flex-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#111827]">
                          {skill.name}
                        </span>
                      </div>
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#10b981]">
                        {skill.strength}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Repositories Branch */}
            <div className="relative">
              <button
                onClick={() => setExpandedBranch(expandedBranch === 'repos' ? null : 'repos')}
                className="w-full"
              >
                <div className="flex items-center gap-3 p-3 rounded-[8px] bg-[#f5f3ff] hover:bg-[#ede9fe] transition-colors border border-[#e5e7eb]">
                  <div className="w-[8px] h-[8px] rounded-full bg-[#6366f1]" />
                  <div className="flex-1 text-left">
                    <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                      Top Repositories
                    </div>
                    <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                      {topRepos.length} strongest projects
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-[#6b7280] transition-transform ${
                      expandedBranch === 'repos' ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>
              
              {/* Expanded Repos */}
              {expandedBranch === 'repos' && (
                <div className="ml-8 mt-2 space-y-2 animate-slideDown">
                  {topRepos.map((repo, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-[6px] bg-white border border-[#e5e7eb]"
                    >
                      <div className="w-[6px] h-[6px] rounded-full bg-[#6366f1]" />
                      <div className="flex-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#111827]">
                          {repo.name}
                        </span>
                      </div>
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                        {repo.commits} commits
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Roles Branch */}
            <div className="relative">
              <button
                onClick={() => setExpandedBranch(expandedBranch === 'roles' ? null : 'roles')}
                className="w-full"
              >
                <div className="flex items-center gap-3 p-3 rounded-[8px] bg-[#f5f3ff] hover:bg-[#ede9fe] transition-colors border border-[#e5e7eb]">
                  <div className="w-[8px] h-[8px] rounded-full bg-[#f59e0b]" />
                  <div className="flex-1 text-left">
                    <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                      Related Roles
                    </div>
                    <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                      {topRoles.length} matching positions
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-[#6b7280] transition-transform ${
                      expandedBranch === 'roles' ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>
              
              {/* Expanded Roles */}
              {expandedBranch === 'roles' && (
                <div className="ml-8 mt-2 space-y-2 animate-slideDown">
                  {topRoles.map((role, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-[6px] bg-white border border-[#e5e7eb]"
                    >
                      <div className="w-[6px] h-[6px] rounded-full bg-[#f59e0b]" />
                      <div className="flex-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#111827]">
                          {role.name}
                        </span>
                      </div>
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                        {role.years}y exp
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Microcopy */}
          <div className="mt-4 px-3 py-2 bg-[#f9fafb] rounded-[6px]">
            <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] text-center">
              Top relations — click Open full KG to explore deeply
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={onOpenFullKG}
            className="w-full h-[40px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] flex items-center justify-center gap-2 transition-colors"
          >
            <Network size={16} className="text-white" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-white">
              Open Full KG
            </span>
            <ExternalLink size={12} className="text-white/80" />
          </button>
          
          <button className="w-full h-[32px] rounded-[6px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] flex items-center justify-center gap-1 transition-colors">
            <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
              Trace data sources
            </span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from {
            transform: translate(-50%, -100%) translateY(-12px) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -100%) translateY(-12px) scale(1);
            opacity: 1;
          }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-scaleIn {
          animation: scaleIn ease-out;
        }
        .animate-slideDown {
          animation: slideDown 120ms ease-out;
        }
      `}</style>
    </>
  );
}
