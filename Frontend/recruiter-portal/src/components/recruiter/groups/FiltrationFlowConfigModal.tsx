import { useState } from 'react';
import { X, FileText, Video, MessageSquare, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../../../services/api';

interface FiltrationModule {
  id: string;
  type: 'assessment' | 'ai-interview' | 'live-interview';
  name: string;
  description: string;
  icon: any;
  enabled: boolean;
  order: number;
}

// Hardcoded pipeline modules — these are the standard filtration stages
const DEFAULT_MODULES: FiltrationModule[] = [
  {
    id: 'assessment',
    type: 'assessment',
    name: 'Technical Assessment',
    description: 'Automated MCQ/Coding test to evaluate technical skills',
    icon: FileText,
    enabled: false,
    order: 0,
  },
  {
    id: 'ai-interview',
    type: 'ai-interview',
    name: 'AI Video Interview',
    description: 'AI-powered async video interview for soft skills & communication',
    icon: Video,
    enabled: false,
    order: 1,
  },
  {
    id: 'live-interview',
    type: 'live-interview',
    name: 'Live Interview',
    description: 'Human-conducted live interview for final evaluation',
    icon: MessageSquare,
    enabled: false,
    order: 2,
  },
];

interface FiltrationFlowConfigModalProps {
  groupData?: any;
  onClose: () => void;
  onSave: (flowConfig: ('assessment' | 'ai-interview' | 'live-interview')[], githubQuestionsCount: number) => void;
}

export function FiltrationFlowConfigModal({
  groupData,
  onClose,
  onSave
}: FiltrationFlowConfigModalProps) {
  const [filtrationModules, setFiltrationModules] = useState<FiltrationModule[]>(() => {
    if (groupData?.filtration_flow && Array.isArray(groupData.filtration_flow)) {
      const activeFlowIds = groupData.filtration_flow;
      return DEFAULT_MODULES.map((m, index) => ({
        ...m,
        enabled: activeFlowIds.includes(m.id) || activeFlowIds.includes(m.type),
        order: index
      }));
    }
    return DEFAULT_MODULES;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [githubQuestionsCount, setGithubQuestionsCount] = useState<number>(() => {
    const parsed = Number(groupData?.github_questions_count ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(30, Math.max(1, Math.round(parsed)));
  });

  const toggleModule = (moduleId: string) => {
    setFiltrationModules(filtrationModules.map(m =>
      m.id === moduleId ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const handleSave = async () => {
    const enabledFlow = filtrationModules
      .filter(m => m.enabled)
      .sort((a, b) => a.order - b.order)
      .map(m => m.type);

    try {
      setIsSaving(true);

      // If we have a group, persist the filtration flow to the backend
      if (groupData?.id) {
        await api.recruiter.updateGroup(groupData.id, {
          filtration_flow: enabledFlow,
          status: 'Live',
        } as any);
      }

      onSave(enabledFlow, githubQuestionsCount);
    } catch (err) {
      console.error('Failed to save flow config:', err);
      // Still call onSave even if backend update fails
      onSave(enabledFlow, githubQuestionsCount);
    } finally {
      setIsSaving(false);
    }
  };

  const enabledCount = filtrationModules.filter(m => m.enabled).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[600px] p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-[#111827] text-[20px] font-['Arimo',sans-serif]">
              Configure Filtration Flow
            </h3>
            <p className="text-[#6b7280] text-[14px] font-['Arimo',sans-serif] mt-1">
              {groupData?.name || 'New Group'} • {groupData?.candidateCount || 0} candidates
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
          >
            <X size={18} className="text-[#6b7280]" />
          </button>
        </div>

        <div className="mb-6">
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-4">
            Select the filtration stages for this candidate group. Enabled stages will execute in their standard sequence.
          </p>

          <div className="space-y-3">
            {filtrationModules.map((module) => (
              <div
                key={module.id}
                className={`flex items-center gap-4 p-4 rounded-[12px] border-2 transition-all ${module.enabled
                  ? 'border-[#6366f1] bg-[#eef2ff]'
                  : 'border-[#e5e7eb] bg-white'
                  }`}
              >
                <div className={`flex items-center justify-center w-[40px] h-[40px] rounded-[8px] flex-shrink-0 ${module.enabled ? 'bg-[#6366f1]' : 'bg-[#e5e7eb]'
                  }`}>
                  <module.icon size={20} className={module.enabled ? 'text-white' : 'text-[#6b7280]'} />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-['Arimo',sans-serif] text-[15px] text-[#111827] mb-0.5">
                    {module.name}
                  </h4>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    {module.description}
                  </p>
                  {module.enabled && (
                    <p className="font-['Arimo',sans-serif] text-[12px] text-[#6366f1] mt-1 font-medium">
                      Sequence Position: {filtrationModules.filter(m => m.enabled && m.order < module.order).length + 1}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => toggleModule(module.id)}
                  className={`flex items-center justify-center w-[24px] h-[24px] rounded-[6px] border-2 transition-all flex-shrink-0 ${module.enabled
                    ? 'bg-[#6366f1] border-[#6366f1]'
                    : 'bg-white border-[#d1d5db]'
                    }`}
                >
                  {module.enabled && <CheckCircle size={16} className="text-white" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#f9fafb] rounded-[8px] p-4 mb-6">
          <div className="mb-4">
            <label className="font-['Arimo',sans-serif] text-[13px] text-[#374151] block mb-2">
              GitHub Questions Per Candidate
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={githubQuestionsCount}
              onChange={(e) => {
                const value = Number(e.target.value || 10);
                if (!Number.isFinite(value)) {
                  setGithubQuestionsCount(10);
                  return;
                }
                setGithubQuestionsCount(Math.min(30, Math.max(1, Math.round(value))));
              }}
              className="w-full h-[40px] px-3 rounded-[8px] border border-[#d1d5db] focus:outline-none focus:border-[#6366f1]"
            />
            <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mt-1">
              This count is used for auto-generated GitHub-based technical questions per candidate.
            </p>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-[6px] h-[6px] rounded-full bg-[#6366f1]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
              Flow Summary
            </span>
          </div>
          <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
            {enabledCount === 0 ? (
              'No stages selected. Please select at least one stage.'
            ) : (
              `${enabledCount} stage${enabledCount > 1 ? 's' : ''} configured: ${filtrationModules
                .filter(m => m.enabled)
                .sort((a, b) => a.order - b.order)
                .map(m => m.name)
                .join(' → ')} → Review & Offer`
            )}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={enabledCount === 0 || isSaving}
            className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              'Save & Activate'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
