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
    ProjectSummaryResponse,
    ProjectListResponse,
    PositionInsightsResponse,
    PositionGroupResponse,
    GroupAnalysisResponse,
    TechnicalAIResponse,
    RiskBreakdownResponse,
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


@router.get("/projects", response_model=list[ProjectListResponse])
async def list_projects(
    session: DbSession,
    current_user: CurrentUser,
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    """List all projects."""
    service = RecruiterService(session, current_user)
    return await service.list_projects(status=status, skip=skip, limit=limit)


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


@router.get("/projects/{project_id}/summary", response_model=ProjectSummaryResponse)
async def get_project_summary(
    project_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get project summary stats."""
    service = RecruiterService(session, current_user)
    return await service.get_project_summary(project_id)


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
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    """List positions, optionally filtered by project."""
    service = RecruiterService(session, current_user)
    return await service.list_positions(project_id=project_id, status=status, skip=skip, limit=limit)


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


@router.get("/positions/{position_id}/insights", response_model=PositionInsightsResponse)
async def get_position_insights(
    position_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get position insights."""
    service = RecruiterService(session, current_user)
    return await service.get_position_insights(position_id)


@router.get("/positions/{position_id}/groups", response_model=list[PositionGroupResponse])
async def get_position_groups(
    position_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get position groups."""
    service = RecruiterService(session, current_user)
    return await service.get_position_groups(position_id)


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


# =============================================================================
# GROUPS
# =============================================================================


@router.get("/groups/{group_id}/analysis", response_model=GroupAnalysisResponse)
async def get_group_analysis(
    group_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get group analysis."""
    service = RecruiterService(session, current_user)
    return await service.get_group_analysis(group_id)


@router.get("/groups/{group_id}/technical-ai", response_model=TechnicalAIResponse)
async def get_group_technical_ai(
    group_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get group technical & AI stats."""
    service = RecruiterService(session, current_user)
    return await service.get_group_technical_ai(group_id)


@router.get("/groups/{group_id}/risks", response_model=RiskBreakdownResponse)
async def get_group_risks(
    group_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get group risks."""
    service = RecruiterService(session, current_user)
    return await service.get_group_risks(group_id)
