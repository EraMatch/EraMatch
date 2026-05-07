import { useState, useEffect, useCallback } from 'react';
import { useAdminDashboard, useAdminPendingRequests } from '../../hooks/admin/useAdminDashboard';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import {
  Users,
  Briefcase,
  FileText,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
  LayoutDashboard,
  ArrowRight,
  MapPin,
  DollarSign,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Target,
  TrendingDown,
  Activity,
  BarChart3,
  Award,
  AlertOctagon,
  XCircle,
  Download,
  ClipboardCheck,
  ArrowUpDown,
  Eye,
  Trash2, // Added
  Edit, // Added
  MoreHorizontal // Added
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { api, JobPosition, Project, PositionGroup } from '../../services/api';
import EraMatchLogo from '../../assets/image-eramatch.png';
import { AdminProjectModal } from './AdminProjectModal';
import { AdminPositionModal } from './AdminPositionModal';
import LoadingSpinner from '../common/LoadingSpinner';

interface AdminDashboardProps {
  onSignOut: () => void;
  initialView?: ViewMode;
}

type ViewMode = 'dashboard' | 'projects' | 'positions' | 'groups' | 'insights';

export function AdminDashboard({ onSignOut, initialView = 'dashboard' }: AdminDashboardProps) {
  type PriorityFilter = 'low-coverage' | 'high-applicants' | 'unassigned-hr' | 'unassigned-tech' | 'no-groups' | 'high-risk-group';

  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [priorityFilters, setPriorityFilters] = useState<PriorityFilter[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<JobPosition | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPositionForGroups, setSelectedPositionForGroups] = useState<JobPosition | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PositionGroup | null>(null);

  const queryClient = useQueryClient();

  // Data via TanStack Query
  const { data: dashboardStats, isLoading: statsLoading } = useAdminDashboard();
  const { data: pendingRequests = [] } = useAdminPendingRequests();

  const isLoading = statsLoading;
  const globalStats = dashboardStats ?? null;
  const projects: Project[] = (dashboardStats?.projects ?? []) as Project[];
  const jobPositions: JobPosition[] = (dashboardStats?.jobPositions ?? []) as JobPosition[];
  const positionGroups: PositionGroup[] = (dashboardStats?.positionGroups ?? []) as PositionGroup[];
  const pipelineData: any[] = dashboardStats?.pipelineData ?? [];
  const pendingRequestsCount: number = pendingRequests?.length ?? 0;

  // Local state kept for group analytics (conditional, view-dependent)
  const [groupAnalytics, setGroupAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Modal states
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null);

  const fetchDashboardData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() });
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests() });
  }, [queryClient]);

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

  // Project/Position-specific pipeline data
  useEffect(() => {
    const fetchFunnel = async () => {
      try {
        if (selectedPositionForGroups) {
          // Position-level funnel
          const pipelineParams = await api.admin.getPipelineStats(undefined, selectedPositionForGroups.id.toString());
          const transformed = api.admin.transformPipelineData(pipelineParams);
          setPipelineData(transformed);
        } else if (selectedProject) {
          // Project-level funnel
          const pipelineParams = await api.admin.getPipelineStats(selectedProject.id);
          const transformed = api.admin.transformPipelineData(pipelineParams);
          setPipelineData(transformed);
        } else {
          // Reset to global pipeline if no project/position selected
          const params = await api.admin.getPipelineStats();
          setPipelineData(api.admin.transformPipelineData(params));
        }
      } catch (error) {
        console.error('Failed to fetch funnel data:', error);
      }
    };
    fetchFunnel();
  }, [selectedProject, selectedPositionForGroups]);

  const toNumber = (value: unknown): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const toPercentage = (numerator: unknown, denominator: unknown): number => {
    const safeDenominator = toNumber(denominator);
    if (safeDenominator <= 0) return 0;
    const raw = (toNumber(numerator) / safeDenominator) * 100;
    return Math.max(0, Math.min(100, raw));
  };

  const getProjectCoverage = (project: Project): number => {
    const projectPositions = jobPositions.filter(position => position.projectId === project.id);
    const projectPositionIds = new Set(projectPositions.map(position => position.id));
    const candidatesInGroups = positionGroups
      .filter(group => group.position_id && projectPositionIds.has(group.position_id))
      .reduce((sum, group) => sum + toNumber(group.candidateCount ?? group.candidatesCount), 0);
    return toPercentage(candidatesInGroups, project.applicantsCount);
  };

  const toSnakeCase = (value: string) => value.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);

  const readMetricFromEntry = (entry: any, metricKey: string): number | null => {
    if (!entry || typeof entry !== 'object') return null;
    const metricSnake = toSnakeCase(metricKey);
    const direct = entry[metricKey] ?? entry[metricSnake];
    if (direct != null) return toNumber(direct);
    const nested = entry.metrics?.[metricKey] ?? entry.metrics?.[metricSnake];
    if (nested != null) return toNumber(nested);
    return null;
  };

  const getSeriesForMetric = (metricKey: string): Array<{ timestamp: number; value: number }> => {
    const containers = [globalStats, globalStats?.analytics].filter(Boolean);
    const candidateKeys = [
      'snapshots', 'history', 'timeSeries', 'timeseries', 'trend', 'trends',
      'weeklySnapshots', 'monthlySnapshots', 'weekly', 'monthly'
    ];

    const allSeries: Array<{ timestamp: number; value: number }> = [];

    containers.forEach((container: any) => {
      candidateKeys.forEach(key => {
        const arr = container?.[key];
        if (!Array.isArray(arr)) return;
        arr.forEach((entry: any) => {
          const dateValue = entry?.date || entry?.timestamp || entry?.created_at || entry?.periodStart;
          const timestamp = dateValue ? new Date(dateValue).getTime() : Number.NaN;
          const value = readMetricFromEntry(entry, metricKey);
          if (Number.isFinite(timestamp) && value != null) {
            allSeries.push({ timestamp, value });
          }
        });
      });
    });

    return allSeries.sort((a, b) => b.timestamp - a.timestamp);
  };

  const getTrendDelta = (metricKey: string) => {
    const series = getSeriesForMetric(metricKey);
    if (series.length < 2) return { wow: null as number | null, mom: null as number | null };

    const latest = series[0].value;
    const previousWeek = series[1]?.value;
    const previousMonth = series[4]?.value ?? null;

    return {
      wow: previousWeek != null ? latest - previousWeek : null,
      mom: previousMonth != null ? latest - previousMonth : null
    };
  };

  const formatDelta = (value: number | null, suffix = '') => {
    if (value == null) return null;
    const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
    return `${value >= 0 ? '+' : ''}${rounded}${suffix}`;
  };

  const hasPriorityFilter = (filter: PriorityFilter) => priorityFilters.includes(filter);

  const togglePriorityFilter = (filter: PriorityFilter) => {
    setPriorityFilters(prev => prev.includes(filter) ? prev.filter(item => item !== filter) : [...prev, filter]);
  };

  const clearPriorityFilters = () => setPriorityFilters([]);

  useEffect(() => {
    clearPriorityFilters();
  }, [viewMode, selectedProject, selectedPositionForGroups]);



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

  const handleDeleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      try {
        await api.recruiter.deleteProject(projectId);
        toast.success('Project deleted successfully');
        fetchDashboardData();
      } catch (error) {
        console.error('Failed to delete project:', error);
        toast.error('Failed to delete project');
      }
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    if (window.confirm('Are you sure you want to delete this position?')) {
      try {
        await api.recruiter.deletePosition(positionId);
        toast.success('Position deleted successfully');
        fetchDashboardData();
      } catch (error) {
        console.error('Failed to delete position:', error);
        toast.error('Failed to delete position');
      }
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setIsProjectModalOpen(true);
  };

  const handleEditPosition = (position: JobPosition) => {
    setEditingPosition(position);
    setIsPositionModalOpen(true);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'active':
        return 'bg-[#dcfce7] text-[#16a34a]';
      case 'interview':
      case 'processing':
        return 'bg-[#dbeafe] text-[#2563eb]';
      case 'closed':
      case 'completed':
        return 'bg-[#f3f4f6] text-[#6b7280]';
      case 'on hold':
        return 'bg-[#fef3c7] text-[#d97706]';
      default:
        return 'bg-[#f3f4f6] text-[#6b7280]';
    }
  };

  const exportPositionInsights = (position: JobPosition) => {
    const normalizedStages = (pipelineData || [])
      .map((stage: any) => {
        const count = toNumber(stage?.count);
        const percentage = toNumber(stage?.percentage);
        if (!stage?.stage) return null;
        return {
          name: String(stage.stage),
          count,
          percentage
        };
      })
      .filter(Boolean) as Array<{ name: string; count: number; percentage: number }>;

    const stageRows = normalizedStages.length > 0
      ? normalizedStages.map(stage => `${stage.name},${stage.count},${stage.percentage.toFixed(1)}%`).join('\n')
      : `Applied,${toNumber(position.applicantsCount)},100%`;

    const csvContent = `Position: ${position.jobTitle}
Department: ${position.department}
Total Candidates: ${position.applicantsCount}
Status: ${position.status}

Stage,Count,Percentage
${stageRows}`;

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
    if (loadingAnalytics) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner message="Loading group insights..." />
        </div>
      );
    }

    if (!groupAnalytics) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load analytics</h3>
          <p className="text-gray-500 mb-6">Unable to fetch insights for this group.</p>
          <Button
            onClick={() => {
              setLoadingAnalytics(true);
              api.admin.getGroupAnalytics(selectedGroup.id.toString())
                .then(analytics => setGroupAnalytics(analytics))
                .catch(() => toast.error('Retry failed'))
                .finally(() => setLoadingAnalytics(false));
            }}
          >
            Retry
          </Button>
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => setViewMode('groups')}
          >
            Back to Groups
          </Button>
        </div>
      );
    }

    const { totalCandidates } = groupAnalytics;
    const { assessment: assessmentData, aiInterview: aiInterviewData, liveInterview: liveInterviewData } = groupAnalytics.phases;
    const hasAssessmentMetrics = !!assessmentData && [
      assessmentData.completed,
      assessmentData.avgScore,
      assessmentData.passRate,
      assessmentData.cheatingDetected
    ].some(value => toNumber(value) > 0);
    const hasAiInterviewMetrics = !!aiInterviewData && [
      aiInterviewData.completed,
      aiInterviewData.avgScore,
      aiInterviewData.avgConfidence,
      aiInterviewData.passRate,
      aiInterviewData.sentimentPositive,
      aiInterviewData.sentimentNeutral,
      aiInterviewData.sentimentNegative
    ].some(value => toNumber(value) > 0);
    const hasLiveInterviewMetrics = !!liveInterviewData && [
      liveInterviewData.completed,
      liveInterviewData.scheduled,
      liveInterviewData.avgRating,
      liveInterviewData.recommended,
      liveInterviewData.rejected,
      liveInterviewData.pending
    ].some(value => toNumber(value) > 0);
    const enabledInsightPhases = [hasAssessmentMetrics, hasAiInterviewMetrics, hasLiveInterviewMetrics].filter(Boolean).length;

    return (
      <div className="px-12 py-8">
        {/* Header with Back Button */}
        {/* Header with Back Button */}
        <div className="mb-8 flex items-start justify-between">
          <div>
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
                {(selectedGroup.name || selectedGroup.groupName)} • {selectedGroup.positionTitle}
              </p>
            </div>
          </div>
          <img src={EraMatchLogo} alt="Era Match" className="h-[72px] w-auto object-contain mt-1 mr-6" />
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
              {enabledInsightPhases}
            </div>
            <div className="text-xs text-gray-500">with available data</div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm">Overall Progress</span>
              <BarChart3 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-5xl text-gray-900 mb-1">
              {enabledInsightPhases > 0
                ? `${Math.floor((
                  (hasAssessmentMetrics ? toPercentage(assessmentData.completed, totalCandidates) / 100 : 0) +
                  (hasAiInterviewMetrics ? toPercentage(aiInterviewData.completed, totalCandidates) / 100 : 0) +
                  (hasLiveInterviewMetrics ? toPercentage(liveInterviewData.completed, Math.max(totalCandidates, liveInterviewData.scheduled || 0)) / 100 : 0)
                ) / enabledInsightPhases * 100)}%`
                : '--'}
            </div>
            <div className="text-xs text-emerald-600">data-backed progress</div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm">Integrity Score</span>
              <Award className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-5xl text-gray-900 mb-1">
              {hasAssessmentMetrics ? `${Math.floor(100 - toPercentage(assessmentData.cheatingDetected, totalCandidates))}%` : 'N/A'}
            </div>
            <div className="text-xs text-gray-500">
              {hasAssessmentMetrics ? `${assessmentData.cheatingDetected} flagged` : 'No assessment data yet'}
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
            {hasAssessmentMetrics && assessmentData && (
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
                      {Math.floor(toPercentage(assessmentData.completed, totalCandidates))}%
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
                      width: `${toPercentage(assessmentData.completed, totalCandidates)}%`,
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

            {hasAiInterviewMetrics && aiInterviewData && (
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
                      {Math.floor(toPercentage(aiInterviewData.completed, totalCandidates))}%
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
                      width: `${toPercentage(aiInterviewData.completed, totalCandidates)}%`,
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

            {hasLiveInterviewMetrics && liveInterviewData && (
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
                      {Math.floor(toPercentage(liveInterviewData.completed, liveInterviewData.scheduled))}%
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-emerald-600">
                      {Math.floor(toPercentage(liveInterviewData.recommended, liveInterviewData.completed))}% recommended
                    </span>
                  </div>
                </div>
                <div className="h-14 bg-[#f3f4f6] rounded-xl overflow-hidden">
                  <div
                    className="h-full rounded-xl transition-all duration-500 flex items-center justify-between px-5"
                    style={{
                      width: `${toPercentage(liveInterviewData.completed, liveInterviewData.scheduled)}%`,
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
        <div className="flex flex-wrap justify-center gap-8 mb-8">
          {/* Assessment Phase Analytics */}
          {hasAssessmentMetrics && assessmentData && (
            <div className="w-full xl:w-[calc(50%-1rem)] max-w-[860px] bg-white rounded-3xl p-8 shadow-sm">
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
            <div className="w-full xl:w-[calc(50%-1rem)] max-w-[860px] bg-white rounded-3xl p-8 shadow-sm">
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
          {hasLiveInterviewMetrics && liveInterviewData && (
            <div className="w-full xl:w-[calc(50%-1rem)] max-w-[860px] bg-white rounded-3xl p-8 shadow-sm">
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
                      {liveInterviewData.recommended} candidates ({Math.floor(toPercentage(liveInterviewData.recommended, liveInterviewData.completed))}%)
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${toPercentage(liveInterviewData.recommended, liveInterviewData.completed)}%` }}
                    >
                      <span className="text-sm text-white font-medium">
                        {Math.floor(toPercentage(liveInterviewData.recommended, liveInterviewData.completed))}%
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
                      {liveInterviewData.rejected} candidates ({Math.floor(toPercentage(liveInterviewData.rejected, liveInterviewData.completed))}%)
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${toPercentage(liveInterviewData.rejected, liveInterviewData.completed)}%` }}
                    >
                      <span className="text-sm text-white font-medium">
                        {Math.floor(toPercentage(liveInterviewData.rejected, liveInterviewData.completed))}%
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
                      {liveInterviewData.pending} candidates ({Math.floor(toPercentage(liveInterviewData.pending, liveInterviewData.completed))}%)
                    </span>
                  </div>
                  <div className="h-10 bg-[#f3f4f6] rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-gray-400 rounded-xl flex items-center justify-end pr-4"
                      style={{ width: `${toPercentage(liveInterviewData.pending, liveInterviewData.completed)}%` }}
                    >
                      <span className="text-sm text-white font-medium">
                        {Math.floor(toPercentage(liveInterviewData.pending, liveInterviewData.completed))}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cheating Detection Detailed Analytics (if assessment phase exists) */}
        {hasAssessmentMetrics && assessmentData && (
          <div className="bg-white rounded-3xl p-8 shadow-sm mb-8">
            <div className="mb-6">
              <h3 className="text-gray-900 mb-2">Integrity & Cheating Detection</h3>
              <p className="text-gray-500 text-sm">Detailed analysis of potential integrity violations</p>
            </div>

            {toNumber(assessmentData.cheatingDetected) === 0 ? (
              <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 mb-6">
                <div className="text-sm text-emerald-900 font-medium mb-1">No integrity flags detected</div>
                <div className="text-sm text-emerald-700">No candidates have been flagged so far in this group.</div>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* High Risk */}
              <div className="bg-red-50 rounded-2xl p-6 border border-red-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-4 h-4 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-700 font-medium">High Risk</span>
                </div>
                <div className="text-5xl text-gray-900 mb-2">{assessmentData.highRisk}</div>
                <div className="text-sm text-gray-600">
                  {Math.floor(toPercentage(assessmentData.highRisk, totalCandidates))}% of total candidates
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
                  {Math.floor(toPercentage(assessmentData.mediumRisk, totalCandidates))}% of total candidates
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
                  {Math.floor(toPercentage(assessmentData.lowRisk, totalCandidates))}% of total candidates
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  • Minor anomalies<br />
                  • Low confidence flags<br />
                  • Optional review
                </div>
              </div>
            </div>
            )}

            {/* Summary Note */}
            <div className="p-5 bg-[#f9fafb] rounded-2xl flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-gray-900 font-medium mb-1">Integrity Assessment Summary</p>
                <p className="text-sm text-gray-600">
                  {assessmentData.cheatingDetected} candidates flagged for review ({Math.floor(toPercentage(assessmentData.cheatingDetected, totalCandidates))}% of total).
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
      const filteredGroups = positionGroups.filter(g => g.position_id === selectedPositionForGroups.id);
      return {
        title: `${selectedPositionForGroups.jobTitle} Groups`,
        subtitle: `${selectedPositionForGroups.department} Department`,
        stats: [
          {
            label: 'Total Groups',
            value: filteredGroups.length.toString(),
            sublabel: 'active groups',
            icon: <Briefcase className="w-5 h-5 text-indigo-600" />
          },
          {
            label: 'Total Candidates',
            value: filteredGroups.reduce((sum, g) => sum + g.candidatesCount, 0).toString(),
            sublabel: 'across all groups',
            icon: <Users className="w-5 h-5 text-purple-600" />
          },
          {
            label: 'Active Groups',
            value: filteredGroups.filter(g => g.status?.toLowerCase() === 'active').length.toString(),
            sublabel: 'in progress',
            icon: <Activity className="w-5 h-5 text-emerald-600" />
          },
          {
            label: 'Completed Groups',
            value: filteredGroups.filter(g => g.status?.toLowerCase() === 'completed').length.toString(),
            sublabel: 'finished',
            icon: <CheckCircle className="w-5 h-5 text-amber-600" />
          }
        ]
      };
    } else if (viewMode === 'positions' && selectedProject) {
      // Project-level context: Show metrics for this project
      const projectPositions = jobPositions.filter(p => p.projectId === selectedProject.id);
      return {
        title: selectedProject.projectName,
        subtitle: `Project Overview`,
        stats: [
          {
            label: 'Positions',
            value: projectPositions.length.toString(),
            sublabel: 'in this project',
            icon: <Briefcase className="w-5 h-5 text-indigo-600" />
          },
          {
            label: 'Total Applicants',
            value: projectPositions.reduce((sum, p) => sum + p.applicantsCount, 0).toString(),
            sublabel: 'across positions',
            icon: <Users className="w-5 h-5 text-purple-600" />
          },
          {
            label: 'Sub-Groups',
            value: positionGroups.filter(g => projectPositions.some(p => p.id === g.position_id)).length.toString(),
            sublabel: 'evaluation groups',
            icon: <Target className="w-5 h-5 text-emerald-600" />
          },
          {
            label: 'Avg. Time',
            value: `${selectedProject.avgTimeToFill || 0}d`,
            sublabel: 'to fill position',
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
            value: (globalStats?.activeProjects ?? projects.length).toString(),
            sublabel: 'currently running',
            icon: <Briefcase className="w-5 h-5 text-indigo-600" />,
            trendMetric: 'activeProjects'
          },
          {
            label: 'Pending Approvals',
            value: pendingRequestsCount.toString(),
            sublabel: 'awaiting review',
            icon: <ClipboardCheck className={`w-5 h-5 ${pendingRequestsCount > 0 ? 'text-amber-600' : 'text-gray-400'}`} />,
            onClick: () => window.location.href = '/admin/requests'
          },
          {
            label: 'Total Applicants',
            value: (globalStats?.totalApplicants ?? projects.reduce((sum, p) => sum + p.applicantsCount, 0)).toString(),
            sublabel: 'in pipeline',
            icon: <Users className="w-5 h-5 text-emerald-600" />,
            trendMetric: 'totalApplicants'
          },
          {
            label: 'Avg. Time to Fill',
            value: `${Math.round(globalStats?.avgTimeToFill ?? 0)}d`,
            sublabel: 'days',
            icon: <Clock className="w-5 h-5 text-amber-600" />,
            trendMetric: 'avgTimeToFill',
            trendSuffix: 'd'
          }
        ]
      };
    }
  };

  const dashboardMetrics = getDashboardMetrics();

  return (
    <div className="px-12 py-8">
      {/* Context-Aware Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
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
          <>
            <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">{dashboardMetrics.title}</h1>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">{dashboardMetrics.subtitle}</p>
          </>
        </div>
        <img src={EraMatchLogo} alt="Era Match" className="h-[72px] w-auto object-contain mt-1 mr-6" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner message="Loading dashboard data..." />
        </div>
      ) : (
        <>
      {/* Context-Aware Stats Cards - Hidden for 'requests' view to avoid clobbering */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-12 items-stretch">
        {dashboardMetrics.stats.map((stat: any, index: number) => (
          <div
            key={index}
            className={`bg-white rounded-3xl px-8 py-9 shadow-sm h-full ${stat.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
            onClick={stat.onClick}
          >
            <div className="flex items-center gap-3 h-full">
              <div className="flex-shrink-0">
                {stat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-gray-500 text-sm mb-1">{stat.label}</div>
                <div className="text-4xl text-gray-900 mb-1">{stat.value}</div>
                <div className="text-gray-400 text-xs">{stat.sublabel}</div>
                {viewMode === 'dashboard' && stat.trendMetric && (() => {
                  const trend = getTrendDelta(stat.trendMetric);
                  const wow = formatDelta(trend.wow, stat.trendSuffix || '');
                  const mom = formatDelta(trend.mom, stat.trendSuffix || '');
                  if (!wow && !mom) return null;
                  return (
                    <div className="text-[11px] text-gray-500 mt-1">
                      {wow ? <span>WoW {wow}</span> : <span>WoW -</span>} • {mom ? <span>MoM {mom}</span> : <span>MoM -</span>}
                    </div>
                  );
                })()}
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
                      {stage.count}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[14px] text-white font-medium">
                      {stage.percentage}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'positions' && selectedProject && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8 items-stretch">
          {(() => {
            const projectPositions = jobPositions.filter(position => position.projectId === selectedProject.id);
            const openCount = projectPositions.filter(position => position.status?.toLowerCase() === 'open').length;
            const interviewCount = projectPositions.filter(position => position.status?.toLowerCase() === 'interview').length;
            const closedCount = projectPositions.filter(position => position.status?.toLowerCase() === 'closed').length;
            const unassignedHR = projectPositions.filter(position => !position.assignedHR || position.assignedHR === 'Not Assigned').length;
            const unassignedTech = projectPositions.filter(position => !position.assignedTechnicalRecruiter || position.assignedTechnicalRecruiter === 'Not Assigned').length;
            const avgApplicantsPerPosition = projectPositions.length > 0
              ? projectPositions.reduce((sum, position) => sum + toNumber(position.applicantsCount), 0) / projectPositions.length
              : 0;
            const projectPositionIds = new Set(projectPositions.map(position => position.id));
            const relatedGroups = positionGroups.filter(group => group.position_id && projectPositionIds.has(group.position_id));
            const positionsWithoutGroups = projectPositions.filter(position => !relatedGroups.some(group => group.position_id === position.id)).length;
            const fullyConfiguredGroups = relatedGroups.filter(group => group.hasAssessment && group.hasAIInterview && group.hasLiveInterview).length;
            const integrityIssues = relatedGroups.reduce((sum, group) => sum + toNumber(group.integrityIssues), 0);

            return (
              <>
                <div className="bg-white rounded-3xl p-6 shadow-sm h-full">
                  <h4 className="text-gray-900 font-medium mb-4">Position Funnel</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Open</span>
                      <span className="font-medium text-emerald-700">{openCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Interview</span>
                      <span className="font-medium text-indigo-700">{interviewCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Closed</span>
                      <span className="font-medium text-gray-900">{closedCount}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm h-full">
                  <h4 className="text-gray-900 font-medium mb-4">Assignment Gaps</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Unassigned HR</span>
                      <span className="font-medium text-gray-900">{unassignedHR}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Unassigned Technical</span>
                      <span className="font-medium text-gray-900">{unassignedTech}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm h-full">
                  <h4 className="text-gray-900 font-medium mb-4">Load & Throughput</h4>
                  <div className="text-3xl text-gray-900">{avgApplicantsPerPosition.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">avg applicants per position</div>
                  <div className="pt-3 mt-3 border-t text-sm text-gray-600">
                    Active pipeline share: {toPercentage(openCount + interviewCount, projectPositions.length).toFixed(0)}%
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm h-full">
                  <h4 className="text-gray-900 font-medium mb-4">Readiness & Risk</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Positions without groups</span>
                      <span className="font-medium text-gray-900">{positionsWithoutGroups}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Fully configured groups</span>
                      <span className="font-medium text-gray-900">{fullyConfiguredGroups}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Integrity flags</span>
                      <span className="font-medium text-red-600">{integrityIssues}</span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {viewMode === 'groups' && selectedPositionForGroups && (
        <div className="bg-white rounded-3xl p-8 shadow-sm mb-8">
          {(() => {
            const filteredGroups = positionGroups.filter(g => g.position_id === selectedPositionForGroups.id);
            const totalCandidatesInPosition = filteredGroups.reduce((sum, g) => sum + toNumber(g.candidateCount ?? g.candidatesCount), 0);
            const completedGroups = filteredGroups.filter(g => g.status?.toLowerCase() === 'completed').length;
            const activeGroups = filteredGroups.filter(g => g.status?.toLowerCase() === 'active').length;
            const groupsWithAssessment = filteredGroups.filter(g => g.hasAssessment).length;
            const groupsWithAi = filteredGroups.filter(g => g.hasAIInterview).length;
            const groupsWithLive = filteredGroups.filter(g => g.hasLiveInterview).length;
            const fullyConfigured = filteredGroups.filter(g => g.hasAssessment && g.hasAIInterview && g.hasLiveInterview).length;
            const missingFullSetup = Math.max(0, filteredGroups.length - fullyConfigured);
            const integrityFlags = filteredGroups.reduce((sum, g) => sum + toNumber(g.integrityIssues), 0);
            const avgCandidatesPerGroup = filteredGroups.length > 0 ? totalCandidatesInPosition / filteredGroups.length : 0;
            const topRiskGroups = [...filteredGroups]
              .filter(group => toNumber(group.integrityIssues) > 0)
              .sort((a, b) => toNumber(b.integrityIssues) - toNumber(a.integrityIssues))
              .slice(0, 5);

            return (
              <>
                <div className="mb-6">
                  <h3 className="text-gray-900 mb-2">Group Performance Metrics</h3>
                  <p className="text-gray-500 text-sm">Clean overview for {selectedPositionForGroups.jobTitle}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6 items-stretch">
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">Completion Rate</div>
                    <div className="text-3xl text-gray-900 mt-1">{toPercentage(completedGroups, filteredGroups.length).toFixed(0)}%</div>
                    <div className="text-xs text-gray-500 mt-2">{completedGroups} / {filteredGroups.length} groups</div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">Fully Configured</div>
                    <div className="text-3xl text-gray-900 mt-1">{fullyConfigured}</div>
                    <div className="text-xs text-gray-500 mt-2">{toPercentage(fullyConfigured, filteredGroups.length).toFixed(0)}% end-to-end ready</div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">Average Candidates / Group</div>
                    <div className="text-3xl text-gray-900 mt-1">{avgCandidatesPerGroup.toFixed(1)}</div>
                    <div className="text-xs text-gray-500 mt-2">distribution load per group</div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">Missing Full Setup</div>
                    <div className="text-3xl text-gray-900 mt-1">{missingFullSetup}</div>
                    <div className="text-xs text-gray-500 mt-2">{toPercentage(missingFullSetup, filteredGroups.length).toFixed(0)}% need configuration</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6 items-stretch">
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">Assessment Coverage</div>
                    <div className="text-3xl text-gray-900 mt-1">{toPercentage(groupsWithAssessment, filteredGroups.length).toFixed(0)}%</div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">AI Interview Coverage</div>
                    <div className="text-3xl text-gray-900 mt-1">{toPercentage(groupsWithAi, filteredGroups.length).toFixed(0)}%</div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">Live Interview Coverage</div>
                    <div className="text-3xl text-gray-900 mt-1">{toPercentage(groupsWithLive, filteredGroups.length).toFixed(0)}%</div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200 h-full">
                    <div className="text-xs text-gray-500">Integrity Flags</div>
                    <div className="text-3xl text-gray-900 mt-1">{integrityFlags}</div>
                    <div className="text-xs text-gray-500 mt-2">{toPercentage(integrityFlags, totalCandidatesInPosition).toFixed(1)}% flag rate</div>
                  </div>
                </div>

                <div className="bg-[#f9fafb] rounded-2xl p-5 border border-gray-200">
                  <div className="text-sm text-gray-700 font-medium mb-3">Top Risk Groups</div>
                  {topRiskGroups.length > 0 ? (
                    <div className="space-y-2">
                      {topRiskGroups.map(group => (
                        <div key={group.id} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 truncate pr-2">{group.name || group.groupName}</span>
                          <span className="text-sm font-medium text-red-600">{toNumber(group.integrityIssues)} flags</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No group risk signals available.</div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Show different tables based on view mode */}
      {viewMode === 'dashboard' && (
        /* Opened Projects Table */
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          {(() => {
            const filteredProjectsForTable = projects.filter(project => {
              if (priorityFilters.length === 0) return true;

              const matchesLowCoverage = hasPriorityFilter('low-coverage') && getProjectCoverage(project) < 40;
              const matchesHighApplicants = hasPriorityFilter('high-applicants') && toNumber(project.applicantsCount) >= 50;

              return matchesLowCoverage || matchesHighApplicants;
            });

            return (
              <>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-gray-900">Active Projects</h3>
              <p className="text-gray-500 text-sm mt-1">All recruitment projects currently in progress</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Buttons removed to keep dashboard strictly for analytics */}
            </div>
          </div>

          <div className="sticky top-4 z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border border-gray-100 rounded-2xl p-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`px-3 py-1 rounded-full text-xs border ${priorityFilters.length === 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                onClick={clearPriorityFilters}
              >All Projects ({projects.length})</button>
              <button
                className={`px-3 py-1 rounded-full text-xs border ${hasPriorityFilter('low-coverage') ? 'bg-orange-600 text-white border-orange-600' : 'bg-orange-50 text-orange-700 border-orange-200'}`}
                onClick={() => togglePriorityFilter('low-coverage')}
              >Low Coverage ({projects.filter(project => getProjectCoverage(project) < 40).length})</button>
              <button
                className={`px-3 py-1 rounded-full text-xs border ${hasPriorityFilter('high-applicants') ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}
                onClick={() => togglePriorityFilter('high-applicants')}
              >High Applicants ({projects.filter(project => toNumber(project.applicantsCount) >= 50).length})</button>
              {priorityFilters.length > 0 && (
                <button
                  className="px-3 py-1 rounded-full text-xs border border-gray-300 bg-gray-50 text-gray-700"
                  onClick={clearPriorityFilters}
                >Clear Filters</button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4">
                    <button
                      className="flex items-center justify-start gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('projectName')}
                    >
                      Project Name
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('positionsCount')}
                    >
                      Positions
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('applicantsCount')}
                    >
                      Total Applicants
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('subGroupsCount')}
                    >
                      Sub-Groups
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('openDate')}
                    >
                      Open Date
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <span className="flex justify-center font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal text-center">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProjectsForTable.map((project) => (
                  <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4 text-left">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                        {project.projectName}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {project.positionsCount}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {project.applicantsCount}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {project.subGroupsCount}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        {new Date(project.openDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td className="p-4 flex justify-center">
                      <div className="flex items-center gap-2">
                        <button
                          className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditProject(project);
                          }}
                          title="Edit Project"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id);
                          }}
                          title="Delete Project"
                        >
                          <Trash2 size={16} />
                        </button>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredProjectsForTable.length === 0 && (
            <div className="text-sm text-gray-500 py-4 text-center">No projects match the selected alert filter.</div>
          )}
          </>
            );
          })()}
        </div>
      )}

      {viewMode === 'positions' && selectedProject && (
        /* Job Positions Table */
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          {(() => {
            const projectPositions = jobPositions.filter(position => position.projectId === selectedProject.id);
            const filteredPositionsForTable = projectPositions.filter(position => {
              if (priorityFilters.length === 0) return true;

              const matchesUnassignedHr = hasPriorityFilter('unassigned-hr') && (!position.assignedHR || position.assignedHR === 'Not Assigned');
              const matchesUnassignedTech = hasPriorityFilter('unassigned-tech') && (!position.assignedTechnicalRecruiter || position.assignedTechnicalRecruiter === 'Not Assigned');
              const matchesNoGroups = hasPriorityFilter('no-groups') && !positionGroups.some(group => group.position_id === position.id);

              return matchesUnassignedHr || matchesUnassignedTech || matchesNoGroups;
            });

            return (
              <>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-gray-900">Positions in {selectedProject.projectName}</h3>
              <p className="text-gray-500 text-sm mt-1">All positions under this project</p>
            </div>

          </div>

          <div className="sticky top-4 z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border border-gray-100 rounded-2xl p-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`px-3 py-1 rounded-full text-xs border ${priorityFilters.length === 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                onClick={clearPriorityFilters}
              >All Positions ({projectPositions.length})</button>
              <button
                className={`px-3 py-1 rounded-full text-xs border ${hasPriorityFilter('unassigned-hr') ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                onClick={() => togglePriorityFilter('unassigned-hr')}
              >Unassigned HR ({projectPositions.filter(position => !position.assignedHR || position.assignedHR === 'Not Assigned').length})</button>
              <button
                className={`px-3 py-1 rounded-full text-xs border ${hasPriorityFilter('unassigned-tech') ? 'bg-orange-600 text-white border-orange-600' : 'bg-orange-50 text-orange-700 border-orange-200'}`}
                onClick={() => togglePriorityFilter('unassigned-tech')}
              >Unassigned Technical ({projectPositions.filter(position => !position.assignedTechnicalRecruiter || position.assignedTechnicalRecruiter === 'Not Assigned').length})</button>
              <button
                className={`px-3 py-1 rounded-full text-xs border ${hasPriorityFilter('no-groups') ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}
                onClick={() => togglePriorityFilter('no-groups')}
              >No Groups ({projectPositions.filter(position => !positionGroups.some(group => group.position_id === position.id)).length})</button>
              {priorityFilters.length > 0 && (
                <button
                  className="px-3 py-1 rounded-full text-xs border border-gray-300 bg-gray-50 text-gray-700"
                  onClick={clearPriorityFilters}
                >Clear Filters</button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4">
                    <button
                      className="flex items-center justify-start gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('jobTitle')}
                    >
                      Job Title
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('assignedHR')}
                    >
                      Assigned HR
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('assignedTechnicalRecruiter')}
                    >
                      Technical Recruiter
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('candidatesCount')}
                    >
                      Candidates
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <span className="flex justify-center font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal text-center">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPositionsForTable.map((position) => (
                    <tr key={position.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4 text-left">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                          {position.jobTitle}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {position.assignedHR}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {position.assignedTechnicalRecruiter}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {position.applicantsCount}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full font-['Arimo',sans-serif] text-[12px] ${getStatusBadgeColor(
                            position.status
                          )}`}
                        >
                          {position.status}
                        </span>
                      </td>
                      <td className="p-4 flex justify-center">
                        <div className="flex items-center gap-2">
                          <button
                            className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                            onClick={() => handleEditPosition(position)}
                            title="Edit Position"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            onClick={() => handleDeletePosition(position.id)}
                            title="Delete Position"
                          >
                            <Trash2 size={16} />
                          </button>
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
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {filteredPositionsForTable.length === 0 && (
            <div className="text-sm text-gray-500 py-4 text-center">No positions match the selected alert filter.</div>
          )}
          </>
            );
          })()}
        </div>
      )}

      {viewMode === 'groups' && selectedPositionForGroups && (
        /* Position Groups Table */
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          {(() => {
            const groupsForPosition = positionGroups
              .filter(group => !selectedPositionForGroups || group.position_id === selectedPositionForGroups.id);
            const filteredGroupsForTable = groupsForPosition.filter(group => {
              if (priorityFilters.length === 0) return true;
              const matchesHighRisk = hasPriorityFilter('high-risk-group') && toNumber(group.integrityIssues) > 0;
              return matchesHighRisk;
            });

            return (
              <>
          <div className="mb-4">
            <h3 className="text-gray-900">Groups for {selectedPositionForGroups.jobTitle}</h3>
            <p className="text-gray-500 text-sm mt-1">Evaluation groups created for this position</p>
          </div>

          <div className="sticky top-4 z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border border-gray-100 rounded-2xl p-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`px-3 py-1 rounded-full text-xs border ${priorityFilters.length === 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                onClick={clearPriorityFilters}
              >All Groups ({groupsForPosition.length})</button>
              <button
                className={`px-3 py-1 rounded-full text-xs border ${hasPriorityFilter('high-risk-group') ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200'}`}
                onClick={() => togglePriorityFilter('high-risk-group')}
              >High Risk Groups ({groupsForPosition.filter(group => toNumber(group.integrityIssues) > 0).length})</button>
              {priorityFilters.length > 0 && (
                <button
                  className="px-3 py-1 rounded-full text-xs border border-gray-300 bg-gray-50 text-gray-700"
                  onClick={clearPriorityFilters}
                >Clear Filters</button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('groupName')}
                    >
                      Group Name
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('candidatesCount')}
                    >
                      Candidates
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <button
                      className="flex items-center justify-center gap-2 w-full font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal hover:text-[#374151]"
                      onClick={() => handleSort('createdDate')}
                    >
                      Created Date
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th className="p-4">
                    <span className="flex justify-center font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-normal text-center">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredGroupsForTable.map((group) => (
                    <tr key={group.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4 text-center">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                          {group.name || group.groupName}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {group.candidateCount ?? group.candidatesCount ?? 0}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full font-['Arimo',sans-serif] text-[12px] ${getStatusBadgeColor(
                            group.status
                          )}`}
                        >
                          {group.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {new Date(group.createdDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                      <td className="p-4 flex justify-center">
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
          {filteredGroupsForTable.length === 0 && (
            <div className="text-sm text-gray-500 py-4 text-center">No groups match the selected alert filter.</div>
          )}
          </>
            );
          })()}
        </div>
      )}
      </>
      )}

      {/* Modals */}
      <AdminProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => {
          setIsProjectModalOpen(false);
          setEditingProject(null);
        }}
        onSuccess={fetchDashboardData}
        project={editingProject}
      />

      {isPositionModalOpen && selectedProject && (
        <AdminPositionModal
          isOpen={isPositionModalOpen}
          onClose={() => {
            setIsPositionModalOpen(false);
            setEditingPosition(null);
          }}
          onSuccess={fetchDashboardData}
          projectId={selectedProject.id}
          position={editingPosition}
        />
      )}
    </div>
  );
}
