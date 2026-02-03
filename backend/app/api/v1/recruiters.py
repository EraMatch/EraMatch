"""
Recruiter endpoints - projects, positions, applications.
"""
from uuid import UUID

from fastapi import APIRouter

from app.api.deps import DbSession, CurrentUser
from app.services import RecruiterService
from app.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    PositionCreate,
    PositionUpdate,
    PositionResponse,
    ApplicationUpdate,
    ApplicationResponse,
)

router = APIRouter(prefix="/recruiters", tags=["Recruiters"])


# =============================================================================
# PROJECTS
# =============================================================================


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate, session: DbSession, current_user: CurrentUser
):
    """Create a new project."""
    service = RecruiterService(session, current_user)
    return await service.create_project(data)


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(
    session: DbSession,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
):
    """List all projects."""
    service = RecruiterService(session, current_user)
    return await service.list_projects(skip=skip, limit=limit)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get a project by ID."""
    service = RecruiterService(session, current_user)
    return await service.get_project(project_id)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    session: DbSession,
    current_user: CurrentUser,
):
    """Update a project."""
    service = RecruiterService(session, current_user)
    return await service.update_project(project_id, data)


# =============================================================================
# POSITIONS
# =============================================================================


@router.post("/positions", response_model=PositionResponse, status_code=201)
async def create_position(
    data: PositionCreate, session: DbSession, current_user: CurrentUser
):
    """Create a new position."""
    service = RecruiterService(session, current_user)
    return await service.create_position(data)


@router.get("/positions", response_model=list[PositionResponse])
async def list_positions(
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    skip: int = 0,
    limit: int = 50,
):
    """List positions, optionally filtered by project."""
    service = RecruiterService(session, current_user)
    return await service.list_positions(project_id=project_id, skip=skip, limit=limit)


@router.get("/positions/{position_id}", response_model=PositionResponse)
async def get_position(
    position_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get a position by ID."""
    service = RecruiterService(session, current_user)
    return await service.get_position(position_id)


@router.patch("/positions/{position_id}", response_model=PositionResponse)
async def update_position(
    position_id: UUID,
    data: PositionUpdate,
    session: DbSession,
    current_user: CurrentUser,
):
    """Update a position."""
    service = RecruiterService(session, current_user)
    return await service.update_position(position_id, data)


# =============================================================================
# APPLICATIONS
# =============================================================================


@router.get("/applications", response_model=list[ApplicationResponse])
async def list_applications(
    session: DbSession,
    current_user: CurrentUser,
    position_id: UUID | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    """List applications with optional filters."""
    service = RecruiterService(session, current_user)
    return await service.list_applications(
        position_id=position_id, status=status, skip=skip, limit=limit
    )


@router.patch("/applications/{application_id}", response_model=ApplicationResponse)
async def update_application(
    application_id: UUID,
    data: ApplicationUpdate,
    session: DbSession,
    current_user: CurrentUser,
):
    """Update application status."""
    service = RecruiterService(session, current_user)
    return await service.update_application_status(application_id, data)
