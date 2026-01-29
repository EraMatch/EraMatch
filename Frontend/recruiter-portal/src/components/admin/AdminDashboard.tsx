import { useState, useEffect } from 'react';
import { Eye, ArrowUpDown, X, TrendingUp, TrendingDown, AlertTriangle, ArrowLeft, Download, Users, Briefcase, Target, Clock, Award, Activity, AlertOctagon, CheckCircle, XCircle, BarChart3, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { api, JobPosition, Project, PositionGroup } from '../../services/api';

interface AdminDashboardProps {
  onSignOut: () => void;
}

type ViewMode = 'dashboard' | 'projects' | 'positions' | 'groups' | 'insights';

export function AdminDashboard({ onSignOut }: AdminDashboardProps) {
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedPosition, setSelectedPosition] = useState<JobPosition | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPositionForGroups, setSelectedPositionForGroups] = useState<JobPosition | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PositionGroup | null>(null);

  // State for data
  const [isLoading, setIsLoading] = useState(true);
  const [jobPositions, setJobPositions] = useState<JobPosition[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [positionGroups, setPositionGroups] = useState<PositionGroup[]>([]);
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [avgTimeToFill, setAvgTimeToFill] = useState(0);
  const [groupAnalytics, setGroupAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const stats = await api.admin.getDashboardStats();

        setProjects(stats.projects || []);
        setPositionGroups(stats.positionGroups || []);
        setJobPositions(stats.jobPositions || []);
        setPipelineData(stats.pipelineData || []);
        setAvgTimeToFill(stats.avgTimeToFill || 0);

      } catch (error) {
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchGroupAnalytics = async () => {
      if (viewMode === 'insights' && selectedGroup) {
        setLoadingAnalytics(true);
        try {
          const analytics = await api.admin.getGroupAnalytics(selectedGroup.id.toString());
          setGroupAnalytics(analytics);
        } catch (error) {
          toast.error('Failed to load group analytics');
        } finally {
          setLoadingAnalytics(false);
        }
      }
    };
    fetchGroupAnalytics();
  }, [viewMode, selectedGroup]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const openPositions = jobPositions.filter(p => p.status === 'Open').length;
  const interviewStagePositions = jobPositions.filter(p => p.status === 'Interview').length;
  const closedPositions = jobPositions.filter(p => p.status === 'Closed').length;
  // avgTimeToFill, pipelineData are now from API/State

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Open':
      case 'Active':
        return 'bg-[#dcfce7] text-[#16a34a]';
      case 'Interview':
      case 'Processing':
        return 'bg-[#dbeafe] text-[#2563eb]';
      case 'Closed':
      case 'Completed':
        return 'bg-[#f3f4f6] text-[#6b7280]';
      case 'On Hold':
        return 'bg-[#fef3c7] text-[#d97706]';
      default:
        return 'bg-[#f3f4f6] text-[#6b7280]';
    }
  };

  const exportPositionInsights = (position: JobPosition) => {
    const csvContent = `Position: ${position.jobTitle}
Department: ${position.department}
Total Candidates: ${position.candidatesCount}
Status: ${position.status}

Stage,Count,Percentage
Applied,${position.candidatesCount},100%
Assessment,${Math.floor(position.candidatesCount * 0.78)},78%
Interview,${Math.floor(position.candidatesCount * 0.52)},52%
Offer,${Math.floor(position.candidatesCount * 0.24)},24%
Hired,${Math.floor(position.candidatesCount * 0.16)},16%`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Position_Insights_${position.jobTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Position insights exported successfully!');
  };

  // If viewing group insights, show group-level analytics with phase-specific metrics
  if (viewMode === 'insights' && selectedGroup) {
    if (loadingAnalytics || !groupAnalytics) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      );
    }

    const { totalCandidates } = groupAnalytics;
    const { assessment: assessmentData, aiInterview: aiInterviewData, liveInterview: liveInterviewData } = groupAnalytics.phases;

    return (
      <div className="px-12 py-8">
        {/* Header with Back Button */}
        <div className="mb-8">
          <button
            onClick={() => setViewMode('groups')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
          >
            <ArrowLeft size={20} />
            <span className="font-['Arimo',sans-serif] text-[14px]">Back to Groups</span>
          </button>
          <div>
            <h1 className="text-gray-900 text-3xl mb-2">Group Insights</h1>
            <p className="text-gray-500">
              {selectedGroup.groupName} • {selectedGroup.positionTitle}
            </p>
          </div>
        </div>

        {/* Overview Stats Grid */}
        <div className="grid grid-cols-5 gap-6 mb-8">
          {/* NEW: Initial Match vs Evaluated Card */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl p-6 shadow-sm border-2 border-indigo-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-indigo-700 text-sm font-medium">Match Accuracy</span>
              <Target className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-5xl text-indigo-900 mb-1">
              {(() => {
                // Calculate initial match vs evaluated performance from API data
                const avgInitialMatch = groupAnalytics?.initialMatchScore || 0;
                const avgEvaluated = assessmentData && aiInterviewData
                  ? (assessmentData.avgScore + aiInterviewData.avgScore) / 2
                  : assessmentData ? assessmentData.avgScore : aiInterviewData ? aiInterviewData.avgScore : avgInitialMatch;

                if (avgInitialMatch === 0 && avgEvaluated === 0) return '0%';

                const accuracy = 100 - Math.abs(avgInitialMatch - avgEvaluated);
                return Math.round(accuracy) + '%';
              })()}
            </div>
            <div className="text-xs text-indigo-600 mb-2">
              Initial: {groupAnalytics?.initialMatchScore || 0}% → Actual: {assessmentData && aiInterviewData
                ? Math.round((assessmentData.avgScore + aiInterviewData.avgScore) / 2)
                : assessmentData ? Math.round(assessmentData.avgScore) : aiInterviewData ? Math.round(aiInterviewData.avgScore) : 0}%
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
              {(() => {
                const avgInitialMatch = groupAnalytics?.initialMatchScore || 0;
                const avgEvaluated = assessmentData && aiInterviewData
                  ? (assessmentData.avgScore + aiInterviewData.avgScore) / 2
                  : assessmentData ? assessmentData.avgScore : 0;
                return avgEvaluated >= avgInitialMatch ? <TrendingUp size={12} /> : <TrendingDown size={12} />;
              })()}
              <span>{(() => {
                const avgInitialMatch = groupAnalytics?.initialMatchScore || 0;
                const avgEvaluated = assessmentData && aiInterviewData
                  ? (assessmentData.avgScore + aiInterviewData.avgScore) / 2
                  : assessmentData ? assessmentData.avgScore : 0;
                const delta = Math.abs(avgEvaluated - avgInitialMatch);
                return avgEvaluated >= avgInitialMatch ? `+${delta.toFixed(1)} pts better` : `${delta.toFixed(1)} pts lower`;
              })()}</span>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm">Total Candidates</span>
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-5xl text-gray-900 mb-1">{totalCandidates}</div>
            <div className="text-xs text-gray-500">in this group</div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm">Active Phases</span>
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-5xl text-gray-900 mb-1">
              {[selectedGroup.hasAssessment, selectedGroup.hasAIInterview, selectedGroup.hasLiveInterview].filter(Boolean).length}
            </div>
            <div className="text-xs text-gray-500">configured phases</div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm">Overall Progress</span>
              <BarChart3 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-5xl text-gray-900 mb-1">
              {Math.floor((
                (assessmentData ? assessmentData.completed / totalCandidates : 0) +
                (aiInterviewData ? aiInterviewData.completed / totalCandidates : 0) +
                (liveInterviewData ? liveInterviewData.completed / totalCandidates : 0)
              ) / [selectedGroup.hasAssessment, selectedGroup.hasAIInterview, selectedGroup.hasLiveInterview].filter(Boolean).length * 100)}%
            </div>
            <div className="text-xs text-emerald-600">On track</div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm">Integrity Score</span>
              <Award className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-5xl text-gray-900 mb-1">
              {assessmentData ? 100 - Math.floor((assessmentData.cheatingDetected / totalCandidates) * 100) : 'N/A'}
              {assessmentData && '%'}
            </div>
            <div className="text-xs text-gray-500">
              {assessmentData ? `${assessmentData.cheatingDetected} flagged` : 'No assessment'}
            </div>
          </div>
        </div>

        {/* Filtration Flow Progress */}
        <div className="bg-white rounded-3xl p-8 shadow-sm mb-8">
          <div className="mb-6">
            <h3 className="text-gray-900 mb-2">Filtration Flow Progress</h3>
            <p className="text-gray-500 text-sm">Candidate progression through configured phases</p>
          </div>

          <div className="space-y-6">
            {selectedGroup.hasAssessment && assessmentData && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#374151] min-w-[140px]">
                      Assessment Phase
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#6b7280]">
                      {assessmentData.completed}/{totalCandidates} completed
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                      {Math.floor((assessmentData.completed / totalCandidates) * 100)}%
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-emerald-600">
                      {assessmentData.passRate}% pass rate
                    </span>
                  </div>
                </div>
                <div className="h-14 bg-[#f3f4f6] rounded-xl overflow-hidden">
                  <div
                    className="h-full rounded-xl transition-all duration-500 flex items-center justify-between px-5"
                    style={{
                      width: `${(assessmentData.completed / totalCandidates) * 100}%`,
                      backgroundColor: '#6366f1'
                    }}
                  >
                    <span className="font-['Arimo',sans-serif] text-[14px] text-white font-medium">
                      Technical Assessment
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[16px] text-white font-semibold">
                      {assessmentData.completed}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {selectedGroup.hasAIInterview && aiInterviewData && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#374151] min-w-[140px]">
                      AI Interview Phase
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#6b7280]">
                      {aiInterviewData.completed}/{totalCandidates} completed
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                      {Math.floor((aiInterviewData.completed / totalCandidates) * 100)}%
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-purple-600">
                      {aiInterviewData.passRate}% pass rate
                    </span>
                  </div>
                </div>
                <div className="h-14 bg-[#f3f4f6] rounded-xl overflow-hidden">
                  <div
                    className="h-full rounded-xl transition-all duration-500 flex items-center justify-between px-5"
                    style={{
                      width: `${(aiInterviewData.completed / totalCandidates) * 100}%`,
                      backgroundColor: '#8b5cf6'
                    }}
                  >
                    <span className="font-['Arimo',sans-serif] text-[14px] text-white font-medium">
                      AI Video Interview
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[16px] text-white font-semibold">
                      {aiInterviewData.completed}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {selectedGroup.hasLiveInterview && liveInterviewData && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#374151] min-w-[140px]">
                      Live Interview Phase
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#6b7280]">
                      {liveInterviewData.completed}/{liveInterviewData.scheduled} completed
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                      {Math.floor((liveInterviewData.completed / liveInterviewData.scheduled) * 100)}%
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-emerald-600">
                      {Math.floor((liveInterviewData.recommended / liveInterviewData.completed) * 100)}% recommended
                    </span>
                  </div>
                </div>
                <div className="h-14 bg-[#f3f4f6] rounded-xl overflow-hidden">
                  <div
                    className="h-full rounded-xl transition-all duration-500 flex items-center justify-between px-5"
                    style={{
                      width: `${(liveInterviewData.completed / liveInterviewData.scheduled) * 100}%`,
                      backgroundColor: '#10b981'
                    }}
                  >
                    <span className="font-['Arimo',sans-serif] text-[14px] text-white font-medium">
                      Live Interview
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[16px] text-white font-semibold">
                      {liveInterviewData.completed}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Phase-Specific Analytics Grid */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Assessment Phase Analytics */}
          {selectedGroup.hasAssessment && assessmentData && (
            <div className="bg-white rounded-3xl p-8 shadow-sm">
              <div className="mb-6">
                <h3 className="text-gray-900 mb-2">Assessment Phase Analytics</h3>
                <p className="text-gray-500 text-sm">Technical assessment scores and integrity metrics</p>
              </div>

              {/* Score Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#f9fafb] rounded-2xl p-5">
                  <div className="text-sm text-gray-500 mb-2">Average Score</div>
                  <div className="text-4xl text-gray-900">{assessmentData.avgScore}%</div>
                </div>
                <div className="bg-[#f9fafb] rounded-2xl p-5">
                  <div className="text-sm text-gray-500 mb-2">Pass Rate</div>
                  <div className="text-4xl text-emerald-600">{assessmentData.passRate}%</div>
                </div>
              </div>

              {/* Score Distribution */}
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700">Passed (≥70%)</span>
                    <span className="text-sm text-gray-900 font-medium">
                      {Math.floor(assessmentData.completed * (assessmentData.passRate / 100))} candidates
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${assessmentData.passRate}%` }}
                    >
                      <span className="text-sm text-white font-medium">{assessmentData.passRate}%</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700">Failed (&lt;70%)</span>
                    <span className="text-sm text-gray-900 font-medium">
                      {Math.floor(assessmentData.completed * ((100 - assessmentData.passRate) / 100))} candidates
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-gray-400 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${100 - assessmentData.passRate}%` }}
                    >
                      <span className="text-sm text-white font-medium">{100 - assessmentData.passRate}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cheating Detection Summary */}
              <div className="mt-6 p-5 bg-amber-50 rounded-2xl border border-amber-200">
                <div className="flex items-start gap-3">
                  <AlertOctagon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm text-gray-900 font-medium mb-2">Integrity Monitoring</div>
                    <div className="text-sm text-gray-600">
                      {assessmentData.cheatingDetected} candidates flagged for potential irregularities (
                      {Math.floor((assessmentData.cheatingDetected / totalCandidates) * 100)}% of total)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Interview Phase Analytics */}
          {selectedGroup.hasAIInterview && aiInterviewData && (
            <div className="bg-white rounded-3xl p-8 shadow-sm">
              <div className="mb-6">
                <h3 className="text-gray-900 mb-2">AI Interview Phase Analytics</h3>
                <p className="text-gray-500 text-sm">AI assessment scores and sentiment analysis</p>
              </div>

              {/* Score Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#f9fafb] rounded-2xl p-5">
                  <div className="text-sm text-gray-500 mb-2">Average Score</div>
                  <div className="text-4xl text-gray-900">{aiInterviewData.avgScore}%</div>
                </div>
                <div className="bg-[#f9fafb] rounded-2xl p-5">
                  <div className="text-sm text-gray-500 mb-2">Confidence</div>
                  <div className="text-4xl text-purple-600">{aiInterviewData.avgConfidence}%</div>
                </div>
              </div>

              {/* Sentiment Analysis */}
              <div className="mb-6">
                <div className="text-sm text-gray-700 font-medium mb-3">Sentiment Analysis</div>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span className="text-sm text-gray-700">Positive</span>
                      </div>
                      <span className="text-sm text-gray-900 font-medium">{aiInterviewData.sentimentPositive}%</span>
                    </div>
                    <div className="h-8 bg-[#f3f4f6] rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-lg"
                        style={{ width: `${aiInterviewData.sentimentPositive}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                        <span className="text-sm text-gray-700">Neutral</span>
                      </div>
                      <span className="text-sm text-gray-900 font-medium">{aiInterviewData.sentimentNeutral}%</span>
                    </div>
                    <div className="h-8 bg-[#f3f4f6] rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-gray-400 rounded-lg"
                        style={{ width: `${aiInterviewData.sentimentNeutral}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span className="text-sm text-gray-700">Negative</span>
                      </div>
                      <span className="text-sm text-gray-900 font-medium">{aiInterviewData.sentimentNegative}%</span>
                    </div>
                    <div className="h-8 bg-[#f3f4f6] rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-lg"
                        style={{ width: `${aiInterviewData.sentimentNegative}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pass Rate */}
              <div className="p-5 bg-purple-50 rounded-2xl border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Overall Pass Rate</div>
                    <div className="text-3xl text-purple-600 font-semibold">{aiInterviewData.passRate}%</div>
                  </div>
                  <CheckCircle className="w-10 h-10 text-purple-600" />
                </div>
              </div>
            </div>
          )}

          {/* Live Interview Phase Analytics */}
          {selectedGroup.hasLiveInterview && liveInterviewData && (
            <div className="bg-white rounded-3xl p-8 shadow-sm">
              <div className="mb-6">
                <h3 className="text-gray-900 mb-2">Live Interview Phase Analytics</h3>
                <p className="text-gray-500 text-sm">Interviewer ratings and recommendations</p>
              </div>

              {/* Interview Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#f9fafb] rounded-2xl p-5">
                  <div className="text-sm text-gray-500 mb-2">Completed</div>
                  <div className="text-4xl text-gray-900">{liveInterviewData.completed}/{liveInterviewData.scheduled}</div>
                </div>
                <div className="bg-[#f9fafb] rounded-2xl p-5">
                  <div className="text-sm text-gray-500 mb-2">Avg. Rating</div>
                  <div className="text-4xl text-emerald-600">{liveInterviewData.avgRating}/5</div>
                </div>
              </div>

              {/* Outcomes Distribution */}
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm text-gray-700">Recommended</span>
                    </div>
                    <span className="text-sm text-gray-900 font-medium">
                      {liveInterviewData.recommended} candidates ({Math.floor((liveInterviewData.recommended / liveInterviewData.completed) * 100)}%)
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${(liveInterviewData.recommended / liveInterviewData.completed) * 100}%` }}
                    >
                      <span className="text-sm text-white font-medium">
                        {Math.floor((liveInterviewData.recommended / liveInterviewData.completed) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-sm text-gray-700">Rejected</span>
                    </div>
                    <span className="text-sm text-gray-900 font-medium">
                      {liveInterviewData.rejected} candidates ({Math.floor((liveInterviewData.rejected / liveInterviewData.completed) * 100)}%)
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${(liveInterviewData.rejected / liveInterviewData.completed) * 100}%` }}
                    >
                      <span className="text-sm text-white font-medium">
                        {Math.floor((liveInterviewData.rejected / liveInterviewData.completed) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700">Pending Review</span>
                    </div>
                    <span className="text-sm text-gray-900 font-medium">
                      {liveInterviewData.pending} candidates ({Math.floor((liveInterviewData.pending / liveInterviewData.completed) * 100)}%)
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-gray-400 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${(liveInterviewData.pending / liveInterviewData.completed) * 100}%` }}
                    >
                      <span className="text-sm text-white font-medium">
                        {Math.floor((liveInterviewData.pending / liveInterviewData.completed) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cheating Detection Detailed Analytics (if assessment phase exists) */}
        {selectedGroup.hasAssessment && assessmentData && (
          <div className="bg-white rounded-3xl p-8 shadow-sm mb-8">
            <div className="mb-6">
              <h3 className="text-gray-900 mb-2">Integrity & Cheating Detection</h3>
              <p className="text-gray-500 text-sm">Detailed analysis of potential integrity violations</p>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-6">
              {/* High Risk */}
              <div className="bg-red-50 rounded-2xl p-6 border border-red-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-4 h-4 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-700 font-medium">High Risk</span>
                </div>
                <div className="text-5xl text-gray-900 mb-2">{assessmentData.highRisk}</div>
                <div className="text-sm text-gray-600">
                  {Math.floor((assessmentData.highRisk / totalCandidates) * 100)}% of total candidates
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  • Multiple tab switches<br />
                  • Copy-paste detected<br />
                  • Suspicious patterns
                </div>
              </div>

              {/* Medium Risk */}
              <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-4 h-4 rounded-full bg-amber-500"></div>
                  <span className="text-sm text-gray-700 font-medium">Medium Risk</span>
                </div>
                <div className="text-5xl text-gray-900 mb-2">{assessmentData.mediumRisk}</div>
                <div className="text-sm text-gray-600">
                  {Math.floor((assessmentData.mediumRisk / totalCandidates) * 100)}% of total candidates
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  • Minor irregularities<br />
                  • Unusual time patterns<br />
                  • Needs review
                </div>
              </div>

              {/* Low Risk */}
              <div className="bg-yellow-50 rounded-2xl p-6 border border-yellow-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                  <span className="text-sm text-gray-700 font-medium">Low Risk</span>
                </div>
                <div className="text-5xl text-gray-900 mb-2">{assessmentData.lowRisk}</div>
                <div className="text-sm text-gray-600">
                  {Math.floor((assessmentData.lowRisk / totalCandidates) * 100)}% of total candidates
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  • Minor anomalies<br />
                  • Low confidence flags<br />
                  • Optional review
                </div>
              </div>
            </div>

            {/* Summary Note */}
            <div className="p-5 bg-[#f9fafb] rounded-2xl flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-gray-900 font-medium mb-1">Integrity Assessment Summary</p>
                <p className="text-sm text-gray-600">
                  {assessmentData.cheatingDetected} candidates flagged for review ({Math.floor((assessmentData.cheatingDetected / totalCandidates) * 100)}% of total).
                  {assessmentData.highRisk > 0
                    ? ` ${assessmentData.highRisk} high-risk cases require immediate attention.`
                    : ' All flags are low to medium severity. Recommend manual review before advancing candidates.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4">
          <Button
            variant="outline"
            className="rounded-full px-8 py-6"
            onClick={() => setViewMode('groups')}
          >
            Back to Groups
          </Button>
          <Button
            className="rounded-full px-8 py-6 text-white"
            style={{ backgroundColor: '#6366F1' }}
            onClick={() => toast.success('Group insights exported successfully!')}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>
    );
  }

  // Context-aware dashboard metrics based on navigation level
  const getDashboardMetrics = () => {
    if (viewMode === 'groups' && selectedPositionForGroups) {
      // Group-level context: Show metrics for this position's groups
      return {
        title: `${selectedPositionForGroups.jobTitle} Groups`,
        subtitle: `${selectedPositionForGroups.department} Department`,
        stats: [
          {
            label: 'Total Groups',
            value: positionGroups.length.toString(),
            sublabel: 'active groups',
            icon: <Briefcase className="w-5 h-5 text-indigo-600" />
          },
          {
            label: 'Total Candidates',
            value: positionGroups.reduce((sum, g) => sum + g.candidatesCount, 0).toString(),
            sublabel: 'across all groups',
            icon: <Users className="w-5 h-5 text-purple-600" />
          },
          {
            label: 'Active Groups',
            value: positionGroups.filter(g => g.status === 'Active').length.toString(),
            sublabel: 'in progress',
            icon: <Activity className="w-5 h-5 text-emerald-600" />
          },
          {
            label: 'Completed Groups',
            value: positionGroups.filter(g => g.status === 'Completed').length.toString(),
            sublabel: 'finished',
            icon: <CheckCircle className="w-5 h-5 text-amber-600" />
          }
        ]
      };
    } else if (viewMode === 'positions' && selectedProject) {
      // Project-level context: Show metrics for this project
      const projectPositions = jobPositions.slice(0, selectedProject.positionsCount);
      return {
        title: selectedProject.projectName,
        subtitle: `Project Overview`,
        stats: [
          {
            label: 'Positions',
            value: selectedProject.positionsCount.toString(),
            sublabel: 'in this project',
            icon: <Briefcase className="w-5 h-5 text-indigo-600" />
          },
          {
            label: 'Total Applicants',
            value: selectedProject.applicantsCount.toString(),
            sublabel: 'across positions',
            icon: <Users className="w-5 h-5 text-purple-600" />
          },
          {
            label: 'Sub-Groups',
            value: selectedProject.subGroupsCount.toString(),
            sublabel: 'evaluation groups',
            icon: <Target className="w-5 h-5 text-emerald-600" />
          },
          {
            label: 'Avg. Time',
            value: '24d',
            sublabel: 'to first interview',
            icon: <Clock className="w-5 h-5 text-amber-600" />
          }
        ]
      };
    } else {
      // Overall context: Show metrics across all projects
      return {
        title: 'Recruitment Dashboard',
        subtitle: 'Overview across all projects',
        stats: [
          {
            label: 'Active Projects',
            value: projects.length.toString(),
            sublabel: 'currently running',
            icon: <Briefcase className="w-5 h-5 text-indigo-600" />
          },
          {
            label: 'Total Positions',
            value: projects.reduce((sum, p) => sum + p.positionsCount, 0).toString(),
            sublabel: 'across all projects',
            icon: <Target className="w-5 h-5 text-purple-600" />
          },
          {
            label: 'Total Applicants',
            value: projects.reduce((sum, p) => sum + p.applicantsCount, 0).toString(),
            sublabel: 'in pipeline',
            icon: <Users className="w-5 h-5 text-emerald-600" />
          },
          {
            label: 'Avg. Time to Fill',
            value: `${avgTimeToFill}d`,
            sublabel: 'days',
            icon: <Clock className="w-5 h-5 text-amber-600" />
          }
        ]
      };
    }
  };

  const dashboardMetrics = getDashboardMetrics();

  return (
    <div className="px-12 py-8">
      {/* Context-Aware Header */}
      <div className="mb-8">
        {(viewMode === 'positions' || viewMode === 'groups') && (
          <button
            onClick={() => {
              if (viewMode === 'groups') {
                setViewMode('positions');
                setSelectedPositionForGroups(null);
              } else if (viewMode === 'positions') {
                setViewMode('dashboard');
                setSelectedProject(null);
              }
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
          >
            <ArrowLeft size={20} />
            <span className="font-['Arimo',sans-serif] text-[14px]">
              {viewMode === 'groups' ? 'Back to Positions' : 'Back to Projects'}
            </span>
          </button>
        )}
        <h2 className="text-gray-700 mb-2">{dashboardMetrics.title}</h2>
        <p className="text-gray-600 text-sm">{dashboardMetrics.subtitle}</p>
      </div>

      {/* Context-Aware Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-12">
        {dashboardMetrics.stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-3xl px-8 py-9 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {stat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-gray-500 text-sm mb-1">{stat.label}</div>
                <div className="text-4xl text-gray-900 mb-1">{stat.value}</div>
                <div className="text-gray-400 text-xs">{stat.sublabel}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Context-Aware Visualization */}
      {viewMode === 'dashboard' && (
        <div className="bg-white rounded-3xl p-8 shadow-sm mb-8">
          <div className="mb-6">
            <h3 className="text-gray-900 mb-2">Overall Recruitment Pipeline</h3>
            <p className="text-gray-500 text-sm">Candidate progression across all projects</p>
          </div>

          <div className="space-y-6">
            {pipelineData.map((stage, index, arr) => (
              <div key={stage.stage}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#374151] min-w-[100px]">
                      {stage.stage}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#6b7280]">
                      {stage.count} candidates
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                      {stage.percentage}%
                    </span>
                    {index > 0 && (
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#9ca3af]">
                        -{arr[index - 1].percentage - stage.percentage}% drop
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-14 bg-[#f3f4f6] rounded-xl overflow-hidden">
                  <div
                    className="h-full rounded-xl transition-all duration-500 flex items-center justify-between px-5"
                    style={{
                      width: `${stage.percentage}%`,
                      backgroundColor: stage.color
                    }}
                  >
                    <span className="font-['Arimo',sans-serif] text-[14px] text-white font-medium">
                      {stage.stage}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[16px] text-white font-semibold">
                      {stage.count}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Dashboard-Level Cross-Project Analytics */}
      {viewMode === 'dashboard' && (
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Project Health & Performance */}
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <h4 className="text-gray-900 font-medium mb-4">Project Health Status</h4>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-600" />
                    <span className="text-sm text-gray-600">On Track</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900">
                    {projects.filter(p => p.positionsCount <= 8).length}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(projects.filter(p => p.positionsCount <= 8).length / projects.length) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertOctagon size={16} className="text-orange-600" />
                    <span className="text-sm text-gray-600">At Risk</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900">
                    {projects.filter(p => p.positionsCount > 8).length}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(projects.filter(p => p.positionsCount > 8).length / projects.length) * 100}%` }} />
                </div>
              </div>

              {projects.filter(p => p.positionsCount > 8).length > 0 && (
                <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-orange-600 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-orange-900 mb-1">Attention Needed</div>
                      <div className="text-xs text-orange-700">
                        {projects.filter(p => p.positionsCount > 8).map(p => p.projectName).join(', ')} require review
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t">
                <div className="text-sm text-gray-600 mb-3">Avg Conversion by Project</div>
                <div className="space-y-2">
                  {projects.slice(0, 3).map(project => {
                    const conversion = ((Math.floor(project.applicantsCount * 0.18) / project.applicantsCount) * 100);
                    return (
                      <div key={project.id} className="flex items-center justify-between">
                        <span className="text-xs text-gray-600 truncate flex-1">{project.projectName}</span>
                        <span className={`text-xs font-medium ml-2 ${conversion >= 15 ? 'text-emerald-600' : conversion >= 10 ? 'text-blue-600' : 'text-orange-600'
                          }`}>
                          {conversion.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio Performance Metrics */}
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <h4 className="text-gray-900 font-medium mb-4">Portfolio Performance</h4>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Hiring Velocity</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-gray-900">
                      {(projects.reduce((sum, p) => sum + Math.floor(p.applicantsCount * 0.18), 0) / projects.length).toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-500">hires/project</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Total: {projects.reduce((sum, p) => sum + Math.floor(p.applicantsCount * 0.18), 0)} hires across {projects.length} projects
                </p>
              </div>

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Portfolio Quality Score</span>
                  <span className="text-lg font-semibold text-emerald-600">78%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <div className="text-xs text-emerald-700">High Quality</div>
                    <div className="text-sm font-semibold text-emerald-900">
                      {projects.filter((p, i) => i % 3 === 0).length}
                    </div>
                    <div className="text-xs text-emerald-600">projects (≥80%)</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-2">
                    <div className="text-xs text-orange-700">Need Improvement</div>
                    <div className="text-sm font-semibold text-orange-900">
                      {projects.filter((p, i) => i % 3 === 2).length}
                    </div>
                    <div className="text-xs text-orange-600">projects (&lt;60%)</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t">
                <div className="text-sm text-gray-600 mb-3">Benchmarking</div>
                <div className="space-y-2">
                  {[
                    { metric: 'Time-to-Hire', value: '36d', benchmark: '42d', better: true },
                    { metric: 'Conversion Rate', value: '18%', benchmark: '15%', better: true },
                    { metric: 'Quality Score', value: '78%', benchmark: '75%', better: true }
                  ].map(item => (
                    <div key={item.metric} className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">{item.metric}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{item.benchmark}</span>
                        <span className="text-xs text-gray-500">→</span>
                        <span className={`text-xs font-medium ${item.better ? 'text-emerald-600' : 'text-orange-600'}`}>
                          {item.value}
                        </span>
                        {item.better && <TrendingUp size={12} className="text-emerald-600" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'positions' && selectedProject && (
        <div className="bg-white rounded-3xl p-8 shadow-sm mb-8">
          <div className="mb-6">
            <h3 className="text-gray-900 mb-2">Project Hiring Funnel</h3>
            <p className="text-gray-500 text-sm">Candidate flow for {selectedProject.projectName}</p>
          </div>

          <div className="space-y-6">
            {[
              { stage: 'Applied', count: selectedProject.applicantsCount, percentage: 100, color: '#6366f1' },
              { stage: 'Screening', count: Math.floor(selectedProject.applicantsCount * 0.84), percentage: 84, color: '#8b5cf6' },
              { stage: 'Assessment', count: Math.floor(selectedProject.applicantsCount * 0.68), percentage: 68, color: '#a855f7' },
              { stage: 'Interview', count: Math.floor(selectedProject.applicantsCount * 0.42), percentage: 42, color: '#c084fc' },
              { stage: 'Offer', count: Math.floor(selectedProject.applicantsCount * 0.18), percentage: 18, color: '#10b981' }
            ].map((stage, index, arr) => (
              <div key={stage.stage}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#374151] min-w-[100px]">
                      {stage.stage}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[15px] text-[#6b7280]">
                      {stage.count} candidates
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                      {stage.percentage}%
                    </span>
                    {index > 0 && (
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#9ca3af]">
                        -{arr[index - 1].percentage - stage.percentage}% drop
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-14 bg-[#f3f4f6] rounded-xl overflow-hidden">
                  <div
                    className="h-full rounded-xl transition-all duration-500 flex items-center justify-between px-5"
                    style={{
                      width: `${stage.percentage}%`,
                      backgroundColor: stage.color
                    }}
                  >
                    <span className="font-['Arimo',sans-serif] text-[14px] text-white font-medium">
                      {stage.stage}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[16px] text-white font-semibold">
                      {stage.count}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Position-Level Insights */}
      {viewMode === 'positions' && selectedProject && (
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Conversion & Quality Metrics */}
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <h4 className="text-gray-900 font-medium mb-4">Conversion & Quality</h4>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Overall Conversion Rate</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {((Math.floor(selectedProject.applicantsCount * 0.18) / selectedProject.applicantsCount) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: '18%' }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {Math.floor(selectedProject.applicantsCount * 0.18)} offers from {selectedProject.applicantsCount} applicants
                </p>
              </div>

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Avg Quality Score</span>
                  <span className="text-lg font-semibold text-emerald-600">78%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-blue-50 rounded-lg p-2">
                    <div className="text-xs text-blue-700">Assessment</div>
                    <div className="text-sm font-semibold text-blue-900">76%</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-2">
                    <div className="text-xs text-purple-700">Interview</div>
                    <div className="text-sm font-semibold text-purple-900">80%</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Integrity Issues</span>
                  <span className="text-lg font-semibold text-orange-600">
                    {Math.floor(selectedProject.applicantsCount * 0.08)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {((Math.floor(selectedProject.applicantsCount * 0.08) / selectedProject.applicantsCount) * 100).toFixed(1)}% of assessed candidates
                </p>
              </div>
            </div>
          </div>

          {/* Time & Bottleneck Analysis */}
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <h4 className="text-gray-900 font-medium mb-4">Time & Bottlenecks</h4>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Avg Time-to-Hire</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-gray-900">38d</span>
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <TrendingUp size={12} />
                      <span>4d faster</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">vs industry avg: 42 days</p>
              </div>

              <div className="pt-3 border-t">
                <div className="text-sm text-gray-600 mb-3">Stage Timing</div>
                <div className="space-y-2">
                  {[
                    { stage: 'Screening', days: 3, target: 3, status: 'good' },
                    { stage: 'Assessment', days: 7, target: 5, status: 'slow' },
                    { stage: 'Interview', days: 12, target: 7, status: 'slow' },
                    { stage: 'Offer', days: 4, target: 5, status: 'good' }
                  ].map(item => (
                    <div key={item.stage} className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">{item.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${item.status === 'slow' ? 'text-orange-600' : 'text-emerald-600'
                          }`}>
                          {item.days}d
                        </span>
                        {item.status === 'slow' && (
                          <span className="text-xs text-orange-500">+{item.days - item.target}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-orange-600 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-orange-900">Bottleneck Detected</div>
                      <div className="text-xs text-orange-700 mt-1">
                        <strong>Assessment stage:</strong> {Math.floor(selectedProject.applicantsCount * 0.68)} candidates waiting (avg 7 days)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'groups' && selectedPositionForGroups && (
        <div className="bg-white rounded-3xl p-8 shadow-sm mb-8">
          <div className="mb-6">
            <h3 className="text-gray-900 mb-2">Group Performance Metrics</h3>
            <p className="text-gray-500 text-sm">Key statistics across all groups for {selectedPositionForGroups.jobTitle}</p>
          </div>

          <div className="grid grid-cols-4 gap-6">
            {/* Candidates in Assessment Phase */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl p-6 border border-indigo-200">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <div className="text-sm text-indigo-900 font-medium">In Assessment</div>
              </div>
              <div className="text-4xl text-gray-900 mb-3">
                {Math.floor(positionGroups.reduce((sum, g) => sum + g.candidatesCount, 0) * 0.42)}
              </div>
              <div className="text-xs text-indigo-700 mt-2">
                {Math.floor((positionGroups.filter(g => g.hasAssessment).length / positionGroups.length) * 100)}% groups configured
              </div>
            </div>

            {/* Candidates in AI Interview Phase */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-purple-600" />
                <div className="text-sm text-purple-900 font-medium">In AI Interview</div>
              </div>
              <div className="text-4xl text-gray-900 mb-3">
                {Math.floor(positionGroups.reduce((sum, g) => sum + g.candidatesCount, 0) * 0.28)}
              </div>
              <div className="text-xs text-purple-700 mt-2">
                {Math.floor((positionGroups.filter(g => g.hasAIInterview).length / positionGroups.length) * 100)}% groups configured
              </div>
            </div>

            {/* Candidates Awaiting Live Interview */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-6 border border-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <div className="text-sm text-emerald-900 font-medium">Live Interview Queue</div>
              </div>
              <div className="text-4xl text-gray-900 mb-3">
                {Math.floor(positionGroups.reduce((sum, g) => sum + g.candidatesCount, 0) * 0.18)}
              </div>
              <div className="text-xs text-emerald-700 mt-2">
                {Math.floor((positionGroups.filter(g => g.hasLiveInterview).length / positionGroups.length) * 100)}% groups configured
              </div>
            </div>

            {/* High Performers / Completion Rate */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-6 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-4 h-4 text-amber-600" />
                <div className="text-sm text-amber-900 font-medium">Top Performers</div>
              </div>
              <div className="text-4xl text-gray-900 mb-3">
                {Math.floor(positionGroups.reduce((sum, g) => sum + g.candidatesCount, 0) * 0.12)}
              </div>
              <div className="text-xs text-amber-700 mt-2">
                Passed all phases
              </div>
            </div>
          </div>

          {/* Additional Metrics Row */}
          <div className="grid grid-cols-4 gap-6 mt-6">
            {/* Average Completion Rate */}
            <div className="bg-[#f9fafb] rounded-2xl p-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-indigo-600" />
                <div className="text-sm text-gray-700 font-medium">Completion Rate</div>
              </div>
              <div className="text-4xl text-gray-900 mb-1">
                {Math.floor((positionGroups.filter(g => g.status === 'Completed').length / positionGroups.length) * 100)}%
              </div>
              <div className="text-xs text-gray-500 mt-2">
                {positionGroups.filter(g => g.status === 'Completed').length} of {positionGroups.length} groups
              </div>
            </div>

            {/* Integrity Flags */}
            <div className="bg-[#f9fafb] rounded-2xl p-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon className="w-4 h-4 text-red-600" />
                <div className="text-sm text-gray-700 font-medium">Integrity Flags</div>
              </div>
              <div className="text-4xl text-gray-900 mb-1">
                {Math.floor(positionGroups.reduce((sum, g) => sum + g.candidatesCount, 0) * 0.08)}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Requires review
              </div>
            </div>

            {/* Active Groups */}
            <div className="bg-[#f9fafb] rounded-2xl p-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <div className="text-sm text-gray-700 font-medium">Active Groups</div>
              </div>
              <div className="text-4xl text-gray-900 mb-1">
                {positionGroups.filter(g => g.status === 'Active').length}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Currently in progress
              </div>
            </div>

            {/* Average Time */}
            <div className="bg-[#f9fafb] rounded-2xl p-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-purple-600" />
                <div className="text-sm text-gray-700 font-medium">Avg. Time</div>
              </div>
              <div className="text-4xl text-gray-900 mb-1">
                18d
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Per phase completion
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show different tables based on view mode */}
      {viewMode === 'dashboard' && (
        /* Opened Projects Table */
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-gray-900">Active Projects</h3>
            <p className="text-gray-500 text-sm mt-1">All recruitment projects currently in progress</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('projectName')}
                    >
                      Project Name
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('positionsCount')}
                    >
                      Positions
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('applicantsCount')}
                    >
                      Total Applicants
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('subGroupsCount')}
                    >
                      Sub-Groups
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('openDate')}
                    >
                      Open Date
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                        {project.projectName}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {project.positionsCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {project.applicantsCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {project.subGroupsCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {new Date(project.openDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                        onClick={() => {
                          setSelectedProject(project);
                          setViewMode('positions');
                        }}
                      >
                        <Eye size={16} className="text-[#6366f1]" />
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                          View Positions
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'positions' && selectedProject && (
        /* Job Positions Table */
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-gray-900">Positions in {selectedProject.projectName}</h3>
            <p className="text-gray-500 text-sm mt-1">All positions under this project</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('jobTitle')}
                    >
                      Job Title
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('assignedHR')}
                    >
                      Assigned HR
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('assignedTechnicalRecruiter')}
                    >
                      Technical Recruiter
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('candidatesCount')}
                    >
                      Candidates
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobPositions.slice(0, selectedProject.positionsCount).map((position) => (
                  <tr key={position.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                        {position.jobTitle}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {position.assignedHR}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {position.assignedTechnicalRecruiter}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {position.candidatesCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full font-['Arimo',sans-serif] text-[12px] ${getStatusBadgeColor(
                          position.status
                        )}`}
                      >
                        {position.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                        onClick={() => {
                          setSelectedPositionForGroups(position);
                          setViewMode('groups');
                        }}
                      >
                        <Eye size={16} className="text-[#6366f1]" />
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                          View Groups
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'groups' && selectedPositionForGroups && (
        /* Position Groups Table */
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-gray-900">Groups for {selectedPositionForGroups.jobTitle}</h3>
            <p className="text-gray-500 text-sm mt-1">Evaluation groups created for this position</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('groupName')}
                    >
                      Group Name
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('candidatesCount')}
                    >
                      Candidates
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <button
                      className="flex items-center gap-2 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('createdDate')}
                    >
                      Created Date
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="text-left p-4">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {positionGroups.map((group) => (
                  <tr key={group.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                        {group.groupName}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {group.candidatesCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full font-['Arimo',sans-serif] text-[12px] ${getStatusBadgeColor(
                          group.status
                        )}`}
                      >
                        {group.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {new Date(group.createdDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                        onClick={() => {
                          setSelectedGroup(group);
                          setViewMode('insights');
                        }}
                      >
                        <Eye size={16} className="text-[#6366f1]" />
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                          View Insights
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
