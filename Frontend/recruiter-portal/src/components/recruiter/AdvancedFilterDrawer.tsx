import { useState } from 'react';
import { X, Plus, ChevronDown, Save, Upload } from 'lucide-react';

interface AdvancedFilterDrawerProps {
  onClose: () => void;
  onApply: (filters: any) => void;
  activeFilters?: any;
}

export function AdvancedFilterDrawer({ onClose, onApply, activeFilters = {} }: AdvancedFilterDrawerProps) {
  const [filters, setFilters] = useState({
    // Identity & Contact
    fullName: activeFilters.fullName || '',
    email: activeFilters.email || '',
    location: activeFilters.location || '',
    isRemote: activeFilters.isRemote || false,
    languages: activeFilters.languages || [] as string[],
    
    // Education
    school: activeFilters.school || '',
    faculty: activeFilters.faculty || '',
    degree: activeFilters.degree || [] as string[],
    major: activeFilters.major || '',
    gradYearMin: activeFilters.gradYearMin || 2010,
    gradYearMax: activeFilters.gradYearMax || 2025,
    
    // Work Experience
    company: activeFilters.company || '',
    jobTitle: activeFilters.jobTitle || '',
    yearsMin: activeFilters.yearsMin || 0,
    yearsMax: activeFilters.yearsMax || 20,
    seniority: activeFilters.seniority || [] as string[],
    employmentType: activeFilters.employmentType || [] as string[],
    hasEmploymentGaps: activeFilters.hasEmploymentGaps || false,
    maxGapMonths: activeFilters.maxGapMonths || 6,
    
    // Technical & Skills
    techStack: activeFilters.techStack || [] as string[],
    skillProficiency: activeFilters.skillProficiency || {} as Record<string, string>,
    certifications: activeFilters.certifications || '',
    hasGitHub: activeFilters.hasGitHub || null as boolean | null,
    
    // Assessments & Interviews
    assessmentScoreMin: activeFilters.assessmentScoreMin || 0,
    assessmentScoreMax: activeFilters.assessmentScoreMax || 100,
    aiInterviewScoreMin: activeFilters.aiInterviewScoreMin || 0,
    aiInterviewScoreMax: activeFilters.aiInterviewScoreMax || 100,
    assessmentStatus: activeFilters.assessmentStatus || [] as string[],
    integrityFlag: activeFilters.integrityFlag || [] as string[],
    
    // Activity & Signals
    lastActiveDays: activeFilters.lastActiveDays || 30,
    githubScoreMin: activeFilters.githubScoreMin || 0,
    linkedinMin: activeFilters.linkedinMin || 0,
    responseSpeed: activeFilters.responseSpeed || [] as string[],
    
    // Boolean helpers
    exactSkillMatch: activeFilters.exactSkillMatch || false
  });

  const [customSkillInput, setCustomSkillInput] = useState('');
  const [sectionLogic, setSectionLogic] = useState<Record<string, 'AND' | 'OR'>>({
    skills: 'AND',
    education: 'AND',
    experience: 'OR'
  });

  // Predefined options
  const topSchools = [
    'Stanford University', 'MIT', 'Harvard University', 'UC Berkeley', 
    'Carnegie Mellon', 'Oxford University', 'Cambridge University',
    'ETH Zurich', 'National University of Singapore'
  ];

  const techStackOptions = [
    'React', 'TypeScript', 'Python', 'Java', 'Node.js', 'AWS',
    'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'GraphQL',
    'Vue.js', 'Angular', 'Django', 'Spring Boot', 'Go', 'Rust'
  ];

  const degreeOptions = ['BSc', 'MSc', 'PhD', 'MBA', 'Diploma', 'Associate'];
  const seniorityOptions = ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Manager', 'Director'];
  const employmentTypeOptions = ['Full-time', 'Contract', 'Freelance', 'Part-time'];
  const assessmentStatusOptions = ['Not Started', 'Pending', 'Completed', 'Flagged'];
  const integrityFlagOptions = ['None', 'Suspicious', 'Failed'];
  const responseSpeedOptions = ['Fast', 'Medium', 'Slow'];
  const languageOptions = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Arabic'];
  const certificationOptions = ['AWS Certified', 'Google Cloud Certified', 'Azure Certified', 'PMP', 'CISSP', 'Scrum Master'];

  const topCompanies = ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple', 'Netflix', 'Tesla', 'Uber', 'Airbnb'];

  const toggleMultiSelect = (field: keyof typeof filters, value: string) => {
    const current = filters[field] as string[];
    setFilters({
      ...filters,
      [field]: current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    });
  };

  const addCustomSkill = () => {
    if (customSkillInput.trim() && !filters.techStack.includes(customSkillInput.trim())) {
      setFilters({
        ...filters,
        techStack: [...filters.techStack, customSkillInput.trim()]
      });
      setCustomSkillInput('');
    }
  };

  const handleReset = () => {
    setFilters({
      fullName: '', email: '', location: '', isRemote: false, languages: [],
      school: '', faculty: '', degree: [], major: '', gradYearMin: 2010, gradYearMax: 2025,
      company: '', jobTitle: '', yearsMin: 0, yearsMax: 20, seniority: [], employmentType: [],
      hasEmploymentGaps: false, maxGapMonths: 6,
      techStack: [], skillProficiency: {}, certifications: '', hasGitHub: null,
      assessmentScoreMin: 0, assessmentScoreMax: 100, aiInterviewScoreMin: 0, aiInterviewScoreMax: 100,
      assessmentStatus: [], integrityFlag: [],
      lastActiveDays: 30, githubScoreMin: 0, linkedinMin: 0, responseSpeed: [],
      exactSkillMatch: false
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white border-l border-[#e5e7eb] shadow-2xl z-50 flex flex-col animate-slideInRight">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#e5e7eb] px-6 py-5">
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
          Full CV-level filtering with combinable criteria
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto px-6 py-6 space-y-8">
        {/* Identity & Contact */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#111827] text-[15px]">Identity & Contact</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={filters.fullName}
                onChange={(e) => setFilters({ ...filters, fullName: e.target.value })}
                placeholder="Search by name..."
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Location
              </label>
              <input
                type="text"
                value={filters.location}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                placeholder="City, Country..."
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.isRemote}
                  onChange={(e) => setFilters({ ...filters, isRemote: e.target.checked })}
                  className="w-[16px] h-[16px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                />
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                  Open to remote work
                </span>
              </label>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Languages
              </label>
              <div className="flex flex-wrap gap-2">
                {languageOptions.map(lang => (
                  <button
                    key={lang}
                    onClick={() => toggleMultiSelect('languages', lang)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.languages.includes(lang)
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Education */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#111827] text-[15px]">Education</h3>
            <button
              onClick={() => setSectionLogic({ ...sectionLogic, education: sectionLogic.education === 'AND' ? 'OR' : 'AND' })}
              className="px-[10px] py-[4px] rounded-[6px] bg-[#f3f4f6] font-['Arimo',sans-serif] text-[11px] text-[#6366f1] hover:bg-[#ede9fe]"
            >
              {sectionLogic.education}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                School / University
              </label>
              <input
                type="text"
                value={filters.school}
                onChange={(e) => setFilters({ ...filters, school: e.target.value })}
                placeholder="Type or select..."
                list="schools"
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
              <datalist id="schools">
                {topSchools.map(school => (
                  <option key={school} value={school} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                College / Faculty
              </label>
              <input
                type="text"
                value={filters.faculty}
                onChange={(e) => setFilters({ ...filters, faculty: e.target.value })}
                placeholder="e.g., Engineering, Business..."
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Degree
              </label>
              <div className="flex flex-wrap gap-2">
                {degreeOptions.map(deg => (
                  <button
                    key={deg}
                    onClick={() => toggleMultiSelect('degree', deg)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.degree.includes(deg)
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {deg}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Major / Specialization
              </label>
              <input
                type="text"
                value={filters.major}
                onChange={(e) => setFilters({ ...filters, major: e.target.value })}
                placeholder="Computer Science, Business..."
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-3">
                Graduation Year: {filters.gradYearMin} - {filters.gradYearMax}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={filters.gradYearMin}
                  onChange={(e) => setFilters({ ...filters, gradYearMin: parseInt(e.target.value) || 2010 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <span className="text-[#6b7280]">to</span>
                <input
                  type="number"
                  value={filters.gradYearMax}
                  onChange={(e) => setFilters({ ...filters, gradYearMax: parseInt(e.target.value) || 2025 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Work Experience */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#111827] text-[15px]">Work Experience</h3>
            <button
              onClick={() => setSectionLogic({ ...sectionLogic, experience: sectionLogic.experience === 'AND' ? 'OR' : 'AND' })}
              className="px-[10px] py-[4px] rounded-[6px] bg-[#f3f4f6] font-['Arimo',sans-serif] text-[11px] text-[#6366f1] hover:bg-[#ede9fe]"
            >
              {sectionLogic.experience}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Company
              </label>
              <input
                type="text"
                value={filters.company}
                onChange={(e) => setFilters({ ...filters, company: e.target.value })}
                placeholder="Company name..."
                list="companies"
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
              <datalist id="companies">
                {topCompanies.map(company => (
                  <option key={company} value={company} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Job Title
              </label>
              <input
                type="text"
                value={filters.jobTitle}
                onChange={(e) => setFilters({ ...filters, jobTitle: e.target.value })}
                placeholder="e.g., Software Engineer..."
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-3">
                Years of Experience: {filters.yearsMin} - {filters.yearsMax}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={filters.yearsMin}
                  onChange={(e) => setFilters({ ...filters, yearsMin: parseInt(e.target.value) || 0 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <span className="text-[#6b7280]">to</span>
                <input
                  type="number"
                  value={filters.yearsMax}
                  onChange={(e) => setFilters({ ...filters, yearsMax: parseInt(e.target.value) || 20 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Seniority
              </label>
              <div className="flex flex-wrap gap-2">
                {seniorityOptions.map(sen => (
                  <button
                    key={sen}
                    onClick={() => toggleMultiSelect('seniority', sen)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.seniority.includes(sen)
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {sen}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Employment Type
              </label>
              <div className="flex flex-wrap gap-2">
                {employmentTypeOptions.map(type => (
                  <button
                    key={type}
                    onClick={() => toggleMultiSelect('employmentType', type)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.employmentType.includes(type)
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasEmploymentGaps}
                  onChange={(e) => setFilters({ ...filters, hasEmploymentGaps: e.target.checked })}
                  className="w-[16px] h-[16px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
                />
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                  Filter by employment gaps
                </span>
              </label>
              {filters.hasEmploymentGaps && (
                <div className="mt-3">
                  <label className="block font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">
                    Max gap: {filters.maxGapMonths} months
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={filters.maxGapMonths}
                    onChange={(e) => setFilters({ ...filters, maxGapMonths: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Technical & Skills */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#111827] text-[15px]">Technical & Skills</h3>
            <button
              onClick={() => setSectionLogic({ ...sectionLogic, skills: sectionLogic.skills === 'AND' ? 'OR' : 'AND' })}
              className="px-[10px] py-[4px] rounded-[6px] bg-[#f3f4f6] font-['Arimo',sans-serif] text-[11px] text-[#6366f1] hover:bg-[#ede9fe]"
            >
              {sectionLogic.skills}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Tech Stack
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {techStackOptions.map(tech => (
                  <button
                    key={tech}
                    onClick={() => toggleMultiSelect('techStack', tech)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.techStack.includes(tech)
                        ? 'bg-[#10b981] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {tech}
                  </button>
                ))}
                {filters.techStack.filter(t => !techStackOptions.includes(t)).map(tech => (
                  <button
                    key={tech}
                    onClick={() => setFilters({ ...filters, techStack: filters.techStack.filter(t => t !== tech) })}
                    className="h-[32px] px-[12px] rounded-[6px] bg-[#8b5cf6] text-white font-['Arimo',sans-serif] text-[13px] flex items-center gap-1"
                  >
                    {tech}
                    <X size={12} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSkillInput}
                  onChange={(e) => setCustomSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomSkill()}
                  placeholder="Add custom skill/tech..."
                  className="flex-1 h-[36px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <button
                  onClick={addCustomSkill}
                  className="h-[36px] px-[12px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white flex items-center gap-1 transition-colors"
                >
                  <Plus size={14} />
                  <span className="font-['Arimo',sans-serif] text-[13px]">Add</span>
                </button>
              </div>
              <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mt-2">
                Add custom techs for internal searches (will be suggested to teammates).
              </p>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Certifications
              </label>
              <input
                type="text"
                value={filters.certifications}
                onChange={(e) => setFilters({ ...filters, certifications: e.target.value })}
                placeholder="Search certifications..."
                list="certifications"
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
              <datalist id="certifications">
                {certificationOptions.map(cert => (
                  <option key={cert} value={cert} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Portfolio / GitHub
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters({ ...filters, hasGitHub: true })}
                  className={`flex-1 h-[36px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                    filters.hasGitHub === true
                      ? 'bg-[#6366f1] text-white'
                      : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                  }`}
                >
                  Has GitHub
                </button>
                <button
                  onClick={() => setFilters({ ...filters, hasGitHub: false })}
                  className={`flex-1 h-[36px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                    filters.hasGitHub === false
                      ? 'bg-[#6366f1] text-white'
                      : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                  }`}
                >
                  No GitHub
                </button>
                <button
                  onClick={() => setFilters({ ...filters, hasGitHub: null })}
                  className={`flex-1 h-[36px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                    filters.hasGitHub === null
                      ? 'bg-[#6366f1] text-white'
                      : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                  }`}
                >
                  Any
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Assessments & Interviews */}
        <div>
          <h3 className="text-[#111827] text-[15px] mb-4">Assessments & Interviews</h3>
          <div className="space-y-4">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-3">
                Assessment Score: {filters.assessmentScoreMin} - {filters.assessmentScoreMax}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={filters.assessmentScoreMin}
                  onChange={(e) => setFilters({ ...filters, assessmentScoreMin: parseInt(e.target.value) || 0 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <span className="text-[#6b7280]">to</span>
                <input
                  type="number"
                  value={filters.assessmentScoreMax}
                  onChange={(e) => setFilters({ ...filters, assessmentScoreMax: parseInt(e.target.value) || 100 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-3">
                AI Interview Score: {filters.aiInterviewScoreMin} - {filters.aiInterviewScoreMax}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={filters.aiInterviewScoreMin}
                  onChange={(e) => setFilters({ ...filters, aiInterviewScoreMin: parseInt(e.target.value) || 0 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <span className="text-[#6b7280]">to</span>
                <input
                  type="number"
                  value={filters.aiInterviewScoreMax}
                  onChange={(e) => setFilters({ ...filters, aiInterviewScoreMax: parseInt(e.target.value) || 100 })}
                  className="flex-1 h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Assessment Status
              </label>
              <div className="flex flex-wrap gap-2">
                {assessmentStatusOptions.map(status => (
                  <button
                    key={status}
                    onClick={() => toggleMultiSelect('assessmentStatus', status)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.assessmentStatus.includes(status)
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Integrity Flag
              </label>
              <div className="flex flex-wrap gap-2">
                {integrityFlagOptions.map(flag => (
                  <button
                    key={flag}
                    onClick={() => toggleMultiSelect('integrityFlag', flag)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.integrityFlag.includes(flag)
                        ? 'bg-[#ef4444] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {flag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Activity & Signals */}
        <div>
          <h3 className="text-[#111827] text-[15px] mb-4">Activity & Signals</h3>
          <div className="space-y-4">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Last Active (days ago)
              </label>
              <select
                value={filters.lastActiveDays}
                onChange={(e) => setFilters({ ...filters, lastActiveDays: parseInt(e.target.value) })}
                className="w-full h-[40px] px-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-3">
                GitHub Activity Score: {filters.githubScoreMin}+
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.githubScoreMin}
                onChange={(e) => setFilters({ ...filters, githubScoreMin: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-3">
                LinkedIn Completeness: {filters.linkedinMin}%+
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.linkedinMin}
                onChange={(e) => setFilters({ ...filters, linkedinMin: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] mb-2">
                Response Speed
              </label>
              <div className="flex flex-wrap gap-2">
                {responseSpeedOptions.map(speed => (
                  <button
                    key={speed}
                    onClick={() => toggleMultiSelect('responseSpeed', speed)}
                    className={`h-[32px] px-[12px] rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${
                      filters.responseSpeed.includes(speed)
                        ? 'bg-[#6366f1] text-white'
                        : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Boolean Helpers */}
        <div>
          <h3 className="text-[#111827] text-[15px] mb-4">Additional Options</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.exactSkillMatch}
                onChange={(e) => setFilters({ ...filters, exactSkillMatch: e.target.checked })}
                className="w-[16px] h-[16px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
              />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Only exact skill matches
              </span>
            </label>
            <div className="pt-2 border-t border-[#e5e7eb]">
              <button className="flex items-center gap-2 h-[36px] px-[14px] rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors w-full justify-center">
                <Save size={14} />
                Save Filter Template
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-[#e5e7eb] px-6 py-4 bg-white">
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => onApply(filters)}
            className="flex-1 h-[44px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>

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
          animation: slideInRight 180ms ease-out;
        }
      `}</style>
    </div>
  );
}
