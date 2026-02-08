from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    TokenPayload,
    RefreshRequest,
    UserResponse,
    CandidateLoginRequest,
    CandidateAuthResponse,
)
from app.schemas.candidate import (
    CandidateCreate,
    CandidateUpdate,
    CandidateResponse,
    ApplicationCreate,
    ApplicationUpdate,
    ApplicationResponse,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    PositionCreate,
    PositionUpdate,
    PositionResponse,
)

__all__ = [
    # Auth
    "LoginRequest",
    "TokenResponse",
    "TokenPayload",
    "RefreshRequest",
    "UserResponse",
    "CandidateLoginRequest",
    "CandidateAuthResponse",
    # Candidate
    "CandidateCreate",
    "CandidateUpdate",
    "CandidateResponse",
    "ApplicationCreate",
    "ApplicationUpdate",
    "ApplicationResponse",
    # Project
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectResponse",
    "PositionCreate",
    "PositionUpdate",
    "PositionResponse",
]
