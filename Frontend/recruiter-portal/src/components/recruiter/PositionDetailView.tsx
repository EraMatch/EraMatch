import { ChevronLeft, Pencil, Filter, ArrowUpDown, Star, Plus, Sparkles, Share2, Edit2, Trash2, Users, Download, Upload, Calendar, X, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Switch } from '../ui/switch';
import { Question } from './CreateAssessmentPage';
import { GroupCreationPage } from './GroupCreationPage';
import { FiltrationFlowConfigModal } from './FiltrationFlowConfigModal';
import { CandidateProfile } from './CandidateProfile';
import { SimpleGroupCreationModal } from './SimpleGroupCreationModal';

interface Candidate {
  id: number;
  name: string;
  email: string;
  score: number;
  match: number;
  color: string;
  starred: boolean;
  selected: boolean;
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
  const [viewingCandidateId, setViewingCandidateId] = useState<number | null>(null);

  // Assessment management - use savedAssessments from props
  const assessments = savedAssessments;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [details, insights] = await Promise.all([
          api.recruiter.getPositionDetails(positionId),
          api.recruiter.getPositionInsights(positionId)
        ]);

        setCandidates(details.candidates);
        setGroups(details.groups);
        setFittingData(insights.fittingData);
        setScoreData(insights.scoreData);
        setSkillDistribution(insights.skillDistribution);
        setSeniorityDistribution(insights.seniorityDistribution);
        setUniversityDistribution(insights.universityDistribution);
        setAvailabilityDistribution(insights.availabilityDistribution);
      } catch (error) {
        console.error('Failed to fetch position data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const toggleStar = (id: number) => {
    setCandidates(candidates.map(c =>
      c.id === id ? { ...c, starred: !c.starred } : c
    ));
  };

  const toggleSelect = (id: number) => {
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
      <div className="flex items-center justify-center min-h-screen bg-[#edf0f8]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[#6366f1] animate-spin" />
          <p className="text-[#64748b] font-medium font-['Arimo',sans-serif]">Loading position details...</p>
        </div>
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
                  {candidates.length}
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
                <p className="font-['Arimo',sans-serif] text-[28px] text-black">
                  {groups.reduce((sum, g) => sum + g.candidateCount, 0)}
                </p>
              </div>

              {/* Unassigned Candidates */}
              <div className="bg-white rounded-[12px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    Unassigned
                  </h4>
                  <div className="w-[8px] h-[8px] rounded-full bg-[#f59e0b]"></div>
                </div>
                <p className="font-['Arimo',sans-serif] text-[28px] text-black">
                  {candidates.length - groups.reduce((sum, g) => sum + g.candidateCount, 0)}
                </p>
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
                  All Candidates ({candidates.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button className="flex items-center justify-center w-[32px] h-[32px] rounded-[6px] hover:bg-[#f3f4f6] transition-colors">
                    <Filter size={18} className="text-[#6366f1]" strokeWidth={1.5} />
                  </button>
                  <button className="flex items-center justify-center w-[32px] h-[32px] rounded-[6px] hover:bg-[#f3f4f6] transition-colors">
                    <ArrowUpDown size={18} className="text-[#6366f1]" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto pr-2">
                <div className="flex flex-col gap-3">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center gap-4 p-4 rounded-[10px] bg-[#f9fafb] hover:bg-[#f3f4f6] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={candidate.selected}
                        onChange={() => toggleSelect(candidate.id)}
                        className="w-[18px] h-[18px] rounded-[3px] border border-[#d1d5db] text-[#6366f1] focus:ring-2 focus:ring-[#6366f1] focus:ring-offset-0 cursor-pointer accent-[#6366f1]"
                      />
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
                        onClick={() => toggleStar(candidate.id)}
                        className="flex items-center justify-center w-[32px] h-[32px] hover:bg-white rounded-[4px] transition-colors"
                      >
                        <Star
                          size={22}
                          className={candidate.starred ? 'text-[#f59e0b] fill-[#f59e0b]' : 'text-[#d1d5db]'}
                          strokeWidth={1.5}
                        />
                      </button>
                      <button
                        onClick={() => setViewingCandidateId(candidate.id)}
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
              <div className="fixed inset-0 bg-[#edf0f8] z-50">
                <GroupCreationPage
                  positionTitle={positionTitle}
                  onCancel={() => setShowGroupCreationPage(false)}
                  onCreate={(groupData) => {
                    console.log('Group created:', groupData);
                    setShowGroupCreationPage(false);
                    // Store group data and show flow config modal
                    setPendingGroupData(groupData);
                    setShowFlowConfigModal(true);
                  }}
                />
              </div>
            ) : (
              <div className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-['Arimo',sans-serif] text-[20px] text-black">
                    Candidate Groups
                  </h2>
                  <button
                    onClick={() => setShowGroupCreationPage(true)}
                    className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] transition-colors"
                  >
                    <Plus size={18} className="text-white" strokeWidth={2} />
                    <span className="font-['Arimo',sans-serif] text-[14px] text-white">
                      Create Group
                    </span>
                  </button>
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
                      Create candidate groups to organize and track subsets of candidates through your recruitment pipeline.
                    </p>
                    <button
                      onClick={() => setShowGroupCreationPage(true)}
                      className="h-[44px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
                    >
                      Create Your First Group
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groups.map((group) => (
                      <div key={group.id} className="bg-white rounded-[12px] p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-['Arimo',sans-serif] text-[17px] text-black">
                                {group.name}
                              </h3>
                              <span className={`px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] ${group.status === 'Live' ? 'bg-[#dcfce7] text-[#10b981]' :
                                group.status === 'Paused' ? 'bg-[#fef3c7] text-[#f59e0b]' :
                                  'bg-[#f3f4f6] text-[#6b7280]'
                                }`}>
                                {group.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                              <span>{group.candidateCount} candidates</span>
                              <span>•</span>
                              <span>Assigned to {group.recruiter}</span>
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onViewGroup && onViewGroup(group.id)}
                            className="h-[36px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[13px] text-white transition-colors"
                          >
                            Open
                          </button>
                          <button className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors">
                            Rename
                          </button>
                          <button className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors">
                            Duplicate
                          </button>
                          <button className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors">
                            Export
                          </button>
                          <button className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#fef2f2] hover:border-[#ef4444] font-['Arimo',sans-serif] text-[13px] text-[#ef4444] transition-colors ml-auto">
                            Archive
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
          <div className="w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-['Arimo',sans-serif] text-[20px] text-black">
                Role Insights
              </h2>
              <button className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
                <Download size={18} className="text-[#6b7280]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  Export Insights
                </span>
              </button>
            </div>

            {/* Candidate Analytics Charts */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Candidate Fitting Distribution */}
              <div className="bg-white rounded-[12px] p-6 shadow-sm flex flex-col">
                <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-8">
                  Candidate Fitting Distribution
                </h3>
                <div className="flex-1 flex items-center justify-center">
                  <div className="relative flex items-center justify-center pt-6 pb-4" style={{ minHeight: '340px' }}>
                    {/* Pie Chart Container */}
                    <div className="relative" style={{ width: '280px', height: '280px', minWidth: '280px', minHeight: '280px' }}>
                      <ResponsiveContainer width={280} height={280}>
                        <PieChart>
                          <Pie
                            data={fittingData}
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius={120}
                            paddingAngle={1}
                            dataKey="value"
                            startAngle={90}
                            endAngle={450}
                          >
                            {fittingData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>

                      {/* Labels positioned around the pie */}
                      {fittingData.map((item, index) => {
                        // Position labels based on index for simplicity in this specific layout
                        // 0: Excellent (Top Right), 1: Good (Left), 2: Fair (Bottom), 3: Poor (Right)
                        // This matches the order in the mock data
                        const positions = [
                          { top: '40px', right: '-120px' }, // Excellent
                          { top: '120px', left: '-80px' },   // Good
                          { bottom: '-8px', left: '50%', transform: 'translateX(-50%)' }, // Fair
                          { top: '120px', right: '-70px' }  // Poor
                        ];
                        const pos = positions[index] || {};

                        return (
                          <div key={index} className="absolute" style={pos}>
                            <span className="font-['Arimo',sans-serif] text-[14px] whitespace-nowrap" style={{ color: item.color }}>
                              {item.name} ({index === 3 ? '<40%' : index === 2 ? '40-59%' : index === 1 ? '60-79%' : '80-100%'}): {item.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Score Distribution */}
              <div className="bg-white rounded-[12px] p-6 shadow-sm flex flex-col">
                <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-8">
                  Score Distribution
                </h3>
                <div className="flex-1 flex items-center justify-center">
                  <div style={{ width: '100%', height: '340px', minHeight: '340px' }}>
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={scoreData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" vertical={true} horizontal={true} />
                        <XAxis
                          dataKey="range"
                          axisLine={{ stroke: '#6b7280' }}
                          tickLine={false}
                          tick={{ fill: '#6b7280', fontSize: 13, fontFamily: 'Arimo, sans-serif' }}
                        />
                        <YAxis
                          axisLine={{ stroke: '#6b7280' }}
                          tickLine={false}
                          tick={{ fill: '#6b7280', fontSize: 13, fontFamily: 'Arimo, sans-serif' }}
                          domain={[0, 4]}
                          ticks={[0, 1, 2, 3, 4]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#374151',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '12px',
                            fontFamily: 'Arimo, sans-serif'
                          }}
                          cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                        />
                        <Bar dataKey="count" fill="#5b21b6" radius={[4, 4, 0, 0]} maxBarSize={80} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Insights Grid */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Skill Distribution */}
              <div className="bg-white rounded-[12px] p-6 shadow-sm">
                <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-4">
                  Skill Distribution
                </h3>
                <div className="space-y-3">
                  {skillDistribution.map((item, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                          {item.skill}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          {item.count} candidates ({item.percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#10b981]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seniority Distribution */}
              <div className="bg-white rounded-[12px] p-6 shadow-sm">
                <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-4">
                  Seniority Distribution
                </h3>
                <div className="space-y-3">
                  {seniorityDistribution.map((item, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                          {item.level}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          {item.count} candidates ({item.percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#6366f1]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* University Distribution */}
              <div className="bg-white rounded-[12px] p-6 shadow-sm">
                <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-4">
                  University Distribution
                </h3>
                <div className="space-y-3">
                  {universityDistribution.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                        {item.university}
                      </span>
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        {item.count} candidates
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Availability Distribution */}
              <div className="bg-white rounded-[12px] p-6 shadow-sm">
                <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-4">
                  Availability Distribution
                </h3>
                <div className="space-y-3">
                  {availabilityDistribution.map((item, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                          {(item as any).availability}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          {item.count} candidates ({item.percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#f59e0b]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Assessment Performance */}
            <div className="bg-white rounded-[12px] p-6 shadow-sm">
              <h3 className="font-['Arimo',sans-serif] text-[18px] text-black mb-4">
                Assessment Performance Distribution
              </h3>
              <div style={{ width: '100%', height: '300px', minHeight: '300px' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={scoreData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                    <XAxis
                      dataKey="range"
                      axisLine={{ stroke: '#6b7280' }}
                      tick={{ fill: '#6b7280', fontSize: 13, fontFamily: 'Arimo, sans-serif' }}
                    />
                    <YAxis
                      axisLine={{ stroke: '#6b7280' }}
                      tick={{ fill: '#6b7280', fontSize: 13, fontFamily: 'Arimo, sans-serif' }}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
                onClick={() => setShowZipUploadModal(false)}
                className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
              >
                <X size={18} className="text-[#6b7280]" />
              </button>
            </div>

            <div className="border-2 border-dashed border-[#e5e7eb] rounded-[12px] p-12 text-center mb-6 hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors cursor-pointer">
              <Upload size={48} className="text-[#6b7280] mx-auto mb-4" />
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
                Drag and drop your ZIP file here, or click to browse
              </p>
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                Supported format: .zip (max 100MB)
              </p>
            </div>

            <div className="bg-[#f9fafb] rounded-[8px] p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-[6px] h-[6px] rounded-full bg-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                  Parsing Status
                </span>
              </div>
              <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden mb-2">
                <div className="h-full bg-[#6366f1] rounded-full w-0" style={{ width: '0%' }} />
              </div>
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                Waiting for upload...
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowZipUploadModal(false)}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                disabled
                className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
              >
                Add to Position
              </button>
            </div>
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
          onSave={(flowConfig) => {
            console.log('Flow config saved:', flowConfig);
            setShowFlowConfigModal(false);
            if (onViewGroup) {
              onViewGroup(`group-${Date.now()}`);
            }
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