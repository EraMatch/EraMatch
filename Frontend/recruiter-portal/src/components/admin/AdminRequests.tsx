import React, { useState, useEffect } from 'react';
import { Clock, Search, Filter, CheckCircle, Plus, Loader2, FileText, Briefcase, UserPlus, XCircle, ClipboardCheck, MapPin, DollarSign, Info, Users, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { api } from '../../services/api';
import { toast } from 'sonner';
import EraMatchLogo from '../../assets/image-eramatch.png';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../common/LoadingSpinner';

export default function AdminRequests() {
    return (
        <div className="p-0">
            <AdminRequestsContent />
        </div>
    );
}

function AdminRequestsContent() {
    const [projects, setProjects] = useState<any[]>([]);
    const [positions, setPositions] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'create_project' | 'create_position' | 'requests'>('requests');
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');

    // Creation Form States (Project)
    const [projName, setProjName] = useState('');
    const [projDescription, setProjDescription] = useState('');
    const [projTargetHireCount, setProjTargetHireCount] = useState<number>(1);
    const [projBudget, setProjBudget] = useState<number>(0);
    const [projPriority, setProjPriority] = useState('medium');
    const [projDepartment, setProjDepartment] = useState('');
    const [projStartDate, setProjStartDate] = useState('');
    const [projEndDate, setProjEndDate] = useState('');

    // Creation Form States (Position)
    const [posJobTitle, setPosJobTitle] = useState('');
    const [posJobDescription, setPosJobDescription] = useState('');
    const [posRequiredSkills, setPosRequiredSkills] = useState<string[]>([]);
    const [newSkill, setNewSkill] = useState('');
    const [posBenefits, setPosBenefits] = useState<string[]>([]);
    const [newBenefit, setNewBenefit] = useState('');
    const [posExperienceLevel, setPosExperienceLevel] = useState('Mid-Level');
    const [posWorkType, setPosWorkType] = useState('Remote');
    const [posSalaryMin, setPosSalaryMin] = useState<number>(0);
    const [posSalaryMax, setPosSalaryMax] = useState<number>(0);
    const [posEmploymentType, setPosEmploymentType] = useState('full-time');
    const [posLocationType, setPosLocationType] = useState('remote');
    const [posOfficeLocation, setPosOfficeLocation] = useState('');
    const [posYearsOfExperience, setPosYearsOfExperience] = useState<number>(0);
    const [posEducationLevel, setPosEducationLevel] = useState('');
    const [selectedProjectIdForPosition, setSelectedProjectIdForPosition] = useState<string>('');

    // Modal states
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isDecisionOpen, setIsDecisionOpen] = useState(false);
    const [decisionType, setDecisionType] = useState<'approve' | 'reject'>('approve');

    // Decision fields
    const [reviewNotes, setReviewNotes] = useState('');
    const [assignedTechId, setAssignedTechId] = useState('');
    const [assignedHRId, setAssignedHRId] = useState(''); // Added
    const [techRecruiters, setTechRecruiters] = useState<any[]>([]);
    const [hrRecruiters, setHRRecruiters] = useState<any[]>([]); // Added
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchAll();
        fetchTechRecruiters();
    }, []);

    const fetchAll = async () => {
        try {
            setIsLoading(true);
            const [reqs, projs, pos] = await Promise.all([
                api.admin.listApprovalRequests('pending'),
                api.recruiter.getProjects(),
                api.recruiter.getPositions()
            ]);
            setRequests(reqs || []);
            setProjects(projs || []);
            setPositions(pos || []);
        } catch (error) {
            toast.error('Failed to load provisioning data');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTechRecruiters = async () => {
        try {
            const res = await api.admin.getRecruiterDelegation();
            setTechRecruiters(res.technicalRecruiters || []);
            setHRRecruiters(res.hrRecruiters || []); // Added
        } catch (error) {
            console.error('Failed to fetch recruiters');
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const payload = {
                name: projName,
                description: projDescription,
                target_hire_count: projTargetHireCount,
                budget: projBudget,
                priority: projPriority,
                department: projDepartment,
                start_date: projStartDate || null,
                end_date: projEndDate || null,
            };
            await api.recruiter.createProject(payload);
            toast.success('Project created successfully');
            setProjName('');
            setProjDescription('');
            fetchAll();
            setActiveTab('requests');
        } catch (error) {
            toast.error('Failed to create project');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreatePosition = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProjectIdForPosition) {
            toast.error('Please select a project first');
            return;
        }
        setIsSubmitting(true);
        try {
            const payload = {
                project_id: selectedProjectIdForPosition,
                job_title: posJobTitle,
                job_description: posJobDescription,
                required_skills: posRequiredSkills,
                experience_level: posExperienceLevel,
                work_type: posWorkType,
                salary_min: posSalaryMin,
                salary_max: posSalaryMax,
                employment_type: posEmploymentType,
                location_type: posLocationType,
                location_data: { office_location: posOfficeLocation },
                years_of_experience: posYearsOfExperience,
                education_level: posEducationLevel,
                benefits: posBenefits,
                assigned_tech_id: assignedTechId || undefined, // Added
                assigned_hr_id: assignedHRId || undefined, // Added
                status: 'Open' as const
            };
            await api.recruiter.createPosition(payload);
            toast.success('Position created successfully');
            setPosJobTitle('');
            setPosJobDescription('');
            fetchAll();
            setActiveTab('requests');
        } catch (error) {
            toast.error('Failed to create position');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleProcessRequest = async () => {
        if (!selectedRequest) return;
        setIsSubmitting(true);

        try {
            if (decisionType === 'approve') {
                if (selectedRequest.request_type === 'position' && !assignedTechId) {
                    toast.error('Please assign a technical recruiter for this position');
                    setIsSubmitting(false);
                    return;
                }

                await api.admin.approveRequest(selectedRequest.id, {
                    assigned_tech_id: assignedTechId || undefined,
                    review_notes: reviewNotes
                });
                toast.success('Request approved and resource created!');
            } else {
                await api.admin.rejectRequest(selectedRequest.id, reviewNotes);
                toast.success('Request rejected');
            }

            setIsDecisionOpen(false);
            setIsDetailOpen(false);
            fetchAll();
        } catch (error) {
            toast.error('Failed to process request');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredRequests = requests.filter(req => {
        const matchesSearch =
            req.requester_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            req.data?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            req.data?.job_title?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesType = filterType === 'all' || req.request_type === filterType;

        return matchesSearch && matchesType;
    });

    const navigate = useNavigate();

    return (
        <div className="px-12 py-8 space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <button
                        onClick={() => navigate('/admin/dashboard')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
                    >
                        <ArrowLeft size={20} />
                        <span className="font-['Arimo',sans-serif] text-[14px]">
                            Back to Dashboard
                        </span>
                    </button>
                    <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Projects & Positions Hub</h1>
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Provisioning and resource management</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search requests..."
                            className="pl-10 w-48 rounded-xl border-gray-200"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <img src={EraMatchLogo} alt="Era Match" className="h-[72px] w-auto object-contain mt-1 mr-6" />
                </div>
            </div>

            <div className="flex gap-2 p-1 bg-gray-100/50 rounded-2xl w-fit">
                <button
                    onClick={() => setActiveTab('create_project')}
                    className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'create_project' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Create Project
                </button>
                <button
                    onClick={() => setActiveTab('create_position')}
                    className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'create_position' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Create Position
                </button>
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'requests' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Pending Requests ({requests.length})
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <LoadingSpinner message="Loading requests..." fullScreen={false} />
                </div>
            ) : activeTab === 'create_project' ? (
                <Card className="rounded-3xl border-gray-100 shadow-sm bg-white overflow-hidden">
                    <CardContent className="p-8">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">New Project Definition</h2>
                            <p className="text-gray-500">Specify the core parameters for the new recruitment project.</p>
                        </div>
                        <form onSubmit={handleCreateProject} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Project Name</Label>
                                    <Input
                                        placeholder="e.g., Q4 Engineering Expansion"
                                        value={projName}
                                        onChange={(e) => setProjName(e.target.value)}
                                        required
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Department</Label>
                                    <Input
                                        placeholder="e.g., Engineering"
                                        value={projDepartment}
                                        onChange={(e) => setProjDepartment(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-sm font-semibold">Description</Label>
                                    <Textarea
                                        placeholder="Outline the goals and requirements..."
                                        value={projDescription}
                                        onChange={(e) => setProjDescription(e.target.value)}
                                        className="rounded-xl min-h-[100px] resize-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Target Hire Count</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={projTargetHireCount}
                                        onChange={(e) => setProjTargetHireCount(parseInt(e.target.value))}
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Budget ($)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={projBudget}
                                        onChange={(e) => setProjBudget(parseInt(e.target.value))}
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Priority</Label>
                                    <Select value={projPriority} onValueChange={setProjPriority}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="low">Low</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="high">High</SelectItem>
                                            <SelectItem value="urgent">Urgent</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Start Date</Label>
                                    <Input
                                        type="date"
                                        value={projStartDate}
                                        onChange={(e) => setProjStartDate(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button type="submit" disabled={isSubmitting || !projName.trim()} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-8 h-12">
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    Create Project
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : activeTab === 'create_position' ? (
                <Card className="rounded-3xl border-gray-100 shadow-sm bg-white overflow-hidden">
                    <CardContent className="p-8">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">New Role Definition</h2>
                            <p className="text-gray-500">Configure the requirements and parameters for a specific position.</p>
                        </div>
                        <form onSubmit={handleCreatePosition} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-sm font-semibold">Parent Project</Label>
                                    <Select value={selectedProjectIdForPosition} onValueChange={setSelectedProjectIdForPosition}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder="Select a project..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {projects.map(p => (
                                                <SelectItem key={p.id} value={p.id.toString()}>{p.projectName}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-sm font-semibold">Job Title</Label>
                                    <Input
                                        placeholder="e.g., Senior Full-Stack Engineer"
                                        value={posJobTitle}
                                        onChange={(e) => setPosJobTitle(e.target.value)}
                                        required
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Employment Type</Label>
                                    <Select value={posEmploymentType} onValueChange={setPosEmploymentType}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="full-time">Full-time</SelectItem>
                                            <SelectItem value="part-time">Part-time</SelectItem>
                                            <SelectItem value="contract">Contract</SelectItem>
                                            <SelectItem value="internship">Internship</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Experience Level</Label>
                                    <Select value={posExperienceLevel} onValueChange={setPosExperienceLevel}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Junior">Junior</SelectItem>
                                            <SelectItem value="Mid-Level">Mid-Level</SelectItem>
                                            <SelectItem value="Senior">Senior</SelectItem>
                                            <SelectItem value="Lead">Lead</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Location Type</Label>
                                    <Select value={posLocationType} onValueChange={setPosLocationType}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="remote">Remote</SelectItem>
                                            <SelectItem value="hybrid">Hybrid</SelectItem>
                                            <SelectItem value="on-site">On-site</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Years of Experience</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={posYearsOfExperience}
                                        onChange={(e) => setPosYearsOfExperience(parseInt(e.target.value))}
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Education Level</Label>
                                    <Input
                                        placeholder="e.g., Bachelor in CS"
                                        value={posEducationLevel}
                                        onChange={(e) => setPosEducationLevel(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>
                                {posLocationType !== 'remote' && (
                                    <div className="col-span-2 space-y-2">
                                        <Label className="text-sm font-semibold">Office Location</Label>
                                        <Input
                                            placeholder="e.g., Cairo, Egypt"
                                            value={posOfficeLocation}
                                            onChange={(e) => setPosOfficeLocation(e.target.value)}
                                            className="rounded-xl"
                                        />
                                    </div>
                                )}
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-sm font-semibold">Required Skills</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Add a skill (e.g., React)"
                                            value={newSkill}
                                            onChange={(e) => setNewSkill(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), setPosRequiredSkills([...posRequiredSkills, newSkill]), setNewSkill(''))}
                                            className="rounded-xl"
                                        />
                                        <Button type="button" onClick={() => { if (newSkill) { setPosRequiredSkills([...posRequiredSkills, newSkill]); setNewSkill(''); } }} className="rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">Add</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {posRequiredSkills.map(s => (
                                            <Badge key={s} variant="secondary" className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border-none">
                                                {s}
                                                <XCircle size={14} className="cursor-pointer" onClick={() => setPosRequiredSkills(posRequiredSkills.filter(sk => sk !== s))} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-sm font-semibold">Benefits</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Add a benefit (e.g., Health Insurance)"
                                            value={newBenefit}
                                            onChange={(e) => setNewBenefit(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), setPosBenefits([...posBenefits, newBenefit]), setNewBenefit(''))}
                                            className="rounded-xl"
                                        />
                                        <Button type="button" onClick={() => { if (newBenefit) { setPosBenefits([...posBenefits, newBenefit]); setNewBenefit(''); } }} className="rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">Add</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {posBenefits.map(b => (
                                            <Badge key={b} variant="secondary" className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border-none">
                                                {b}
                                                <XCircle size={14} className="cursor-pointer" onClick={() => setPosBenefits(posBenefits.filter(be => be !== b))} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 col-span-2">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Assign HR Recruiter</Label>
                                        <Select value={assignedHRId} onValueChange={setAssignedHRId}>
                                            <SelectTrigger className="rounded-xl">
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
                                        <Label className="text-sm font-semibold">Assign Technical Recruiter</Label>
                                        <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                                            <SelectTrigger className="rounded-xl">
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
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-sm font-semibold">Job Description</Label>
                                    <Textarea
                                        placeholder="Describe the role and responsibilities..."
                                        value={posJobDescription}
                                        onChange={(e) => setPosJobDescription(e.target.value)}
                                        className="rounded-xl min-h-[120px] resize-none"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button type="submit" disabled={isSubmitting || !posJobTitle.trim() || !selectedProjectIdForPosition} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-8 h-12">
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    Create Position
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : activeTab === 'requests' ? (
                requests.length === 0 ? (
                    <Card className="border-dashed h-64 flex flex-col items-center justify-center text-center p-6 rounded-3xl">
                        <CheckCircle className="w-12 h-12 text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
                        <p className="text-gray-500">No pending approval requests at the moment.</p>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {requests.map(req => (
                            <Card key={req.id} className="group hover:shadow-xl transition-all duration-300 border-gray-100 rounded-3xl overflow-hidden hover:-translate-y-1 bg-white/50 backdrop-blur-sm">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-3 rounded-2xl ${req.request_type === 'project' ? 'bg-indigo-50 text-indigo-600' : 'bg-purple-50 text-purple-600'}`}>
                                                {req.request_type === 'project' ? <FileText size={20} /> : <Briefcase size={20} />}
                                            </div>
                                            <div>
                                                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider mb-1">
                                                    {req.request_type}
                                                </Badge>
                                                <h3 className="font-bold text-gray-900 line-clamp-1">
                                                    {req.request_type === 'project' ? req.data.name : req.data.job_title}
                                                </h3>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3 mb-6">
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <UserPlus size={14} />
                                            <span>From: <span className="font-medium text-gray-700">{req.requester_name}</span></span>
                                        </div>
                                        {req.request_type === 'project' && req.data.budget && (
                                            <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                                                <DollarSign size={14} />
                                                <span>Budget: ${req.data.budget.toLocaleString()}</span>
                                            </div>
                                        )}
                                        {req.request_type === 'position' && req.data.salary_min && (
                                            <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
                                                <DollarSign size={14} />
                                                <span>Range: ${req.data.salary_min.toLocaleString()} - ${req.data.salary_max.toLocaleString()}</span>
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                                        onClick={() => {
                                            setSelectedRequest(req);
                                            setIsDetailOpen(true);
                                        }}
                                    >
                                        Review Proposal
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )
            ) : null}

            {/* Modal for creating resources removed, replaced by inline tabs */}

            {/* Detail Modal */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="sm:max-w-2xl bg-white/90 backdrop-blur-xl border-white/20 rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                            {selectedRequest?.request_type === 'project' ? 'Project Proposal' : 'Position Proposal'}
                        </DialogTitle>
                        <DialogDescription>
                            Requested by {selectedRequest?.requester_name}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="space-y-6 py-4">
                            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 grid grid-cols-2 gap-6">
                                {selectedRequest.request_type === 'project' ? (
                                    <>
                                        <div className="col-span-2">
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Project Name</Label>
                                            <p className="text-lg font-semibold text-gray-900">{selectedRequest.data.name}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Description</Label>
                                            <p className="text-gray-700 leading-relaxed italic">"{selectedRequest.data.description}"</p>
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Target Hires</Label>
                                            <div className="flex items-center gap-2 text-gray-900 font-medium">
                                                <Users size={16} className="text-indigo-500" />
                                                {selectedRequest.data.target_hire_count}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="col-span-2">
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Job Title</Label>
                                            <p className="text-lg font-semibold text-gray-900">{selectedRequest.data.job_title}</p>
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Experience</Label>
                                            <Badge variant="secondary">{selectedRequest.data.experience_level}</Badge>
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Work Type</Label>
                                            <Badge variant="secondary">{selectedRequest.data.work_type}</Badge>
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Salary Range</Label>
                                            <p className="font-semibold text-green-600">${selectedRequest.data.salary_min.toLocaleString()} - ${selectedRequest.data.salary_max.toLocaleString()}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Required Skills</Label>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {selectedRequest.data.required_skills?.map((s: string) => (
                                                    <Badge key={s} className="bg-indigo-50 text-indigo-700 border-none">{s}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Description</Label>
                                            <p className="text-gray-700 text-sm leading-relaxed">{selectedRequest.data.job_description}</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1 rounded-xl border-red-100 text-red-500 hover:bg-red-50 h-12 font-semibold"
                                    onClick={() => {
                                        setDecisionType('reject');
                                        setReviewNotes('');
                                        setIsDecisionOpen(true);
                                    }}
                                >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Reject Request
                                </Button>
                                <Button
                                    className="flex-[2] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg h-12 font-semibold"
                                    onClick={() => {
                                        setDecisionType('approve');
                                        setReviewNotes('');
                                        setAssignedTechId('');
                                        setIsDecisionOpen(true);
                                    }}
                                >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Approve & Create
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Decision Modal */}
            <Dialog open={isDecisionOpen} onOpenChange={setIsDecisionOpen}>
                <DialogContent className="sm:max-w-[450px] bg-white rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className={`text-xl font-bold flex items-center gap-2 ${decisionType === 'approve' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {decisionType === 'approve' ? <CheckCircle /> : <XCircle />}
                            {decisionType === 'approve' ? 'Approve Request' : 'Reject Request'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {decisionType === 'approve' && selectedRequest?.request_type === 'position' && (
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-gray-700">Assign Technical Recruiter</Label>
                                <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                                    <SelectTrigger className="rounded-xl border-gray-200">
                                        <SelectValue placeholder="Select technician..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {techRecruiters.map(rec => (
                                            <SelectItem key={rec.id} value={rec.id.toString()}>
                                                {rec.name} ({rec.assignedCount} active)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                    <Info size={10} />
                                    Positions must have an assigned technical recruiter before creation.
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-700">Review Notes (Optional)</Label>
                            <Textarea
                                placeholder={decisionType === 'approve' ? "Any additional instructions..." : "Reason for rejection..."}
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                className="rounded-xl border-gray-200 resize-none min-h-[100px]"
                            />
                        </div>

                        {decisionType === 'approve' && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-700 leading-tight">
                                    Approving will automatically create the {selectedRequest?.request_type} in the system. This action cannot be undone.
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDecisionOpen(false)} className="rounded-xl">
                            Cancel
                        </Button>
                        <Button
                            disabled={isSubmitting || (decisionType === 'approve' && selectedRequest?.request_type === 'position' && !assignedTechId)}
                            onClick={handleProcessRequest}
                            className={`rounded-xl px-8 ${decisionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'} text-white`}
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Confirm {decisionType === 'approve' ? 'Approval' : 'Rejection'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
