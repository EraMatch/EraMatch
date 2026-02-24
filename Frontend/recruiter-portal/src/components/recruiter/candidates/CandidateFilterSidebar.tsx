import { useState, useEffect } from 'react';
import { X, Search, MapPin, Building, GraduationCap, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { Slider } from '../../ui/slider';
import { Checkbox } from '../../ui/checkbox';

interface FilterOptions {
    locations: string[];
    companies: string[];
    schools: string[];
    skills: string[];
    jobTitles: string[];
    degrees: string[];
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
        degrees: false
    });

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

            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-[#e5e7eb] bg-[#f9fafb]">
                <button
                    onClick={onClose}
                    className="w-full h-[44px] bg-[#6366f1] hover:bg-[#5558e3] text-white rounded-[8px] font-medium transition-colors font-['Arimo',sans-serif]"
                >
                    Show Candidates
                </button>
            </div>
        </div>
    );
}
