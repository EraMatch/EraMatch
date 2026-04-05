import { useState, useEffect } from 'react';
import { X, Search, MapPin, Building, GraduationCap, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { Slider } from '../../ui/slider';
import { Checkbox } from '../../ui/checkbox';
import { recruiterService } from '../../../services/recruiter.service';
import { toast } from 'sonner';
import { Save, FolderHeart, Trash } from 'lucide-react';

interface FilterOptions {
    locations: string[];
    companies: string[];
    schools: string[];
    skills: string[];
    jobTitles: string[];
    degrees: string[];
    githubContributionSources?: string[];
}

export interface CandidateFilters {
    keywords: string;
    locations: string[];
    companies: string[];
    schools: string[];
    experienceRange: [number, number];
    skills: string[];
    jobTitles: string[];
    degrees: string[];
    githubMinScore: number;
    githubMinRepoConfidence: number;
    githubMaxFreshnessHours: number;
    githubContributionSources: string[];
    githubFallbackOnly: boolean;
}

interface CandidateFilterSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    options: FilterOptions;
    filters: CandidateFilters;
    onFilterChange: (newFilters: CandidateFilters) => void;
    onReset: () => void;
}

export function CandidateFilterSidebar({
    isOpen,
    onClose,
    options,
    filters,
    onFilterChange,
    onReset
}: CandidateFilterSidebarProps) {
    const [expandedSections, setExpandedSections] = useState({
        location: true,
        company: true,
        school: true,
        experience: true,
        skills: true,
        jobTitles: false,
        degrees: false,
        github: true,
    });
    const [templates, setTemplates] = useState<any[]>([]);
    const [saveTemplateName, setSaveTemplateName] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);

    useEffect(() => {
        const loadTemplates = async () => {
            try {
                const data = await recruiterService.getFilterTemplates();
                setTemplates(data);
            } catch (err) {
                console.error("Failed to load templates", err);
            }
        };
        if (isOpen) loadTemplates();
    }, [isOpen]);

    const handleSaveTemplate = async () => {
        if (!saveTemplateName.trim()) {
            toast.error("Please enter a template name");
            return;
        }

        try {
            const newTemplate = await recruiterService.saveFilterTemplate({
                name: saveTemplateName,
                filters: filters
            });
            setTemplates([...templates, newTemplate]);
            setSaveTemplateName('');
            setShowSaveModal(false);
            toast.success("Filter template saved!");
        } catch (err) {
            toast.error("Failed to save template");
        }
    };

    const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await recruiterService.deleteFilterTemplate(id);
            setTemplates(templates.filter(t => t.id !== id));
            toast.success("Template deleted");
        } catch (err) {
            toast.error("Failed to delete template");
        }
    };

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const handleCheckboxChange = (category: keyof CandidateFilters, value: string) => {
        const currentValues = filters[category] as string[];
        const newValues = currentValues.includes(value)
            ? currentValues.filter(item => item !== value)
            : [...currentValues, value];

        onFilterChange({ ...filters, [category]: newValues });
    };

    const handleSearchChange = (value: string) => {
        onFilterChange({ ...filters, keywords: value });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-[380px] bg-white shadow-xl border-l border-[#e5e7eb] z-50 flex flex-col transform transition-transform duration-300 ease-in-out">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between bg-white">
                <div>
                    <h2 className="text-[#111827] font-semibold text-[18px] font-['Arimo',sans-serif]">Filters</h2>
                    <p className="text-[#6b7280] text-[13px] font-['Arimo',sans-serif]">Refine candidate list</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onReset}
                        className="text-[#6366f1] text-[13px] font-medium hover:underline font-['Arimo',sans-serif]"
                    >
                        Reset all
                    </button>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f3f4f6]"
                    >
                        <X size={20} className="text-[#6b7280]" />
                    </button>
                </div>
            </div>

            {/* Templates Section */}
            {templates.length > 0 && (
                <div className="px-6 py-4 border-b border-[#e5e7eb] bg-[#f8fafc]">
                    <div className="flex items-center gap-2 mb-3">
                        <FolderHeart size={16} className="text-[#6366f1]" />
                        <span className="text-[14px] font-medium text-[#1e293b]">Saved Templates</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {templates.map(t => (
                            <div
                                key={t.id}
                                className="group relative flex items-center gap-1 px-3 py-1.5 bg-white border border-[#e2e8f0] rounded-full hover:border-[#6366f1] cursor-pointer transition-all"
                                onClick={() => onFilterChange(t.filters)}
                            >
                                <span className="text-[12px] text-[#475569]">{t.name}</span>
                                <button
                                    onClick={(e) => handleDeleteTemplate(t.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-opacity"
                                >
                                    <Trash size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {/* Keywords Search */}
                <div>
                    <label className="block text-[#374151] text-[14px] font-medium mb-2 font-['Arimo',sans-serif]">Keywords</label>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-3 text-[#9ca3af]" />
                        <input
                            type="text"
                            value={filters.keywords}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search by name, title, or skill..."
                            className="w-full pl-9 pr-4 py-2.5 rounded-[8px] border border-[#e5e7eb] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent font-['Arimo',sans-serif]"
                        />
                    </div>
                </div>

                {/* Experience Slider */}
                <div className="border-t border-[#e5e7eb] pt-6">
                    <button
                        onClick={() => toggleSection('experience')}
                        className="flex items-center justify-between w-full mb-4"
                    >
                        <div className="flex items-center gap-2">
                            <Briefcase size={18} className="text-[#6b7280]" />
                            <span className="text-[#111827] font-medium text-[15px] font-['Arimo',sans-serif]">Experience</span>
                        </div>
                        {expandedSections.experience ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedSections.experience && (
                        <div className="px-1">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[13px] text-[#6b7280] font-['Arimo',sans-serif]">{filters.experienceRange[0]} years</span>
                                <span className="text-[13px] text-[#6b7280] font-['Arimo',sans-serif]">{filters.experienceRange[1]}+ years</span>
                            </div>
                            <Slider
                                value={filters.experienceRange}
                                min={0}
                                max={20}
                                step={1}
                                minStepsBetweenThumbs={1}
                                onValueChange={(value) => onFilterChange({ ...filters, experienceRange: value as [number, number] })}
                                className="w-full"
                            />
                        </div>
                    )}
                </div>

                {/* Location Filter */}
                <div className="border-t border-[#e5e7eb] pt-6">
                    <button
                        onClick={() => toggleSection('location')}
                        className="flex items-center justify-between w-full mb-4"
                    >
                        <div className="flex items-center gap-2">
                            <MapPin size={18} className="text-[#6b7280]" />
                            <span className="text-[#111827] font-medium text-[15px] font-['Arimo',sans-serif]">Locations</span>
                        </div>
                        {expandedSections.location ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedSections.location && (
                        <div className="space-y-3">
                            {options.locations.map(location => (
                                <div key={location} className="flex items-center gap-3">
                                    <Checkbox
                                        id={`loc-${location}`}
                                        checked={filters.locations.includes(location)}
                                        onCheckedChange={() => handleCheckboxChange('locations', location)}
                                        className="data-[state=checked]:bg-[#6366f1] data-[state=checked]:border-[#6366f1]"
                                    />
                                    <label
                                        htmlFor={`loc-${location}`}
                                        className="text-[14px] text-[#374151] cursor-pointer select-none font-['Arimo',sans-serif]"
                                    >
                                        {location}
                                    </label>
                                </div>
                            ))}
                            {options.locations.length === 0 && (
                                <p className="text-[13px] text-[#9ca3af] italic">No locations available</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Companies Filter */}
                <div className="border-t border-[#e5e7eb] pt-6">
                    <button
                        onClick={() => toggleSection('company')}
                        className="flex items-center justify-between w-full mb-4"
                    >
                        <div className="flex items-center gap-2">
                            <Building size={18} className="text-[#6b7280]" />
                            <span className="text-[#111827] font-medium text-[15px] font-['Arimo',sans-serif]">Companies</span>
                        </div>
                        {expandedSections.company ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedSections.company && (
                        <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                            {options.companies.map(company => (
                                <div key={company} className="flex items-center gap-3">
                                    <Checkbox
                                        id={`comp-${company}`}
                                        checked={filters.companies.includes(company)}
                                        onCheckedChange={() => handleCheckboxChange('companies', company)}
                                        className="data-[state=checked]:bg-[#6366f1] data-[state=checked]:border-[#6366f1]"
                                    />
                                    <label
                                        htmlFor={`comp-${company}`}
                                        className="text-[14px] text-[#374151] cursor-pointer select-none font-['Arimo',sans-serif]"
                                    >
                                        {company}
                                    </label>
                                </div>
                            ))}
                            {options.companies.length === 0 && (
                                <p className="text-[13px] text-[#9ca3af] italic">No companies available</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Skills Filter */}
                <div className="border-t border-[#e5e7eb] pt-6">
                    <button
                        onClick={() => toggleSection('skills')}
                        className="flex items-center justify-between w-full mb-4"
                    >
                        <div className="flex items-center gap-2">
                            <GraduationCap size={18} className="text-[#6b7280]" />
                            <span className="text-[#111827] font-medium text-[15px] font-['Arimo',sans-serif]">Skills</span>
                        </div>
                        {expandedSections.skills ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedSections.skills && (
                        <div className="flex flex-wrap gap-2">
                            {options.skills.map(skill => (
                                <button
                                    key={skill}
                                    onClick={() => handleCheckboxChange('skills', skill)}
                                    className={`px-3 py-1.5 rounded-full text-[13px] border transition-colors font-['Arimo',sans-serif] ${filters.skills.includes(skill)
                                        ? 'bg-[#6366f1] text-white border-[#6366f1]'
                                        : 'bg-white text-[#374151] border-[#e5e7eb] hover:border-[#d1d5db]'
                                        }`}
                                >
                                    {skill}
                                </button>
                            ))}
                            {options.skills.length === 0 && (
                                <p className="text-[13px] text-[#9ca3af] italic w-full">No skills available</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Schools Filter */}
                <div className="border-t border-[#e5e7eb] pt-6">
                    <button
                        onClick={() => toggleSection('school')}
                        className="flex items-center justify-between w-full mb-4"
                    >
                        <div className="flex items-center gap-2">
                            <GraduationCap size={18} className="text-[#6b7280]" />
                            <span className="text-[#111827] font-medium text-[15px] font-['Arimo',sans-serif]">Schools</span>
                        </div>
                        {expandedSections.school ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedSections.school && (
                        <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                            {options.schools.map(school => (
                                <div key={school} className="flex items-center gap-3">
                                    <Checkbox
                                        id={`school-${school}`}
                                        checked={filters.schools.includes(school)}
                                        onCheckedChange={() => handleCheckboxChange('schools', school)}
                                        className="data-[state=checked]:bg-[#6366f1] data-[state=checked]:border-[#6366f1]"
                                    />
                                    <label
                                        htmlFor={`school-${school}`}
                                        className="text-[14px] text-[#374151] cursor-pointer select-none font-['Arimo',sans-serif]"
                                    >
                                        {school}
                                    </label>
                                </div>
                            ))}
                            {options.schools.length === 0 && (
                                <p className="text-[13px] text-[#9ca3af] italic">No schools available</p>
                            )}
                        </div>
                    )}
                </div>

                {/* GitHub Analytics Filter */}
                <div className="border-t border-[#e5e7eb] pt-6">
                    <button
                        onClick={() => toggleSection('github')}
                        className="flex items-center justify-between w-full mb-4"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-[#111827] font-medium text-[15px] font-['Arimo',sans-serif]">GitHub Signals</span>
                        </div>
                        {expandedSections.github ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedSections.github && (
                        <div className="space-y-5">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[13px] text-[#6b7280] font-['Arimo',sans-serif]">Min GitHub Score</span>
                                    <span className="text-[13px] text-[#111827] font-medium font-['Arimo',sans-serif]">{filters.githubMinScore}</span>
                                </div>
                                <Slider
                                    value={[filters.githubMinScore]}
                                    min={0}
                                    max={100}
                                    step={5}
                                    onValueChange={(value) => onFilterChange({ ...filters, githubMinScore: value[0] || 0 })}
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[13px] text-[#6b7280] font-['Arimo',sans-serif]">Min Repo Confidence</span>
                                    <span className="text-[13px] text-[#111827] font-medium font-['Arimo',sans-serif]">{Math.round(filters.githubMinRepoConfidence * 100)}%</span>
                                </div>
                                <Slider
                                    value={[Math.round(filters.githubMinRepoConfidence * 100)]}
                                    min={0}
                                    max={100}
                                    step={5}
                                    onValueChange={(value) => onFilterChange({ ...filters, githubMinRepoConfidence: (value[0] || 0) / 100 })}
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[13px] text-[#6b7280] font-['Arimo',sans-serif]">Max Freshness (hours)</span>
                                    <span className="text-[13px] text-[#111827] font-medium font-['Arimo',sans-serif]">{filters.githubMaxFreshnessHours}h</span>
                                </div>
                                <Slider
                                    value={[filters.githubMaxFreshnessHours]}
                                    min={0}
                                    max={720}
                                    step={12}
                                    onValueChange={(value) => onFilterChange({ ...filters, githubMaxFreshnessHours: value[0] || 0 })}
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <span className="block text-[13px] text-[#6b7280] mb-2 font-['Arimo',sans-serif]">Contribution Source</span>
                                <div className="flex flex-wrap gap-2">
                                    {(options.githubContributionSources || []).map(source => (
                                        <button
                                            key={source}
                                            onClick={() => handleCheckboxChange('githubContributionSources', source)}
                                            className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors font-['Arimo',sans-serif] ${filters.githubContributionSources.includes(source)
                                                ? 'bg-[#6366f1] text-white border-[#6366f1]'
                                                : 'bg-white text-[#374151] border-[#e5e7eb] hover:border-[#d1d5db]'
                                                }`}
                                        >
                                            {source}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <Checkbox
                                    id="github-fallback-only"
                                    checked={filters.githubFallbackOnly}
                                    onCheckedChange={(checked) => onFilterChange({ ...filters, githubFallbackOnly: Boolean(checked) })}
                                    className="data-[state=checked]:bg-[#6366f1] data-[state=checked]:border-[#6366f1]"
                                />
                                <span className="text-[14px] text-[#374151] font-['Arimo',sans-serif]">Only fallback-based analyses</span>
                            </label>
                        </div>
                    )}
                </div>

            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-[#e5e7eb] bg-[#f9fafb] flex flex-col gap-3">
                <button
                    onClick={() => setShowSaveModal(true)}
                    className="flex items-center justify-center gap-2 w-full h-[40px] bg-white border border-[#6366f1] text-[#6366f1] hover:bg-indigo-50 rounded-[8px] font-medium transition-colors font-['Arimo',sans-serif] text-[14px]"
                >
                    <Save size={16} />
                    Save as Template
                </button>
                <button
                    onClick={onClose}
                    className="w-full h-[44px] bg-[#6366f1] hover:bg-[#5558e3] text-white rounded-[8px] font-medium transition-colors font-['Arimo',sans-serif]"
                >
                    Show Candidates
                </button>
            </div>

            {/* Save Template Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-[16px] w-full max-w-[400px] shadow-2xl p-6">
                        <h3 className="text-[#111827] text-[18px] font-semibold mb-4">Save Filter Template</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Template Name</label>
                                <input
                                    type="text"
                                    value={saveTemplateName}
                                    onChange={(e) => setSaveTemplateName(e.target.value)}
                                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[8px] text-[14px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                    placeholder="e.g. Senior Developers in NY"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button
                                    onClick={() => setShowSaveModal(false)}
                                    className="px-4 py-2 border border-[#e5e7eb] rounded-[8px] text-[14px] font-medium hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveTemplate}
                                    className="px-4 py-2 bg-[#6366f1] text-white rounded-[8px] text-[14px] font-medium hover:bg-indigo-700"
                                >
                                    Save Template
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
