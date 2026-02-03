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


class CandidateResponse(BaseModel):
    """Candidate profile response."""
    id: UUID
    email: str
    full_name: str
    phone: str | None
    location: str | None
    linkedin_url: str | None
    github_url: str | None
    portfolio_url: str | None
    created_at: datetime
    
    class Config:
        from_attributes = True


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
