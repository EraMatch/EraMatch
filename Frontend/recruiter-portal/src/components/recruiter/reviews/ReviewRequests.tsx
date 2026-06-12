import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { toast } from 'sonner';
import { useAssignedRequests, useReviewRequest } from '../../../hooks/reviews/useReviews';
import { Loader2, CheckCircle, XCircle, FileText, Calendar, Briefcase, MapPin, DollarSign, ChevronDown, ChevronUp, Search, Filter } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { AdminPositionModal } from '../../admin/AdminPositionModal';

export function ReviewRequests() {
    const navigate = useNavigate();
    const { data: requestsData, isLoading } = useAssignedRequests();
    const requests: any[] = requestsData ?? [];
    const reviewRequestMutation = useReviewRequest();
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPosition, setEditingPosition] = useState<any>(null);
    const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
    const [reviewNotes, setReviewNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [organizationFilter, setOrganizationFilter] = useState<'all' | 'needs_attention' | 'ready'>('all');

    const handleAction = (request: any, action: 'approved' | 'rejected') => {
        if (action === 'approved' && request.entity_id && request.request_type !== 'project') {
            const params = new URLSearchParams({
                positionId: String(request.entity_id),
                positionTitle: String(request.position_title || ''),
            });
            navigate(`/recruiter/reviews/${request.id}/pre-matching?${params.toString()}`);
            return;
        }
        setSelectedRequest(request);
        setReviewAction(action);
        setReviewNotes('');
        setIsReviewModalOpen(true);
    };

    const handleEdit = (request: any) => {
        setEditingPosition({
            ...request.position_data,
            id: request.entity_id,
            position_id: request.entity_id
        });
        setIsEditModalOpen(true);
    };

    const handleSubmitReview = async () => {
        if (!selectedRequest) return;

        try {
            setIsSubmitting(true);
            await reviewRequestMutation.mutateAsync({ id: selectedRequest.id, action: reviewAction, notes: reviewNotes });
            toast.success(`Request ${reviewAction} successfully`);
            setIsReviewModalOpen(false);
        } catch (error) {
            console.error('Failed to submit review:', error);
            toast.error('Failed to submit review');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const normalizeSkills = (skills: unknown): string[] => {
        if (!Array.isArray(skills)) return [];
        return skills.map((s) => String(s || '').trim()).filter(Boolean);
    };

    const getMissingFieldCount = (req: any) => {
        const data = req?.position_data || {};
        const descriptionMissing = !String(data.job_description || '').trim();
        const skillsMissing = normalizeSkills(data.required_skills).length === 0;
        const salaryMissing = Number(data.salary_min || 0) <= 0 || Number(data.salary_max || 0) <= 0;
        return [descriptionMissing, skillsMissing, salaryMissing].filter(Boolean).length;
    };

    const formatDate = (value?: string) => {
        if (!value) return '-';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
    };

    const formatCurrency = (value: unknown) => {
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num) || num <= 0) return 'N/A';
        return `$${num.toLocaleString()}`;
    };

    const sortedRequests = useMemo(() => {
        return [...requests].sort((a, b) => {
            const aTime = new Date(a.created_at || 0).getTime();
            const bTime = new Date(b.created_at || 0).getTime();
            return bTime - aTime;
        });
    }, [requests]);

    const filteredRequests = useMemo(() => {
        const term = searchQuery.trim().toLowerCase();
        return sortedRequests.filter((req) => {
            const data = req?.position_data || {};
            const skills = normalizeSkills(data.required_skills).join(' ').toLowerCase();
            const title = String(req?.position_title || '').toLowerCase();
            const description = String(data.job_description || '').toLowerCase();
            const matchesSearch = !term || title.includes(term) || skills.includes(term) || description.includes(term);

            const missingCount = getMissingFieldCount(req);
            const matchesOrganization =
                organizationFilter === 'all' ||
                (organizationFilter === 'needs_attention' && missingCount > 0) ||
                (organizationFilter === 'ready' && missingCount === 0);

            return matchesSearch && matchesOrganization;
        });
    }, [sortedRequests, searchQuery, organizationFilter]);

    const requestsNeedingAttention = useMemo(
        () => filteredRequests.filter((req) => getMissingFieldCount(req) > 0),
        [filteredRequests],
    );

    const readyRequests = useMemo(
        () => filteredRequests.filter((req) => getMissingFieldCount(req) === 0),
        [filteredRequests],
    );

    const totalMissingFields = useMemo(
        () => requests.reduce((sum, req) => sum + getMissingFieldCount(req), 0),
        [requests],
    );

    if (isLoading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#6366F1]" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="relative overflow-hidden rounded-[24px] bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-3xl mix-blend-multiply"></div>
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 blur-3xl mix-blend-multiply"></div>
                <div className="relative z-10">
                    <h1 className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent mb-2">Technical Reviews</h1>
                    <p className="text-[15px] font-medium text-slate-500">Review and approve position requests assigned to you.</p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-indigo-200">
                    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-500/5 transition-transform duration-500 group-hover:scale-150"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs uppercase tracking-wider text-indigo-500 font-bold">Pending Reviews</p>
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                <Briefcase size={16} />
                            </div>
                        </div>
                        <p className="text-4xl font-extrabold text-slate-900">{requests.length}</p>
                    </div>
                </div>
                <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-amber-200">
                    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/5 transition-transform duration-500 group-hover:scale-150"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs uppercase tracking-wider text-amber-600 font-bold">Need Attention</p>
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                <FileText size={16} />
                            </div>
                        </div>
                        <p className="text-4xl font-extrabold text-slate-900">{requests.filter((req) => getMissingFieldCount(req) > 0).length}</p>
                    </div>
                </div>
                <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-emerald-200">
                    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/5 transition-transform duration-500 group-hover:scale-150"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs uppercase tracking-wider text-emerald-600 font-bold">Ready To Approve</p>
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                <CheckCircle size={16} />
                            </div>
                        </div>
                        <p className="text-4xl font-extrabold text-slate-900">{requests.filter((req) => getMissingFieldCount(req) === 0).length}</p>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="rounded-[20px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-[400px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title, description, or skills"
                            className="w-full pl-11 pr-4 h-11 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 hover:border-indigo-300"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500 mr-2">
                            <Filter size={16} className="text-slate-400" />
                            <span>Filter Status:</span>
                        </div>
                        <button
                            className={`h-11 px-5 rounded-xl text-sm font-bold transition-all ${organizationFilter === 'all' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-indigo-300'}`}
                            onClick={() => setOrganizationFilter('all')}
                        >
                            All
                        </button>
                        <button
                            className={`h-11 px-5 rounded-xl text-sm font-bold transition-all ${organizationFilter === 'needs_attention' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-amber-300'}`}
                            onClick={() => setOrganizationFilter('needs_attention')}
                        >
                            Needs Attention
                        </button>
                        <button
                            className={`h-11 px-5 rounded-xl text-sm font-bold transition-all ${organizationFilter === 'ready' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-emerald-300'}`}
                            onClick={() => setOrganizationFilter('ready')}
                        >
                            Ready
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 px-2">
                    <p className="text-[13px] font-semibold text-slate-500">
                        Showing {filteredRequests.length} of {requests.length} requests
                    </p>
                    <p className="text-[13px] font-semibold text-rose-500 bg-rose-50 px-3 py-1 rounded-lg">
                        Missing core fields detected: {totalMissingFields}
                    </p>
                </div>
            </div>

            {requests.length === 0 ? (
                <div className="relative overflow-hidden bg-white rounded-3xl p-16 text-center shadow-sm border border-slate-100 animate-in fade-in zoom-in-95 duration-500">
                    <div className="relative z-10 flex flex-col items-center justify-center">
                        <div className="relative flex items-center justify-center w-24 h-24 mb-6 rounded-2xl bg-emerald-50 border border-emerald-100 transform transition-transform hover:scale-105 hover:rotate-3">
                            <CheckCircle size={36} className="text-emerald-500" />
                        </div>
                        <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-3">All Caught Up!</h3>
                        <p className="text-[15px] font-medium text-slate-500 mb-8 max-w-[420px]">
                            You have no pending requests to review. Great job!
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-8">
                    {filteredRequests.length === 0 && (
                        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-slate-500 shadow-sm font-medium">
                            No requests match your current filter.
                        </div>
                    )}

                    {requestsNeedingAttention.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 ml-2">
                                <div className="w-2 h-6 bg-amber-500 rounded-full"></div>
                                <h2 className="text-xl font-extrabold text-slate-900">Needs Attention <span className="text-slate-400 font-medium">({requestsNeedingAttention.length})</span></h2>
                            </div>
                            <div className="grid gap-4">
                                {requestsNeedingAttention.map((req) => (
                                    <div key={req.id} className="group relative overflow-hidden rounded-[20px] bg-white border border-amber-200 shadow-sm hover:shadow-md transition-all duration-300">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                        <div className="absolute inset-0 bg-amber-50/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                        <div className="p-6">
                                            <RequestRow
                                                req={req}
                                                expanded={expandedIds.includes(req.id)}
                                                onToggleExpand={toggleExpand}
                                                onEdit={handleEdit}
                                                onAction={handleAction}
                                                formatDate={formatDate}
                                                normalizeSkills={normalizeSkills}
                                                formatCurrency={formatCurrency}
                                                isAttention
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {readyRequests.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 ml-2 mt-8">
                                <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
                                <h2 className="text-xl font-extrabold text-slate-900">Ready For Review <span className="text-slate-400 font-medium">({readyRequests.length})</span></h2>
                            </div>
                            <div className="grid gap-4">
                                {readyRequests.map((req) => (
                                    <div key={req.id} className="group relative overflow-hidden rounded-[20px] bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-300">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="p-6">
                                            <RequestRow
                                                req={req}
                                                expanded={expandedIds.includes(req.id)}
                                                onToggleExpand={toggleExpand}
                                                onEdit={handleEdit}
                                                onAction={handleAction}
                                                formatDate={formatDate}
                                                normalizeSkills={normalizeSkills}
                                                formatCurrency={formatCurrency}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{reviewAction === 'approved' ? 'Approve Position' : 'Reject Position'}</DialogTitle>
                        <DialogDescription>
                            {reviewAction === 'approved'
                                ? 'Are you sure you want to approve this position? It will become open for applications immediately.'
                                : 'Please provide a reason for rejecting this position. The requester will be notified.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <Label htmlFor="notes" className="mb-2 block">Review Notes {reviewAction === 'rejected' && <span className="text-red-500">*</span>}</Label>
                        <Textarea
                            id="notes"
                            placeholder={reviewAction === 'approved' ? "Optional notes..." : "Reason for rejection..."}
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            className="min-h-[100px]"
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsReviewModalOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleSubmitReview}
                            disabled={isSubmitting || (reviewAction === 'rejected' && !reviewNotes.trim())}
                            className={reviewAction === 'approved' ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {reviewAction === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {editingPosition && (
                <AdminPositionModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSuccess={() => {
                        setIsEditModalOpen(false);
                    }}
                    projectId={editingPosition.project_id}
                    position={editingPosition}
                />
            )}
        </div>
    );
}

type RequestRowProps = {
    req: any;
    expanded: boolean;
    isAttention?: boolean;
    onToggleExpand: (id: string) => void;
    onEdit: (req: any) => void;
    onAction: (req: any, action: 'approved' | 'rejected') => void;
    formatDate: (value?: string) => string;
    normalizeSkills: (skills: unknown) => string[];
    formatCurrency: (value: unknown) => string;
};

function RequestRow({
    req,
    expanded,
    isAttention,
    onToggleExpand,
    onEdit,
    onAction,
    formatDate,
    normalizeSkills,
    formatCurrency,
}: RequestRowProps) {
    const isProject = req.request_type === 'project';
    const payload = isProject ? (req.project_data || {}) : (req.position_data || {});
    const skills = normalizeSkills(payload.required_skills);
    const title = isProject
        ? (req.project_title || payload.name || payload.projectName || 'Untitled Project')
        : (req.position_title || 'Untitled Position');

    return (
        <div className="relative z-10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-6">
                <div className="flex items-center gap-5 min-w-0 flex-1">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm">
                        <FileText className="w-7 h-7 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[20px] font-extrabold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                            {title}
                        </h3>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                                <Calendar size={14} className="text-slate-400" />
                                {formatDate(req.created_at)}
                            </span>
                            <span className="flex items-center gap-1.5 text-[13px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100">
                                {isProject ? 'Project Review' : 'Pending Review'}
                            </span>
                            {isAttention && (
                                <span className="flex items-center gap-1.5 text-[13px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 animate-pulse">
                                    Missing Data
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 shrink-0">
                    {!isProject && (
                        <button
                            className="flex items-center h-10 px-4 rounded-xl font-bold text-[13px] text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                            onClick={() => onEdit(req)}
                        >
                            <Briefcase className="w-4 h-4 mr-2" />
                            Edit Details
                        </button>
                    )}
                    <button
                        className="flex items-center h-10 px-4 rounded-xl font-bold text-[13px] text-rose-600 border border-rose-200 bg-white hover:bg-rose-50 hover:text-rose-700 transition-all shadow-sm"
                        onClick={() => onAction(req, 'rejected')}
                    >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                    </button>
                    <button
                        className="flex items-center h-10 px-5 rounded-xl font-bold text-[13px] text-white bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/20 hover:-translate-y-0.5 transition-all"
                        onClick={() => onAction(req, 'approved')}
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve & Proceed
                    </button>
                </div>
            </div>

            <div className="mt-6 rounded-[16px] border border-slate-100 bg-slate-50/50 overflow-hidden transition-all duration-300 hover:bg-slate-50">
                <button
                    className="flex w-full items-center justify-between p-4 focus:outline-none"
                    onClick={() => onToggleExpand(req.id)}
                >
                    <span className="text-[14px] font-bold uppercase tracking-wider text-slate-500">
                        {isProject ? 'Project Payload Preview' : 'Position Payload Preview'}
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-slate-500 transition-transform duration-300">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </button>

                {expanded && (
                    <div className="border-t border-slate-200/60 p-5 animate-in slide-in-from-top-2 fade-in duration-300">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <FileText size={16} className="text-slate-400" />
                                        <span className="text-[13px] font-bold uppercase tracking-wider text-slate-700">Description</span>
                                    </div>
                                    <p className="text-[14px] leading-relaxed text-slate-600 whitespace-pre-line bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                        {payload.job_description || payload.description || 'No description provided.'}
                                    </p>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Briefcase size={16} className="text-slate-400" />
                                        <span className="text-[13px] font-bold uppercase tracking-wider text-slate-700">Required Skills</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {skills.length > 0 ? skills.map((skill) => (
                                            <span key={skill} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100">{skill}</span>
                                        )) : <span className="text-[13px] text-slate-500 italic">No required skills provided.</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                                            <Briefcase size={18} />
                                        </div>
                                        <div>
                                            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Experience</p>
                                            <p className="text-[14px] font-bold text-slate-900">
                                                {payload.experience_level || 'N/A'} <span className="text-slate-500 font-medium">({payload.years_of_experience ?? 0} years)</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="w-full h-px bg-slate-100"></div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                                            <MapPin size={18} />
                                        </div>
                                        <div>
                                            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                                            <p className="text-[14px] font-bold text-slate-900">
                                                {payload.location_type || 'N/A'} {payload.location_data?.office_location ? <span className="text-slate-500 font-medium">({payload.location_data.office_location})</span> : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="w-full h-px bg-slate-100"></div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                            <DollarSign size={18} />
                                        </div>
                                        <div>
                                            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Salary Range</p>
                                            <p className="text-[15px] font-bold text-emerald-700">{formatCurrency(payload.salary_min)} - {formatCurrency(payload.salary_max)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
