import { useState } from 'react';
import { ChevronLeft, Play, Edit, Download, Users, TrendingUp, Sparkles, Calendar, Send, CheckCircle, XCircle, AlertCircle, Clock, Eye, Trash2, UserPlus, UserMinus, Activity, MoreVertical, Flag, Filter, X, ChevronDown, Plus, UserCog, Shield, Lock, MessageSquare, FileText, CheckSquare, Ban, Archive, AlertTriangle, BarChart3, Target, Video, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SuspectReviewPage } from './SuspectReviewPage';
import { CreateAdvancedAssessment } from './CreateAdvancedAssessment';
import { StageResultsDashboard } from './StageResultsDashboard';
import { ModuleMonitoringDashboard } from './ModuleMonitoringDashboard';
import { StartStageModal } from './StartStageModal';
import { BulkProgressionModal } from './BulkProgressionModal';
import { FinalDecisionModal } from './FinalDecisionModal';
import { api } from '../../services/api';
import { useEffect } from 'react';

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
  flags: string[];
  currentStage: string;
  technicalVerdict?: 'pass' | 'fail' | 'conditional';
  meetsCriteria?: boolean;
  progressionState?: 'selected' | 'rejected' | 'on-hold' | 'archived' | 'active';
  overrideApplied?: boolean;
  email?: string;
  phone?: string;
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

  // Assessment creation state
  const [showAssessmentCreation, setShowAssessmentCreation] = useState(false);
  const [groupAssessments, setGroupAssessments] = useState<any[]>([]);

  // NEW: Stage-gated state
  const [currentStage, setCurrentStage] = useState<string>(filtrationFlow[0] || 'assessment');
  const [stageState, setStageState] = useState<StageState>('not-started');
  const [stageConfigLocked, setStageConfigLocked] = useState(false);

  // NEW: Bulk progression modal
  const [showBulkProgressionModal, setShowBulkProgressionModal] = useState(false);

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

  // NEW: Pipeline steps state
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [candidateStatuses, setCandidateStatuses] = useState<CandidateStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const data = await api.recruiter.getGroupDetails(groupId);

        // Map pipeline stages
        const moduleMap: Record<string, { name: string; icon: any }> = {
          'assessment': { name: 'Technical Assessment', icon: FileText },
          'ai-interview': { name: 'AI Interview', icon: Video },
          'live-interview': { name: 'Live Interview', icon: MessageSquare },
          'review': { name: 'Review', icon: CheckSquare },
          'offer': { name: 'Offer', icon: Send }
        };

        const steps: PipelineStep[] = data.pipelineStages.map((stage: any) => ({
          id: stage.id || stage.name.toLowerCase().replace(' ', '-'),
          name: stage.name,
          completed: stage.completed,
          total: stage.total,
          pending: stage.pending,
          state: (stage.state as StageState) || 'not-started'
        }));

        setPipelineSteps(steps);

        // Map candidates
        const candidates: CandidateStatus[] = data.candidates.map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone || `+1-555-${String(c.id).padStart(4, '0')}`,
          avatar: c.name.split(' ').map((n: string) => n[0]).join(''),
          assessment: (c.pipelineStatus.assessment as any) || 'not-started',
          aiInterview: (c.pipelineStatus.aiInterview as any) || 'not-started',
          liveInterview: (c.pipelineStatus.liveInterview as any) || 'not-started',
          review: (c.pipelineStatus.review as any) || 'not-started',
          offer: (c.pipelineStatus.offer as any) || 'not-started',
          assessmentScore: c.assessmentScore || 0,
          aiInterviewScore: c.aiInterviewScore || 0,
          flags: c.flags || [],
          currentStage: c.currentStage || 'Assessment',
          technicalVerdict: c.technicalVerdict,
          meetsCriteria: c.meetsCriteria,
          progressionState: c.progressionState || 'active',
          overrideApplied: c.overrideApplied
        }));

        setCandidateStatuses(candidates);

        if (data.acceptanceCriteria) {
          setAcceptanceCriteria(data.acceptanceCriteria as TechnicalAcceptanceCriteria);
        }

        if (data.activityLog) {
          setActivityLog(data.activityLog.map((log: any) => ({
            ...log,
            timestamp: new Date(log.timestamp)
          })));
        }

      } catch (error) {
        console.error('Failed to fetch enhanced group details:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [groupId]);

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

  const handleConfirmStartStage = (startDate: Date, expectedEndDate: Date) => {
    const steps = [...pipelineSteps];
    const currentStepIndex = steps.findIndex(s => s.id === currentStage);
    if (currentStepIndex !== -1) {
      steps[currentStepIndex].state = 'active';
      steps[currentStepIndex].startDate = startDate;
      steps[currentStepIndex].expectedEndDate = expectedEndDate;
      setPipelineSteps(steps);
      setStageState('active');
      setStageConfigLocked(true);
      setShowStartStageModal(false);
      showToast(`${steps[currentStepIndex].name} stage started`);
      addActivityLog({
        type: 'stage-start',
        actor: assignedRecruiter,
        actorRole: userRole === 'technical' ? 'technical' : 'hr',
        description: `Started ${steps[currentStepIndex].name} stage (${startDate.toLocaleDateString()} - ${expectedEndDate.toLocaleDateString()})`
      });
    }
  };

  const handleCloseStage = () => {
    const steps = [...pipelineSteps];
    const currentStepIndex = steps.findIndex(s => s.id === currentStage);
    if (currentStepIndex !== -1) {
      steps[currentStepIndex].state = 'closed';
      steps[currentStepIndex].actualEndDate = new Date();
      setPipelineSteps(steps);
      setStageState('closed');
      showToast(`${steps[currentStepIndex].name} stage closed - Review results`);
      addActivityLog({
        type: 'stage-close',
        actor: assignedRecruiter,
        actorRole: userRole === 'technical' ? 'technical' : 'hr',
        description: `Closed ${steps[currentStepIndex].name} stage`
      });
      // Open bulk progression modal after closing
      setShowBulkProgressionModal(true);
    }
  };

  const handleSendOffers = (selectedCandidateIds: number[], emailContent: string) => {
    // Update candidate statuses to reflect offer sent
    const updatedCandidates = candidateStatuses.map(candidate => {
      if (selectedCandidateIds.includes(candidate.id)) {
        return { ...candidate, offer: 'completed' as const };
      }
      return candidate;
    });
    setCandidateStatuses(updatedCandidates);

    // Log activity
    addActivityLog({
      type: 'candidate-progressed',
      actor: assignedRecruiter,
      actorRole: userRole === 'technical' ? 'technical' : 'hr',
      description: `Sent offers to ${selectedCandidateIds.length} candidate(s)`
    });

    showToast(`✓ Offers sent successfully to ${selectedCandidateIds.length} candidate(s)`);
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

  const handleBulkProgression = (selectedIds: number[], action: 'progress' | 'reject' | 'hold') => {
    const updatedCandidates = candidateStatuses.map(candidate => {
      if (selectedIds.includes(candidate.id)) {
        if (action === 'progress') {
          return { ...candidate, progressionState: 'selected' as const };
        } else if (action === 'reject') {
          return { ...candidate, progressionState: 'rejected' as const };
        } else if (action === 'hold') {
          return { ...candidate, progressionState: 'on-hold' as const };
        }
      }
      return candidate;
    });

    setCandidateStatuses(updatedCandidates);

    if (action === 'progress') {
      // Move to next stage
      const currentStepIndex = pipelineSteps.findIndex(s => s.id === currentStage);
      if (currentStepIndex < pipelineSteps.length - 1) {
        const nextStage = pipelineSteps[currentStepIndex + 1];
        setCurrentStage(nextStage.id);
        setStageState('not-started');
        setStageConfigLocked(false);
      }
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

  const handleSaveAssessment = (assessment: any) => {
    const newAssessment = {
      ...assessment,
      id: `assessment-${Date.now()}`,
      groupId,
      createdAt: new Date().toISOString(),
      createdBy: assignedRecruiter,
      status: 'draft'
    };

    setGroupAssessments([...groupAssessments, newAssessment]);
    setShowAssessmentCreation(false);
    showToast(`Assessment "${assessment.config.title}" created successfully!`);
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
        return <CheckCircle size={16} className="text-[#10b981]" />;
      case 'pending':
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

    // Check if this is the last stage and it's closed - show Final Decision button
    const currentStepIndex = pipelineSteps.findIndex(s => s.id === currentStage);
    const isLastStage = currentStepIndex === pipelineSteps.length - 1;

    if (isLastStage && stageState === 'closed') {
      return (
        <button
          onClick={() => setShowFinalDecisionModal(true)}
          className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-colors shadow-lg"
        >
          <CheckCircle size={18} />
          <span className="font-['Arimo',sans-serif] text-[14px] font-semibold">
            Final Decision - Send Offers
          </span>
        </button>
      );
    }

    if (stageState === 'not-started') {
      return (
        <button
          onClick={handleStartStage}
          className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#10b981] hover:bg-[#059669] text-white transition-colors"
        >
          <Play size={16} />
          <span className="font-['Arimo',sans-serif] text-[14px]">
            Start Current Stage
          </span>
        </button>
      );
    }

    if (stageState === 'active') {
      return (
        <button
          onClick={handleCloseStage}
          className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] text-white transition-colors"
        >
          <XCircle size={16} />
          <span className="font-['Arimo',sans-serif] text-[14px]">
            Close Stage
          </span>
        </button>
      );
    }

    if (stageState === 'closed') {
      return (
        <button
          onClick={() => setShowStageResults(true)}
          className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white transition-colors"
        >
          <BarChart3 size={16} />
          <span className="font-['Arimo',sans-serif] text-[14px]">
            View Stage Results
          </span>
        </button>
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
        onBack={() => setShowAssessmentCreation(false)}
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
          candidateId={candidate.id}
          candidateName={candidate.name}
          groupId={groupId}
          groupName={groupName}
          currentModule="Assessment"
          onBack={() => setShowSuspectReview(null)}
          onViewCandidate={onViewCandidate}
        />
      );
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[#6366f1] animate-spin" />
          <p className="text-[#64748b] font-medium">Loading group details...</p>
        </div>
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

            {/* Filtration Flow Indicator */}
            <div className="mb-3 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-[8px] border border-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-emerald-600" />
                <span className="font-['Arimo',sans-serif] text-[12px] font-medium text-emerald-900">
                  Configured Filtration Flow
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {filtrationFlow.map((moduleType, index) => {
                  const moduleInfo = {
                    'assessment': { name: 'Assessment', icon: FileText, color: 'emerald' },
                    'ai-interview': { name: 'AI Interview', icon: Video, color: 'blue' },
                    'live-interview': { name: 'Live Interview', icon: MessageSquare, color: 'purple' }
                  };
                  const info = moduleInfo[moduleType];
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
                      {index < filtrationFlow.length - 1 && (
                        <span className="text-emerald-400">→</span>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-[6px]">
                  <CheckCircle size={12} className="text-gray-500" />
                  <span className="font-['Arimo',sans-serif] text-[12px] text-gray-500">
                    Review & Offer
                  </span>
                </div>
              </div>
            </div>

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

        {/* Pipeline Progress with Stage States */}
        <div className="mt-6 grid grid-cols-5 gap-4">
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

            {/* Current Recruiter Type Badge */}
            <div className="flex items-center gap-3">
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                Logged in as:
              </span>
              <span className={`flex items-center gap-1.5 h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] ${userRole === 'technical'
                ? 'bg-emerald-50 text-[#10b981] border border-emerald-200'
                : 'bg-indigo-50 text-[#6366f1] border border-indigo-200'
                }`}>
                {userRole === 'technical' ? <Shield size={14} /> : <Users size={14} />}
                {userRole === 'technical' ? 'Technical Recruiter' : 'HR Recruiter'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {/* Module Monitoring Dashboard - Technical Recruiter Only */}
            {/* Module Monitoring Dashboard - Available to both HR and Technical */}
            {(userRole === 'technical' || userRole === 'recruiter') && (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModuleMonitoring('assessment')}
                  className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] text-white transition-colors shadow-sm"
                >
                  <BarChart3 size={16} />
                  <span className="font-['Arimo',sans-serif] text-[14px]">
                    Monitor Assessment Results
                  </span>
                </button>
                <button
                  onClick={() => setShowModuleMonitoring('ai-interview')}
                  className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] text-white transition-colors shadow-sm"
                >
                  <BarChart3 size={16} />
                  <span className="font-['Arimo',sans-serif] text-[14px]">
                    Monitor AI Interview Results
                  </span>
                </button>
              </div>
            )}

            {/* Configuration Buttons */}
            <div className="flex gap-3">
              {userRole === 'technical' && (
                <>
                  <button
                    onClick={() => {
                      if (stageConfigLocked) {
                        showToast('Cannot modify configuration - stage is active');
                        return;
                      }
                      setShowAssessmentCreation(true);
                    }}
                    disabled={stageConfigLocked}
                    className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={16} />
                    <span className="font-['Arimo',sans-serif] text-[14px]">
                      Add Tech Assessment
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      if (stageConfigLocked) {
                        showToast('Cannot modify configuration - stage is active');
                        return;
                      }
                      if (onCreateAIInterview) {
                        onCreateAIInterview();
                      }
                    }}
                    disabled={stageConfigLocked}
                    className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Activity size={16} />
                    <span className="font-['Arimo',sans-serif] text-[14px]">
                      AI Interview Settings
                    </span>
                  </button>
                </>
              )}
              {userRole === 'recruiter' && (
                <div className="flex-1 flex items-center justify-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#f9fafb] border border-[#e5e7eb]">
                  <Shield size={16} className="text-[#6b7280]" />
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    Switch to Technical Recruiter to configure assessments and interviews
                  </span>
                </div>
              )}
            </div>
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
                            onClick={() => {
                              showToast('Edit assessment feature coming soon');
                            }}
                            disabled={stageConfigLocked}
                            className="h-[28px] px-[12px] rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors text-[12px] text-[#374151] disabled:opacity-50"
                          >
                            Edit
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

          {/* Technical Acceptance Criteria - Technical Recruiter Only */}
          {userRole === 'technical' && (
            <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-semibold flex items-center gap-2">
                  <CheckSquare size={16} className="text-[#10b981]" />
                  Technical Acceptance Criteria
                </h4>
                <button
                  onClick={() => setShowCriteriaEditor(!showCriteriaEditor)}
                  disabled={stageConfigLocked}
                  className="flex items-center gap-1 px-3 py-1 rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Edit size={14} />
                  Edit Criteria
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-[8px]">
                  <div className="text-[11px] text-blue-700 mb-1">Minimum Technical Score</div>
                  <div className="text-[18px] font-semibold text-blue-900">{acceptanceCriteria.minimumTechnicalScore}%</div>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-[8px]">
                  <div className="text-[11px] text-purple-700 mb-1">Allowed Integrity Risk</div>
                  <div className="text-[18px] font-semibold text-purple-900 capitalize">{acceptanceCriteria.allowedIntegrityRisk}</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[8px]">
                  <div className="text-[11px] text-emerald-700 mb-1">Required Verdict</div>
                  <div className="text-[18px] font-semibold text-emerald-900 capitalize">{acceptanceCriteria.requiredVerdict}</div>
                </div>
              </div>

              {showCriteriaEditor && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-[8px] space-y-3">
                  <div>
                    <label className="block text-[13px] text-[#374151] mb-2">
                      Minimum Technical Score (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={acceptanceCriteria.minimumTechnicalScore}
                      onChange={(e) => setAcceptanceCriteria({
                        ...acceptanceCriteria,
                        minimumTechnicalScore: parseInt(e.target.value) || 0
                      })}
                      className="w-full h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[14px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#374151] mb-2">
                      Allowed Integrity Risk
                    </label>
                    <select
                      value={acceptanceCriteria.allowedIntegrityRisk}
                      onChange={(e) => setAcceptanceCriteria({
                        ...acceptanceCriteria,
                        allowedIntegrityRisk: e.target.value as 'none' | 'low' | 'medium'
                      })}
                      className="w-full h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[14px]"
                    >
                      <option value="none">None</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#374151] mb-2">
                      Required Technical Verdict
                    </label>
                    <select
                      value={acceptanceCriteria.requiredVerdict}
                      onChange={(e) => setAcceptanceCriteria({
                        ...acceptanceCriteria,
                        requiredVerdict: e.target.value as 'pass' | 'conditional' | 'any'
                      })}
                      className="w-full h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] text-[14px]"
                    >
                      <option value="pass">Pass Only</option>
                      <option value="conditional">Pass or Conditional</option>
                      <option value="any">Any</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setShowCriteriaEditor(false)}
                      className="px-4 py-2 rounded-[6px] border border-[#e5e7eb] text-[13px] hover:bg-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveCriteria}
                      className="px-4 py-2 rounded-[6px] bg-[#10b981] hover:bg-[#059669] text-white text-[13px] transition-colors"
                    >
                      Save Criteria
                    </button>
                  </div>
                </div>
              )}
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
                  <th className="p-4 text-center">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Assessment</span>
                  </th>
                  <th className="p-4 text-center">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">AI Interview</span>
                  </th>
                  <th className="p-4 text-center">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Meets Criteria</span>
                  </th>
                  {userRole === 'technical' && (
                    <th className="p-4 text-center">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Verdict</span>
                    </th>
                  )}
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
                {candidateStatuses
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
                        <td className="p-4 text-center">
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
                        <td className="p-4 text-center">
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
                        <td className="p-4 text-center">
                          {candidate.meetsCriteria !== undefined ? (
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium ${candidate.meetsCriteria
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                              }`}>
                              {candidate.meetsCriteria ? (
                                <><CheckCircle size={12} /> Yes</>
                              ) : (
                                <><XCircle size={12} /> No</>
                              )}
                            </span>
                          ) : (
                            <span className="text-[#9ca3af] text-[12px]">Pending</span>
                          )}
                        </td>
                        {userRole === 'technical' && (
                          <td className="p-4 text-center">
                            <button
                              onClick={() => setShowVerdictModal(candidate.id)}
                              className={`px-3 py-1 rounded-full text-[12px] font-medium ${candidate.technicalVerdict === 'pass'
                                ? 'bg-emerald-100 text-emerald-700'
                                : candidate.technicalVerdict === 'fail'
                                  ? 'bg-red-100 text-red-700'
                                  : candidate.technicalVerdict === 'conditional'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-gray-100 text-gray-600 border border-dashed'
                                }`}
                            >
                              {candidate.technicalVerdict ? candidate.technicalVerdict : 'Set Verdict'}
                            </button>
                          </td>
                        )}
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
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Comment Modal */}
      {showCommentModal !== null && (
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
      )}

      {/* Verdict Modal - Technical Recruiter Only */}
      {showVerdictModal !== null && userRole === 'technical' && (
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
      )}

      {/* Activity Log Modal */}
      {showActivityLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[16px] shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-[#e5e7eb]">
              <div className="flex items-center justify-between">
                <h3 className="text-[#111827]">Activity & Decision Log</h3>
                <button
                  onClick={() => setShowActivityLog(false)}
                  className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
                >
                  <X size={20} className="text-[#6b7280]" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="space-y-4">
                {activityLog.map((entry) => (
                  <div key={entry.id} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#f3f4f6] flex items-center justify-center">
                      {entry.actorRole === 'technical' ? (
                        <Shield size={16} className="text-[#10b981]" />
                      ) : (
                        <Users size={16} className="text-[#6366f1]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[14px] text-[#111827] font-medium">
                          {entry.actor}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${entry.actorRole === 'technical'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                          }`}>
                          {entry.actorRole === 'technical' ? 'Technical' : 'HR'}
                        </span>
                        <span className="text-[12px] text-[#9ca3af]">
                          {entry.timestamp.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[14px] text-[#6b7280]">{entry.description}</p>
                      {entry.metadata && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-[6px] text-[12px] text-gray-600">
                          <code>{JSON.stringify(entry.metadata, null, 2)}</code>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-8 py-4 border-t border-[#e5e7eb] flex justify-end">
              <button
                onClick={() => setShowActivityLog(false)}
                className="px-6 py-2 rounded-[8px] border border-[#e5e7eb] text-[14px] hover:bg-[#f9fafb] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Start Stage Modal */}
      {showStartStageModal && (
        <StartStageModal
          stageName={pipelineSteps.find(s => s.id === currentStage)?.name || ''}
          onConfirm={handleConfirmStartStage}
          onCancel={() => setShowStartStageModal(false)}
        />
      )}

      {/* Stage Results Dashboard */}
      {showStageResults && (
        <StageResultsDashboard
          stageName={pipelineSteps.find(s => s.id === currentStage)?.name || ''}
          stageId={currentStage}
          candidates={candidateStatuses}
          onClose={() => setShowStageResults(false)}
          onEnterReviewMode={handleEnterReviewMode}
          startDate={pipelineSteps.find(s => s.id === currentStage)?.startDate || new Date()}
          endDate={pipelineSteps.find(s => s.id === currentStage)?.actualEndDate || new Date()}
        />
      )}

      {/* Module Monitoring Dashboard */}
      {showModuleMonitoring && (
        <ModuleMonitoringDashboard
          moduleType={showModuleMonitoring}
          candidates={candidateStatuses}
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
      )}

      {/* Bulk Progression Modal */}
      {showBulkProgressionModal && (
        <BulkProgressionModal
          currentStage={pipelineSteps.find(s => s.id === currentStage)?.name || ''}
          nextStage={
            (() => {
              const currentStepIndex = pipelineSteps.findIndex(s => s.id === currentStage);
              return pipelineSteps[currentStepIndex + 1]?.name || 'Review';
            })()
          }
          candidates={candidateStatuses
            .filter(c => c.progressionState === 'active' || !c.progressionState)
            .map(c => ({
              id: c.id,
              name: c.name,
              avatar: c.avatar,
              score: c.assessmentScore,
              flags: c.flags,
              meetsCriteria: c.meetsCriteria || false
            }))}
          onConfirm={handleBulkProgression}
          onCancel={() => setShowBulkProgressionModal(false)}
        />
      )}

      {/* Final Decision Modal */}
      <FinalDecisionModal
        open={showFinalDecisionModal}
        onClose={() => setShowFinalDecisionModal(false)}
        groupName={groupName}
        positionTitle={description}
        candidates={candidateStatuses
          .filter(c => c.progressionState === 'selected' || c.progressionState === 'active' || !c.progressionState)
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
    </div>
  );
}
