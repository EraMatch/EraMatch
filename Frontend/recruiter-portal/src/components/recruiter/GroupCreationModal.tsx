import { X, Users, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';

interface GroupCreationModalProps {
  selectedCount: number;
  onClose: () => void;
  onCreate: (groupData: any) => void;
}

export function GroupCreationModal({ selectedCount, onClose, onCreate }: GroupCreationModalProps) {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [assignedRecruiter, setAssignedRecruiter] = useState('');
  const [pipelineTemplate, setPipelineTemplate] = useState('standard');
  const [immediateActions, setImmediateActions] = useState({
    sendAssessment: false,
    scheduleAssessment: false,
    scheduleInterviews: false,
    bulkSemanticEval: false
  });
  const [recruiters, setRecruiters] = useState<{ id: string, name: string, role: string }[]>([]);
  const [pipelineTemplates, setPipelineTemplates] = useState<any[]>([]); // Dynamic templates
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [recruitersData, templatesData] = await Promise.all([
          api.recruiter.getRecruiters(),
          api.recruiter.getPipelineTemplates() // Fetch dynamic templates
        ]);
        setRecruiters(recruitersData);
        // Fallback if API returns empty or format is different (mocking behavior adaptation)
        if (templatesData && templatesData.length > 0) {
          setPipelineTemplates(templatesData);
        } else {
          // Fallback to defaults if API is empty/not ready during dev
          setPipelineTemplates([
            { value: 'standard', label: 'Standard Pipeline', description: 'Assessment → Interview → Review → Offer' },
            { value: 'technical', label: 'Technical Pipeline', description: 'Technical Assessment → Technical Interview → Team Interview → Offer' },
            { value: 'fast-track', label: 'Fast Track', description: 'Quick Assessment → Interview → Offer' },
            { value: 'custom', label: 'Custom Pipeline', description: 'Define your own stages' }
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch group creation data:', error);
        // Fallback on error
        setPipelineTemplates([
          { value: 'standard', label: 'Standard Pipeline', description: 'Assessment → Interview → Review → Offer' },
          { value: 'technical', label: 'Technical Pipeline', description: 'Technical Assessment → Technical Interview → Team Interview → Offer' },
          { value: 'fast-track', label: 'Fast Track', description: 'Quick Assessment → Interview → Offer' },
          { value: 'custom', label: 'Custom Pipeline', description: 'Define your own stages' }
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCreate = () => {
    if (!groupName.trim()) return;
    onCreate({
      groupName,
      description,
      assignedRecruiter,
      pipelineTemplate,
      immediateActions
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
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
            Organize {selectedCount} selected candidate{selectedCount > 1 ? 's' : ''} into a group
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-8 py-6 space-y-6">
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
              disabled={isLoading}
              className="w-full h-[44px] px-[14px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white disabled:bg-gray-100"
            >
              <option value="">{isLoading ? 'Loading recruiters...' : 'Select a recruiter...'}</option>
              {recruiters.map((recruiter) => (
                <option key={recruiter.id} value={recruiter.id}>
                  {recruiter.name} - {recruiter.role}
                </option>
              ))}
            </select>
          </div>

          {/* Pipeline Template */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
              Select Pipeline Template
            </label>
            <div className="space-y-2">
              {pipelineTemplates.map((template) => (
                <label
                  key={template.value}
                  className={`flex items-start p-[14px] rounded-[8px] border-2 cursor-pointer transition-colors ${pipelineTemplate === template.value
                    ? 'border-[#6366f1] bg-[#f5f3ff]'
                    : 'border-[#e5e7eb] hover:border-[#d1d5db]'
                    }`}
                >
                  <input
                    type="radio"
                    name="pipeline"
                    value={template.value}
                    checked={pipelineTemplate === template.value}
                    onChange={(e) => setPipelineTemplate(e.target.value)}
                    className="mt-[3px] w-[18px] h-[18px] text-[#6366f1] cursor-pointer"
                  />
                  <div className="ml-3 flex-1">
                    <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-1">
                      {template.label}
                    </div>
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      {template.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Immediate Actions */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
              Immediate Actions (Optional)
            </label>
            <div className="space-y-3 bg-[#f9fafb] rounded-[8px] p-[16px]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={immediateActions.sendAssessment}
                  onChange={(e) => setImmediateActions({ ...immediateActions, sendAssessment: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  Send Assessment
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={immediateActions.scheduleAssessment}
                  onChange={(e) => setImmediateActions({ ...immediateActions, scheduleAssessment: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  Schedule Assessment
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={immediateActions.scheduleInterviews}
                  onChange={(e) => setImmediateActions({ ...immediateActions, scheduleInterviews: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  Schedule Interviews
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={immediateActions.bulkSemanticEval}
                  onChange={(e) => setImmediateActions({ ...immediateActions, bulkSemanticEval: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Bulk Semantic Evaluation
                  </span>
                  <Sparkles size={14} className="text-[#6366f1]" />
                </div>
              </label>
            </div>
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
            disabled={!groupName.trim() || isLoading}
            className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? <span className="animate-spin text-white">⏳</span> : null}
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}
