"""
Admin endpoints - user management, org settings.
"""
from uuid import UUID

from fastapi import APIRouter

from app.api.deps import DbSession, AdminUser
from app.services import AdminService
from app.schemas import UserResponse

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    session: DbSession,
    admin: AdminUser,
    skip: int = 0,
    limit: int = 50,
):
    """List all users in organization. Requires admin role."""
    service = AdminService(session, admin)
    return await service.list_users(skip=skip, limit=limit)


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: UUID, session: DbSession, admin: AdminUser):
    """Get user by ID. Requires admin role."""
    service = AdminService(session, admin)
    return await service.get_user(user_id)


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: UUID,
    role: str,
    session: DbSession,
    admin: AdminUser,
):
    """Update user role. Requires admin role."""
    service = AdminService(session, admin)
    return await service.update_user_role(user_id, role)
