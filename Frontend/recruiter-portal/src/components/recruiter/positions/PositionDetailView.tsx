import { ChevronLeft, Pencil, Filter, ArrowUpDown, Star, Plus, Sparkles, Share2, Edit2, Trash2, Users, Download, Upload, Calendar, X, Loader2, CheckCircle, Sliders, TrendingUp, ShieldCheck, Target, Award, MapPin, Building2, Globe } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { usePositionDetail, usePositionInsights } from '../../../hooks/positions/usePositions';
import { useBackgroundTasksPolling } from '../../../hooks/backgroundTasks/useBackgroundTasks';
import { queryKeys } from '../../../lib/queryKeys';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Switch } from '../../ui/switch';
import { Question } from '../assessments/CreateAssessmentPage';
import { GroupCreationPage } from '../groups/GroupCreationPage';
import { FiltrationFlowConfigModal } from '../groups/FiltrationFlowConfigModal';
import { CandidateProfile } from '../candidates/CandidateProfile';
import { SimpleGroupCreationModal } from '../groups/SimpleGroupCreationModal';
import { CandidateFilterSidebar, CandidateFilters } from '../candidates/CandidateFilterSidebar';
import LoadingSpinner from '../../common/LoadingSpinner';
import { GroupDeleteModal } from '../groups/GroupDeleteModal';

interface Candidate {
  id: string;
  applicationId?: string;
  name: string;
  email: string;
  score: number;
  match: number;
  color: string;
  starred: boolean;
  selected: boolean;
  // New fields for filtering
  experience: number;
  location: string;
  companies: string[];
  skills: string[];
  job_titles: string[];
  degrees: string[];
  universities: string[];
  github_overall_score?: number | null;
  github_repo_confidence_score?: number | null;
  github_contribution_source?: string | null;
  github_freshness_hours?: number | null;
  github_has_fallback?: boolean;
  pre_score_final?: number | null;
  // Dual-score model: semantic = heuristic JD↔CV fit; qag = AI QAG evaluation
  semantic_score?: number | null;
  qag_score?: number | null;
}

interface Assessment {
  id: string;
  title: string;
  questions: Question[];
  createdAt: Date;
}

interface QAGQuestion {
  id: number;
  question: string;
  category?: string;
  weight?: number;
  approved?: boolean;
}

interface PositionDetailViewProps {
  positionId: string;
  positionTitle: string;
  projectTitle: string;
  description?: string;
  screeningConditions?: string;
  isOpen?: boolean;
  onBack: () => void;
  onSave: (title: string, description: string, screening: string, isOpen: boolean) => void | Promise<void>;
  onCreateAssessment: () => void;
  onSaveAssessment?: (assessment: Assessment) => void;
  savedAssessments?: Assessment[];
  onViewDashboard?: () => void;
  onViewGroup?: (groupId: string) => void;
  initialActiveTab?: 'candidates' | 'groups' | 'insights';
  positionStatus?: string;
}

const PREVIEW_SECTION_LABELS = [
  'Job Title:',
  'Location:',
  'Department:',
  'Reports to:',
  'Role Summary:',
  'Key Responsibilities:',
  'Technical Requirements:',
  'Frameworks:',
  'Infrastructure:',
  'Cloud:',
  'Qualifications:',
  'Education:',
  'Experience:',
  'Contributions:',
  'Soft Skills:',
  'Ethical Mindset:',
  'Agility:',
  'Communication:'
];

const DESCRIPTION_COLLAPSE_CHAR_LIMIT = 520;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePreviewText = (value?: string, splitBySections = false) => {
  if (!value || !value.trim()) {
    return '';
  }

  let normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/:\s*(?=[A-Za-z])/g, ': ')
    .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (splitBySections) {
    const labelsPattern = new RegExp(`\\s*(${PREVIEW_SECTION_LABELS.map(escapeRegExp).join('|')})\\s*`, 'gi');
    normalized = normalized.replace(labelsPattern, '\n$1 ');
  }

  return normalized.replace(/\n{3,}/g, '\n\n').trim();
};

const getCollapsedPreview = (value: string, limit = DESCRIPTION_COLLAPSE_CHAR_LIMIT) => {
  if (!value || value.length <= limit) {
    return { text: value, truncated: false };
  }

  const truncated = value.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(' ');
  const safeCut = lastSpace > Math.floor(limit * 0.7) ? truncated.slice(0, lastSpace) : truncated;

  return {
    text: `${safeCut.trimEnd()}...`,
    truncated: true
  };
};

const normalizePercentValue = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return value <= 1 ? value * 100 : value;
};

const hasAnyKeywords = (keywords?: Record<string, string[]> | null) => {
  if (!keywords || typeof keywords !== 'object') {
    return false;
  }
  return Object.values(keywords).some((items) => Array.isArray(items) && items.length > 0);
};

const KEYWORD_SECTIONS: Array<{ key: string; label: string; color: string }> = [
  { key: 'technical_skills', label: 'Technical Skills', color: 'bg-[#ede9fe] text-[#5b21b6] border-[#c4b5fd]' },
  { key: 'domain_keywords', label: 'Domain', color: 'bg-[#dbeafe] text-[#1e40af] border-[#93c5fd]' },
  { key: 'soft_skills', label: 'Soft Skills', color: 'bg-[#fef3c7] text-[#92400e] border-[#fcd34d]' },
  { key: 'experience_keywords', label: 'Experience', color: 'bg-[#fce7f3] text-[#9d174d] border-[#f9a8d4]' },
  { key: 'education_keywords', label: 'Education', color: 'bg-[#ecfdf5] text-[#166534] border-[#86efac]' },
  { key: 'seniority_signals', label: 'Seniority', color: 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]' },
];

const getCandidateDisplayScore = (candidate: Candidate) => {
  if (candidate.score > 0) {
    return Math.round(candidate.score);
  }
  const preScore = normalizePercentValue(candidate.pre_score_final);
  if (preScore != null) {
    return Math.round(preScore);
  }
  return candidate.match > 0 ? Math.round(candidate.match) : null;
};

const getCandidateDisplayMatch = (candidate: Candidate) => {
  if (candidate.match > 0) {
    return Math.round(candidate.match);
  }
  const preScore = normalizePercentValue(candidate.pre_score_final);
  return preScore != null ? Math.round(preScore) : null;
};

export function PositionDetailView({
  positionId,
  positionTitle,
  projectTitle,
  description,
  screeningConditions,
  isOpen = true,
  onBack,
  onSave,
  onCreateAssessment,
  onSaveAssessment,
  savedAssessments = [],
  onViewDashboard,
  onViewGroup,
  initialActiveTab = 'candidates',
  positionStatus = 'open'
}: PositionDetailViewProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // Dual-score filters: minimum semantic (JD↔CV) and QAG (AI) thresholds.
  const [minSemantic, setMinSemantic] = useState(0);
  const [minQag, setMinQag] = useState(0);
  const [groups, setGroups] = useState<any[]>([]);
  const [archivedGroups, setArchivedGroups] = useState<any[]>([]);
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [archivedGroupsLoaded, setArchivedGroupsLoaded] = useState(false);
  const isInsightsLocked = groups.length === 0;
  const insightsLockMessage = 'Create at least one group to unlock role insights and charts.';
  const [fittingData, setFittingData] = useState<any[]>([]);
  const [scoreData, setScoreData] = useState<any[]>([]);
  const [skillDistribution, setSkillDistribution] = useState<any[]>([]);
  const [seniorityDistribution, setSeniorityDistribution] = useState<any[]>([]);
  const [universityDistribution, setUniversityDistribution] = useState<any[]>([]);
  const [availabilityDistribution, setAvailabilityDistribution] = useState<any[]>([]);
  const [conversion, setConversion] = useState<number>(0);
  const [qualityScore, setQualityScore] = useState<number>(0);
  const [integrityIssues, setIntegrityIssues] = useState<number>(0);
  const [sourceQuality, setSourceQuality] = useState<any[]>([]);
  const [topCompanies, setTopCompanies] = useState<any[]>([]);
  const queryClient = useQueryClient();
  const { data: detailData, isLoading: detailLoading } = usePositionDetail(positionId);
  const { data: insightsData, isLoading: insightsLoading } = usePositionInsights(positionId);
  const isLoading = detailLoading || insightsLoading;

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editPositionTitle, setEditPositionTitle] = useState(positionTitle);
  const [editPositionDescription, setEditPositionDescription] = useState(description || '');
  const [editPositionScreening, setEditPositionScreening] = useState(screeningConditions || '');
  const [editPositionIsOpen, setEditPositionIsOpen] = useState(isOpen);
  const [activeTab, setActiveTab] = useState<'candidates' | 'groups' | 'insights'>(initialActiveTab);
  const [showZipUploadModal, setShowZipUploadModal] = useState(false);
  const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false);
  const [showGroupCreationModal, setShowGroupCreationModal] = useState(false);
  const [showGroupCreationPage, setShowGroupCreationPage] = useState(false);
  const [showFlowConfigModal, setShowFlowConfigModal] = useState(false);
  const [pendingGroupData, setPendingGroupData] = useState<any>(null);
  const [viewingCandidateId, setViewingCandidateId] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [assessmentResetLoadingApplicationId, setAssessmentResetLoadingApplicationId] = useState<string | null>(null);
  const [assessmentResetMessage, setAssessmentResetMessage] = useState<string | null>(null);
  const [assessmentResetError, setAssessmentResetError] = useState<string | null>(null);

  // Filtering State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<CandidateFilters>({
    keywords: '',
    locations: [],
    companies: [],
    schools: [],
    experienceRange: [0, 20],
    skills: [],
    jobTitles: [],
    degrees: [],
    githubMinScore: 0,
    githubMinRepoConfidence: 0,
    githubMaxFreshnessHours: 720,
    githubContributionSources: [],
    githubFallbackOnly: false,
  });

  // Rename Group State
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const descriptionPreview = normalizePreviewText(description, true);
  const collapsedDescription = getCollapsedPreview(descriptionPreview);
  const visibleDescription = isDescriptionExpanded || !collapsedDescription.truncated
    ? descriptionPreview
    : collapsedDescription.text;
  const screeningPreview = normalizePreviewText(screeningConditions);

  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [positionId, description]);

  // Derived Filter Options
  const filterOptions = {
    locations: Array.from(new Set(candidates.map(c => c.location || 'Unknown'))).filter(Boolean).sort(),
    companies: Array.from(new Set(candidates.flatMap(c => c.companies || []))).filter(Boolean).sort(),
    schools: Array.from(new Set(candidates.flatMap(c => c.universities || []))).filter(Boolean).sort(),
    skills: Array.from(new Set(candidates.flatMap(c => c.skills || []))).filter(Boolean).sort(),
    jobTitles: Array.from(new Set(candidates.flatMap(c => c.job_titles || []))).filter(Boolean).sort(),
    degrees: Array.from(new Set(candidates.flatMap(c => c.degrees || []))).filter(Boolean).sort(),
    githubContributionSources: Array.from(new Set(candidates.map(c => c.github_contribution_source || '').filter(Boolean))).sort(),
  };

  // Filter Logic
  const filteredCandidates = candidates.filter(c => {
    // Dual-score thresholds
    if (minSemantic > 0 && (c.semantic_score ?? 0) < minSemantic) return false;
    if (minQag > 0 && (c.qag_score ?? 0) < minQag) return false;

    // Keywords (Name, Email, Job Titles, Skills)
    if (filters.keywords) {
      const term = filters.keywords.toLowerCase();
      const matchesKeyword =
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.job_titles?.some(t => t.toLowerCase().includes(term)) ||
        c.skills?.some(s => s.toLowerCase().includes(term));

      if (!matchesKeyword) return false;
    }

    // Locations
    if (filters.locations.length > 0 && !filters.locations.includes(c.location || 'Unknown')) return false;

    // Experience
    if (c.experience !== undefined) {
      const min = filters.experienceRange[0];
      const max = filters.experienceRange[1];
      if (c.experience < min) return false;
      if (max < 20 && c.experience > max) return false;
    }

    // Skills (OR logic: has at least one of selected)
    if (filters.skills.length > 0) {
      const hasSkill = c.skills?.some(s => filters.skills.includes(s));
      if (!hasSkill) return false;
    }

    // Companies
    if (filters.companies.length > 0) {
      const hasCompany = c.companies?.some(comp => filters.companies.includes(comp));
      if (!hasCompany) return false;
    }

    // Schools
    if (filters.schools.length > 0) {
      const hasSchool = c.universities?.some(u => filters.schools.includes(u));
      if (!hasSchool) return false;
    }

    // GitHub score threshold
    if (filters.githubMinScore > 0) {
      const score = c.github_overall_score ?? 0;
      if (score < filters.githubMinScore) return false;
    }

    // Repo confidence threshold (0..1)
    if (filters.githubMinRepoConfidence > 0) {
      const confidence = c.github_repo_confidence_score ?? 0;
      if (confidence < filters.githubMinRepoConfidence) return false;
    }

    // Freshness threshold (hours)
    if (filters.githubMaxFreshnessHours < 720) {
      const freshness = c.github_freshness_hours;
      if (freshness == null || freshness > filters.githubMaxFreshnessHours) return false;
    }

    // Contribution sources
    if (filters.githubContributionSources.length > 0) {
      const source = c.github_contribution_source || '';
      if (!filters.githubContributionSources.includes(source)) return false;
    }

    // Fallback-only
    if (filters.githubFallbackOnly && !c.github_has_fallback) return false;

    return true;
  });

  // Assessment management - use savedAssessments from props
  const assessments = savedAssessments;

  const [isGroupDeleteModalOpen, setIsGroupDeleteModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<any>(null);

  useEffect(() => {
    if (!detailData) return;
    const d = detailData as any;
    setCandidates(d.candidates || []);
    setGroups(d.groups || []);
    const kw = d.jd_keywords && typeof d.jd_keywords === 'object'
      ? d.jd_keywords as Record<string, string[]>
      : null;
    setJdKeywords(kw);
    setKeywordsVisible(hasAnyKeywords(kw));
  }, [detailData]);

  // ── Scoring progress tracking ────────────────────────────────────────────
  // lastUploadAt: set on upload, drives polling for 8 min regardless of DB state.
  // bgPendingCount: from background-tasks, non-zero while DB has unscored applications.
  // Both independently trigger auto-refetch so the list updates without manual refresh.
  const [lastUploadAt, setLastUploadAt] = useState<number | null>(null);

  const { data: bgTasks } = useBackgroundTasksPolling(true);
  const bgPendingCount = (() => {
    if (!Array.isArray(bgTasks) || !positionId) return 0;
    const positionJobs = bgTasks.filter(
      (t: any) => t.task_category === 'cv_ingestion' && t.position_id === positionId
    );
    if (positionJobs.length === 0) return 0;
    return Number(positionJobs[0]?.pending_count ?? 0);
  })();

  const UPLOAD_POLL_WINDOW_MS = 8 * 60 * 1000; // 8 min after upload
  const isRecentUpload = lastUploadAt != null && (Date.now() - lastUploadAt) < UPLOAD_POLL_WINDOW_MS;

  // shouldPoll = recent upload OR DB still has unscored candidates
  const shouldPoll = isRecentUpload || bgPendingCount > 0;

  // Count from visible candidates — always accurate to what the user sees
  const scoredCandidateCount = candidates.filter((c: any) => (c.score ?? 0) > 0 || (c.match ?? 0) > 0).length;
  const totalCandidateCount = candidates.length;

  // Show the chip: processing started (shouldPoll) and we have candidates to display, OR some are still N/A
  const unscoredVisible = totalCandidateCount > 0 && scoredCandidateCount < totalCandidateCount;
  const showScoringChip = shouldPoll && (totalCandidateCount > 0 || isRecentUpload);

  // Auto-refetch position detail the whole time — picks up new candidates + score updates
  useEffect(() => {
    if (!shouldPoll || !positionId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
    }, 5000);
    return () => clearInterval(interval);
  }, [shouldPoll, positionId, queryClient]);

  // Stop the recent-upload window if all candidates are scored (no more work to do)
  useEffect(() => {
    if (isRecentUpload && totalCandidateCount > 0 && !unscoredVisible && bgPendingCount === 0) {
      setLastUploadAt(null);
    }
  }, [isRecentUpload, totalCandidateCount, unscoredVisible, bgPendingCount]);

  useEffect(() => {
    if (!insightsData) return;
    const i = insightsData as any;
    setFittingData(i.fittingData || []);
    setScoreData(i.scoreData || []);
    setSkillDistribution(i.skillDistribution || []);
    setSeniorityDistribution(i.seniorityDistribution || []);
    setUniversityDistribution(i.universityDistribution || []);
    setAvailabilityDistribution(i.availabilityDistribution || []);
    setConversion(i.conversion || 0);
    setQualityScore(i.qualityScore || 0);
    setIntegrityIssues(i.integrityIssues || 0);
    setSourceQuality(i.sourceQuality || []);
    setTopCompanies(i.topCompanies || []);
  }, [insightsData]);

  // Auth / Role Check
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = String(user.role || '').toLowerCase();
  const isHR = userRole === 'hr' || userRole === 'admin';
  const canManageQAG = userRole === 'technical' || userRole === 'admin';
  const isUnderReview = positionStatus === 'pending' || positionStatus === 'technical_review';
  const canUseCandidateActions = !isUnderReview;
  const navigate = useNavigate();

  // Upload Logic
  const [zipFiles, setZipFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isRecomputingScores, setIsRecomputingScores] = useState(false);
  const [recomputeMessage, setRecomputeMessage] = useState<string | null>(null);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [isQagDialogOpen, setIsQagDialogOpen] = useState(false);
  const [qagLoading, setQagLoading] = useState(false);
  const [qagSaving, setQagSaving] = useState(false);
  const [qagApproving, setQagApproving] = useState(false);
  const [qagQuestions, setQagQuestions] = useState<QAGQuestion[]>([]);
  const [qagStatus, setQagStatus] = useState<string | null>(null);
  const [qagMessage, setQagMessage] = useState<string | null>(null);
  const [qagError, setQagError] = useState<string | null>(null);

  // JD Keywords state
  const [jdKeywords, setJdKeywords] = useState<Record<string, string[]> | null>(null);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [isSavingKeywords, setIsSavingKeywords] = useState(false);
  const [keywordsMessage, setKeywordsMessage] = useState<string | null>(null);
  const [keywordsError, setKeywordsError] = useState<string | null>(null);
  const [keywordsVisible, setKeywordsVisible] = useState(false);
  const [newKeywordInputs, setNewKeywordInputs] = useState<Record<string, string>>({});
  const [expandedKeywordSections, setExpandedKeywordSections] = useState<Record<string, boolean>>({ technical_skills: true });

  useEffect(() => {
    setExpandedKeywordSections({ technical_skills: true });
  }, [positionId]);

  // Google Drive Scheduler State
  const [driveFolderUrl, setDriveFolderUrl] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [frequencyDays, setFrequencyDays] = useState<number>(0);
  const [frequencyHours, setFrequencyHours] = useState<number>(0);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [driveModalStep, setDriveModalStep] = useState<1 | 2>(1);

  const extractDriveFolderId = (url: string) => {
    const match = url.match(/[-\w]{25,-}/);
    return match ? match[0] : url;
  };

  const handleSaveDriveSchedule = async () => {
    if (!driveFolderUrl || !startDate || !positionId) return;

    setIsSavingSchedule(true);
    setScheduleError(null);
    try {
      const folderId = extractDriveFolderId(driveFolderUrl);
      const startDateTime = new Date(startDate);
      
      const formData = new FormData();
      formData.append('position_id', positionId);
      formData.append('drive_folder_id', folderId);
      formData.append('start_date', startDateTime.toISOString());
      formData.append('frequency_days', frequencyDays.toString());
      formData.append('frequency_hours', frequencyHours.toString());

      await api.recruiter.scheduleDriveIngestion(positionId, formData);
      setScheduleSuccess('Google Drive ingestion schedule created successfully.');
    } catch (err: any) {
      setScheduleError(err.message || 'Failed to save schedule');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleZipUpload = async () => {
    if (zipFiles.length === 0 || !positionId) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await api.recruiter.uploadZipCandidates(positionId, zipFiles);
      setUploadSuccess(`Upload accepted. Scoring progress will update automatically below.`);
      setLastUploadAt(Date.now()); // start polling immediately, before any DB state
      setZipFiles([]); // clear after successful upload
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const toggleStar = (id: string) => {
    setCandidates(candidates.map(c =>
      c.id === id ? { ...c, starred: !c.starred } : c
    ));
  };

  const toggleSelect = (id: string) => {
    setCandidates(candidates.map(c =>
      c.id === id ? { ...c, selected: !c.selected } : c
    ));
  };

  const handleEditClick = () => {
    setEditPositionTitle(positionTitle);
    setEditPositionDescription(description || '');
    setEditPositionScreening(screeningConditions || '');
    setEditPositionIsOpen(isOpen);
    setIsEditDialogOpen(true);
  };

  const handleSaveChanges = async () => {
    if (editPositionTitle.trim()) {
      try {
        await onSave(editPositionTitle, editPositionDescription, editPositionScreening, editPositionIsOpen);
        setIsEditDialogOpen(false);
      } catch (error) {
        console.error('Failed to save position changes', error);
      }
    }
  };

  const startRenaming = (group: any) => {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
  };

  const cancelRenaming = () => {
    setEditingGroupId(null);
    setEditGroupName('');
  };

  const saveRenaming = async (groupId: string) => {
    if (!editGroupName.trim()) return;
    try {
      await api.recruiter.updateGroup(groupId, { name: editGroupName });
      queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
      setEditingGroupId(null);
    } catch (err) {
      console.error('Failed to rename group', err);
    }
  };


  const handleRecomputeScores = async () => {
    if (!canUseCandidateActions) return;
    try {
      setIsRecomputingScores(true);
      setRecomputeError(null);
      setRecomputeMessage(null);

      const result = await api.recruiter.recomputePositionPrescores(positionId) as any;
      queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.positions.insights(positionId) });

      const scheduled = Number(result?.applications_scheduled ?? result?.applications_scored ?? 0);
      setRecomputeMessage(`Scheduled score recomputation for ${scheduled} candidate${scheduled === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Failed to recompute prescores:', error);
      setRecomputeError(error instanceof Error ? error.message : 'Failed to recompute scores');
    } finally {
      setIsRecomputingScores(false);
    }
  };

  const handleShowKeywords = async () => {
    if (!canUseCandidateActions) return;
    try {
      setKeywordsVisible(true);
      setKeywordsError(null);

      if (hasAnyKeywords(jdKeywords)) {
        return;
      }

      const existing = await api.recruiter.getPositionKeywords(positionId) as Record<string, string[]>;
      if (hasAnyKeywords(existing)) {
        setJdKeywords(existing);
        setKeywordsMessage('Loaded saved JD keywords.');
      } else {
        setKeywordsMessage('No saved keywords yet. Approve QAG and extract keywords first.');
      }
    } catch (error) {
      setKeywordsError(error instanceof Error ? error.message : 'Failed to load keywords');
    }
  };

  const openQagManager = async () => {
    if (!canUseCandidateActions) return;
    try {
      setIsQagDialogOpen(true);
      setQagLoading(true);
      setQagError(null);
      setQagMessage(null);

      const artifact = await api.recruiter.getPositionHDEvalQAG(positionId) as any;
      const questions = Array.isArray(artifact?.questions) ? artifact.questions : [];
      setQagQuestions(questions);
      setQagStatus(typeof artifact?.status === 'string' ? artifact.status : null);
    } catch (error) {
      console.error('Failed to load QAG questions:', error);
      setQagError(error instanceof Error ? error.message : 'Failed to load QAG questions');
    } finally {
      setQagLoading(false);
    }
  };

  const updateQagQuestion = (id: number, patch: Partial<QAGQuestion>) => {
    setQagQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const handleSaveQagDraft = async () => {
    try {
      setQagSaving(true);
      setQagError(null);
      setQagMessage(null);
      await api.recruiter.updatePositionHDEvalQAG(positionId, qagQuestions);
      setQagStatus('pending_tech_review');
      setQagMessage('QAG questions saved successfully.');
    } catch (error) {
      console.error('Failed to save QAG draft:', error);
      setQagError(error instanceof Error ? error.message : 'Failed to save QAG questions');
    } finally {
      setQagSaving(false);
    }
  };

  const handleApproveQagAndRecompute = async () => {
    try {
      setQagApproving(true);
      setQagError(null);
      setQagMessage(null);

      await api.recruiter.updatePositionHDEvalQAG(positionId, qagQuestions);
      await api.recruiter.approvePositionHDEvalQAG(positionId);
      const recomputeResult = await api.recruiter.recomputePositionPrescores(positionId) as any;
      queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.positions.insights(positionId) });

      setQagStatus('approved');
      const scheduled = Number(recomputeResult?.applications_scheduled ?? recomputeResult?.applications_scored ?? 0);
      setQagMessage(`QAG approved and recomputation scheduled for ${scheduled} candidate${scheduled === 1 ? '' : 's'}.`);
      setRecomputeMessage(`Scheduled score recomputation for ${scheduled} candidate${scheduled === 1 ? '' : 's'}.`);

      // Auto-trigger keyword extraction after QAG approval
      setKeywordsVisible(true);   // show panel immediately
      setIsGeneratingKeywords(true);
      setKeywordsMessage(null);
      setKeywordsError(null);
      try {
        const kwRes = await api.recruiter.generatePositionKeywords(positionId) as any;
        setJdKeywords(kwRes?.keywords ?? null);
        setKeywordsMessage(`Keywords extracted via ${kwRes?.model ?? 'LLM'}.`);
      } catch (kwErr) {
        console.error('Keyword extraction error:', kwErr);
        setKeywordsError(
          kwErr instanceof Error ? kwErr.message : 'Keyword extraction failed — click Re-extract to retry.'
        );
      } finally {
        setIsGeneratingKeywords(false);
      }
    } catch (error) {
      console.error('Failed to approve QAG and recompute:', error);
      setQagError(error instanceof Error ? error.message : 'Failed to approve QAG and recompute');
    } finally {
      setQagApproving(false);
    }
  };

  const handleResetAssessmentTrial = async (candidate: Candidate) => {
    if (!candidate.applicationId) return;
    
    setAssessmentResetLoadingApplicationId(String(candidate.applicationId));
    setAssessmentResetMessage(null);
    setAssessmentResetError(null);
    
    try {
      await api.recruiter.resetApplicationAssessmentTrial(String(candidate.applicationId));
      setAssessmentResetMessage(`Successfully reset trial for ${candidate.name}.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
    } catch (err: any) {
      console.error('Failed to reset assessment trial:', err);
      setAssessmentResetError(err.message || 'Failed to reset assessment trial.');
    } finally {
      setAssessmentResetLoadingApplicationId(null);
    }
  };

  const renderCustomLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-col gap-2 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
            <span className="font-['Arimo',sans-serif] text-[13px]" style={{ color: entry.color }}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-[#edf0f8]">
        <LoadingSpinner message="Loading position details..." fullScreen={false} />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#edf0f8]">
      <div className="box-border content-stretch flex flex-col gap-[24px] items-start pb-0 pt-[32px] px-[32px]">
        {/* Back Button */}
        <button
          onClick={() => viewingCandidateId !== null ? setViewingCandidateId(null) : onBack()}
          className="flex items-center gap-2 text-[#9ca3af] hover:text-[#6b7280] transition-colors font-['Arimo',sans-serif] text-[14px]"
        >
          <ChevronLeft size={18} strokeWidth={1.5} />
          {viewingCandidateId !== null ? 'Back to Position' : 'Back to Positions'}
        </button>

        {/* Modern Header Section */}
        <div className="relative w-full overflow-hidden rounded-[24px] bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-3xl mix-blend-multiply"></div>
          <div className="absolute top-0 right-0 p-8 z-10">
            <button
              onClick={handleEditClick}
              className="group flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-500 transition-all hover:bg-indigo-600 hover:text-white hover:border-indigo-600 hover:shadow-md"
            >
              <Pencil size={18} className="transition-transform group-hover:scale-110" />
            </button>
          </div>
          
          <div className="relative z-10 max-w-[85%]">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Building2 size={16} />
              </div>
              <span className="text-[13px] font-bold uppercase tracking-widest text-indigo-600">
                {projectTitle || "Active Position"}
              </span>
            </div>
            <h1 className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent mb-8">
              {positionTitle}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Description Card */}
              <div className="group rounded-2xl border border-slate-100 bg-slate-50/50 p-5 transition-colors hover:bg-slate-50">
                <div className="mb-3 flex items-center gap-2 text-slate-700">
                  <MapPin size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <h2 className="text-[15px] font-bold">Role Description</h2>
                </div>
                <p className="text-[14px] leading-relaxed text-slate-600 whitespace-pre-line break-words">
                  {visibleDescription || 'No description provided'}
                </p>
                {collapsedDescription.truncated && (
                  <button
                    type="button"
                    onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                    className="mt-4 flex items-center gap-1.5 text-[13px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    {isDescriptionExpanded ? 'Show less' : 'Read full description'}
                  </button>
                )}
              </div>

              {/* Screening Conditions Card */}
              <div className="group rounded-2xl border border-slate-100 bg-slate-50/50 p-5 transition-colors hover:bg-slate-50">
                <div className="mb-3 flex items-center gap-2 text-slate-700">
                  <ShieldCheck size={16} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  <h2 className="text-[15px] font-bold">Screening Conditions</h2>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-full w-[2px] bg-emerald-200 rounded-full group-hover:bg-emerald-400 transition-colors"></div>
                  <p className="text-[14px] leading-relaxed text-slate-600 whitespace-pre-line break-words italic">
                    "{screeningPreview || 'No specific screening conditions'}"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Approval Status Banner */}
        {isUnderReview && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm animate-in fade-in zoom-in duration-500">
            <div className="mt-0.5 flex-shrink-0">
              <ShieldCheck size={20} className="text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-800">Position Under Review</h3>
              <p className="text-sm text-amber-700 mt-1">
                This position is currently awaiting technical review. 
                Administrative actions such as uploading candidates, creating groups, or modifying criteria are locked until approved by the Technical HR.
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="w-full border-b border-[#e5e7eb]">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('candidates')}
              className={`h-[48px] px-[24px] font-['Arimo',sans-serif] text-[15px] border-b-2 transition-colors ${activeTab === 'candidates'
                ? 'border-[#6366f1] text-[#6366f1]'
                : 'border-transparent text-[#6b7280] hover:text-[#111827]'
                }`}
            >
              Candidates
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`h-[48px] px-[24px] font-['Arimo',sans-serif] text-[15px] border-b-2 transition-colors ${activeTab === 'groups'
                ? 'border-[#6366f1] text-[#6366f1]'
                : 'border-transparent text-[#6b7280] hover:text-[#111827]'
                }`}
            >
              Groups
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={`h-[48px] px-[24px] font-['Arimo',sans-serif] text-[15px] border-b-2 transition-colors ${activeTab === 'insights'
                ? 'border-[#6366f1] text-[#6366f1]'
                : 'border-transparent text-[#6b7280] hover:text-[#111827]'
                }`}
            >
              Insights
            </button>
          </div>
        </div>

{/* Candidates Tab Content */}
        {activeTab === 'candidates' && (
<div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* ── Scoring progress bar — prominent, visible top of tab ── */}
            {showScoringChip && (
              <div className="flex items-center gap-3 rounded-[10px] bg-[#4f46e5] px-4 py-3 text-white shadow-sm">
                <Loader2 size={15} className="animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-['Arimo',sans-serif] text-[13px] font-semibold">Scoring candidates</span>
                  {totalCandidateCount > 0 && (
                    <span className="font-['Arimo',sans-serif] text-[12px] text-indigo-200 ml-2">
                      {scoredCandidateCount} of {totalCandidateCount} analyzed
                    </span>
                  )}
                  {totalCandidateCount === 0 && (
                    <span className="font-['Arimo',sans-serif] text-[12px] text-indigo-200 ml-2">
                      Processing CVs, candidates will appear shortly…
                    </span>
                  )}
                </div>
                {totalCandidateCount > 0 && (
                  <div className="shrink-0 text-right">
                    <span className="font-['Arimo',sans-serif] text-[20px] font-bold">
                      {scoredCandidateCount}/{totalCandidateCount}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Header & Workspace Actions */}
            <div className="relative overflow-hidden rounded-3xl bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
              <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-3xl mix-blend-multiply"></div>
              <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 blur-3xl mix-blend-multiply"></div>

              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
                    Candidates Workspace
                  </h2>
                  <p className="mt-2 text-[14px] font-medium text-slate-500">
                    Manage criteria, track metrics, and orchestrate candidate evaluations seamlessly.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleShowKeywords}
                    disabled={!canUseCandidateActions}
                    title={!canUseCandidateActions ? 'Position must be approved before using JD keywords' : undefined}
                    className={`group relative flex h-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-white to-slate-50 px-5 shadow-sm ring-1 ring-slate-200/50 transition-all ${canUseCandidateActions ? 'hover:shadow-md hover:ring-indigo-500/30' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-emerald-400/10 to-emerald-400/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
                    <span className="relative flex items-center gap-2 text-[14px] font-semibold text-slate-700 transition-colors group-hover:text-emerald-700">
                      <div className={`w-2 h-2 rounded-full ${keywordsVisible ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-slate-300"}`}></div>
                      {keywordsVisible ? 'JD Keywords Visible' : 'Show JD Keywords'}
                    </span>
                  </button>
                  
                  {canManageQAG && (
                    <button
                      onClick={openQagManager}
                      disabled={!canUseCandidateActions}
                      title={!canUseCandidateActions ? 'Position must be approved before managing QAG' : undefined}
                      className={`group relative flex h-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-white to-slate-50 px-5 shadow-sm ring-1 ring-slate-200/50 transition-all ${canUseCandidateActions ? 'hover:shadow-md hover:ring-purple-500/30' : 'opacity-50 cursor-not-allowed'}`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-400/0 via-purple-400/10 to-purple-400/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
                      <span className="relative flex items-center gap-2 text-[14px] font-semibold text-slate-700 transition-colors group-hover:text-purple-700">
                        <Users size={16} className="text-slate-400 group-hover:text-purple-500 transition-colors" />
                        Manage QAG
                      </span>
                    </button>
                  )}
                  
                  <button
                    onClick={handleRecomputeScores}
                    disabled={isRecomputingScores || !canUseCandidateActions}
                    title={!canUseCandidateActions ? 'Position must be approved before recomputing scores' : undefined}
                    className={`group relative flex h-11 items-center justify-center overflow-hidden rounded-xl bg-indigo-600 px-6 shadow-[0_4px_14px_0_rgb(79,70,229,0.39)] transition-all ${canUseCandidateActions ? 'hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)]' : 'opacity-50 cursor-not-allowed'} disabled:hover:translate-y-0`}
                  >
                    <span className="relative flex items-center gap-2 text-[14px] font-semibold text-white">
                      {isRecomputingScores ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Recomputing...
                        </>
                      ) : (
                        <>
                          <ArrowUpDown size={16} className="transition-transform group-hover:rotate-180 duration-500" />
                          Recompute Scores
                        </>
                      )}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {recomputeMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 backdrop-blur-sm animate-in fade-in">
                <p className="text-sm font-medium text-emerald-800">{recomputeMessage}</p>
              </div>
            )}
            {recomputeError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 backdrop-blur-sm animate-in fade-in">
                <p className="text-sm font-medium text-rose-800">{recomputeError}</p>
              </div>
            )}

            {/* Quick Data Board */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              {[
                { title: 'Total Candidates', value: filteredCandidates.length, icon: Users, color: 'indigo', total: null },
                { title: 'Groups Created', value: groups.length, icon: Users, color: 'emerald', total: null },
                {
                  title: 'Assigned',
                  value: groups.reduce((sum, g) => sum + g.candidateCount, 0),
                  icon: Users,
                  color: 'teal',
                  total: candidates.length
                },
                {
                  title: 'Unassigned',
                  value: (candidates as any[]).filter(c => !c.groupId).length,
                  icon: Users,
                  color: 'amber',
                  total: candidates.length
                }
              ].map((stat, i) => (
                <div key={i} className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-slate-200">
                  <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-${stat.color}-500/5 transition-transform duration-500 group-hover:scale-150`}></div>
                  <div className="relative z-10 flex items-center justify-between mb-4">
                    <h4 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">
                      {stat.title}
                    </h4>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-${stat.color}-50 text-${stat.color}-600`}>
                      <stat.icon size={16} />
                    </div>
                  </div>
                  <div className="relative z-10">
                    <p className="text-3xl font-bold tracking-tight text-slate-900">
                      {stat.value}
                    </p>
                    {stat.total !== null && (
                      <div className="mt-3 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-${stat.color}-500 transition-all duration-1000 ease-out`}
                          style={{ width: `${stat.total ? (stat.value / stat.total) * 100 : 0}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* Import Candidates Section */}
                <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 hover:shadow-md transition-shadow">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">
                    Import Candidates
                  </h3>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setShowZipUploadModal(true)}
                      disabled={!canUseCandidateActions}
                      title={!canUseCandidateActions ? 'Position must be approved before importing candidates' : undefined}
                      className={`group flex items-center gap-4 rounded-xl border border-dashed border-slate-300 p-4 transition-all ${canUseCandidateActions ? 'hover:border-indigo-400 hover:bg-indigo-50/50' : 'opacity-50 cursor-not-allowed bg-slate-50'}`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 transition-colors ${canUseCandidateActions ? 'group-hover:bg-indigo-600 group-hover:text-white' : ''}`}>
                        <Upload size={20} />
                      </div>
                      <div className="text-left">
                        <div className="text-[14px] font-semibold text-slate-900">Upload CVs (.zip / .pdf)</div>
                        <div className="text-[12px] font-medium text-slate-500">Drag & drop or browse</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setShowGoogleDriveModal(true)}
                      disabled={!canUseCandidateActions}
                      title={!canUseCandidateActions ? 'Position must be approved before scheduling data import' : undefined}
                      className={`group flex items-center gap-4 rounded-xl border border-dashed border-slate-300 p-4 transition-all ${canUseCandidateActions ? 'hover:border-emerald-400 hover:bg-emerald-50/50' : 'opacity-50 cursor-not-allowed bg-slate-50'}`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 transition-colors ${canUseCandidateActions ? 'group-hover:bg-emerald-600 group-hover:text-white' : ''}`}>
                        <Calendar size={20} />
                      </div>
                      <div className="text-left">
                        <div className="text-[14px] font-semibold text-slate-900">Schedule Data Import</div>
                        <div className="text-[12px] font-medium text-slate-500">Google Drive integration</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Group Distribution */}
                <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 hover:shadow-md transition-shadow">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">
                    Candidates by Group
                  </h3>
                  {groups.length > 0 ? (
                    <div className="space-y-4">
                      {groups.map((group) => (
                        <div key={group.id} className="group">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[14px] font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                              {group.name}
                            </span>
                            <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {group.candidateCount}
                            </span>
                          </div>
                          <div className="w-full h-[6px] bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000"
                              style={{ width: `${(group.candidateCount / candidates.length) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {(candidates as any[]).filter(c => !c.groupId).length > 0 && (
                        <div className="group pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[14px] font-medium text-slate-500">
                              Unassigned
                            </span>
                            <span className="text-[12px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                              {(candidates as any[]).filter(c => !c.groupId).length}
                            </span>
                          </div>
                          <div className="w-full h-[6px] bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 transition-all duration-1000"
                              style={{ width: `${((candidates as any[]).filter(c => !c.groupId).length / candidates.length) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 mb-3">
                        <Users size={20} className="text-slate-400" />
                      </div>
                      <p className="text-[13px] font-medium text-slate-500">
                        No groups created yet.
                      </p>
                    </div>
                  )}
                </div>
                
                {keywordsVisible && (
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 hover:shadow-md transition-shadow animate-in fade-in slide-in-from-left-4">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-900">Extracted JD Keywords</span>
                        {isGeneratingKeywords && <Loader2 size={16} className="animate-spin text-indigo-600" />}
                      </div>
                      <button
                        type="button"
                        disabled={isGeneratingKeywords}
                        onClick={async () => {
                          setIsGeneratingKeywords(true);
                          setKeywordsMessage(null);
                          setKeywordsError(null);
                          try {
                            const r = await api.recruiter.generatePositionKeywords(positionId) as any;
                            const extracted = r?.keywords ?? null;
                            setJdKeywords(extracted);
                            setKeywordsMessage(`Keywords extracted via ${r?.model ?? 'LLM'}.`);
                          } catch (e) {
                            setKeywordsError(e instanceof Error ? e.message : 'Extraction failed — please retry.');
                          } finally {
                            setIsGeneratingKeywords(false);
                          }
                        }}
                        className="flex items-center justify-center h-8 px-3 rounded-lg bg-indigo-50 text-[12px] font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                      >
                        {isGeneratingKeywords ? 'Extracting...' : 'Re-extract'}
                      </button>
                    </div>

{/* Dual-score filters: Semantic (JD↔CV fit) + QAG (AI evaluation) */}
              <div className="flex flex-wrap items-center gap-4 mb-5 px-1">
                <div className="flex items-center gap-2">
                  <span className="font-['Arimo',sans-serif] text-[12px] text-indigo-700">Semantic ≥</span>
                  <input
                    type="range" min={0} max={100} value={minSemantic}
                    onChange={(e) => setMinSemantic(Number(e.target.value))}
                    className="w-[120px] accent-[#6366f1]"
                  />
                  <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-indigo-700 w-[34px]">{minSemantic}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-['Arimo',sans-serif] text-[12px] text-violet-700">QAG ≥</span>
                  <input
                    type="range" min={0} max={100} value={minQag}
                    onChange={(e) => setMinQag(Number(e.target.value))}
                    className="w-[120px] accent-[#8b5cf6]"
                  />
                  <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-violet-700 w-[34px]">{minQag}%</span>
                </div>
                {(minSemantic > 0 || minQag > 0) && (
                  <button
                    onClick={() => { setMinSemantic(0); setMinQag(0); }}
                    className="font-['Arimo',sans-serif] text-[12px] text-[#64748b] hover:text-[#0f172a] underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Keyword operation feedback */}
              {keywordsMessage && (
                <p className="mb-3 text-[13px] font-medium text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">{keywordsMessage}</p>
              )}
              {keywordsError && (
                <p className="mb-3 text-[13px] font-medium text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{keywordsError}</p>
              )}

              {/* Assessment reset feedback */}
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

                    {!hasAnyKeywords(jdKeywords) ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed border-slate-100 rounded-xl">
                        <p className="text-[13px] font-medium text-slate-500">
                          No keywords are saved yet.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {KEYWORD_SECTIONS.map(({ key, label, color }) => {
                          const kws: string[] = Array.isArray((jdKeywords as any)?.[key]) ? (jdKeywords as any)[key] : [];
                          if (kws.length === 0) return null;
                          const isExpanded = Boolean(expandedKeywordSections[key]);
                          return (
                            <div key={key} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50">
                              <button
                                type="button"
                                onClick={() => setExpandedKeywordSections((prev) => ({ ...prev, [key]: !prev[key] }))}
                                className="flex w-full items-center justify-between p-3 hover:bg-slate-100/50 transition-colors"
                              >
                                <span className="text-[12px] font-bold uppercase tracking-wider text-slate-700">{label}</span>
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 items-center justify-center rounded-full bg-white px-2 text-[11px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">{kws.length}</span>
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="flex flex-wrap gap-2 p-3 pt-0">
                                  {kws.map((kw, i) => (
                                    <span key={`${key}-${i}`} className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-semibold shadow-sm ring-1 ring-inset ring-black/5 ${color.replace('border', '').trim()} bg-white`}>
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: All Candidates List */}
              <div className="lg:col-span-8">
                <div className="flex h-full flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-center justify-between border-b border-slate-100 p-6">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">
                        Candidates Roster
                      </h3>
                      <p className="mt-1 text-[13px] font-medium text-slate-500">
                        Showing {filteredCandidates.length} potential matches
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsFilterOpen(true)}
                        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                          Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : !!v) &&
                          (filters.experienceRange[0] > 0 || filters.experienceRange[1] < 20)
                            ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700'
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 ring-1 ring-slate-200'
                        }`}
                      >
                        <Filter size={18} className="transition-transform group-hover:scale-110" />
                      </button>
                      <button className="group flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition-all hover:bg-slate-100 hover:text-slate-700">
                        <ArrowUpDown size={18} className="transition-transform group-hover:scale-110" />
                      </button>
                    </div>
                  </div>

                  {assessmentResetMessage && (
                    <div className="mx-6 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-[13px] font-medium text-emerald-800">{assessmentResetMessage}</p>
                    </div>
                  )}
                  {assessmentResetError && (
                    <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                      <p className="text-[13px] font-medium text-rose-800">{assessmentResetError}</p>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-6 pt-4 min-h-[400px]">
                    <div className="flex flex-col gap-4">
                      {filteredCandidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-all hover:-translate-y-1 hover:shadow-lg hover:ring-indigo-500/30 sm:flex-row sm:items-center"
                        >
                          <div className="absolute left-0 top-0 h-full w-1.5 transition-colors" style={{ backgroundColor: candidate.color || '#6366f1' }}></div>
                          
                          <div className="flex flex-1 items-center gap-4 pl-2">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-700">
                              {candidate.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[16px] font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                {candidate.name}
                              </p>
                              <p className="truncate text-[13px] font-medium text-slate-500">
                                {candidate.email}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap sm:justify-end">
                            <div className="flex flex-col items-start rounded-xl bg-slate-50 px-4 py-2 sm:items-end">
                              {(() => {
                                const displayScore = getCandidateDisplayScore(candidate);
                                const displayMatch = getCandidateDisplayMatch(candidate);
                                return (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Score</span>
                                      <span className="text-[16px] font-extrabold text-slate-900">{displayScore != null ? displayScore : '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Match</span>
                                      <span className="text-[13px] font-bold text-indigo-600">{displayMatch != null ? `${displayMatch}%` : '-'}</span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            <div className="flex w-full items-center gap-2 sm:w-auto">
                              <button
                                onClick={() => {
                                  const query = candidate.applicationId
                                    ? `?applicationId=${encodeURIComponent(String(candidate.applicationId))}`
                                    : '';
                                  navigate(`/recruiter/candidates/${candidate.id}${query}`);
                                }}
                                className="flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-900 px-6 text-[13px] font-bold text-white shadow-md transition-all hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-500/25 sm:flex-none"
                              >
                                View Report
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Groups Tab Content */}
        {activeTab === 'groups' && (
          <>
            {showGroupCreationPage ? (
              <div className="fixed inset-0 bg-[#edf0f8] z-[100]">
                <GroupCreationPage
                  positionTitle={positionTitle}
                  positionId={positionId}
                  onCancel={() => setShowGroupCreationPage(false)}
                  onCreate={async (data) => {
                    try {
                      const newGroup = await api.recruiter.createGroup({
                        name: data.name,
                        position_id: positionId,
                        candidate_ids: data.candidateIds,
                        ai_ranking_used: data.aiRankingUsed,
                        nlp_query: data.nlpQuery
                      });

                      setShowGroupCreationPage(false);

                      // Refresh groups
                      const groups = await api.recruiter.getPositionGroups(positionId) as any[];
                      setGroups(groups);
                    } catch (err) {
                      console.error("Failed to create group", err);
                      throw err;
                    }
                  }}
                />
              </div>
            ) : (
              <div className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h2 className="font-['Arimo',sans-serif] text-[20px] text-black">
                      Candidate Groups
                    </h2>
                    {/* Active / Archived toggle */}
                    <div className="flex items-center bg-[#f3f4f6] rounded-[8px] p-1">
                      <button
                        onClick={() => setShowArchivedGroups(false)}
                        className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-colors ${!showArchivedGroups ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6b7280] hover:text-[#374151]'}`}
                      >
                        Active
                      </button>
                      <button
                        onClick={async () => {
                          setShowArchivedGroups(true);
                          const ag = await api.recruiter.getPositionGroups(positionId, true) as any[];
                          setArchivedGroups(ag || []);
                          setArchivedGroupsLoaded(true);
                        }}
                        className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-colors ${showArchivedGroups ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6b7280] hover:text-[#374151]'}`}
                      >
                        Archived
                      </button>
                    </div>
                  </div>
                  {isHR && !showArchivedGroups && (
                    <button
                      onClick={() => setShowGroupCreationPage(true)}
                      disabled={!canUseCandidateActions}
                      className={`flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] transition-colors ${canUseCandidateActions ? 'bg-[#6366f1] hover:bg-[#5558e3] text-white' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
                      title={!canUseCandidateActions ? "Position must be approved before creating groups" : undefined}
                    >
                      <Plus size={18} className={canUseCandidateActions ? "text-white" : "text-slate-500"} strokeWidth={2} />
                      <span className={`font-['Arimo',sans-serif] text-[14px] ${canUseCandidateActions ? "text-white" : "text-slate-500"}`}>
                        Create Group
                      </span>
                    </button>
                  )}
                </div>

                {showArchivedGroups ? (
                  archivedGroups.length === 0 ? (
                    <div className="bg-white rounded-[12px] p-12 text-center shadow-sm">
                      <div className="w-[64px] h-[64px] rounded-full bg-[#f3f4f6] flex items-center justify-center mx-auto mb-4">
                        <Users size={28} className="text-[#6b7280]" />
                      </div>
                      <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-2">No Archived Groups</h3>
                      <p className="font-['Arimo',sans-serif] text-[14px] text-[#9ca3af]">Archived groups will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {archivedGroups.map((group) => (
                        <div key={group.id} className="bg-white rounded-[12px] p-5 shadow-sm border border-[#e5e7eb] opacity-80">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <h3
                                onClick={() => onViewGroup && onViewGroup(group.id)}
                                className="font-['Arimo',sans-serif] text-[17px] text-black cursor-pointer hover:text-[#6366f1] hover:underline"
                              >
                                {group.name}
                              </h3>
                              <span className="px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] bg-[#f3f4f6] text-[#6b7280]">
                                Archived
                              </span>
                            </div>
                            <button
                              onClick={() => onViewGroup && onViewGroup(group.id)}
                              className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-[6px] border border-[#e5e7eb] text-[#374151] text-[13px] hover:bg-[#f9fafb] transition-colors"
                            >
                              View
                            </button>
                          </div>
                          <div className="flex items-center gap-4 mt-3 text-[13px] text-[#6b7280] font-['Arimo',sans-serif]">
                            <span>{group.candidateCount ?? 0} candidates</span>
                            {group.assigned_hr && <span>HR: {group.assigned_hr.name}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : groups.length === 0 ? (
                  <div className="relative overflow-hidden bg-white rounded-3xl p-16 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 animate-in fade-in zoom-in-95 duration-500">
                    <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-500/5 to-purple-500/5 rounded-full blur-3xl mix-blend-multiply pointer-events-none"></div>
                    </div>
                    
                    <div className="relative z-10 flex flex-col items-center justify-center">
                      <div className="relative flex items-center justify-center w-24 h-24 mb-6 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-white shadow-lg shadow-indigo-100/50 transform transition-transform hover:scale-105 hover:rotate-3">
                        <Users size={36} className="text-indigo-600" />
                        <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white border border-indigo-100 shadow-sm">
                          <Plus size={16} className="text-indigo-600" />
                        </div>
                      </div>
                      
                      <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-3">
                        Pipeline Empty
                      </h3>
                      <p className="text-[15px] font-medium text-slate-500 mb-8 max-w-[420px]">
                        {isHR
                          ? "Start organizing candidates by creating your first group. Designate stages, assign reviewers, and orchestrate the recruitment pipeline."
                          : "No candidate groups have been assembled for this position yet."}
                      </p>
                      
                      {isHR && (
                        <button
                          onClick={() => setShowGroupCreationPage(true)}
                          disabled={!canUseCandidateActions}
                          title={!canUseCandidateActions ? "Position must be approved before creating groups" : undefined}
                          className={`group relative flex h-12 items-center justify-center overflow-hidden rounded-xl px-8 transition-all ${canUseCandidateActions ? 'bg-indigo-600 shadow-[0_4px_14px_0_rgb(79,70,229,0.39)] hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)]' : 'bg-slate-300 cursor-not-allowed'}`}
                        >
                            {canUseCandidateActions && <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.2),transparent)] -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>}
                            <span className={`relative flex items-center gap-2 text-[15px] font-bold ${canUseCandidateActions ? 'text-white' : 'text-slate-500'}`}>
                              <Plus size={18} className={canUseCandidateActions ? 'transition-transform group-hover:rotate-90 duration-300' : ''} />
                            Create Your First Group
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groups.map((group) => (
                      <div key={group.id} className="bg-white rounded-[12px] p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              {editingGroupId === group.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editGroupName}
                                    onChange={(e) => setEditGroupName(e.target.value)}
                                    className="border border-[#d1d5db] rounded-[4px] px-2 py-1 font-['Arimo',sans-serif] text-[17px] text-black w-[200px]"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveRenaming(group.id);
                                      if (e.key === 'Escape') cancelRenaming();
                                    }}
                                  />
                                  <button
                                    onClick={() => saveRenaming(group.id)}
                                    className="p-1 hover:bg-[#dcfce7] rounded text-[#10b981]"
                                  >
                                    <CheckCircle size={18} />
                                  </button>
                                  <button
                                    onClick={cancelRenaming}
                                    className="p-1 hover:bg-[#fee2e2] rounded text-[#ef4444]"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                              ) : (
                                <h3
                                  onClick={() => onViewGroup && onViewGroup(group.id)}
                                  className="font-['Arimo',sans-serif] text-[17px] text-black cursor-pointer hover:text-[#6366f1] hover:underline"
                                >
                                  {group.name}
                                </h3>
                              )}
                              <span className={`px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] ${group.status?.toLowerCase() === 'live' ? 'bg-[#dcfce7] text-[#10b981]' :
                                group.status?.toLowerCase() === 'paused' ? 'bg-[#fef3c7] text-[#f59e0b]' :
                                  group.status?.toLowerCase() === 'on hold' ? 'bg-[#ffedd5] text-[#f97316]' :
                                    'bg-[#f3f4f6] text-[#6b7280]'
                                }`}>
                                {group.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                              <span>{group.candidateCount} candidates</span>
                              <span>•</span>
                              <span>Assigned to {user.role === 'technical' ? (group.assigned_hr_name || 'HR (Unassigned)') : (group.assigned_tech_name || 'Tech (Unassigned)')}</span>
                              <span>•</span>
                              <span>Stage: {group.stage}</span>
                              <span>•</span>
                              <span>Updated {group.lastUpdated}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                              Progress
                            </span>
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                              {group.progress}%
                            </span>
                          </div>
                          <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#6366f1] transition-all"
                              style={{ width: `${group.progress}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {group.status?.toLowerCase() === 'on hold' && user.role === 'technical' ? (
                            // Tech HR sees an actionable button to configure the flow
                            <button
                              onClick={() => {
                                setPendingGroupData(group);
                                setShowFlowConfigModal(true);
                              }}
                              title="Click to configure the filtration flow for this group"
                              className="h-[36px] px-[16px] rounded-[8px] font-['Arimo',sans-serif] text-[13px] transition-colors bg-[#f97316] hover:bg-[#ea6c0a] text-white flex items-center gap-2"
                            >
                              <Sliders size={14} />
                              Configure Flow
                            </button>
                          ) : (
                            // HR / others see a disabled status indicator
                            <button
                              onClick={() => {
                                if (group.status?.toLowerCase() !== 'on hold') {
                                  onViewGroup && onViewGroup(group.id);
                                }
                              }}
                              disabled={group.status?.toLowerCase() === 'on hold'}
                              title={group.status?.toLowerCase() === 'on hold' ? 'Awaiting flow configuration by Technical HR' : undefined}
                              className={`h-[36px] px-[16px] rounded-[8px] font-['Arimo',sans-serif] text-[13px] transition-colors ${group.status?.toLowerCase() === 'on hold'
                                ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed'
                                : 'bg-[#6366f1] hover:bg-[#5558e3] text-white'
                                }`}
                            >
                              {group.status?.toLowerCase() === 'on hold' ? '🔒 Awaiting Config' : 'Open'}
                            </button>
                          )}

                          <button
                            onClick={() => startRenaming(group)}
                            className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              setGroupToDelete(group);
                              setIsGroupDeleteModalOpen(true);
                            }}
                            className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#fef2f2] hover:border-[#ef4444] font-['Arimo',sans-serif] text-[13px] text-[#ef4444] transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Insights Tab Content */}
        {activeTab === 'insights' && (
          <div className="relative w-full animate-in fade-in duration-500">
            <div className={isInsightsLocked ? 'pointer-events-none select-none blur-sm opacity-35' : ''}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-['Arimo',sans-serif] text-[24px] font-semibold text-slate-900 tracking-tight">
                  Role Insights
                </h2>
                <p className="text-[14px] text-slate-500 mt-1 font-['Arimo',sans-serif]">
                  AI-powered analytics and candidate distribution metrics
                </p>
              </div>
              <button className="flex items-center gap-2 h-[40px] px-[20px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/20 active:scale-95">
                <Download size={18} className="text-slate-500" />
                <span className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-700">
                  Export Report
                </span>
              </button>
            </div>

            {/* Top KPI Cards */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
                  <Target size={48} className="text-indigo-600" />
                </div>
                <div className="relative z-10">
                  <p className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-500 mb-2 mt-1">Conversion Rate</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-['Arimo',sans-serif] text-[36px] font-bold text-slate-900">{conversion}%</h3>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-md">
                    <TrendingUp size={14} />
                    <span className="text-[12px] font-semibold text-emerald-700">+2.4% vs avg</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
                  <Award size={48} className="text-violet-600" />
                </div>
                <div className="relative z-10">
                  <p className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-500 mb-2 mt-1">Quality Score</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-['Arimo',sans-serif] text-[36px] font-bold text-slate-900">{qualityScore}<span className="text-[20px] text-slate-400">/10</span></h3>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-indigo-600 bg-indigo-50 w-fit px-2 py-1 rounded-md">
                    <Sparkles size={14} />
                    <span className="text-[12px] font-semibold text-indigo-700">High potential</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ShieldCheck size={48} className={integrityIssues > 0 ? "text-amber-500" : "text-emerald-500"} />
                </div>
                <div className="relative z-10">
                  <p className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-500 mb-2 mt-1">Integrity Flags</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-['Arimo',sans-serif] text-[36px] font-bold text-slate-900">{integrityIssues}</h3>
                  </div>
                  <div className={`mt-4 flex items-center gap-1.5 w-fit px-2 py-1 rounded-md ${integrityIssues > 0 ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50'}`}>
                    <CheckCircle size={14} />
                    <span className={`text-[12px] font-semibold ${integrityIssues > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{integrityIssues > 0 ? 'Review needed' : 'All clear'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Candidate Fitting Donut */}
              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100 flex flex-col">
                <h3 className="font-['Arimo',sans-serif] text-[16px] font-semibold text-slate-900 mb-2">
                  Matching Accuracy
                </h3>
                <p className="text-[13px] text-slate-500 mb-6 font-['Arimo',sans-serif]">Distribution of candidate fit relative to job requirements.</p>
                <div className="flex-1 flex items-center justify-between gap-4">
                  <div className="relative flex items-center justify-center w-[220px] h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white/90 backdrop-blur-md border border-slate-200 p-3 rounded-xl shadow-lg">
                                  <p className="font-['Arimo',sans-serif] text-[14px] font-semibold text-slate-800">{data.name}</p>
                                  <p className="font-['Arimo',sans-serif] text-[13px] text-slate-600">{data.value} Candidates</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Pie
                          data={fittingData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                          cornerRadius={8}
                        >
                          {fittingData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: `drop-shadow(0px 4px 12px ${entry.color}40)` }} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[28px] font-bold text-slate-900 tracking-tight font-['Arimo',sans-serif]">
                        {fittingData.reduce((acc, curr) => acc + curr.value, 0)}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium font-['Arimo',sans-serif] uppercase tracking-wider">
                        Total Pool
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 pr-4">
                    {fittingData.map((item, index) => (
                      <div key={index} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-[14px] font-medium text-slate-700 font-['Arimo',sans-serif]">{item.name}</span>
                        </div>
                        <span className="text-[14px] font-bold text-slate-900 font-['Arimo',sans-serif]">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Match Score Spectrum Bar Chart */}
              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100 flex flex-col">
                <h3 className="font-['Arimo',sans-serif] text-[16px] font-semibold text-slate-900 mb-2">
                  Match Score Spectrum
                </h3>
                <p className="text-[13px] text-slate-500 mb-6 font-['Arimo',sans-serif]">Granular distribution of AI matching scores across the applicant pool.</p>
                <div className="flex-1 w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.9} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="range"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'Arimo, sans-serif' }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'Arimo, sans-serif' }}
                        dx={-10}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white/90 backdrop-blur-md border border-slate-200 p-3 rounded-xl shadow-lg">
                                <p className="font-['Arimo',sans-serif] text-[13px] text-slate-500 mb-1">Range: <span className="font-semibold text-slate-800">{payload[0].payload.range}</span></p>
                                <p className="font-['Arimo',sans-serif] text-[14px] font-bold text-indigo-600">{payload[0].value} Candidates</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" fill="url(#colorCount)" radius={[6, 6, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Metrics Grids */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Skill Distribution */}
              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Sparkles size={16} className="text-indigo-600" />
                  </div>
                  <h3 className="font-['Arimo',sans-serif] text-[16px] font-semibold text-slate-900">
                    Skill Frequency
                  </h3>
                </div>
                <div className="space-y-4">
                  {skillDistribution.map((item, index) => (
                    <div key={index} className="group cursor-default">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                          {item.skill}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] font-medium text-slate-500">
                          {item.percentage}%
                        </span>
                      </div>
                      <div className="w-full h-[8px] bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700 ease-out group-hover:shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seniority Distribution */}
              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Target size={16} className="text-emerald-600" />
                  </div>
                  <h3 className="font-['Arimo',sans-serif] text-[16px] font-semibold text-slate-900">
                    Experience Levels
                  </h3>
                </div>
                <div className="space-y-4">
                  {seniorityDistribution.map((item, index) => (
                    <div key={index} className="group cursor-default">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-700 group-hover:text-emerald-600 transition-colors">
                          {item.level}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] font-medium text-slate-500">
                          {item.percentage}%
                        </span>
                      </div>
                      <div className="w-full h-[8px] bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700 ease-out group-hover:shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* University Distribution */}
              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Award size={16} className="text-blue-600" />
                  </div>
                  <h3 className="font-['Arimo',sans-serif] text-[16px] font-semibold text-slate-900">
                    Alumni Networks
                  </h3>
                </div>
                <div className="space-y-4">
                  {universityDistribution.map((item, index) => (
                    <div key={index} className="group cursor-default">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-700 group-hover:text-blue-600 transition-colors truncate pr-4">
                          {item.university}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] font-medium text-slate-500 whitespace-nowrap">
                          {item.percentage}%
                        </span>
                      </div>
                      <div className="w-full h-[8px] bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-700 ease-out group-hover:shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Availability Distribution */}
              <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                    <Calendar size={16} className="text-orange-600" />
                  </div>
                  <h3 className="font-['Arimo',sans-serif] text-[16px] font-semibold text-slate-900">
                    Hiring Outlook
                  </h3>
                </div>
                <div className="space-y-4">
                  {availabilityDistribution.map((item, index) => (
                    <div key={index} className="group cursor-default">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-['Arimo',sans-serif] text-[14px] font-medium text-slate-700 group-hover:text-orange-600 transition-colors">
                          {item.availability}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] font-medium text-slate-500">
                          {item.percentage}%
                        </span>
                      </div>
                      <div className="w-full h-[8px] bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-700 ease-out group-hover:shadow-[0_0_8px_rgba(249,115,22,0.5)]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sourcing Intelligence Section - The Surprise Surprise! */}
            <div className="mb-8 overflow-hidden rounded-[24px] border border-indigo-100 bg-gradient-to-br from-indigo-50/10 to-white p-1">
              <div className="bg-white rounded-[22px] p-6">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="font-['Arimo',sans-serif] text-[18px] font-bold text-slate-900 border-l-4 border-indigo-500 pl-4 mb-1">
                      Talent Intelligence & Sourcing ROI
                    </h3>
                    <p className="text-[13px] text-slate-500 font-['Arimo',sans-serif] pl-5">Identifying high-performing talent channels and originating pipelines through AI matching.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  {/* Source ROI */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Globe size={16} className="text-indigo-600" />
                      </div>
                      <h4 className="font-['Arimo',sans-serif] text-[15px] font-semibold text-slate-800">Channel Performance ROI</h4>
                    </div>

                    <div className="h-[220px] w-full">
                      {sourceQuality.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart layout="vertical" data={sourceQuality} margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                            <XAxis type="number" hide domain={[0, 100]} />
                            <YAxis
                              dataKey="source"
                              type="category"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }}
                              width={90}
                            />
                            <Tooltip
                              cursor={{ fill: 'transparent' }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-slate-900 text-white p-2 rounded-lg text-[12px] shadow-xl border border-slate-800">
                                      <p className="font-bold">{payload[0].payload.source}</p>
                                      <p className="text-indigo-300">Avg Quality: {payload[0].value}%</p>
                                      <p className="text-slate-400">Total: {payload[0].payload.count} apps</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar
                              dataKey="avgScore"
                              radius={[0, 4, 4, 0]}
                              barSize={18}
                            >
                              {sourceQuality.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : '#818cf8'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 border border-dashed border-slate-100 rounded-xl">
                          <p className="text-[12px]">Collecting source metrics...</p>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-[12px] text-slate-400 italic text-center">ROI based on average AI match accuracy per source.</p>
                  </div>

                  {/* Company Pedigree */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Building2 size={16} className="text-emerald-600" />
                      </div>
                      <h4 className="font-['Arimo',sans-serif] text-[15px] font-semibold text-slate-800">Originating Talent Pipelines</h4>
                    </div>

                    <div className="space-y-4">
                      {topCompanies.length > 0 ? (
                        topCompanies.map((item, index) => (
                          <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 group hover:bg-white hover:shadow-sm hover:border-emerald-200 transition-all cursor-default">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[12px] font-bold text-slate-400 group-hover:text-emerald-500 group-hover:border-emerald-100 group-hover:bg-emerald-50 transition-colors">
                                {index + 1}
                              </div>
                              <span className="font-['Arimo',sans-serif] text-[14px] font-semibold text-slate-700 group-hover:text-slate-900 line-clamp-1">{item.company}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-bold text-slate-500 bg-slate-200/50 px-2.5 py-1 rounded-full">{item.count} Candidates</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[200px] text-slate-400 border border-dashed border-slate-100 rounded-xl">
                          <Building2 size={32} className="mb-2 opacity-20" />
                          <p className="text-[13px]">Insufficient data for pedigree analysis</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
            {isInsightsLocked && (
              <div className="absolute inset-0 z-10 flex items-start justify-center pt-24 px-6">
                <div className="max-w-[540px] rounded-[24px] border border-white/70 bg-white/90 px-8 py-8 text-center shadow-[0px_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
                    <div className="h-3 w-3 rounded-full bg-indigo-500 animate-pulse" />
                  </div>
                  <h3 className="font-['Arimo',sans-serif] text-[20px] font-semibold text-black">
                    Insights locked
                  </h3>
                  <p className="mt-3 font-['Arimo',sans-serif] text-[14px] leading-[22px] text-[#6b7280]">
                    {insightsLockMessage}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QAG Manager Dialog */}
      <Dialog open={isQagDialogOpen} onOpenChange={setIsQagDialogOpen}>
        <DialogContent className="sm:max-w-[980px] bg-white p-0">
          <div className="p-6 pb-4">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-[18px] font-['Arimo',sans-serif] text-black">Position QAG Questions</DialogTitle>
              <DialogDescription className="text-[13px] text-[#6b7280] font-['Arimo',sans-serif] mt-1">
                Review and edit QAG questions for this position, then approve and recompute candidate scores.
              </DialogDescription>
            </DialogHeader>

            <div className="mb-3 text-[12px] text-[#6b7280]">
              Current status: <span className="font-semibold text-[#111827]">{qagStatus || 'unknown'}</span>
            </div>

            {qagMessage && (
              <div className="mb-3 rounded-[8px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
                <p className="font-['Arimo',sans-serif] text-[12px] text-[#166534]">{qagMessage}</p>
              </div>
            )}
            {qagError && (
              <div className="mb-3 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2">
                <p className="font-['Arimo',sans-serif] text-[12px] text-[#b91c1c]">{qagError}</p>
              </div>
            )}

            <div className="max-h-[480px] overflow-y-auto rounded-[10px] border border-[#e5e7eb] bg-[#f8fafc] p-3">
              {qagLoading ? (
                <div className="h-[180px] flex items-center justify-center text-[#6b7280]">
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Loading QAG questions...
                </div>
              ) : qagQuestions.length === 0 ? (
                <div className="h-[180px] flex flex-col items-center justify-center gap-3 text-[#9ca3af]">
                  {qagStatus === 'ai_generation_failed' ? (
                    <>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#ef4444]">QAG generation failed — AI service was unavailable.</p>
                      <button
                        type="button"
                        onClick={async () => {
                          setQagLoading(true);
                          setQagError(null);
                          try {
                            await api.recruiter.regeneratePositionHDEvalQAG(positionId);
                            setQagStatus('pending');
                            setQagMessage('Regeneration started in the background. Reload in a moment.');
                          } catch (e) {
                            setQagError('Regeneration failed. Check AI service connectivity.');
                          } finally {
                            setQagLoading(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded-[6px] bg-[#6366f1] text-white font-['Arimo',sans-serif] text-[12px] hover:bg-[#4f46e5]"
                      >
                        Regenerate QAG Questions
                      </button>
                    </>
                  ) : qagStatus === 'pending' ? (
                    <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">QAG generation in progress — check back in a moment.</p>
                  ) : (
                    <p className="font-['Arimo',sans-serif] text-[13px]">No QAG questions found for this position.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {qagQuestions.map((q) => (
                    <div key={q.id} className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                      <div className="grid grid-cols-[1fr_110px_110px] gap-2 items-start mb-2">
                        <textarea
                          value={q.question || ''}
                          onChange={(e) => updateQagQuestion(q.id, { question: e.target.value })}
                          rows={2}
                          className="w-full rounded-[6px] border border-[#e5e7eb] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                        />
                        <input
                          value={q.category || ''}
                          onChange={(e) => updateQagQuestion(q.id, { category: e.target.value })}
                          placeholder="Category"
                          className="h-[36px] rounded-[6px] border border-[#e5e7eb] px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                        />
                        <input
                          type="number"
                          step="0.0001"
                          value={q.weight ?? ''}
                          onChange={(e) => updateQagQuestion(q.id, { weight: Number(e.target.value) })}
                          placeholder="Weight"
                          className="h-[36px] rounded-[6px] border border-[#e5e7eb] px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                        />
                      </div>
                      <label className="inline-flex items-center gap-2 text-[12px] text-[#374151]">
                        <input
                          type="checkbox"
                          checked={Boolean(q.approved ?? true)}
                          onChange={(e) => updateQagQuestion(q.id, { approved: e.target.checked })}
                        />
                        Approved
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── JD Keywords Panel ─────────────────────────────────────── */}
          {keywordsVisible && (
            <div className="mx-6 mb-4 rounded-[10px] border border-[#d1fae5] bg-[#f0fdf4] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[16px]">🏷️</span>
                  <span className="font-['Arimo',sans-serif] text-[14px] font-semibold text-[#166534]">JD Keywords</span>
                  {isGeneratingKeywords && <div className="w-4 h-4 border-2 border-[#16a34a] border-t-transparent rounded-full animate-spin" />}
                  {keywordsMessage && !isGeneratingKeywords && (
                    <span className="font-['Arimo',sans-serif] text-[11px] text-[#16a34a]">✓ {keywordsMessage}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={isGeneratingKeywords}
                    onClick={async () => {
                      setIsGeneratingKeywords(true);
                      setKeywordsMessage(null);
                      setKeywordsError(null);
                      try {
                        const r = await api.recruiter.generatePositionKeywords(positionId) as any;
                        setJdKeywords(r?.keywords ?? null);
                        setKeywordsMessage(`Keywords extracted via ${r?.model ?? 'LLM'}.`);
                      } catch (e) {
                        setKeywordsError(e instanceof Error ? e.message : 'Extraction failed — please retry.');
                      } finally {
                        setIsGeneratingKeywords(false);
                      }
                    }}
                    className="h-[28px] px-[10px] rounded-[6px] border border-[#bbf7d0] bg-white text-[11px] text-[#16a34a] hover:bg-[#dcfce7] transition-colors disabled:opacity-50"
                  >
                    {isGeneratingKeywords ? 'Extracting…' : 'Re-extract'}
                  </button>
                  <button type="button" disabled={isSavingKeywords || !jdKeywords}
                    onClick={async () => {
                      if (!jdKeywords) return;
                      setIsSavingKeywords(true);
                      setKeywordsMessage(null);
                      try {
                        await api.recruiter.savePositionKeywords(positionId, jdKeywords);
                        setKeywordsMessage('Saved — candidate scores updated.');
                      } catch {
                        setKeywordsError('Failed to save keywords.');
                      } finally {
                        setIsSavingKeywords(false);
                      }
                    }}
                    className="h-[28px] px-[12px] rounded-[6px] bg-[#16a34a] text-white text-[11px] hover:bg-[#15803d] transition-colors disabled:opacity-50"
                  >
                    {isSavingKeywords ? 'Saving…' : 'Save Keywords'}
                  </button>
                </div>
              </div>

              {/* Loading state */}
              {isGeneratingKeywords && !jdKeywords && (
                <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Extracting keywords from job description…</p>
              )}

              {/* Error state */}
              {!isGeneratingKeywords && keywordsError && !jdKeywords && (
                <div className="flex items-start gap-2 p-3 rounded-[8px] bg-[#fef2f2] border border-[#fecaca]">
                  <span className="text-[14px]">⚠️</span>
                  <div>
                    <p className="font-['Arimo',sans-serif] text-[12px] text-[#991b1b] font-medium">Keyword extraction failed</p>
                    <p className="font-['Arimo',sans-serif] text-[11px] text-[#b91c1c] mt-0.5">{keywordsError}</p>
                    <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mt-1">Click <strong>Re-extract</strong> above to retry, or add keywords manually below.</p>
                  </div>
                </div>
              )}

              {/* Keywords grid */}
              {jdKeywords && (
                <div className="space-y-3">
                  {KEYWORD_SECTIONS.map(({ key, label, color }) => {
                    const kws: string[] = Array.isArray((jdKeywords as any)[key]) ? (jdKeywords as any)[key] : [];
                    const isExpanded = Boolean(expandedKeywordSections[key]);
                    return (
                      <div key={key}>
                        <button
                          type="button"
                          onClick={() => setExpandedKeywordSections((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="flex items-center gap-2 text-[11px] text-[#374151] hover:text-[#111827]"
                        >
                          <span className="font-['Arimo',sans-serif] font-semibold text-[#9ca3af] uppercase tracking-wide">{label}</span>
                          <span className="rounded-full bg-white border border-[#d1d5db] px-2 py-0 text-[10px] text-[#6b7280]">{kws.length}</span>
                          <span className="text-[11px] text-[#6b7280]">{isExpanded ? 'Hide' : 'Show'}</span>
                        </button>

                        {isExpanded && (
                          <div className="flex flex-wrap gap-1 mt-1 items-center">
                            {kws.map((kw, i) => (
                              <span key={i} className={`inline-flex items-center gap-1 px-[6px] py-[1px] rounded-[8px] border text-[10px] font-medium ${color}`}>
                                {kw}
                                <button type="button" onClick={() => setJdKeywords(prev => prev ? { ...prev, [key]: kws.filter((_, j) => j !== i) } : prev)} className="hover:opacity-60 leading-none">×</button>
                              </span>
                            ))}
                            <input
                              type="text" placeholder="+ add" value={(newKeywordInputs as any)[key] || ''}
                              onChange={e => setNewKeywordInputs(p => ({ ...p, [key]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const val = ((newKeywordInputs as any)[key] || '').trim().toLowerCase();
                                  if (val && !kws.includes(val)) setJdKeywords(p => p ? { ...p, [key]: [...kws, val] } : p);
                                  setNewKeywordInputs(p => ({ ...p, [key]: '' }));
                                }
                              }}
                              className="h-[22px] px-[8px] rounded-[10px] border border-dashed border-[#d1d5db] text-[11px] text-[#6b7280] w-[70px] focus:outline-none focus:border-[#6366f1] bg-white"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#f3f4f6]">
            <button
              onClick={() => setIsQagDialogOpen(false)}
              className="h-[38px] px-[20px] rounded-[6px] font-['Arimo',sans-serif] text-[14px] text-[#6b7280] hover:bg-[#f9fafb] transition-colors"
            >
              Close
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveQagDraft}
                disabled={qagSaving || qagLoading || qagQuestions.length === 0}
                className="h-[38px] px-[14px] rounded-[6px] border border-[#c7d2fe] bg-[#eef2ff] hover:bg-[#e0e7ff] disabled:opacity-60"
              >
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#4338ca]">{qagSaving ? 'Saving...' : 'Save QAG Changes'}</span>
              </button>
              <button
                onClick={handleApproveQagAndRecompute}
                disabled={qagApproving || qagLoading || qagQuestions.length === 0}
                className="h-[38px] px-[14px] rounded-[6px] bg-[#5b21b6] hover:bg-[#6d28d9] disabled:opacity-60"
              >
                <span className="font-['Arimo',sans-serif] text-[13px] text-white">{qagApproving ? 'Approving...' : 'Approve + Recompute'}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Position Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white p-0">
          <div className="p-6 pb-4">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-[18px] font-['Arimo',sans-serif] text-black">Edit Position</DialogTitle>
              <DialogDescription className="text-[13px] text-[#9ca3af] font-['Arimo',sans-serif] mt-1">
                Update the position details and opening status.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                  Position Title
                </label>
                <input
                  type="text"
                  placeholder="Enter position title"
                  value={editPositionTitle}
                  onChange={(e) => setEditPositionTitle(e.target.value)}
                  className="w-full h-[40px] bg-[#f9fafb] rounded-[6px] border-0 px-[12px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                  Description
                </label>
                <textarea
                  placeholder="Enter position description"
                  value={editPositionDescription}
                  onChange={(e) => setEditPositionDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-[#f9fafb] rounded-[6px] border-0 px-[12px] py-[10px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                  Screening Conditions
                </label>
                <textarea
                  placeholder="Enter screening conditions"
                  value={editPositionScreening}
                  onChange={(e) => setEditPositionScreening(e.target.value)}
                  rows={3}
                  className="w-full bg-[#f9fafb] rounded-[6px] border-0 px-[12px] py-[10px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
                />
              </div>

              <button className="flex items-center gap-2 h-[36px] px-[14px] rounded-[6px] border border-[#6366f1] bg-white hover:bg-[#f9fafb] transition-colors self-start">
                <Sparkles size={16} className="text-[#6366f1]" />
                <span className="text-[14px] font-['Arimo',sans-serif] text-[#6366f1]">
                  AI Enhance
                </span>
              </button>

              <div className="flex items-center justify-between pt-2">
                <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                  Currently Open
                </label>
                <Switch
                  checked={editPositionIsOpen}
                  onCheckedChange={setEditPositionIsOpen}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#f3f4f6]">
            <button
              onClick={() => setIsEditDialogOpen(false)}
              className="h-[38px] px-[20px] rounded-[6px] font-['Arimo',sans-serif] text-[14px] text-[#9ca3af] hover:bg-[#f9fafb] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveChanges}
              className="h-[38px] px-[20px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              Save Changes
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Creation Modal */}
      {showGroupCreationModal && (
        <SimpleGroupCreationModal
          onClose={() => setShowGroupCreationModal(false)}
          onCreate={(groupData) => {
            console.log('Group created:', groupData);
            setShowGroupCreationModal(false);
            if (onViewGroup) {
              onViewGroup(`group-${Date.now()}`);
            }
          }}
        />
      )}

      {/* ZIP/PDF Upload Modal */}
      {showZipUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[600px] p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[#111827] text-[20px]">Upload CVs (.zip / .pdf)</h3>
              <button
                onClick={() => {
                  setShowZipUploadModal(false);
                  setZipFiles([]);
                  setUploadError(null);
                  setUploadSuccess(null);
                }}
                className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
              >
                <X size={18} className="text-[#6b7280]" />
              </button>
            </div>

            {!uploadSuccess ? (
              <>
                <div
                  className={`border-2 border-dashed rounded-[12px] p-12 text-center mb-6 transition-colors cursor-pointer relative ${zipFiles.length > 0 ? 'border-[#6366f1] bg-[#eef2ff]' : 'border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb]'
                    }`}
                >
                  <input
                    type="file"
                    multiple
                    accept=".zip,.pdf"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setZipFiles(Array.from(e.target.files));
                        setUploadError(null);
                      }
                    }}
                  />
                  <Upload size={48} className={`mx-auto mb-4 ${zipFiles.length > 0 ? 'text-[#6366f1]' : 'text-[#6b7280]'}`} />
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
                    {zipFiles.length > 0 ? `${zipFiles.length} file(s) selected` : "Drag and drop your ZIP or PDF files here, or click to browse"}
                  </p>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Supported formats: .zip, .pdf (max 100MB)
                  </p>
                </div>

                {uploadError && (
                  <div className="mb-4 text-red-500 text-sm font-['Arimo',sans-serif]">
                    {uploadError}
                  </div>
                )}

                {isUploading && (
                  <div className="bg-[#f9fafb] rounded-[8px] p-4 mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-[6px] h-[6px] rounded-full bg-[#6366f1]" />
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                        Uploading & Processing...
                      </span>
                    </div>
                    <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-[#6366f1] rounded-full w-full animate-pulse" />
                    </div>
                    <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      Please wait while we extract and process the candidates.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowZipUploadModal(false);
                      setZipFiles([]);
                    }}
                    className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleZipUpload}
                    disabled={zipFiles.length === 0 || isUploading}
                    className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : null}
                    Add to Position
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Upload Complete!</h4>
                <p className="text-sm text-gray-500 mb-3">{uploadSuccess}</p>

                {/* Live scoring progress inside the modal */}
                {showScoringChip ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-indigo-600 font-medium mb-6">
                    <Loader2 size={14} className="animate-spin" />
                    {totalCandidateCount === 0
                      ? 'Processing CVs — candidates will appear shortly…'
                      : `Scoring ${scoredCandidateCount} / ${totalCandidateCount} candidates…`}
                  </div>
                ) : totalCandidateCount > 0 ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-green-600 font-medium mb-6">
                    <CheckCircle size={14} />
                    {scoredCandidateCount}/{totalCandidateCount} candidates scored
                  </div>
                ) : (
                  <div className="mb-6" />
                )}

                <button
                  onClick={() => {
                    setShowZipUploadModal(false);
                    setZipFiles([]);
                    setUploadSuccess(null);
                    if (positionId) queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
                  }}
                  className="px-6 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3]"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Google Drive Import Modal */}
      {showGoogleDriveModal && (() => {
        const closeModal = () => {
          setShowGoogleDriveModal(false);
          setScheduleSuccess(null);
          setScheduleError(null);
          setDriveFolderUrl('');
          setStartDate('');
          setFrequencyDays(0);
          setFrequencyHours(0);
          setDriveModalStep(1);
        };

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-[520px] overflow-hidden shadow-2xl">

              {/* Gradient Header */}
              <div className="bg-gradient-to-r from-indigo-500 to-violet-500 px-6 pt-6 pb-8 relative">
                <button
                  onClick={closeModal}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X size={16} className="text-white" />
                </button>

                {!scheduleSuccess && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${driveModalStep === 1 ? 'bg-white text-indigo-600' : 'bg-white/20 text-white'}`}>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-indigo-600 text-white">1</span>
                      Connect
                    </div>
                    <div className="flex-1 h-px bg-white/30" />
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${driveModalStep === 2 ? 'bg-white text-indigo-600' : 'bg-white/20 text-white'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${driveModalStep === 2 ? 'bg-indigo-600 text-white' : 'bg-white/30 text-white'}`}>2</span>
                      Schedule
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">
                    {scheduleSuccess ? '🎉' : driveModalStep === 1 ? '📂' : '🗓️'}
                  </div>
                  <div>
                    <h3 className="text-white text-[18px] font-bold leading-tight">
                      {scheduleSuccess
                        ? 'Schedule Saved!'
                        : driveModalStep === 1
                        ? 'Import CVs from Google Drive'
                        : 'When should we import?'}
                    </h3>
                    <p className="text-white/70 text-[13px] mt-0.5">
                      {scheduleSuccess
                        ? 'Your import is all set'
                        : driveModalStep === 1
                        ? 'Paste your shared folder link below'
                        : 'Set the start time and repeat frequency'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-6">
                {scheduleSuccess ? (
                  <div className="text-center py-4">
                    <p className="text-[14px] text-gray-500 mb-6">{scheduleSuccess}</p>
                    <button
                      onClick={closeModal}
                      className="px-8 h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-semibold rounded-xl transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : driveModalStep === 1 ? (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[13px] font-semibold text-gray-700 mb-2">
                        Google Drive Folder Link
                      </label>
                      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent transition-all">
                        <div className="px-3 py-2.5 bg-gray-50 border-r border-gray-200 flex items-center gap-1.5 shrink-0">
                          <svg className="w-4 h-4" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                          </svg>
                          <span className="text-[12px] text-gray-500 font-medium">Drive</span>
                        </div>
                        <input
                          type="text"
                          value={driveFolderUrl}
                          onChange={(e) => setDriveFolderUrl(e.target.value)}
                          placeholder="https://drive.google.com/drive/folders/..."
                          className="flex-1 h-[44px] px-3 text-[14px] bg-white outline-none text-gray-800 placeholder:text-gray-400"
                        />
                      </div>
                    </div>

                    <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
                      {[
                        'We\'ll scan the folder for CV files',
                        'CVs are parsed and structured automatically',
                        'Candidates are added directly to this position',
                      ].map((item) => (
                        <div key={item} className="flex items-start gap-2">
                          <span className="text-indigo-500 mt-0.5 text-[13px]">✓</span>
                          <span className="text-[13px] text-indigo-700">{item}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={closeModal}
                        className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors underline"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setDriveModalStep(2)}
                        disabled={!driveFolderUrl.trim()}
                        className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-[14px] font-semibold rounded-xl transition-colors flex items-center gap-2"
                      >
                        Next: Set Schedule
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[13px] font-semibold text-gray-700 mb-2">
                        Start Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full h-[44px] px-4 rounded-xl border border-gray-200 text-[14px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-semibold text-gray-700 mb-3">
                        Repeat every
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Days stepper */}
                        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                          <button
                            onClick={() => setFrequencyDays(Math.max(0, frequencyDays - 1))}
                            className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-indigo-50 text-indigo-600 font-bold text-lg flex items-center justify-center transition-colors"
                          >
                            −
                          </button>
                          <div className="text-center">
                            <div className="text-[20px] font-bold text-gray-800 leading-none">{frequencyDays}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">days</div>
                          </div>
                          <button
                            onClick={() => setFrequencyDays(frequencyDays + 1)}
                            className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-indigo-50 text-indigo-600 font-bold text-lg flex items-center justify-center transition-colors"
                          >
                            +
                          </button>
                        </div>
                        {/* Hours stepper */}
                        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                          <button
                            onClick={() => setFrequencyHours(Math.max(0, frequencyHours - 1))}
                            className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-indigo-50 text-indigo-600 font-bold text-lg flex items-center justify-center transition-colors"
                          >
                            −
                          </button>
                          <div className="text-center">
                            <div className="text-[20px] font-bold text-gray-800 leading-none">{frequencyHours}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">hours</div>
                          </div>
                          <button
                            onClick={() => setFrequencyHours(frequencyHours + 1)}
                            className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-indigo-50 text-indigo-600 font-bold text-lg flex items-center justify-center transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {frequencyDays === 0 && frequencyHours === 0 && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                            ⚡ One-time import — no repeat
                          </span>
                        </div>
                      )}
                    </div>

                    {scheduleError && (
                      <div className="text-[13px] text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        {scheduleError}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => { setDriveModalStep(1); setScheduleError(null); }}
                        className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 underline"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Change folder
                      </button>
                      <button
                        onClick={handleSaveDriveSchedule}
                        disabled={!startDate || isSavingSchedule}
                        className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-[14px] font-semibold rounded-xl transition-colors flex items-center gap-2"
                      >
                        {isSavingSchedule ? <Loader2 size={16} className="animate-spin" /> : null}
                        Save Schedule
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Filtration Flow Config Modal */}
      {showFlowConfigModal && (
        <FiltrationFlowConfigModal
          onClose={() => setShowFlowConfigModal(false)}
          groupData={pendingGroupData}
          onSave={async (_flowConfig) => {
            // The modal already called api.recruiter.updateGroup (sets status + filtration_flow)
            // Just close and refresh the group list
            setShowFlowConfigModal(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positions.groups(positionId) });
            const groups = await api.recruiter.getPositionGroups(positionId) as any[];
            setGroups(groups);
          }}
        />
      )}

      {/* Group Delete Modal */}
      {isGroupDeleteModalOpen && groupToDelete && (
        <GroupDeleteModal
          isOpen={isGroupDeleteModalOpen}
          onClose={() => {
            setIsGroupDeleteModalOpen(false);
            setGroupToDelete(null);
          }}
          groupId={groupToDelete.id}
          groupName={groupToDelete.name}
          candidateCount={candidates.filter(c => groups.find(g => g.id === groupToDelete.id)?.candidate_ids?.includes(c.id)).length || groupToDelete.candidate_count || 0}
          availableGroups={groups.filter(g => g.id !== groupToDelete.id)}
          onConfirm={async () => {
            setIsGroupDeleteModalOpen(false);
            setGroupToDelete(null);
            await queryClient.invalidateQueries({ queryKey: queryKeys.positions.detail(positionId) });
          }}
        />
      )}

      {/* Candidate Profile View */}
      {viewingCandidateId !== null && (
        <div className="fixed inset-0 bg-[#edf0f8] z-50">
          <CandidateProfile
            candidateId={viewingCandidateId}
            onBack={() => setViewingCandidateId(null)}
          />
        </div>
      )}
    </div>
  );
}
