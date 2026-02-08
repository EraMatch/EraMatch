"""
Authentication schemas.
"""
from uuid import UUID

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Login request body."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: str
    exp: int
    type: str


class RefreshRequest(BaseModel):
    """Refresh token request."""
    refresh_token: str


class UserResponse(BaseModel):
    """User info response (for recruiters/org users)."""
    id: UUID
    email: str
    first_name: str
    last_name: str
    role: str
    organization_id: UUID
    
    class Config:
        from_attributes = True



class CandidateLoginRequest(BaseModel):
    """Candidate login request body."""
    email: EmailStr
    password: str


class CandidateAuthResponse(BaseModel):
    """Candidate profile response after authentication."""
    candidate_id: UUID
    email: str
    full_name: str
    phone: str | None
    location: str | None
    linkedin_url: str | None
    github_url: str | None
    portfolio_url: str | None
    avatar_url: str | None
    organization_id: UUID
    
    class Config:
        from_attributes = True
