import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { api } from '../../../services/api';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, FileText, Calendar, Briefcase, MapPin, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { AdminPositionModal } from '../../admin/AdminPositionModal';

export function ReviewRequests() {
    const navigate = useNavigate();
    const [requests, setRequests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPosition, setEditingPosition] = useState<any>(null);
    const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
    const [reviewNotes, setReviewNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedIds, setExpandedIds] = useState<string[]>([]);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            setIsLoading(true);
            const data = await api.recruiter.getAssignedRequests();
            setRequests(data);
        } catch (error) {
            console.error('Failed to fetch requests:', error);
            toast.error('Failed to load review requests');
        } finally {
            setIsLoading(false);
        }
    };

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
            await api.recruiter.reviewRequest(selectedRequest.id, reviewAction, reviewNotes);
            toast.success(`Request ${reviewAction} successfully`);
            setIsReviewModalOpen(false);
            fetchRequests(); // Refresh list
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

    if (isLoading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#6366F1]" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Technical Reviews</h1>
                <p className="text-gray-500">Review and approve position requests assigned to you.</p>
            </div>

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
                    {requests.map((req) => (
                        <Card key={req.id} className="overflow-hidden border-2 border-transparent hover:border-indigo-100 transition-all duration-300 shadow-sm hover:shadow-md">
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                                            <FileText className="w-6 h-6 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">
                                                {req.position_title || 'Untitled Position'}
                                            </h3>
                                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={14} />
                                                    Submitted {new Date(req.created_at).toLocaleDateString()}
                                                </span>
                                                <span>•</span>
                                                <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100">
                                                    Pending Review
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <Button
                                            variant="ghost"
                                            className="text-gray-600 hover:bg-gray-100"
                                            onClick={() => handleEdit(req)}
                                        >
                                            <Briefcase className="w-4 h-4 mr-2" />
                                            Edit
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                                            onClick={() => handleAction(req, 'rejected')}
                                        >
                                            <XCircle className="w-4 h-4 mr-2" />
                                            Reject
                                        </Button>
                                        <Button
                                            className="bg-green-600 hover:bg-green-700 text-white"
                                            onClick={() => handleAction(req, 'approved')}
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Approve + QAG
                                        </Button>
                                    </div>
                                </div>

                                {/* Position Summary / Collapsible Details */}
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(req.id)}>
                                        <span className="font-medium text-gray-700">Position Details</span>
                                        {expandedIds.includes(req.id) ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                    </div>

                                    {expandedIds.includes(req.id) && req.position_data && (
                                        <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="space-y-4">
                                                <div>
                                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Description</span>
                                                    <p className="text-sm text-gray-700 whitespace-pre-line">{req.position_data.job_description}</p>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Required Skills</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {req.position_data.required_skills?.map((skill: string) => (
                                                            <Badge key={skill} variant="outline" className="bg-white">{skill}</Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 text-sm">
                                                    <Briefcase className="w-4 h-4 text-gray-400" />
                                                    <span className="text-gray-600">Experience:</span>
                                                    <span className="font-medium text-gray-900">{req.position_data.experience_level} ({req.position_data.years_of_experience} years)</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm">
                                                    <MapPin className="w-4 h-4 text-gray-400" />
                                                    <span className="text-gray-600">Location:</span>
                                                    <span className="font-medium text-gray-900">{req.position_data.location_type} {req.position_data.location_data?.office_location ? `(${req.position_data.location_data.office_location})` : ''}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm">
                                                    <DollarSign className="w-4 h-4 text-gray-400" />
                                                    <span className="text-gray-600">Salary:</span>
                                                    <span className="font-medium text-gray-900">${req.position_data.salary_min?.toLocaleString()} - ${req.position_data.salary_max?.toLocaleString()}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm">
                                                    <Briefcase className="w-4 h-4 text-gray-400" />
                                                    <span className="text-gray-600">Type:</span>
                                                    <span className="font-medium text-gray-900 capitalize">{req.position_data.employment_type}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
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
                        fetchRequests(); // Refresh list to see updated JD
                    }}
                    projectId={editingPosition.project_id}
                    position={editingPosition}
                />
            )}
        </div>
    );
}
