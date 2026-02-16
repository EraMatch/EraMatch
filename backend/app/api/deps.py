"""
API dependencies for route handlers.
"""
from typing import Annotated

from fastapi import Depends, Header
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.models import User
from app.services import AuthService
from app.core.exceptions import UnauthorizedException
from app.models import CandidateProfile
from app.services import CandidateAuthService


async def get_db() -> AsyncSession:
    """Database session dependency."""
    async for session in get_session():
        yield session


async def get_token(authorization: str = Header(...)) -> str:
    """Extract bearer token from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise UnauthorizedException("Invalid authorization header")
    return authorization[7:]


async def get_current_user(
    session: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str, Depends(get_token)],
) -> User:
    """Get current authenticated user."""
    auth_service = AuthService(session)
    return await auth_service.get_current_user(token)


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Ensure user is active."""
    if current_user.status != "active":
        raise UnauthorizedException("User is not active")
    return current_user


async def require_admin(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Require admin role."""
    if current_user.role != "admin":
        raise UnauthorizedException("Admin access required")
    return current_user


async def require_recruiter(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Require admin, hr, or technical role."""
    if current_user.role not in ["admin", "hr", "technical"]:
        raise UnauthorizedException("Recruiter access required")
    return current_user


async def require_hr(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Require hr role."""
    if current_user.role != "hr":
        raise UnauthorizedException("HR access required")
    return current_user


async def require_technical(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Require technical role."""
    if current_user.role != "technical":
        raise UnauthorizedException("Technical access required")
    return current_user


async def get_current_candidate(
    session: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str, Depends(get_token)],
) -> CandidateProfile:
    """Get current authenticated candidate."""
    auth_service = CandidateAuthService(session)
    return await auth_service.get_current_candidate(token)


# Type aliases for cleaner route signatures
DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_active_user)]
AdminUser = Annotated[User, Depends(require_admin)]
RecruiterUser = Annotated[User, Depends(require_recruiter)]
HRUser = Annotated[User, Depends(require_hr)]
TechnicalUser = Annotated[User, Depends(require_technical)]

# injects the authenticated candidate's profile into the endpoint handler.
CurrentCandidate = Annotated[CandidateProfile, Depends(get_current_candidate)]
