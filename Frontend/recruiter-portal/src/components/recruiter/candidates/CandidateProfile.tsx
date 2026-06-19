import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Github, Mail, Phone, MapPin, Calendar, AlertTriangle, FileText, Video, BarChart3, MessageSquare, Download, CheckCircle, XCircle, TrendingUp, Play, Clock, ThumbsUp, ThumbsDown, Activity, Eye, MessageCircle, ExternalLink, FileCheck, Smile, Frown, Meh, Loader2, Lock, ShieldCheck, Award, Zap, Code2, Cpu, Layers, Globe, Terminal, Briefcase, Users } from 'lucide-react';

interface CriterionScore {
  check: string;
  weight: number;
  score_1_5: number;
  cited_quote: string | null;
  reasoning: string;
}

function CriteriaBreakdown({ criteriaScores }: { criteriaScores: CriterionScore[] }) {
  const cardClass = (s: number) =>
    s >= 4 ? 'bg-green-50 border-green-200' : s === 3 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
  const badgeClass = (s: number) =>
    s >= 4 ? 'bg-green-100 text-green-700' : s === 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700';
  const quoteClass = (s: number) =>
    s >= 4 ? 'border-green-300 text-green-800' : s === 3 ? 'border-yellow-300 text-yellow-800' : 'border-red-300 text-red-800';

  return (
    <div className="space-y-2 mt-3">
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Rubric Breakdown</div>
      {criteriaScores.map((c, i) => (
        <div key={i} className={`rounded-lg border p-3 ${cardClass(c.score_1_5)}`}>
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-[12px] font-medium text-gray-800 flex-1">{c.check}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-gray-400">w={c.weight?.toFixed(2)}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeClass(c.score_1_5)}`}>
                {c.score_1_5} / 5
              </span>
            </div>
          </div>
          {c.cited_quote && (
            <div className={`text-[11px] italic border-l-2 pl-2 mb-1 ${quoteClass(c.score_1_5)}`}>
              "{c.cited_quote}"
            </div>
          )}
          {c.reasoning && (
            <div className="text-[11px] text-gray-500">{c.reasoning}</div>
          )}
        </div>
      ))}
    </div>
  );
}
import LoadingSpinner from '../../common/LoadingSpinner';
import { EnhancedAssessmentReport } from '../assessments/EnhancedAssessmentReport';
import { EnhancedAIInterviewReport } from '../interviews/EnhancedAIInterviewReport';
import { LiveInterviewTranscript } from '../interviews/LiveInterviewTranscript';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { api } from '../../../services/api';
import { API_URL } from '../../../services/client';
import { LiveInterviewResults } from '../live-interview-v2/LiveInterviewResults';
import type { ApplicationScoreBreakdown } from '../../../services/types';
import { useNavigate } from 'react-router-dom';
import { useCandidateDetail, useCandidateScoreBreakdown } from '../../../hooks/candidates/useCandidates';
import { CandidateRail } from '../groups/results/CandidateRail';
import type { RailCandidate } from '../groups/results/CandidateRail';
import { AnswerReviewWithHITL } from '../assessments/AnswerReviewWithHITL';
import { ModuleDetailAssessment } from '../assessments/ModuleDetailAssessment';
import { ModuleDetailAIInterview } from '../interviews/ModuleDetailAIInterview';

export type TabType = 'overview' | 'resume' | 'github' | 'assessment' | 'integrity' | 'interview' | 'live-interview' | 'notes' | 'final-report';

export function getRailTabForStage(stageKey: string): TabType {
  const map: Record<string, TabType> = {
    'assessment': 'assessment',
    'ai-interview': 'interview',
    'live-interview': 'live-interview',
  };
  return map[stageKey] ?? 'overview';
}

interface CandidateProfileProps {
  candidateId: string;
  applicationId?: string;
  onBack: () => void;
  showFinalReport?: boolean;
  // Phase 3: deep-link + candidate rail (optional, backward-compatible)
  initialTab?: TabType;
  rail?: {
    candidates: RailCandidate[];
    activeApplicationId: string;
    onSelect: (candidateId: string, applicationId: string) => void;
  };
  // Embedded mode: render inside another panel (e.g. group Review detail) —
  // hides the Back button and tightens padding. No own rail/chrome.
  embedded?: boolean;
}

// =========================================================
// Integrity tab content — Phase 3
// =========================================================
interface IntegrityTabContentProps {
  candidate: any;
}

function IntegrityTabContent({ candidate }: IntegrityTabContentProps) {
  const hitlAnswers: any[] = (candidate as any)?.hitl_answers ?? [];

  if (hitlAnswers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShieldCheck size={40} className="mb-3 text-emerald-400" />
        <p className="text-[15px] font-medium text-gray-700">No integrity flags</p>
        <p className="text-[13px] text-gray-400 mt-1">
          No answers were flagged for human review on this candidate.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-gray-500">
        {hitlAnswers.length} answer{hitlAnswers.length !== 1 ? 's' : ''} flagged for review
      </p>
      {hitlAnswers.map((answer: any) => (
        <AnswerReviewWithHITL
          key={answer.answer_id}
          answer={answer}
          onApprove={(_id, _fb) => { /* Phase 4: wire to API */ }}
          onReject={(_id, _fb) => { /* Phase 4: wire to API */ }}
          onEscalate={(_ansId) => { /* Phase 4: wire to API */ }}
        />
      ))}
    </div>
  );
}

export function CandidateProfile({ candidateId, applicationId, onBack, showFinalReport = false, initialTab, rail, embedded = false }: CandidateProfileProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showTranscript, setShowTranscript] = useState<number | null>(null);
  const [showLiveTranscript, setShowLiveTranscript] = useState(false);
  const [showAssessmentDetails, setShowAssessmentDetails] = useState(false);
  const [showVideoResponse, setShowVideoResponse] = useState<number | null>(null);
  const [showVideoTranscript, setShowVideoTranscript] = useState<number | null>(null);
  const [showLiveInterviewTranscript, setShowLiveInterviewTranscript] = useState(false);
  const [showGithubAssignedQuestions, setShowGithubAssignedQuestions] = useState(false);
  const [githubQuestionTypeFilter, setGithubQuestionTypeFilter] = useState<'all' | 'mcq' | 'essay' | 'coding'>('all');
  const [showModuleDetail, setShowModuleDetail] = useState(false);
  const [showAIInterviewDetail, setShowAIInterviewDetail] = useState(false);
  const [notesValue, setNotesValue] = useState('');

  const [assessmentResetLoading, setAssessmentResetLoading] = useState(false);
  const [assessmentResetMessage, setAssessmentResetMessage] = useState<string | null>(null);
  const [assessmentResetError, setAssessmentResetError] = useState<string | null>(null);
  const [githubReanalysisLoading, setGithubReanalysisLoading] = useState(false);
  const [githubReanalysisMessage, setGithubReanalysisMessage] = useState<string | null>(null);
  const [githubReanalysisError, setGithubReanalysisError] = useState<string | null>(null);

  const initialTabApplied = useRef(false);
  useEffect(() => {
    if (!initialTabApplied.current && initialTab) {
      setActiveTab(initialTab);
      initialTabApplied.current = true;
    }
  }, [initialTab]);

  const { data: candidate, isLoading } = useCandidateDetail(candidateId);

  const resolvedApplicationId = applicationId || (candidate as any)?.applicationId || (candidate as any)?.application_id;

  const { data: scoreBreakdownData, isLoading: scoreBreakdownLoading } = useCandidateScoreBreakdown(
    resolvedApplicationId ? String(resolvedApplicationId) : undefined
  );
  const scoreBreakdown = (scoreBreakdownData as ApplicationScoreBreakdown | undefined) ?? null;

  const backendOrigin = (() => {
    try {
      return new URL(API_URL).origin;
    } catch {
      return '';
    }
  })();

  const resolveBackendMediaUrl = (url?: string | null): string | undefined => {
    if (!url) return undefined;
    if (/^https?:\/\//i.test(url)) return url;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${backendOrigin}${path}`;
  };


  const handleResetAssessmentTrial = async () => {
    if (!resolvedApplicationId) {
      setAssessmentResetError('No application context found for this candidate.');
      setAssessmentResetMessage(null);
      return;
    }

    const confirmed = window.confirm(
      `Reset assessment trial for ${candidate.name}? This clears answers/sessions and sets assessment stage to not_started.`
    );
    if (!confirmed) return;

    try {
      setAssessmentResetLoading(true);
      setAssessmentResetError(null);
      setAssessmentResetMessage(null);
      const result = await api.recruiter.resetApplicationAssessmentTrial(String(resolvedApplicationId));
      setAssessmentResetMessage(
        `Reset complete (${result.answers_deleted} answers, ${result.sessions_deleted} sessions cleared).`
      );
    } catch (error: any) {
      setAssessmentResetError(error?.message || 'Failed to reset assessment trial.');
    } finally {
      setAssessmentResetLoading(false);
    }
  };

  const handleReanalyzeGitHub = async () => {
    if (!candidate?.github_url) {
      setGithubReanalysisError('Candidate does not have a GitHub profile URL.');
      setGithubReanalysisMessage(null);
      return;
    }

    const confirmed = window.confirm(
      `Reanalyze GitHub profile for ${candidate.name}? This will fetch fresh data and update the analysis.`
    );
    if (!confirmed) return;

    try {
      setGithubReanalysisLoading(true);
      setGithubReanalysisError(null);
      setGithubReanalysisMessage(null);
      await api.recruiter.reanalyzeGitHubProfile(candidateId);
      setGithubReanalysisMessage('GitHub profile reanalysis started. Refresh the page in a few moments to see updated data.');
    } catch (error: any) {
      setGithubReanalysisError(error?.message || 'Failed to reanalyze GitHub profile.');
    } finally {
      setGithubReanalysisLoading(false);
    }
  };

  if (isLoading || !candidate) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f9fafb]">
        <LoadingSpinner message="Loading candidate profile..." fullScreen={false} />
      </div>
    );
  }

  // Use data from API response
  const assessmentQuestions = candidate.assessmentQuestions || [];
  const videoInterviewQuestions = candidate.videoInterviewQuestions || [];
  const liveInterviewData = candidate.liveInterviewData || {
    duration: '0:00',
    completedAt: '',
    overallConfidence: 0,
    overallCorrectness: 0,
    emotionMetrics: [],
    transcript: ''
  };

  // Defensive defaults for missing data
  const assessmentData = candidate.assessmentData || {
    questionsCorrect: 0,
    questionsTotal: 0,
    completedAt: 'N/A',
    duration: 'N/A',
    topicScores: []
  };

  const formatInterviewScore = (value: unknown): string => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return 'N/A';
    }

    const normalizedValue = numericValue > 10 ? numericValue / 10 : numericValue;
    return Number.isInteger(normalizedValue)
      ? String(normalizedValue)
      : normalizedValue.toFixed(1);
  };

  const interviewData = candidate.interviewData || {
    completedAt: 'N/A',
    duration: 'N/A',
    overallFeedback: 'No feedback available'
  };

  const pipelineStatus = candidate.pipelineStatus || {
    groupAssignment: { status: 'not-started' },
    assessment: { status: 'not-started' },
    aiInterview: { status: 'not-started' },
    liveInterview: { status: 'not-started' },
    finalDecision: { status: 'not-started' }
  };

  // Determine which stages are accessible based on pipelineStatus
  const isStageAccessible = (stageKey: string): boolean => {
    const status = pipelineStatus[stageKey as keyof typeof pipelineStatus]?.status;
    return status === 'completed' || status === 'in-progress';
  };

  const activeFlow = candidate.filtrationFlow || ['assessment', 'ai_interview', 'live_interview'];

  const areAllStagesCompleted = (): boolean => {
    if (!candidate.groupAssigned || activeFlow.length === 0) return false;
    let allCompleted = true;
    if (activeFlow.includes('assessment') && pipelineStatus.assessment?.status !== 'completed') allCompleted = false;
    if ((activeFlow.includes('ai_interview') || activeFlow.includes('ai-interview') || activeFlow.includes('aiInterview')) && pipelineStatus.aiInterview?.status !== 'completed') allCompleted = false;
    if ((activeFlow.includes('live_interview') || activeFlow.includes('live-interview') || activeFlow.includes('liveInterview')) && pipelineStatus.liveInterview?.status !== 'completed') allCompleted = false;
    return allCompleted;
  };

  const baseTabs = [
    { id: 'overview', label: 'Overview', icon: FileText, locked: false },
    { id: 'resume', label: 'Resume', icon: FileText, locked: false },
    { id: 'github', label: 'GitHub', icon: Github, locked: false }
  ];

  if (activeFlow.includes('assessment')) {
    baseTabs.push({ id: 'assessment', label: 'Assessment', icon: BarChart3, locked: !isStageAccessible('assessment') });
    baseTabs.push({ id: 'integrity', label: 'Integrity', icon: ShieldCheck, locked: !isStageAccessible('assessment') });
  }

  if (activeFlow.includes('ai_interview') || activeFlow.includes('ai-interview') || activeFlow.includes('aiInterview')) {
    baseTabs.push({ id: 'interview', label: 'AI Interview', icon: Video, locked: !isStageAccessible('aiInterview') });
  }

  if (activeFlow.includes('live_interview') || activeFlow.includes('live-interview') || activeFlow.includes('liveInterview')) {
    baseTabs.push({ id: 'live-interview', label: 'Live Interview', icon: Play, locked: !isStageAccessible('liveInterview') });
  }

  baseTabs.push(
    { id: 'notes', label: 'Notes', icon: MessageSquare, locked: false },
    { id: 'final-report', label: 'Final Report', icon: CheckCircle, locked: !areAllStagesCompleted() && !(candidate as any).offerStatus }
  );

  const tabs = baseTabs;

  const timelineStages = [
    {
      id: 'groupAssignment',
      label: 'Group Assignment',
      icon: Clock,
      completedIcon: CheckCircle,
      inProgressIcon: Activity,
      status: pipelineStatus.groupAssignment.status,
      completedAt: pipelineStatus.groupAssignment.completedAt,
    }
  ];

  activeFlow.forEach((stage: string) => {
    if (stage === 'assessment') {
      timelineStages.push({
        id: 'assessment',
        label: 'Assessment',
        icon: BarChart3,
        completedIcon: CheckCircle,
        inProgressIcon: Activity,
        status: pipelineStatus.assessment.status,
        completedAt: pipelineStatus.assessment.completedAt,
      });
    } else if (stage === 'ai_interview' || stage === 'ai-interview' || stage === 'aiInterview') {
      timelineStages.push({
        id: 'aiInterview',
        label: 'AI Video Interview',
        icon: Video,
        completedIcon: CheckCircle,
        inProgressIcon: Activity,
        status: pipelineStatus.aiInterview?.status || 'not-started',
        completedAt: pipelineStatus.aiInterview?.completedAt,
      });
    } else if (stage === 'live_interview' || stage === 'live-interview' || stage === 'liveInterview') {
      timelineStages.push({
        id: 'liveInterview',
        label: 'Live Interview',
        icon: Play,
        completedIcon: CheckCircle,
        inProgressIcon: Activity,
        status: pipelineStatus.liveInterview?.status || 'not-started',
        completedAt: pipelineStatus.liveInterview?.completedAt,
      });
    }
  });

  timelineStages.push({
    id: 'finalDecision',
    label: 'Final Decision',
    icon: FileCheck,
    completedIcon: CheckCircle,
    inProgressIcon: Activity,
    status: (candidate as any).offerStatus
      ? 'completed'
      : areAllStagesCompleted()
        ? pipelineStatus.finalDecision?.status || 'not-started'
        : 'not-started',
    completedAt: pipelineStatus.finalDecision?.completedAt,
  });

  let lastActiveIndex = -1;
  timelineStages.forEach((stage, index) => {
    if (stage.status === 'completed' || stage.status === 'in-progress') {
      lastActiveIndex = index;
    }
  });
  const progressPercentage = timelineStages.length > 1
    ? Math.max(0, (lastActiveIndex / (timelineStages.length - 1)) * 100)
    : 0;

  const handleStageClick = (stageId: string) => {
    const mapping: Record<string, TabType> = {
      'assessment': 'assessment',
      'aiInterview': 'interview',
      'liveInterview': 'live-interview',
      'finalDecision': 'final-report',
      'github': 'github'
    };
    const tabId = mapping[stageId];
    if (tabId) {
      const tab = tabs.find(t => t.id === tabId);
      if (tab && !tab.locked) {
        setActiveTab(tabId);
      }
    }
  };

  const githubAssessment = candidate.githubAnalysis?.assessment || {};
  const qualityIndicators = candidate.githubAnalysis?.qualityIndicators || {};
  const contributionBreakdown = candidate.githubAnalysis?.contributionStats?.breakdown || {};
  const repoConfidence = candidate.githubAnalysis?.repoConfidence || {};
  const dataFreshness = candidate.githubAnalysis?.dataFreshness || {};
  const fallbackRecentActivity = Object.entries(contributionBreakdown)
    .filter(([, value]) => Number(value) > 0)
    .slice(0, 4)
    .map(([key, value]) => ({
      type: key,
      title: `${String(value)} ${key.replace('_', ' ')} event${Number(value) === 1 ? '' : 's'}`,
      description: 'Derived from public GitHub activity events',
      repo: 'GitHub profile',
      time_ago: 'Last 12 months'
    }));

  const recentGithubActivity = Array.isArray(candidate.githubAnalysis?.recentActivity) && candidate.githubAnalysis.recentActivity.length > 0
    ? candidate.githubAnalysis.recentActivity
    : fallbackRecentActivity;

  const rawTopRepos = Array.isArray(candidate.githubStats?.topRepos) ? candidate.githubStats.topRepos : [];
  const showcaseRepos = [...rawTopRepos]
    .sort((a: any, b: any) => {
      const aHasDescription = Boolean(String(a?.description || '').trim());
      const bHasDescription = Boolean(String(b?.description || '').trim());
      if (aHasDescription !== bHasDescription) {
        return aHasDescription ? -1 : 1;
      }

      const aStars = Number(a?.stars || 0);
      const bStars = Number(b?.stars || 0);
      return bStars - aStars;
    })
    .slice(0, 4);

  const avgPrReviewTimeHours = qualityIndicators?.avg_pr_review_time_hours;
  const avgPrReviewTimeText = typeof avgPrReviewTimeHours === 'number' ? `${avgPrReviewTimeHours.toFixed(1)} hrs` : 'N/A';
  const avgPrReviewTimeNote = qualityIndicators?.avg_pr_review_time_note || 'Insufficient PR review events';

  const codeDocumentationPct = Number.isFinite(Number(qualityIndicators?.code_documentation_pct))
    ? Number(qualityIndicators.code_documentation_pct)
    : Number(githubAssessment?.sustainability || 0);
  const testCoveragePct = Number.isFinite(Number(qualityIndicators?.test_coverage_pct))
    ? Number(qualityIndicators.test_coverage_pct)
    : Number(githubAssessment?.correctness || 0);
  const codeReviewQualityScore = Number.isFinite(Number(qualityIndicators?.code_review_quality_score))
    ? Number(qualityIndicators.code_review_quality_score)
    : Math.max(0, Math.min(5, Number(githubAssessment?.knowledge || 0) / 20));
  const overallGithubScore = Number.isFinite(Number(candidate.githubAnalysis?.overallScore))
    ? Number(candidate.githubAnalysis.overallScore)
    : (Number.isFinite(Number(qualityIndicators?.overall_github_score)) ? Number(qualityIndicators.overall_github_score) : Number(candidate.scores.github || 0));
  const githubQuestionDelivery = candidate.githubAnalysis?.questionDelivery || {};
  const githubAssignedStats = candidate.githubAnalysis?.assignedQuestionStats || {};
  const githubAssignedFromSession = Number(githubAssignedStats?.githubAssigned);
  const githubAssignedFromDelivery = Number(githubQuestionDelivery?.count);
  const githubAssignedCount = Number.isFinite(githubAssignedFromSession)
    ? githubAssignedFromSession
    : (Number.isFinite(githubAssignedFromDelivery) ? githubAssignedFromDelivery : 0);
  const githubAssignedTotal = Number.isFinite(Number(githubAssignedStats?.totalAssigned))
    ? Number(githubAssignedStats.totalAssigned)
    : 0;
  const githubAssignmentSessionId = typeof githubAssignedStats?.sessionId === 'string' ? githubAssignedStats.sessionId : '';
  const githubAssignmentSessionShort = githubAssignmentSessionId ? `${githubAssignmentSessionId.slice(0, 8)}...` : 'N/A';
  const githubAssignedQuestionList = Array.isArray(githubAssignedStats?.githubQuestions) ? githubAssignedStats.githubQuestions : [];
  const filteredGithubAssignedQuestionList = githubAssignedQuestionList.filter((q: any) => {
    if (githubQuestionTypeFilter === 'all') return true;
    const normalizedType = String(q?.questionType || '').trim().toLowerCase();
    if (githubQuestionTypeFilter === 'coding') return normalizedType === 'coding' || normalizedType === 'code';
    return normalizedType === githubQuestionTypeFilter;
  });

  const getRepoNameFromQuestion = (q: any): string => {
    const direct = String(q?.repositoryName || '').trim();
    if (direct) return direct;

    const sourceFile = String(q?.sourceFile || '').trim();
    if (!sourceFile) return 'Unknown repo';

    const normalized = sourceFile.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0].toLowerCase() !== 'src') {
      return parts[0];
    }
    return parts[parts.length - 1] || 'Unknown repo';
  };

  const hasGithubProfile = Boolean(candidate.github_url);
  const githubAnalysisReady = Boolean(candidate.githubAnalysis?.summary)
    || Number.isFinite(Number(candidate.githubAnalysis?.overallScore))
    || Number(candidate.githubStats?.contributionsLastYear || 0) > 0;
  const showGithubProfileLock = hasGithubProfile && !githubAnalysisReady;

  const formatScore = (value: unknown, digits = 1): string => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 'N/A';
    return num.toFixed(digits);
  };

  const displayOverallScore = scoreBreakdown?.pre_score_final ?? scoreBreakdown?.match_score ?? candidate.scores.overall;
  const displayAssessmentScore = candidate.scores.assessment;
  const displayAIInterviewScore = candidate.scores.aiInterview;
  const displayGithubScore = Number.isFinite(Number(candidate.githubAnalysis?.overallScore))
    ? Number(candidate.githubAnalysis.overallScore)
    : candidate.scores.github;

  const resumeSummary = String(
    candidate.resumeSummary ||
    candidate.about ||
    (Array.isArray(candidate.workHistory) && candidate.workHistory[0]?.description) ||
    ''
  ).trim();

  const rawTechSkills = candidate.techSkills || {};
  const fallbackSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const frontendSkills = Array.isArray(rawTechSkills.frontend) ? rawTechSkills.frontend : [];
  const backendSkills = Array.isArray(rawTechSkills.backend) ? rawTechSkills.backend : [];
  const devopsSkills = Array.isArray(rawTechSkills.devops) ? rawTechSkills.devops : [];

  const hasCategorizedTechSkills = frontendSkills.length > 0 || backendSkills.length > 0 || devopsSkills.length > 0;
  const derivedFrontendSkills = fallbackSkills.filter((s: string) => /react|vue|angular|html|css|javascript|typescript|tailwind/i.test(String(s)));
  const derivedDevopsSkills = fallbackSkills.filter((s: string) => /docker|kubernetes|aws|azure|gcp|terraform|jenkins|linux|ci\/cd|ci|cd/i.test(String(s)));
  const derivedBackendSkills = fallbackSkills.filter((s: string) => !derivedFrontendSkills.includes(s) && !derivedDevopsSkills.includes(s));

  const resumeFrontendSkills = hasCategorizedTechSkills ? frontendSkills : derivedFrontendSkills;
  const resumeBackendSkills = hasCategorizedTechSkills ? backendSkills : derivedBackendSkills;
  const resumeDevopsSkills = hasCategorizedTechSkills ? devopsSkills : derivedDevopsSkills;

  const resumeCertifications = Array.isArray(candidate.certifications) ? candidate.certifications : [];
  const resumeProjects = Array.isArray(candidate.projects) ? candidate.projects : [];

  const pendingPipelineStages = [
    { key: 'assessment', label: 'Technical Assessment' },
    { key: 'aiInterview', label: 'AI Interview' },
    { key: 'liveInterview', label: 'Live Interview' },
  ].filter(({ key }) => {
    const status = pipelineStatus[key as keyof typeof pipelineStatus]?.status;
    return status !== 'completed';
  }).map(item => item.label);

  const strengths: string[] = [];
  if (Number(candidate.experience || 0) > 0) strengths.push(`${candidate.experience} years of relevant experience`);
  if (Array.isArray(candidate.skills) && candidate.skills.length > 0) strengths.push(`Core skills: ${candidate.skills.slice(0, 5).join(', ')}`);
  const _semVal = scoreBreakdown?.semantic_score ?? scoreBreakdown?.jd_embedding_similarity;
  if (_semVal != null) strengths.push(`Strong semantic match (${formatScore(_semVal, 1)})`);
  if (scoreBreakdown?.skills_experience_score != null) strengths.push(`Skills/experience alignment at ${formatScore(scoreBreakdown.skills_experience_score, 1)}`);
  if (Number.isFinite(Number(displayGithubScore)) && Number(displayGithubScore) > 0 && !showGithubProfileLock) {
    strengths.push(`GitHub score ${formatScore(displayGithubScore, 1)} based on repository analysis`);
  }

  const developmentAreas: string[] = [];
  if (scoreBreakdown?.skills_experience_score != null && scoreBreakdown.skills_experience_score < 60) {
    developmentAreas.push('Skills/experience alignment is below target threshold and should be validated in interview stages.');
  }
  if (showGithubProfileLock) {
    developmentAreas.push('GitHub analysis is still processing; engineering-signal metrics are incomplete.');
  }
  if (pendingPipelineStages.length > 0) {
    developmentAreas.push(`Pending stages: ${pendingPipelineStages.join(', ')}.`);
  }

  const recommendationReasons = Array.isArray(scoreBreakdown?.score_explanation)
    ? scoreBreakdown!.score_explanation.slice(0, 3)
    : [];

  const assignedGroupId = candidate?.groupId || candidate?.group_id || null;
  const assignedGroupName = candidate?.groupName || candidate?.group_name || null;

  return (
    <div className="flex h-full min-h-0">
      {rail && (
        <CandidateRail
          candidates={rail.candidates}
          activeApplicationId={rail.activeApplicationId}
          onSelect={rail.onSelect}
        />
      )}
      <div className={rail ? 'flex-1 min-w-0' : 'w-full'}>
        <div className={`h-full w-full overflow-auto relative ${embedded ? 'bg-white' : 'bg-[#f9fafb]'}`}>
      <div className={embedded ? 'w-full px-1 py-1' : 'max-w-[1400px] mx-auto px-[48px] py-[24px]'}>
        {/* Header */}
        {!embedded && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back</span>
        </button>
        )}

        {/* Profile Header — Hero */}
        <div className="rounded-[24px] overflow-hidden mb-6 shadow-lg">

          {/* Dark gradient banner */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-10 py-8">
            <div className="flex items-start gap-6">

              {/* Avatar */}
              <div className="w-[120px] h-[120px] rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-[42px] font-bold font-['Arimo',sans-serif] ring-4 ring-white/20 shadow-xl flex-shrink-0">
                {String(candidate.name || '').split(' ').map((n: string) => (n ? n[0] : '')).join('')}
              </div>

              {/* Name / meta / actions */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-white text-[28px] font-bold font-['Arimo',sans-serif] mb-1 leading-tight">
                      {candidate.name}
                    </h1>
                    <p className="text-indigo-200 text-[15px] font-['Arimo',sans-serif] mb-3">
                      {candidate.title}
                    </p>
                    <div className="flex items-center gap-5 flex-wrap">
                      <span className="flex items-center gap-2 text-slate-300 text-[13px] font-['Arimo',sans-serif]">
                        <Mail size={14} className="text-indigo-400" />
                        {candidate.email}
                      </span>
                      <span className="flex items-center gap-2 text-slate-300 text-[13px] font-['Arimo',sans-serif]">
                        <Phone size={14} className="text-indigo-400" />
                        {candidate.phone}
                      </span>
                      <span className="flex items-center gap-2 text-slate-300 text-[13px] font-['Arimo',sans-serif]">
                        <MapPin size={14} className="text-indigo-400" />
                        {candidate.location}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        const resumeUrl = resolveBackendMediaUrl(candidate.resumeUrl);
                        if (resumeUrl) {
                          window.open(resumeUrl, '_blank');
                        } else {
                          alert("No resume available for download.");
                        }
                      }}
                      className="flex items-center gap-2 h-[38px] px-4 rounded-xl border border-white/30 text-white text-[13px] font-['Arimo',sans-serif] hover:bg-white/10 transition-colors"
                    >
                      <Download size={15} />
                      Download Resume
                    </button>
                    {candidate.github_url && (
                      <a
                        href={candidate.github_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 h-[38px] px-4 rounded-xl border border-white/30 text-white text-[13px] font-['Arimo',sans-serif] hover:bg-white/10 transition-colors"
                      >
                        <Github size={15} />
                        GitHub
                      </a>
                    )}
                  </div>
                </div>

                {/* Notification banners */}
                {assessmentResetMessage && (
                  <div className="mb-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                    <p className="font-['Arimo',sans-serif] text-[12px] text-white">{assessmentResetMessage}</p>
                  </div>
                )}
                {assessmentResetError && (
                  <div className="mb-3 rounded-xl border border-red-400/40 bg-red-500/20 px-3 py-2">
                    <p className="font-['Arimo',sans-serif] text-[12px] text-red-300">{assessmentResetError}</p>
                  </div>
                )}
                {githubReanalysisMessage && (
                  <div className="mb-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                    <p className="font-['Arimo',sans-serif] text-[12px] text-white">{githubReanalysisMessage}</p>
                  </div>
                )}
                {githubReanalysisError && (
                  <div className="mb-3 rounded-xl border border-red-400/40 bg-red-500/20 px-3 py-2">
                    <p className="font-['Arimo',sans-serif] text-[12px] text-red-300">{githubReanalysisError}</p>
                  </div>
                )}

                {/* Anti-cheating badge */}
                {candidate.antiCheating && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-400/40 text-red-300 text-[12px] font-['Arimo',sans-serif]">
                    <AlertTriangle size={13} />
                    Anti-cheating flag detected
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Score strip — attached below the banner */}
          {(() => {
            const hasAssessment = activeFlow.includes('assessment');
            const hasAI = activeFlow.includes('ai_interview') || activeFlow.includes('ai-interview') || activeFlow.includes('aiInterview');
            const hasLive = activeFlow.includes('live_interview') || activeFlow.includes('live-interview') || activeFlow.includes('liveInterview');
            const colCount = 1 + (hasAssessment ? 1 : 0) + (hasAI ? 1 : 0) + (hasLive ? 1 : 0) + 1;
            const assessmentLocked = !!tabs.find(t => t.id === 'assessment')?.locked;
            const aiLocked = !!tabs.find(t => t.id === 'interview')?.locked;
            const liveLocked = !!tabs.find(t => t.id === 'live-interview')?.locked;
            const assessScore = Number(displayAssessmentScore);
            const overallScore = Number(displayOverallScore);

            return (
              <div
                className="bg-white border-x border-b border-slate-200 rounded-b-[24px] grid divide-x divide-slate-100"
                style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}
              >
                {/* Overall Match */}
                <div className="px-6 py-5 text-center">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 font-['Arimo',sans-serif]">
                    Overall Match
                  </div>
                  <div className="text-[32px] font-bold text-indigo-600 leading-none font-['Arimo',sans-serif]">
                    {formatScore(displayOverallScore, 0)}%
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-indigo-100 mx-auto w-14 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, overallScore)}%` }} />
                  </div>
                </div>

                {/* Assessment */}
                {hasAssessment && (
                  <button
                    onClick={() => !assessmentLocked && handleStageClick('assessment')}
                    disabled={assessmentLocked}
                    className="px-6 py-5 text-center transition-colors hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 font-['Arimo',sans-serif]">
                      Assessment
                    </div>
                    <div className="text-[32px] font-bold text-blue-600 leading-none font-['Arimo',sans-serif]">
                      {formatScore(displayAssessmentScore, 0)}%
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-blue-100 mx-auto w-14 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, assessScore)}%` }} />
                    </div>
                  </button>
                )}

                {/* AI Interview */}
                {hasAI && (
                  <button
                    onClick={() => !aiLocked && handleStageClick('aiInterview')}
                    disabled={aiLocked}
                    className="px-6 py-5 text-center transition-colors hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 font-['Arimo',sans-serif]">
                      AI Interview
                    </div>
                    <div className="text-[32px] font-bold text-purple-600 leading-none font-['Arimo',sans-serif]">
                      {formatInterviewScore(displayAIInterviewScore)}<span className="text-[18px] text-purple-400">/10</span>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-purple-100 mx-auto w-14 overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, Number(formatInterviewScore(displayAIInterviewScore)) * 10)}%` }} />
                    </div>
                  </button>
                )}

                {/* Live Interview */}
                {hasLive && (
                  <button
                    onClick={() => !liveLocked && handleStageClick('liveInterview')}
                    disabled={liveLocked}
                    className="px-6 py-5 text-center transition-colors hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 font-['Arimo',sans-serif]">
                      Live Interview
                    </div>
                    <div className="text-[32px] font-bold text-amber-600 leading-none font-['Arimo',sans-serif]">
                      {pipelineStatus.liveInterview?.status === 'completed' ? 'Done' : 'Pending'}
                    </div>
                  </button>
                )}

                {/* GitHub */}
                <button
                  onClick={() => handleStageClick('github')}
                  className="px-6 py-5 text-center transition-colors hover:bg-emerald-50"
                >
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 font-['Arimo',sans-serif]">
                    GitHub
                  </div>
                  <div className="text-[32px] font-bold text-emerald-600 leading-none font-['Arimo',sans-serif]">
                    {showGithubProfileLock ? '—' : formatScore(displayGithubScore, 0)}
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-emerald-100 mx-auto w-14 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Number(displayGithubScore))}%` }} />
                  </div>
                </button>
              </div>
            );
          })()}

        </div>

        {/* Offer Status Banner */}
        {candidate.pipelineStatus?.finalDecision?.status === 'completed' && (
          <div className={`rounded-xl border-2 p-6 mb-6 ${candidate.offerStatus === 'sent'
            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300'
            : candidate.offerStatus === 'accepted'
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
              : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-300'
            }`}>
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${candidate.offerStatus === 'sent'
                ? 'bg-emerald-500'
                : candidate.offerStatus === 'accepted'
                  ? 'bg-green-500'
                  : 'bg-gray-500'
                }`}>
                {candidate.offerStatus === 'sent' || candidate.offerStatus === 'accepted' ? (
                  <Mail className="text-white" size={28} />
                ) : (
                  <XCircle className="text-white" size={28} />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`text-xl font-bold mb-2 ${candidate.offerStatus === 'sent'
                  ? 'text-emerald-900'
                  : candidate.offerStatus === 'accepted'
                    ? 'text-green-900'
                    : 'text-gray-900'
                  }`}>
                  {candidate.offerStatus === 'sent' && 'Offer Sent'}
                  {candidate.offerStatus === 'accepted' && 'Offer Accepted'}
                  {candidate.offerStatus === 'rejected' && 'Not Selected'}
                </h3>
                <p className="text-gray-700 mb-3">
                  {candidate.offerStatus === 'sent' && `An offer was sent to this candidate on ${candidate.pipelineStatus.finalDecision.completedAt}. Awaiting candidate response.`}
                  {candidate.offerStatus === 'accepted' && `Candidate accepted the offer on ${candidate.offerAcceptedDate}. Next steps: Onboarding process.`}
                  {candidate.offerStatus === 'rejected' && 'This candidate was not selected for the position.'}
                </p>
                {candidate.offerStatus === 'sent' && (
                  <div className="flex items-center gap-3">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Mail size={16} className="mr-2" />
                      Resend Offer Email
                    </Button>
                    <Button variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50">
                      View Contract
                    </Button>
                  </div>
                )}
                {candidate.offerStatus === 'accepted' && (
                  <div className="flex items-center gap-3">
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      <CheckCircle size={16} className="mr-2" />
                      Start Onboarding
                    </Button>
                    <Button variant="outline" className="border-green-600 text-green-700 hover:bg-green-50">
                      <FileText size={16} className="mr-2" />
                      View Contract
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="px-6 py-3 flex items-center gap-1.5 overflow-x-auto border-b border-slate-100">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.locked) return;
                    setActiveTab(tab.id as TabType);
                  }}
                  title={tab.locked ? 'This stage has not been reached yet' : undefined}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-['Arimo',sans-serif] whitespace-nowrap transition-all ${
                    tab.locked
                      ? 'text-slate-300 cursor-not-allowed'
                      : isActive
                        ? 'bg-indigo-50 text-indigo-700 font-semibold ring-1 ring-indigo-200'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {tab.locked
                    ? <Lock size={13} className="text-slate-300" />
                    : <Icon size={14} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                  }
                  {tab.label}
                  {tab.locked && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                      Pending
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[#111827]">Match Score Breakdown</h3>
                    {applicationId && (
                      <button
                        onClick={() => window.open(`/recruiter/candidates/${candidateId}/qag-audit?applicationId=${applicationId}`, '_blank')}
                        className="h-[34px] px-[12px] rounded-[8px] border border-[#d1d5db] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[12px] text-[#374151]"
                      >
                        Open QAG Audit
                      </button>
                    )}
                  </div>
                  <div className="bg-white border border-[#e5e7eb] rounded-xl p-6">
                    {scoreBreakdownLoading ? (
                      <div className="flex items-center gap-2 text-[#6b7280] font-['Arimo',sans-serif] text-[14px]">
                        <Loader2 size={16} className="animate-spin" />
                        Loading score breakdown...
                      </div>
                    ) : !scoreBreakdown ? (
                      <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        Score breakdown is unavailable for this candidate context.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {/* Final Pre-Score — indigo */}
                          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4">
                            <p className="font-['Arimo',sans-serif] text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Final Pre-Score</p>
                            <p className="font-['Arimo',sans-serif] text-[24px] font-bold text-indigo-600">{formatScore(scoreBreakdown.pre_score_final ?? scoreBreakdown.match_score, 0)}%</p>
                          </div>
                          {/* Semantic Score — sky */}
                          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4">
                            <p className="font-['Arimo',sans-serif] text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Semantic Score</p>
                            {scoreBreakdown.semantic_score != null
                              ? <p className="font-['Arimo',sans-serif] text-[24px] font-bold text-sky-600">{formatScore(scoreBreakdown.semantic_score, 0)}%</p>
                              : <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200 mt-1">Pending</span>
                            }
                          </div>
                          {/* Skills + Experience — violet */}
                          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4">
                            <p className="font-['Arimo',sans-serif] text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Skills + Experience</p>
                            <p className="font-['Arimo',sans-serif] text-[24px] font-bold text-violet-600">{formatScore(scoreBreakdown.skills_experience_score, 0)}%</p>
                          </div>
                          {/* QAG Score — amber */}
                          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4">
                            <p className="font-['Arimo',sans-serif] text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">QAG Score</p>
                            {scoreBreakdown.qag_score != null
                              ? <p className="font-['Arimo',sans-serif] text-[24px] font-bold text-amber-600">{formatScore(scoreBreakdown.qag_score, 0)}%</p>
                              : <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200 mt-1">Pending</span>
                            }
                          </div>
                          {/* Keyword Coverage — teal */}
                          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4">
                            <p className="font-['Arimo',sans-serif] text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Keyword Coverage</p>
                            {scoreBreakdown.keyword_match_score != null
                              ? <p className="font-['Arimo',sans-serif] text-[24px] font-bold text-teal-600">{formatScore(scoreBreakdown.keyword_match_score, 0)}%</p>
                              : <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200 mt-1">Pending</span>
                            }
                          </div>
                          {/* GitHub Boost — emerald (keep /10 unit) */}
                          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4">
                            <p className="font-['Arimo',sans-serif] text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">GitHub Boost</p>
                            {scoreBreakdown.optional_profile_boost != null && Number(scoreBreakdown.optional_profile_boost) > 0
                              ? <p className="font-['Arimo',sans-serif] text-[24px] font-bold text-emerald-600">{formatScore(scoreBreakdown.optional_profile_boost, 1)}<span className="text-[16px] text-emerald-400">/10</span></p>
                              : <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200 mt-1">Pending</span>
                            }
                          </div>
                        </div>


                        {Array.isArray(scoreBreakdown.score_explanation) && scoreBreakdown.score_explanation.length > 0 && (
                          <div>
                            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-2">Top reasons</p>
                            <ul className="space-y-1">
                              {scoreBreakdown.score_explanation.map((line, idx) => (
                                <li key={idx} className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">• {line}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recruitment Pipeline Progress */}
                <div>
                  <h3 className="text-[#111827] mb-4">Recruitment Progress</h3>
                  {!candidate.groupAssigned ? (
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                      <div className="text-gray-400 mb-2">
                        <Clock size={48} className="mx-auto" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-700 mb-1">Not Started</h4>
                      <p className="text-sm text-gray-500">Candidate has not been assigned to a group yet</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-[#e5e7eb] rounded-xl p-6">
                      <div className="relative">
                        {/* Progress Line */}
                        <div className="absolute top-7 left-0 right-0 h-1 bg-slate-100" style={{ zIndex: 0 }}>
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>

                        {/* Pipeline Stages */}
                        <div className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${timelineStages.length}, minmax(0, 1fr))`, zIndex: 1 }}>
                          {timelineStages.map((stage) => {
                            const Icon = stage.status === 'completed' ? stage.completedIcon : stage.status === 'in-progress' ? (stage.inProgressIcon || stage.icon) : stage.icon;
                            const isClickable = stage.id !== 'groupAssignment' && (stage.status === 'completed' || stage.status === 'in-progress');

                            return (
                              <div
                                key={stage.id}
                                onClick={() => isClickable && handleStageClick(stage.id)}
                                className={`flex flex-col items-center group ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                              >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 border-4 transition-all duration-300 ${stage.status === 'completed'
                                    ? 'bg-emerald-500 border-emerald-200 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-emerald-100'
                                    : stage.status === 'in-progress'
                                      ? 'bg-indigo-500 border-indigo-200 ring-4 ring-indigo-100 group-hover:scale-110 group-hover:shadow-lg'
                                      : 'bg-slate-200 border-slate-100'
                                  }`}>
                                  <Icon size={26} className={stage.status === 'completed' ? 'text-white' : stage.status === 'in-progress' ? 'text-white animate-pulse' : 'text-slate-400'} />
                                </div>
                                <div className="text-center">
                                  <div className={`font-['Arimo',sans-serif] text-[12px] font-semibold mb-1 transition-colors ${isClickable ? 'text-slate-800 group-hover:text-indigo-600' : 'text-slate-400'
                                    }`}>
                                    {stage.label}
                                  </div>
                                  {stage.completedAt && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 font-['Arimo',sans-serif]">
                                      {stage.completedAt}
                                    </span>
                                  )}
                                  {stage.status === 'in-progress' && (
                                    <div className="font-['Arimo',sans-serif] text-[10px] text-indigo-600 font-semibold">
                                      In Progress
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {candidate.skills.map((skill: string, i: number) => (
                      <span
                        key={i}
                        className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full font-['Arimo',sans-serif] text-[13px] font-medium ring-1 ring-indigo-100 hover:bg-indigo-100 transition-colors"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Work Experience</h3>
                  <div className="space-y-1">
                    {candidate.workHistory.map((job: any, i: number) => (
                      <div key={i}>
                        <div className="border-l-4 border-indigo-200 pl-5 py-1">
                          <div className="font-['Arimo',sans-serif] text-[16px] font-semibold text-slate-800 mb-1">
                            {job.title}
                          </div>
                          <div className="font-['Arimo',sans-serif] text-[13px] text-slate-500 mb-2">
                            {job.company} • {job.duration}
                          </div>
                          <p className="font-['Arimo',sans-serif] text-[14px] text-slate-600">
                            {job.description}
                          </p>
                        </div>
                        {i < candidate.workHistory.length - 1 && (
                          <div className="h-px bg-slate-100 my-4" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Education</h3>
                  <div className="space-y-1">
                    {candidate.education.map((edu: any, i: number) => (
                      <div key={i}>
                        <div className="border-l-4 border-indigo-100 pl-5 py-1">
                          <div className="font-['Arimo',sans-serif] text-[15px] font-semibold text-slate-800">
                            {edu.degree}
                          </div>
                          <div className="font-['Arimo',sans-serif] text-[13px] text-slate-500">
                            {edu.school} • {edu.year}
                          </div>
                        </div>
                        {i < candidate.education.length - 1 && (
                          <div className="h-px bg-slate-100 my-3" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'resume' && (
              <div className="space-y-6">
                <h3 className="text-[#111827] mb-4">Parsed Resume Data</h3>

                {/* Resume Summary */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-3">Professional Summary</h4>
                  <p className="text-[#374151] text-sm leading-relaxed">
                    {resumeSummary || 'No summary was extracted from this CV yet.'}
                  </p>
                </div>

                {/* Skills from Resume */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Technical Skills</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-[#6b7280] mb-2">Frontend</div>
                      <div className="space-y-1">
                        {resumeFrontendSkills.map((s: string, i: number) => (
                          <div key={i} className="text-sm text-[#111827]">{s}</div>
                        ))}
                        {resumeFrontendSkills.length === 0 && <div className="text-sm text-[#9ca3af]">No frontend skills extracted</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6b7280] mb-2">Backend</div>
                      <div className="space-y-1">
                        {resumeBackendSkills.map((s: string, i: number) => (
                          <div key={i} className="text-sm text-[#111827]">{s}</div>
                        ))}
                        {resumeBackendSkills.length === 0 && <div className="text-sm text-[#9ca3af]">No backend skills extracted</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6b7280] mb-2">DevOps</div>
                      <div className="space-y-1">
                        {resumeDevopsSkills.map((s: string, i: number) => (
                          <div key={i} className="text-sm text-[#111827]">{s}</div>
                        ))}
                        {resumeDevopsSkills.length === 0 && <div className="text-sm text-[#9ca3af]">No DevOps skills extracted</div>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Work Experience from Resume */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Work Experience</h4>
                  <div className="space-y-5">
                    {candidate.workHistory.map((job: any, i: number) => (
                      <div key={i} className="border-l-2 border-[#6366f1] pl-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-[#111827] text-sm">{job.title}</div>
                            <div className="text-[#6b7280] text-xs">{job.company}</div>
                          </div>
                          <div className="text-[#6b7280] text-xs">{job.duration}</div>
                        </div>
                        <p className="text-[#374151] text-sm">{job.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Projects from Resume */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Projects</h4>
                  {resumeProjects.length > 0 ? (
                    <div className="space-y-5">
                      {resumeProjects.map((project: any, i: number) => (
                        <div key={i} className="border-l-2 border-[#10b981] pl-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-medium text-[#111827] text-sm">{project.name}</div>
                              {project.url && (
                                <a
                                  href={project.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#4f46e5] text-xs hover:underline"
                                >
                                  {project.url}
                                </a>
                              )}
                            </div>
                            <div className="text-[#6b7280] text-xs">{project.duration || 'N/A'}</div>
                          </div>
                          <p className="text-[#374151] text-sm">{project.description || 'No description provided'}</p>
                          {Array.isArray(project.technologies) && project.technologies.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {project.technologies.map((tech: string, idx: number) => (
                                <span key={idx} className="px-2 py-0.5 rounded-full bg-[#ecfeff] text-[#0f766e] text-[11px] border border-[#a5f3fc]">
                                  {tech}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[#9ca3af]">No projects extracted from parsed CV data.</div>
                  )}
                </div>

                {/* Education from Resume */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Education</h4>
                  <div className="space-y-4">
                    {candidate.education.map((edu: any, i: number) => (
                      <div key={i}>
                        <div className="font-medium text-[#111827] text-sm">{edu.degree}</div>
                        <div className="text-[#6b7280] text-xs">{edu.school} • {edu.year}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Certifications */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Certifications</h4>
                  <div className="space-y-2">
                    {resumeCertifications.map((cert: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm text-[#374151]">{cert}</span>
                      </div>
                    ))}
                    {resumeCertifications.length === 0 && (
                      <div className="text-sm text-[#9ca3af]">No certifications listed in parsed CV data.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'github' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {!hasGithubProfile ? (
                  <div className="flex flex-col items-center justify-center py-24 bg-white border border-[#e5e7eb] rounded-[24px] shadow-sm">
                    <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                      <Lock className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-[22px] font-bold text-[#111827] tracking-tight mb-3">GitHub Analysis Locked</h3>
                    <p className="text-[#6b7280] text-[15px] text-center max-w-[480px] leading-relaxed">
                      This account don't have github url. Please add a valid GitHub profile URL to unlock technical intelligence and codebase analysis.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-bold text-[#111827] tracking-tight">Technical Intelligence</h3>
                    <p className="text-[#6b7280] text-sm mt-1">Deep analysis of GitHub presence, code quality, and engineering patterns</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => navigate(`/recruiter/candidates/${candidateId}/github-analysis-review${applicationId ? `?applicationId=${applicationId}` : ''}`)}
                      className="bg-[#6366f1] hover:bg-[#4f46e5] text-white shadow-md shadow-indigo-100"
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      Full Review Details
                    </Button>
                  </div>
                </div>

                {/* Recruiter Intelligence & Personalization */}
                <div className="bg-gradient-to-br from-[#111827] to-[#1e293b] rounded-[32px] p-8 text-white shadow-xl shadow-slate-200">
                  <div className="flex flex-col lg:flex-row gap-8 items-start">
                    <div className="lg:w-2/3">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <h4 className="text-lg font-bold tracking-tight">AI Analysis Executive Summary</h4>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500/50 to-transparent rounded-full" />
                        <p className="text-sm text-slate-300 leading-7 italic font-medium">
                          {candidate.githubAnalysis?.summary || "Profile analysis in progress. Engineering patterns and soft-skill signals will appear here shortly after full repository indexing."}
                        </p>
                      </div>

                      {Array.isArray(candidate.githubPersonalization?.keywords) && candidate.githubPersonalization.keywords.length > 0 && (
                        <div className="mt-8">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Signal Keywords</div>
                          <div className="flex flex-wrap gap-2">
                            {candidate.githubPersonalization.keywords.slice(0, 12).map((kw: string, idx: number) => (
                              <span key={idx} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-indigo-200 text-[11px] font-bold">
                                #{kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="lg:w-1/3 w-full bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-sm">
                      <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Data Integrity
                      </h5>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-300 font-medium">Source Freshness</span>
                          <span className="text-xs font-bold text-white">{dataFreshness?.source_freshness_hours ?? 'N/A'}h</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-300 font-medium">Capture Method</span>
                          <span className="text-xs font-bold text-white uppercase tracking-tighter">{candidate.githubAnalysis?.contributionStats?.source || 'Public API'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-300 font-medium">Profile Scoped</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">LATEST</span>
                        </div>
                      </div>

                      <div className="mt-6">
                        <Button
                          variant="outline"
                          className="w-full bg-transparent border-slate-700 text-slate-300 hover:bg-white/5 hover:text-white border-dashed text-xs h-10"
                        >
                          <Globe className="w-3 h-3 mr-2" />
                          View on GitHub.com
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hero Dashboard: Score & Archetypes */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Overall Score Circle */}
                  <div className="lg:col-span-4 bg-white border border-[#e5e7eb] rounded-[24px] p-8 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#6366f1]/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/5 rounded-full -ml-12 -mb-12 transition-transform group-hover:scale-110" />
                    
                    <div className="relative">
                      <svg className="w-32 h-32 transform -rotate-90">
                        <circle
                          cx="64"
                          cy="64"
                          r="58"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          className="text-[#f3f4f6]"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="58"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={364.42}
                          strokeDashoffset={364.42 - (364.42 * overallGithubScore) / 100}
                          className="text-[#6366f1] transition-all duration-1000 ease-out"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-black text-[#111827]">{Math.round(overallGithubScore)}</span>
                        <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-widest">Score</span>
                      </div>
                    </div>
                    
                    <div className="mt-6 text-center">
                      <h4 className="text-lg font-bold text-[#111827]">GitHub Excellence</h4>
                      <p className="text-xs text-[#6b7280] mt-1 max-w-[200px]">Composite rank based on code, impact, and consistency</p>
                    </div>
                  </div>

                  {/* Archetype Badges & Trust */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* Archetypes */}
                    <div className="bg-white border border-[#e5e7eb] rounded-[24px] p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-[#374151] flex items-center gap-2 uppercase tracking-wider">
                          <Award className="w-4 h-4 text-amber-500" />
                          Engineering Archetypes
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {Array.isArray(candidate.githubAnalysis?.archetypes) && candidate.githubAnalysis.archetypes.length > 0 ? (
                          candidate.githubAnalysis.archetypes.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 shadow-sm transition-transform hover:-translate-y-1">
                              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                                <Zap className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-[#111827]">{item?.name || 'Engineer'}</div>
                                <div className="text-[11px] font-medium text-emerald-600 uppercase tracking-tight">Score: {item?.score ?? 'N/A'}</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-[#9ca3af] italic">Analysis pending profile indexing...</div>
                        )}
                      </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Public Repos', value: candidate.githubStats?.publicRepos, icon: Code2, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Total Stars', value: candidate.githubStats?.totalStars, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
                        { label: 'Followers', value: candidate.githubStats?.followers, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
                        { label: 'Reliability', value: `${Math.round(Number(repoConfidence?.selected_repo_confidence || 0) * 100)}%`, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' }
                      ].map((stat, i) => (
                        <div key={i} className="bg-white border border-[#e5e7eb] rounded-2xl p-4 transition-shadow hover:shadow-md">
                          <div className={`w-8 h-8 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}>
                            <stat.icon className="w-4 h-4" />
                          </div>
                          <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-1">{stat.label}</div>
                          <div className="text-xl font-black text-[#111827]">{stat.value ?? '0'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tech Stack & Quality Matrix */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Language Mastery */}
                  <div className="lg:col-span-5 bg-white border border-[#e5e7eb] rounded-[24px] p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold text-[#374151] flex items-center gap-2 uppercase tracking-wider">
                        <Terminal className="w-4 h-4 text-indigo-500" />
                        Language Mastery
                      </h4>
                    </div>
                    <div className="space-y-4">
                      {candidate.githubStats?.languages?.slice(0, 5).map((lang: any, i: number) => (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: lang.color || '#6b7280' }} />
                              <span className="text-sm font-bold text-[#111827]">{lang.name}</span>
                            </div>
                            <span className="text-xs font-black text-[#6b7280]">{lang.percentage}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-[#f3f4f6] rounded-full overflow-hidden p-0.5">
                            <div
                              className="h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
                              style={{ width: `${lang.percentage}%`, backgroundColor: lang.color || '#6b7280' }}
                            />
                          </div>
                        </div>
                      )) || (
                        <div className="text-sm text-[#6b7280] flex flex-col items-center py-8">
                          <Cpu className="w-12 h-12 text-[#e5e7eb] mb-2" />
                          No language data available
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Code Quality Signals */}
                  <div className="lg:col-span-7 bg-white border border-[#e5e7eb] rounded-[24px] p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold text-[#374151] flex items-center gap-2 uppercase tracking-wider">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        Quality Matrix
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-black border border-emerald-100 uppercase tracking-tighter">Verified Patterns</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: 'Documentation', value: Math.round(codeDocumentationPct), icon: FileCheck, color: 'indigo' },
                        { label: 'Test Coverage', value: Math.round(testCoveragePct), icon: ShieldCheck, color: 'emerald' },
                        { label: 'PR Review Speed', value: avgPrReviewTimeText, icon: Clock, color: 'blue', isText: true },
                        { label: 'Review Depth', value: `${codeReviewQualityScore.toFixed(1)}/5`, icon: MessageCircle, color: 'amber', isText: true }
                      ].map((metric, i) => (
                        <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">{metric.label}</span>
                            <metric.icon className={`w-4 h-4 text-${metric.color}-500`} />
                          </div>
                          <div className="text-2xl font-black text-[#111827]">{metric.isText ? metric.value : `${metric.value}%`}</div>
                          {!metric.isText && (
                            <div className="w-full h-1.5 bg-slate-200 rounded-full mt-3 overflow-hidden">
                              <div 
                                className={`h-full rounded-full bg-${metric.color}-500`} 
                                style={{ width: `${metric.value}%` }} 
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Main Content Area: Portfolio & Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Top Repositories Portfolio */}
                  <div className="lg:col-span-8 bg-white border border-[#e5e7eb] rounded-[24px] p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold text-[#374151] flex items-center gap-2 uppercase tracking-wider">
                        <Briefcase className="w-4 h-4 text-indigo-500" />
                        Project Showcase
                      </h4>
                      <span className="text-xs text-[#6b7280] font-medium">Selected by Impact & Stars</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {showcaseRepos.length > 0 ? showcaseRepos.map((repo: any, i: number) => (
                        <div key={i} className="group border border-[#e5e7eb] rounded-[20px] p-5 hover:border-[#6366f1] hover:shadow-lg hover:shadow-indigo-50 transition-all duration-300 flex flex-col">
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-[#6366f1] group-hover:text-white transition-colors">
                              <Github className="w-5 h-5" />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
                                <Award className="w-3 h-3" />
                                {repo.stars}
                              </div>
                            </div>
                          </div>
                          
                          <h5 className="text-base font-black text-[#111827] group-hover:text-[#6366f1] transition-colors mb-1 truncate">{repo.name}</h5>
                          <p className="text-xs text-[#6b7280] mb-4 line-clamp-2 h-8 leading-relaxed">
                            {repo.description || 'No description provided for this repository.'}
                          </p>
                          
                          <div className="mt-auto flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: repo.languageColor || '#3178c6' }} />
                              <span className="text-[11px] font-bold text-[#374151]">{repo.language || 'Code'}</span>
                            </div>
                            <span className="text-[10px] font-black text-[#9ca3af] uppercase tracking-tighter">Updated {repo.updatedAt}</span>
                          </div>
                        </div>
                      )) : (
                        <div className="col-span-2 text-sm text-[#6b7280] py-12 text-center border-2 border-dashed border-[#f3f4f6] rounded-[20px]">
                          No public repositories found for showcase.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Activity Stream */}
                  <div className="lg:col-span-4 bg-white border border-[#e5e7eb] rounded-[24px] p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold text-[#374151] flex items-center gap-2 uppercase tracking-wider">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        Activity Pulse
                      </h4>
                    </div>

                    <div className="flex-1 space-y-6">
                      {recentGithubActivity.length > 0 ? (
                        <div className="relative">
                          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[#f3f4f6]" />
                          <div className="space-y-6 relative">
                            {recentGithubActivity.slice(0, 5).map((item: any, idx: number) => (
                              <div key={idx} className="flex items-start gap-4 pl-0">
                                <div className="w-4 h-4 rounded-full bg-white border-2 border-emerald-500 z-10 mt-1 shadow-sm" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <p className="text-xs font-black text-[#111827] truncate leading-none">{item?.title || 'Action'}</p>
                                    <span className="text-[10px] font-bold text-[#9ca3af] whitespace-nowrap uppercase tracking-tighter">{item?.time_ago || 'Now'}</span>
                                  </div>
                                  <p className="text-[11px] text-[#6b7280] leading-tight line-clamp-1">{item?.description || 'Repository update'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <Clock className="w-12 h-12 text-[#f3f4f6] mb-2" />
                          <p className="text-xs text-[#9ca3af] font-medium">No recent public activity detected.</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-[#f3f4f6]">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-widest">Total Contributions</span>
                        <span className="text-xs font-black text-[#111827]">{candidate.githubStats?.contributionsLastYear ?? 0}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full" 
                          style={{ width: `${Math.min(100, (Number(candidate.githubStats?.contributionsLastYear || 0) / 1000) * 100)}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'assessment' && (
              <div className="-mx-8 -mb-8">
                <ModuleDetailAssessment
                  candidateId={Number(candidateId)}
                  candidateName={(candidate as any)?.name ?? ''}
                  score={(candidate as any)?.scores?.assessment ?? 0}
                  completedDate={(candidate as any)?.pipelineStatus?.assessment?.completedAt ?? '—'}
                  onClose={() => {}}
                  onMoveToNextStage={() => {}}
                  questionsData={assessmentQuestions}
                  assessmentStats={assessmentData}
                />
              </div>
            )}

            {activeTab === 'integrity' && (
              <IntegrityTabContent candidate={candidate} />
            )}

            {activeTab === 'interview' && (
              <div className="-mx-8 -mb-8">
                <ModuleDetailAIInterview
                  candidateId={Number(candidateId)}
                  candidateName={(candidate as any)?.name ?? ''}
                  score={(candidate as any)?.scores?.aiInterview ?? 0}
                  completedDate={(candidate as any)?.pipelineStatus?.aiInterview?.completedAt ?? '—'}
                  onClose={() => {}}
                  onMoveToNextStage={() => {}}
                  videoQuestionsData={videoInterviewQuestions}
                />
              </div>
            )}

            {activeTab === 'live-interview' && (
              <div className="space-y-6">
                {/* Real LiveInterviewResults — session ID comes from backend via liveInterviewData */}
                {(candidate as any).liveInterviewData?.sessionId ? (
                  <LiveInterviewResults
                    sessionId={(candidate as any).liveInterviewData.sessionId}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <div className="text-5xl mb-4">🎙️</div>
                    <p className="text-lg font-medium text-slate-300">No live interview session yet</p>
                    <p className="text-sm mt-1">The candidate hasn't started the live interview stage.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[16px] font-bold text-slate-800 font-['Arimo',sans-serif]">Recruiter Notes</h3>
                  <span className="text-[12px] text-slate-400 font-['Arimo',sans-serif]">Private to your team</span>
                </div>
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add private notes about this candidate..."
                  rows={10}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-['Arimo',sans-serif] text-[14px] text-slate-700 resize-none bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-300 transition-shadow"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-slate-400 font-['Arimo',sans-serif]">{notesValue.length} characters</span>
                  <button className="h-[40px] px-6 rounded-xl bg-indigo-600 hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white font-medium transition-colors shadow-sm">
                    Save Notes
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'final-report' && (
              <div className="space-y-6">
                {pipelineStatus.finalDecision?.status !== 'completed' && !candidate.offerStatus ? (
                  /* ── No decision yet — show pending state ── */
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mb-6">
                      <Clock size={40} className="text-amber-500" />
                    </div>
                    <h3 className="text-[#111827] mb-2">Final Report Pending</h3>
                    <p className="text-[#6b7280] text-[14px] max-w-[480px] mb-8">
                      The Final Report will be available once all pipeline stages are completed and a final hiring decision has been made.
                    </p>

                    {/* Show which stages are done vs pending */}
                    <div className="w-full max-w-[480px] bg-[#f9fafb] border border-[#e5e7eb] rounded-[12px] p-6 text-left space-y-3">
                      <div className="font-['Arimo',sans-serif] text-[13px] font-semibold text-[#374151] mb-4">Pipeline Progress</div>
                      {[
                        { key: 'groupAssignment', label: 'Group Assignment' },
                        { key: 'assessment', label: 'Technical Assessment' },
                        { key: 'aiInterview', label: 'AI Video Interview' },
                        { key: 'liveInterview', label: 'Live Interview' },
                        { key: 'finalDecision', label: 'Final Decision' },
                      ].map(({ key, label }) => {
                        const st = pipelineStatus[key as keyof typeof pipelineStatus]?.status || 'not-started';
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">{label}</span>
                            {st === 'completed' ? (
                              <span className="flex items-center gap-1 text-emerald-600 text-[12px]">
                                <CheckCircle size={14} /> Completed
                              </span>
                            ) : st === 'in-progress' ? (
                              <span className="flex items-center gap-1 text-indigo-600 text-[12px]">
                                <Activity size={14} className="animate-pulse" /> In Progress
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[#9ca3af] text-[12px]">
                                <Clock size={14} /> Pending
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Decision Summary */}
                    <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-500 rounded-2xl p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                          <CheckCircle size={24} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-emerald-900 mb-2">Final Decision: Completed</h3>
                          <p className="text-emerald-800 text-sm">
                            This report is generated from recorded pipeline outcomes, scoring signals, and available analysis artifacts.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Evaluation Summary */}
                    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                      <h3 className="text-[#111827] mb-4">Evaluation Summary</h3>

                      <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                          <div className="text-sm text-gray-500 mb-2">Final Evaluator</div>
                          <div className="text-gray-900">{candidate.assignedHR || 'HR Manager'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-2">Technical Reviewer</div>
                          <div className="text-gray-900">{candidate.assignedTechnical || 'Technical Recruiter'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-2">Decision Date</div>
                          <div className="text-gray-900">{pipelineStatus.finalDecision?.completedAt || '—'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-2">Position</div>
                          <div className="text-gray-900">{candidate.positionTitle || '—'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-2">Pre-Score</div>
                          <div className="text-gray-900">{formatScore(scoreBreakdown?.pre_score_final ?? scoreBreakdown?.match_score, 1)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-2">GitHub Score</div>
                          <div className="text-gray-900">{showGithubProfileLock ? 'Pending' : formatScore(displayGithubScore, 1)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Performance Breakdown */}
                    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                      <h3 className="text-[#111827] mb-4">Performance Breakdown</h3>

                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-700">Technical Assessment</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{candidate.scores.assessment}/100</span>
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                            </div>
                          </div>
                          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${candidate.scores.assessment}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {Number(candidate.scores.assessment || 0) >= 80
                              ? 'Assessment performance is strong for this role.'
                              : Number(candidate.scores.assessment || 0) >= 60
                                ? 'Assessment performance is moderate and may need follow-up.'
                                : 'Assessment performance is below target and requires deeper review.'}
                          </p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-700">AI Interview</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{candidate.scores.aiInterview}/100</span>
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                            </div>
                          </div>
                          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${candidate.scores.aiInterview}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {Number(candidate.scores.aiInterview || 0) >= 80
                              ? 'Interview signals indicate high communication and reasoning quality.'
                              : Number(candidate.scores.aiInterview || 0) >= 60
                                ? 'Interview signals are mixed; validate with live interview notes.'
                                : 'Interview signals are currently weak and need additional verification.'}
                          </p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-700">GitHub Analysis</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{candidate.scores.github}/100</span>
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                            </div>
                          </div>
                          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{ width: `${candidate.scores.github}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {showGithubProfileLock
                              ? 'GitHub analysis is still pending.'
                              : 'GitHub score is calculated from repository confidence, activity, and quality indicators.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Strengths & Areas for Development */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <TrendingUp className="w-5 h-5 text-emerald-600" />
                          <h3 className="text-[#111827]">Key Strengths</h3>
                        </div>
                        <ul className="space-y-2">
                          {(strengths.length > 0 ? strengths : ['No verified strengths available from current data.']).map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                          <h3 className="text-[#111827]">Development Areas</h3>
                        </div>
                        <ul className="space-y-2">
                          {(developmentAreas.length > 0 ? developmentAreas : ['No material development risks were detected from current data.']).map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-amber-100 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Final Recommendation */}
                    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                      <h3 className="text-[#111827] mb-3">Final Recommendation</h3>
                      <p className="text-sm text-gray-700 leading-relaxed mb-4">
                        This recommendation is generated from current pipeline outcomes and score signals for {candidate.name}. Pre-score is {formatScore(scoreBreakdown?.pre_score_final ?? scoreBreakdown?.match_score, 0)}%, assessment is {formatScore(candidate.scores.assessment, 0)}%, AI interview is {formatInterviewScore(candidate.scores.aiInterview)}/10, and GitHub is {showGithubProfileLock ? 'pending' : formatScore(displayGithubScore, 0)}.
                      </p>
                      {recommendationReasons.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm text-gray-700 mb-2"><strong>Top score reasons:</strong></p>
                          <ul className="space-y-1">
                            {recommendationReasons.map((reason, idx) => (
                              <li key={idx} className="text-sm text-gray-700">• {reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-sm text-gray-700 leading-relaxed">
                        <strong>Recommendation:</strong>{' '}
                        {Number(scoreBreakdown?.pre_score_final ?? scoreBreakdown?.match_score ?? 0) >= 75
                          ? 'Proceed to offer discussion, subject to final recruiter confirmation.'
                          : Number(scoreBreakdown?.pre_score_final ?? scoreBreakdown?.match_score ?? 0) >= 60
                            ? 'Proceed with caution and collect additional evaluation evidence before offer.'
                            : 'Do not advance without a detailed manual review of weak scoring areas.'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>


        {/* Live Interview Transcript Modal */}
        <Dialog open={showLiveInterviewTranscript} onOpenChange={setShowLiveInterviewTranscript}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">Live Interview Transcript</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              {/* Metadata Card */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-indigo-700 mb-1">Candidate</div>
                    <div className="font-semibold text-indigo-900">{candidate.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-indigo-700 mb-1">Date</div>
                    <div className="font-semibold text-indigo-900">{liveInterviewData.completedAt}</div>
                  </div>
                  <div>
                    <div className="text-sm text-indigo-700 mb-1">Duration</div>
                    <div className="font-semibold text-indigo-900">{liveInterviewData.duration}</div>
                  </div>
                  <div>
                    <div className="text-sm text-indigo-700 mb-1">Scores</div>
                    <div className="font-semibold text-indigo-900">
                      Confidence: {liveInterviewData.overallConfidence}% | Correctness: {liveInterviewData.overallCorrectness}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Transcript Content */}
              <div className="bg-white border border-[#e5e7eb] rounded-xl p-6">
                <h4 className="font-semibold text-gray-900 mb-4 text-lg">Full Transcript</h4>
                <div className="space-y-4 text-gray-700 leading-relaxed">
                  {String(liveInterviewData.transcript || '').split('\n\n').map((paragraph: string, i: number) => {
                    const lines = String(paragraph || '').split('\n');
                    return (
                      <div key={i} className="space-y-2">
                        {lines.map((line: string, j: number) => {
                          if (line.startsWith('Interviewer:')) {
                            return (
                              <p key={j} className="font-semibold text-indigo-600">
                                {line}
                              </p>
                            );
                          } else if (line.startsWith('Candidate:')) {
                            return (
                              <p key={j} className="font-semibold text-emerald-600">
                                {line}
                              </p>
                            );
                          } else if (line.trim()) {
                            return (
                              <p key={j} className="text-gray-700 ml-4">
                                {line}
                              </p>
                            );
                          }
                          return null;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* GitHub Assigned Questions Modal */}
        <Dialog open={showGithubAssignedQuestions} onOpenChange={setShowGithubAssignedQuestions}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Assigned GitHub Questions</DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div className="rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-[11px] text-[#6b7280]">Session</div>
                    <div className="text-sm font-semibold text-[#111827]">{githubAssignmentSessionShort}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#6b7280]">GitHub Assigned</div>
                    <div className="text-sm font-semibold text-[#111827]">{githubAssignedCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#6b7280]">Assessment Status</div>
                    <div className="text-sm font-semibold text-[#111827]">{githubAssignedStats?.assessmentStatus || 'N/A'}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setGithubQuestionTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${githubQuestionTypeFilter === 'all' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]'}`}
                >
                  All ({githubAssignedQuestionList.length})
                </button>
                <button
                  onClick={() => setGithubQuestionTypeFilter('mcq')}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${githubQuestionTypeFilter === 'mcq' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]'}`}
                >
                  MCQ
                </button>
                <button
                  onClick={() => setGithubQuestionTypeFilter('essay')}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${githubQuestionTypeFilter === 'essay' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]'}`}
                >
                  Essay
                </button>
                <button
                  onClick={() => setGithubQuestionTypeFilter('coding')}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${githubQuestionTypeFilter === 'coding' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]'}`}
                >
                  Coding
                </button>
              </div>

              {filteredGithubAssignedQuestionList.length > 0 ? (
                <div className="space-y-3">
                  {filteredGithubAssignedQuestionList.map((q: any, idx: number) => (
                    <div key={q.assignmentId || idx} className="rounded-lg border border-[#e5e7eb] p-4">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="text-sm font-medium text-[#111827]">
                          Q{q.order || idx + 1} • {(q.questionType || 'essay').toUpperCase()}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <div className="text-xs px-2 py-1 rounded-full border border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]">
                            Repo: {getRepoNameFromQuestion(q)}
                          </div>
                          <div className="text-xs px-2 py-1 rounded-full border border-[#e5e7eb] bg-[#fafafa] text-[#374151]">
                            {q.points || 10} pts
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-[#374151] whitespace-pre-wrap">{q.questionText || 'No question text available.'}</p>
                      {q?.sourceFile && (
                        <p className="mt-2 text-[11px] text-[#6b7280]">Source file: {q.sourceFile}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-[#e5e7eb] p-4 text-sm text-[#6b7280]">
                  No questions found for the selected filter.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {showGithubProfileLock && activeTab === 'github' && (
        <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-[620px] rounded-2xl border border-[#e5e7eb] bg-white shadow-2xl p-8 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#eef2ff] flex items-center justify-center">
              <Lock size={24} className="text-[#4f46e5]" />
            </div>
            <h3 className="text-[#111827] text-[20px] font-['Arimo',sans-serif] mb-2">GitHub Analysis In Progress</h3>
            <p className="text-[#6b7280] text-[14px] font-['Arimo',sans-serif] mb-6">
              This candidate profile is locked until GitHub analysis finishes. Generated questions will be routed into the technical assessment.
            </p>
            <div className="flex items-center justify-center">
              <button
                onClick={() => window.location.reload()}
                className="h-[40px] px-5 rounded-[10px] border border-[#d1d5db] bg-white hover:bg-[#f9fafb] text-[13px]"
              >
                Refresh Status
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
