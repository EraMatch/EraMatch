"""
Recruiter endpoints - projects, positions, applications.
"""
from uuid import UUID

from fastapi import APIRouter

from app.api.deps import DbSession, RecruiterUser
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
    PositionDetailsResponse,
    GroupAnalysisResponse,
    TechnicalAIResponse,
    RiskBreakdownResponse,
    RecruiterAnalyticsResponse,
    GroupCreateRequest,
    CandidateUploadResponse,
    GroupDetailResponse,
    FilterTemplateResponse,
    FilterTemplateCreate,
    AIGenerateQuestionRequest,
    AIRefineQuestionRequest,
)
from app.services import CandidateService, GroupService

router = APIRouter(prefix="/recruiter", tags=["Recruiters"])


# =============================================================================
# NOTIFICATIONS
# =============================================================================

from app.schemas import NotificationResponse

@router.get("/notifications", response_model=list[NotificationResponse])
async def get_notifications(
    session: DbSession,
    current_user: RecruiterUser,
    skip: int = 0,
    limit: int = 50,
):
    """Get recruiter notifications."""
    service = RecruiterService(session, current_user)
    return await service.get_notifications(skip=skip, limit=limit)


# =============================================================================
# PROJECTS
# =============================================================================
from app.schemas import PositionCandidateResponse

@router.get("/candidates", response_model=list[PositionCandidateResponse])
async def list_all_candidates(
    session: DbSession,
    current_user: RecruiterUser,
):
    """List all candidate profiles in the organization."""
    service = RecruiterService(session, current_user)
    return await service.list_all_candidates()


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate, session: DbSession, current_user: RecruiterUser
):
    """Create a new project."""
    service = RecruiterService(session, current_user)
    return await service.create_project(data)


@router.get("/projects", response_model=list[ProjectListResponse])
async def list_projects(
    session: DbSession,
    current_user: RecruiterUser,
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    """List all projects."""
    service = RecruiterService(session, current_user)
    return await service.list_projects(status=status, skip=skip, limit=limit)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get a project by ID."""
    service = RecruiterService(session, current_user)
    return await service.get_project(project_id)


@router.get("/projects/{project_id}/positions", response_model=list[PositionResponse])
async def get_project_positions(
    project_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get all positions for a project."""
    service = RecruiterService(session, current_user)
    return await service.get_project_positions(project_id)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Update a project."""
    service = RecruiterService(session, current_user)
    return await service.update_project(project_id, data)


@router.get("/projects/{project_id}/summary", response_model=ProjectSummaryResponse)
async def get_project_summary(
    project_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get project summary stats."""
    service = RecruiterService(session, current_user)
    return await service.get_project_summary(project_id)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Delete a project (soft delete)."""
    service = RecruiterService(session, current_user)
    await service.delete_project(project_id)


# =============================================================================
# POSITIONS
# =============================================================================


@router.post("/positions", response_model=PositionResponse, status_code=201)
async def create_position(
    data: PositionCreate, session: DbSession, current_user: RecruiterUser
):
    """Create a new position."""
    service = RecruiterService(session, current_user)
    return await service.create_position(data)


@router.get("/positions", response_model=list[PositionResponse])
async def list_positions(
    session: DbSession,
    current_user: RecruiterUser,
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
    position_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get a position by ID."""
    service = RecruiterService(session, current_user)
    return await service.get_position(position_id)


@router.patch("/positions/{position_id}", response_model=PositionResponse)
async def update_position(
    position_id: UUID,
    data: PositionUpdate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Update a position."""
    service = RecruiterService(session, current_user)
    return await service.update_position(position_id, data)


@router.delete("/positions/{position_id}", status_code=204)
async def delete_position(
    position_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Delete a position (soft delete)."""
    service = RecruiterService(session, current_user)
    await service.delete_position(position_id)


@router.get("/positions/{position_id}/details", response_model=PositionDetailsResponse)
async def get_position_details(
    position_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get position details (candidates and groups)."""
    service = RecruiterService(session, current_user)
    return await service.get_position_details(position_id)


@router.get("/positions/{position_id}/insights", response_model=PositionInsightsResponse)
async def get_position_insights(
    position_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get position insights."""
    service = RecruiterService(session, current_user)
    return await service.get_position_insights(position_id)


@router.get("/positions/{position_id}/groups", response_model=list[PositionGroupResponse])
async def get_position_groups(
    position_id: UUID, session: DbSession, current_user: RecruiterUser
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
    current_user: RecruiterUser,
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
    current_user: RecruiterUser,
):
    """Update application status."""
    service = RecruiterService(session, current_user)
    return await service.update_application_status(application_id, data)


# =============================================================================
# GROUPS
# =============================================================================


@router.get("/groups/{group_id}/analysis", response_model=GroupAnalysisResponse)
async def get_group_analysis(
    group_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get group analysis."""
    service = RecruiterService(session, current_user)
    return await service.get_group_analysis(group_id)


@router.get("/groups/{group_id}/technical-ai", response_model=TechnicalAIResponse)
async def get_group_technical_ai(
    group_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get group technical & AI stats."""
    service = RecruiterService(session, current_user)
    return await service.get_group_technical_ai(group_id)


@router.get("/groups/{group_id}/risks", response_model=RiskBreakdownResponse)
async def get_group_risks(
    group_id: UUID, session: DbSession, current_user: RecruiterUser
):
    """Get group risks."""
    service = RecruiterService(session, current_user)
    return await service.get_group_risks(group_id)


# =============================================================================
# APPROVALS (TECHNICAL REVIEW)
# =============================================================================


@router.get("/requests/assigned", response_model=list[dict])
async def list_assigned_requests(
    session: DbSession,
    current_user: RecruiterUser,
):
    """List approval requests assigned to the current technical recruiter."""
    service = RecruiterService(session, current_user)
    return await service.list_assigned_requests()


from pydantic import BaseModel
class ReviewRequest(BaseModel):
    status: str
    review_notes: str | None = None

@router.patch("/requests/{request_id}/review")
async def review_approval_request(
    request_id: UUID,
    data: ReviewRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Review an approval request."""
    service = RecruiterService(session, current_user)
    await service.review_approval_request(request_id, data.status, data.review_notes)
    return {"status": "success"}


# =============================================================================
# ANALYTICS
# =============================================================================


@router.get("/analytics", response_model=RecruiterAnalyticsResponse)
async def get_analytics(
    session: DbSession,
    current_user: RecruiterUser,
):
    """Get recruiter analytics."""
    service = RecruiterService(session, current_user)
    service = RecruiterService(session, current_user)
    return await service.get_analytics(current_user.id)


# =============================================================================
# CANDIDATE IMPORT & GROUPS
# =============================================================================

from fastapi import UploadFile, File

@router.post("/positions/{position_id}/candidates/upload", response_model=CandidateUploadResponse)
async def upload_candidates_zip(
    position_id: UUID,
    file: UploadFile = File(...),
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """
    Upload a zip file of CVs/Resumes.
    Only HR can perform this action.
    """
    # RBAC Check
    if current_user.role != "hr" and current_user.role != "admin": # Allow Admin too? Plan said HR only/Tech view. Admin usually has all access.
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Only HR users can import candidates.")

    if not file.filename.endswith('.zip'):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Only .zip files are supported.")
    
    content = await file.read()
    
    # Use CandidateService
    service = CandidateService(session, current_user.organization_id)
    return await service.process_zip_upload(content, position_id)


@router.post("/positions/{position_id}/groups", response_model=GroupDetailResponse)
async def create_position_group(
    position_id: UUID,
    data: GroupCreateRequest,
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """
    Create a candidate group for a position.
    Only HR can perform this action.
    """
    # RBAC Check
    if current_user.role != "hr" and current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Only HR users can create groups.")
        
    if data.position_id != position_id:
         from fastapi import HTTPException
         raise HTTPException(status_code=400, detail="Position ID mismatch.")

    # Use GroupService
    service = GroupService(session, current_user)
    # create_group returns CandidateGroup model, response_model is GroupDetailResponse
    # We might need to fetch details to match response model or just return basic info.
    # GroupDetailResponse has many fields.
    group = await service.create_group(data)
    
    # Fetch full details to return consistent response
    return await service.get_group_details(group.id)


# =============================================================================
# SETTINGS
# =============================================================================

from app.schemas import (
    RecruiterSettingsResponse,
    RecruiterProfileUpdate,
    RecruiterPreferencesUpdate,
    RecruiterAIPipelineUpdate,
)

@router.get("/settings", response_model=RecruiterSettingsResponse)
async def get_recruiter_settings(
    session: DbSession,
    current_user: RecruiterUser,
):
    """Get candidate settings for the logged-in recruiter."""
    service = RecruiterService(session, current_user)
    return await service.get_settings()


@router.patch("/settings/profile", response_model=RecruiterSettingsResponse)
async def update_recruiter_profile(
    data: RecruiterProfileUpdate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Update profile logic."""
    service = RecruiterService(session, current_user)
    return await service.update_profile(data.model_dump(exclude_unset=True))


@router.patch("/settings/preferences", response_model=RecruiterSettingsResponse)
async def update_recruiter_preferences(
    data: RecruiterPreferencesUpdate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Update boolean preferences (notifications/security)."""
    service = RecruiterService(session, current_user)
    return await service.update_preferences(data.model_dump(exclude_unset=True))


@router.patch("/settings/ai-pipeline", response_model=RecruiterSettingsResponse)
async def update_recruiter_ai_pipeline(
    data: RecruiterAIPipelineUpdate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Update Technical HR configuration for AI pipeline engine defaults."""
    service = RecruiterService(session, current_user)
    return await service.update_ai_pipeline(data.ai_pipeline_config)


# =============================================================================
# FILTER TEMPLATES
# =============================================================================

@router.get("/filters/templates", response_model=list[FilterTemplateResponse])
async def get_filter_templates(
    session: DbSession,
    current_user: RecruiterUser,
):
    """List all saved filter templates for the recruiter."""
    service = RecruiterService(session, current_user)
    return await service.get_filter_templates()


@router.post("/filters/templates", response_model=FilterTemplateResponse)
async def save_filter_template(
    data: FilterTemplateCreate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Save a new candidate filter template."""
    service = RecruiterService(session, current_user)
    return await service.save_filter_template(data.name, data.filters)


@router.delete("/filters/templates/{template_id}")
async def delete_filter_template(
    template_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Delete a saved filter template."""
    service = RecruiterService(session, current_user)
    success = await service.delete_filter_template(template_id)
    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "success"}


# =============================================================================
# AI FEATURES
# =============================================================================

@router.post("/ai/generate-question")
async def generate_ai_question(
    data: AIGenerateQuestionRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Generate an interview/technical question using Ollama."""
    service = RecruiterService(session, current_user)
    return await service.generate_ai_question(
        data.question_type, data.topic, data.difficulty, data.context
    )


@router.post("/ai/refine-question")
async def refine_question_with_ai(
    data: AIRefineQuestionRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Refine or professionalize a question text using Ollama."""
    service = RecruiterService(session, current_user)
    refined_text = await service.refine_question_with_ai(data.question_text)
    return {"refinedText": refined_text}
