"""
Project and position schemas.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """Create a new project."""
    name: str
    description: str | None = None
    target_hire_count: int = 1


class ProjectUpdate(BaseModel):
    """Update project."""
    name: str | None = None
    description: str | None = None
    status: str | None = None
    target_hire_count: int | None = None


class ProjectResponse(BaseModel):
    """Project response."""
    id: UUID
    project_name: str = Field(alias="name", serialization_alias="projectName")
    description: str | None
    status: str
    target_hire_count: int
    created_at: datetime = Field(serialization_alias="openDate")
    
    class Config:
        from_attributes = True
        populate_by_name = True


class ProjectListResponse(BaseModel):
    """Project list response with aggregated counts for dashboard."""
    id: UUID
    projectName: str = Field(alias="name", serialization_alias="projectName")
    description: str | None
    status: str
    target_hire_count: int
    openDate: datetime = Field(alias="created_at", serialization_alias="openDate")
    positionsCount: int = Field(default=0)
    applicantsCount: int = Field(default=0)
    subGroupsCount: int = Field(default=0)
    avgTimeToFill: float = Field(default=0.0, serialization_alias="avgTimeToFill")
    
    class Config:
        from_attributes = True
        populate_by_name = True


class PositionCreate(BaseModel):
    """Create a new position."""
    project_id: UUID
    job_title: str
    job_description: str
    required_skills: list[str] = []
    experience_level: str | None = None
    work_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None


class PositionUpdate(BaseModel):
    """Update position."""
    job_title: str | None = None
    job_description: str | None = None
    required_skills: list[str] | None = None
    experience_level: str | None = None
    work_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    status: str | None = None


class PositionResponse(BaseModel):
    """Position response."""
    id: UUID = Field(serialization_alias="id")
    project_id: UUID
    job_title: str = Field(serialization_alias="jobTitle")
    job_description: str | None = Field(default=None, serialization_alias="jobDescription")
    required_skills: list = Field(default_factory=list, serialization_alias="requiredSkills")
    experience_level: str | None = Field(default=None, serialization_alias="experienceLevel")
    work_type: str | None = Field(default=None, serialization_alias="workType")
    salary_min: float | None = Field(default=None, serialization_alias="salaryMin")
    salary_max: float | None = Field(default=None, serialization_alias="salaryMax")
    status: str
    created_at: datetime | None = None
    candidatesCount: int = 0


class ProjectSummaryResponse(BaseModel):
    openPositions: int
    totalApplicants: int
    subGroups: int
    avgTimeToFill: float

class InsightScores(BaseModel):
    assessment: float
    interview: float

class PositionInsightsResponse(BaseModel):
    conversion: float
    qualityScore: float
    scores: InsightScores
    integrityIssues: int

class PositionGroupResponse(BaseModel):
    groupID: UUID
    groupName: str
    candidatesCount: int
    status: str
    createdDate: datetime
    integrityIssues: int = 0
    hasAssessment: bool = False
    hasAIInterview: bool = False
    hasLiveInterview: bool = False
    position_id: UUID | None = None

class GroupAnalysisResponse(BaseModel):
    matchAccuracy: float
    totalCandidates: int
    activePhases: int
    integrityScore: float

class TechStats(BaseModel):
    avgScore: float
    passRate: float
    completed: int = 0

class AIStats(BaseModel):
    avgScore: float
    avgConfidence: float = 0.0
    sentimentPositive: int = 0
    sentimentNeutral: int = 0
    sentimentNegative: int = 0
    completed: int = 0
    passRate: float = 0.0

class TechnicalAIResponse(BaseModel):
    tech: TechStats
    ai: AIStats

class RiskBreakdownResponse(BaseModel):
    high: int
    medium: int
    low: int
    cheatingDetected: int = 0
