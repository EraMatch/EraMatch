"""
Admin endpoints - user management, org settings.
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.deps import DbSession, AdminUser
from app.services import AdminService
from app.schemas import (
    UserResponse, GlobalStatsResponse, PipelineStatsResponse, HealthAnalyticsResponse,
    PaymentMethodResponse, MemberStatsResponse, MemberPrivilegesResponse, MemberPrivilegesUpdate,
    MemberRegisterRequest, MemberRegisterResponse, AdminSettingsResponse, AdminProfileUpdate,
    OrganizationSettingsUpdate, PreferencesUpdate, PositionGroupResponse,
    PaymentMethodCreate, SubscriptionUpgradeRequest
)

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


@router.get("/stats/global", response_model=GlobalStatsResponse)
async def get_global_stats(session: DbSession, admin: AdminUser):
    """
    Get global statistics for the organization.
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.get_global_stats()


@router.get("/stats/pipeline", response_model=PipelineStatsResponse)
async def get_pipeline_stats(session: DbSession, admin: AdminUser):
    """
    Get recruitment funnel statistics (aggregated application counts).
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.get_pipeline_stats()

@router.get("/stats/analytics", response_model=HealthAnalyticsResponse)
async def get_health_analytics(session: DbSession, admin: AdminUser):
    """
    Get dashboard health & analytics metrics.
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.get_health_analytics()

@router.get("/subscription")
async def get_subscription_plans(session: DbSession, admin: AdminUser):
    """Get subscription plans and current usage. Requires admin role."""
    service = AdminService(session, admin)
    return await service.get_subscription_plans()

@router.get("/subscription/payment", response_model=PaymentMethodResponse | None)
async def get_payment_method(session: DbSession, admin: AdminUser):
    """
    Get payment method details for the organization.
    Requires admin role.
    """
    service = AdminService(session, admin)
    payment_method = await service.get_payment_method()
    
    if not payment_method:
        return None
    
    return PaymentMethodResponse(**payment_method)

@router.post("/subscription/payment", response_model=PaymentMethodResponse)
async def add_payment_method(session: DbSession, admin: AdminUser, data: PaymentMethodCreate):
    """
    Add a new payment method for the organization.
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.add_payment_method(data)

@router.post("/subscription/upgrade")
async def upgrade_subscription(session: DbSession, admin: AdminUser, request: SubscriptionUpgradeRequest):
    """
    Upgrade organization's subscription plan.
    Requires admin role.
    """
    service = AdminService(session, admin)
    success = await service.upgrade_subscription(request.planID)
    return {"success": success}

@router.get("/members/stats", response_model=MemberStatsResponse)
async def get_member_stats(session: DbSession, admin: AdminUser):
    """
    Get counts for Active Members, Pending Requests, and Open Roles.
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.get_member_stats()

@router.get("/members/{user_id}/privileges", response_model=MemberPrivilegesResponse)
async def get_member_privileges(user_id: UUID, session: DbSession, admin: AdminUser):
    """
    Fetch permission flags for a user.
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.get_member_privileges(user_id)

@router.patch("/members/{user_id}/privileges")
async def update_member_privileges(user_id: UUID, update: MemberPrivilegesUpdate, session: DbSession, admin: AdminUser):
    """
    Update permission flags for a user.
    Requires admin role.
    """
    service = AdminService(session, admin)
    await service.update_member_privileges(user_id, update.permissions)
    return {"status": "success"}

@router.post("/members/register", response_model=MemberRegisterResponse)
async def register_member(request: MemberRegisterRequest, session: DbSession, admin: AdminUser):
    """
    Register a new organization user.
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.register_member(request)


@router.delete("/members/{user_id}")
async def delete_member(user_id: UUID, session: DbSession, admin: AdminUser):
    """Remove a member (soft delete). Requires admin role."""
    service = AdminService(session, admin)
    success = await service.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Member not found or already deleted")
    return {"status": "success"}

@router.patch("/members/{user_id}/status")
async def update_member_status(user_id: UUID, status: str, session: DbSession, admin: AdminUser):
    """Update user status (active/suspended). Requires admin role."""
    service = AdminService(session, admin)
    success = await service.update_user_status(user_id, status)
    if not success:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"status": "success"}


# Settings
@router.get("/settings", response_model=AdminSettingsResponse)
async def get_settings(session: DbSession, admin: AdminUser):
    """Get aggregated settings."""
    service = AdminService(session, admin)
    return await service.get_settings()

@router.put("/settings/profile")
async def update_profile(data: AdminProfileUpdate, session: DbSession, admin: AdminUser):
    """Update user profile."""
    service = AdminService(session, admin)
    await service.update_profile(data.first_name, data.last_name, data.email)
    return {"status": "success"}

@router.put("/settings/organization")
async def update_organization(data: OrganizationSettingsUpdate, session: DbSession, admin: AdminUser):
    """Update organization settings."""
    service = AdminService(session, admin)
    await service.update_organization(data.organization_name, data.admin_email, data.timezone)
    return {"status": "success"}

@router.put("/settings/preferences")
async def update_preferences(data: PreferencesUpdate, session: DbSession, admin: AdminUser):
    """Update preferences."""
    service = AdminService(session, admin)
    await service.update_preferences(data.dict(exclude_unset=True))
    return {"status": "success"}


@router.get("/groups", response_model=list[PositionGroupResponse])
async def list_groups(session: DbSession, admin: AdminUser):
    """
    List all position groups in the organization.
    Requires admin role.
    """
    service = AdminService(session, admin)
    return await service.list_organization_groups()
