"""
Schemas for group management endpoints (EnhancedGroupOverviewV2 page).
"""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


# ─── Get Group Details ────────────────────────────────────────────────────────


class SendOffersRequest(BaseModel):
    """Payload for sending final offers to candidates."""

    application_ids: list[str]
    email_subject: str
    email_body: str


class BulkProgressRequest(BaseModel):
    """Payload for progressing candidates in bulk after a stage ends."""

    application_ids: list[UUID]
    action: str  # 'progress', 'reject', 'hold'
    current_stage_type: str | None = None
    reason: str | None = None


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
    has_config: bool = False   # True when this stage has an assessment/interview config assigned
    start_date: datetime | None = None
    expected_end_date: datetime | None = None
    actual_end_date: datetime | None = None


class CandidateStageStatus(BaseModel):
    score: float | None = None
    status: str = "pending"
    passed: bool | None = None
    scheduled_at: datetime | None = None
    meeting_link: str | None = None
    session_id: UUID | None = None  # LiV2 session ID
    verdict: str | None = None  # auto_verdict from LiV2Evaluation
    evaluated_at: datetime | None = None  # judged_at from LiV2Evaluation


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
    live_interview: CandidateStageStatus = Field(default_factory=CandidateStageStatus)
    stages: dict[str, CandidateStageStatus] = Field(default_factory=dict)
    meets_criteria: bool = False
    verdict: str = "pending"
    flags: list[IntegrityFlag] = []
    status: str

    has_notes: bool = False


class CandidateProgressResponse(BaseModel):
    candidates: list[CandidateProgressItem] = []


class AssessmentConfig(BaseModel):
    title: str
    duration: int = 60
    difficulty: str | None = "Medium"


class GroupAssessmentItem(BaseModel):
    id: UUID
    status: str
    config: AssessmentConfig
    sections: list = []


class GroupInterviewItem(BaseModel):
    id: UUID
    title: str
    interview_type: str
    max_retakes: int
    questions_count: int
    instructions: str | None = None
    questions: dict = {}
    think_time_seconds: int | None = None
    answer_time_seconds: int | None = None
    live_interview_context: str | None = None
    difficulty: str | None = "Mid Level"
    show_ai_feedback: bool = True
    recording_required: bool = True
    total_duration_minutes: int | None = 30
    live_flow_config: dict | None = None


class GroupDetailResponse(BaseModel):
    id: UUID
    name: str
    position_id: UUID
    project_id: UUID
    organization_id: UUID
    position_title: str | None = None
    job_description: str | None = None
    required_skills: list = Field(default_factory=list)
    experience_level: str | None = None
    years_of_experience: int | None = None
    assigned_hr: AssignedHRResponse | None = None
    created_date: datetime
    status: str
    filtration_flow: list[FiltrationFlowStage] = []
    assessment_config_id: UUID | None = None
    interview_config_id: UUID | None = None
    acceptance_criteria: AcceptanceCriteriaResponse = Field(
        default_factory=AcceptanceCriteriaResponse
    )
    candidates: list[CandidateProgressItem] = []
    pipeline_stages: list[PipelineStage] = Field(
        default_factory=list, alias="pipelineStages"
    )
    assessments: list[GroupAssessmentItem] = []
    interviews: list[GroupInterviewItem] = []
    github_questions_count: int = 10
    use_github_questions_video_interview: bool = False
    use_github_questions_live_interview: bool = False

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
    live_interview: StageStatsResponse = Field(default_factory=StageStatsResponse)
    review: dict = Field(default_factory=lambda: {"count": 0})
    offer: dict = Field(default_factory=lambda: {"count": 0})
    flagged: dict = Field(default_factory=lambda: {"count": 0})


# ─── Schedule Interview ────────────────────────────────────────────────────────


class ScheduleInterviewRequest(BaseModel):
    """Payload for scheduling a live interview."""

    application_id: UUID
    scheduled_at: datetime
    duration_minutes: int = 60
    interviewer_id: UUID | None = None
    meeting_link: str | None = None


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
    filtration_flow: list[str] | None = (
        None  # e.g. ["assessment", "ai-interview", "live-interview"]
    )
    github_questions_count: int | None = Field(default=None, ge=0, le=30)
    use_github_questions_video_interview: bool | None = None
    use_github_questions_live_interview: bool | None = None


class GroupDeleteRequest(BaseModel):
    """Payload for group deletion with candidate handling options."""

    action: str = Field(
        ..., description="Action for candidates: 'release', 'reject', or 'transfer'"
    )
    transfer_group_id: UUID | None = Field(
        default=None, description="Target group ID if action is 'transfer'"
    )


# ─── Start Stage ──────────────────────────────────────────────────────────────


class StartStageRequest(BaseModel):
    stage: str  # "assessment", "ai_interview", "review"


class StartStageResponse(BaseModel):
    status: int
    invitations_sent: int
    stage: str
    next_stage: str | None = None


# ─── Close Stage ──────────────────────────────────────────────────────────────


class CloseStageRequest(BaseModel):
    stage: str  # "assessment", "ai_interview", "live_interview", "review"


class CloseStageResponse(BaseModel):
    status: int
    stage: str
    candidates_evaluated: int
    auto_failed_count: int = 0


class ArchiveGroupRequest(BaseModel):
    send_rejections: bool = False


class ArchiveGroupResponse(BaseModel):
    rejected_count: int


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


class IntegritySummary(BaseModel):
    clean: int = 0
    monitoring: int = 0
    suspicious_review: int = 0
    confirmed_cheating: int = 0


class AssessmentMonitoringCandidate(BaseModel):
    application_id: UUID
    candidate_id: UUID
    name: str
    status: str = "pending"
    score: float | None = None
    meets_criteria: bool = False
    verdict: str = "pending"
    integrity_verdict: str = "clean"  # clean | monitoring | suspicious_review | confirmed_cheating
    # Per-stage optional signals (None for stages that don't supply them)
    ai_recommendation: str | None = None       # ai_interview only: pass | borderline | fail | None
    retakes_used: int | None = None            # ai_interview only
    auto_verdict: str | None = None            # live_interview only: pass | fail | None
    overall_score_pct: float | None = None     # live_interview only (0–100)
    # Session backing this candidate's stage attempt (assessment/interview/live session id)
    session_id: UUID | None = None
    # Per-type breakdown for quick-filters. Keys differ by stage:
    #   assessment    -> {"mcq": 82.0, "coding": 60.0, "essay": 74.0}
    #   ai_interview  -> {"technical": 80.0, "communication": 70.0, "confidence": 65.0}
    #   live_interview-> {"<dimension name>": 0-100, ...}
    sub_scores: dict[str, float] | None = None
    flags: list[MonitoringFlag] = []
    completion_time: datetime | None = None


class AssessmentMonitoringResponse(BaseModel):
    total_candidates: int = 0
    completed: int = 0
    pending: int = 0
    flagged: int = 0
    avg_score: float = 0.0
    pass_threshold: float = 70.0
    integrity_summary: IntegritySummary = IntegritySummary()
    candidates: list[AssessmentMonitoringCandidate] = []


# Assign Interview
class AssignInterviewRequest(BaseModel):
    interview_config_id: UUID | None = None
    create_new: bool = False
    interview_config: dict | None = None
    config: dict | None = None
    interviewConfig: dict | None = None


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


class LiveInterviewData(BaseModel):
    sessionId: UUID | None = None
    status: str = "not-started"
    score: float | None = None
    verdict: str | None = None


class CandidateDetailResponse(BaseModel):
    Name: str
    Position: str | None = None
    Email: str
    Phone: str | None = None
    Location: str | None = None
    Scores: CandidateScores = Field(default_factory=CandidateScores)
    Resume_Link: str | None = Field(default=None, alias="Resume Link")
    liveInterviewData: LiveInterviewData | None = None

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



class GroupIntegrityDecisionCandidate(BaseModel):
    application_id: str
    candidate_id: str
    candidate_name: str
    stage: str
    stage_status: str
    stage_score: float | None = None
    decision: str
    cheating_detected: bool
    total_flags: int
    high_flags: int
    medium_flags: int
    low_flags: int
    critical_flags: int
    latest_event_type: str | None = None
    latest_flag_at: str | None = None


class GroupIntegrityStageAggregate(BaseModel):
    stage: str
    total_candidates: int
    confirmed_cheating: int
    suspicious_review: int
    monitoring: int
    clean: int


class GroupIntegrityDecisionsResponse(BaseModel):
    group_id: str
    stage: str | None = None
    candidates: list[GroupIntegrityDecisionCandidate] = []
    summary: GroupIntegrityStageAggregate
    stage_aggregates: list[GroupIntegrityStageAggregate] = []
    updated_at: str


# ─── Export (CSV is handled at the route level, this schema is for request) ─
class ExportGroupRequest(BaseModel):
    id: UUID


# ─── Bulk Progress Preview ────────────────────────────────────────────────────


class BulkProgressPreviewCandidate(BaseModel):
    application_id: UUID
    name: str
    score: float | None = None


class BulkProgressPreview(BaseModel):
    selected_count: int
    auto_hold_count: int
    auto_hold_candidates: list[BulkProgressPreviewCandidate]


# ─── Hold Review ──────────────────────────────────────────────────────────────


class HoldResolveAction(BaseModel):
    application_id: UUID
    action: str  # "reject" | "reactivate"


class HoldResolveRequest(BaseModel):
    actions: list[HoldResolveAction]
