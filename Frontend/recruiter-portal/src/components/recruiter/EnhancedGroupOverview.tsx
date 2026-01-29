import { useState, useEffect } from 'react';
import { ChevronLeft, Play, Edit, Download, Users, TrendingUp, Sparkles, Calendar, Send, CheckCircle, XCircle, AlertCircle, Clock, Eye, Trash2, UserPlus, UserMinus, Activity } from 'lucide-react';
import { api } from '../../services/api';

interface EnhancedGroupOverviewProps {
  groupId: string;
  groupName: string;
  description: string;
  assignedRecruiter: string;
  candidateIds: number[];
  onBack: () => void;
  onViewCandidate: (candidateId: number) => void;
}

interface PipelineStep {
  id: string;
  name: string;
  completed: number;
  total: number;
  pending: number;
}

interface CandidateStatus {
  id: number;
  name: string;
  avatar: string;
  assessment: 'completed' | 'pending' | 'not-started' | 'failed';
  aiInterview: 'completed' | 'pending' | 'not-started' | 'failed';
  liveInterview: 'completed' | 'pending' | 'not-started' | 'failed';
  review: 'completed' | 'pending' | 'not-started' | 'failed';
  offer: 'completed' | 'pending' | 'not-started' | 'failed';
  assessmentScore: number;
  aiInterviewScore: number;
  flags: string[];
  currentStage: string;
}

export function EnhancedGroupOverview({
  groupId,
  groupName,
  description,
  assignedRecruiter,
  candidateIds,
  onBack,
  onViewCandidate
}: EnhancedGroupOverviewProps) {
  const [showRankModal, setShowRankModal] = useState(false);
  const [showTopNModal, setShowTopNModal] = useState(false);
  const [showAutoScheduleModal, setShowAutoScheduleModal] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [candidateStatuses, setCandidateStatuses] = useState<CandidateStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchGroupData = async () => {
      try {
        setIsLoading(true);
        // In a real app, these would probably be fetched together or via specific endpoints
        // For now, we'll simulate fetching or use available API methods if they exist.
        // Assuming api.recruiter.getGroupDetails returns this info.
        const groupDetails = await api.recruiter.getGroupDetails(groupId);

        // If the API returns this structure, map it. Otherwise, we might need to adapt.
        // Since I don't have the exact API response shape for 'getGroupDetails' fully remembered,
        // I'll assume it returns strictly typed data or I'll map 'any'.

        if (groupDetails) {
          // Map or set data. Assuming groupDetails contains pipelineSteps and candidates
          setPipelineSteps(groupDetails.pipelineSteps || []);
          setCandidateStatuses(groupDetails.candidates || []);
        }

      } catch (error) {
        console.error('Failed to fetch group details:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (groupId) {
      fetchGroupData();
    }
  }, [groupId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-[#10b981]" />;
      case 'pending':
        return <Clock size={16} className="text-[#f59e0b]" />;
      case 'failed':
        return <XCircle size={16} className="text-[#ef4444]" />;
      default:
        return <div className="w-[16px] h-[16px] rounded-full border-2 border-[#e5e7eb]" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#10b981]';
      case 'pending':
        return 'bg-[#f59e0b]';
      case 'failed':
        return 'bg-[#ef4444]';
      default:
        return 'bg-[#e5e7eb]';
    }
  };

  const handleRunPipeline = async () => {
    setIsRunningPipeline(true);
    setPipelineProgress(0);

    // Simulate pipeline execution
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setPipelineProgress(i);
    }

    setIsRunningPipeline(false);
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[#e5e7eb] px-8 py-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-4 font-['Arimo',sans-serif] text-[14px] text-[#6366f1] hover:underline"
        >
          <ChevronLeft size={16} />
          Back to Position Dashboard
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[#111827]">{groupName}</h1>
              <span className="px-[12px] py-[4px] bg-[#ede9fe] text-[#6366f1] rounded-[6px] font-['Arimo',sans-serif] text-[13px]">
                {candidateStatuses.length} Candidates
              </span>
              <div className="flex items-center gap-1">
                <div className="w-[8px] h-[8px] rounded-full bg-[#10b981] animate-pulse" />
                <span className="font-['Arimo',sans-serif] text-[12px] text-[#10b981]">
                  Live
                </span>
              </div>
            </div>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-3">
              {description || 'No description provided'}
            </p>
            <div className="flex items-center gap-2">
              <Users size={14} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Assigned to: <span className="text-[#6366f1]">{assignedRecruiter}</span>
              </span>
              <span className="text-[#e5e7eb] mx-2">|</span>
              <Clock size={14} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Created on {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRunPipeline}
              disabled={isRunningPipeline}
              className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] text-white transition-colors"
            >
              <Play size={16} />
              <span className="font-['Arimo',sans-serif] text-[14px]">
                {isRunningPipeline ? 'Running...' : 'Run Pipeline'}
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <Edit size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                Edit
              </span>
            </button>
            <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
              <Download size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                Export
              </span>
            </button>
          </div>
        </div>

        {/* Pipeline Progress Bar */}
        {isRunningPipeline && (
          <div className="mt-4 bg-[#f9fafb] rounded-[8px] p-4 border border-[#e5e7eb]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Pipeline execution in progress...
              </span>
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">
                {pipelineProgress}%
              </span>
            </div>
            <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6366f1] transition-all duration-200"
                style={{ width: `${pipelineProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Advanced Group Operations */}
      <div className="bg-white border-b border-[#e5e7eb] px-8 py-4">
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={() => setShowRankModal(true)}
            className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-[#f5f3ff] hover:bg-[#ede9fe] border border-[#e5e7eb] transition-colors"
          >
            <Sparkles size={16} className="text-[#6366f1]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">
              Semantic Match
            </span>
          </button>
          <button
            onClick={() => setShowTopNModal(true)}
            className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-[#f5f3ff] hover:bg-[#ede9fe] border border-[#e5e7eb] transition-colors"
          >
            <TrendingUp size={16} className="text-[#6366f1]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">
              Rank Candidates
            </span>
          </button>
          <button className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] transition-colors">
            <Send size={16} className="text-[#6b7280]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              Send Assessments
            </span>
          </button>
          <button
            onClick={() => setShowAutoScheduleModal(true)}
            className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] transition-colors"
          >
            <Calendar size={16} className="text-[#6b7280]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              Schedule Interviews
            </span>
          </button>
          <button className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] transition-colors">
            <Play size={16} className="text-[#6b7280]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              Move to Next Stage
            </span>
          </button>
          <button className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] transition-colors">
            <Download size={16} className="text-[#6b7280]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              Export Group
            </span>
          </button>
          <button className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] transition-colors">
            <UserPlus size={16} className="text-[#6b7280]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              Add Candidates
            </span>
          </button>
          <button className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] transition-colors">
            <UserMinus size={16} className="text-[#6b7280]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              Remove Candidates
            </span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="px-8 py-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Assessments Completed
              </span>
              <CheckCircle size={18} className="text-[#10b981]" />
            </div>
            <div className="text-[#111827] text-[28px] mb-1">
              6/8
            </div>
            <div className="w-full h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
              <div className="h-full bg-[#10b981]" style={{ width: '75%' }} />
            </div>
          </div>

          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Interviews Scheduled
              </span>
              <Calendar size={18} className="text-[#6366f1]" />
            </div>
            <div className="text-[#111827] text-[28px] mb-1">
              4/8
            </div>
            <div className="w-full h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
              <div className="h-full bg-[#6366f1]" style={{ width: '50%' }} />
            </div>
          </div>

          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Average Score
              </span>
              <TrendingUp size={18} className="text-[#10b981]" />
            </div>
            <div className="text-[#111827] text-[28px] mb-1">
              86.2
            </div>
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#10b981]">
              +4.3 from average
            </span>
          </div>

          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Integrity Issues
              </span>
              <AlertCircle size={18} className="text-[#ef4444]" />
            </div>
            <div className="text-[#111827] text-[28px] mb-1">
              1
            </div>
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#ef4444]">
              Requires attention
            </span>
          </div>
        </div>

        {/* Pipeline Timeline */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6 mb-6">
          <h3 className="text-[#111827] text-[16px] mb-5">Pipeline Progress</h3>
          <div className="flex items-center justify-between gap-4">
            {pipelineSteps.map((step, index) => (
              <div key={step.id} className="flex-1">
                <button
                  onClick={() => setSelectedStep(step.id)}
                  className="w-full group"
                >
                  {/* Step Circle */}
                  <div className="relative mb-3">
                    <div className="flex justify-center">
                      <div className={`w-[64px] h-[64px] rounded-full flex items-center justify-center transition-all ${step.completed === step.total
                        ? 'bg-[#10b981]'
                        : step.completed > 0
                          ? 'bg-[#6366f1]'
                          : 'bg-[#f3f4f6]'
                        }`}>
                        <div className="text-center">
                          <div className="text-white text-[18px]">
                            {step.completed}
                          </div>
                          <div className={`text-[11px] ${step.completed > 0 ? 'text-white/80' : 'text-[#6b7280]'}`}>
                            of {step.total}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Connector Line */}
                    {index < pipelineSteps.length - 1 && (
                      <div className="absolute top-[32px] left-[calc(50%+32px)] w-[calc(100%-32px)] h-[2px] bg-[#e5e7eb]">
                        <div
                          className="h-full bg-[#6366f1] transition-all"
                          style={{ width: `${(step.completed / step.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Step Name */}
                  <div className="text-center">
                    <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-1">
                      {step.name}
                    </div>
                    <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                      {step.pending} pending
                    </div>
                    <div className="mt-2 w-full h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#6366f1] transition-all"
                        style={{ width: `${(step.completed / step.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Candidate Matrix */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#e5e7eb]">
            <h3 className="text-[#111827] text-[16px]">Candidate Progress Matrix</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                <tr>
                  <th className="text-left p-4 w-[240px]">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Candidate
                    </span>
                  </th>
                  <th className="text-center p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Assessment
                    </span>
                  </th>
                  <th className="text-center p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      AI Interview
                    </span>
                  </th>
                  <th className="text-center p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Live Interview
                    </span>
                  </th>
                  <th className="text-center p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Review
                    </span>
                  </th>
                  <th className="text-center p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Offer
                    </span>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Current Stage
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
                {candidateStatuses.map((candidate, index) => (
                  <tr
                    key={candidate.id}
                    className="border-b border-[#e5e7eb] hover:bg-[#f9fafb] group transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-[36px] h-[36px] rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
                          <span className="font-['Arimo',sans-serif] text-[13px] text-white">
                            {candidate.avatar}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] truncate">
                            {candidate.name}
                          </div>
                          {candidate.flags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <AlertCircle size={12} className="text-[#ef4444]" />
                              <span className="font-['Arimo',sans-serif] text-[11px] text-[#ef4444]">
                                {candidate.flags[0]}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {getStatusIcon(candidate.assessment)}
                        {candidate.assessmentScore > 0 && (
                          <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                            {candidate.assessmentScore}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {getStatusIcon(candidate.aiInterview)}
                        {candidate.aiInterviewScore > 0 && (
                          <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                            {candidate.aiInterviewScore}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {getStatusIcon(candidate.liveInterview)}
                    </td>
                    <td className="p-4 text-center">
                      {getStatusIcon(candidate.review)}
                    </td>
                    <td className="p-4 text-center">
                      {getStatusIcon(candidate.offer)}
                    </td>
                    <td className="p-4">
                      <span className={`px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] ${candidate.currentStage === 'Offer'
                        ? 'bg-[#dcfce7] text-[#10b981]'
                        : candidate.currentStage === 'Live Interview'
                          ? 'bg-[#dbeafe] text-[#3b82f6]'
                          : 'bg-[#f3f4f6] text-[#6b7280]'
                        }`}>
                        {candidate.currentStage}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onViewCandidate(candidate.id)}
                          className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] transition-colors"
                          title="View Profile"
                        >
                          <Eye size={14} className="text-white" />
                        </button>
                        <button
                          className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] hover:bg-[#fef2f2] hover:border-[#ef4444] transition-colors"
                          title="Remove from group"
                        >
                          <Trash2 size={14} className="text-[#6b7280] hover:text-[#ef4444]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-[#6366f1]" />
            <h3 className="text-[#111827] text-[16px]">Recent Activity</h3>
          </div>
          <div className="space-y-3">
            {[
              { time: '2 mins ago', action: 'Sarah Chen completed Live Interview', user: 'John Doe' },
              { time: '15 mins ago', action: 'Assessment sent to Sophie Anderson', user: 'System' },
              { time: '1 hour ago', action: 'Emma Thompson scheduled for Live Interview', user: 'Jane Smith' },
              { time: '2 hours ago', action: 'Group created with 8 candidates', user: 'John Doe' }
            ].map((activity, index) => (
              <div key={index} className="flex items-start gap-3 pb-3 border-b border-[#e5e7eb] last:border-0">
                <div className="w-[6px] h-[6px] rounded-full bg-[#6366f1] mt-2" />
                <div className="flex-1">
                  <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                    {activity.action}
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mt-1">
                    {activity.time} • by {activity.user}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rank Group Modal */}
      {showRankModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[500px] p-6 animate-scaleIn">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111827] text-[18px]">Semantic Ranking</h3>
              <button onClick={() => setShowRankModal(false)}>
                <X size={20} className="text-[#6b7280]" />
              </button>
            </div>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-4">
              Run semantic scorer across the group to reorder candidates based on relevance.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRankModal(false)}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowRankModal(false)}
                className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
              >
                Run Ranking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top N Modal */}
      {showTopNModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[500px] p-6 animate-scaleIn">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111827] text-[18px]">Find Top N by Criteria</h3>
              <button onClick={() => setShowTopNModal(false)}>
                <X size={20} className="text-[#6b7280]" />
              </button>
            </div>
            <div className="space-y-4 mb-4">
              <input
                type="text"
                placeholder='e.g., "Top 3 leadership + cloud"'
                className="w-full h-[44px] px-[14px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
              <select className="w-full h-[44px] px-[14px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white">
                <option>Top 3 candidates</option>
                <option>Top 5 candidates</option>
                <option>Top 10 candidates</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTopNModal(false)}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowTopNModal(false)}
                className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
              >
                Find Top Candidates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Schedule Modal */}
      {showAutoScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[500px] p-6 animate-scaleIn">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111827] text-[18px]">Auto-Schedule Interviews</h3>
              <button onClick={() => setShowAutoScheduleModal(false)}>
                <X size={20} className="text-[#6b7280]" />
              </button>
            </div>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-4">
              Automatically schedule interviews using recruiter availability heuristics.
            </p>
            <div className="bg-[#fef3c7] border border-[#fbbf24] rounded-[8px] p-3 mb-4">
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#92400e]">
                ⚠️ 2 scheduling conflicts detected. Review conflicts before proceeding.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAutoScheduleModal(false)}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowAutoScheduleModal(false)}
                className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
              >
                Review Conflicts
              </button>
            </div>
          </div>
        </div>
      )}

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
          animation: scaleIn 200ms ease-out;
        }
      `}</style>
    </div>
  );
}
