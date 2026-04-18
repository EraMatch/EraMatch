"""
Candidate schemas.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class CandidateCreate(BaseModel):
    """Create a new candidate profile."""
    email: EmailStr
    full_name: str
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None


class CandidateUpdate(BaseModel):
    """Update candidate profile."""
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None


class JobExperience(BaseModel):
    """Job experience schema."""
    title: str
    company: str
    duration: str
    description: str

class Education(BaseModel):
    """Education schema."""
    degree: str
    school: str
    year: str


class CandidateProject(BaseModel):
    """Project entry parsed from CV."""
    name: str
    description: str
    technologies: list[str] = []
    duration: str = "N/A"
    url: str | None = None

class CandidateScores(BaseModel):
    """Candidate scores for different stages."""
    overall: float = 0.0
    assessment: float = 0.0
    aiInterview: float = 0.0
    github: float = 0.0

class CandidateResponse(BaseModel):
    """Candidate profile response with enriched data for report view."""
    id: UUID
    email: str
    full_name: str
    name: str | None = None  # Alias for full_name to prevent frontend crash
    title: str | None = "Software Engineer" # Default title
    phone: str | None
    location: str | None
    linkedin_url: str | None
    github_url: str | None
    portfolio_url: str | None
    avatar_url: str | None = None
    created_at: datetime
    
    # Scores Object
    scores: CandidateScores = CandidateScores()
    
    # Enriched Report Data
    skills: list[str] = []
    experience: float = 0.0
    resumeSummary: str = ""
    techSkills: dict = {
        "frontend": [],
        "backend": [],
        "devops": [],
    }
    certifications: list[str] = []
    workHistory: list[JobExperience] = []
    projects: list[CandidateProject] = []
    education: list[Education] = []
    pipelineStatus: dict | None = None
    assessmentData: dict | None = None
    interviewData: dict | None = None
    assessmentQuestions: list[dict] = []
    videoInterviewQuestions: list[dict] = []
    liveInterviewData: dict | None = None
    githubStats: dict | None = None
    githubAnalysis: dict | None = None
    githubPersonalization: dict | None = None
    offerStatus: str | None = "not_sent"
    offerAcceptedDate: str | None = None
    filtrationFlow: list[str] | None = None
    groupAssigned: bool = False
    groupId: UUID | None = None
    groupName: str | None = None
    applicationId: UUID | None = None
    
    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj: any):
        """Custom from_orm to ensure 'name' is populated."""
        if hasattr(obj, "full_name") and not hasattr(obj, "name"):
            setattr(obj, "name", obj.full_name)
        if not hasattr(obj, "scores"):
            setattr(obj, "scores", CandidateScores())
        if not hasattr(obj, "workHistory"):
            setattr(obj, "workHistory", [])
        if not hasattr(obj, "education"):
            setattr(obj, "education", [])
        if not hasattr(obj, "projects"):
            setattr(obj, "projects", [])
        return super().from_orm(obj)


class ApplicationCreate(BaseModel):
    """Create a new application."""
    position_id: UUID
    resume_url: str | None = None
    cover_letter: str | None = None
    source: str | None = None


class ApplicationUpdate(BaseModel):
    """Update application."""
    status: str | None = None
    group_id: UUID | None = None


class ApplicationResponse(BaseModel):
    """Application response."""
    id: UUID
    candidate_id: UUID
    position_id: UUID
    group_id: UUID | None
    status: str
    resume_url: str | None
    source: str | None
    applied_at: datetime
    
    class Config:
        from_attributes = True


class CandidateUploadResponse(BaseModel):
    """Response for bulk candidate upload."""
    total_processed: int
    success_count: int
    failed_count: int
    errors: list[str] = []
    created_candidates: list[CandidateResponse] = []
