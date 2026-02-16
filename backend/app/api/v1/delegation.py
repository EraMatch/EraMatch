"""
Delegation endpoints - recruiter assignment management.
"""
from uuid import UUID
from fastapi import APIRouter, HTTPException

from app.api.deps import DbSession, AdminUser, RecruiterUser
from app.services import AdminService
from app.schemas.admin import RecruiterListResponse, ReassignRequest

router = APIRouter(prefix="/delegation", tags=["Delegation"])

@router.get("/hr", response_model=list[RecruiterListResponse])
async def list_hr_recruiters(session: DbSession, user: RecruiterUser):
    """List all HR recruiters. Requires recruiter role."""
    service = AdminService(session, user)
    return await service.list_recruiters_by_role("hr")

@router.get("/technical", response_model=list[RecruiterListResponse])
async def list_tech_recruiters(session: DbSession, user: RecruiterUser):
    """List all Technical recruiters. Requires recruiter role."""
    service = AdminService(session, user)
    return await service.list_recruiters_by_role("technical")

@router.patch("/positions/{position_id}/reassign")
async def reassign_recruiter(
    position_id: UUID, 
    request: ReassignRequest, 
    session: DbSession, 
    admin: AdminUser
):
    """
    Reassign a recruiter to a position.
    Requires admin role.
    """
    service = AdminService(session, admin)
    success = await service.reassign_recruiter(position_id, request)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to reassign recruiter")
    return {"status": "success"}

@router.post("/positions/{position_id}/notify")
async def notify_recruiters(
    position_id: UUID, 
    session: DbSession, 
    admin: AdminUser
):
    """
    Notify assigned recruiters for a position.
    """
    service = AdminService(session, admin)
    success = await service.notify_recruiters(position_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send notifications")
    return {"status": "success"}
@router.get("/recent")
async def get_recent_assignments(
    session: DbSession,
    admin: AdminUser
):
    """
    Fetch recent recruiter assignment changes.
    """
    service = AdminService(session, admin)
    return await service.get_recent_assignments()
