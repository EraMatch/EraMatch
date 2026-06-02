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

export function CandidateProfile({ candidateId, applicationId, onBack, showFinalReport = false, initialTab, rail }: CandidateProfileProps) {
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
    { id: 'final-report', label: 'Final Report', icon: CheckCircle, locked: !areAllStagesCompleted() }
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
    status: areAllStagesCompleted() ? pipelineStatus.finalDecision?.status || 'not-started' : 'not-started',
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
  if (scoreBreakdown?.semantic_fit_score != null) strengths.push(`Strong semantic fit (${formatScore(scoreBreakdown.semantic_fit_score, 1)})`);
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
        <div className="h-full w-full overflow-auto bg-[#f9fafb] relative">
      <div className="max-w-[1400px] mx-auto px-[48px] py-[24px]">
        {/* Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back</span>
        </button>

        {/* Profile Header */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-8 mb-6">
          <div className="flex items-start gap-6">
              <div className="w-[100px] h-[100px] rounded-[16px] bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-[36px]">
              {String(candidate.name || '').split(' ').map((n: string) => (n ? n[0] : '')).join('')}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-[#111827] mb-1">{candidate.name}</h1>
                  <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280] mb-3">
                    {candidate.title}
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-[#6b7280]">
                      <Mail size={16} />
                      <span className="font-['Arimo',sans-serif] text-[14px]">{candidate.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#6b7280]">
                      <Phone size={16} />
                      <span className="font-['Arimo',sans-serif] text-[14px]">{candidate.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#6b7280]">
                      <MapPin size={16} />
                      <span className="font-['Arimo',sans-serif] text-[14px]">{candidate.location}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!assignedGroupId) return;
                      navigate(`/recruiter/group/${encodeURIComponent(String(assignedGroupId))}`);
                    }}
                    disabled={!assignedGroupId}
                    title={assignedGroupId ? `Open ${assignedGroupName || 'assigned group'}` : 'Candidate is not assigned to a group yet'}
                    className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] border border-[#c7d2fe] bg-[#eef2ff] hover:bg-[#e0e7ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#3730a3]">
                      View Assigned Group
                    </span>
                  </button>
                  <button
                    onClick={handleReanalyzeGitHub}
                    disabled={!candidate?.github_url || githubReanalysisLoading}
                    title={candidate?.github_url ? 'Reanalyze GitHub profile' : 'Candidate does not have a GitHub profile'}
                    className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] border border-[#dbeafe] bg-[#f0f9ff] hover:bg-[#e0f2fe] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#0369a1]">
                      {githubReanalysisLoading ? 'Reanalyzing...' : 'Reanalyze GitHub'}
                    </span>
                  </button>
                  <button
                    onClick={handleResetAssessmentTrial}
                    disabled={!resolvedApplicationId || assessmentResetLoading}
                    className="flex items-center gap-2 h-[40px] px-[14px] rounded-[8px] border border-[#fecaca] bg-[#fff1f2] hover:bg-[#ffe4e6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#b91c1c]">
                      {assessmentResetLoading ? 'Resetting...' : 'Reset Trial'}
                    </span>
                  </button>
                  <button 
                    onClick={() => {
                      const resumeUrl = resolveBackendMediaUrl(candidate.resumeUrl);
                      if (resumeUrl) {
                        window.open(resumeUrl, '_blank');
                      } else {
                        alert("No resume available for download.");
                      }
                    }}
                    className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
                  >
                    <Download size={16} className="text-[#6b7280]" />
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                      Download Resume
                    </span>
                  </button>
                </div>
              </div>

              {assessmentResetMessage && (
                <div className="mb-4 rounded-[8px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#166534]">{assessmentResetMessage}</p>
                </div>
              )}
              {assessmentResetError && (
                <div className="mb-4 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2">
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#b91c1c]">{assessmentResetError}</p>
                </div>
              )}
              {githubReanalysisMessage && (
                <div className="mb-4 rounded-[8px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#166534]">{githubReanalysisMessage}</p>
                </div>
              )}
              {githubReanalysisError && (
                <div className="mb-4 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2">
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#b91c1c]">{githubReanalysisError}</p>
                </div>
              )}

              {/* Scores */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Overall Score</div>
                  <div className="text-[24px] text-[#111827]">{formatScore(displayOverallScore, 1)}</div>
                </div>
                
                {activeFlow.includes('assessment') && (
                  <div
                    onClick={() => handleStageClick('assessment')}
                    className={`rounded-[8px] p-4 cursor-pointer transition-all hover:shadow-md active:scale-95 ${tabs.find(t => t.id === 'assessment')?.locked ? 'bg-gray-50 opacity-50 cursor-not-allowed' : 'bg-[#f4f7ff] hover:bg-[#ebf0ff] border border-indigo-100'
                      }`}
                  >
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1 flex items-center justify-between">
                      Assessment
                      {!tabs.find(t => t.id === 'assessment')?.locked && <Eye size={12} className="text-indigo-400" />}
                    </div>
                    <div className="text-[24px] text-[#111827]">{formatScore(displayAssessmentScore, 1)}</div>
                  </div>
                )}
                
                {(activeFlow.includes('ai_interview') || activeFlow.includes('ai-interview') || activeFlow.includes('aiInterview')) && (
                  <div
                    onClick={() => handleStageClick('aiInterview')}
                    className={`rounded-[8px] p-4 cursor-pointer transition-all hover:shadow-md active:scale-95 ${tabs.find(t => t.id === 'interview')?.locked ? 'bg-gray-50 opacity-50 cursor-not-allowed' : 'bg-[#f4f7ff] hover:bg-[#ebf0ff] border border-indigo-100'
                      }`}
                  >
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1 flex items-center justify-between">
                      AI Interview
                      {!tabs.find(t => t.id === 'interview')?.locked && <Eye size={12} className="text-indigo-400" />}
                    </div>
                    <div className="text-[24px] text-[#111827]">{formatScore(displayAIInterviewScore, 1)}</div>
                  </div>
                )}
                
                {(activeFlow.includes('live_interview') || activeFlow.includes('live-interview') || activeFlow.includes('liveInterview')) && (
                  <div
                    onClick={() => handleStageClick('liveInterview')}
                    className={`rounded-[8px] p-4 cursor-pointer transition-all hover:shadow-md active:scale-95 ${tabs.find(t => t.id === 'live-interview')?.locked ? 'bg-gray-50 opacity-50 cursor-not-allowed' : 'bg-[#f4f7ff] hover:bg-[#ebf0ff] border border-indigo-100'
                      }`}
                  >
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1 flex items-center justify-between">
                      Live Interview
                      {!tabs.find(t => t.id === 'live-interview')?.locked && <Eye size={12} className="text-indigo-400" />}
                    </div>
                    <div className="text-[24px] text-[#111827]">
                      {pipelineStatus.liveInterview?.status === 'completed' ? 'Done' : 'Pending'}
                    </div>
                  </div>
                )}
                
                <div
                  onClick={() => handleStageClick('github')}
                  className="bg-[#f9fafb] rounded-[8px] p-4 cursor-pointer transition-all hover:bg-[#f3f4f6] hover:shadow-md active:scale-95 border border-transparent hover:border-gray-200"
                >
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1 flex items-center justify-between">
                    GitHub
                    <Eye size={12} className="text-gray-400" />
                  </div>
                  <div className="text-[24px] text-[#111827]">{showGithubProfileLock ? 'Pending' : formatScore(displayGithubScore, 1)}</div>
                </div>
              </div>

              {candidate.antiCheating && (
                <div className="mt-4 flex items-center gap-2 px-[16px] py-[10px] bg-[#fef2f2] border border-[#fecaca] rounded-[8px]">
                  <AlertTriangle size={18} className="text-[#ef4444]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#ef4444]">
                    Anti-cheating flag detected
                  </span>
                </div>
              )}
            </div>
          </div>
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
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
          <div className="border-b border-[#e5e7eb] px-6">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.locked) return;
                      setActiveTab(tab.id as TabType);
                    }}
                    title={tab.locked ? 'This stage has not been reached yet' : undefined}
                    className={`flex items-center gap-2 px-[20px] py-[14px] font-['Arimo',sans-serif] text-[14px] border-b-2 transition-colors whitespace-nowrap ${tab.locked
                      ? 'border-transparent text-[#d1d5db] cursor-not-allowed'
                      : activeTab === tab.id
                        ? 'border-[#6366f1] text-[#6366f1]'
                        : 'border-transparent text-[#6b7280] hover:text-[#111827]'
                      }`}
                  >
                    {tab.locked ? <Lock size={14} className="text-[#d1d5db]" /> : <Icon size={16} />}
                    {tab.label}
                    {tab.locked && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded ml-1">Pending</span>}
                  </button>
                );
              })}
            </div>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="bg-[#f9fafb] rounded-[8px] p-3">
                            <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Final Pre-Score</p>
                            <p className="font-['Arimo',sans-serif] text-[18px] text-[#111827]">{formatScore(scoreBreakdown.pre_score_final ?? scoreBreakdown.match_score, 1)}</p>
                          </div>
                          <div className="bg-[#f9fafb] rounded-[8px] p-3">
                            <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Semantic Fit</p>
                            <p className="font-['Arimo',sans-serif] text-[18px] text-[#111827]">{formatScore(scoreBreakdown.semantic_fit_score, 1)}</p>
                          </div>
                          <div className="bg-[#f9fafb] rounded-[8px] p-3">
                            <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Skills + Experience</p>
                            <p className="font-['Arimo',sans-serif] text-[18px] text-[#111827]">{formatScore(scoreBreakdown.skills_experience_score, 1)}</p>
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
                        <div className="absolute top-6 left-0 right-0 h-1 bg-gray-200" style={{ zIndex: 0 }}>
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
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border-4 transition-all duration-300 ${stage.status === 'completed'
                                    ? 'bg-emerald-500 border-emerald-200 group-hover:scale-110 group-hover:shadow-lg'
                                    : stage.status === 'in-progress'
                                      ? 'bg-indigo-500 border-indigo-200 group-hover:scale-110 group-hover:shadow-lg'
                                      : 'bg-gray-300 border-gray-200'
                                  }`}>
                                  <Icon size={24} className={stage.status === 'completed' ? 'text-white' : stage.status === 'in-progress' ? 'text-white animate-pulse' : 'text-gray-500'} />
                                </div>
                                <div className="text-center">
                                  <div className={`font-['Arimo',sans-serif] text-[12px] font-semibold mb-1 transition-colors ${isClickable ? 'text-[#111827] group-hover:text-indigo-600' : 'text-[#9ca3af]'
                                    }`}>
                                    {stage.label}
                                  </div>
                                  {stage.completedAt && (
                                    <div className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280]">
                                      {stage.completedAt}
                                    </div>
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
                        className="px-[16px] py-[8px] bg-[#ede9fe] text-[#6366f1] rounded-[8px] font-['Arimo',sans-serif] text-[14px]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Work Experience</h3>
                  <div className="space-y-4">
                    {candidate.workHistory.map((job: any, i: number) => (
                      <div key={i} className="border-l-2 border-[#6366f1] pl-4">
                        <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827] mb-1">
                          {job.title}
                        </div>
                        <div className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-2">
                          {job.company} • {job.duration}
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                          {job.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Education</h3>
                  <div className="space-y-3">
                    {candidate.education.map((edu: any, i: number) => (
                      <div key={i}>
                        <div className="font-['Arimo',sans-serif] text-[15px] text-[#111827]">
                          {edu.degree}
                        </div>
                        <div className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {edu.school} • {edu.year}
                        </div>
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

              </div>
            )}

            {activeTab === 'assessment' && (
              <div className="space-y-6">
                {/* Score Card */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="text-indigo-900 font-semibold mb-2">Assessment Score</h4>
                      <p className="text-sm text-indigo-700">
                        {assessmentData.questionsCorrect} out of {assessmentData.questionsTotal} questions correct
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-5xl font-bold text-indigo-600 mb-1">{candidate.scores.assessment}</div>
                      <div className="text-sm text-indigo-700">/ 100</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Completed</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {assessmentData.completedAt}
                    </div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Duration</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {assessmentData.duration}
                    </div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Score</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {assessmentData.questionsCorrect}/{assessmentData.questionsTotal}
                    </div>
                  </div>
                </div>

                {/* View Details Button */}
                <Button
                  onClick={() => setShowAssessmentDetails(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-6 flex items-center justify-center gap-2"
                >
                  <FileCheck size={20} />
                  View Questions & Answers
                </Button>

                <div>
                  <h3 className="text-[#111827] mb-4">Topic Scores</h3>
                  <div className="space-y-3">
                    {assessmentData.topicScores.map((topic: any, i: number) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                            {topic.topic}
                          </span>
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {topic.score}%
                          </span>
                        </div>
                        <div className="w-full h-[8px] bg-[#e5e7eb] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#6366f1] rounded-full"
                            style={{ width: `${topic.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'integrity' && (
              <IntegrityTabContent candidate={candidate} />
            )}

            {activeTab === 'interview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Completed</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {interviewData.completedAt}
                    </div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Duration</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {interviewData.duration}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Video Responses</h3>
                  <div className="space-y-4">
                    {videoInterviewQuestions.map((q: any, i: number) => (
                      <div key={i} className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
                              Q{i + 1}: {q.question}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-[#6b7280]">
                              <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {q.duration}
                              </span>
                              <span className="font-['Arimo',sans-serif] text-[#6366f1]">
                                Score: {q.score}/10
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            onClick={() => setShowVideoResponse(q.id)}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-3 flex items-center justify-center gap-2"
                          >
                            <Play size={16} />
                            View Video Response
                          </Button>
                          <Button
                            onClick={() => setShowVideoTranscript(q.id)}
                            variant="outline"
                            className="flex-1 border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded-lg py-3 flex items-center justify-center gap-2"
                          >
                            <MessageCircle size={16} />
                            View Transcript
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-3">Overall Feedback</h3>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                      {interviewData.overallFeedback}
                    </p>
                  </div>
                </div>
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

            {activeTab === 'github' && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="text-5xl mb-4">📂</div>
                <p className="text-lg font-medium text-slate-300">GitHub analysis not available</p>
              </div>
            )}

            {activeTab === 'notes' && (
              <div>
                <h3 className="text-[#111827] mb-4">Recruiter Notes</h3>
                <textarea
                  placeholder="Add notes about this candidate..."
                  rows={10}
                  className="w-full px-[16px] py-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <button className="mt-4 h-[40px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors">
                  Save Notes
                </button>
              </div>
            )}

            {activeTab === 'final-report' && (
              <div className="space-y-6">
                {pipelineStatus.finalDecision?.status !== 'completed' ? (
                  /* ── Pipeline not finished yet — show pending state ── */
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
                        This recommendation is generated from current pipeline outcomes and score signals for {candidate.name}. Pre-score is {formatScore(scoreBreakdown?.pre_score_final ?? scoreBreakdown?.match_score, 1)}, assessment is {formatScore(candidate.scores.assessment, 1)}, AI interview is {formatScore(candidate.scores.aiInterview, 1)}, and GitHub is {showGithubProfileLock ? 'pending' : formatScore(displayGithubScore, 1)}.
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

        {/* Assessment Details Modal */}
        <Dialog open={showAssessmentDetails} onOpenChange={setShowAssessmentDetails}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">Assessment Questions & Answers</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 mt-4">
              {assessmentQuestions.map((q: any, i: number) => (
                <div key={q.id} className="border border-[#e5e7eb] rounded-lg p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                          Q{i + 1}
                        </span>
                        <span className="text-sm text-gray-500">{q.topic || q.questionType || 'Assessment'}</span>
                      </div>
                      <h4 className="text-lg font-medium text-gray-900 mb-3">{q.question}</h4>
                    </div>
                    {q.isCorrect === true ? (
                      <CheckCircle size={24} className="text-emerald-600 flex-shrink-0" />
                    ) : q.isCorrect === false && (q.questionType || '').toLowerCase() !== 'essay' ? (
                      <XCircle size={24} className="text-red-600 flex-shrink-0" />
                    ) : null}
                  </div>

                  {(() => {
                    const qType = (q.questionType || '').toLowerCase();
                    const raw = q.answer;

                    // Render simple markdown: **bold**, \n\n paragraphs
                    const renderMarkdown = (text: string) => {
                      const paragraphs = text.split(/\n\n+/);
                      return (
                        <div className="space-y-2">
                          {paragraphs.map((para, pi) => {
                            const parts = para.split(/\*\*([^*]+)\*\*/g);
                            return (
                              <p key={pi} className="text-sm leading-relaxed">
                                {parts.map((part, ji) =>
                                  ji % 2 === 1 ? <strong key={ji}>{part}</strong> : part
                                )}
                              </p>
                            );
                          })}
                        </div>
                      );
                    };

                    // Resolve selected index (MCQ)
                    const selectedIdx = raw != null && typeof raw === 'object'
                      ? (raw.selected_index ?? raw.selected_option ?? raw.selected_value ?? null)
                      : (q.selected ?? null);

                    // Resolve option text — options are plain strings or objects
                    const resolveOption = (opts: any[], idx: number): string => {
                      const opt = opts[idx];
                      if (opt == null) return `Option ${idx + 1}`;
                      return typeof opt === 'object' ? (opt.text || opt.label || String(idx + 1)) : String(opt);
                    };

                    // Candidate answer
                    let candidateAnswerText = '';
                    let aiScore: number | null = null;
                    let aiFeedback: string | null = null;
                    if (raw === null || raw === undefined) {
                      candidateAnswerText = 'No answer submitted';
                    } else if (qType === 'mcq') {
                      if (selectedIdx !== null && Array.isArray(q.options) && q.options[selectedIdx] != null) {
                        candidateAnswerText = resolveOption(q.options, Number(selectedIdx));
                      } else if (selectedIdx !== null) {
                        candidateAnswerText = `Option ${Number(selectedIdx) + 1}`;
                      } else {
                        candidateAnswerText = 'N/A';
                      }
                    } else if (typeof raw === 'object') {
                      candidateAnswerText = raw.text || raw.answer || raw.response || '';
                      if (raw.ai_score != null) aiScore = raw.ai_score;
                      if (raw.ai_feedback) aiFeedback = raw.ai_feedback;
                    } else {
                      candidateAnswerText = String(raw);
                    }

                    // Correct answer
                    let correctAnswerText = '';
                    if (q.referenceAnswer) {
                      correctAnswerText = q.referenceAnswer;
                    } else if (q.correctIndex != null && Array.isArray(q.options) && q.options[q.correctIndex] != null) {
                      correctAnswerText = resolveOption(q.options, Number(q.correctIndex));
                    } else {
                      correctAnswerText = qType === 'essay' ? 'Open-ended — evaluated by AI rubric' : 'N/A';
                    }

                    return (
                      <div className="space-y-3">
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                          <div className="text-sm font-medium text-blue-900 mb-2">Candidate's Answer</div>
                          <div className="text-sm text-blue-800 whitespace-pre-wrap">{candidateAnswerText}</div>
                        </div>

                        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded">
                          <div className="text-sm font-medium text-emerald-900 mb-2">Correct Answer</div>
                          <div className="text-sm text-emerald-800">{correctAnswerText}</div>
                        </div>

                        {aiFeedback && (
                          <div className="bg-violet-50 border-l-4 border-violet-400 p-4 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium text-violet-900">AI Feedback</div>
                              {aiScore !== null && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-200 text-violet-800">
                                  Score: {aiScore}/100
                                </span>
                              )}
                            </div>
                            <div className="text-violet-800">{renderMarkdown(aiFeedback)}</div>
                          </div>
                        )}

                        {q.rubric && (
                          <div className="bg-gray-50 border-l-4 border-gray-300 p-4 rounded">
                            <div className="text-sm font-medium text-gray-700 mb-1">Rubric</div>
                            <div className="text-sm text-gray-600 whitespace-pre-wrap">{q.rubric}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Video Response Modal */}
        <Dialog open={showVideoResponse !== null} onOpenChange={() => setShowVideoResponse(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Video Response</DialogTitle>
            </DialogHeader>
            {showVideoResponse && videoInterviewQuestions.find((q: any) => q.id === showVideoResponse) && (
              <div className="mt-4">
                {resolveBackendMediaUrl(videoInterviewQuestions.find((q: any) => q.id === showVideoResponse)?.videoUrl) ? (
                  <video 
                    controls
                    className="w-full rounded-lg aspect-video mb-4 bg-black"
                    src={resolveBackendMediaUrl(videoInterviewQuestions.find((q: any) => q.id === showVideoResponse)?.videoUrl)}
                  />
                ) : (
                  <div className="bg-gray-100 rounded-lg aspect-video flex items-center justify-center mb-4">
                    <div className="text-center">
                      <Play size={64} className="text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600">Video Not Available</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Duration: {videoInterviewQuestions.find((q: any) => q.id === showVideoResponse)?.duration}
                      </p>
                    </div>
                  </div>
                )}
                {(() => {
                  const vq = videoInterviewQuestions.find((q: any) => q.id === showVideoResponse);
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                          <div className="text-sm text-indigo-700 font-medium">Score</div>
                          <div className="text-2xl font-bold text-indigo-900">{formatInterviewScore(vq?.score)}/10</div>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="text-sm text-gray-700 font-medium">Duration</div>
                          <div className="text-2xl font-bold text-gray-900">{vq?.duration}</div>
                        </div>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-3">
                        <h4 className="font-medium text-indigo-900 mb-2">Question</h4>
                        <p className="text-indigo-800">{vq?.question}</p>
                      </div>
                      {/* Criteria breakdown (G-eval) or fallback feedback */}
                      {vq?.criteriaScores?.length
                        ? <CriteriaBreakdown criteriaScores={vq.criteriaScores} />
                        : vq?.feedback
                          ? (
                            <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                              <div className="text-sm font-medium text-violet-900 mb-1">AI Feedback</div>
                              <div className="text-sm text-violet-800">{vq.feedback}</div>
                            </div>
                          )
                          : null
                      }
                    </>
                  );
                })()}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Video Transcript Modal */}
        <Dialog open={showVideoTranscript !== null} onOpenChange={() => setShowVideoTranscript(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Video Response Transcript</DialogTitle>
            </DialogHeader>
            {showVideoTranscript && videoInterviewQuestions.find((q: any) => q.id === showVideoTranscript) && (
              <div className="mt-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                  <h4 className="font-medium text-indigo-900 mb-2">Question</h4>
                  <p className="text-indigo-800">{videoInterviewQuestions.find((q: any) => q.id === showVideoTranscript)?.question}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-3">Transcript</h4>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {videoInterviewQuestions.find((q: any) => q.id === showVideoTranscript)?.transcript}
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

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
