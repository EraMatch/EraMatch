import { useState, useEffect } from 'react';
import { X, FileText, Video, MessageSquare, GripVertical, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface FiltrationModule {
  id: string;
  type: 'assessment' | 'ai-interview' | 'live-interview';
  name: string;
  icon: any;
  enabled: boolean;
  order: number;
}

interface FiltrationFlowConfigModalProps {
  groupData?: any;
  onClose: () => void;
  onSave: (flowConfig: ('assessment' | 'ai-interview' | 'live-interview')[]) => void;
}

export function FiltrationFlowConfigModal({
  groupData,
  onClose,
  onSave
}: FiltrationFlowConfigModalProps) {
  const [filtrationModules, setFiltrationModules] = useState<FiltrationModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setIsLoading(true);
        const modulesData = await api.recruiter.getPipelineModules();

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
        console.error('Failed to fetch pipeline modules:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchModules();
  }, []);

  const [draggedModule, setDraggedModule] = useState<string | null>(null);

  const toggleModule = (moduleId: string) => {
    setFiltrationModules(filtrationModules.map(m =>
      m.id === moduleId ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const handleDragStart = (moduleId: string) => {
    setDraggedModule(moduleId);
  };

  const handleDragOver = (e: React.DragEvent, targetModuleId: string) => {
    e.preventDefault();
    if (!draggedModule || draggedModule === targetModuleId) return;

    const draggedIndex = filtrationModules.findIndex(m => m.id === draggedModule);
    const targetIndex = filtrationModules.findIndex(m => m.id === targetModuleId);

    const newModules = [...filtrationModules];
    const [removed] = newModules.splice(draggedIndex, 1);
    newModules.splice(targetIndex, 0, removed);

    // Update order
    const reorderedModules = newModules.map((m, index) => ({ ...m, order: index }));
    setFiltrationModules(reorderedModules);
  };

  const handleDragEnd = () => {
    setDraggedModule(null);
  };

  const handleSave = () => {
    const enabledFlow = filtrationModules
      .filter(m => m.enabled)
      .sort((a, b) => a.order - b.order)
      .map(m => m.type);

    onSave(enabledFlow);
  };

  const enabledCount = filtrationModules.filter(m => m.enabled).length;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-[16px] w-full max-w-[600px] h-[300px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" />
            <p className="text-[#6b7280] font-medium font-['Arimo',sans-serif]">Loading flow modules...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[600px] p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-[#111827] text-[20px] font-['Arimo',sans-serif]">
              Configure Filtration Flow
            </h3>
            <p className="text-[#6b7280] text-[14px] font-['Arimo',sans-serif] mt-1">
              {groupData?.name || 'New Group'} • {groupData?.selectedCandidates?.length || 0} candidates
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
            Select and order the filtration stages for this candidate group. Drag to reorder.
          </p>

          <div className="space-y-3">
            {filtrationModules.map((module) => (
              <div
                key={module.id}
                draggable={module.enabled}
                onDragStart={() => handleDragStart(module.id)}
                onDragOver={(e) => handleDragOver(e, module.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-4 p-4 rounded-[12px] border-2 transition-all ${module.enabled
                  ? 'border-[#6366f1] bg-[#eef2ff] cursor-move'
                  : 'border-[#e5e7eb] bg-white'
                  } ${draggedModule === module.id ? 'opacity-50' : ''}`}
              >
                {module.enabled && (
                  <GripVertical size={20} className="text-[#6b7280]" />
                )}

                <div className={`flex items-center justify-center w-[40px] h-[40px] rounded-[8px] ${module.enabled ? 'bg-[#6366f1]' : 'bg-[#e5e7eb]'
                  }`}>
                  <module.icon size={20} className={module.enabled ? 'text-white' : 'text-[#6b7280]'} />
                </div>

                <div className="flex-1">
                  <h4 className="font-['Arimo',sans-serif] text-[15px] text-[#111827] mb-1">
                    {module.name}
                  </h4>
                  {module.enabled && (
                    <p className="font-['Arimo',sans-serif] text-[12px] text-[#6366f1]">
                      Stage {module.order + 1}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => toggleModule(module.id)}
                  className={`flex items-center justify-center w-[24px] h-[24px] rounded-[6px] border-2 transition-all ${module.enabled
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
                .join(' → ')}`
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
            disabled={enabledCount === 0}
            className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
          >
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
