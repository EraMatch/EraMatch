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
import { Logo } from '../common/Logo';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../common/LoadingSpinner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { useAdminPendingRequests, useRecruiterDelegation } from '../../hooks/admin/useAdminDashboard';
import { useApproveRequest, useRejectRequest } from '../../hooks/admin/useAdminMutations';
import { useProjects } from '../../hooks/projects/useProjects';
import { usePositions } from '../../hooks/positions/usePositions';

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

export default function AdminRequests() {
    return (
        <div className="p-0">
            <AdminRequestsContent />
        </div>
    );
}

function AdminRequestsContent() {
    const queryClient = useQueryClient();

    // TanStack Query hooks
    const { data: requestsData, isLoading: requestsLoading } = useAdminPendingRequests('pending');
    const { data: projectsData, isLoading: projectsLoading } = useProjects();
    const { data: positionsData, isLoading: positionsLoading } = usePositions();
    const { data: delegationData, isLoading: delegationLoading } = useRecruiterDelegation();
    const approveRequestMutation = useApproveRequest();
    const rejectRequestMutation = useRejectRequest();

    const [projects, setProjects] = useState<any[]>([]);
    const [positions, setPositions] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'create_project' | 'create_position' | 'requests'>('requests');
    const isLoading = requestsLoading || projectsLoading || positionsLoading || delegationLoading;
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [requesterFilter, setRequesterFilter] = useState('all');
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
    const [bulkReviewNotes, setBulkReviewNotes] = useState('');
    const [bulkAssignedTechId, setBulkAssignedTechId] = useState('');
    const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

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

    // Sync query data into local state
    useEffect(() => {
        if (requestsData) setRequests(requestsData);
    }, [requestsData]);

    useEffect(() => {
        if (projectsData) setProjects(projectsData);
    }, [projectsData]);

    useEffect(() => {
        if (positionsData) setPositions(positionsData);
    }, [positionsData]);

    useEffect(() => {
        if (delegationData) {
            setTechRecruiters(delegationData.technicalRecruiters || []);
            setHRRecruiters(delegationData.hrRecruiters || []);
        }
    }, [delegationData]);

    const activeProjects = projects.filter((p) => {
        const status = String(p?.status || '').toLowerCase();
        return status === 'active';
    });

    useEffect(() => {
        if (!selectedProjectIdForPosition) return;
        const selected = projects.find((p) => String(p.id) === selectedProjectIdForPosition);
        const status = String(selected?.status || '').toLowerCase();
        if (selected && status !== 'active') {
            setSelectedProjectIdForPosition('');
        }
    }, [projects, selectedProjectIdForPosition]);

    useEffect(() => {
        setSelectedRequestIds((prev) => prev.filter((id) => requests.some((req) => String(req.id) === id)));
    }, [requests]);

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
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests() });
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

        const selectedProject = projects.find((p) => String(p.id) === selectedProjectIdForPosition);
        const selectedProjectStatus = String(selectedProject?.status || '').toLowerCase();
        if (selectedProjectStatus !== 'active') {
            toast.error('Only active (approved) projects can have positions.');
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
            queryClient.invalidateQueries({ queryKey: queryKeys.positions.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests() });
            setActiveTab('requests');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create position'));
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

                await approveRequestMutation.mutateAsync({
                    requestId: selectedRequest.id,
                    decision: {
                        assigned_tech_id: assignedTechId || undefined,
                        review_notes: reviewNotes
                    }
                });
                toast.success('Request approved and resource created!');
            } else {
                if (!reviewNotes.trim()) {
                    toast.error('Please provide a rejection reason');
                    setIsSubmitting(false);
                    return;
                }
                await rejectRequestMutation.mutateAsync({
                    requestId: selectedRequest.id,
                    notes: reviewNotes
                });
                toast.success('Request rejected');
            }

            setIsDecisionOpen(false);
            setIsDetailOpen(false);
            setReviewNotes('');
        } catch (error) {
            toast.error('Failed to process request');
        } finally {
            setIsSubmitting(false);
        }
    };

    const processRequestDecision = async (
        req: any,
        action: 'approve' | 'reject',
        options?: { notes?: string; assignedTechId?: string }
    ) => {
        const notes = options?.notes || '';
        const techId = options?.assignedTechId || '';

        if (action === 'approve') {
            if (req.request_type === 'position' && !techId) {
                throw new Error('Technical recruiter assignment is required for position approvals.');
            }

            await approveRequestMutation.mutateAsync({
                requestId: req.id,
                decision: {
                    assigned_tech_id: techId || undefined,
                    review_notes: notes || undefined,
                }
            });
            return;
        }

        if (!notes.trim()) {
            throw new Error('Rejection reason is required.');
        }
        await rejectRequestMutation.mutateAsync({ requestId: req.id, notes });
    };

    const filteredRequests = requests.filter((req) => {
        const matchesSearch =
            req.requester_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            req.data?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            req.data?.job_title?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesType = filterType === 'all' || req.request_type === filterType;
        const matchesRequester = requesterFilter === 'all' || req.requester_name === requesterFilter;

        return matchesSearch && matchesType && matchesRequester;
    }).sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

    const projectRequests = filteredRequests.filter((req) => req.request_type === 'project');
    const positionRequests = filteredRequests.filter((req) => req.request_type === 'position');
    const requesterOptions = Array.from(new Set(requests.map((req) => req.requester_name).filter(Boolean))).sort();

    const selectedRequests = filteredRequests.filter((req) => selectedRequestIds.includes(String(req.id)));
    const selectedPositionCount = selectedRequests.filter((req) => req.request_type === 'position').length;

    const toggleRequestSelection = (requestId: string) => {
        setSelectedRequestIds((prev) => (
            prev.includes(requestId)
                ? prev.filter((id) => id !== requestId)
                : [...prev, requestId]
        ));
    };

    const toggleSectionSelection = (sectionRequests: any[]) => {
        const sectionIds = sectionRequests.map((req) => String(req.id));
        const allSelected = sectionIds.every((id) => selectedRequestIds.includes(id));

        if (allSelected) {
            setSelectedRequestIds((prev) => prev.filter((id) => !sectionIds.includes(id)));
            return;
        }

        setSelectedRequestIds((prev) => Array.from(new Set([...prev, ...sectionIds])));
    };

    const handleBulkProcess = async (action: 'approve' | 'reject') => {
        if (selectedRequests.length === 0) {
            toast.error('Select at least one request first');
            return;
        }

        if (action === 'approve' && selectedPositionCount > 0 && !bulkAssignedTechId) {
            toast.error('Assign a technical recruiter for selected position approvals');
            return;
        }

        if (action === 'reject' && !bulkReviewNotes.trim()) {
            toast.error('Please provide rejection reason for bulk reject');
            return;
        }

        setIsBulkSubmitting(true);
        let successCount = 0;
        let failedCount = 0;

        for (const req of selectedRequests) {
            try {
                await processRequestDecision(req, action, {
                    notes: bulkReviewNotes,
                    assignedTechId: bulkAssignedTechId,
                });
                successCount += 1;
            } catch (error) {
                failedCount += 1;
            }
        }

        if (successCount > 0) {
            toast.success(`${successCount} request(s) ${action === 'approve' ? 'approved' : 'rejected'}`);
        }
        if (failedCount > 0) {
            toast.error(`${failedCount} request(s) failed to process`);
        }

        setSelectedRequestIds([]);
        setBulkReviewNotes('');
        setBulkAssignedTechId('');
        setIsBulkSubmitting(false);
    };

    const formatCreatedAt = (value?: string) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString();
    };

    const formatCurrencyValue = (value: unknown) => {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) return 'N/A';
        return `$${n.toLocaleString()}`;
    };

    const toStringArray = (value: unknown): string[] => {
        if (!Array.isArray(value)) return [];
        return value.map((item) => String(item)).filter(Boolean);
    };

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
                    <Logo size="md" className="mt-1 mr-6" />
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
                                            <SelectValue placeholder="Select an active project..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {activeProjects.map(p => (
                                                <SelectItem key={p.id} value={p.id.toString()}>{p.projectName}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-gray-500">
                                        Only active (approved) projects are listed.
                                    </p>
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
                                <Button type="submit" disabled={isSubmitting || !posJobTitle.trim() || !selectedProjectIdForPosition || activeProjects.length === 0} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-8 h-12">
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
                    <div className="space-y-5">
                        <Card className="rounded-3xl border-gray-100 shadow-sm bg-white">
                            <CardContent className="p-5 space-y-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <Filter size={15} />
                                    Request filters
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <Select value={filterType} onValueChange={setFilterType}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder="Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All types</SelectItem>
                                            <SelectItem value="project">Projects</SelectItem>
                                            <SelectItem value="position">Positions</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={requesterFilter} onValueChange={setRequesterFilter}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder="Requester" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All requesters</SelectItem>
                                            {requesterOptions.map((name) => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select value={sortOrder} onValueChange={(val: 'newest' | 'oldest') => setSortOrder(val)}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder="Sort" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="newest">Newest first</SelectItem>
                                            <SelectItem value="oldest">Oldest first</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-xl"
                                        onClick={() => {
                                            setFilterType('all');
                                            setRequesterFilter('all');
                                            setSortOrder('newest');
                                            setSearchQuery('');
                                            setSelectedRequestIds([]);
                                        }}
                                    >
                                        Reset filters
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {selectedRequestIds.length > 0 && (
                            <Card className="rounded-3xl border-indigo-100 bg-indigo-50/40">
                                <CardContent className="p-5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-indigo-800">
                                            {selectedRequestIds.length} request(s) selected
                                        </p>
                                        <button
                                            onClick={() => setSelectedRequestIds([])}
                                            className="text-xs text-indigo-700 hover:text-indigo-900"
                                        >
                                            Clear selection
                                        </button>
                                    </div>

                                    {selectedPositionCount > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-xs uppercase tracking-wide text-indigo-700">Technical Recruiter for Position Approvals</Label>
                                            <Select value={bulkAssignedTechId} onValueChange={setBulkAssignedTechId}>
                                                <SelectTrigger className="rounded-xl bg-white">
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
                                    )}

                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase tracking-wide text-indigo-700">Bulk Review Notes</Label>
                                        <Textarea
                                            value={bulkReviewNotes}
                                            onChange={(e) => setBulkReviewNotes(e.target.value)}
                                            placeholder="For bulk reject this is required; for approve it is optional"
                                            className="rounded-xl min-h-[84px] bg-white"
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                                            disabled={isBulkSubmitting}
                                            onClick={() => handleBulkProcess('approve')}
                                        >
                                            {isBulkSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                            Approve Selected
                                        </Button>
                                        <Button
                                            type="button"
                                            className="rounded-xl bg-red-500 hover:bg-red-600 text-white"
                                            disabled={isBulkSubmitting}
                                            onClick={() => handleBulkProcess('reject')}
                                        >
                                            {isBulkSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                            Reject Selected
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {filteredRequests.length === 0 ? (
                            <Card className="border-dashed h-52 flex flex-col items-center justify-center text-center p-6 rounded-3xl">
                                <Clock className="w-10 h-10 text-gray-300 mb-4" />
                                <h3 className="text-lg font-medium text-gray-900">No matches found</h3>
                                <p className="text-gray-500">Try changing filters or search criteria.</p>
                            </Card>
                        ) : (
                            <>
                                <Card className="rounded-3xl border-gray-100 shadow-sm bg-white overflow-hidden">
                                    <CardContent className="p-0">
                                        <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-50">
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-indigo-600" />
                                                <h3 className="font-semibold text-slate-900">Project Requests ({projectRequests.length})</h3>
                                            </div>
                                            {projectRequests.length > 0 && (
                                                <button
                                                    onClick={() => toggleSectionSelection(projectRequests)}
                                                    className="text-xs text-indigo-700 hover:text-indigo-900"
                                                >
                                                    {projectRequests.every((req) => selectedRequestIds.includes(String(req.id)))
                                                        ? 'Unselect all'
                                                        : 'Select all'}
                                                </button>
                                            )}
                                        </div>

                                        {projectRequests.length === 0 ? (
                                            <div className="px-5 py-6 text-sm text-gray-500">No pending project requests in this view.</div>
                                        ) : (
                                            <div className="divide-y">
                                                {projectRequests.map((req) => (
                                                    <div key={req.id} className="px-5 py-4 flex items-center gap-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRequestIds.includes(String(req.id))}
                                                            onChange={() => toggleRequestSelection(String(req.id))}
                                                            className="h-4 w-4 rounded border-gray-300"
                                                        />

                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-slate-900 truncate">{req.data?.name || 'Untitled project'}</p>
                                                            <p className="text-sm text-gray-600">From {req.requester_name || 'Unknown requester'} • {formatCreatedAt(req.created_at)}</p>
                                                        </div>

                                                        <div className="text-sm text-gray-600 min-w-[120px] text-right">
                                                            {req.data?.budget ? `$${Number(req.data.budget).toLocaleString()}` : 'No budget'}
                                                        </div>

                                                        <Button
                                                            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                                                            onClick={() => {
                                                                setSelectedRequest(req);
                                                                setIsDetailOpen(true);
                                                            }}
                                                        >
                                                            Review
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className="rounded-3xl border-gray-100 shadow-sm bg-white overflow-hidden">
                                    <CardContent className="p-0">
                                        <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-50">
                                            <div className="flex items-center gap-2">
                                                <Briefcase size={16} className="text-purple-600" />
                                                <h3 className="font-semibold text-slate-900">Position Requests ({positionRequests.length})</h3>
                                            </div>
                                            {positionRequests.length > 0 && (
                                                <button
                                                    onClick={() => toggleSectionSelection(positionRequests)}
                                                    className="text-xs text-indigo-700 hover:text-indigo-900"
                                                >
                                                    {positionRequests.every((req) => selectedRequestIds.includes(String(req.id)))
                                                        ? 'Unselect all'
                                                        : 'Select all'}
                                                </button>
                                            )}
                                        </div>

                                        {positionRequests.length === 0 ? (
                                            <div className="px-5 py-6 text-sm text-gray-500">No pending position requests in this view.</div>
                                        ) : (
                                            <div className="divide-y">
                                                {positionRequests.map((req) => (
                                                    <div key={req.id} className="px-5 py-4 flex items-center gap-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRequestIds.includes(String(req.id))}
                                                            onChange={() => toggleRequestSelection(String(req.id))}
                                                            className="h-4 w-4 rounded border-gray-300"
                                                        />

                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-slate-900 truncate">{req.data?.job_title || 'Untitled position'}</p>
                                                            <p className="text-sm text-gray-600">From {req.requester_name || 'Unknown requester'} • {formatCreatedAt(req.created_at)}</p>
                                                        </div>

                                                        <div className="text-sm text-gray-600 min-w-[180px] text-right">
                                                            {req.data?.salary_min
                                                                ? `$${Number(req.data.salary_min).toLocaleString()} - $${Number(req.data.salary_max || 0).toLocaleString()}`
                                                                : 'No salary range'}
                                                        </div>

                                                        <Button
                                                            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                                                            onClick={() => {
                                                                setSelectedRequest(req);
                                                                setIsDetailOpen(true);
                                                            }}
                                                        >
                                                            Review
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </>
                        )}
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
                                            <p className="text-lg font-semibold text-gray-900">{selectedRequest.data?.job_title || 'Untitled position'}</p>
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Experience</Label>
                                            <Badge variant="secondary">{selectedRequest.data?.experience_level || 'N/A'}</Badge>
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Work Type</Label>
                                            <Badge variant="secondary">{selectedRequest.data?.work_type || 'N/A'}</Badge>
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Salary Range</Label>
                                            <p className="font-semibold text-green-600">
                                                {formatCurrencyValue(selectedRequest.data?.salary_min)} - {formatCurrencyValue(selectedRequest.data?.salary_max)}
                                            </p>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Required Skills</Label>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {toStringArray(selectedRequest.data?.required_skills).map((s) => (
                                                    <Badge key={s} className="bg-indigo-50 text-indigo-700 border-none">{s}</Badge>
                                                ))}
                                                {toStringArray(selectedRequest.data?.required_skills).length === 0 && (
                                                    <span className="text-sm text-gray-500">No skills provided</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs uppercase text-gray-400 font-bold mb-1 block">Description</Label>
                                            <p className="text-gray-700 text-sm leading-relaxed">{selectedRequest.data?.job_description || 'No description provided.'}</p>
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
