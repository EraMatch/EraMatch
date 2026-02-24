"""
Schemas for group management endpoints (EnhancedGroupOverviewV2 page).
"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


# ─── Get Group Details ────────────────────────────────────────────────────────

class AssignedHRResponse(BaseModel):
    id: UUID
    name: str


class FiltrationFlowStage(BaseModel):
    order: int
    stage: str
    status: str


class AcceptanceCriteriaResponse(BaseModel):
    min_technical_score: float = 0.0
    allowed_integrity_risk: str = "Low"
    required_verdict: str = "Pass"


class PipelineStage(BaseModel):
    id: str
    name: str
    completed: int = 0
    total: int = 0
    pending: int = 0
    state: str = "not-started"
    start_date: datetime | None = None
    expected_end_date: datetime | None = None
    actual_end_date: datetime | None = None



class CandidateStageStatus(BaseModel):
    score: float | None = None
    status: str = "pending"


class IntegrityFlag(BaseModel):
    severity: str
    stage: str
    description: str


class CandidateProgressItem(BaseModel):
    application_id: UUID
    candidate_id: UUID
    name: str
    email: str
    assessment: CandidateStageStatus = Field(default_factory=CandidateStageStatus)
    ai_interview: CandidateStageStatus = Field(default_factory=CandidateStageStatus)
    meets_criteria: bool = False
    verdict: str = "pending"
    flags: list[IntegrityFlag] = []
    status: str = "Active"
    has_notes: bool = False


class CandidateProgressResponse(BaseModel):
    candidates: list[CandidateProgressItem] = []


class GroupDetailResponse(BaseModel):
    id: UUID
    name: str
    position_id: UUID
    project_id: UUID
    organization_id: UUID
    assigned_hr: AssignedHRResponse | None = None
    created_date: datetime
    status: str
    filtration_flow: list[FiltrationFlowStage] = []
    assessment_config_id: UUID | None = None
    interview_config_id: UUID | None = None
    acceptance_criteria: AcceptanceCriteriaResponse = Field(default_factory=AcceptanceCriteriaResponse)
    candidates: list[CandidateProgressItem] = []
    pipeline_stages: list[PipelineStage] = Field(default_factory=list, alias="pipelineStages")

    class Config:
        populate_by_name = True


# ─── Get Group Statistics ─────────────────────────────────────────────────────

class StageStatsResponse(BaseModel):
    completed: int = 0
    total: int = 0
    avg_score: float = 0.0


class GroupStatsResponse(BaseModel):
    technical_assessment: StageStatsResponse = Field(default_factory=StageStatsResponse)
    ai_interview: StageStatsResponse = Field(default_factory=StageStatsResponse)
    review: dict = Field(default_factory=lambda: {"count": 0})
    offer: dict = Field(default_factory=lambda: {"count": 0})
    flagged: dict = Field(default_factory=lambda: {"count": 0})


# ─── Candidate Progress Matrix ───────────────────────────────────────────────




# ─── Group Creation ──────────────────────────────────────────────────────────

class GroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    position_id: UUID
    candidate_ids: list[UUID] = Field(default_factory=list)
    description: str | None = None
    ai_ranking_used: bool = False
    nlp_query: str | None = None


class GroupUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    status: str | None = None
    filtration_flow: list[str] | None = None  # e.g. ["assessment", "ai-interview", "live-interview"]


# ─── Start Stage ──────────────────────────────────────────────────────────────

class StartStageRequest(BaseModel):
    stage: str  # "assessment", "ai_interview", "review"


class StartStageResponse(BaseModel):
    status: int
    invitations_sent: int
    stage: str
    next_stage: str | None = None


# ─── Activity Log ────────────────────────────────────────────────────────────

class ActivityUser(BaseModel):
    id: UUID
    name: str


class ActivityItem(BaseModel):
    id: UUID
    timestamp: datetime
    action_type: str
    action: str
    user: ActivityUser | None = None
    details: str | None = None
    entity_type: str | None = None
    entity_id: UUID | None = None


class ActivityLogResponse(BaseModel):
    activities: list[ActivityItem] = []
    total_count: int = 0


# ─── Assessment Monitoring ───────────────────────────────────────────────────

class MonitoringFlag(BaseModel):
    type: str
    severity: str


class AssessmentMonitoringCandidate(BaseModel):
    application_id: UUID
    candidate_id: UUID
    name: str
    status: str = "pending"
    score: float | None = None
    meets_criteria: bool = False
    verdict: str = "pending"
    flags: list[MonitoringFlag] = []
    completion_time: datetime | None = None


class AssessmentMonitoringResponse(BaseModel):
    total_candidates: int = 0
    completed: int = 0
    pending: int = 0
    flagged: int = 0
    avg_score: float = 0.0
    pass_threshold: float = 70.0
    candidates: list[AssessmentMonitoringCandidate] = []

# Assign Interview
class AssignInterviewRequest(BaseModel):
    interview_config_id: UUID | None = None
    create_new: bool = False
    interview_config: dict | None = None


class AssignInterviewResponse(BaseModel):
    status: int
    interview_config_id: UUID | None = None
    message: str

# Update Acceptance Criteria
class AcceptanceCriteriaUpdate(BaseModel):
    minimum_technical_score: float = Field(ge=0, le=100)
    allowed_integrity_risk: str = "Low"
    required_verdict: str = "Pass"

class AcceptanceCriteriaUpdateResponse(BaseModel):
    status: int
    criteria: AcceptanceCriteriaResponse

class CandidateNoteCreate(BaseModel):
    application_id: UUID
    content: str
    tags: list[str] = []
class CandidateNoteResponse(BaseModel):
    status: int
    note_id: UUID

class CandidateScores(BaseModel):
    Overall: int = 0
    Assessment: int = 0
    Interview: int = 0
    Github: int = 0
class CandidateDetailResponse(BaseModel):
    Name: str
    Position: str | None = None
    Email: str
    Phone: str | None = None
    Location: str | None = None
    Scores: CandidateScores = Field(default_factory=CandidateScores)
    Resume_Link: str | None = Field(default=None, alias="Resume Link")

    class Config:
        populate_by_name = True

# Integrity Flags
class IntegrityFlagDetail(BaseModel):
    record_id: UUID
    stage: str
    severity: str
    description: str
    evidence_url: str | None = None
    timestamp: datetime
class IntegrityFlagsResponse(BaseModel):
    flags: list[IntegrityFlagDetail] = []
# ─── Export (CSV is handled at the route level, this schema is for request) ─
class ExportGroupRequest(BaseModel):
    id: UUID
