"""
Project and position schemas.
"""
from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, AliasChoices, AliasPath


class ProjectCreate(BaseModel):
    """Create a new project."""
    name: str
    description: str | None = None
    target_hire_count: int = 1
    budget: float | None = None
    priority: str = "medium"
    department: str | None = None
    start_date: str | None = None # ISO date
    end_date: str | None = None # ISO date


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
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


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
    
    # New Dynamic Metrics
    conversion_rate: float = Field(default=0.0, serialization_alias="conversionRate")
    quality_score: float = Field(default=0.0, serialization_alias="qualityScore")
    stage_timing: list[dict] = Field(default_factory=list, serialization_alias="stageTiming")
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PositionCreate(BaseModel):
    """Create a new position."""
    project_id: UUID
    job_title: str
    job_description: str | None = None
    required_skills: list[str] = []
    experience_level: str | None = None
    work_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    employment_type: str = "full-time"
    location_type: str = "remote"
    location_data: dict | None = None
    years_of_experience: int = 0
    education_level: str | None = None
    benefits: list[str] = []
    assigned_hr_id: UUID
    assigned_tech_id: UUID


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
    """Position response with enriched recruiter and count data."""
    id: UUID = Field(
        validation_alias=AliasChoices("id", "position_id"),
        serialization_alias="id"
    )
    project_id: UUID
    job_title: str = Field(serialization_alias="jobTitle")
    job_description: str | None = Field(default=None, serialization_alias="jobDescription")
    required_skills: list = Field(default_factory=list, serialization_alias="requiredSkills")
    experience_level: str | None = Field(default=None, serialization_alias="experienceLevel")
    work_type: str | None = Field(default=None, serialization_alias="workType")
    salary_min: float | None = Field(default=None, serialization_alias="salaryMin")
    salary_max: float | None = Field(default=None, serialization_alias="salaryMax")
    employment_type: str = Field(default="full-time", serialization_alias="employmentType")
    location_type: str = Field(default="remote", serialization_alias="locationType")
    location_data: dict | None = Field(default=None, serialization_alias="locationData")
    years_of_experience: int = Field(default=0, serialization_alias="yearsOfExperience")
    education_level: str | None = Field(default=None, serialization_alias="educationLevel")
    benefits: list[str] = Field(default_factory=list, serialization_alias="benefits")
    status: str
    created_at: datetime | None = None
    
    # Enriched fields
    assigned_hr_id: UUID | None = None
    assigned_tech_id: UUID | None = None
    assignedHR: str | None = Field(default=None, serialization_alias="assignedHR")
    assignedTechnicalRecruiter: str | None = Field(default=None, serialization_alias="assignedTechnicalRecruiter")
    candidatesCount: int = Field(default=0, serialization_alias="candidatesCount")
    applicantsCount: int = Field(default=0, serialization_alias="applicantsCount")
    department: str | None = Field(default="Technical", serialization_alias="department")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)



class PositionCandidateResponse(BaseModel):
    id: UUID
    name: str
    email: str
    score: float
    match: float
    color: str = "#6366f1"
    starred: bool = False
    selected: bool = False
    
    # Group Assignment
    groupId: UUID | None = None
    groupName: str | None = None
    applicationId: UUID | None = None
    
    # New fields for Group Creation
    experience: float = 0.0
    location: str | None = "Unknown"
    skills: list[str] = []
    
    # Detailed fields for filtering
    companies: list[str] = []
    job_titles: list[str] = []
    universities: list[str] = []
    degrees: list[str] = []

class PositionGroupResponse(BaseModel):
    id: UUID = Field(alias="id")
    name: str = Field(alias="name")
    candidateCount: int = Field(alias="candidateCount")
    status: str
    createdDate: datetime
    integrityIssues: int = 0
    hasAssessment: bool = False
    hasAIInterview: bool = False
    hasLiveInterview: bool = False
    position_id: UUID | None = None
    progress: int = 0
    recruiter: str = "Unassigned"
    assigned_hr_name: str | None = None
    assigned_tech_name: str | None = None
    stage: str = "Initial"
    lastUpdated: str = "Just now"

class PositionDetailsResponse(BaseModel):
    candidates: list[PositionCandidateResponse] = []
    groups: list[PositionGroupResponse] = []

class ProjectSummaryResponse(BaseModel):
    openPositions: int
    totalApplicants: int
    subGroups: int
    avgTimeToFill: float

class InsightScores(BaseModel):
    assessment: float
    interview: float

class SourceQualityItem(BaseModel):
    source: str
    avgScore: float
    count: int

class CompanyPipelineItem(BaseModel):
    company: str
    count: int

class DistributionItem(BaseModel):
    name: str
    value: int
    color: str | None = None

class ScoreBucket(BaseModel):
    range: str
    count: int

class SkillDistributionItem(BaseModel):
    skill: str
    count: int
    percentage: float

class SeniorityDistributionItem(BaseModel):
    level: str
    count: int
    percentage: float

class UniversityDistributionItem(BaseModel):
    university: str
    count: int
    percentage: float = 0.0

class AvailabilityDistributionItem(BaseModel):
    availability: str
    count: int
    percentage: float = 0.0

class PositionInsightsResponse(BaseModel):
    conversion: float
    qualityScore: float
    scores: InsightScores
    integrityIssues: int
    fittingData: list[DistributionItem] = []
    scoreData: list[ScoreBucket] = []
    skillDistribution: list[SkillDistributionItem] = []
    seniorityDistribution: list[SeniorityDistributionItem] = []
    universityDistribution: list[UniversityDistributionItem] = []
    availabilityDistribution: list[AvailabilityDistributionItem] = []
    sourceQuality: list[SourceQualityItem] = []
    topCompanies: list[CompanyPipelineItem] = []


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
