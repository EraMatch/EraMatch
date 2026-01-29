import { useState, useEffect } from 'react';
import { X, Users, Send, Video, Calendar, TrendingUp, FileText } from 'lucide-react';
import { api } from '../../services/api';

interface SimpleGroupCreationModalProps {
  onClose: () => void;
  onCreate: (groupData: any) => void;
}

export function SimpleGroupCreationModal({
  onClose,
  onCreate
}: SimpleGroupCreationModalProps) {
  const [groupName, setGroupName] = useState('');
  const [assignedRecruiter, setAssignedRecruiter] = useState('');

  // Optional immediate actions
  const [sendAssessmentNow, setSendAssessmentNow] = useState(false);
  const [assignRecordedAI, setAssignRecordedAI] = useState(false);
  const [scheduleLiveAI, setScheduleLiveAI] = useState(false);
  const [runSemanticRanking, setRunSemanticRanking] = useState(false);
  const [addNotes, setAddNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recruiters, setRecruiters] = useState<{ id: string, name: string, role: string }[]>([]);

  useEffect(() => {
    const fetchRecruiters = async () => {
      try {
        setIsLoading(true);
        const data = await api.recruiter.getRecruiters();
        setRecruiters(data);
      } catch (error) {
        console.error('Failed to fetch recruiters:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecruiters();
  }, []);

  const handleCreate = () => {
    if (!groupName.trim()) return;
    onCreate({
      groupName,
      assignedRecruiter,
      immediateActions: {
        sendAssessmentNow,
        assignRecordedAI,
        scheduleLiveAI,
        runSemanticRanking,
        addNotes,
        notes: addNotes ? notes : ''
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-[16px] w-full max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col"
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
            Organize candidates into a managed group
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-8 py-6 space-y-6">
          {/* Group Name */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
              Group Name *
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Senior Backend Engineers - Q1 2025"
              className="w-full h-[44px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            />
          </div>

          {/* Assigned Recruiter */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
              Assigned Recruiter
            </label>
            <select
              value={assignedRecruiter}
              onChange={(e) => setAssignedRecruiter(e.target.value)}
              disabled={isLoading}
              className="w-full h-[44px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white disabled:bg-gray-100"
            >
              <option value="">{isLoading ? 'Loading recruiters...' : 'Select a recruiter...'}</option>
              {recruiters.map((recruiter) => (
                <option key={recruiter.id} value={recruiter.id}>
                  {recruiter.name} - {recruiter.role}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Immediate Actions */}
          <div className="border-t border-[#e5e7eb] pt-6">
            <div className="mb-4">
              <h3 className="text-[#111827] mb-1">Optional Immediate Actions</h3>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Choose actions to apply immediately after group creation
              </p>
            </div>

            <div className="space-y-3">
              {/* Send Assessment Now */}
              <label className="flex items-center gap-3 p-3 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={sendAssessmentNow}
                  onChange={(e) => setSendAssessmentNow(e.target.checked)}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] focus:ring-2 focus:ring-[#6366f1]"
                />
                <Send size={18} className="text-[#6366f1]" />
                <div className="flex-1">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Send Assessment Now
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Immediately send technical assessment to all candidates
                  </div>
                </div>
              </label>

              {/* Assign Recorded AI Interview */}
              <label className="flex items-center gap-3 p-3 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={assignRecordedAI}
                  onChange={(e) => setAssignRecordedAI(e.target.checked)}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] focus:ring-2 focus:ring-[#6366f1]"
                />
                <Video size={18} className="text-[#8b5cf6]" />
                <div className="flex-1">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Assign Recorded AI Interview
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Send recorded AI interview to candidates
                  </div>
                </div>
              </label>

              {/* Schedule Live AI Interview */}
              <label className="flex items-center gap-3 p-3 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={scheduleLiveAI}
                  onChange={(e) => setScheduleLiveAI(e.target.checked)}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] focus:ring-2 focus:ring-[#6366f1]"
                />
                <Calendar size={18} className="text-[#ec4899]" />
                <div className="flex-1">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Schedule Live AI Interview
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Open scheduling interface for live AI interviews
                  </div>
                </div>
              </label>

              {/* Run Semantic Ranking */}
              <label className="flex items-center gap-3 p-3 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={runSemanticRanking}
                  onChange={(e) => setRunSemanticRanking(e.target.checked)}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] focus:ring-2 focus:ring-[#6366f1]"
                />
                <TrendingUp size={18} className="text-[#10b981]" />
                <div className="flex-1">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Run Semantic Ranking
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Automatically rank candidates by JD matching
                  </div>
                </div>
              </label>

              {/* Add Notes */}
              <label className="flex items-start gap-3 p-3 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={addNotes}
                  onChange={(e) => setAddNotes(e.target.checked)}
                  className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] focus:ring-2 focus:ring-[#6366f1] mt-1"
                />
                <FileText size={18} className="text-[#f59e0b] mt-1" />
                <div className="flex-1">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Add Notes
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">
                    Add context or instructions for this group
                  </div>
                  {addNotes && (
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add internal notes about this group..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-[6px] border border-[#d1d5db] font-['Arimo',sans-serif] text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-[#e5e7eb] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
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
    </div>
  );
}
