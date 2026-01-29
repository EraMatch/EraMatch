import { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, Filter, X, ChevronDown, Check, User, MapPin, Briefcase, Star, ArrowUpDown, Users, Sliders, ChevronLeft } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { AdvancedFilterDrawer } from './AdvancedFilterDrawer';
import { api } from '../../services/api';

interface Candidate {
  id: number;
  name: string;
  email: string;
  experience: number;
  location: string;
  skills: string[];
  match: number;
  aiScore?: number;
  starred: boolean;
}

interface GroupCreationPageProps {
  positionTitle: string;
  onCancel: () => void;
  onCreate: (groupData: {
    name: string;
    candidateIds: number[];
    aiRankingUsed: boolean;
    nlpQuery?: string;
  }) => void;
}

export function GroupCreationPage({
  positionTitle,
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
        const data = await api.recruiter.getGroupCandidates();
        setAllCandidates(data);
      } catch (error) {
        console.error('Failed to fetch group candidates:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, []);

  // Filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<any>({});
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // AI Features
  const [aiRankingEnabled, setAiRankingEnabled] = useState(false);
  const [nlpQuery, setNlpQuery] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Selection
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [customBulkNumber, setCustomBulkNumber] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Group Details
  const [groupName, setGroupName] = useState('');

  // Apply manual filters from advanced drawer
  const filteredCandidates = useMemo(() => {
    let filtered = [...allCandidates];
    // Apply advanced filters logic here when implemented
    // For now, return all candidates
    return filtered;
  }, [advancedFilters]);

  // Apply AI ranking
  const displayCandidates = useMemo(() => {
    if (!aiRankingEnabled) {
      return filteredCandidates;
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

  const toggleCandidateSelection = (id: number) => {
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

        {/* Zone A: Manual Filters */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={16} className="text-[#6366f1]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
              Manual Filters
            </span>
          </div>
          <div>
            {/* Advanced Filters Button - Prominent */}
            <button
              onClick={() => setShowAdvancedFilters(true)}
              className="h-[44px] px-[20px] rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] font-['Arimo',sans-serif] text-[14px] text-white flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
            >
              <Sliders size={18} />
              Open Advanced Filters
              {activeFilterCount > 0 && (
                <Badge className="bg-white text-[#6366f1] h-[20px] px-[7px] text-[11px]">{activeFilterCount}</Badge>
              )}
            </button>
          </div>
        </div>

        {/* Zone B: AI Power */}
        <div className="border-t border-[#e5e7eb] pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-[#10b981]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
              AI Enhancement
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-[14px] h-[36px] rounded-[8px] bg-[#f0fdf4] border border-[#bbf7d0]">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#15803d]">
                AI Semantic Rerank
              </span>
              <Switch
                checked={aiRankingEnabled}
                onCheckedChange={setAiRankingEnabled}
              />
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
                <input
                  type="text"
                  value={nlpQuery}
                  onChange={(e) => setNlpQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiEnhance()}
                  placeholder="e.g., 'Find Java experts with fintech background'"
                  className="w-full h-[36px] pl-[36px] pr-[14px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>
              <button
                onClick={handleAiEnhance}
                disabled={!nlpQuery.trim() || isAiProcessing}
                className="h-[36px] px-[16px] rounded-[8px] bg-[#10b981] hover:bg-[#059669] disabled:bg-[#d1d5db] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[13px] text-white flex items-center gap-2 transition-colors"
              >
                {isAiProcessing ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Enhance
                  </>
                )}
              </button>
            </div>
          </div>
          {aiRankingEnabled && nlpQuery && (
            <div className="mt-3 px-[14px] py-[8px] rounded-[8px] bg-[#f0fdf4] border border-[#bbf7d0]">
              <p className="font-['Arimo',sans-serif] text-[12px] text-[#15803d]">
                ✓ AI ranking active for query: "{nlpQuery}"
              </p>
            </div>
          )}
        </div>
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

        {displayCandidates.length === 0 && (
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