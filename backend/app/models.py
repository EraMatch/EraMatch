"""
ORM layer, modelling for the database - All 37 tables from EraMatch initial schema with date 2/3/26 (v1.2)
"""
from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel, Relationship, Column
from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import JSONB, BYTEA, ARRAY, UUID as PG_UUID
from sqlalchemy import String


class UserRole(str, Enum):
    ADMIN = "admin"
    HR = "hr"
    TECHNICAL = "technical"


class ApplicationStatus(str, Enum):
    APPLIED = "applied"
    SCREENING = "screening"
    IN_PIPELINE = "in_pipeline"
    OFFERED = "offered"
    HIRED = "hired"
    REJECTED = "rejected"


class PositionStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class ProjectStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class StageStatus(str, Enum):
    NOT_STARTED = "not_started"
    ACTIVE = "active"
    CLOSED = "closed"


class ProgressStatus(str, Enum):
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class QuestionType(str, Enum):
    MCQ = "mcq"
    ESSAY = "essay"
    CODING = "coding"


class InterviewType(str, Enum):
    RECORDED = "recorded"
    LIVE_AI = "live_ai"


class FlagSeverity(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class OfferStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"


# =============================================================================
# BASE MODEL
# =============================================================================

class BaseModel(SQLModel):
    # Base class without any default fields to avoid "UndefinedColumnError"
    pass


# SECTION 1: organization and users 

class SubscriptionPlan(BaseModel, table=True):
    __tablename__ = "subscription_plans"
    
    id: UUID = Field(default_factory=uuid4, alias="plan_id", sa_column=Column("plan_id", PG_UUID(as_uuid=True), primary_key=True))
    name: str = Field(max_length=100, unique=True)
    monthly_price: Decimal = Field(max_digits=10, decimal_places=2)
    features_json: dict = Field(default_factory=dict, sa_column=Column(JSONB))
    limits_json: dict = Field(default_factory=dict, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Organization(BaseModel, table=True):
    __tablename__ = "organizations"
    
    id: UUID = Field(default_factory=uuid4, alias="organization_id", sa_column=Column("organization_id", PG_UUID(as_uuid=True), primary_key=True))
    plan_id: UUID | None = Field(default=None, foreign_key="subscription_plans.plan_id")
    organization_name: str = Field(max_length=255)
    organization_size: str | None = Field(default=None, max_length=50)
    business_domain: str | None = Field(default=None, max_length=100)
    admin_email: str = Field(max_length=255, unique=True)
    admin_password_hash: str = Field(max_length=255)
    subscription_status: str = Field(default="active", max_length=20)
    settings: dict = Field(default_factory=dict, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)


class OrganizationDepartment(BaseModel, table=True):
    __tablename__ = "organization_departments"
    
    id: UUID = Field(default_factory=uuid4, alias="department_id", sa_column=Column("department_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    name: str = Field(max_length=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OrganizationUser(BaseModel, table=True):
    __tablename__ = "organization_users"
    
    id: UUID = Field(default_factory=uuid4, alias="user_id", sa_column=Column("user_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    department_id: UUID | None = Field(default=None, foreign_key="organization_departments.department_id")
    email: str = Field(max_length=255, unique=True)
    password_hash: str = Field(max_length=255)
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    role: str = Field(max_length=50)  # HR, Technical, Admin
    status: str = Field(default="active", max_length=20)
    avatar_url: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: datetime | None = Field(default=None)
    is_deleted: bool = Field(default=False)


class UserPermission(BaseModel, table=True):
    __tablename__ = "user_permissions"
    
    # Override default 'id'
    id: UUID = Field(default_factory=uuid4, alias="permission_id", sa_column=Column("permission_id", PG_UUID(as_uuid=True), primary_key=True))

    user_id: UUID = Field(foreign_key="organization_users.user_id", unique=True)
    can_manage_positions: bool = Field(default=False)
    can_manage_users: bool = Field(default=False)
    can_manage_candidates: bool = Field(default=False)
    can_view_analytics: bool = Field(default=True)
    can_export_data: bool = Field(default=False)
    custom_permissions: dict = Field(default_factory=dict, sa_column=Column(JSONB))


class PaymentMethod(BaseModel, table=True):
    __tablename__ = "payment_methods"
    
    id: UUID = Field(default_factory=uuid4, alias="payment_id", sa_column=Column("payment_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    card_brand: str | None = Field(default=None, max_length=20)
    last4: str = Field(max_length=4)
    expiry_date: str = Field(max_length=7)  # MM/YYYY
    is_default: bool = Field(default=False)
    stripe_payment_method_id: str | None = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ================= SECTION 2: projects and positions ==============
class Project(BaseModel, table=True):
    __tablename__ = "projects"
    
    id: UUID = Field(default_factory=uuid4, alias="project_id", sa_column=Column("project_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    created_by_user_id: UUID = Field(foreign_key="organization_users.user_id")
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="active", max_length=20)
    target_hire_count: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: datetime | None = Field(default=None)
    is_deleted: bool = Field(default=False)


class ProjectAccess(BaseModel, table=True):
    __tablename__ = "project_access"
    
    id: UUID = Field(default_factory=uuid4, alias="access_id", sa_column=Column("access_id", PG_UUID(as_uuid=True), primary_key=True))
    project_id: UUID = Field(foreign_key="projects.project_id")
    user_id: UUID = Field(foreign_key="organization_users.user_id")
    access_level: str = Field(default="viewer", max_length=20)
    granted_at: datetime = Field(default_factory=datetime.utcnow)


class Position(SQLModel, table=True):
    """Position - uses position_id as primary key."""
    __tablename__ = "positions"
    
    id: UUID = Field(default_factory=uuid4, alias="position_id", sa_column=Column("position_id", PG_UUID(as_uuid=True), primary_key=True))
    project_id: UUID = Field(foreign_key="projects.project_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    job_title: str = Field(max_length=255)
    job_description: str = Field(sa_column=Column(Text))
    required_skills: dict = Field(default_factory=list, sa_column=Column(JSONB))
    experience_level: str | None = Field(default=None, max_length=20)
    work_type: str | None = Field(default=None, max_length=20)
    salary_min: Decimal | None = Field(default=None)
    salary_max: Decimal | None = Field(default=None)
    status: str = Field(default="open", max_length=20)
    assigned_hr_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    assigned_tech_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)


# =============================================================================
# SECTION 3: GROUPS & PIPELINE CONFIG (3 Tables)
# =============================================================================

class CandidateGroup(SQLModel, table=True):
    """Candidate group - uses group_id as primary key."""
    __tablename__ = "candidate_groups"
    
    id: UUID = Field(default_factory=uuid4, alias="group_id", sa_column=Column("group_id", PG_UUID(as_uuid=True), primary_key=True))
    position_id: UUID = Field(foreign_key="positions.position_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    group_name: str = Field(max_length=100)
    assigned_hr_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    assigned_tech_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    filtration_flow: dict = Field(default_factory=list, sa_column=Column(JSONB))
    status: str = Field(default="active", max_length=20)
    created_by_user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GroupStageConfig(BaseModel, table=True):
    __tablename__ = "group_stage_config"
    
    id: UUID = Field(default_factory=uuid4, alias="config_id", sa_column=Column("config_id", PG_UUID(as_uuid=True), primary_key=True))
    group_id: UUID = Field(foreign_key="candidate_groups.group_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    stage_type: str = Field(max_length=30)  # assessment, ai_interview, live_interview
    stage_order: int
    state: str = Field(default="not_started", max_length=20)
    acceptance_criteria: dict | None = Field(default=None, sa_column=Column(JSONB))
    started_at: datetime | None = Field(default=None)
    closed_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CandidateStageProgress(BaseModel, table=True):
    __tablename__ = "candidate_stage_progress"
    
    id: UUID = Field(default_factory=uuid4, alias="progress_id", sa_column=Column("progress_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    group_id: UUID = Field(foreign_key="candidate_groups.group_id")
    stage_type: str = Field(max_length=30)
    stage_order: int
    status: str = Field(default="locked", max_length=20)
    session_id: UUID | None = Field(default=None)
    score: Decimal | None = Field(default=None)
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 4: CANDIDATES (3 Tables)
# =============================================================================

class CandidateProfile(SQLModel, table=True):
    """Candidate profile - uses candidate_id as primary key (not inherited id)."""
    __tablename__ = "candidate_profiles"

    id: UUID = Field(default_factory=uuid4, alias="candidate_id", sa_column=Column("candidate_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    email: str = Field(max_length=255)
    full_name: str = Field(max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=100)
    linkedin_url: str | None = Field(default=None, max_length=500)
    github_url: str | None = Field(default=None, max_length=500)
    portfolio_url: str | None = Field(default=None, max_length=500)
    password_hash: str | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)


class CandidateApplication(SQLModel, table=True):
    """Candidate application - uses application_id as primary key."""
    __tablename__ = "candidate_applications"
    
    id: UUID = Field(default_factory=uuid4, alias="application_id", sa_column=Column("application_id", PG_UUID(as_uuid=True), primary_key=True))
    candidate_id: UUID = Field(foreign_key="candidate_profiles.candidate_id")
    position_id: UUID = Field(foreign_key="positions.position_id")
    group_id: UUID | None = Field(default=None, foreign_key="candidate_groups.group_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    resume_url: str | None = Field(default=None, max_length=500)
    cover_letter: str | None = Field(default=None, sa_column=Column(Text))
    source: str | None = Field(default=None, max_length=50)
    status: str = Field(default="applied", max_length=30)
    applied_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)


class RecruiterNote(BaseModel, table=True):
    __tablename__ = "recruiter_notes"
    
    id: UUID = Field(default_factory=uuid4, alias="note_id", sa_column=Column("note_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    author_id: UUID = Field(foreign_key="organization_users.user_id")
    content: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 5: QUESTION BANK (2 Tables)
# =============================================================================

class QuestionBank(BaseModel, table=True):
    __tablename__ = "question_bank"
    
    id: UUID = Field(default_factory=uuid4, alias="question_id", sa_column=Column("question_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    question_type: str = Field(max_length=20)  # mcq, essay, coding
    question_text: str = Field(sa_column=Column(Text))
    question_config: dict = Field(sa_column=Column(JSONB))
    correct_answer: dict | None = Field(default=None, sa_column=Column(JSONB))
    category: str | None = Field(default=None, max_length=50)
    difficulty: int | None = Field(default=None)
    tags: list | None = Field(default=None, sa_column=Column(ARRAY(String)))
    points: int = Field(default=10)
    created_by_user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    usage_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)


class QuestionBankFavorite(BaseModel, table=True):
    __tablename__ = "question_bank_favorites"
    
    id: UUID = Field(default_factory=uuid4, alias="favorite_id", sa_column=Column("favorite_id", PG_UUID(as_uuid=True), primary_key=True))
    question_id: UUID = Field(foreign_key="question_bank.question_id")
    user_id: UUID = Field(foreign_key="organization_users.user_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 6: ASSESSMENT CONFIG & SESSIONS (4 Tables)
# =============================================================================

class Assessment(BaseModel, table=True):
    __tablename__ = "assessments"
    
    id: UUID = Field(default_factory=uuid4, alias="assessment_id", sa_column=Column("assessment_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    position_id: UUID | None = Field(default=None, foreign_key="positions.position_id")
    title: str = Field(max_length=255)
    instructions: str | None = Field(default=None, sa_column=Column(Text))
    duration_minutes: int = Field(default=60)
    passing_score: Decimal = Field(default=60)
    shuffle_sections: bool = Field(default=False)
    anti_cheating_enabled: bool = Field(default=True)
    structure: dict = Field(sa_column=Column(JSONB))
    status: str = Field(default="draft", max_length=20)
    created_by_user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)


class OngoingAssessment(BaseModel, table=True):
    __tablename__ = "ongoing_assessments"
    
    id: UUID = Field(default_factory=uuid4, alias="session_id", sa_column=Column("session_id", PG_UUID(as_uuid=True), primary_key=True))
    assessment_id: UUID = Field(foreign_key="assessments.assessment_id")
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    assigned_questions: dict = Field(sa_column=Column(JSONB))
    status: str = Field(default="not_started", max_length=20)
    started_at: datetime | None = Field(default=None)
    submitted_at: datetime | None = Field(default=None)
    time_spent_seconds: int | None = Field(default=None)
    total_score: Decimal | None = Field(default=None)
    total_points: int | None = Field(default=None)
    max_points: int | None = Field(default=None)
    flag_count: int = Field(default=0)
    recording_url: str | None = Field(default=None, max_length=500)


class CandidateAnswer(BaseModel, table=True):
    __tablename__ = "candidate_answers"
    
    id: UUID = Field(default_factory=uuid4, alias="answer_id", sa_column=Column("answer_id", PG_UUID(as_uuid=True), primary_key=True))
    session_id: UUID = Field(foreign_key="ongoing_assessments.session_id")
    question_id: UUID = Field(foreign_key="question_bank.question_id")
    question_order: int
    answer_data: dict = Field(sa_column=Column(JSONB))
    is_correct: bool | None = Field(default=None)
    points_earned: Decimal | None = Field(default=None)
    points_max: int
    time_spent_seconds: int | None = Field(default=None)
    answered_at: datetime | None = Field(default=None)


class StageOnboarding(BaseModel, table=True):
    __tablename__ = "stage_onboarding"
    
    id: UUID = Field(default_factory=uuid4, alias="onboarding_id", sa_column=Column("onboarding_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    stage_type: str = Field(max_length=30)
    session_id: UUID | None = Field(default=None)
    device_test_passed: bool = Field(default=False)
    face_calibration_passed: bool = Field(default=False)
    face_embedding: bytes | None = Field(default=None, sa_column=Column(BYTEA))
    instructions_accepted: bool = Field(default=False)
    completed_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 7: AI INTERVIEW CONFIG & SESSIONS (4 Tables)
# =============================================================================

class AIInterviewConfig(BaseModel, table=True):
    __tablename__ = "ai_interview_configs"
    
    id: UUID = Field(default_factory=uuid4, alias="config_id", sa_column=Column("config_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    position_id: UUID | None = Field(default=None, foreign_key="positions.position_id")
    title: str = Field(max_length=255)
    interview_type: str = Field(max_length=20)  # recorded, live_ai
    instructions: str | None = Field(default=None, sa_column=Column(Text))
    max_retakes: int = Field(default=1)
    questions: dict = Field(sa_column=Column(JSONB))
    created_by_user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)


class OngoingInterview(BaseModel, table=True):
    __tablename__ = "ongoing_interviews"
    
    id: UUID = Field(default_factory=uuid4, alias="session_id", sa_column=Column("session_id", PG_UUID(as_uuid=True), primary_key=True))
    config_id: UUID = Field(foreign_key="ai_interview_configs.config_id")
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    interview_type: str = Field(max_length=20)
    status: str = Field(default="not_started", max_length=20)
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    overall_score: Decimal | None = Field(default=None)
    ai_analysis: dict | None = Field(default=None, sa_column=Column(JSONB))
    recording_url: str | None = Field(default=None, max_length=500)
    flag_count: int = Field(default=0)


class InterviewResponse(BaseModel, table=True):
    __tablename__ = "interview_responses"
    
    id: UUID = Field(default_factory=uuid4, alias="response_id", sa_column=Column("response_id", PG_UUID(as_uuid=True), primary_key=True))
    session_id: UUID = Field(foreign_key="ongoing_interviews.session_id")
    question_id: str = Field(max_length=50)
    question_order: int
    video_url: str | None = Field(default=None, sa_column=Column(Text))
    transcript: str | None = Field(default=None, sa_column=Column(Text))
    retake_number: int = Field(default=1)
    duration_seconds: int | None = Field(default=None)
    ai_score: Decimal | None = Field(default=None)
    ai_feedback: dict | None = Field(default=None, sa_column=Column(JSONB))
    answered_at: datetime | None = Field(default=None)
    processing_status: str = Field(default="pending", max_length=50)


class AIInterviewTurn(BaseModel, table=True):
    __tablename__ = "ai_interview_turns"
    
    id: UUID = Field(default_factory=uuid4, alias="turn_id", sa_column=Column("turn_id", PG_UUID(as_uuid=True), primary_key=True))
    session_id: UUID = Field(foreign_key="ongoing_interviews.session_id")
    turn_number: int
    speaker: str = Field(max_length=20)  # ai, candidate
    content: str | None = Field(default=None, sa_column=Column(Text))
    audio_url: str | None = Field(default=None, max_length=500)
    duration_seconds: int | None = Field(default=None)
    analysis: dict | None = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 8: LIVE INTERVIEW (2 Tables)
# =============================================================================

class LiveInterviewConfig(BaseModel, table=True):
    __tablename__ = "live_interview_configs"
    
    id: UUID = Field(default_factory=uuid4, alias="config_id", sa_column=Column("config_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    position_id: UUID | None = Field(default=None, foreign_key="positions.position_id")
    title: str = Field(max_length=255)
    duration_minutes: int = Field(default=60)
    instructions: str | None = Field(default=None, sa_column=Column(Text))
    suggested_questions: dict | None = Field(default=None, sa_column=Column(JSONB))
    scoring_rubric: dict | None = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LiveInterviewSession(BaseModel, table=True):
    __tablename__ = "live_interview_sessions"
    
    id: UUID = Field(default_factory=uuid4, alias="session_id", sa_column=Column("session_id", PG_UUID(as_uuid=True), primary_key=True))
    config_id: UUID = Field(foreign_key="live_interview_configs.config_id")
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    interviewer_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    scheduled_at: datetime | None = Field(default=None)
    meeting_link: str | None = Field(default=None, max_length=500)
    status: str = Field(default="scheduled", max_length=20)
    started_at: datetime | None = Field(default=None)
    ended_at: datetime | None = Field(default=None)
    recording_url: str | None = Field(default=None, max_length=500)
    interviewer_notes: str | None = Field(default=None, sa_column=Column(Text))
    interviewer_rating: Decimal | None = Field(default=None)
    interviewer_decision: str | None = Field(default=None, max_length=20)


# =============================================================================
# SECTION 9: CV & GITHUB ANALYSIS (2 Tables)
# =============================================================================

class CVAnalysis(BaseModel, table=True):
    __tablename__ = "cv_analysis"
    
    id: UUID = Field(default_factory=uuid4, alias="analysis_id", sa_column=Column("analysis_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id", unique=True)
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    cv_file_url: str | None = Field(default=None, max_length=500)
    parsed_data: dict | None = Field(default=None, sa_column=Column(JSONB))
    skills: list | None = Field(default=None, sa_column=Column(ARRAY(String)))
    experience_years: Decimal | None = Field(default=None)
    match_score: Decimal | None = Field(default=None)
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)


class GitHubAnalysis(BaseModel, table=True):
    __tablename__ = "github_analysis"
    
    id: UUID = Field(default_factory=uuid4, alias="analysis_id", sa_column=Column("analysis_id", PG_UUID(as_uuid=True), primary_key=True))
    candidate_id: UUID = Field(foreign_key="candidate_profiles.candidate_id", unique=True)
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    github_url: str | None = Field(default=None, max_length=500)
    top_languages: dict | None = Field(default=None, sa_column=Column(JSONB))
    repo_count: int | None = Field(default=None)
    contribution_score: Decimal | None = Field(default=None)
    code_quality_score: Decimal | None = Field(default=None)
    analysis_data: dict | None = Field(default=None, sa_column=Column(JSONB))
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 10: INTEGRITY & PROCTORING (1 Table)
# =============================================================================

class ProctoringFlag(BaseModel, table=True):
    __tablename__ = "proctoring_flags"
    
    id: UUID = Field(default_factory=uuid4, alias="flag_id", sa_column=Column("flag_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    session_id: UUID
    session_type: str = Field(max_length=30)  # assessment, ai_interview
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    timestamp_seconds: int
    event_type: str = Field(max_length=50)
    severity: str = Field(max_length=10)  # high, medium, low
    evidence: str | None = Field(default=None, sa_column=Column(Text))
    detected_by: str | None = Field(default=None, max_length=50)
    status: str = Field(default="pending", max_length=20)
    reviewed_by_user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    review_notes: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 11: PIPELINE TRACKING (2 Tables)
# =============================================================================

class PipelineTransition(BaseModel, table=True):
    __tablename__ = "pipeline_transitions"
    
    id: UUID = Field(default_factory=uuid4, alias="transition_id", sa_column=Column("transition_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    from_status: str | None = Field(default=None, max_length=30)
    to_status: str = Field(max_length=30)
    triggered_by_user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    reason: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RecruiterAssignmentLog(BaseModel, table=True):
    __tablename__ = "recruiter_assignment_logs"
    
    id: UUID = Field(default_factory=uuid4, alias="log_id", sa_column=Column("log_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    position_id: UUID | None = Field(default=None, foreign_key="positions.position_id")
    group_id: UUID | None = Field(default=None, foreign_key="candidate_groups.group_id")
    user_id: UUID = Field(foreign_key="organization_users.user_id")
    action: str = Field(max_length=20)  # assigned, unassigned
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 12: OFFERS & HIRING (2 Tables)
# =============================================================================

class Offer(BaseModel, table=True):
    __tablename__ = "offers"
    
    id: UUID = Field(default_factory=uuid4, alias="offer_id", sa_column=Column("offer_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id")
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    position_id: UUID = Field(foreign_key="positions.position_id")
    salary_offered: Decimal | None = Field(default=None)
    offer_details: dict | None = Field(default=None, sa_column=Column(JSONB))
    status: str = Field(default="pending", max_length=20)
    offered_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime | None = Field(default=None)
    responded_at: datetime | None = Field(default=None)


class Hire(BaseModel, table=True):
    __tablename__ = "hires"
    
    id: UUID = Field(default_factory=uuid4, alias="hire_id", sa_column=Column("hire_id", PG_UUID(as_uuid=True), primary_key=True))
    application_id: UUID = Field(foreign_key="candidate_applications.application_id", unique=True)
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    position_id: UUID = Field(foreign_key="positions.position_id")
    offer_id: UUID | None = Field(default=None, foreign_key="offers.offer_id")
    final_salary: Decimal | None = Field(default=None)
    salary_currency: str | None = Field(default="USD", max_length=3)
    start_date: date | None = Field(default=None)
    hired_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# SECTION 13: NOTIFICATIONS & LOGS (3 Tables)
# =============================================================================

class Notification(BaseModel, table=True):
    __tablename__ = "notifications"
    
    id: UUID = Field(default_factory=uuid4, alias="notification_id", sa_column=Column("notification_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    recipient_user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    recipient_candidate_id: UUID | None = Field(default=None, foreign_key="candidate_profiles.candidate_id")
    type: str = Field(max_length=50)
    title: str = Field(max_length=255)
    message: str | None = Field(default=None, sa_column=Column(Text))
    data: dict | None = Field(default=None, sa_column=Column(JSONB))
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EmailLog(BaseModel, table=True):
    __tablename__ = "email_logs"
    
    id: UUID = Field(default_factory=uuid4, alias="email_id", sa_column=Column("email_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID = Field(foreign_key="organizations.organization_id")
    recipient_email: str = Field(max_length=255)
    subject: str = Field(max_length=255)
    template_type: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=20)
    sent_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SystemLog(BaseModel, table=True):
    __tablename__ = "system_logs"
    
    id: UUID = Field(default_factory=uuid4, alias="log_id", sa_column=Column("log_id", PG_UUID(as_uuid=True), primary_key=True))
    organization_id: UUID | None = Field(default=None, foreign_key="organizations.organization_id")
    user_id: UUID | None = Field(default=None, foreign_key="organization_users.user_id")
    action: str = Field(max_length=100)
    entity_type: str | None = Field(default=None, max_length=50)
    entity_id: UUID | None = Field(default=None)
    details: dict | None = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# TYPE ALIASES FOR BACKWARD COMPATIBILITY
# =============================================================================

# Alias for OrganizationUser to maintain compatibility with existing code
User = OrganizationUser
