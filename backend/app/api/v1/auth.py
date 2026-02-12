"""
Authentication endpoints.
"""
from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import DbSession, CurrentUser
from app.services.auth import AuthService
from app.schemas import LoginRequest, TokenResponse, RefreshRequest, UserResponse, AdminLoginResponse, ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, session: DbSession):
    """
    Login with email and password.
    
    Returns access and refresh tokens.
    """
    service = AuthService(session)
    return await service.login(data.email, data.password)


@router.post("/admin/login", response_model=AdminLoginResponse)
async def admin_login(data: LoginRequest, session: DbSession):
    """
    Login for organization admins.
    
    Returns token and user info (name, role, orgID).
    """
    service = AuthService(session)
    return await service.admin_login(data.email, data.password)


'''-------------- Organization User Login -----------------------'''


@router.post("/organization-user/login", response_model=AdminLoginResponse)
async def organization_user_login(data: LoginRequest, session: DbSession):
    """
    Login for organization users (HR/Technical recruiters).
    
    Returns token and user info (name, role, orgID).
    """
    service = AuthService(session)
    return await service.organization_user_login(data.email, data.password)


@router.post("/organization-user/forgot-password")
async def organization_user_forgot_password(data: ForgotPasswordRequest, session: DbSession):
    """
    Send a password reset link to the organization user's email.
    """
    service = AuthService(session)
    await service.organization_user_forgot_password(data.email)
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/organization-user/reset-password")
async def organization_user_reset_password(data: ResetPasswordRequest, session: DbSession):
    """
    Reset password for organization user using the reset token.
    """
    service = AuthService(session)
    await service.organization_user_reset_password(data.token, data.password)
    return {"message": "Password has been successfully reset."}


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, session: DbSession):
    """
    Send a password reset link to the given email.
    """
    service = AuthService(session)
    await service.forgot_password(data.email)
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, session: DbSession):
    """
    Reset password using the reset token.
    """
    service = AuthService(session)
    await service.reset_password(data.token, data.password)
    return {"message": "Password has been successfully reset."}


@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, session: DbSession, current_user: CurrentUser):
    """
    Change password for the current user.
    """
    service = AuthService(session)
    is_admin = current_user.role == "admin"
    await service.change_password(current_user.id, data.old_password, data.new_password, is_admin)
    return {"message": "Password updated successfully."}


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
