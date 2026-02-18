import { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, Filter, X, ChevronDown, Check, User, MapPin, Briefcase, Star, ArrowUpDown, Users, Sliders, ChevronLeft } from 'lucide-react';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import { AdvancedFilterDrawer } from '../candidates/AdvancedFilterDrawer';
import { api } from '../../../services/api';

interface Candidate {
  id: string;
  name: string;
  email: string;
  experience: number;
  location: string;
  skills: string[];
  match: number;
  aiScore?: number;
  starred: boolean;
  // Detailed fields
  companies?: string[];
  job_titles?: string[];
  universities?: string[];
  degrees?: string[];
  // Group fields
  groupId?: string;
  groupName?: string;
}

interface GroupCreationPageProps {
  positionTitle: string;
  positionId: string;
  onCancel: () => void;
  onCreate: (groupData: {
    name: string;
    candidateIds: string[];
    aiRankingUsed: boolean;
    nlpQuery?: string;
  }) => void;
}

export function GroupCreationPage({
  positionTitle,
  positionId,
  onCancel,
  onCreate
}: GroupCreationPageProps) {
  // Candidate data state
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillsFilter, setSkillsFilter] = useState<string[]>([]);

  // Fetch candidates from API
  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        setLoading(true);
        // Fetch candidates for this specific position
        const response = await api.recruiter.getPositionDetails(positionId);
        console.log('GroupCreationPage response:', response);

        // Extract candidates from response details
        if (response && (response as any).candidates) {
          console.log('All candidates:', (response as any).candidates);
          // Filter out candidates who are already in a group, UNLESS it's "Main Pipeline"
          const availableCandidates = ((response as any).candidates as any[]).filter(c => {
            const isMainPipeline = c.groupName === "Main Pipeline";
            const available = (!c.groupId && !c.groupName) || isMainPipeline;

            if (!available) console.log('Filtered out:', c.name, c.groupId, c.groupName);
            return available;
          });
          console.log('Available candidates:', availableCandidates);
          setAllCandidates(availableCandidates);
        } else {
          console.log('No candidates in response');
        }
      } catch (error) {
        console.error('Failed to fetch group candidates:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [positionId]);

  // Filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<any>({});
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // AI Features
  const [aiRankingEnabled, setAiRankingEnabled] = useState(false);
  const [nlpQuery, setNlpQuery] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Selection
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [customBulkNumber, setCustomBulkNumber] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Group Details
  const [groupName, setGroupName] = useState('');

  // Apply manual filters from advanced drawer
  const filteredCandidates = useMemo(() => {
    let filtered = [...allCandidates];
    const f = advancedFilters;

    // 1. Identity
    if (f.fullName) {
      filtered = filtered.filter(c => c.name.toLowerCase().includes(f.fullName.toLowerCase()));
    }
    if (f.location) {
      filtered = filtered.filter(c => c.location && c.location.toLowerCase().includes(f.location.toLowerCase()));
    }

    // 2. Education
    if (f.school) {
      filtered = filtered.filter(c => c.universities?.some(u => u.toLowerCase().includes(f.school.toLowerCase())));
    }
    if (f.degree && f.degree.length > 0) {
      filtered = filtered.filter(c => c.degrees?.some(d => f.degree.some((fd: string) => d.toLowerCase().includes(fd.toLowerCase()))));
    }

    // 3. Work Experience
    if (f.company) {
      filtered = filtered.filter(c => c.companies?.some(comp => comp.toLowerCase().includes(f.company.toLowerCase())));
    }
    if (f.jobTitle) {
      filtered = filtered.filter(c => c.job_titles?.some(t => t.toLowerCase().includes(f.jobTitle.toLowerCase())));
    }
    if (f.yearsMin > 0 || f.yearsMax < 20) {
      filtered = filtered.filter(c => c.experience >= f.yearsMin && c.experience <= f.yearsMax);
    }

    // 4. Skills
    if (f.techStack && f.techStack.length > 0) {
      // Assume AND logic for now (must have all selected skills)
      filtered = filtered.filter(c => f.techStack.every((s: string) => c.skills.some(cs => cs.toLowerCase().includes(s.toLowerCase()))));
    }

    // 5. Match Score (Optional, reusing assessment score slider if desired, or adding new one)
    // For now, we don't have a specific Match Score filter in the drawer, but we could use the AI Ranking.

    return filtered;
  }, [allCandidates, advancedFilters]);

  // Apply AI ranking or default sorting
  const displayCandidates = useMemo(() => {
    if (!aiRankingEnabled) {
      // Sort by match score descending by default
      return [...filteredCandidates].sort((a, b) => b.match - a.match);
    }

    // Simulate AI ranking by adding AI scores and reordering
    const withAiScores = filteredCandidates.map(c => ({
      ...c,
      aiScore: c.match + Math.floor(Math.random() * 10) - 5 // Simulate AI adjustment
    }));

    return withAiScores.sort((a, b) => (b.aiScore || b.match) - (a.aiScore || a.match));
  }, [filteredCandidates, aiRankingEnabled]);

  const handleAiEnhance = () => {
    if (!nlpQuery.trim()) return;

    setIsAiProcessing(true);
    setTimeout(() => {
      setAiRankingEnabled(true);
      setIsAiProcessing(false);
    }, 1500);
  };

  const toggleSkillFilter = (skill: string) => {
    setSkillsFilter(prev =>
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectTopN = (n: number) => {
    const topIds = displayCandidates.slice(0, n).map(c => c.id);
    setSelectedCandidates(new Set(topIds));
  };

  const handleCustomBulkSelect = () => {
    const n = parseInt(customBulkNumber);
    if (!isNaN(n) && n > 0) {
      selectTopN(n);
      setShowCustomInput(false);
      setCustomBulkNumber('');
    }
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selectedCandidates.size === 0) return;

    onCreate({
      name: groupName,
      candidateIds: Array.from(selectedCandidates),
      aiRankingUsed: aiRankingEnabled,
      nlpQuery: nlpQuery || undefined
    });
  };

  const getMatchColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ffa366';
  };

  return (
    <div className="h-full w-full bg-[#edf0f8] flex flex-col">
      {/* Top Section - Discovery Engine */}
      <div className="bg-white border-b border-[#e5e7eb] px-8 py-6">
        {/* Back Button */}
        <button
          onClick={onCancel}
          className="flex items-center gap-2 mb-4 font-['Arimo',sans-serif] text-[14px] text-[#6366f1] hover:underline"
        >
          <ChevronLeft size={16} />
          Back to Position Dashboard
        </button>

        <div className="mb-6">
          <h2 className="text-[#111827] mb-1">
            Create Candidate Group
          </h2>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            for {positionTitle}
          </p>
        </div>

        {/* Unified Search & Filter Toolbar */}
        <div className="mb-6 flex items-center gap-4">
          {/* Search Bar - Flex Grow */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              value={nlpQuery}
              onChange={(e) => setNlpQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiEnhance()}
              placeholder="Search by skills, role, or describe ideal profile (e.g. 'Java expert with fintech exp')..."
              className="w-full h-[48px] pl-[40px] pr-[120px] rounded-[10px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent shadow-sm transition-all"
            />
            {/* Enhance Button inside Input */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <button
                onClick={handleAiEnhance}
                disabled={!nlpQuery.trim() || isAiProcessing}
                className="h-[36px] px-[16px] rounded-[8px] bg-[#10b981] hover:bg-[#059669] disabled:bg-[#f3f4f6] disabled:text-[#9ca3af] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[13px] text-white flex items-center gap-1.5 transition-colors font-medium"
              >
                {isAiProcessing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Sparkles size={14} /> AI Sort</>
                )}
              </button>
            </div>
          </div>

          {/* AI Toggle */}
          <div className="flex items-center gap-3 h-[48px] px-[16px] rounded-[10px] bg-white border border-[#e5e7eb] shadow-sm">
            <span className="font-['Arimo',sans-serif] text-[13px] font-medium text-[#374151]">AI Rank</span>
            <Switch checked={aiRankingEnabled} onCheckedChange={setAiRankingEnabled} />
          </div>

          {/* Advanced Filter Button */}
          <button
            onClick={() => setShowAdvancedFilters(true)}
            className={`h-[48px] px-[20px] rounded-[10px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] flex items-center gap-2 transition-all shadow-sm ${activeFilterCount > 0 ? 'border-[#6366f1] text-[#6366f1] bg-[#eef2ff]' : ''}`}
          >
            <Sliders size={18} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-[#6366f1] text-white rounded-full min-w-[20px] h-[20px] px-1 flex items-center justify-center text-[11px] font-medium">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* Active Query Indicator */}
        {aiRankingEnabled && nlpQuery && (
          <div className="mb-6 px-[16px] py-[10px] rounded-[10px] bg-[#f0fdf4] border border-[#bbf7d0] flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Sparkles size={16} className="text-[#15803d]" />
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#15803d] font-medium">
              Active AI Context: "{nlpQuery}"
            </p>
          </div>
        )}

        {/* Middle Section - Candidate Grid */}
      </div>

      {/* Middle Section - Candidate Grid */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {/* Bulk Selection Toolbar */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Quick Select:
              </span>
              <button
                onClick={() => selectTopN(10)}
                className="h-[32px] px-[12px] rounded-[6px] bg-[#f3f4f6] hover:bg-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
              >
                Top 10
              </button>
              <button
                onClick={() => selectTopN(50)}
                className="h-[32px] px-[12px] rounded-[6px] bg-[#f3f4f6] hover:bg-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
              >
                Top 50
              </button>
              {showCustomInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={customBulkNumber}
                    onChange={(e) => setCustomBulkNumber(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomBulkSelect()}
                    placeholder="N"
                    className="w-[60px] h-[32px] px-[8px] rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                    autoFocus
                  />
                  <button
                    onClick={handleCustomBulkSelect}
                    className="h-[32px] px-[12px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[12px] text-white transition-colors"
                  >
                    Select
                  </button>
                  <button
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomBulkNumber('');
                    }}
                    className="h-[32px] px-[8px] rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
                  >
                    <X size={14} className="text-[#6b7280]" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomInput(true)}
                  className="h-[32px] px-[12px] rounded-[6px] bg-[#f3f4f6] hover:bg-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
                >
                  Custom N
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                {selectedCandidates.size} selected
              </span>
              {selectedCandidates.size > 0 && (
                <button
                  onClick={() => setSelectedCandidates(new Set())}
                  className="h-[32px] px-[12px] rounded-[6px] border border-[#e5e7eb] hover:bg-[#fef2f2] hover:border-[#ef4444] font-['Arimo',sans-serif] text-[12px] text-[#ef4444] transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mb-4 flex items-center justify-between">
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            Showing {displayCandidates.length} candidates
          </p>
          {aiRankingEnabled && (
            <div className="flex items-center gap-2 px-[12px] py-[6px] rounded-[6px] bg-[#f0fdf4] border border-[#bbf7d0]">
              <Sparkles size={14} className="text-[#10b981]" />
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#15803d]">
                AI Ranked
              </span>
            </div>
          )}
        </div>

        {/* Candidates Table */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
              <tr>
                <th className="w-[50px] px-4 py-3"></th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  <div className="flex items-center gap-2">
                    <User size={14} />
                    Candidate
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  <div className="flex items-center gap-2">
                    <Briefcase size={14} />
                    Experience
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    Location
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  Skills
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  <div className={`flex items-center gap-2 ${aiRankingEnabled ? 'text-[#10b981]' : ''}`}>
                    <ArrowUpDown size={14} />
                    {aiRankingEnabled ? 'AI Score' : 'Match Score'}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayCandidates.map((candidate, index) => (
                <tr
                  key={candidate.id}
                  className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer ${selectedCandidates.has(candidate.id) ? 'bg-[#eef2ff]' : ''
                    }`}
                  onClick={() => toggleCandidateSelection(candidate.id)}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedCandidates.has(candidate.id)}
                      onChange={() => toggleCandidateSelection(candidate.id)}
                      className="w-4 h-4 rounded border-[#d1d5db] text-[#6366f1] focus:ring-[#6366f1]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                        {candidate.name}
                      </div>
                      <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                        {candidate.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                      {candidate.experience} years
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                      {candidate.location}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills.slice(0, 3).map((skill, i) => (
                        <span
                          key={i}
                          className="px-[8px] py-[2px] rounded-[4px] bg-[#f3f4f6] font-['Arimo',sans-serif] text-[11px] text-[#374151]"
                        >
                          {skill}
                        </span>
                      ))}
                      {candidate.skills.length > 3 && (
                        <span className="px-[8px] py-[2px] rounded-[4px] bg-[#f3f4f6] font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                          +{candidate.skills.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-[60px] h-[8px] rounded-full bg-[#e5e7eb] overflow-hidden"
                      >
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${candidate.aiScore || candidate.match}%`,
                            backgroundColor: getMatchColor(candidate.aiScore || candidate.match)
                          }}
                        />
                      </div>
                      <span
                        className="font-['Arimo',sans-serif] text-[13px] min-w-[35px]"
                        style={{ color: getMatchColor(candidate.aiScore || candidate.match) }}
                      >
                        {candidate.aiScore || candidate.match}%
                      </span>
                      {aiRankingEnabled && candidate.aiScore && candidate.aiScore !== candidate.match && (
                        <span className="font-['Arimo',sans-serif] text-[11px] text-[#10b981]">
                          ↑
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[12px] border border-[#e5e7eb]">
            <div className="w-10 h-10 border-4 border-[#e0e7ff] border-t-[#6366f1] rounded-full animate-spin mb-4" />
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              Finding the best matches...
            </p>
          </div>
        ) : displayCandidates.length === 0 && (
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-12 text-center">
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              No candidates match your current filters
            </p>
          </div>
        )}
      </div>

      {/* Bottom Section - Sticky Footer */}
      <div className="bg-white border-t border-[#e5e7eb] px-8 py-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Senior Backend Engineers - Q1 2025"
              className="w-full h-[44px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <div className="text-right">
              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                Selected Candidates
              </div>
              <div className="text-[#111827]">
                {selectedCandidates.size}
              </div>
            </div>
            <button
              onClick={onCancel}
              className="h-[44px] px-[24px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedCandidates.size === 0}
              className="h-[44px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#d1d5db] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors flex items-center gap-2"
            >
              <Users size={16} />
              Create Group
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filter Drawer */}
      {showAdvancedFilters && (
        <AdvancedFilterDrawer
          onClose={() => setShowAdvancedFilters(false)}
          hidePostProcessFilters={true}
          onApply={(filters) => {
            setAdvancedFilters(filters);
            setShowAdvancedFilters(false);
            // Count active filters
            let count = 0;
            if (filters.fullName) count++;
            if (filters.email) count++;
            if (filters.location) count++;
            if (filters.school) count++;
            if (filters.company) count++;
            if (filters.techStack?.length > 0) count++;
            if (filters.seniority?.length > 0) count++;
            if (filters.degree?.length > 0) count++;
            setActiveFilterCount(count);
          }}
          activeFilters={advancedFilters}
        />
      )}
    </div>
  );
}