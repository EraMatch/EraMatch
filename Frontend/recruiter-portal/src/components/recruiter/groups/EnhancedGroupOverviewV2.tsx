import { useState } from 'react';
import { ChevronLeft, Play, Edit, Download, Users, TrendingUp, Sparkles, Calendar, Send, CheckCircle, XCircle, Clock, Eye, Trash2, UserPlus, UserMinus, Activity, MoreVertical, Flag, Filter, X, ChevronDown, Plus, UserCog, Shield, Lock, MessageSquare, FileText, CheckSquare, Ban, Archive, AlertTriangle, BarChart3, Target, Video, Loader2, RotateCcw, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SuspectReviewPage } from '../candidates/SuspectReviewPage';
import { CreateAdvancedAssessment } from '../assessments/CreateAdvancedAssessment';
import { RecordedInterviewSetup } from '../interviews/RecordedInterviewSetup';
import { RecordedInterviewQuestionSetup } from '../interviews/RecordedInterviewQuestionSetup';

import { StageResultsDashboard } from './StageResultsDashboard';
import { ModuleMonitoringDashboard } from './ModuleMonitoringDashboard';
import { StartStageModal } from './StartStageModal';
import { BulkProgressionModal } from './BulkProgressionModal';
import { HoldReviewModal } from './HoldReviewModal';
import { ArchiveGroupModal } from './ArchiveGroupModal';
import { FinalDecisionModal } from './FinalDecisionModal';
import { FiltrationFlowConfigModal } from './FiltrationFlowConfigModal';
import { StageReviewPage } from './StageReviewPage';
import { FinalDecisionPage } from './FinalDecisionPage';
import { ConfigWizardV2 } from '../live-interview-v2/ConfigWizardV2';
import { LiveInterviewMonitor } from '../live-interview-v2/LiveInterviewMonitor';
import { LiveInterviewResults } from '../live-interview-v2/LiveInterviewResults';

import { ActivityLogPanel } from './ActivityLogPanel';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';
import { api } from '../../../services/api';
import { useEffect } from 'react';
import LoadingSpinner from '../../common/LoadingSpinner';
import { useGroupDetail, useUpdateGroup, useStartStage, useCloseStage, useSendOffers, useBulkProgressCandidates, useResetStages } from '../../../hooks/groups/useGroups';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';

interface EnhancedGroupOverviewV2Props {
  groupId: string;
  groupName: string;
  description: string;
  assignedRecruiter: string;
  candidateIds: number[];
  recruiterType: 'recruiter' | 'technical';
  filtrationFlow?: ('assessment' | 'ai-interview' | 'live-interview')[]; // NEW: Filtration flow configuration
  onBack: () => void;
  onViewCandidate: (candidateId: number) => void;
  onOpenLiveAISetup?: () => void;
  onOpenRecordedAISetup?: () => void;
  onCreateAssessment?: () => void;
  onCreateAIInterview?: () => void;
  onViewModuleDetail?: (detail: {
    type: 'assessment' | 'ai-interview';
    candidateId: number;
    candidateName: string;
    score: number;
    completedDate: string;
  }) => void;
}

type StageState = 'active' | 'closed' | 'review-mode' | 'not-started';

interface PipelineStep {
  id: string;
  name: string;
  completed: number;
  total: number;
  pending: number;
  state: StageState;
  startDate?: Date;
  expectedEndDate?: Date;
  actualEndDate?: Date;
}

interface TechnicalAcceptanceCriteria {
  minimumTechnicalScore: number;
  allowedIntegrityRisk: 'none' | 'low' | 'medium';
  requiredVerdict: 'pass' | 'conditional' | 'any';
}

interface CandidateComment {
  id: string;
  candidateId: number;
  author: 'hr' | 'technical';
  authorName: string;
  text: string;
  timestamp: Date;
}

interface CandidateVerdict {
  candidateId: number;
  verdict: 'pass' | 'fail' | 'conditional';
  comment?: string;
  timestamp: Date;
}

interface ActivityLogEntry {
  id: string;
  type: 'stage-start' | 'stage-close' | 'criteria-defined' | 'comment-added' | 'candidate-progressed' | 'override-applied';
  actor: string;
  actorRole: 'hr' | 'technical';
  description: string;
  timestamp: Date;
  metadata?: any;
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
  liveInterviewScore: number;
  flags: string[];
  currentStage: string;
  technicalVerdict?: 'pass' | 'fail' | 'conditional';
  meetsCriteria?: boolean;
  progressionState?: 'selected' | 'rejected' | 'on-hold' | 'archived' | 'active';
  overrideApplied?: boolean;
  email?: string;
  phone?: string;
  /** Backend UUID for the CandidateApplication record. Populated from API. */
  applicationId?: string;
  liveInterviewScheduledAt?: string;
  liveInterviewMeetingLink?: string;
}

export function EnhancedGroupOverviewV2({
  groupId,
  groupName,
  description,
  assignedRecruiter,
  candidateIds,
  recruiterType,
  filtrationFlow = ['assessment', 'ai-interview'], // Default flow if not provided
  onBack,
  onViewCandidate,
  onOpenLiveAISetup,
  onOpenRecordedAISetup,
  onCreateAssessment,
  onCreateAIInterview,
  onViewModuleDetail
}: EnhancedGroupOverviewV2Props) {
  // Existing modals
  const [showRankModal, setShowRankModal] = useState(false);
  const [showTopNModal, setShowTopNModal] = useState(false);
  const [showAutoScheduleModal, setShowAutoScheduleModal] = useState(false);
  const [showSendAssessmentModal, setShowSendAssessmentModal] = useState(false);
  const [showMoveStageModal, setShowMoveStageModal] = useState(false);
  const [showRuleBuilderModal, setShowRuleBuilderModal] = useState(false);
  const [showAIInterviewSettingsModal, setShowAIInterviewSettingsModal] = useState(false);
  const [showFlowConfigModal, setShowFlowConfigModal] = useState(false);
  const [githubQuestionsCount, setGithubQuestionsCount] = useState<number>(10);
  const [refreshKey, setRefreshKey] = useState(0);

  // New state for enhancements
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [showSuspectReview, setShowSuspectReview] = useState<number | null>(null);
  const [activeKPIFilter, setActiveKPIFilter] = useState<string | null>(null);
  const [showModuleFilters, setShowModuleFilters] = useState(false);
  const [moduleFilters, setModuleFilters] = useState({
    assessmentStatus: [] as string[],
    aiInterviewStatus: [] as string[],
    scoreRange: [0, 100] as [number, number],
    flagsFilter: 'all' as 'all' | 'integrity' | 'suspicious',
    meetsCriteria: 'all' as 'all' | 'yes' | 'no',
    hasHRComment: false,
    hasTechnicalComment: false
  });
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showFlaggedBatch, setShowFlaggedBatch] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Use recruiterType prop directly instead of state
  const userRole = recruiterType;

  const [showAssessmentCreation, setShowAssessmentCreation] = useState(false);
  const [editingAssessmentData, setEditingAssessmentData] = useState<any>(null);
  const [showCreateAIInterview, setShowCreateAIInterview] = useState(false);
  const [showRecordedInterviewSetup, setShowRecordedInterviewSetup] = useState(false);
  const [showRecordedQuestionSetup, setShowRecordedQuestionSetup] = useState(false);

  const [pendingAISettings, setPendingAISettings] = useState<any>(null);
  const [groupAssessments, setGroupAssessments] = useState<any[]>([]);
  const [groupInterviews, setGroupInterviews] = useState<any[]>([]);
  const [editingInterviewData, setEditingInterviewData] = useState<any>(null);

  // NEW: Live Interview V2 Setup
  const [showLiveInterviewV2Setup, setShowLiveInterviewV2Setup] = useState(false);
  const [showLiveMonitor, setShowLiveMonitor] = useState(false);
  const [liv2ResultSessionId, setLiv2ResultSessionId] = useState<string | null>(null);


  // NEW: Stage-gated state
  const [currentStage, setCurrentStage] = useState<string>(filtrationFlow[0] || 'assessment');
  const [stageState, setStageState] = useState<StageState>('not-started');
  const [stageConfigLocked, setStageConfigLocked] = useState(false);

  // NEW: Bulk progression modal
  const [showBulkProgressionModal, setShowBulkProgressionModal] = useState(false);
  // Which stage we're moving candidates FROM (may differ from currentStage when prev stage is closed)
  const [bulkProgressFromStage, setBulkProgressFromStage] = useState<string>('');

  // NEW: Final Decision modal
  const [showFinalDecisionModal, setShowFinalDecisionModal] = useState(false);

  // NEW: Technical Acceptance Criteria
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<TechnicalAcceptanceCriteria>({
    minimumTechnicalScore: 70,
    allowedIntegrityRisk: 'low',
    requiredVerdict: 'pass'
  });
  const [showCriteriaEditor, setShowCriteriaEditor] = useState(false);

  // NEW: Bidirectional commenting
  const [candidateComments, setCandidateComments] = useState<CandidateComment[]>([]);
  const [showCommentModal, setShowCommentModal] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');

  // NEW: Technical verdicts
  const [technicalVerdicts, setTechnicalVerdicts] = useState<CandidateVerdict[]>([]);
  const [showVerdictModal, setShowVerdictModal] = useState<number | null>(null);

  // NEW: Activity log
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [showActivityLog, setShowActivityLog] = useState(false);

  // NEW: Overrides tracking
  const [candidateOverrides, setCandidateOverrides] = useState<Set<number>>(new Set());

  // NEW: Modal states for results and monitoring
  const [showStartStageModal, setShowStartStageModal] = useState(false);
  const [showStageResults, setShowStageResults] = useState(false);
  const [showModuleMonitoring, setShowModuleMonitoring] = useState<'assessment' | 'ai-interview' | null>(null);

  // NEW: Full-page views
  const [showStageReviewPage, setShowStageReviewPage] = useState(false);
  const [showFinalDecisionPage, setShowFinalDecisionPage] = useState(false);

  // NEW: Schedule Interview modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedCandidateForSchedule, setSelectedCandidateForSchedule] = useState<{ id: string, name: string } | null>(null);

  // Hold review modal
  const [showHoldReview, setShowHoldReview] = useState(false);

  // Archive group modal
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  // NEW: Pipeline steps state
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [candidateStatuses, setCandidateStatuses] = useState<CandidateStatus[]>([]);
  const [activeFlow, setActiveFlow] = useState<string[]>([]);
  const [positionId, setPositionId] = useState<string>('');
  const [interviewConfigId, setInterviewConfigId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: groupDetailData, isLoading } = useGroupDetail(groupId);
  const isArchived = (groupDetailData as any)?.status === 'archived';
  const updateGroupMutation = useUpdateGroup();
  const startStageMutation = useStartStage();
  const closeStageMutation = useCloseStage();
  const sendOffersMutation = useSendOffers();
  const bulkProgressMutation = useBulkProgressCandidates();
  const resetStagesMutation = useResetStages();

  // Sync data from query into local state
  useEffect(() => {
    if (!groupDetailData) return;
    const fetchData = async () => {
      try {
        const data = groupDetailData as any;
        if (data.position_id) {
          setPositionId(data.position_id);
        }
        if (data.interview_config_id) {
          setInterviewConfigId(data.interview_config_id);
        }

        let activeFlowRaw = filtrationFlow; // Default to prop
        if (data.group && data.group.filtration_flow) {
          // Parse backend response which might be object array or strings
          // If getGroupDetails returns full group object in response
          const flowData = data.group.filtration_flow;
          if (Array.isArray(flowData)) {
            activeFlowRaw = flowData.map((s: any) =>
              (s.stage || s.type || '').toLowerCase().replace('_', '-')
            ).filter((s: string) => ['assessment', 'ai-interview', 'live-interview'].includes(s));
          }
        }

        // Actually api.recruiter.getGroupDetails returns GroupDetailResponse which has filtration_flow
        if (data.filtration_flow && Array.isArray(data.filtration_flow)) {
          activeFlowRaw = data.filtration_flow.map((s: any) =>
            (s.stage || s.type || '').toLowerCase().replace('_', '-')
          ).filter((s: string) => ['assessment', 'ai-interview', 'live-interview'].includes(s));
        }

        setActiveFlow(activeFlowRaw);

        if (data.assessments && Array.isArray(data.assessments)) {
          setGroupAssessments(data.assessments);
        }

        if (data.interviews && Array.isArray(data.interviews)) {
          setGroupInterviews(data.interviews);
        }

        const moduleMetaMap: Record<string, { name: string; icon: any }> = {
          'assessment': { name: 'Technical Assessment', icon: FileText },
          'ai-interview': { name: 'AI Interview', icon: Video },
          'live-interview': { name: 'Live Interview', icon: MessageSquare },
          'review': { name: 'Review', icon: CheckSquare },
          'offer': { name: 'Offer', icon: Send }
        };

        // Build a lookup from backend stages by a normalised key
        const backendStageMap: Record<string, any> = {};
        // Backend returns pipeline_stages (snake_case), map by both id (ai-interview) and name
        const rawPipelineStages = data.pipeline_stages || data.pipelineStages || [];
        if (Array.isArray(rawPipelineStages)) {
          rawPipelineStages.forEach((s: any) => {
            const key = (s.id || s.name || '').toLowerCase().replace(/\s+/g, '-');
            backendStageMap[key] = s;
            // Also index by stage_type key (e.g. 'ai_interview' → 'ai-interview')
            if (s.id) backendStageMap[s.id] = s;
          });
        }

        const steps: PipelineStep[] = activeFlowRaw.map((stageType) => {
          const meta = moduleMetaMap[stageType] || { name: stageType, icon: FileText };
          const backend = backendStageMap[stageType] || backendStageMap[meta.name.toLowerCase().replace(/\s+/g, '-')];
          return {
            id: stageType,
            name: meta.name,
            completed: backend?.completed ?? 0,
            total: backend?.total ?? 0,
            pending: backend?.pending ?? 0,
            state: (backend?.state as StageState) || 'not-started'
          };
        });

        setPipelineSteps(steps);

        // Restore stage state from backend data
        if (steps.length > 0) {
          // Find the most advanced stage that has been started
          const activeStep = steps.find(s => s.state === 'active');
          const closedSteps = steps.filter(s => s.state === 'closed');
          const lastClosedStep = closedSteps[closedSteps.length - 1];

          if (activeStep) {
            // There's an active stage right now
            setCurrentStage(activeStep.id);
            setStageState('active');
            setStageConfigLocked(true);
          } else if (lastClosedStep) {
            // All stages so far are closed — find the next not-started one
            const lastClosedIdx = steps.findIndex(s => s.id === lastClosedStep.id);
            const nextStep = steps[lastClosedIdx + 1];
            if (nextStep) {
              setCurrentStage(nextStep.id);
              setStageState('not-started');
            } else {
              // All stages complete — stay on last closed
              setCurrentStage(lastClosedStep.id);
              setStageState('closed');
            }
          } else {
            // Nothing started yet
            setCurrentStage(steps[0].id);
            setStageState('not-started');
          }
        }

        // Map candidates
        const candidates: CandidateStatus[] = data.candidates.map((c: any) => ({
          id: c.candidate_id, // backend sends candidate_id
          applicationId: c.application_id,
          name: c.name,
          email: c.email,
          phone: c.phone || `+1-555-${String(c.candidate_id).slice(-4)}`,
          avatar: c.name.split(' ').map((n: string) => n[0]).join(''),
          assessment: c.assessment?.status === 'completed' && c.assessment?.passed === false ? 'failed' : (c.assessment?.status as any) || 'not-started',
          aiInterview: c.ai_interview?.status === 'completed' && c.ai_interview?.passed === false ? 'failed' : (c.ai_interview?.status as any) || 'not-started',
          liveInterview: c.live_interview?.status === 'completed' && c.live_interview?.passed === false ? 'failed' : (c.live_interview?.status as any) || 'pending',
          review: 'not-started',
          offer: 'not-started',
          assessmentScore: c.assessment?.score || 0,
          aiInterviewScore: c.ai_interview?.score || 0,
          liveInterviewScore: c.live_interview?.score || 0,
          flags: c.flags ? c.flags.map((f: any) => f.description) : [],
          currentStage: c.currentStage || 'assessment',
          technicalVerdict: c.verdict === 'pass' || c.verdict === 'fail' || c.verdict === 'conditional' ? c.verdict : undefined,
          meetsCriteria: c.meets_criteria,
          progressionState: c.status === 'holded' ? 'on-hold' : c.status === 'rejected' ? 'rejected' : c.status === 'offered' ? 'offered' : 'active',
          overrideApplied: false,
          liveInterviewScheduledAt: c.live_interview?.scheduled_at,
          liveInterviewMeetingLink: c.live_interview?.meeting_link
        }));

        setCandidateStatuses(candidates);

        if (data.acceptanceCriteria) {
          setAcceptanceCriteria(data.acceptanceCriteria as TechnicalAcceptanceCriteria);
        }

        if (Number.isFinite(Number(data.github_questions_count))) {
          setGithubQuestionsCount(Math.max(1, Math.min(30, Number(data.github_questions_count))));
        }

        if (data.activityLog) {
          setActivityLog(data.activityLog.map((log: any) => ({
            ...log,
            timestamp: new Date(log.timestamp)
          })));
        }

      } catch (error) {
        console.error('Failed to process group details:', error);
      }
    };

    fetchData();
  }, [groupDetailData]);

  const handleSaveFlow = async (flowConfig: ('assessment' | 'ai-interview' | 'live-interview')[], configuredGithubQuestionsCount: number) => {
    try {
      await updateGroupMutation.mutateAsync({
        groupId,
        data: {
          filtration_flow: flowConfig,
          github_questions_count: configuredGithubQuestionsCount,
        },
      });
      setGithubQuestionsCount(configuredGithubQuestionsCount);
      setShowFlowConfigModal(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
      showToast('Filtration flow updated successfully');
    } catch (error) {
      console.error('Failed to save flow:', error);
      showToast('Failed to update filtration flow');
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const addActivityLog = (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: ActivityLogEntry = {
      ...entry,
      id: `log-${Date.now()}`,
      timestamp: new Date()
    };
    setActivityLog(prev => [newEntry, ...prev]);
  };

  // Stage-aware action handlers
  const handleStartStage = () => {
    setShowStartStageModal(true);
  };

  const handleConfirmStartStage = async (startDate: Date, expectedEndDate: Date) => {
    const currentStep = pipelineSteps.find(s => s.id === currentStage);
    if (!currentStep) return;
    try {
      await startStageMutation.mutateAsync({ groupId, stage: currentStage });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
    } catch (error: any) {
      console.error('Failed to start stage on backend:', error);
      showToast(error?.message || 'Failed to start stage — please try again');
      return;
    }
    setShowStartStageModal(false);
    showToast(`${currentStep.name} stage started`);
    addActivityLog({
      type: 'stage-start',
      actor: assignedRecruiter,
      actorRole: userRole === 'technical' ? 'technical' : 'hr',
      description: `Started ${currentStep.name} stage (${startDate.toLocaleDateString()} - ${expectedEndDate.toLocaleDateString()})`
    });
  };

  const handleCloseStage = async () => {
    const currentStep = pipelineSteps.find(s => s.id === currentStage);
    if (!currentStep) return;
    let response: any;
    try {
      response = await closeStageMutation.mutateAsync({ groupId, stage: currentStage });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
    } catch (error: any) {
      console.error('Failed to close stage on backend:', error);
      showToast(error?.message || 'Failed to close stage — please try again');
      return;
    }
    const autoFailed = response?.auto_failed_count ?? 0;
    const toastMsg = autoFailed > 0
      ? `${currentStep.name} stage closed — ${autoFailed} in-progress candidate${autoFailed > 1 ? 's' : ''} auto-failed. Click "View Stage Results" to review.`
      : `${currentStep.name} stage closed — Click "View Stage Results" to review and filter`;
    showToast(toastMsg);
    addActivityLog({
      type: 'stage-close',
      actor: assignedRecruiter,
      actorRole: userRole === 'technical' ? 'technical' : 'hr',
      description: `Closed ${currentStep.name} stage${autoFailed > 0 ? ` (${autoFailed} auto-failed)` : ''}`
    });
  };

  const handleSendOffers = async (selectedCandidateIds: number[], emailContent: string) => {
    try {
      // Map local numeric IDs to application IDs via candidateStatuses
      const appIds = selectedCandidateIds
        .map(id => {
          const c = candidateStatuses.find(c => c.id === id);
          return c?.applicationId ?? String(id);
        });

      if (appIds.length > 0) {
        await sendOffersMutation.mutateAsync({
          groupId,
          payload: {
            application_ids: appIds,
            email_subject: `Offer for ${description || 'position'}`,
            email_body: emailContent,
          },
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
      }
    } catch (error) {
      console.error('Failed to send offers via backend:', error);
      // Continue to update local state even if backend fails — offers UI should still reflect
    }

    const updatedCandidates = candidateStatuses.map(candidate => {
      if (selectedCandidateIds.includes(candidate.id)) {
        return { ...candidate, offer: 'completed' as const };
      }
      return candidate;
    });
    setCandidateStatuses(updatedCandidates);

    addActivityLog({
      type: 'candidate-progressed',
      actor: assignedRecruiter,
      actorRole: userRole === 'technical' ? 'technical' : 'hr',
      description: `Sent offers to ${selectedCandidateIds.length} candidate(s)`
    });

    showToast(`✓ Offers sent successfully to ${selectedCandidateIds.length} candidate(s)`);
  };

  const handleArchiveGroup = async (sendRejections: boolean) => {
    try {
      const result = await api.recruiter.archiveGroup(groupId, sendRejections);
      setShowArchiveModal(false);
      const msg = sendRejections && result?.rejected_count > 0
        ? `Group archived — rejection emails sent to ${result.rejected_count} candidate${result.rejected_count !== 1 ? 's' : ''}`
        : 'Group archived successfully';
      showToast(msg);
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
      onBack();
    } catch (error: any) {
      showToast(error?.message || 'Failed to archive group — please try again');
    }
  };

  const handleExportContacts = (selectedCandidateIds: number[]) => {
    // Get selected candidates data
    const selectedCandidates = candidateStatuses.filter(c => selectedCandidateIds.includes(c.id));

    // Create CSV content
    const csvHeaders = 'Name,Email,Phone,Final Score,Position\n';
    const csvRows = selectedCandidates.map(candidate =>
      `"${candidate.name}","${candidate.email}","${candidate.phone}","${candidate.assessmentScore}","${groupName}"`
    ).join('\n');

    const csvContent = csvHeaders + csvRows;

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${groupName}_selected_candidates.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`✓ Exported ${selectedCandidateIds.length} candidate contact(s)`);
  };

  const handleBulkProgression = async (selectedIds: number[], action: 'progress' | 'reject' | 'hold') => {
    try {
      const appIds = selectedIds
        .map(id => {
          const c = candidateStatuses.find(c => c.id === id);
          return c?.applicationId ?? String(id);
        });

      if (appIds.length > 0) {
        await bulkProgressMutation.mutateAsync({
          groupId,
          payload: {
            application_ids: appIds,
            action,
            current_stage_type: bulkProgressFromStage || currentStage
          },
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
      }
    } catch (error) {
      console.error('Failed to bulk progress candidates on backend:', error);
      showToast('Failed to update candidates — please try again');
      return;
    }

    if (action === 'progress') {
      showToast(`${selectedIds.length} candidates progressed to next stage`);
    } else if (action === 'reject') {
      showToast(`${selectedIds.length} candidates rejected`);
    } else if (action === 'hold') {
      showToast(`${selectedIds.length} candidates put on hold`);
    }

    addActivityLog({
      type: 'candidate-progressed',
      actor: assignedRecruiter,
      actorRole: userRole === 'technical' ? 'technical' : 'hr',
      description: `${action === 'progress' ? 'Progressed' : action === 'reject' ? 'Rejected' : 'Put on hold'} ${selectedIds.length} candidates`,
      metadata: { candidateIds: selectedIds, action }
    });

    setShowBulkProgressionModal(false);
  };

  const handleEnterReviewMode = () => {
    setShowStageResults(false); // Close results dashboard
    setStageState('review-mode');
    showToast('Entered review mode - You can now select candidates to proceed');
    addActivityLog({
      type: 'stage-start',
      actor: assignedRecruiter,
      actorRole: 'hr',
      description: 'Entered review mode for candidate selection'
    });
  };

  const handleProceedSelected = () => {
    if (selectedCandidates.length === 0) {
      alert('Please select at least one candidate to proceed');
      return;
    }

    // Update candidate states
    const updatedCandidates = candidateStatuses.map(candidate => {
      if (selectedCandidates.includes(candidate.id)) {
        return { ...candidate, progressionState: 'selected' as const };
      } else if (candidate.progressionState === 'active') {
        // Mark non-selected as needs decision
        return candidate;
      }
      return candidate;
    });

    setCandidateStatuses(updatedCandidates);

    // Move to next stage
    const currentStepIndex = pipelineSteps.findIndex(s => s.id === currentStage);
    if (currentStepIndex < pipelineSteps.length - 1) {
      const nextStage = pipelineSteps[currentStepIndex + 1];
      setCurrentStage(nextStage.id);
      setStageState('not-started');
      setStageConfigLocked(false);
    }

    showToast(`${selectedCandidates.length} candidates progressed to next stage`);
    addActivityLog({
      type: 'candidate-progressed',
      actor: assignedRecruiter,
      actorRole: 'hr',
      description: `Progressed ${selectedCandidates.length} candidates to next stage`,
      metadata: { candidateIds: selectedCandidates }
    });

    setSelectedCandidates([]);
  };

  const handleMarkCandidateState = (candidateId: number, state: 'rejected' | 'on-hold' | 'archived') => {
    const updatedCandidates = candidateStatuses.map(c =>
      c.id === candidateId ? { ...c, progressionState: state } : c
    );
    setCandidateStatuses(updatedCandidates);
    showToast(`Candidate marked as ${state}`);
    addActivityLog({
      type: 'candidate-progressed',
      actor: assignedRecruiter,
      actorRole: 'hr',
      description: `Marked candidate as ${state}`,
      metadata: { candidateId, state }
    });
  };

  const handleSaveCriteria = () => {
    setShowCriteriaEditor(false);
    showToast('Technical acceptance criteria updated');
    addActivityLog({
      type: 'criteria-defined',
      actor: assignedRecruiter,
      actorRole: 'technical',
      description: 'Updated technical acceptance criteria',
      metadata: acceptanceCriteria
    });

    // Recalculate meetsCriteria for all candidates
    const updatedCandidates = candidateStatuses.map(candidate => {
      const meetsScore = candidate.assessmentScore >= acceptanceCriteria.minimumTechnicalScore;
      const meetsIntegrity = candidate.flags.length === 0 || acceptanceCriteria.allowedIntegrityRisk !== 'none';
      const meetsVerdict =
        acceptanceCriteria.requiredVerdict === 'any' ||
        (acceptanceCriteria.requiredVerdict === 'pass' && candidate.technicalVerdict === 'pass') ||
        (acceptanceCriteria.requiredVerdict === 'conditional' && (candidate.technicalVerdict === 'pass' || candidate.technicalVerdict === 'conditional'));

      return {
        ...candidate,
        meetsCriteria: meetsScore && meetsIntegrity && meetsVerdict
      };
    });
    setCandidateStatuses(updatedCandidates);
  };

  const handleAddComment = (candidateId: number) => {
    if (!commentText.trim()) return;

    const newComment: CandidateComment = {
      id: `comment-${Date.now()}`,
      candidateId,
      author: userRole === 'technical' ? 'technical' : 'hr',
      authorName: assignedRecruiter,
      text: commentText,
      timestamp: new Date()
    };

    setCandidateComments(prev => [...prev, newComment]);
    setCommentText('');
    setShowCommentModal(null);
    showToast('Comment added');
    addActivityLog({
      type: 'comment-added',
      actor: assignedRecruiter,
      actorRole: userRole === 'technical' ? 'technical' : 'hr',
      description: `Added comment for candidate`,
      metadata: { candidateId }
    });
  };

  const handleSetVerdict = (candidateId: number, verdict: 'pass' | 'fail' | 'conditional') => {
    const updatedCandidates = candidateStatuses.map(c =>
      c.id === candidateId ? { ...c, technicalVerdict: verdict } : c
    );
    setCandidateStatuses(updatedCandidates);
    setShowVerdictModal(null);
    showToast(`Technical verdict set to ${verdict}`);
  };

  const handleOverride = (candidateId: number) => {
    setCandidateOverrides(prev => new Set([...prev, candidateId]));
    const updatedCandidates = candidateStatuses.map(c =>
      c.id === candidateId ? { ...c, overrideApplied: true, meetsCriteria: true } : c
    );
    setCandidateStatuses(updatedCandidates);
    showToast('Override applied - candidate now meets criteria');
    addActivityLog({
      type: 'override-applied',
      actor: assignedRecruiter,
      actorRole: 'hr',
      description: 'Applied criteria override for candidate',
      metadata: { candidateId }
    });
  };

  const handleSaveAssessment = async (assessment: any) => {
    try {
      showToast(assessment.id && !assessment.id.toString().startsWith('assessment-') ? 'Updating assessment...' : 'Saving assessment...');

      const payload = {
        position_id: positionId, // From component state fetched on mount
        group_id: groupId,
        title: assessment.config.title,
        description: assessment.config.description,
        duration_minutes: assessment.config.duration,
        passing_score: assessment.config.passingScore,
        difficulty_level: assessment.config.difficulty,
        randomizeQuestions: assessment.config.randomizeQuestions,
        proctoring: assessment.config.proctoring,
        showResults: assessment.config.showResults,
        allowReview: assessment.config.allowReview,
        sections: assessment.sections
      };

      if (assessment.id && !assessment.id.toString().startsWith('assessment-')) {
        await api.recruiter.updateAssessment(assessment.id, payload);
        const updatedAssessments = groupAssessments.map(a =>
          a.id === assessment.id ? { ...assessment, status: a.status || 'draft' } : a
        );
        setGroupAssessments(updatedAssessments);
        showToast(`Assessment "${assessment.config.title}" updated successfully!`);
      } else {
        const response = await api.recruiter.saveAssessment(payload);
        const newAssessment = {
          ...assessment,
          id: response.assessment_id || `assessment-${Date.now()}`,
          groupId,
          createdAt: new Date().toISOString(),
          createdBy: assignedRecruiter,
          status: 'draft'
        };
        setGroupAssessments([...groupAssessments, newAssessment]);
        showToast(`Assessment "${assessment.config.title}" created successfully!`);
      }

      setShowAssessmentCreation(false);
      setEditingAssessmentData(null);
    } catch (error) {
      console.error('Error saving assessment:', error);
      showToast('Failed to save assessment. Please try again.');
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    if (confirm('Are you sure you want to delete this assessment?')) {
      try {
        await api.recruiter.deleteAssessment(assessmentId);
        setGroupAssessments(groupAssessments.filter(a => a.id !== assessmentId));
        showToast('Assessment deleted successfully');
      } catch (error) {
        console.error('Error deleting assessment:', error);
        showToast('Failed to delete assessment');
      }
    }
  };

  const handleDeleteAIInterview = async (interviewId: string) => {
    if (confirm('Are you sure you want to delete this AI interview?')) {
      try {
        await api.recruiter.deleteInterview(groupId, interviewId);
        setGroupInterviews(groupInterviews.filter(i => i.id !== interviewId));
        showToast('AI Interview deleted successfully');
      } catch (error) {
        console.error('Error deleting AI interview:', error);
        showToast('Failed to delete AI interview');
      }
    }
  };

  const handleScheduleInterview = async (data: {
    application_id: string;
    scheduled_at: string;
    duration_minutes: number;
    meeting_link?: string;
  }) => {
    try {
      await api.recruiter.scheduleInterview(groupId, data);
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
      setRefreshKey(prev => prev + 1);
      showToast('Interview scheduled successfully');
    } catch (error) {
      console.error('Failed to schedule interview:', error);
      showToast('Failed to schedule interview');
      throw error;
    }
  };

  const handleToggleCandidateSelection = (candidateId: number) => {
    if (stageState !== 'review-mode') return;

    setSelectedCandidates(prev =>
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'passed':
        return <CheckCircle size={16} className="text-[#10b981]" />;
      case 'pending':
      case 'unlocked':
      case 'in_progress':
      case 'not_started':
        return <Clock size={16} className="text-[#f59e0b]" />;
      case 'failed':
        return <XCircle size={16} className="text-[#ef4444]" />;
      default:
        return <div className="w-[16px] h-[16px] rounded-full border-2 border-[#e5e7eb]" />;
    }
  };

  const getCandidateComments = (candidateId: number) => {
    return candidateComments.filter(c => c.candidateId === candidateId);
  };

  const getStageActionButton = () => {
    const currentStepData = pipelineSteps.find(s => s.id === currentStage);
    if (!currentStepData) return null;

    if (isArchived) return null;

    // Technical recruiters configure stages — HR manages the lifecycle (start/close)
    if (userRole === 'technical') {
      return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-[8px] bg-blue-50 border border-blue-200 text-blue-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span className="font-['Arimo',sans-serif] text-[13px]">
            Monitoring mode — only HR can start, close, or progress stages
          </span>
        </div>
      );
    }

    // Check if this is the last stage and it's closed - show Final Decision button
    const currentStepIndex = pipelineSteps.findIndex(s => s.id === currentStage);
    const isLastStage = currentStepIndex === pipelineSteps.length - 1;

    if (isLastStage && stageState === 'closed') {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStageReviewPage(true)}
            className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white transition-colors"
          >
            <BarChart3 size={16} />
            <span className="font-['Arimo',sans-serif] text-[14px]">
              View Stage Results
            </span>
          </button>
          <button
            onClick={() => setShowFinalDecisionPage(true)}
            className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-colors shadow-lg"
          >
            <CheckCircle size={18} />
            <span className="font-['Arimo',sans-serif] text-[14px] font-semibold">
              Final Decision - Send Offers
            </span>
          </button>
          <button
            onClick={() => setShowArchiveModal(true)}
            className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#d97706] hover:bg-[#b45309] text-white transition-colors"
          >
            <Archive size={16} />
            <span className="font-['Arimo',sans-serif] text-[14px]">Archive Group</span>
          </button>
        </div>
      );
    }

    if (stageState === 'not-started') {
      const currentIdx = pipelineSteps.findIndex(s => s.id === currentStage);
      const prevStep = currentIdx > 0 ? pipelineSteps[currentIdx - 1] : null;
      const canStart = !prevStep || prevStep.state === 'closed';
      const prevIsClosed = prevStep?.state === 'closed';
      return (
        <div className="flex items-center gap-2">
          {prevIsClosed && (
            <button
              onClick={() => {
                setBulkProgressFromStage(prevStep!.id);
                setShowBulkProgressionModal(true);
              }}
              className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#10b981] hover:bg-[#059669] text-white transition-colors"
            >
              <Users size={16} />
              <span className="font-['Arimo',sans-serif] text-[14px]">Move Candidates</span>
            </button>
          )}
          <button
            onClick={canStart ? handleStartStage : undefined}
            disabled={!canStart || startStageMutation.isPending}
            title={!canStart ? `Close "${prevStep?.name}" stage first` : undefined}
            className={`flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] text-white transition-colors ${
              canStart && !startStageMutation.isPending
                ? 'bg-[#6366f1] hover:bg-[#5558e3] cursor-pointer'
                : 'bg-[#9ca3af] cursor-not-allowed'
            }`}
          >
            {startStageMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            <span className="font-['Arimo',sans-serif] text-[14px]">
              {startStageMutation.isPending ? 'Starting…' : 'Start Current Stage'}
            </span>
          </button>
        </div>
      );
    }

    if (stageState === 'active') {
      return (
        <button
          onClick={handleCloseStage}
          disabled={closeStageMutation.isPending}
          className={`flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] text-white transition-colors ${
            closeStageMutation.isPending ? 'bg-[#9ca3af] cursor-not-allowed' : 'bg-[#ef4444] hover:bg-[#dc2626]'
          }`}
        >
          {closeStageMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
          <span className="font-['Arimo',sans-serif] text-[14px]">
            {closeStageMutation.isPending ? 'Closing…' : 'Close Stage'}
          </span>
        </button>
      );
    }

    if (stageState === 'closed') {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStageReviewPage(true)}
            className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white transition-colors"
          >
            <BarChart3 size={16} />
            <span className="font-['Arimo',sans-serif] text-[14px]">View Stage Results</span>
          </button>
          <button
            onClick={() => {
              setBulkProgressFromStage(currentStage);
              setShowBulkProgressionModal(true);
            }}
            className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#10b981] hover:bg-[#059669] text-white transition-colors"
          >
            <Users size={16} />
            <span className="font-['Arimo',sans-serif] text-[14px]">Move Candidates</span>
          </button>
        </div>
      );
    }

    if (stageState === 'review-mode') {
      return (
        <button
          onClick={handleProceedSelected}
          disabled={selectedCandidates.length === 0}
          className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:text-[#9ca3af] text-white transition-colors"
        >
          <CheckCircle size={16} />
          <span className="font-['Arimo',sans-serif] text-[14px]">
            Proceed Selected Candidates ({selectedCandidates.length})
          </span>
        </button>
      );
    }

    return null;
  };

  const getStageStateBadge = () => {
    const badges = {
      'not-started': { text: 'Not Started', color: 'bg-gray-200 text-gray-700' },
      'active': { text: 'Active', color: 'bg-emerald-100 text-emerald-700' },
      'closed': { text: 'Closed', color: 'bg-amber-100 text-amber-700' },
      'review-mode': { text: 'Review Mode', color: 'bg-purple-100 text-purple-700' }
    };

    const badge = badges[stageState];
    return (
      <span className={`px-[12px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  // If creating a technical assessment
  if (showAssessmentCreation) {
    return (
      <CreateAdvancedAssessment
        initialData={editingAssessmentData}
        onBack={() => {
          setShowAssessmentCreation(false);
          setEditingAssessmentData(null);
        }}
        onSave={handleSaveAssessment}
      />
    );
  }



  // If showing suspect review for a candidate
  if (showSuspectReview !== null) {
    const candidate = candidateStatuses.find(c => c.id === showSuspectReview);
    if (candidate) {
      return (
        <SuspectReviewPage
          candidateId={String(candidate.id)}
          applicationId={candidate.applicationId}
          onBack={() => setShowSuspectReview(null)}
          onViewCandidate={(id: string) => onViewCandidate(Number(id))}
        />
      );
    }
  }

  // Full-page: Stage Review Page
  if (showStageReviewPage) {
    const currentStepIndex = pipelineSteps.findIndex(s => s.id === currentStage);
    const isLastStageCheck = currentStepIndex === pipelineSteps.length - 1;
    return (
      <StageReviewPage
        stageName={pipelineSteps.find(s => s.id === currentStage)?.name || ''}
        stageId={currentStage}
        candidates={candidateStatuses}
        pipelineSteps={pipelineSteps.map(s => ({ id: s.id, name: s.name }))}
        currentStageIndex={currentStepIndex}
        isLastStage={isLastStageCheck}
        startDate={pipelineSteps.find(s => s.id === currentStage)?.startDate || new Date()}
        endDate={pipelineSteps.find(s => s.id === currentStage)?.actualEndDate || new Date()}
        acceptanceCriteria={acceptanceCriteria}
        onBack={() => setShowStageReviewPage(false)}
        onProgressCandidates={(selectedIds, action) => {
          handleBulkProgression(selectedIds, action);
          setShowStageReviewPage(false);
        }}
        onFinalDecision={() => {
          setShowStageReviewPage(false);
          setShowFinalDecisionPage(true);
        }}
        onViewCandidate={onViewCandidate}
      />
    );
  }

  // Full-page: Final Decision Page
  if (showFinalDecisionPage) {
    return (
      <FinalDecisionPage
        groupName={groupName}
        positionTitle={description}
        candidates={candidateStatuses
          .filter(c => c.progressionState !== 'rejected' && c.progressionState !== 'offered')
          .map(c => ({
            id: c.id,
            name: c.name,
            avatar: c.avatar,
            email: c.email || `candidate${c.id}@example.com`,
            phone: c.phone || `+1-555-${String(c.id).padStart(4, '0')}`,
            assessmentScore: c.assessmentScore,
            aiInterviewScore: c.aiInterviewScore,
            liveInterviewScore: c.liveInterviewScore,
            flags: c.flags,
            meetsCriteria: c.meetsCriteria,
            technicalVerdict: c.technicalVerdict,
            progressionState: c.progressionState
          }))}
        stages={pipelineSteps.map(s => ({ id: s.id, name: s.name }))}
        onBack={() => setShowFinalDecisionPage(false)}
        onSendOffers={(ids, content) => {
          handleSendOffers(ids, content);
          setShowFinalDecisionPage(false);
        }}
        onExportContacts={(ids) => {
          handleExportContacts(ids);
        }}
      />
    );
  }


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
        <LoadingSpinner message="Loading group details..." fullScreen={false} />
      </div>
    );
  }

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
              {getStageStateBadge()}
              {candidateStatuses.filter(c => c.flags.length > 0).length > 0 && (
                <button
                  onClick={() => setShowFlaggedBatch(true)}
                  className="flex items-center gap-1 px-[10px] py-[4px] bg-[#fef2f2] text-[#ef4444] rounded-[6px] font-['Arimo',sans-serif] text-[12px] hover:bg-[#fee2e2] transition-colors"
                >
                  <Flag size={12} />
                  {candidateStatuses.filter(c => c.flags.length > 0).length} Flagged
                </button>
              )}
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
            {/* DEV ONLY */}
            <button
              onClick={async () => {
                if (!window.confirm('[DEV] Reset all stage progress and application statuses for this group?')) return;
                await resetStagesMutation.mutateAsync({ groupId });
                showToast('Stage progress reset');
              }}
              disabled={resetStagesMutation.isPending}
              className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-red-300 bg-red-50 hover:bg-red-100 transition-colors"
              title="[DEV] Reset all stage progress"
            >
              <RotateCcw size={16} className="text-red-600" />
              <span className="font-['Arimo',sans-serif] text-red-700 text-[14px]">
                {resetStagesMutation.isPending ? 'Resetting…' : 'Reset Stages'}
              </span>
            </button>
            {userRole === 'technical' && (
              <button
                onClick={() => setShowFlowConfigModal(true)}
                className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                title="Configure Pipeline Flow"
              >
                <Edit size={16} className="text-[#6b7280]" />
                <span className="font-['Arimo',sans-serif] text-[#111827] text-[14px]">
                  Configure Flow
                </span>
              </button>
            )}
            {getStageActionButton()}
            <button
              onClick={() => setShowActivityLog(true)}
              className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
            >
              <FileText size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[#111827] text-[14px]">
                Activity Log
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

        {/* Archived group banner */}
        {isArchived && (
          <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-3 bg-[#fef3c7] border border-[#fde68a] rounded-[8px]">
            <Archive size={16} className="text-[#d97706] flex-shrink-0" />
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#92400e]">
              This group is archived — it is read-only. Candidates are preserved and can be reviewed below.
            </p>
          </div>
        )}

        {/* Filtration Flow Indicator */}
        {activeFlow.length > 0 && (
          <div className="mt-4 px-8 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={13} className="text-emerald-600" />
                <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-emerald-900">
                  Filtration Flow:
                </span>
              </div>
              {activeFlow.map((moduleType, index) => {
                const moduleInfo: Record<string, { name: string; icon: any; color: string }> = {
                  'assessment': { name: 'Technical Assessment', icon: FileText, color: 'emerald' },
                  'ai-interview': { name: 'AI Interview', icon: Video, color: 'blue' },
                  'live-interview': { name: 'Live Interview', icon: MessageSquare, color: 'purple' }
                };
                const info = moduleInfo[moduleType] || { name: moduleType, icon: FileText, color: 'gray' };
                const Icon = info.icon;
                return (
                  <div key={moduleType} className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 bg-white border border-${info.color}-200 rounded-[6px]`}>
                      <div className={`w-5 h-5 rounded bg-${info.color}-100 flex items-center justify-center`}>
                        <Icon size={12} className={`text-${info.color}-600`} />
                      </div>
                      <span className="font-['Arimo',sans-serif] text-[12px] text-gray-700">
                        {index + 1}. {info.name}
                      </span>
                    </div>
                    {index < activeFlow.length - 1 && (
                      <span className="text-emerald-400 font-medium">→</span>
                    )}
                  </div>
                );
              })}
              <span className="text-emerald-400 font-medium">→</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-[6px]">
                <CheckCircle size={12} className="text-gray-500" />
                <span className="font-['Arimo',sans-serif] text-[12px] text-gray-500">Review & Offer</span>
              </div>
            </div>
          </div>
        )}

        {/* Hold Warning Card */}
        {candidateStatuses.filter(c => c.progressionState === 'on-hold').length > 0 && (
          <div className="px-8 mt-4">
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-[10px]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <span className="font-['Arimo',sans-serif] text-[14px] font-medium text-amber-800">
                  {candidateStatuses.filter(c => c.progressionState === 'on-hold').length} candidate{candidateStatuses.filter(c => c.progressionState === 'on-hold').length > 1 ? 's' : ''} on hold
                </span>
              </div>
              <button
                onClick={() => setShowHoldReview(true)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-[6px] font-['Arimo',sans-serif] text-[13px] font-medium transition-colors"
              >
                Review
              </button>
            </div>
          </div>
        )}

        {/* Pipeline Progress with Stage States */}
        <div className="px-8 mt-6">
          <div className={`grid gap-4 ${pipelineSteps.length === 1 ? 'grid-cols-1' :
            pipelineSteps.length === 2 ? 'grid-cols-2' :
              pipelineSteps.length === 3 ? 'grid-cols-3' :
                pipelineSteps.length === 4 ? 'grid-cols-4' :
                  'grid-cols-5'
            }`}>
            {pipelineSteps.map((step, index) => {
              const isCurrentStage = step.id === currentStage;
              const isPastStage = pipelineSteps.findIndex(s => s.id === currentStage) > index;
              const isFutureStage = pipelineSteps.findIndex(s => s.id === currentStage) < index;

              return (
                <div
                  key={step.id}
                  className={`p-4 rounded-[12px] border-2 transition-all ${isCurrentStage
                    ? 'border-[#6366f1] bg-[#f5f3ff]'
                    : isPastStage
                      ? 'border-[#e5e7eb] bg-white opacity-60'
                      : 'border-[#e5e7eb] bg-white opacity-40'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-['Arimo',sans-serif] text-[13px] ${isCurrentStage ? 'text-[#6366f1] font-semibold' : 'text-[#6b7280]'
                      }`}>
                      {step.name}
                    </span>
                    {step.state !== 'not-started' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${step.state === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        step.state === 'closed' ? 'bg-amber-100 text-amber-700' :
                          step.state === 'review-mode' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                        {step.state.replace('-', ' ')}
                      </span>
                    )}
                    {isFutureStage && (
                      <Lock size={12} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[20px] ${isCurrentStage ? 'text-[#6366f1]' : 'text-[#111827]'
                      }`}>
                      {step.completed}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      / {step.total}
                    </span>
                  </div>
                  {!isFutureStage && (
                    <div className="mt-2 h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${isCurrentStage ? 'bg-[#6366f1]' : 'bg-[#10b981]'
                          } transition-all`}
                        style={{ width: `${(step.completed / step.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stage Configuration Section */}
        <div className="mt-6 bg-white rounded-[12px] border border-[#e5e7eb] p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="font-['Arimo',sans-serif] text-[15px] text-[#111827]">
                Stage Configuration
              </h3>
              <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-[6px] font-['Arimo',sans-serif] text-[11px] text-emerald-800 flex items-center gap-1">
                <Shield size={12} />
                Defined by Technical Recruiter
              </span>
              {stageConfigLocked && (
                <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-[6px] font-['Arimo',sans-serif] text-[11px] text-amber-800 flex items-center gap-1">
                  <Lock size={12} />
                  Locked (Stage Active)
                </span>
              )}
            </div>


          </div>

          <div className="space-y-3">
            {/* Module Monitoring Dashboard - Technical Recruiter Only */}
            {/* Module Monitoring Dashboard - Available to both HR and Technical */}
            {(userRole === 'technical' || userRole === 'recruiter') && (
              <div className="flex gap-3">
                {activeFlow.includes('assessment') && (
                  <button
                    onClick={() => setShowModuleMonitoring('assessment')}
                    disabled={(() => {
                      const step = pipelineSteps.find(s => s.id === 'assessment');
                      return !step || step.state === 'not-started';
                    })()}
                    title={(() => {
                      const step = pipelineSteps.find(s => s.id === 'assessment');
                      return (!step || step.state === 'not-started') ? "Stage must be started to monitor results" : "";
                    })()}
                    className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-[#6366f1] disabled:hover:to-[#8b5cf6]"
                  >
                    <BarChart3 size={16} />
                    <span className="font-['Arimo',sans-serif] text-[14px]">
                      Monitor Assessment Results
                    </span>
                  </button>
                )}
                {(activeFlow.includes('ai-interview') || activeFlow.includes('live-interview')) && (
                  <button
                    onClick={() => setShowModuleMonitoring('ai-interview')}
                    disabled={(() => {
                      const aiStep = pipelineSteps.find(s => s.id === 'ai-interview');
                      const liveStep = pipelineSteps.find(s => s.id === 'live-interview');
                      const aiStarted = aiStep && aiStep.state !== 'not-started';
                      const liveStarted = liveStep && liveStep.state !== 'not-started';
                      return !aiStarted && !liveStarted;
                    })()}
                    title={(() => {
                      const aiStep = pipelineSteps.find(s => s.id === 'ai-interview');
                      const liveStep = pipelineSteps.find(s => s.id === 'live-interview');
                      const aiStarted = aiStep && aiStep.state !== 'not-started';
                      const liveStarted = liveStep && liveStep.state !== 'not-started';
                      return (!aiStarted && !liveStarted) ? "Interview stages must be started to monitor results" : "";
                    })()}
                    className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-[#6366f1] disabled:hover:to-[#8b5cf6]"
                  >
                    <BarChart3 size={16} />
                    <span className="font-['Arimo',sans-serif] text-[14px]">
                      Monitor AI Interview Results
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Configuration Buttons - Technical Recruiter Only, ordered by pipeline stage */}
            {userRole === 'technical' && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  {activeFlow.map((stage) => {
                    if (stage === 'assessment') {
                      const locked = stageConfigLocked || groupAssessments.length > 0;
                      return (
                        <button
                          key="assessment"
                          onClick={() => {
                            if (locked) {
                              showToast(stageConfigLocked ? 'Cannot modify configuration - stage is active' : 'Delete the existing assessment first');
                              return;
                            }
                            setShowAssessmentCreation(true);
                          }}
                          disabled={locked}
                          className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FileText size={16} />
                          <span className="font-['Arimo',sans-serif] text-[14px]">Add Tech Assessment</span>
                        </button>
                      );
                    }
                    if (stage === 'live-interview' || stage === 'live_interview') {
                      const locked = stageConfigLocked || groupInterviews.some(i => i.interview_type === 'live_ai_v2');
                      return (
                        <button
                          key="live-interview"
                          onClick={() => {
                            if (locked) {
                              showToast(stageConfigLocked ? 'Cannot modify configuration - stage is active' : 'Delete the existing live interview config first');
                              return;
                            }
                            setShowLiveInterviewV2Setup(true);
                          }}
                          disabled={locked}
                          className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Video size={16} />
                          <span className="font-['Arimo',sans-serif] text-[14px]">Add Live Interview</span>
                        </button>
                      );
                    }
                    if (stage === 'ai-interview' || stage === 'ai_interview') {
                      const locked = stageConfigLocked || groupInterviews.some(i => i.interview_type === 'recorded') || !!interviewConfigId;
                      return (
                        <button
                          key="ai-interview"
                          onClick={() => {
                            if (locked) {
                              showToast(stageConfigLocked ? 'Cannot modify configuration - stage is active' : 'Delete the existing recorded interview first');
                              return;
                            }
                            setShowRecordedInterviewSetup(true);
                          }}
                          disabled={locked}
                          className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Mic size={16} />
                          <span className="font-['Arimo',sans-serif] text-[14px]">Add Recorded Interview</span>
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}

            {/* Session Monitor button — available to both HR and Technical */}
            {(activeFlow.includes('live-interview') || activeFlow.includes('live_interview')) && (userRole === 'technical' || userRole === 'recruiter') && (
              <div className="mt-3">
                <button
                  onClick={() => setShowLiveMonitor(true)}
                  className="flex items-center justify-center gap-2 h-[40px] px-[14px] rounded-[8px] bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
                  title="Open real-time session monitoring dashboard"
                >
                  <Activity size={16} />
                  <span className="font-['Arimo',sans-serif] text-[14px]">Monitor</span>
                </button>
              </div>
            )}
          </div>
          {/* Display Created Assessments (Technical Recruiter Only) */}
          {userRole === 'technical' && (
            <div className="mt-4">
              {groupAssessments.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-2">
                    Created Assessments ({groupAssessments.length})
                  </h4>
                  {groupAssessments.map((assessment) => (
                    <div
                      key={assessment.id}
                      className="p-3 bg-[#f9fafb] rounded-[8px] border border-[#e5e7eb] hover:border-[#10b981] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                              {assessment.config.title}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${assessment.status === 'draft' ? 'bg-gray-200 text-gray-700' :
                              assessment.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                              {assessment.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[12px] text-[#6b7280]">
                            <span>{assessment.sections.length} sections</span>
                            <span>•</span>
                            <span>{assessment.config.duration} min</span>
                            <span>•</span>
                            <span>{assessment.config.difficulty}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              try {
                                showToast('Loading assessment details...');
                                const data = await api.recruiter.getAssessment(assessment.id);
                                setEditingAssessmentData(data);
                                setShowAssessmentCreation(true);
                              } catch (error) {
                                console.error('Failed to load assessment details:', error);
                                showToast('Failed to load assessment details for editing');
                              }
                            }}
                            disabled={stageConfigLocked}
                            className="h-[28px] px-[12px] rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors text-[12px] text-[#374151] disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAssessment(assessment.id)}
                            disabled={stageConfigLocked}
                            className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#fef2f2] hover:border-[#fca5a5] hover:text-[#ef4444] transition-colors text-[#6b7280] disabled:opacity-50"
                            title="Delete Assessment"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              showToast('Assessment ready to be sent to candidates');
                            }}
                            className="h-[28px] px-[12px] rounded-[6px] bg-[#10b981] hover:bg-[#059669] text-white transition-colors text-[12px]"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-[8px]">
                  <p className="font-['Arimo',sans-serif] text-[13px] text-emerald-800">
                    💡 No assessments created yet. Click "Add Tech Assessment" above to create your first assessment with MCQ, Essay, and Coding questions.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Display Created AI Interviews (Technical Recruiter Only) */}
          {userRole === 'technical' && groupInterviews && groupInterviews.length > 0 && (
            <div className="mt-4">
              <div className="space-y-2">
                <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-2">
                  Created AI Interviews ({groupInterviews.length})
                </h4>
                {groupInterviews.map((interview) => {
                  const isLiV2 = interview.interview_type === 'live_ai_v2';
                  const rubricState = isLiV2 ? interview.live_flow_config?.rubric_state : null;
                  const bankState = isLiV2 ? interview.live_flow_config?.bank_state : null;
                  return (
                    <div
                      key={interview.id}
                      className="p-3 bg-[#f9fafb] rounded-[8px] border border-[#e5e7eb] hover:border-[#6366f1] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                              {interview.title}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                              {isLiV2 ? 'Live AI V2' : interview.interview_type === 'live_ai' || interview.interview_type === 'live' ? 'Live AI' : 'Recorded'}
                            </span>
                            {isLiV2 && rubricState && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${rubricState === 'frozen' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                Rubric: {rubricState === 'frozen' ? '✓ Frozen' : 'Draft'}
                              </span>
                            )}
                            {isLiV2 && bankState && bankState !== 'none' && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${bankState === 'frozen' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                Bank: {bankState === 'frozen' ? '✓ Frozen' : 'Draft'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[12px] text-[#6b7280]">
                            {isLiV2 ? (
                              <span>{interview.live_flow_config?.dim_count ?? 0} dimensions</span>
                            ) : (
                              <span>{interview.questions_count} questions</span>
                            )}
                            <span>•</span>
                            <span>{interview.total_duration_minutes ?? 30} min</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (stageConfigLocked) {
                                showToast('Cannot modify configuration - stage is active');
                                return;
                              }
                              if (isLiV2) {
                                setShowLiveInterviewV2Setup(true);
                              } else {
                                setEditingInterviewData(interview);
                                setShowRecordedInterviewSetup(true);
                              }
                            }}
                            disabled={stageConfigLocked}
                            className="h-[28px] px-[12px] rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors text-[12px] text-[#374151] disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (stageConfigLocked) {
                                showToast('Cannot delete — stage is currently active. Close the stage first.');
                                return;
                              }
                              handleDeleteAIInterview(interview.id);
                            }}
                            className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#fef2f2] hover:border-[#fca5a5] hover:text-[#ef4444] transition-colors text-[#6b7280]"
                            title="Delete Interview"
                          >
                            <Trash2 size={14} />
                          </button>
                          {!isLiV2 && (
                            <button
                              onClick={() => showToast('AI Interview ready to be sent to candidates')}
                              className="h-[28px] px-[12px] rounded-[6px] bg-[#1b2559] hover:bg-[#2c3a7c] text-white transition-colors text-[12px]"
                            >
                              Send
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-8 py-6">
        {/* Candidate Progress Matrix */}
        <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#e5e7eb]">
            <div className="flex items-center justify-between">
              <h2 className="text-[#111827]">Candidate Progress Matrix</h2>
              <div className="flex items-center gap-2">
                {stageState === 'review-mode' && userRole === 'recruiter' && selectedCandidates.length > 0 && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 text-[13px] rounded-[6px]">
                    {selectedCandidates.length} selected
                  </span>
                )}
                <button
                  onClick={() => setShowModuleFilters(!showModuleFilters)}
                  className={`flex items-center gap-2 h-[36px] px-[14px] rounded-[8px] border transition-colors ${showModuleFilters
                    ? 'bg-[#f5f3ff] border-[#6366f1] text-[#6366f1]'
                    : 'bg-white hover:bg-[#f9fafb] border-[#e5e7eb] text-[#111827]'
                    }`}
                >
                  <Filter size={16} />
                  <span className="font-['Arimo',sans-serif] text-[13px]">
                    Filters
                  </span>
                  <ChevronDown size={14} className={`transition-transform ${showModuleFilters ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Enhanced Filters */}
            <AnimatePresence>
              {showModuleFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 p-4 bg-[#f9fafb] rounded-[12px] border border-[#e5e7eb]">
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">
                          Meets Criteria
                        </label>
                        <select
                          value={moduleFilters.meetsCriteria}
                          onChange={(e) => setModuleFilters({
                            ...moduleFilters,
                            meetsCriteria: e.target.value as 'all' | 'yes' | 'no'
                          })}
                          className="w-full h-[32px] px-2 rounded-[6px] border border-[#e5e7eb] bg-white text-[13px]"
                        >
                          <option value="all">All</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">
                          Flags
                        </label>
                        <select
                          value={moduleFilters.flagsFilter}
                          onChange={(e) => setModuleFilters({
                            ...moduleFilters,
                            flagsFilter: e.target.value as 'all' | 'integrity' | 'suspicious'
                          })}
                          className="w-full h-[32px] px-2 rounded-[6px] border border-[#e5e7eb] bg-white text-[13px]"
                        >
                          <option value="all">All</option>
                          <option value="integrity">With Flags</option>
                          <option value="suspicious">Suspicious Only</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={moduleFilters.hasHRComment}
                            onChange={(e) => setModuleFilters({
                              ...moduleFilters,
                              hasHRComment: e.target.checked
                            })}
                            className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                          />
                          <span className="text-[13px] text-[#374151]">Has HR Comment</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={moduleFilters.hasTechnicalComment}
                            onChange={(e) => setModuleFilters({
                              ...moduleFilters,
                              hasTechnicalComment: e.target.checked
                            })}
                            className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                          />
                          <span className="text-[13px] text-[#374151]">Has Technical Comment</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                <tr>
                  {/* Show checkbox column only for HR in review mode */}
                  {userRole === 'recruiter' && stageState === 'review-mode' && (
                    <th className="p-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.length === candidateStatuses.filter(c => c.progressionState === 'active').length && candidateStatuses.filter(c => c.progressionState === 'active').length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCandidates(candidateStatuses.filter(c => c.progressionState === 'active').map(c => c.id));
                          } else {
                            setSelectedCandidates([]);
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                      />
                    </th>
                  )}
                  <th className="p-4 text-left">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Candidate</span>
                  </th>
                  {activeFlow.map(stageType => {
                    const moduleNames: Record<string, string> = {
                      'assessment': 'Assessment',
                      'ai-interview': 'AI Interview',
                      'live-interview': 'Live Interview'
                    };
                    return (
                      <th key={stageType} className="p-4 text-center">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">{moduleNames[stageType] || stageType}</span>
                      </th>
                    );
                  })}

                  <th className="p-4 text-center">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Comments</span>
                  </th>
                  <th className="p-4 text-center">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Status</span>
                  </th>
                  <th className="p-4 text-center">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidateStatuses.length === 0 ? (
                  <tr>
                    <td colSpan={userRole === 'recruiter' && stageState === 'review-mode' ? 5 + activeFlow.length : 4 + activeFlow.length} className="p-8 text-center">
                      <div className="flex flex-col items-center justify-center text-[#6b7280]">
                        <Users size={40} className="mb-3 opacity-20" />
                        <p className="font-['Arimo',sans-serif] text-[15px]">No candidates in this group yet.</p>
                        <p className="text-[13px]">Add candidates to track their progress.</p>
                      </div>
                    </td>
                  </tr>
                ) : candidateStatuses.filter(candidate => {
                  // Apply filters
                  if (moduleFilters.meetsCriteria !== 'all') {
                    if (moduleFilters.meetsCriteria === 'yes' && !candidate.meetsCriteria) return false;
                    if (moduleFilters.meetsCriteria === 'no' && candidate.meetsCriteria) return false;
                  }
                  if (moduleFilters.flagsFilter !== 'all') {
                    if (moduleFilters.flagsFilter === 'integrity' && candidate.flags.length === 0) return false;
                  }
                  if (moduleFilters.hasHRComment) {
                    const comments = getCandidateComments(candidate.id);
                    if (!comments.some(c => c.author === 'hr')) return false;
                  }
                  if (moduleFilters.hasTechnicalComment) {
                    const comments = getCandidateComments(candidate.id);
                    if (!comments.some(c => c.author === 'technical')) return false;
                  }
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={userRole === 'recruiter' && stageState === 'review-mode' ? 5 + activeFlow.length : 4 + activeFlow.length} className="p-8 text-center text-[#6b7280]">
                      <p className="font-['Arimo',sans-serif] text-[15px]">No candidates match your current filters.</p>
                    </td>
                  </tr>
                ) : (
                  candidateStatuses
                    .filter(candidate => {
                      // Apply filters
                      if (moduleFilters.meetsCriteria !== 'all') {
                        if (moduleFilters.meetsCriteria === 'yes' && !candidate.meetsCriteria) return false;
                        if (moduleFilters.meetsCriteria === 'no' && candidate.meetsCriteria) return false;
                      }
                      if (moduleFilters.flagsFilter !== 'all') {
                        if (moduleFilters.flagsFilter === 'integrity' && candidate.flags.length === 0) return false;
                      }
                      if (moduleFilters.hasHRComment) {
                        const comments = getCandidateComments(candidate.id);
                        if (!comments.some(c => c.author === 'hr')) return false;
                      }
                      if (moduleFilters.hasTechnicalComment) {
                        const comments = getCandidateComments(candidate.id);
                        if (!comments.some(c => c.author === 'technical')) return false;
                      }
                      return true;
                    })
                    .map((candidate) => {
                      const comments = getCandidateComments(candidate.id);
                      return (
                        <tr key={candidate.id} className="border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors">
                          {/* Selection checkbox - HR only in review mode */}
                          {userRole === 'recruiter' && stageState === 'review-mode' && (
                            <td className="p-4">
                              {candidate.progressionState === 'active' && (
                                <input
                                  type="checkbox"
                                  checked={selectedCandidates.includes(candidate.id)}
                                  onChange={() => handleToggleCandidateSelection(candidate.id)}
                                  className="w-4 h-4 rounded border-gray-300 text-[#6366f1]"
                                />
                              )}
                            </td>
                          )}
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-[40px] h-[40px] rounded-full bg-[#ede9fe] flex items-center justify-center">
                                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                                  {candidate.avatar}
                                </span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => onViewCandidate(candidate.id)}
                                    className="font-['Arimo',sans-serif] text-[14px] text-[#111827] hover:text-[#6366f1] hover:underline"
                                  >
                                    {candidate.name}
                                  </button>
                                  {candidate.overrideApplied && (
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded-full flex items-center gap-1">
                                      <AlertTriangle size={10} />
                                      Override
                                    </span>
                                  )}
                                </div>
                                {candidate.flags.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1">
                                    {candidate.flags.map((flag, idx) => (
                                      <span
                                        key={idx}
                                        className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full"
                                      >
                                        {flag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          {activeFlow.map(stageType => {
                            if (stageType === 'assessment') {
                              return (
                                <td key={stageType} className="p-4 text-center">
                                  <button
                                    onClick={() => {
                                      if (candidate.assessmentScore > 0 && onViewModuleDetail) {
                                        onViewModuleDetail({
                                          type: 'assessment',
                                          candidateId: candidate.id,
                                          candidateName: candidate.name,
                                          score: candidate.assessmentScore,
                                          completedDate: new Date().toLocaleDateString()
                                        });
                                      }
                                    }}
                                    className={`flex flex-col items-center gap-1 mx-auto ${candidate.assessmentScore > 0 ? 'hover:bg-[#f9fafb] rounded-[6px] p-2 transition-colors' : ''}`}
                                  >
                                    {getStatusIcon(candidate.assessment)}
                                    {candidate.assessmentScore > 0 && (
                                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6366f1] hover:underline">
                                        {candidate.assessmentScore}%
                                      </span>
                                    )}
                                  </button>
                                </td>
                              );
                            }
                            if (stageType === 'ai-interview') {
                              return (
                                <td key={stageType} className="p-4 text-center">
                                  <button
                                    onClick={() => {
                                      if (candidate.aiInterviewScore > 0 && onViewModuleDetail) {
                                        onViewModuleDetail({
                                          type: 'ai-interview',
                                          candidateId: candidate.id,
                                          candidateName: candidate.name,
                                          score: candidate.aiInterviewScore,
                                          completedDate: new Date().toLocaleDateString()
                                        });
                                      }
                                    }}
                                    className={`flex flex-col items-center gap-1 mx-auto ${candidate.aiInterviewScore > 0 ? 'hover:bg-[#f9fafb] rounded-[6px] p-2 transition-colors' : ''}`}
                                  >
                                    {getStatusIcon(candidate.aiInterview)}
                                    {candidate.aiInterviewScore > 0 && (
                                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6366f1] hover:underline">
                                        {candidate.aiInterviewScore}%
                                      </span>
                                    )}
                                  </button>
                                </td>
                              );
                            }
                            if (stageType === 'live-interview') {
                              return (
                                <td key={stageType} className="p-4 text-center">
                                  <div className="flex flex-col items-center gap-1 mx-auto">
                                    {getStatusIcon(candidate.liveInterview)}
                                    {candidate.liveInterviewScore > 0 && (
                                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6366f1]">
                                        {candidate.liveInterviewScore}%
                                      </span>
                                    )}

                                    {candidate.liveInterviewScheduledAt ? (
                                      <div className="flex flex-col items-center mt-1">
                                        <span className="text-[11px] text-gray-600 font-medium">
                                          {new Date(candidate.liveInterviewScheduledAt).toLocaleString(undefined, {
                                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                          })}
                                        </span>
                                        {candidate.liveInterviewMeetingLink && (
                                          <a
                                            href={candidate.liveInterviewMeetingLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-blue-600 hover:underline mt-0.5"
                                          >
                                            Join Link
                                          </a>
                                        )}
                                      </div>
                                    ) : candidate.liveInterview !== 'completed' && (
                                      <button
                                        onClick={() => {
                                          setSelectedCandidateForSchedule({ id: String(candidate.id), name: candidate.name });
                                          setShowScheduleModal(true);
                                        }}
                                        className="text-[11px] text-[#6366f1] hover:underline flex items-center gap-1"
                                      >
                                        <Calendar size={12} />
                                        Schedule
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            }
                            return null;
                          })}

                          <td className="p-4 text-center">
                            <button
                              onClick={() => setShowCommentModal(candidate.id)}
                              className="flex items-center gap-1 mx-auto px-3 py-1 rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
                            >
                              <MessageSquare size={14} className="text-[#6b7280]" />
                              <span className="text-[12px] text-[#374151]">
                                {comments.length > 0 ? comments.length : 'Add'}
                              </span>
                            </button>
                          </td>
                          <td className="p-4 text-center">
                            {candidate.progressionState && candidate.progressionState !== 'active' ? (
                              <span className={`px-3 py-1 rounded-full text-[12px] font-medium ${candidate.progressionState === 'selected'
                                ? 'bg-blue-100 text-blue-700'
                                : candidate.progressionState === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : candidate.progressionState === 'on-hold'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                {candidate.progressionState.replace('-', ' ')}
                              </span>
                            ) : (
                              <span className="px-3 py-1 rounded-full text-[12px] font-medium bg-emerald-100 text-emerald-700">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2">
                              {userRole === 'recruiter' && stageState === 'review-mode' && !candidate.meetsCriteria && !candidate.overrideApplied && (
                                <button
                                  onClick={() => handleOverride(candidate.id)}
                                  className="p-2 rounded-[6px] border border-orange-300 bg-orange-50 hover:bg-orange-100 transition-colors"
                                  title="Override criteria"
                                >
                                  <AlertTriangle size={14} className="text-orange-600" />
                                </button>
                              )}
                              {userRole === 'technical' && (
                                <button
                                  onClick={() => {
                                    if (candidate.flags.length > 0) {
                                      setShowSuspectReview(candidate.id);
                                    } else {
                                      showToast('No integrity flags for this candidate');
                                    }
                                  }}
                                  disabled={candidate.flags.length === 0}
                                  className="p-2 rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Flag size={14} className="text-[#6b7280]" />
                                </button>
                              )}
                              {userRole === 'recruiter' && candidate.progressionState === 'active' && (
                                <div className="relative group">
                                  <button className="p-2 rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors">
                                    <MoreVertical size={14} className="text-[#6b7280]" />
                                  </button>
                                  <div className="absolute right-0 mt-1 w-[160px] bg-white border border-[#e5e7eb] rounded-[8px] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                    <button
                                      onClick={() => handleMarkCandidateState(candidate.id, 'rejected')}
                                      className="w-full px-4 py-2 text-left text-[13px] hover:bg-[#f9fafb] flex items-center gap-2 text-red-600"
                                    >
                                      <Ban size={14} />
                                      Mark Rejected
                                    </button>
                                    <button
                                      onClick={() => handleMarkCandidateState(candidate.id, 'on-hold')}
                                      className="w-full px-4 py-2 text-left text-[13px] hover:bg-[#f9fafb] flex items-center gap-2 text-amber-600"
                                    >
                                      <Clock size={14} />
                                      Mark On Hold
                                    </button>
                                    <button
                                      onClick={() => handleMarkCandidateState(candidate.id, 'archived')}
                                      className="w-full px-4 py-2 text-left text-[13px] hover:bg-[#f9fafb] flex items-center gap-2 text-gray-600"
                                    >
                                      <Archive size={14} />
                                      Archive
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Comment Modal */}
      {
        showCommentModal !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-[16px] shadow-2xl max-w-2xl w-full">
              <div className="px-8 py-6 border-b border-[#e5e7eb]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[#111827]">
                    Comments for {candidateStatuses.find(c => c.id === showCommentModal)?.name}
                  </h3>
                  <button
                    onClick={() => {
                      setShowCommentModal(null);
                      setCommentText('');
                    }}
                    className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
                  >
                    <X size={20} className="text-[#6b7280]" />
                  </button>
                </div>
              </div>

              <div className="p-8">
                {/* Existing comments */}
                <div className="mb-6 space-y-3 max-h-[300px] overflow-y-auto">
                  {getCandidateComments(showCommentModal).length > 0 ? (
                    getCandidateComments(showCommentModal).map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-4 rounded-[12px] border ${comment.author === 'technical'
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-blue-50 border-blue-200'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${comment.author === 'technical'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                            }`}>
                            {comment.author === 'technical' ? (
                              <><Shield size={10} className="inline mr-1" />Technical</>
                            ) : (
                              <><Users size={10} className="inline mr-1" />HR</>
                            )}
                          </span>
                          <span className="text-[12px] text-[#6b7280]">
                            {comment.timestamp.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[14px] text-[#374151]">{comment.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-[14px] text-[#6b7280] py-8">
                      No comments yet. Add the first comment below.
                    </p>
                  )}
                </div>

                {/* Add new comment */}
                <div>
                  <label className="block text-[13px] text-[#374151] mb-2">
                    Add Comment ({userRole === 'technical' ? 'Technical Recruiter' : 'HR Recruiter'})
                  </label>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter your comment..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                  />
                </div>
              </div>

              <div className="px-8 py-4 border-t border-[#e5e7eb] flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCommentModal(null);
                    setCommentText('');
                  }}
                  className="px-6 py-2 rounded-[8px] border border-[#e5e7eb] text-[14px] hover:bg-[#f9fafb] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAddComment(showCommentModal)}
                  disabled={!commentText.trim()}
                  className="px-6 py-2 rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Comment
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Verdict Modal - Technical Recruiter Only */}
      {
        showVerdictModal !== null && userRole === 'technical' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-[16px] shadow-2xl max-w-md w-full p-8">
              <h3 className="text-[#111827] mb-4">
                Set Technical Verdict for {candidateStatuses.find(c => c.id === showVerdictModal)?.name}
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleSetVerdict(showVerdictModal, 'pass')}
                  className="w-full p-4 rounded-[8px] border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-medium transition-colors"
                >
                  Pass
                </button>
                <button
                  onClick={() => handleSetVerdict(showVerdictModal, 'conditional')}
                  className="w-full p-4 rounded-[8px] border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-medium transition-colors"
                >
                  Conditional
                </button>
                <button
                  onClick={() => handleSetVerdict(showVerdictModal, 'fail')}
                  className="w-full p-4 rounded-[8px] border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-900 font-medium transition-colors"
                >
                  Fail
                </button>
              </div>
              <button
                onClick={() => setShowVerdictModal(null)}
                className="mt-6 w-full px-6 py-2 rounded-[8px] border border-[#e5e7eb] text-[14px] hover:bg-[#f9fafb] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      }

      {/* Activity Log Panel */}
      {showActivityLog && (
        <ActivityLogPanel
          groupId={groupId}
          groupName={groupName}
          onClose={() => setShowActivityLog(false)}
        />
      )}



      {/* Start Stage Modal */}
      {
        showStartStageModal && (
          <StartStageModal
            stageName={pipelineSteps.find(s => s.id === currentStage)?.name || ''}
            onConfirm={handleConfirmStartStage}
            onCancel={() => setShowStartStageModal(false)}
          />
        )
      }

      {/* Stage Results Dashboard - Full Screen */}
      {
        showStageResults && (
          <StageResultsDashboard
            stageName={pipelineSteps.find(s => s.id === currentStage)?.name || ''}
            stageId={currentStage}
            candidates={candidateStatuses}
            onClose={() => setShowStageResults(false)}
            onEnterReviewMode={handleEnterReviewMode}
            startDate={pipelineSteps.find(s => s.id === currentStage)?.startDate || new Date()}
            endDate={pipelineSteps.find(s => s.id === currentStage)?.actualEndDate || new Date()}
          />
        )
      }

      {/* Module Monitoring Dashboard - Full Screen */}
      {
        showModuleMonitoring && (
          <ModuleMonitoringDashboard
            moduleType={showModuleMonitoring}
            candidates={candidateStatuses}
            activeFlow={activeFlow}
            pipelineSteps={pipelineSteps}
            onClose={() => setShowModuleMonitoring(null)}
            onViewCandidate={(candidateId) => {
              setShowModuleMonitoring(null);
              onViewCandidate(candidateId);
            }}
            onAddVerdict={(candidateId) => {
              setShowModuleMonitoring(null);
              setShowVerdictModal(candidateId);
            }}
            onReviewFlags={(candidateId) => {
              setShowModuleMonitoring(null);
              setShowSuspectReview(candidateId);
            }}
          />
        )
      }

      {/* Assessment/Interview Creation Full Screens */}
      {showAssessmentCreation && (
        <CreateAdvancedAssessment
          onBack={() => {
            setShowAssessmentCreation(false);
            setEditingAssessmentData(null);
          }}
          onSave={handleSaveAssessment}
          initialData={editingAssessmentData}
        />
      )}

      {showRecordedInterviewSetup && (
        <div className="fixed inset-0 bg-white ml-[96px] z-[60] overflow-y-auto">
          <RecordedInterviewSetup
            groupName={groupName}
            activeFlow={activeFlow}
            initialData={editingInterviewData}
            onBack={() => {
              setShowRecordedInterviewSetup(false);
              setEditingInterviewData(null);
            }}
            onSetupQuestions={(settings) => {
              setPendingAISettings(settings);
              setShowRecordedInterviewSetup(false);
              setShowRecordedQuestionSetup(true);
            }}
          />
        </div>
      )}

      {showRecordedQuestionSetup && (
        <div className="fixed inset-0 bg-white ml-[96px] z-[60] overflow-y-auto">
          <RecordedInterviewQuestionSetup
            groupName={groupName}
            initialQuestions={(() => {
              // Extract saved questions from the interview being edited
              const items = editingInterviewData?.questions?.items;
              if (Array.isArray(items) && items.length > 0) {
                return items.map((q: any, i: number) => ({
                  id: q.id || String(i + 1),
                  text: q.text || q.question || '',
                  duration: q.duration || q.recordingTime || 120
                }));
              }
              return undefined;
            })()}
            onBack={() => {
              setShowRecordedQuestionSetup(false);
              setShowRecordedInterviewSetup(true);
            }}
            onSave={async (questions) => {
              try {
                await api.recruiter.assignInterview(groupId, {
                  interview_type: 'recorded',
                  config: pendingAISettings,
                  id: editingInterviewData?.id,
                  sections: questions
                });
                showToast('Recorded AI Interview configured successfully');
                setShowRecordedQuestionSetup(false);
                setPendingAISettings(null);
                setEditingInterviewData(null);
                setRefreshKey(prev => prev + 1);
              } catch (error) {
                console.error('Failed to assign recorded interview:', error);
                showToast('Failed to save AI Interview');
              }
            }}
          />
        </div>
      )}

      {/* Bulk Progression Modal */}
      {showBulkProgressionModal && (
        <BulkProgressionModal
          groupId={groupId}
          currentStageType={bulkProgressFromStage || currentStage}
          currentStage={pipelineSteps.find(s => s.id === (bulkProgressFromStage || currentStage))?.name || ''}
          nextStage={
            (() => {
              const sourceStage = bulkProgressFromStage || currentStage;
              const sourceIdx = pipelineSteps.findIndex(s => s.id === sourceStage);
              return pipelineSteps[sourceIdx + 1]?.name || 'Review';
            })()
          }
          candidates={candidateStatuses
            .filter(c => c.progressionState !== 'rejected')
            .map(c => {
              const src = bulkProgressFromStage || currentStage;
              const score = src === 'ai_interview' ? c.aiInterviewScore
                : src === 'live_interview' ? c.liveInterviewScore
                : c.assessmentScore;
              return {
                id: c.id,
                applicationId: c.applicationId || String(c.id),
                name: c.name,
                avatar: c.avatar,
                score,
                flags: c.flags,
                meetsCriteria: c.meetsCriteria || false
              };
            })}
          onConfirm={handleBulkProgression}
          onCancel={() => setShowBulkProgressionModal(false)}
        />
      )}

      {/* Hold Review Modal */}
      {showHoldReview && (
        <HoldReviewModal
          groupId={groupId}
          heldCandidates={candidateStatuses
            .filter(c => c.progressionState === 'on-hold')
            .map(c => ({
              application_id: c.applicationId || String(c.id),
              name: c.name,
              score: c.assessmentScore || null,
            }))}
          hasActiveStage={pipelineSteps.some(s => s.state === 'active')}
          onClose={() => setShowHoldReview(false)}
          onResolved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
            setShowHoldReview(false);
          }}
        />
      )}

      {showArchiveModal && (
        <ArchiveGroupModal
          groupName={groupName}
          nonRejectedCount={candidateStatuses.filter(c => c.progressionState !== 'rejected' && c.progressionState !== 'offered').length}
          onConfirm={handleArchiveGroup}
          onClose={() => setShowArchiveModal(false)}
        />
      )}

      {/* Final Decision Modal */}
      <FinalDecisionModal
        open={showFinalDecisionModal}
        onClose={() => setShowFinalDecisionModal(false)}
        groupName={groupName}
        positionTitle={description}
        candidates={candidateStatuses
          .filter(c => c.progressionState !== 'rejected' && c.progressionState !== 'offered')
          .map(c => ({
            id: c.id,
            name: c.name,
            email: `candidate${c.id}@example.com`,
            phone: `+1-555-${String(c.id).padStart(4, '0')}`,
            finalScore: c.assessmentScore,
            position: groupName
          }))}
        onSendOffers={handleSendOffers}
        onExportContacts={handleExportContacts}
      />

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-[#111827] rounded-[16px] shadow-2xl px-8 py-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-[#10b981]" />
              <span className="font-['Arimo',sans-serif] text-[14px] text-white">
                {toastMessage}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filtration Flow Configuration Modal */}
      {
        showFlowConfigModal && (
          <FiltrationFlowConfigModal
            groupData={{
              id: groupId,
              name: groupName,
              candidateCount: candidateStatuses.length,
              filtration_flow: pipelineSteps.map(s => s.id),
              github_questions_count: githubQuestionsCount,
            }}
            onClose={() => setShowFlowConfigModal(false)}
            onSave={handleSaveFlow}
          />
        )
      }

      {/* Schedule Interview Modal */}
      {showScheduleModal && selectedCandidateForSchedule && (
        <ScheduleInterviewModal
          isOpen={showScheduleModal}
          onClose={() => {
            setShowScheduleModal(false);
            setSelectedCandidateForSchedule(null);
          }}
          onSchedule={handleScheduleInterview}
          candidateName={selectedCandidateForSchedule.name}
          applicationId={selectedCandidateForSchedule.id}
        />
      )}

      {/* Live Interview V2 Monitor Overlay */}
      {showLiveMonitor && !liv2ResultSessionId && (
        <LiveInterviewMonitor
          groupId={groupId}
          groupName={groupName}
          onClose={() => setShowLiveMonitor(false)}
          onViewResults={(sessionId) => setLiv2ResultSessionId(sessionId)}
        />
      )}

      {/* Live Interview V2 Config Wizard Overlay */}
      {showLiveInterviewV2Setup && (
        <div className="fixed inset-0 bg-white ml-[96px] z-[60] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setShowLiveInterviewV2Setup(false)}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <ChevronLeft size={16} />
              Back to Group
            </button>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">AI Interview V2 Setup</span>
          </div>
          <div className="p-6 max-w-5xl mx-auto">
            <ConfigWizardV2
              groupId={groupId}
              stageId={currentStage}
              onComplete={() => {
                setShowLiveInterviewV2Setup(false);
                setRefreshKey(prev => prev + 1);
              }}
            />
          </div>
        </div>
      )}

      {/* Live Interview V2 Results Overlay */}
      {showLiveMonitor && liv2ResultSessionId && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setLiv2ResultSessionId(null)}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <ChevronLeft size={16} />
              Back to Monitor
            </button>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Live Interview Results</span>
          </div>
          <LiveInterviewResults
            sessionId={liv2ResultSessionId}
            onClose={() => {
              setLiv2ResultSessionId(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
