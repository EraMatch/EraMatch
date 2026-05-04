"""
Candidate Authentication Service.

Handles login, token validation, and profile access for candidates
(separate from recruiter/org user authentication).
"""
from uuid import UUID
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.core.exceptions import UnauthorizedException, NotFoundException
from app.models import CandidateProfile
from app.schemas import TokenResponse


class CandidateAuthService:    
    def __init__(self, session: AsyncSession):
        self.session = session

    async def login(self, username: str, password: str) -> TokenResponse:
        """
        Authenticate candidate by username and return JWT tokens.
        """
        candidate = await self._get_candidate_by_username(username)
        
        if not candidate:
            raise UnauthorizedException("Invalid username or password")
        
        if not candidate.password_hash:
            raise UnauthorizedException("Password not set. Please contact support.")
        
        if not verify_password(password, candidate.password_hash):
            raise UnauthorizedException("Invalid username or password")
        
        # Create tokens with candidate_id as subject and user_type to distinguish
        access_token = create_access_token(
            subject=str(candidate.id),
            extra_data={"user_type": "candidate", "org_id": str(candidate.organization_id)}
        )
        refresh_token = create_refresh_token(subject=str(candidate.id))
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        )
    
    async def refresh_tokens(self, refresh_token: str) -> TokenResponse:
        """Refresh access token using refresh token."""
        payload = decode_token(refresh_token)
        
        if not payload or payload.get("type") != "refresh":
            raise UnauthorizedException("Invalid refresh token")
        
        candidate_id = payload.get("sub")
        candidate = await self._get_candidate_by_id(UUID(candidate_id))
        
        if not candidate:
            raise UnauthorizedException("Candidate not found")
        
        access_token = create_access_token(
            subject=str(candidate.id),
            extra_data={"user_type": "candidate", "org_id": str(candidate.organization_id)}
        )
        new_refresh_token = create_refresh_token(subject=str(candidate.id))
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
        )

    async def get_current_candidate(self, token: str) -> CandidateProfile:
        """Get candidate from access token."""
        payload = decode_token(token)
        
        if not payload or payload.get("type") != "access":
            raise UnauthorizedException("Invalid access token")
        
        # verify this is a candidate token
        if payload.get("user_type") != "candidate":
            raise UnauthorizedException("Invalid token type")
        
        candidate_id = payload.get("sub")
        candidate = await self._get_candidate_by_id(UUID(candidate_id))
        
        if not candidate:
            raise UnauthorizedException("Candidate not found")
        
        return candidate

    async def _get_candidate_by_username(self, username: str) -> CandidateProfile | None:
        """Get candidate by username."""
        statement = select(CandidateProfile).where(
            CandidateProfile.username == username,
            CandidateProfile.is_deleted == False
        )
        result = await self.session.execute(statement)
        return result.scalars().first()

    async def _get_candidate_by_id(self, candidate_id: UUID) -> CandidateProfile | None:
        """Get candidate by ID."""
        statement = select(CandidateProfile).where(
            CandidateProfile.id == candidate_id,
            CandidateProfile.is_deleted == False
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
