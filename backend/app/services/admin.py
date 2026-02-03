from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import User, Organization
from app.core.exceptions import ForbiddenException


class AdminService:
    def __init__(self, session: AsyncSession, current_user: User):
        self.session = session
        self.current_user = current_user
        self.organization_id = current_user.organization_id

    # User management
    async def list_users(self, skip: int = 0, limit: int = 50) -> list[User]:
        pass

    async def get_user(self, user_id: UUID) -> User:
        pass

    async def create_user(self, email: str, password: str, role: str, first_name: str, last_name: str) -> User:
        pass

    # Organization settings
    async def get_organization(self) -> Organization:
        pass

