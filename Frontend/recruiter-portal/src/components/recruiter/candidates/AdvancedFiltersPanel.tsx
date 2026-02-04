import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

interface AdvancedFiltersPanelProps {
  onClose: () => void;
  onApply: (filters: any) => void;
}

export function AdvancedFiltersPanel({ onClose, onApply }: AdvancedFiltersPanelProps) {
  const [filters, setFilters] = useState({
    skills: [] as string[],
    yearsMin: 0,
    yearsMax: 20,
    techStack: [] as string[],
    assessmentScoreMin: 0,
    aiInterviewScoreMin: 0,
    githubScoreMin: 0,
    linkedinMin: 0,
    antiCheatingOnly: false,
    salaryMin: '',
    salaryMax: '',
    hasEmploymentGaps: false,
    lastActivityDays: 30,
    cvKeywords: [] as string[]
  });

  const skillOptions = [
    'React', 'TypeScript', 'Python', 'Java', 'Node.js',
    'AWS', 'Docker', 'Kubernetes', 'Machine Learning', 'DevOps'
  ];

  const techStackOptions = [
    'MERN Stack', 'MEAN Stack', 'Django', 'Spring Boot',
    'Laravel', '.NET', 'Ruby on Rails'
  ];

  const toggleSkill = (skill: string) => {
    setFilters(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const toggleTechStack = (stack: string) => {
    setFilters(prev => ({
      ...prev,
      techStack: prev.techStack.includes(stack)
        ? prev.techStack.filter(s => s !== stack)
        : [...prev.techStack, stack]
    }));
  };

  const handleReset = () => {
    setFilters({
      skills: [],
      yearsMin: 0,
      yearsMax: 20,
      techStack: [],
      assessmentScoreMin: 0,
      aiInterviewScoreMin: 0,
      githubScoreMin: 0,
      linkedinMin: 0,
      antiCheatingOnly: false,
      salaryMin: '',
      salaryMax: '',
      hasEmploymentGaps: false,
      lastActivityDays: 30,
      cvKeywords: []
    });
  };

  const handleApply = () => {
    onApply(filters);
  };

  return (
    <div className="w-[400px] h-full bg-white border-l border-[#e5e7eb] overflow-auto flex-shrink-0">
      <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-6 py-4 z-10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[#111827]">Advanced Filters</h2>
          <button
            onClick={onClose}
            className="w-[32px] h-[32px] flex items-center justify-center rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
          >
            <X size={18} className="text-[#6b7280]" />
          </button>
        </div>
        <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
          Refine your candidate search with detailed criteria
        </p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Skills */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Skills (Multi-select)
          </label>
          <div className="flex flex-wrap gap-2">
            {skillOptions.map(skill => (
              <button
                key={skill}
                onClick={() => toggleSkill(skill)}
                className={`h-[32px] px-[14px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                  filters.skills.includes(skill)
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>

        {/* Years of Experience */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Years of Experience
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={filters.yearsMin}
              onChange={(e) => setFilters({ ...filters, yearsMin: parseInt(e.target.value) || 0 })}
              className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              placeholder="Min"
            />
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">to</span>
            <input
              type="number"
              value={filters.yearsMax}
              onChange={(e) => setFilters({ ...filters, yearsMax: parseInt(e.target.value) || 20 })}
              className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              placeholder="Max"
            />
          </div>
        </div>

        {/* Technology Stack */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Technology Stack
          </label>
          <div className="flex flex-wrap gap-2">
            {techStackOptions.map(stack => (
              <button
                key={stack}
                onClick={() => toggleTechStack(stack)}
                className={`h-[32px] px-[14px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                  filters.techStack.includes(stack)
                    ? 'bg-[#10b981] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                }`}
              >
                {stack}
              </button>
            ))}
          </div>
        </div>

        {/* Assessment Score */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Minimum Assessment Score
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={filters.assessmentScoreMin}
            onChange={(e) => setFilters({ ...filters, assessmentScoreMin: parseInt(e.target.value) })}
            className="w-full h-[6px] bg-[#e5e7eb] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[16px] [&::-webkit-slider-thumb]:h-[16px] [&::-webkit-slider-thumb]:bg-[#6366f1] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between mt-2">
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">0</span>
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              {filters.assessmentScoreMin}
            </span>
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">100</span>
          </div>
        </div>

        {/* AI Interview Score */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Minimum AI Interview Score
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={filters.aiInterviewScoreMin}
            onChange={(e) => setFilters({ ...filters, aiInterviewScoreMin: parseInt(e.target.value) })}
            className="w-full h-[6px] bg-[#e5e7eb] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[16px] [&::-webkit-slider-thumb]:h-[16px] [&::-webkit-slider-thumb]:bg-[#6366f1] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between mt-2">
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">0</span>
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              {filters.aiInterviewScoreMin}
            </span>
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">100</span>
          </div>
        </div>

        {/* GitHub Score */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Minimum GitHub Activity Score
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={filters.githubScoreMin}
            onChange={(e) => setFilters({ ...filters, githubScoreMin: parseInt(e.target.value) })}
            className="w-full h-[6px] bg-[#e5e7eb] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[16px] [&::-webkit-slider-thumb]:h-[16px] [&::-webkit-slider-thumb]:bg-[#6366f1] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between mt-2">
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">0</span>
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              {filters.githubScoreMin}
            </span>
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">100</span>
          </div>
        </div>

        {/* LinkedIn Completeness */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Minimum LinkedIn Completeness
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={filters.linkedinMin}
            onChange={(e) => setFilters({ ...filters, linkedinMin: parseInt(e.target.value) })}
            className="w-full h-[6px] bg-[#e5e7eb] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[16px] [&::-webkit-slider-thumb]:h-[16px] [&::-webkit-slider-thumb]:bg-[#6366f1] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between mt-2">
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">0%</span>
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
              {filters.linkedinMin}%
            </span>
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">100%</span>
          </div>
        </div>

        {/* Anti-Cheating Flags */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.antiCheatingOnly}
              onChange={(e) => setFilters({ ...filters, antiCheatingOnly: e.target.checked })}
              className="w-[18px] h-[18px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
            />
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
              Show only candidates with anti-cheating flags
            </span>
          </label>
        </div>

        {/* Salary Expectation */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Salary Expectation Range
          </label>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={filters.salaryMin}
              onChange={(e) => setFilters({ ...filters, salaryMin: e.target.value })}
              className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              placeholder="$80k"
            />
            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">to</span>
            <input
              type="text"
              value={filters.salaryMax}
              onChange={(e) => setFilters({ ...filters, salaryMax: e.target.value })}
              className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              placeholder="$120k"
            />
          </div>
        </div>

        {/* Last Activity */}
        <div>
          <label className="block font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
            Last Activity (days)
          </label>
          <select
            value={filters.lastActivityDays}
            onChange={(e) => setFilters({ ...filters, lastActivityDays: parseInt(e.target.value) })}
            className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#e5e7eb] px-6 py-4">
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 h-[40px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="flex-1 h-[40px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
