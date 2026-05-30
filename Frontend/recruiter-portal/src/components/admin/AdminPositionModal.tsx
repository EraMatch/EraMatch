import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Loader2, Briefcase, MapPin, Users, Info, Plus, X, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

interface AdminPositionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    projectId: string;
    position?: any; // For editing
}

export function AdminPositionModal({ isOpen, onClose, onSuccess, projectId, position }: AdminPositionModalProps) {
    const [jobTitle, setJobTitle] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
    const [newSkill, setNewSkill] = useState('');
    const [benefits, setBenefits] = useState<string[]>([]);
    const [newBenefit, setNewBenefit] = useState('');
    const [experienceLevel, setExperienceLevel] = useState('Mid-Level');
    const [workType, setWorkType] = useState('Remote');
    const [salaryMin, setSalaryMin] = useState<number>(0);
    const [salaryMax, setSalaryMax] = useState<number>(0);
    const [employmentType, setEmploymentType] = useState('full-time');
    const [locationType, setLocationType] = useState('remote');
    const [officeLocation, setOfficeLocation] = useState('');
    const [yearsOfExperience, setYearsOfExperience] = useState<number>(0);
    const [educationLevel, setEducationLevel] = useState('Bachelor');
    const [assignedTechId, setAssignedTechId] = useState<string>('');
    const [assignedHRId, setAssignedHRId] = useState<string>('');

    const [isLoading, setIsLoading] = useState(false);
    const [gapsAndRoles, setGapsAndRoles] = useState('');
    const [isEnriching, setIsEnriching] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<any | null>(null);

    const handleGenerateEnrichment = async () => {
        if (!gapsAndRoles.trim()) return;
        setIsEnriching(true);
        try {
            const res = await api.recruiter.suggestJDEnrichment({
                job_title: jobTitle || undefined,
                gaps_and_roles: gapsAndRoles,
                required_skills: requiredSkills.length > 0 ? requiredSkills : undefined
            });
            setAiSuggestions(res);
            toast.success('AI recommendations generated!');
        } catch (error) {
            console.error('Failed to generate JD enrichment:', error);
            toast.error('Failed to generate AI recommendations');
        } finally {
            setIsEnriching(false);
        }
    };

    const handleApplySuggestions = () => {
        if (!aiSuggestions) return;
        if (aiSuggestions.suggested_job_title) {
            setJobTitle(aiSuggestions.suggested_job_title);
        }
        if (aiSuggestions.suggested_job_description) {
            setJobDescription(aiSuggestions.suggested_job_description);
        }
        if (aiSuggestions.suggested_skills && aiSuggestions.suggested_skills.length > 0) {
            const mergedSkills = Array.from(new Set([...requiredSkills, ...aiSuggestions.suggested_skills]));
            setRequiredSkills(mergedSkills);
        }
        
        const expLevelMap: Record<string, string> = {
            'junior': 'Junior',
            'mid-level': 'Mid-Level',
            'senior': 'Senior',
            'lead': 'Lead',
            'principal': 'Lead',
            'executive': 'Management'
        };
        if (aiSuggestions.suggested_experience_level) {
            const levelKey = aiSuggestions.suggested_experience_level.toLowerCase();
            setExperienceLevel(expLevelMap[levelKey] || 'Mid-Level');
        }
        
        if (typeof aiSuggestions.suggested_years_of_experience === 'number') {
            setYearsOfExperience(aiSuggestions.suggested_years_of_experience);
        }

        const eduLevelMap: Record<string, string> = {
            'any': 'Any',
            'high school': 'Any',
            'associate': 'Associate',
            'bachelor': 'Bachelor',
            'master': 'Master',
            'phd': 'PhD'
        };
        if (aiSuggestions.suggested_education_level) {
            const eduKey = aiSuggestions.suggested_education_level.toLowerCase();
            setEducationLevel(eduLevelMap[eduKey] || 'Bachelor');
        }

        if (aiSuggestions.suggested_traits && aiSuggestions.suggested_traits.length > 0) {
            toast.success(`Suggestions applied! Soft traits identified: ${aiSuggestions.suggested_traits.join(', ')}`);
        } else {
            toast.success('Suggestions applied to form!');
        }
        setAiSuggestions(null);
        setGapsAndRoles('');
    };
    const [techRecruiters, setTechRecruiters] = useState<any[]>([]);
    const [hrRecruiters, setHRRecruiters] = useState<any[]>([]);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [bypassAdminApproval, setBypassAdminApproval] = useState(false);

    useEffect(() => {
        const userStr = localStorage.getItem('user');
        let role = '';
        if (userStr) {
            const user = JSON.parse(userStr);
            role = user.role?.toLowerCase() || '';
            setUserRole(role);
        }

        // Fetch recruiters and (admin-only) settings
        const fetchData = async () => {
            try {
                const isAdminRole = role === 'admin';

                const [recruitersRes, settingsRes] = await Promise.all([
                    api.admin.getRecruiterDelegation(),
                    // Only fetch admin settings when the current user is an admin
                    isAdminRole
                        ? api.admin.getSettings().catch(() => ({}))
                        : Promise.resolve({})
                ]);

                setTechRecruiters(recruitersRes.technicalRecruiters || []);
                setHRRecruiters(recruitersRes.hrRecruiters || []);

                if (settingsRes && settingsRes.bypass_admin_approval) {
                    setBypassAdminApproval(true);
                }
            } catch (error) {
                console.error('Failed to fetch initial data:', error);
            }
        };
        fetchData();
    }, []);

    // ... (rest of useEffects/handlers) ...

    // ... (skip down to assignment section) ...



    useEffect(() => {
        if (position) {
            setJobTitle(position.jobTitle || position.job_title || '');
            setJobDescription(position.jobDescription || position.job_description || '');
            setRequiredSkills(position.requiredSkills || position.required_skills || []);
            setExperienceLevel(position.experienceLevel || position.experience_level || 'Mid-Level');
            setWorkType(position.workType || position.work_type || 'Remote');
            setSalaryMin(position.salaryMin || position.salary_min || 0);
            setSalaryMax(position.salaryMax || position.salary_max || 0);
            setEmploymentType(position.employmentType || position.employment_type || 'full-time');
            setLocationType(position.locationType || position.location_type || 'remote');
            setOfficeLocation(position.locationData?.office_location || position.location_data?.office_location || '');
            setYearsOfExperience(position.yearsOfExperience || position.years_of_experience || 0);
            setEducationLevel(position.educationLevel || position.education_level || 'Bachelor');
            setAssignedTechId(position.assigned_tech_id || position.assignedTechnicalRecruiterId || '');
            setAssignedHRId(position.assigned_hr_id || position.assignedHRId || '');
        } else {
            setJobTitle('');
            setJobDescription('');
            setRequiredSkills([]);
            setExperienceLevel('Mid-Level');
            setWorkType('Remote');
            setSalaryMin(0);
            setSalaryMax(0);
            setEmploymentType('full-time');
            setLocationType('remote');
            setOfficeLocation('');
            setYearsOfExperience(0);
            setEducationLevel('Bachelor');
            setAssignedTechId('');
            setAssignedHRId('');
        }
    }, [position, isOpen]);

    // ... (handlers remain same) ...
    const handleAddSkill = () => {
        if (newSkill.trim() && !requiredSkills.includes(newSkill.trim())) {
            setRequiredSkills([...requiredSkills, newSkill.trim()]);
            setNewSkill('');
        }
    };
    const handleRemoveSkill = (skill: string) => { setRequiredSkills(requiredSkills.filter(s => s !== skill)); };
    const handleAddBenefit = () => { if (newBenefit.trim() && !benefits.includes(newBenefit.trim())) { setBenefits([...benefits, newBenefit.trim()]); setNewBenefit(''); } };
    const handleRemoveBenefit = (benefit: string) => { setBenefits(benefits.filter(b => b !== benefit)); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Admins must assign both HR and Technical Recruiter
        if (isAdmin && (!assignedHRId || !assignedTechId)) {
            toast.error('Both HR Recruiter and Technical Recruiter must be assigned before creating a position.');
            return;
        }

        setIsLoading(true);

        try {
            const payload: any = {
                project_id: projectId,
                job_title: jobTitle,
                job_description: jobDescription,
                required_skills: requiredSkills,
                experience_level: experienceLevel,
                work_type: workType,
                salary_min: salaryMin || null,
                salary_max: salaryMax || null,
                employment_type: employmentType,
                location_type: locationType,
                location_data: { 
                    office_location: officeLocation
                },
                years_of_experience: yearsOfExperience,
                education_level: educationLevel,
                benefits: benefits,
                assigned_tech_id: assignedTechId || undefined,
                assigned_hr_id: assignedHRId || undefined,
                status: 'Open'
            };

            console.log('DEBUG: submitting position payload:', payload);

            if (position) {
                await api.recruiter.updatePosition(position.id || position.position_id, payload);
                toast.success('Position updated successfully');
            } else {
                await api.recruiter.createPosition(payload);
                if (userRole === 'hr') {
                    toast.success('Position created and pending approval');
                } else {
                    toast.success('Position created successfully');
                }
            }

            onSuccess();
            onClose();
        } catch (error) {
            toast.error(
                getErrorMessage(error, position ? 'Failed to update position' : 'Failed to create position')
            );
        } finally {
            setIsLoading(false);
        }
    };

    const isAdmin = userRole === 'admin' || userRole === 'administrator';
    const isHR = userRole === 'hr';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto bg-white/80 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl">
                {/* ... (Header remains same) ... */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none" />

                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                        {position ? 'Edit Position' : (isAdmin ? 'Create New Position' : 'Request New Position')}
                    </DialogTitle>
                    <p className="text-gray-500 text-sm">
                        {isAdmin
                            ? 'Detail the role requirements and assign recruiters.'
                            : 'Submit a proposal for a new role. Technical recruiter will be assigned upon approval.'}
                    </p>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4 relative z-10">
                    <div className="grid grid-cols-2 gap-4">
                        {/* AI Job Description Builder */}
                        <div className="col-span-2 p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/80 space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4 text-indigo-500 fill-indigo-200 animate-pulse" />
                                    AI Job Builder
                                </h4>
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-medium px-2 py-0.5 rounded-full">Enrich from Draft</span>
                            </div>
                            <p className="text-xs text-indigo-700/80 leading-relaxed">
                                Describe team gaps, roles, or candidate needs. The AI will recommend a structured job title, description, skills, and experience constraints.
                            </p>
                            
                            <div className="space-y-2">
                                <Textarea
                                    placeholder="e.g., We need a backend engineer to take ownership of our data ingestion pipeline and scaling issues. They should be able to lead 2 junior devs and establish security best practices..."
                                    value={gapsAndRoles}
                                    onChange={(e) => setGapsAndRoles(e.target.value)}
                                    className="min-h-[80px] text-xs bg-white/70 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        onClick={handleGenerateEnrichment}
                                        disabled={isEnriching || !gapsAndRoles.trim()}
                                        size="sm"
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-3 h-8 shadow-sm flex items-center gap-1.5 transition-all duration-200"
                                    >
                                        {isEnriching ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                Analyzing...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-3.5 h-3.5" />
                                                Propose Definition
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {aiSuggestions && (
                                <div className="mt-3 p-4 bg-white border border-indigo-100 rounded-xl space-y-4 text-xs animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
                                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                        <span className="font-semibold text-gray-800 text-sm">AI Suggested Configuration</span>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                onClick={() => setAiSuggestions(null)}
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg px-2"
                                            >
                                                Discard
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={handleApplySuggestions}
                                                size="sm"
                                                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg px-3"
                                            >
                                                Apply Suggestions
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                                        <div>
                                            <span className="font-semibold text-gray-700 block">Suggested Title:</span>
                                            <span className="text-gray-900">{aiSuggestions.suggested_job_title}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-700 block">Experience Level:</span>
                                            <span className="capitalize text-gray-900 font-medium">
                                                {aiSuggestions.suggested_experience_level} ({aiSuggestions.suggested_years_of_experience} years)
                                            </span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-700 block">Education Level:</span>
                                            <span className="capitalize text-gray-900 font-medium">{aiSuggestions.suggested_education_level}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-700 block">Traits:</span>
                                            <span className="text-gray-900">{aiSuggestions.suggested_traits?.join(', ') || 'None'}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="font-semibold text-gray-700 block">Suggested Skills:</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {aiSuggestions.suggested_skills?.map((s: string) => (
                                                    <span key={s} className="bg-indigo-50 text-indigo-700 border border-indigo-100/60 px-2 py-0.5 rounded-lg text-[10px] font-medium">
                                                        {s}
                                                    </span>
                                                )) || <span className="text-gray-400 italic">None</span>}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="font-semibold text-gray-700 block">Suggested Description:</span>
                                            <p className="mt-1 text-gray-600 max-h-[100px] overflow-y-auto whitespace-pre-line border border-gray-100 p-2 rounded-xl bg-gray-50 leading-relaxed">
                                                {aiSuggestions.suggested_job_description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="col-span-2 space-y-2">
                            <Label htmlFor="title" className="text-sm font-semibold text-gray-700">Job Title</Label>
                            <Input id="title" placeholder="e.g., Senior Full-Stack Engineer" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required className="bg-white/50 border-gray-200 focus:border-indigo-500 rounded-xl" />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="experience" className="text-sm font-semibold text-gray-700">Experience Level</Label>
                            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                                <SelectTrigger className="bg-white/50 border-gray-200 rounded-xl"><SelectValue placeholder="Select level" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Junior">Junior</SelectItem>
                                    <SelectItem value="Mid-Level">Mid-Level</SelectItem>
                                    <SelectItem value="Senior">Senior</SelectItem>
                                    <SelectItem value="Lead">Lead</SelectItem>
                                    <SelectItem value="Management">Management</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="employmentType" className="text-sm font-semibold text-gray-700">Employment Type</Label>
                            <Select value={employmentType} onValueChange={setEmploymentType}>
                                <SelectTrigger className="bg-white/50 border-gray-200 rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="full-time">Full-time</SelectItem>
                                    <SelectItem value="part-time">Part-time</SelectItem>
                                    <SelectItem value="contract">Contract</SelectItem>
                                    <SelectItem value="internship">Internship</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="locationType" className="text-sm font-semibold text-gray-700">Location Type</Label>
                            <Select value={locationType} onValueChange={setLocationType}>
                                <SelectTrigger className="bg-white/50 border-gray-200 rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="remote">Remote</SelectItem>
                                    <SelectItem value="hybrid">Hybrid</SelectItem>
                                    <SelectItem value="on-site">On-site</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {locationType !== 'remote' && (
                            <div className="col-span-2 space-y-2">
                                <Label htmlFor="officeLocation" className="text-sm font-semibold text-gray-700">Office Location</Label>
                                <div className="relative">
                                    <Input id="officeLocation" placeholder="e.g., Cairo, Egypt" value={officeLocation} onChange={(e) => setOfficeLocation(e.target.value)} className="bg-white/50 border-gray-200 pl-10 rounded-xl" />
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-700">Years of Experience</Label>
                            <Input type="number" min={0} value={yearsOfExperience} onChange={(e) => setYearsOfExperience(parseInt(e.target.value) || 0)} className="bg-white/50 border-gray-200 rounded-xl" />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-700">Minimum Degree Level</Label>
                            <Select value={educationLevel} onValueChange={setEducationLevel}>
                                <SelectTrigger className="bg-white/50 border-gray-200 rounded-xl">
                                    <SelectValue placeholder="Select degree" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Any">Any Degree</SelectItem>
                                    <SelectItem value="Associate">Associate Degree</SelectItem>
                                    <SelectItem value="Bachelor">Bachelor's Degree</SelectItem>
                                    <SelectItem value="Master">Master's Degree</SelectItem>
                                    <SelectItem value="PhD">PhD / Doctorate</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-700">Minimum Salary (USD)</Label>
                            <Input type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(parseInt(e.target.value) || 0)} className="bg-white/50 border-gray-200 rounded-xl" />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-700">Maximum Salary (USD)</Label>
                            <Input type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(parseInt(e.target.value) || 0)} className="bg-white/50 border-gray-200 rounded-xl" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700">Required Skills</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add a skill (e.g., React)"
                                value={newSkill}
                                onChange={(e) => setNewSkill(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
                                className="bg-white/50 border-gray-200 rounded-xl"
                            />
                            <Button
                                type="button"
                                onClick={handleAddSkill}
                                size="icon"
                                className="rounded-xl shrink-0 border border-gray-200 bg-white/50 text-indigo-600 hover:bg-white"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {requiredSkills.map(skill => (
                                <Badge key={skill} variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100 py-1 px-3 rounded-lg flex items-center gap-1">
                                    {skill}
                                    <button type="button" onClick={() => handleRemoveSkill(skill)}>
                                        <X className="w-3 h-3 hover:text-red-500" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>



                    <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700">Benefits</Label>
                        <div className="flex gap-2">
                            <Input placeholder="Add a benefit (e.g., Health Insurance)" value={newBenefit} onChange={(e) => setNewBenefit(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBenefit())} className="bg-white/50 border-gray-200 rounded-xl" />
                            <Button type="button" onClick={handleAddBenefit} size="icon" className="rounded-xl shrink-0 border border-gray-200 bg-white/50 text-indigo-600 hover:bg-white"><Plus className="w-4 h-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {benefits.map(benefit => (
                                <Badge key={benefit} variant="secondary" className="bg-green-50 text-green-700 border-green-100 py-1 px-3 rounded-lg flex items-center gap-1">
                                    {benefit}
                                    <button type="button" onClick={() => handleRemoveBenefit(benefit)}><X className="w-3 h-3 hover:text-red-500" /></button>
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-semibold text-gray-700">
                            Job Description {isHR && <span className="text-xs font-normal text-gray-400 ml-1">(Optional for HR)</span>}
                        </Label>
                        <Textarea
                            id="description"
                            placeholder={isHR ? "Leave blank if you want the Technical Recruiter to define this..." : "Describe the role, responsibilities, and qualifications..."}
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            className="min-h-[120px] bg-white/50 border-gray-200 rounded-xl resize-none"
                        />
                    </div>

                    {(isAdmin || isHR) && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-gray-700">Assign HR Recruiter <span className="text-red-500">*</span></Label>
                                <Select value={assignedHRId} onValueChange={setAssignedHRId}>
                                    <SelectTrigger className="bg-white/50 border-gray-200 rounded-xl">
                                        <SelectValue placeholder="Select HR recruiter" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {hrRecruiters.map(rec => (
                                            <SelectItem key={rec.id} value={rec.id.toString()}>
                                                {rec.name} ({rec.assignedCount || 0} active)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-gray-700">Assign Technical Recruiter <span className="text-red-500">*</span></Label>
                                <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                                    <SelectTrigger className="bg-white/50 border-gray-200 rounded-xl">
                                        <SelectValue placeholder="Select technical recruiter" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {techRecruiters.map(rec => (
                                            <SelectItem key={rec.id} value={rec.id.toString()}>
                                                {rec.name} ({rec.assignedCount || 0} active)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {!isAdmin && isHR && !bypassAdminApproval && (
                        <div className="flex items-start gap-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                            <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-indigo-700 leading-relaxed">
                                As an HR recruiter, this position creation will be submitted to administrators for final approval.
                                Please ensure you have assigned both recruiters.
                            </p>
                        </div>
                    )}

                    <DialogFooter className="pt-4">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            className="rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading || !jobTitle.trim() || !assignedTechId || (isAdmin && !assignedHRId)}
                            className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            {position ? 'Save Changes' : (isAdmin ? 'Create Position' : 'Submit Request')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
