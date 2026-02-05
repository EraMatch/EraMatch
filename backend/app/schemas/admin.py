from pydantic import BaseModel
from uuid import UUID

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

class HealthAnalyticsResponse(BaseModel):
    """Response schema for dashboard health & analytics."""
    health: HealthMetrics
    velocity: float
    quality: QualityMetrics

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
