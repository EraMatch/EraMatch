import { ChevronLeft, Pencil, Filter, ArrowUpDown, Star, Plus, Sparkles, Share2, Edit2, Trash2, Users, Download, Upload, Calendar, X, Loader2, CheckCircle, Sliders, TrendingUp, ShieldCheck, Target, Award, MapPin, Building2, Globe } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Switch } from '../../ui/switch';
import { Question } from '../assessments/CreateAssessmentPage';
import { GroupCreationPage } from '../groups/GroupCreationPage';
import { FiltrationFlowConfigModal } from '../groups/FiltrationFlowConfigModal';
import { CandidateProfile } from '../candidates/CandidateProfile';
import { SimpleGroupCreationModal } from '../groups/SimpleGroupCreationModal';
import { CandidateFilterSidebar, CandidateFilters } from '../candidates/CandidateFilterSidebar';
import LoadingSpinner from '../../common/LoadingSpinner';

interface Candidate {
  id: string;
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
}

interface Assessment {
  id: string;
  title: string;
  questions: Question[];
  createdAt: Date;
}

interface PositionDetailViewProps {
  positionId: string;
  positionTitle: string;
  projectTitle: string;
  description?: string;
  screeningConditions?: string;
  isOpen?: boolean;
  onBack: () => void;
  onSave: (title: string, description: string, screening: string, isOpen: boolean) => void;
  onCreateAssessment: () => void;
  onSaveAssessment?: (assessment: Assessment) => void;
  savedAssessments?: Assessment[];
  onViewDashboard?: () => void;
  onViewGroup?: (groupId: string) => void;
  initialActiveTab?: 'candidates' | 'groups' | 'insights';
}

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
  initialActiveTab = 'candidates'
}: PositionDetailViewProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
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
    degrees: []
  });

  // Rename Group State
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');

  // Derived Filter Options
  const filterOptions = {
    locations: Array.from(new Set(candidates.map(c => c.location || 'Unknown'))).filter(Boolean).sort(),
    companies: Array.from(new Set(candidates.flatMap(c => c.companies || []))).filter(Boolean).sort(),
    schools: Array.from(new Set(candidates.flatMap(c => c.universities || []))).filter(Boolean).sort(),
    skills: Array.from(new Set(candidates.flatMap(c => c.skills || []))).filter(Boolean).sort(),
    jobTitles: Array.from(new Set(candidates.flatMap(c => c.job_titles || []))).filter(Boolean).sort(),
    degrees: Array.from(new Set(candidates.flatMap(c => c.degrees || []))).filter(Boolean).sort(),
  };

  // Filter Logic
  const filteredCandidates = candidates.filter(c => {
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

    return true;
  });

  // Assessment management - use savedAssessments from props
  const assessments = savedAssessments;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [detailsRes, insightsRes] = await Promise.all([
          api.recruiter.getPositionDetails(positionId),
          api.recruiter.getPositionInsights(positionId)
        ]);
        const details = detailsRes as any;
        const insights = insightsRes as any;

        setCandidates(details.candidates);
        setGroups(details.groups);

        // Set metrics individually as setMetrics state object does not exist
        // Assuming these states exist based on previous code reading, or if not, I should check defaults.
        // Actually, looking at lines 1-150, I don't see 'setMetrics'. 
        // I see 'setFittingData', 'setScoreData' etc.
        // I should just set the insights data as before but safely.

        setFittingData(insights.fittingData || []);
        setScoreData(insights.scoreData || []);
        setSkillDistribution(insights.skillDistribution || []);
        setSeniorityDistribution(insights.seniorityDistribution || []);
        setUniversityDistribution(insights.universityDistribution || []);
        setAvailabilityDistribution(insights.availabilityDistribution || []);
        setConversion(insights.conversion || 0);
        setQualityScore(insights.qualityScore || 0);
        setIntegrityIssues(insights.integrityIssues || 0);
        setSourceQuality(insights.sourceQuality || []);
        setTopCompanies(insights.topCompanies || []);
      } catch (error) {
        console.error('Failed to fetch position details:', error);
      } finally {
        setIsLoading(false);
      }
    };
    if (positionId) { fetchData(); }
  }, [positionId]);

  // Auth / Role Check
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isHR = user.role === 'hr' || user.role === 'admin';
  const navigate = useNavigate();

  // Upload Logic
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const handleZipUpload = async () => {
    if (!zipFile || !positionId) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await api.recruiter.uploadCandidates(positionId, zipFile);
      setUploadSuccess(`Successfully processed ${res.total_processed} files. Created ${res.success_count} candidates.`);
      // Optionally refresh candidates list here
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

  const handleSaveChanges = () => {
    if (editPositionTitle.trim()) {
      onSave(editPositionTitle, editPositionDescription, editPositionScreening, editPositionIsOpen);
      setIsEditDialogOpen(false);
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
      const updatedGroups = await api.recruiter.getPositionGroups(positionId) as any[];
      setGroups(updatedGroups);
      setEditingGroupId(null);
    } catch (err) {
      console.error("Failed to rename group", err);
    }
  };

  const handleDeleteAssessment = (id: string) => {
    // This will be handled by parent component through onSaveAssessment
    // For now, we'll keep the assessment in place
  };

  const customLegend = (props: any) => {
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

        {/* Header with Title and Edit Button */}
        <div className="flex items-start justify-between w-full">
          <h1 className="font-['Arimo',sans-serif] text-[36px] leading-[40px] text-black">
            {positionTitle}
          </h1>
          <button
            onClick={handleEditClick}
            className="flex items-center justify-center w-[40px] h-[40px] rounded-[8px] hover:bg-white/50 transition-colors"
          >
            <Pencil size={20} className="text-[#6366f1]" strokeWidth={1.5} />
          </button>
        </div>

        {/* Description */}
        <div className="w-full">
          <h2 className="font-['Arimo',sans-serif] text-[16px] text-black mb-2">
            Description
          </h2>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#9ca3af]">
            {description || 'No description provided'}
          </p>
        </div>

        {/* Screening Conditions */}
        <div className="w-full">
          <h2 className="font-['Arimo',sans-serif] text-[16px] text-black mb-2">
            Screening Conditions
          </h2>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#9ca3af]">
            {screeningConditions || 'No screening conditions provided'}
          </p>
        </div>

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
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-['Arimo',sans-serif] text-[20px] text-black">
                Candidates
              </h2>
            </div>

            {/* Import Candidates Section */}
            <div className="bg-white rounded-[12px] p-6 shadow-sm mb-6">
              <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-4">
                Import Candidates
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowZipUploadModal(true)}
                  className="flex items-center gap-3 p-4 rounded-[8px] border-2 border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-all"
                >
                  <Upload size={20} className="text-[#6366f1]" />
                  <div className="text-left">
                    <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      Upload CVs (.zip)
                    </div>
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      Drag & drop or browse
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setShowGoogleDriveModal(true)}
                  className="flex items-center gap-3 p-4 rounded-[8px] border-2 border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-all"
                >
                  <Calendar size={20} className="text-[#10b981]" />
                  <div className="text-left">
                    <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      Schedule Data Import
                    </div>
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      Google Drive integration
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Quick Data Board */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {/* Total Candidates */}
              <div className="bg-white rounded-[12px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    Total Candidates
                  </h4>
                  <Users size={18} className="text-[#6366f1]" />
                </div>
                <p className="font-['Arimo',sans-serif] text-[28px] text-black">
                  {filteredCandidates.length}
                </p>
              </div>

              {/* Groups Created */}
              <div className="bg-white rounded-[12px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    Groups Created
                  </h4>
                  <Users size={18} className="text-[#10b981]" />
                </div>
                <p className="font-['Arimo',sans-serif] text-[28px] text-black">
                  {groups.length}
                </p>
              </div>

              {/* Assigned Candidates */}
              <div className="bg-white rounded-[12px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    Assigned
                  </h4>
                  <div className="w-[8px] h-[8px] rounded-full bg-[#10b981]"></div>
                </div>
                <p className="font-['Arimo',sans-serif] text-[28px] text-black mb-2">
                  {groups.reduce((sum, g) => sum + g.candidateCount, 0)}
                </p>
                <div className="w-full h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#10b981]"
                    style={{ width: `${(groups.reduce((sum, g) => sum + g.candidateCount, 0) / (candidates.length || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Unassigned Candidates */}
              <div className="bg-white rounded-[12px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    Unassigned
                  </h4>
                  <div className="w-[8px] h-[8px] rounded-full bg-[#f59e0b]"></div>
                </div>
                <p className="font-['Arimo',sans-serif] text-[28px] text-black mb-2">
                  {candidates.length - groups.reduce((sum, g) => sum + g.candidateCount, 0)}
                </p>
                <div className="w-full h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#f59e0b]"
                    style={{ width: `${((candidates.length - groups.reduce((sum, g) => sum + g.candidateCount, 0)) / (candidates.length || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Group Distribution */}
            <div className="bg-white rounded-[12px] p-6 shadow-sm mb-6">
              <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-4">
                Candidates by Group
              </h3>
              {groups.length > 0 ? (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                          {group.name}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {group.candidateCount} candidates
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#6366f1]"
                          style={{ width: `${(group.candidateCount / candidates.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {candidates.length - groups.reduce((sum, g) => sum + g.candidateCount, 0) > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                          Unassigned
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {candidates.length - groups.reduce((sum, g) => sum + g.candidateCount, 0)} candidates
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#f59e0b]"
                          style={{ width: `${((candidates.length - groups.reduce((sum, g) => sum + g.candidateCount, 0)) / candidates.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#9ca3af] text-center py-4">
                  No groups created yet. Create a group to organize candidates.
                </p>
              )}
            </div>

            {/* All Candidates List */}
            <div className="bg-white rounded-[12px] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-['Arimo',sans-serif] text-[18px] text-black">
                  All Candidates ({filteredCandidates.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsFilterOpen(true)}
                    className={`flex items-center justify-center w-[32px] h-[32px] rounded-[6px] transition-colors ${Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : !!v) &&
                      (filters.experienceRange[0] > 0 || filters.experienceRange[1] < 20)
                      ? 'bg-[#6366f1] text-white hover:bg-[#5558e3]'
                      : 'hover:bg-[#f3f4f6] text-[#6366f1]'
                      }`}
                  >
                    <Filter size={18} className="text-[#6366f1]" strokeWidth={1.5} />
                  </button>
                  <button className="flex items-center justify-center w-[32px] h-[32px] rounded-[6px] hover:bg-[#f3f4f6] transition-colors">
                    <ArrowUpDown size={18} className="text-[#6366f1]" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto pr-2">
                <div className="flex flex-col gap-3">
                  {filteredCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center gap-4 p-4 rounded-[10px] bg-[#f9fafb] hover:bg-[#f3f4f6] transition-colors"
                    >
                      <div className={`w-[4px] h-[44px] rounded-full`} style={{ backgroundColor: candidate.color }}></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-['Arimo',sans-serif] text-[15px] text-black">
                          {candidate.name}
                        </p>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#9ca3af]">
                          {candidate.email}
                        </p>
                      </div>
                      <div className="text-right mr-4">
                        <p className="font-['Arimo',sans-serif] text-[15px] text-black">
                          Score: {candidate.score}
                        </p>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#9ca3af]">
                          Match: {candidate.match}%
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(`/recruiter/candidates/${candidate.id}`)}
                        className="h-[40px] px-[20px] rounded-[8px] bg-[#5b21b6] hover:bg-[#6d28d9] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
                      >
                        View Report
                      </button>
                    </div>
                  ))}
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
                  <h2 className="font-['Arimo',sans-serif] text-[20px] text-black">
                    Candidate Groups
                  </h2>
                  {isHR && (
                    <button
                      onClick={() => setShowGroupCreationPage(true)}
                      className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] transition-colors"
                    >
                      <Plus size={18} className="text-white" strokeWidth={2} />
                      <span className="font-['Arimo',sans-serif] text-[14px] text-white">
                        Create Group
                      </span>
                    </button>
                  )}
                </div>

                {groups.length === 0 ? (
                  <div className="bg-white rounded-[12px] p-12 text-center shadow-sm">
                    <div className="w-[64px] h-[64px] rounded-full bg-[#f3f4f6] flex items-center justify-center mx-auto mb-4">
                      <Users size={28} className="text-[#6b7280]" />
                    </div>
                    <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-2">
                      No Groups Created Yet
                    </h3>
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#9ca3af] mb-6 max-w-[400px] mx-auto">
                      {isHR
                        ? "Create candidate groups to organize and track subsets of candidates through your recruitment pipeline."
                        : "No candidate groups have been created for this position yet."}
                    </p>
                    {isHR && (
                      <button
                        onClick={() => setShowGroupCreationPage(true)}
                        className="h-[44px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
                      >
                        Create Your First Group
                      </button>
                    )}
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
                            onClick={async () => {
                              if (window.confirm('Are you sure you want to delete this group? Candidates will be unassigned.')) {
                                try {
                                  await api.recruiter.deleteGroup(group.id);
                                  // Refresh groups
                                  const updatedGroups = await api.recruiter.getPositionGroups(positionId) as any[];
                                  setGroups(updatedGroups);
                                  // Refresh candidates to show them as unassigned
                                  const details = await api.recruiter.getPositionDetails(positionId) as any;
                                  if (details && details.candidates) {
                                    setCandidates(details.candidates);
                                  }
                                } catch (err) {
                                  console.error("Failed to delete group", err);
                                  alert("Failed to delete group");
                                }
                              }
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
          <div className="w-full animate-in fade-in duration-500">
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
        )}
      </div>

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

      {/* ZIP Upload Modal */}
      {showZipUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[600px] p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[#111827] text-[20px]">Upload CVs (.zip)</h3>
              <button
                onClick={() => {
                  setShowZipUploadModal(false);
                  setZipFile(null);
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
                  className={`border-2 border-dashed rounded-[12px] p-12 text-center mb-6 transition-colors cursor-pointer relative ${zipFile ? 'border-[#6366f1] bg-[#eef2ff]' : 'border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb]'
                    }`}
                >
                  <input
                    type="file"
                    accept=".zip"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setZipFile(e.target.files[0]);
                        setUploadError(null);
                      }
                    }}
                  />
                  <Upload size={48} className={`mx-auto mb-4 ${zipFile ? 'text-[#6366f1]' : 'text-[#6b7280]'}`} />
                  <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
                    {zipFile ? zipFile.name : "Drag and drop your ZIP file here, or click to browse"}
                  </p>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Supported format: .zip (max 100MB)
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
                      setZipFile(null);
                    }}
                    className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleZipUpload}
                    disabled={!zipFile || isUploading}
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
                <p className="text-sm text-gray-500 mb-6">{uploadSuccess}</p>
                <button
                  onClick={() => {
                    setShowZipUploadModal(false);
                    setZipFile(null);
                    setUploadSuccess(null);
                    // Refresh data
                    window.location.reload(); // Quick refresh or re-fetch
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
      {showGoogleDriveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[600px] p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[#111827] text-[20px]">Schedule Data Import (Google Drive)</h3>
              <button
                onClick={() => setShowGoogleDriveModal(false)}
                className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
              >
                <X size={18} className="text-[#6b7280]" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                  Google Drive Folder Link
                </label>
                <input
                  type="text"
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full h-[44px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                  Import Frequency
                </label>
                <select className="w-full h-[44px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white">
                  <option>Manual only</option>
                  <option>Daily at 9:00 AM</option>
                  <option>Every 6 hours</option>
                  <option>Weekly on Monday</option>
                </select>
              </div>
            </div>

            <div className="bg-[#f0fdf4] border border-[#86efac] rounded-[8px] p-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-[6px] h-[6px] rounded-full bg-[#10b981]" />
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#10b981]">
                  Connection Ready
                </span>
              </div>
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mt-2">
                Click "Test Connection" to verify access to the folder
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowGoogleDriveModal(false)}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                className="h-[44px] px-[20px] rounded-[8px] border border-[#10b981] text-[#10b981] hover:bg-[#f0fdf4] font-['Arimo',sans-serif] text-[14px] transition-colors"
              >
                Test Connection
              </button>
              <button
                className="h-[44px] px-[20px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtration Flow Config Modal */}
      {showFlowConfigModal && (
        <FiltrationFlowConfigModal
          onClose={() => setShowFlowConfigModal(false)}
          groupData={pendingGroupData}
          onSave={async (_flowConfig) => {
            // The modal already called api.recruiter.updateGroup (sets status + filtration_flow)
            // Just close and refresh the group list
            setShowFlowConfigModal(false);
            const groups = await api.recruiter.getPositionGroups(positionId) as any[];
            setGroups(groups);
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