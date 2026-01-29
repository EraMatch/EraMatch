import { useState, useEffect } from 'react';
import { X, Users, Sparkles, Calendar, Send, Video, TrendingUp, Edit, GripVertical, FileText, MessageSquare, UserCheck, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface FiltrationModule {
  id: string;
  type: 'assessment' | 'ai-interview' | 'live-interview';
  name: string;
  icon: any;
  enabled: boolean;
  order: number;
}

interface EnhancedGroupCreationModalProps {
  selectedCount: number;
  onClose: () => void;
  onCreate: (groupData: any) => void;
  filterSummary?: string[];
  onEditFilters?: () => void;
}

export function EnhancedGroupCreationModal({
  selectedCount,
  onClose,
  onCreate,
  filterSummary = [],
  onEditFilters
}: EnhancedGroupCreationModalProps) {
  const [groupName, setGroupName] = useState(`Filtered: ${new Date().toLocaleDateString()}`);
  const [description, setDescription] = useState('');
  const [assignedRecruiter, setAssignedRecruiter] = useState('');
  const [pipelineTemplate, setPipelineTemplate] = useState('custom');

  // NEW: Filtration flow configuration
  const [filtrationModules, setFiltrationModules] = useState<FiltrationModule[]>([]);
  const [draggedModule, setDraggedModule] = useState<string | null>(null);

  const [immediateActions, setImmediateActions] = useState({
    sendAssessment: false,
    scheduleAssessment: false,
    scheduleDate: '',
    setupAIInterview: false,
    aiInterviewType: 'immediate',
    runSemanticRanking: false,
    topN: 5
  });
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const [recruiters, setRecruiters] = useState<{ id: string, name: string, role: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [recruitersData, modulesData] = await Promise.all([
          api.recruiter.getRecruiters(),
          api.recruiter.getPipelineModules()
        ]);

        setRecruiters(recruitersData);

        // Map icons to modules
        const iconMap: Record<string, any> = {
          'assessment': FileText,
          'ai-interview': Video,
          'live-interview': MessageSquare
        };

        const mappedModules = modulesData.map((m: any, index: number) => ({
          ...m,
          icon: iconMap[m.type] || FileText,
          order: index
        }));

        setFiltrationModules(mappedModules);
      } catch (error) {
        console.error('Failed to fetch modal data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const toggleModule = (moduleId: string) => {
    setFiltrationModules(filtrationModules.map(m =>
      m.id === moduleId ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const handleDragStart = (moduleId: string) => {
    setDraggedModule(moduleId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetModuleId: string) => {
    if (!draggedModule || draggedModule === targetModuleId) return;

    const draggedIndex = filtrationModules.findIndex(m => m.id === draggedModule);
    const targetIndex = filtrationModules.findIndex(m => m.id === targetModuleId);

    const newModules = [...filtrationModules];
    const [removed] = newModules.splice(draggedIndex, 1);
    newModules.splice(targetIndex, 0, removed);

    // Update order
    setFiltrationModules(newModules.map((m, index) => ({ ...m, order: index })));
    setDraggedModule(null);
  };

  const handleCreate = () => {
    if (!groupName.trim()) return;

    // Get enabled modules in order
    const enabledModules = filtrationModules
      .filter(m => m.enabled)
      .sort((a, b) => a.order - b.order)
      .map(m => m.type);

    onCreate({
      groupName,
      description,
      assignedRecruiter,
      pipelineTemplate,
      filtrationFlow: enabledModules, // NEW: Include filtration flow
      immediateActions,
      saveAsTemplate
    });
  };

  const enabledCount = filtrationModules.filter(m => m.enabled).length;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-[16px] w-full max-w-[900px] h-[400px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" />
            <p className="text-[#6b7280] font-medium font-['Arimo',sans-serif]">Loading configurations...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-[16px] w-full max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col animate-scaleIn"
        style={{ animationDuration: '200ms' }}
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-[40px] h-[40px] rounded-[10px] bg-[#6366f1] flex items-center justify-center">
                <Users size={20} className="text-white" />
              </div>
              <h2 className="text-[#111827]">Create Candidate Group</h2>
            </div>
            <button
              onClick={onClose}
              className="w-[36px] h-[36px] flex items-center justify-center rounded-[8px] hover:bg-[#f3f4f6] transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            Organize {selectedCount} selected candidate{selectedCount > 1 ? 's' : ''} into a managed group
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-8 py-6 space-y-6">
          {/* Filter Summary */}
          {filterSummary.length > 0 && (
            <div className="bg-[#f9fafb] rounded-[8px] p-4 border border-[#e5e7eb]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-[6px] h-[6px] rounded-full bg-[#6366f1]" />
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                    Applied Filters
                  </span>
                </div>
                {onEditFilters && (
                  <button
                    onClick={onEditFilters}
                    className="flex items-center gap-1 font-['Arimo',sans-serif] text-[12px] text-[#6366f1] hover:underline"
                  >
                    <Edit size={12} />
                    Edit filters
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {filterSummary.map((filter, index) => (
                  <span
                    key={index}
                    className="px-[10px] py-[4px] bg-white rounded-[6px] font-['Arimo',sans-serif] text-[12px] text-[#6b7280] border border-[#e5e7eb]"
                  >
                    {filter}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Group Name */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
              Group Name <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Senior React Developers Q1 2025"
              className="w-full h-[44px] px-[14px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this group..."
              rows={3}
              className="w-full px-[14px] py-[10px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            />
          </div>

          {/* Assign Recruiter */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
              Assign Recruiter
            </label>
            <select
              value={assignedRecruiter}
              onChange={(e) => setAssignedRecruiter(e.target.value)}
              className="w-full h-[44px] px-[14px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
            >
              <option value="">Select a recruiter...</option>
              {isLoading ? (
                <option disabled>Loading recruiters...</option>
              ) : (
                recruiters.map((recruiter) => (
                  <option key={recruiter.id} value={recruiter.name}>
                    {recruiter.name} - {recruiter.role}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* NEW: Filtration Flow Configuration */}
          <div className="border-2 border-[#6366f1] rounded-[12px] p-6 bg-gradient-to-br from-[#f5f3ff] to-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[#111827] font-medium flex items-center gap-2">
                  <TrendingUp size={18} className="text-[#6366f1]" />
                  Filtration Flow Configuration
                </h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mt-1">
                  Configure which modules candidates will go through and their order
                </p>
              </div>
              <div className="px-3 py-1 bg-[#6366f1] text-white rounded-[6px] text-[12px] font-medium">
                {enabledCount} module{enabledCount !== 1 ? 's' : ''} enabled
              </div>
            </div>

            {/* Module List */}
            <div className="space-y-2">
              {filtrationModules.map((module, index) => {
                const Icon = module.icon;
                return (
                  <div
                    key={module.id}
                    draggable={module.enabled}
                    onDragStart={() => handleDragStart(module.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(module.id)}
                    className={`flex items-center gap-3 p-4 rounded-[8px] border-2 transition-all ${module.enabled
                      ? 'bg-white border-[#10b981] cursor-move hover:shadow-md'
                      : 'bg-[#f9fafb] border-[#e5e7eb] opacity-60'
                      } ${draggedModule === module.id ? 'opacity-50 scale-95' : ''}`}
                  >
                    {/* Drag Handle */}
                    {module.enabled && (
                      <GripVertical size={18} className="text-[#9ca3af] flex-shrink-0" />
                    )}

                    {/* Order Badge */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0 ${module.enabled
                      ? 'bg-[#10b981] text-white'
                      : 'bg-[#e5e7eb] text-[#9ca3af]'
                      }`}>
                      {module.enabled ? filtrationModules.filter(m => m.enabled && m.order < module.order).length + 1 : '—'}
                    </div>

                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0 ${module.enabled ? 'bg-[#10b981]/10' : 'bg-[#e5e7eb]'
                      }`}>
                      <Icon size={18} className={module.enabled ? 'text-[#10b981]' : 'text-[#9ca3af]'} />
                    </div>

                    {/* Module Info */}
                    <div className="flex-1">
                      <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                        {module.name}
                      </div>
                      <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                        {(module as any).description}
                      </div>
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => toggleModule(module.id)}
                      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${module.enabled ? 'bg-[#10b981]' : 'bg-[#e5e7eb]'
                        }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${module.enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Flow Preview */}
            {enabledCount > 0 && (
              <div className="mt-4 p-4 bg-white rounded-[8px] border border-[#e5e7eb]">
                <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">
                  Pipeline Preview:
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {filtrationModules
                    .filter(m => m.enabled)
                    .sort((a, b) => a.order - b.order)
                    .map((module, index, array) => {
                      const Icon = module.icon;
                      return (
                        <div key={module.id} className="flex items-center gap-2">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#10b981]/10 border border-[#10b981]/20 rounded-[6px]">
                            <Icon size={14} className="text-[#10b981]" />
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#059669]">
                              {module.name}
                            </span>
                          </div>
                          {index < array.length - 1 && (
                            <span className="text-[#9ca3af]">→</span>
                          )}
                        </div>
                      );
                    })}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px]">
                    <CheckCircle size={14} className="text-[#6b7280]" />
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Review & Offer
                    </span>
                  </div>
                </div>
              </div>
            )}

            {enabledCount === 0 && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-[8px] flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="font-['Arimo',sans-serif] text-[13px] text-amber-800">
                  Please enable at least one module to create a filtration flow
                </p>
              </div>
            )}
          </div>

          {/* Immediate Actions */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
              Immediate Actions (Optional)
            </label>
            <div className="space-y-3 bg-[#f9fafb] rounded-[8px] p-[16px] border border-[#e5e7eb]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={immediateActions.sendAssessment}
                  onChange={(e) => setImmediateActions({ ...immediateActions, sendAssessment: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                />
                <Send size={16} className="text-[#6b7280]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  Send Assessment Now
                </span>
              </label>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={immediateActions.scheduleAssessment}
                    onChange={(e) => setImmediateActions({ ...immediateActions, scheduleAssessment: e.target.checked })}
                    className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                  />
                  <Calendar size={16} className="text-[#6b7280]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Schedule Assessment
                  </span>
                </label>
                {immediateActions.scheduleAssessment && (
                  <input
                    type="datetime-local"
                    value={immediateActions.scheduleDate}
                    onChange={(e) => setImmediateActions({ ...immediateActions, scheduleDate: e.target.value })}
                    className="w-full h-[36px] px-[12px] rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] mt-2 ml-[37px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                  />
                )}
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={immediateActions.setupAIInterview}
                    onChange={(e) => setImmediateActions({ ...immediateActions, setupAIInterview: e.target.checked })}
                    className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                  />
                  <Video size={16} className="text-[#6b7280]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Setup AI Interview
                  </span>
                </label>
                {immediateActions.setupAIInterview && (
                  <div className="flex gap-2 mt-2 ml-[37px]">
                    <button
                      onClick={() => setImmediateActions({ ...immediateActions, aiInterviewType: 'immediate' })}
                      className={`flex-1 h-[32px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] transition-colors ${immediateActions.aiInterviewType === 'immediate'
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb]'
                        }`}
                    >
                      Immediate
                    </button>
                    <button
                      onClick={() => setImmediateActions({ ...immediateActions, aiInterviewType: 'schedule' })}
                      className={`flex-1 h-[32px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] transition-colors ${immediateActions.aiInterviewType === 'schedule'
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb]'
                        }`}
                    >
                      Schedule
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={immediateActions.runSemanticRanking}
                    onChange={(e) => setImmediateActions({ ...immediateActions, runSemanticRanking: e.target.checked })}
                    className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                  />
                  <Sparkles size={16} className="text-[#6366f1]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Run Semantic Ranking Inside Group
                  </span>
                </label>
                {immediateActions.runSemanticRanking && (
                  <div className="mt-2 ml-[37px]">
                    <label className="block font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">
                      Rank top N candidates:
                    </label>
                    <select
                      value={immediateActions.topN}
                      onChange={(e) => setImmediateActions({ ...immediateActions, topN: parseInt(e.target.value) })}
                      className="w-full h-[32px] px-[10px] rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
                    >
                      <option value={3}>Top 3</option>
                      <option value={5}>Top 5</option>
                      <option value={10}>Top 10</option>
                      <option value={selectedCount}>All</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Save as Template */}
          <div className="border-t border-[#e5e7eb] pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                className="w-[16px] h-[16px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
              />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Save as template for future use
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!groupName.trim()}
            className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
          >
            Create Group
          </button>
        </div>
      </div>

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
          animation: scaleIn ease-out;
        }
      `}</style>
    </div>
  );
}