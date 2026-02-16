from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

class GlobalStatsResponse(BaseModel):
    """Response schema for global admin statistics."""
    openPositions: int
    activeProjects: int
    totalApplicants: int
    avgTimeToFill: float

class PipelineStageStats(BaseModel):
    stage: str
    count: int
    percentage: int
    color: str

class PipelineStatsResponse(BaseModel):
    """Response schema for recruitment pipeline funnel."""
    stages: list[PipelineStageStats]

class HealthMetrics(BaseModel):
    onTrack: int
    atRisk: int

class QualityMetrics(BaseModel):
    high: int
    needsImprove: int

class IntegrityStats(BaseModel):
    cheatingDetected: int
    highRisk: int
    mediumRisk: int
    lowRisk: int

class StageTiming(BaseModel):
    stage: str
    days: int
    target: int
    status: str  # 'good' | 'slow'

class HealthAnalyticsResponse(BaseModel):
    """Response schema for dashboard health & analytics."""
    health: HealthMetrics
    velocity: float
    quality: QualityMetrics
    integrity: IntegrityStats
    stageTiming: list[StageTiming]

class PaymentMethodResponse(BaseModel):
    """Response schema for payment method details."""
    brand: str | None = None
    last4: str | None = None
    expiry: str | None = None

class PaymentMethodCreate(BaseModel):
    """Request schema for adding a payment method."""
    brand: str
    last4: str
    expiry: str
    cardNumber: str | None = None
    cvc: str | None = None
    cardName: str | None = None

class SubscriptionUpgradeRequest(BaseModel):
    """Request schema for upgrading subscription plan."""
    planID: UUID

class MemberStatsResponse(BaseModel):
    """Response schema for member statistics."""
    totalActive: int
    adminsCount: int
    recruitersCount: int

class MemberPermissions(BaseModel):
    managePositions: bool
    manageUsers: bool = False
    manageCandidates: bool
    viewAnalytics: bool
    exportData: bool

class MemberPrivilegesResponse(BaseModel):
    firstName: str
    permissions: MemberPermissions

class MemberPrivilegesUpdate(BaseModel):
    permissions: MemberPermissions

class MemberRegisterRequest(BaseModel):
    firstName: str
    lastName: str
    email: str
    role: str
    deptID: UUID | None = None

class MemberRegisterResponse(BaseModel):
    success: bool
    userID: UUID

class RecruiterListResponse(BaseModel):
    """Response schema for listing recruiters by role."""
    id: UUID
    name: str
    assignedCount: int = 0

class ReassignRequest(BaseModel):
    """Request schema for reassigning a recruiter."""
    recruiterID: UUID
    type: str # "HR" or "Technical"

class NotificationResponse(BaseModel):
    """Response schema for a single notification."""
    id: UUID
    type: str
    title: str
    message: str | None = None
    data: dict | None = None
    is_read: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ApprovalRequestCreate(BaseModel):
    """Request schema for creating an approval request (HR)."""
    request_type: str # 'project' | 'position'
    data: dict # creation payload (ProjectCreate or PositionCreate data)

class ApprovalRequestResponse(BaseModel):
    """Response schema for an approval request."""
    id: UUID
    requester_id: UUID
    requester_name: str | None = None
    request_type: str
    data: dict
    entity_id: UUID | None = None
    status: str
    reviewer_id: UUID | None = None
    assigned_tech_id: UUID | None = None
    review_notes: str | None = None
    created_at: datetime # ISO string
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

class ApprovalDecisionRequest(BaseModel):
    """Request schema for approving/rejecting a request (Admin)."""
    status: str # 'approved' | 'rejected'
    assigned_tech_id: UUID | None = None # For position approvals
    review_notes: str | None = None
