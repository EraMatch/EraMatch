"""
Authentication endpoints.
"""
from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import DbSession, CurrentUser
from app.services import AuthService
from app.schemas import LoginRequest, TokenResponse, RefreshRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, session: DbSession):
    """
    Login with email and password.
    
    Returns access and refresh tokens.
    """
    service = AuthService(session)
    return await service.login(data.email, data.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshRequest, session: DbSession):
    """
    Refresh access token using refresh token.
    """
    service = AuthService(session)
    return await service.refresh_tokens(data.refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser):
    """
    Get current authenticated user info.
    """
    return current_user
