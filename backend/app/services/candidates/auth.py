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

    async def login(self, email: str, password: str, group_id: UUID | None = None) -> TokenResponse:
        """
        authenticate and return the jwt
        """
        import traceback
        try:
            print(f"[DEBUG] Attempting login for email: {email}, group_id: {group_id}")
            candidate = await self._get_candidate_by_email(email, group_id)
            print(f"[DEBUG] Candidate lookup result: {candidate}")
            
            if not candidate:
                raise UnauthorizedException("Invalid email or password")
            
            print(f"[DEBUG] Password hash: {candidate.password_hash[:20]}...")
            
            if not candidate.password_hash:
                raise UnauthorizedException("Password not set. Please contact support.")
            
            print(f"[DEBUG] Verifying password...")
            if not verify_password(password, candidate.password_hash):
                raise UnauthorizedException("Invalid email or password")
            
            print(f"[DEBUG] Password verified, creating tokens...")
            # Create tokens with candidate_id as subject and user_type to distinguish
            access_token = create_access_token(
                subject=str(candidate.id),
                extra_data={"user_type": "candidate", "org_id": str(candidate.organization_id)}
            )
            refresh_token = create_refresh_token(subject=str(candidate.id))
            
            print(f"[DEBUG] Login successful")
            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
            )
        except Exception as e:
            print(f"[DEBUG ERROR] Login failed: {type(e).__name__}: {e}")
            traceback.print_exc()
            raise
    
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

    async def _get_candidate_by_email(self, email: str, group_id: UUID | None = None) -> CandidateProfile | None:
        """Get candidate by email, filtering by group_id if provided to ensure correct user context."""
        from app.models import CandidateApplication

        statement = select(CandidateProfile).where(
            CandidateProfile.email == email,
            CandidateProfile.is_deleted == False
        )
        
        if group_id:
            statement = statement.join(
                CandidateApplication,
                CandidateProfile.id == CandidateApplication.candidate_id
            ).where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.is_deleted == False
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
