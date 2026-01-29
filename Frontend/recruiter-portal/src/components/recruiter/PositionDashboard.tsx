import { useState, useEffect } from 'react';
import { ChevronLeft, Filter, Search, X, AlertTriangle, Eye, Users, ArrowUpDown, Download, Network, Loader2 } from 'lucide-react';
import { AdvancedFilterDrawer } from './AdvancedFilterDrawer';
import { SemanticSearchModal } from './SemanticSearchModal';
import { EnhancedGroupCreationModal } from './EnhancedGroupCreationModal';
import { MiniKGTreePopover } from './MiniKGTreePopover';
import { api } from '../../services/api';

interface Candidate {
  id: number;
  name: string;
  email: string;
  match: number;
  score: number;
  antiCheating: boolean;
  skills: string[];
  lastActivity: string;
  tags: string[];
  experienceLevel: string;
  seniority: string;
  location: string;
  availability: string;
  education: string;
  yearsOfExperience: number;
  assessmentScore: number;
  aiInterviewScore: number;
  githubScore: number;
  linkedinCompleteness: number;
  salaryExpectation: string;
}

interface PositionDashboardProps {
  positionTitle: string;
  projectTitle: string;
  onBack: () => void;
  initialShowGroups?: boolean;
  onViewCandidate: (candidateId: number) => void;
  onCreateGroup: (candidates: number[], groupData: any) => void;
  onViewGroup?: (groupId: string) => void;
}

export function PositionDashboard({
  positionTitle,
  projectTitle,
  onBack,
  initialShowGroups = false,
  onViewCandidate,
  onCreateGroup,
  onViewGroup
}: PositionDashboardProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]); // Initialize empty
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        setIsLoading(true);
        const data = await api.recruiter.getCandidates();
        // Since api.ts currently returns [], let's populate it with the mock data if empty (for demo purposes) 
        // OR better: I will update api.ts to return the rich mock data. 
        // For this file, I expect 'data' to be the array.
        setCandidates(data as Candidate[]);
        setFilteredCandidates(data as Candidate[]);
      } catch (error) {
        console.error("Failed to fetch candidates", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCandidates();
  }, []);

  // Fetch groups based on project title lookup
  const [recentGroups, setRecentGroups] = useState<any[]>([]);

  useEffect(() => {
    const fetchProjectAndGroups = async () => {
      try {
        // 1. Get project ID from title
        const projects = await api.recruiter.getProjects();
        const project = projects.find(p => p.projectName === projectTitle);
        const projectId = project ? project.id.toString() : '1';

        // 2. Fetch groups for this project
        const groups = await api.recruiter.getProjectGroups(projectId);

        // Map to UI specific format
        const mappedGroups = groups.map((g: any) => ({
          id: g.id.toString(),
          name: g.groupName,
          candidates: g.candidatesCount,
          recruiter: g.recruiter || 'Admin',
          progress: 50, // mock progress
          status: g.status
        }));
        setRecentGroups(mappedGroups);
      } catch (error) {
        console.error("Failed to fetch groups");
      }
    };

    fetchProjectAndGroups();
  }, [projectTitle]);

  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [showGroupCreation, setShowGroupCreation] = useState(false);
  const [sortField, setSortField] = useState<string>('match');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [miniKGCandidate, setMiniKGCandidate] = useState<{ id: number; name: string; avatar: string; position: { x: number; y: number } } | null>(null);
  const [showRecentGroups, setShowRecentGroups] = useState(initialShowGroups);
  const [showSaveFilterDialog, setShowSaveFilterDialog] = useState(false);
  const [filterTemplateName, setFilterTemplateName] = useState('');
  const [savedFilterTemplates, setSavedFilterTemplates] = useState<Array<{ name: string; filters: any }>>([
    {
      name: 'Senior Developers (Remote)',
      filters: {
        experienceLevel: ['Senior'],
        seniority: [],
        location: ['Remote'],
        availability: [],
        education: [],
        skills: []
      }
    },
    {
      name: 'Mid-Level Engineers',
      filters: {
        experienceLevel: ['Mid'],
        seniority: [],
        location: [],
        availability: [],
        education: [],
        skills: ['React', 'TypeScript']
      }
    },
  ]);

  // Recent groups state handles the data now


  // Quick filters
  const [quickFilters, setQuickFilters] = useState({
    experienceLevel: [] as string[],
    seniority: [] as string[],
    location: [] as string[],
    availability: [] as string[],
    education: [] as string[],
    skills: [] as string[]
  });

  const toggleQuickFilter = (category: keyof typeof quickFilters, value: string) => {
    setQuickFilters(prev => {
      const current = prev[category];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [category]: updated };
    });
  };

  const removeQuickFilter = (category: keyof typeof quickFilters, value: string) => {
    setQuickFilters(prev => ({
      ...prev,
      [category]: prev[category].filter(v => v !== value)
    }));
  };

  const clearAllFilters = () => {
    setQuickFilters({
      experienceLevel: [],
      seniority: [],
      location: [],
      availability: [],
      education: [],
      skills: []
    });
    setFilteredCandidates(candidates);
  };

  // Get all active filters
  const getActiveFilters = () => {
    const active: Array<{ category: keyof typeof quickFilters; value: string }> = [];
    Object.entries(quickFilters).forEach(([category, values]) => {
      values.forEach(value => {
        active.push({ category: category as keyof typeof quickFilters, value });
      });
    });
    return active;
  };

  const activeFilters = getActiveFilters();

  const handleSaveFilterTemplate = () => {
    if (filterTemplateName.trim() && activeFilters.length > 0) {
      const newTemplate = {
        name: filterTemplateName,
        filters: { ...quickFilters }
      };
      setSavedFilterTemplates([...savedFilterTemplates, newTemplate]);
      setFilterTemplateName('');
      setShowSaveFilterDialog(false);
    }
  };

  const handleLoadFilterTemplate = (template: { name: string; filters: any }) => {
    // Merge template filters with default empty arrays to ensure all properties exist
    setQuickFilters({
      experienceLevel: template.filters.experienceLevel || [],
      seniority: template.filters.seniority || [],
      location: template.filters.location || [],
      availability: template.filters.availability || [],
      education: template.filters.education || [],
      skills: template.filters.skills || []
    });
  };

  const toggleSelectCandidate = (id: number) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCandidates.length === filteredCandidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(filteredCandidates.map(c => c.id));
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const topSkills = ['React', 'TypeScript', 'Python', 'Java', 'AWS', 'Docker'];

  return (
    <div className="h-full w-full overflow-hidden flex">
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto px-[48px] py-[24px]">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={onBack}
              className="flex items-center gap-2 mb-4 text-[#6b7280] hover:text-[#111827] transition-colors"
            >
              <ChevronLeft size={20} />
              <span className="font-['Arimo',sans-serif] text-[14px]">Back to Position</span>
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[#111827] mb-1">{positionTitle}</h1>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  {projectTitle} • {filteredCandidates.length} candidates
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSemanticSearch(true)}
                  className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] transition-colors relative"
                >
                  <Search size={18} className="text-white" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white">
                    Search with AI
                  </span>
                  {filteredCandidates.length < candidates.length && (
                    <span className="absolute -top-2 -right-2 w-[24px] h-[24px] rounded-full bg-[#10b981] text-white font-['Arimo',sans-serif] text-[11px] flex items-center justify-center">
                      {filteredCandidates.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                >
                  <Filter size={18} className="text-[#6366f1]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Advanced Filters
                  </span>
                  {activeFilters.length > 0 && (
                    <span className="w-[20px] h-[20px] rounded-full bg-[#6366f1] text-white font-['Arimo',sans-serif] text-[11px] flex items-center justify-center">
                      {activeFilters.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Quick Filters:
                </span>
                {Object.values(quickFilters).some(arr => arr.length > 0) && (
                  <button
                    onClick={clearAllFilters}
                    className="font-['Arimo',sans-serif] text-[12px] text-[#6366f1] hover:underline"
                  >
                    Clear all ({activeFilters.length})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilters.length > 0 && (
                  <button
                    onClick={() => setShowSaveFilterDialog(true)}
                    className="h-[32px] px-[12px] rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
                  >
                    Save Filter Template
                  </button>
                )}
                <div className="relative">
                  <select
                    onChange={(e) => {
                      const template = savedFilterTemplates.find(t => t.name === e.target.value);
                      if (template) handleLoadFilterTemplate(template);
                    }}
                    value=""
                    className="h-[32px] pl-[12px] pr-[32px] rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors cursor-pointer"
                  >
                    <option value="">Load Template</option>
                    {savedFilterTemplates.map((template, index) => (
                      <option key={index} value={template.name}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setShowRecentGroups(!showRecentGroups)}
                  className={`h-[32px] px-[12px] rounded-[6px] border transition-colors ${showRecentGroups
                    ? 'border-[#6366f1] bg-[#f5f3ff] text-[#6366f1]'
                    : 'border-[#e5e7eb] bg-white hover:bg-[#f9fafb] text-[#374151]'
                    } font-['Arimo',sans-serif] text-[12px]`}
                >
                  Recent Groups
                </button>
              </div>
            </div>

            {/* Active Filters */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-[#e5e7eb]">
                {activeFilters.map((filter, index) => (
                  <button
                    key={index}
                    onClick={() => removeQuickFilter(filter.category, filter.value)}
                    className="h-[28px] pl-[12px] pr-[8px] rounded-[14px] bg-[#6366f1] text-white font-['Arimo',sans-serif] text-[12px] flex items-center gap-2 hover:bg-[#5558e3] transition-colors"
                  >
                    {filter.value}
                    <X size={12} />
                  </button>
                ))}
              </div>
            )}

            {/* Available Filters */}
            <div className="flex flex-wrap gap-2">
              {/* Experience Level */}
              {['Junior', 'Mid', 'Senior'].map(level => (
                <button
                  key={level}
                  onClick={() => toggleQuickFilter('experienceLevel', level)}
                  className={`h-[32px] px-[16px] rounded-[16px] font-['Arimo',sans-serif] text-[13px] transition-colors ${quickFilters.experienceLevel.includes(level)
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                >
                  {level}
                </button>
              ))}
              <div className="w-[1px] bg-[#e5e7eb] mx-1" />
              {/* Location */}
              {['San Francisco', 'New York', 'Remote'].map(loc => (
                <button
                  key={loc}
                  onClick={() => toggleQuickFilter('location', loc)}
                  className={`h-[32px] px-[16px] rounded-[16px] font-['Arimo',sans-serif] text-[13px] transition-colors ${quickFilters.location.includes(loc)
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                >
                  {loc}
                </button>
              ))}
              <div className="w-[1px] bg-[#e5e7eb] mx-1" />
              {/* Availability */}
              {['Immediate', '2 weeks', '1 month'].map(avail => (
                <button
                  key={avail}
                  onClick={() => toggleQuickFilter('availability', avail)}
                  className={`h-[32px] px-[16px] rounded-[16px] font-['Arimo',sans-serif] text-[13px] transition-colors ${quickFilters.availability.includes(avail)
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                >
                  {avail}
                </button>
              ))}
              <div className="w-[1px] bg-[#e5e7eb] mx-1" />
              {/* Top Skills */}
              {topSkills.map(skill => (
                <button
                  key={skill}
                  onClick={() => toggleQuickFilter('skills', skill)}
                  className={`h-[32px] px-[16px] rounded-[16px] font-['Arimo',sans-serif] text-[13px] transition-colors ${quickFilters.skills.includes(skill)
                    ? 'bg-[#10b981] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>

          {/* Candidate Table */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                  <tr>
                    <th className="text-left p-4 w-[40px]">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.length === filteredCandidates.length && filteredCandidates.length > 0}
                        onChange={toggleSelectAll}
                        className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                      />
                    </th>
                    <th className="text-left p-4">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                      >
                        Name
                        <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Email
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <button
                        onClick={() => handleSort('match')}
                        className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                      >
                        Match %
                        <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <button
                        onClick={() => handleSort('score')}
                        className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                      >
                        Score
                        <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Flags
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Skills
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Last Activity
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Tags
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        KG
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
                  {filteredCandidates.map((candidate, index) => (
                    <tr
                      key={candidate.id}
                      className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors ${index === filteredCandidates.length - 1 ? 'border-b-0' : ''
                        }`}
                    >
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedCandidates.includes(candidate.id)}
                          onChange={() => toggleSelectCandidate(candidate.id)}
                          className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                          {candidate.name}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {candidate.email}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-[60px] h-[6px] bg-[#f3f4f6] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${candidate.match}%`,
                                backgroundColor: candidate.match >= 80 ? '#10b981' : candidate.match >= 60 ? '#f59e0b' : '#ffa366'
                              }}
                            />
                          </div>
                          <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                            {candidate.match}%
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                          {candidate.score}
                        </span>
                      </td>
                      <td className="p-4">
                        {candidate.antiCheating && (
                          <div className="flex items-center gap-1 text-[#ef4444]">
                            <AlertTriangle size={16} />
                            <span className="font-['Arimo',sans-serif] text-[12px]">
                              Flagged
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {candidate.skills.slice(0, 3).map((skill, i) => (
                            <span
                              key={i}
                              className="px-[8px] py-[2px] bg-[#ede9fe] text-[#6366f1] rounded-[4px] font-['Arimo',sans-serif] text-[11px]"
                            >
                              {skill}
                            </span>
                          ))}
                          {candidate.skills.length > 3 && (
                            <span className="px-[8px] py-[2px] text-[#6b7280] font-['Arimo',sans-serif] text-[11px]">
                              +{candidate.skills.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          {candidate.lastActivity}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {candidate.tags.slice(0, 2).map((tag, i) => (
                            <span
                              key={i}
                              className="px-[8px] py-[2px] bg-[#f3f4f6] text-[#374151] rounded-[4px] font-['Arimo',sans-serif] text-[11px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const nameParts = candidate.name.split(' ');
                            const avatar = nameParts.map(n => n[0]).join('');
                            setMiniKGCandidate({
                              id: candidate.id,
                              name: candidate.name,
                              avatar: avatar,
                              position: { x: rect.left + rect.width / 2, y: rect.top }
                            });
                          }}
                          className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] hover:bg-[#f5f3ff] hover:border-[#6366f1] transition-colors"
                          title="View Knowledge Graph"
                        >
                          <Network size={14} className="text-[#6366f1]" />
                        </button>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => onViewCandidate(candidate.id)}
                          className="flex items-center gap-2 h-[32px] px-[12px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] transition-colors"
                        >
                          <Eye size={14} className="text-white" />
                          <span className="font-['Arimo',sans-serif] text-[12px] text-white">
                            Profile
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Mini KG Tree Popover */}
      {miniKGCandidate && (
        <MiniKGTreePopover
          candidateName={miniKGCandidate.name}
          candidateAvatar={miniKGCandidate.avatar}
          topSkills={[
            { name: 'React', strength: 95 },
            { name: 'TypeScript', strength: 88 },
            { name: 'Node.js', strength: 82 }
          ]}
          topRepos={[
            { name: 'react-dashboard', commits: 342 },
            { name: 'typescript-utils', commits: 156 },
            { name: 'node-api', commits: 89 }
          ]}
          topRoles={[
            { name: 'Senior Full Stack Developer', years: 5 },
            { name: 'Frontend Lead', years: 3 },
            { name: 'Tech Lead', years: 2 }
          ]}
          onOpenFullKG={() => {
            setMiniKGCandidate(null);
            onViewCandidate(miniKGCandidate.id);
          }}
          onClose={() => setMiniKGCandidate(null)}
          position={miniKGCandidate.position}
        />
      )}

      {/* Advanced Filter Drawer */}
      {showAdvancedFilters && (
        <AdvancedFilterDrawer
          onClose={() => setShowAdvancedFilters(false)}
          onApply={(filters) => {
            // Apply advanced filters
            console.log('Applied filters:', filters);
            setShowAdvancedFilters(false);
          }}
          activeFilters={{}}
        />
      )}

      {/* Semantic Search Modal */}
      {showSemanticSearch && (
        <SemanticSearchModal
          onClose={() => setShowSemanticSearch(false)}
          onSearch={(query, reRank) => {
            // Handle semantic search
            console.log('Semantic search:', query, 'Re-rank:', reRank);
            setShowSemanticSearch(false);
            // Show toast notification
            const toast = document.createElement('div');
            toast.className = 'fixed top-[100px] right-[24px] bg-[#10b981] text-white px-[20px] py-[12px] rounded-[8px] shadow-lg z-50 animate-slideInRight';
            toast.innerHTML = `<span class="font-['Arimo',sans-serif] text-[14px]">${reRank ? 'Semantic refinement applied — results re-ordered' : 'Semantic search completed'}</span>`;
            document.body.appendChild(toast);
            setTimeout(() => document.body.removeChild(toast), 3000);
          }}
          hasActiveFilters={activeFilters.length > 0}
        />
      )}

      {/* Group Creation Modal */}
      {showGroupCreation && (
        <EnhancedGroupCreationModal
          selectedCount={selectedCandidates.length}
          onClose={() => setShowGroupCreation(false)}
          onCreate={(groupData) => {
            onCreateGroup(selectedCandidates, groupData);
            setShowGroupCreation(false);
            setSelectedCandidates([]);
          }}
          filterSummary={activeFilters.map(f => f.value)}
          onEditFilters={() => {
            setShowGroupCreation(false);
            setShowAdvancedFilters(true);
          }}
        />
      )}

      {/* Sticky Bottom Action Bar */}
      {selectedCandidates.length > 0 && (
        <div className="fixed bottom-0 left-[280px] right-0 bg-white border-t border-[#e5e7eb] shadow-lg z-20">
          <div className="max-w-[1600px] mx-auto px-[48px] py-[16px] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                {selectedCandidates.length} candidate{selectedCandidates.length > 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedCandidates([])}
                className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1] hover:underline"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 h-[36px] px-[16px] rounded-[6px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
                <Download size={16} className="text-[#6b7280]" />
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                  Export
                </span>
              </button>
              <button
                onClick={() => setShowGroupCreation(true)}
                className="flex items-center gap-2 h-[36px] px-[20px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] transition-colors"
              >
                <Users size={16} className="text-white" />
                <span className="font-['Arimo',sans-serif] text-[13px] text-white">
                  Create Group ({selectedCandidates.length})
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Filter Template Dialog */}
      {showSaveFilterDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[400px] p-6 animate-scaleIn">
            <h3 className="text-[#111827] text-[18px] mb-4">
              Save Filter Template
            </h3>
            <input
              type="text"
              value={filterTemplateName}
              onChange={(e) => setFilterTemplateName(e.target.value)}
              placeholder="Enter template name..."
              className="w-full h-[44px] px-[14px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveFilterTemplate()}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSaveFilterDialog(false);
                  setFilterTemplateName('');
                }}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFilterTemplate}
                disabled={!filterTemplateName.trim()}
                className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Groups Panel */}
      {showRecentGroups && (
        <>
          <div
            className="fixed inset-0 bg-transparent z-40"
            onClick={() => setShowRecentGroups(false)}
          />
          <div className="fixed top-0 right-0 bottom-0 w-[380px] bg-white border-l border-[#e5e7eb] shadow-2xl z-50 flex flex-col animate-slideInRight">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-[#e5e7eb] px-6 py-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[#111827]">Recent Groups</h2>
                <button
                  onClick={() => setShowRecentGroups(false)}
                  className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
                >
                  <X size={18} className="text-[#6b7280]" />
                </button>
              </div>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                {positionTitle} • {recentGroups.length} active groups
              </p>
            </div>

            {/* Groups List */}
            <div className="flex-1 overflow-auto px-6 py-6 space-y-4">
              {recentGroups.map((group) => (
                <div key={group.id} className="bg-[#f9fafb] rounded-[12px] p-4 border border-[#e5e7eb] hover:border-[#6366f1] transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-['Arimo',sans-serif] text-[15px] text-[#111827] mb-1">
                        {group.name}
                      </h3>
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                        {group.candidates} candidates
                      </p>
                    </div>
                    <span className={`px-[8px] py-[3px] rounded-[6px] font-['Arimo',sans-serif] text-[11px] ${group.status === 'Live' ? 'bg-[#dcfce7] text-[#10b981]' :
                      group.status === 'Paused' ? 'bg-[#fef3c7] text-[#f59e0b]' :
                        'bg-[#f3f4f6] text-[#6b7280]'
                      }`}>
                      {group.status}
                    </span>
                  </div>
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                        Progress
                      </span>
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#111827]">
                        {group.progress}%
                      </span>
                    </div>
                    <div className="w-full h-[4px] bg-[#e5e7eb] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#6366f1] transition-all"
                        style={{ width: `${group.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-['Arimo',sans-serif] text-[#6b7280]">
                      {group.recruiter}
                    </span>
                    <button
                      onClick={() => onViewGroup && onViewGroup(group.id)}
                      className="h-[28px] px-[12px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[11px] text-white transition-colors"
                    >
                      Open Group
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slideInRight {
          animation: slideInRight 280ms ease-out;
        }
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