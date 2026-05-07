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
        if (action === 'approved' && request.entity_id) {
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
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="mb-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Technical Reviews</h1>
                <p className="text-gray-500">Review and approve position requests assigned to you.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border-indigo-100 bg-indigo-50/40">
                    <p className="text-xs uppercase tracking-wider text-indigo-700 font-semibold">Pending Reviews</p>
                    <p className="text-3xl font-bold text-indigo-900 mt-1">{requests.length}</p>
                </Card>
                <Card className="p-4 border-amber-100 bg-amber-50/40">
                    <p className="text-xs uppercase tracking-wider text-amber-700 font-semibold">Need Attention</p>
                    <p className="text-3xl font-bold text-amber-900 mt-1">{requests.filter((req) => getMissingFieldCount(req) > 0).length}</p>
                </Card>
                <Card className="p-4 border-emerald-100 bg-emerald-50/40">
                    <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Ready To Approve</p>
                    <p className="text-3xl font-bold text-emerald-900 mt-1">{requests.filter((req) => getMissingFieldCount(req) === 0).length}</p>
                </Card>
            </div>

            <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title, description, or skills"
                            className="w-full pl-9 pr-3 h-10 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                    </div>

                    <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-600">
                        <Filter size={14} />
                        <span>Status</span>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant={organizationFilter === 'all' ? 'default' : 'outline'}
                            className="rounded-xl"
                            onClick={() => setOrganizationFilter('all')}
                        >
                            All
                        </Button>
                        <Button
                            variant={organizationFilter === 'needs_attention' ? 'default' : 'outline'}
                            className="rounded-xl"
                            onClick={() => setOrganizationFilter('needs_attention')}
                        >
                            Needs Attention
                        </Button>
                        <Button
                            variant={organizationFilter === 'ready' ? 'default' : 'outline'}
                            className="rounded-xl"
                            onClick={() => setOrganizationFilter('ready')}
                        >
                            Ready
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                    Showing {filteredRequests.length} of {requests.length} requests • Missing core fields detected: {totalMissingFields}
                </p>
            </Card>

            {requests.length === 0 ? (
                <Card className="p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">All Caught Up!</h3>
                    <p className="text-gray-500 max-w-md">
                        You have no pending requests to review. Great job!
                    </p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {filteredRequests.length === 0 && (
                        <Card className="p-10 text-center text-gray-500">No requests match your current filter.</Card>
                    )}

                    {requestsNeedingAttention.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-amber-800">Needs Attention ({requestsNeedingAttention.length})</h2>
                                <p className="text-xs text-gray-500">Missing description, skills, or salary values</p>
                            </div>
                            {requestsNeedingAttention.map((req) => (
                                <Card key={req.id} className="overflow-hidden border-2 border-amber-100 bg-amber-50/20 shadow-sm">
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
                                </Card>
                            ))}
                        </div>
                    )}

                    {readyRequests.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-emerald-800">Ready For Review ({readyRequests.length})</h2>
                            {readyRequests.map((req) => (
                                <Card key={req.id} className="overflow-hidden border-2 border-transparent hover:border-indigo-100 transition-all duration-300 shadow-sm hover:shadow-md">
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
                                </Card>
                            ))}
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
    const positionData = req.position_data || {};
    const skills = normalizeSkills(positionData.required_skills);

    return (
        <>
            <div className="flex items-start justify-between mb-4 gap-4">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <FileText className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate">
                            {req.position_title || 'Untitled Position'}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1 flex-wrap">
                            <span className="flex items-center gap-1">
                                <Calendar size={14} />
                                Submitted {formatDate(req.created_at)}
                            </span>
                            <span>•</span>
                            <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100">
                                Pending Review
                            </Badge>
                            {isAttention && (
                                <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-100">
                                    Missing Data
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 shrink-0">
                    <Button
                        variant="ghost"
                        className="text-gray-600 hover:bg-gray-100"
                        onClick={() => onEdit(req)}
                    >
                        <Briefcase className="w-4 h-4 mr-2" />
                        Edit
                    </Button>
                    <Button
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                        onClick={() => onAction(req, 'rejected')}
                    >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                    </Button>
                    <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => onAction(req, 'approved')}
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve + QAG
                    </Button>
                </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => onToggleExpand(req.id)}>
                    <span className="font-medium text-gray-700">Position Details</span>
                    {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>

                {expanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-4">
                            <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Description</span>
                                <p className="text-sm text-gray-700 whitespace-pre-line">{positionData.job_description || 'No description provided.'}</p>
                            </div>
                            <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Required Skills</span>
                                <div className="flex flex-wrap gap-2">
                                    {skills.length > 0 ? skills.map((skill) => (
                                        <Badge key={skill} variant="outline" className="bg-white">{skill}</Badge>
                                    )) : <span className="text-sm text-gray-500">No required skills provided.</span>}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-sm">
                                <Briefcase className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600">Experience:</span>
                                <span className="font-medium text-gray-900">
                                    {positionData.experience_level || 'N/A'} ({positionData.years_of_experience ?? 0} years)
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <MapPin className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600">Location:</span>
                                <span className="font-medium text-gray-900">
                                    {positionData.location_type || 'N/A'} {positionData.location_data?.office_location ? `(${positionData.location_data.office_location})` : ''}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <DollarSign className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600">Salary:</span>
                                <span className="font-medium text-gray-900">{formatCurrency(positionData.salary_min)} - {formatCurrency(positionData.salary_max)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Briefcase className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600">Type:</span>
                                <span className="font-medium text-gray-900 capitalize">{positionData.employment_type || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
