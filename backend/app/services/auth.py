from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.core.exceptions import UnauthorizedException
from app.models import User
from app.schemas import TokenResponse


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def login(self, email: str, password: str) -> TokenResponse:
        # TODO: Implement login
        pass

    async def refresh_tokens(self, refresh_token: str) -> TokenResponse:
        # TODO: Implement token refresh
        pass

    async def get_current_user(self, token: str) -> User:
        # TODO: Implement get current user from token
        pass

    async def _get_user_by_email(self, email: str) -> User | None:
        # TODO: Get user by email
        pass

    async def _get_user_by_id(self, user_id: UUID) -> User | None:
        # TODO: Get user by ID
        pass
