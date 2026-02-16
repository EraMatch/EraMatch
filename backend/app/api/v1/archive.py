from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
from app.api.deps import DbSession, AdminUser
from app.services.admin import AdminService

router = APIRouter()

@router.get("/projects")
async def list_archived_projects(
    session: DbSession,
    admin: AdminUser
):
    """
    List closed projects for the organization.
    """
    service = AdminService(session, admin)
    return await service.list_archived_projects()

@router.get("/projects/{project_id}/positions")
async def list_archived_positions(
    project_id: UUID,
    session: DbSession,
    admin: AdminUser
):
    """
    List job positions within an archived project.
    """
    service = AdminService(session, admin)
    return await service.list_archived_positions(project_id)

@router.get("/positions/{position_id}/details")
async def get_position_archive_details(
    position_id: UUID,
    session: DbSession,
    admin: AdminUser
):
    """
    Get statistics and hired candidate info for a closed position.
    """
    service = AdminService(session, admin)
    return await service.get_position_archive_details(position_id)
