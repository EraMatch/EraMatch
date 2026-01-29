import { useState, useEffect } from 'react';
import { ChevronLeft, Users, Sparkles, Send, Calendar, MoveRight, Download, Edit, UserPlus, UserMinus, TrendingUp, AlertTriangle, Eye } from 'lucide-react';
import { api } from '../../services/api';

interface GroupOverviewProps {
  groupId: string;
  groupName: string;
  description: string;
  assignedRecruiter: string;
  candidateIds: number[];
  onBack: () => void;
  onViewCandidate: (candidateId: number) => void;
}

interface PipelineStage {
  name: string;
  completed: number;
  pending: number;
  total: number;
}

interface GroupCandidate {
  id: number;
  name: string;
  email: string;
  score: number;
  antiCheating: boolean;
  pipelineStatus: {
    assessment: 'completed' | 'pending' | 'not-started';
    interview: 'completed' | 'pending' | 'not-started';
    review: 'completed' | 'pending' | 'not-started';
    offer: 'completed' | 'pending' | 'not-started';
  };
}

export function GroupOverview({
  groupId,
  groupName,
  description,
  assignedRecruiter,
  candidateIds,
  onBack,
  onViewCandidate
}: GroupOverviewProps) {
  const [candidates, setCandidates] = useState<GroupCandidate[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch group details from API
  useEffect(() => {
    const fetchGroupDetails = async () => {
      try {
        setLoading(true);
        const data = await api.recruiter.getGroupDetails(groupId);
        setCandidates(data.candidates as GroupCandidate[]);
        setPipelineStages(data.pipelineStages);
      } catch (error) {
        console.error('Failed to fetch group details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGroupDetails();
  }, [groupId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'not-started': return '#e5e7eb';
      default: return '#e5e7eb';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'pending': return 'Pending';
      case 'not-started': return 'Not Started';
      default: return 'Unknown';
    }
  };

  return (
    <div className="h-full w-full overflow-auto">
      <div className="max-w-[1400px] mx-auto px-[48px] py-[24px]">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 mb-4 text-[#6b7280] hover:text-[#111827] transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="font-['Arimo',sans-serif] text-[14px]">Back to Position Dashboard</span>
          </button>

          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="w-[56px] h-[56px] rounded-[12px] bg-[#6366f1] flex items-center justify-center">
                <Users size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-[#111827] mb-2">{groupName}</h1>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-2">
                  {description || 'No description provided'}
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Recruiter:
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                      {assignedRecruiter || 'Unassigned'}
                    </span>
                  </div>
                  <div className="w-[1px] h-[14px] bg-[#e5e7eb]" />
                  <div className="flex items-center gap-2">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Candidates:
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                      {candidates.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button className="flex items-center gap-2 h-[36px] px-[16px] rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors">
              <Edit size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Edit Group
              </span>
            </button>
          </div>
        </div>

        {/* Advanced Group Operations */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6 mb-6">
          <h3 className="text-[#111827] mb-4">Group Operations</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#6366f1] bg-white hover:bg-[#f5f3ff] transition-colors">
              <Sparkles size={16} className="text-[#6366f1]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">
                Semantic Match
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#6366f1] bg-white hover:bg-[#f5f3ff] transition-colors">
              <TrendingUp size={16} className="text-[#6366f1]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">
                Rank Candidates
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <Send size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Send Assessments
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <Calendar size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Schedule Interviews
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <MoveRight size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Move to Next Stage
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <Download size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Export Group
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <UserPlus size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Add Candidates
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <UserMinus size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Remove Candidates
              </span>
            </button>
          </div>
        </div>

        {/* Pipeline Progress Tracker */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6 mb-6">
          <h3 className="text-[#111827] mb-6">Pipeline Progress</h3>
          <div className="grid grid-cols-4 gap-4">
            {pipelineStages.map((stage, index) => (
              <div key={index} className="relative">
                <div className="bg-[#f9fafb] rounded-[10px] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      {stage.name}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      {stage.completed}/{stage.total}
                    </span>
                  </div>
                  <div className="w-full h-[8px] bg-[#e5e7eb] rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-[#6366f1] rounded-full transition-all"
                      style={{ width: `${(stage.completed / stage.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[#6b7280]">
                    <span className="font-['Arimo',sans-serif] text-[12px]">
                      {stage.pending} pending
                    </span>
                  </div>
                </div>
                {index < pipelineStages.length - 1 && (
                  <div className="absolute top-1/2 -right-2 w-[16px] h-[2px] bg-[#e5e7eb] z-10" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Candidates Table */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#e5e7eb]">
            <h3 className="text-[#111827]">Candidates</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                <tr>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Name
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Email
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Score
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Assessment
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Interview
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Review
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Offer
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Flags
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate, index) => (
                  <tr
                    key={candidate.id}
                    className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors ${index === candidates.length - 1 ? 'border-b-0' : ''
                      }`}
                  >
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                        {candidate.name}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {candidate.email}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                        {candidate.score}
                      </span>
                    </td>
                    <td className="p-4">
                      <div
                        className="inline-flex items-center px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px]"
                        style={{
                          backgroundColor: `${getStatusColor(candidate.pipelineStatus.assessment)}20`,
                          color: getStatusColor(candidate.pipelineStatus.assessment)
                        }}
                      >
                        {getStatusText(candidate.pipelineStatus.assessment)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div
                        className="inline-flex items-center px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px]"
                        style={{
                          backgroundColor: `${getStatusColor(candidate.pipelineStatus.interview)}20`,
                          color: getStatusColor(candidate.pipelineStatus.interview)
                        }}
                      >
                        {getStatusText(candidate.pipelineStatus.interview)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div
                        className="inline-flex items-center px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px]"
                        style={{
                          backgroundColor: `${getStatusColor(candidate.pipelineStatus.review)}20`,
                          color: getStatusColor(candidate.pipelineStatus.review)
                        }}
                      >
                        {getStatusText(candidate.pipelineStatus.review)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div
                        className="inline-flex items-center px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px]"
                        style={{
                          backgroundColor: `${getStatusColor(candidate.pipelineStatus.offer)}20`,
                          color: getStatusColor(candidate.pipelineStatus.offer)
                        }}
                      >
                        {getStatusText(candidate.pipelineStatus.offer)}
                      </div>
                    </td>
                    <td className="p-4">
                      {candidate.antiCheating && (
                        <div className="flex items-center gap-1 text-[#ef4444]">
                          <AlertTriangle size={14} />
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onViewCandidate(candidate.id)}
                          className="flex items-center gap-2 h-[32px] px-[12px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] transition-colors"
                        >
                          <Eye size={14} className="text-white" />
                          <span className="font-['Arimo',sans-serif] text-[12px] text-white">
                            Profile
                          </span>
                        </button>
                        <button className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors">
                          <UserMinus size={14} className="text-[#ef4444]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
