from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import CandidateProfile, CandidateApplication
from app.schemas import CandidateCreate, CandidateUpdate, ApplicationCreate


class CandidateService:
    def __init__(self, session: AsyncSession, organization_id: UUID):
        self.session = session
        self.organization_id = organization_id

    # Profile operations
    async def create_profile(self, data: CandidateCreate) -> CandidateProfile:
     # we still need even the frontend!
        pass

    # Application operations
