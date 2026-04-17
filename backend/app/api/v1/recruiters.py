"""
Recruiter endpoints - projects, positions, applications.
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlmodel import select
from sqlalchemy import text, bindparam
from sqlalchemy.dialects.postgresql import UUID as pgUUID

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
    ApplicationScoreBreakdownResponse,
    GroupDetailResponse,
    FilterTemplateResponse,
    FilterTemplateCreate,
    AIGenerateQuestionRequest,
    AIRefineQuestionRequest,
)
from app.services import CandidateService, GroupService
from app.models import CandidateApplication, CandidateProfile, CVAnalysis, Position, GitHubAnalysisJob
from worker.tasks.github_analysis import run_github_analysis
from pydantic import BaseModel

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


class PositionQAGUpdateRequest(BaseModel):
    questions: list[dict]


class AssessmentResetResponse(BaseModel):
    application_id: UUID
    sessions_deleted: int
    answers_deleted: int
    assigned_questions_deleted: int
    proctoring_flags_deleted: int
    progress_reset: int
    message: str


@router.get("/positions/{position_id}/hdeval-qag", response_model=dict)
async def get_position_hdeval_qag(
    position_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Get generated 50 yes/no HD Eval + QAG questions for review."""
    service = RecruiterService(session, current_user)
    return await service.get_position_hdeval_qag(position_id)


@router.put("/positions/{position_id}/hdeval-qag", response_model=dict)
async def update_position_hdeval_qag(
    position_id: UUID,
    data: PositionQAGUpdateRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Edit generated yes/no question set before final approval."""
    service = RecruiterService(session, current_user)
    return await service.update_position_hdeval_qag(position_id, data.questions)


@router.post("/positions/{position_id}/hdeval-qag/approve", response_model=dict)
async def approve_position_hdeval_qag(
    position_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Approve yes/no QAG set and recompute candidate scores."""
    service = RecruiterService(session, current_user)
    return await service.approve_position_hdeval_qag(position_id)


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


@router.post("/applications/{application_id}/assessment/reset", response_model=AssessmentResetResponse)
async def reset_application_assessment_trial(
    application_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Reset assessment trial for one application: clear session data and set stage progress to not_started."""
    current_user_id = getattr(current_user, "id", None) or getattr(current_user, "user_id", None)
    if not current_user_id:
        dumped = {}
        try:
            dumped = current_user.model_dump(by_alias=True)
        except Exception:
            dumped = {}
        current_user_id = dumped.get("user_id") or dumped.get("id")

    ownership = await session.execute(
        text(
            """
            SELECT
              ca.application_id,
              ca.organization_id,
              p.position_id,
              p.assigned_hr_id,
              p.assigned_tech_id,
              ca.candidate_id
            FROM candidate_applications ca
            JOIN positions p ON p.position_id = ca.position_id
            WHERE ca.application_id = :application_id
              AND ca.organization_id = :organization_id
              AND ca.is_deleted = false
              AND p.is_deleted = false
            LIMIT 1
            """
        ).bindparams(
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
            bindparam("organization_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "application_id": application_id,
            "organization_id": current_user.organization_id,
        },
    )
    row = ownership.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")

    role = str(getattr(current_user, "role", "")).lower()
    if role == "technical" and row["assigned_tech_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="You are not assigned to this position")
    if role == "hr" and row["assigned_hr_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="You are not assigned to this position")

    sessions_res = await session.execute(
        text(
            """
            SELECT oa.session_id
            FROM ongoing_assessments oa
            WHERE oa.application_id = :application_id
            """
        ).bindparams(
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
        ),
        {"application_id": application_id},
    )
    session_ids = [s for s in sessions_res.scalars().all() if s]

    answers_deleted = 0
    assigned_deleted = 0
    flags_deleted = 0
    sessions_deleted = 0

    if session_ids:
        answers_delete_res = await session.execute(
            text(
                """
                DELETE FROM candidate_answers
                WHERE session_id IN (
                  SELECT oa.session_id
                  FROM ongoing_assessments oa
                  WHERE oa.application_id = :application_id
                )
                """
            ).bindparams(
                bindparam("application_id", type_=pgUUID(as_uuid=True)),
            ),
            {"application_id": application_id},
        )
        answers_deleted = int(answers_delete_res.rowcount or 0)

        assigned_delete_res = await session.execute(
            text(
                """
                DELETE FROM candidate_assigned_questions
                WHERE session_id IN (
                  SELECT oa.session_id
                  FROM ongoing_assessments oa
                  WHERE oa.application_id = :application_id
                )
                """
            ).bindparams(
                bindparam("application_id", type_=pgUUID(as_uuid=True)),
            ),
            {"application_id": application_id},
        )
        assigned_deleted = int(assigned_delete_res.rowcount or 0)

        flags_delete_res = await session.execute(
            text(
                """
                DELETE FROM proctoring_flags
                WHERE application_id = :application_id
                  AND session_type = 'assessment'
                                    AND session_id IN (
                                        SELECT oa.session_id
                                        FROM ongoing_assessments oa
                                        WHERE oa.application_id = :application_id
                                    )
                """
            ).bindparams(
                bindparam("application_id", type_=pgUUID(as_uuid=True)),
            ),
            {
                "application_id": application_id,
            },
        )
        flags_deleted = int(flags_delete_res.rowcount or 0)

        sessions_delete_res = await session.execute(
            text(
                """
                DELETE FROM ongoing_assessments
                WHERE application_id = :application_id
                """
            ).bindparams(
                bindparam("application_id", type_=pgUUID(as_uuid=True)),
            ),
            {"application_id": application_id},
        )
        sessions_deleted = int(sessions_delete_res.rowcount or 0)

    progress_reset_res = await session.execute(
        text(
            """
            UPDATE candidate_pipeline_progress cpp
            SET status = 'unlocked',
                session_id = NULL,
                score = NULL,
                max_score = NULL,
                passed = NULL,
                unlocked_at = NOW(),
                started_at = NULL,
                completed_at = NULL
            WHERE cpp.application_id = :application_id
              AND cpp.stage_id IN (
                SELECT gps.stage_id
                FROM group_pipeline_stages gps
                WHERE gps.stage_type = 'assessment'
              )
            """
        ).bindparams(
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
        ),
        {"application_id": application_id},
    )
    progress_reset = int(progress_reset_res.rowcount or 0)

    await session.commit()

    return AssessmentResetResponse(
        application_id=application_id,
        sessions_deleted=sessions_deleted,
        answers_deleted=answers_deleted,
        assigned_questions_deleted=assigned_deleted,
        proctoring_flags_deleted=flags_deleted,
        progress_reset=progress_reset,
        message="Assessment trial reset. Candidate can start again from unlocked stage.",
    )


@router.get("/applications/{application_id}/score-breakdown", response_model=ApplicationScoreBreakdownResponse)
async def get_application_score_breakdown(
    application_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Get dedicated pre-score breakdown for one application."""
    service = RecruiterService(session, current_user)
    return await service.get_application_score_breakdown(application_id)


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
    result = await service.process_zip_upload(content, position_id)

    queued_jobs: list[tuple[str, str, str, str, list[dict]]] = []
    for created in result.created_candidates:
        profile_res = await session.execute(
            select(CandidateProfile).where(
                CandidateProfile.id == created.id,
                CandidateProfile.organization_id == current_user.organization_id,
                CandidateProfile.is_deleted == False,
            )
        )
        profile = profile_res.scalar_one_or_none()
        if not profile:
            continue

        app_res = await session.execute(
            select(CandidateApplication)
            .where(
                CandidateApplication.candidate_id == profile.id,
                CandidateApplication.organization_id == current_user.organization_id,
                CandidateApplication.is_deleted == False,
            )
            .order_by(CandidateApplication.applied_at.desc())
            .limit(1)
        )
        application = app_res.scalar_one_or_none()
        if not application:
            continue

        github_url = (profile.github_url or "").strip()
        if not github_url:
            cv_res = await session.execute(select(CVAnalysis).where(CVAnalysis.application_id == application.id))
            cv = cv_res.scalar_one_or_none()
            if cv and isinstance(cv.github_profile, dict):
                profile_obj = cv.github_profile.get("profile")
                if isinstance(profile_obj, dict):
                    github_url = str(profile_obj.get("html_url") or "").strip()

        cv_projects: list[dict] = []
        cv_res = await session.execute(select(CVAnalysis).where(CVAnalysis.application_id == application.id))
        cv = cv_res.scalar_one_or_none()
        if cv and isinstance(cv.parsed_data, dict):
            parsed = cv.parsed_data
            raw_projects = parsed.get("projects") if isinstance(parsed.get("projects"), list) else []
            for project in raw_projects[:12]:
                if not isinstance(project, dict):
                    continue
                name = str(project.get("name") or project.get("title") or "").strip()
                description = str(project.get("description") or project.get("summary") or "").strip()
                tech = project.get("technologies") or project.get("tools") or []
                technologies = [str(t).strip() for t in tech if str(t).strip()] if isinstance(tech, list) else []
                if name or description:
                    cv_projects.append({
                        "name": name,
                        "description": description,
                        "technologies": technologies,
                    })

        if not github_url:
            continue

        existing_job_res = await session.execute(
            select(GitHubAnalysisJob).where(
                GitHubAnalysisJob.organization_id == current_user.organization_id,
                GitHubAnalysisJob.candidate_id == profile.id,
                GitHubAnalysisJob.status.in_(["pending", "processing"]),
            )
        )
        if existing_job_res.scalar_one_or_none():
            continue

        position_res = await session.execute(select(Position).where(Position.id == application.position_id))
        position = position_res.scalar_one_or_none()
        jd_text = str((position.job_description or position.description or "") if position else "")

        job = GitHubAnalysisJob(
            organization_id=current_user.organization_id,
            candidate_id=profile.id,
            created_by_user_id=current_user.id,
            status="pending",
            github_url=github_url,
        )
        session.add(job)
        await session.flush()
        queued_jobs.append((str(job.id), str(profile.id), github_url, jd_text, cv_projects))

    await session.commit()

    for job_id, candidate_id, github_url, jd_text, cv_projects in queued_jobs:
        run_github_analysis.delay(
            job_id,
            candidate_id,
            str(current_user.organization_id),
            github_url,
            jd_text,
            "",
            10,
            cv_projects,
        )

    return result


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
