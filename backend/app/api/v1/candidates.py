"""
Candidate endpoints.
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import DbSession, CurrentUser
from app.services import CandidateService
from app.models import CandidateProfile, CandidateApplication, Position, CVAnalysis, GitHubAnalysisJob
from app.schemas import (
    CandidateCreate,
    CandidateUpdate,
    CandidateResponse,
    ApplicationCreate,
    ApplicationResponse,
)
from worker.tasks.github_analysis import run_github_analysis

router = APIRouter(prefix="/candidates", tags=["Candidates"])


class GitHubAnalysisStartRequest(BaseModel):
    github_token: str | None = None
    questions_to_generate: int | None = None


@router.post("", response_model=CandidateResponse, status_code=201)
async def create_candidate(
    data: CandidateCreate, session: DbSession, current_user: CurrentUser
):
    """Create a new candidate profile."""
    service = CandidateService(session, current_user.organization_id)
    return await service.create_profile(data)


@router.get("", response_model=list[CandidateResponse])
async def list_candidates(
    session: DbSession,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
):
    """List all candidates."""
    service = CandidateService(session, current_user.organization_id)
    return await service.list_profiles(skip=skip, limit=limit)


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get a candidate by ID."""
    service = CandidateService(session, current_user.organization_id)
    candidate = await service.get_profile(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    print("--- RAW BACKEND PAYLOAD ---")
    print(f"filtrationFlow: {candidate.filtrationFlow}")
    print(f"groupAssigned: {candidate.groupAssigned}")
    print(f"pipelineStatus: {candidate.pipelineStatus}")
    
    return candidate


@router.patch("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: UUID,
    data: CandidateUpdate,
    session: DbSession,
    current_user: CurrentUser,
):
    """Update a candidate profile."""
    service = CandidateService(session, current_user.organization_id)
    return await service.update_profile(candidate_id, data)


# =============================================================================
# APPLICATION ENDPOINTS
# =============================================================================


@router.post(
    "/{candidate_id}/applications",
    response_model=ApplicationResponse,
    status_code=201,
)
async def create_application(
    candidate_id: UUID,
    data: ApplicationCreate,
    session: DbSession,
    current_user: CurrentUser,
):
    """Create an application for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.create_application(candidate_id, data)


@router.get(
    "/{candidate_id}/applications",
    response_model=list[ApplicationResponse],
)
async def list_candidate_applications(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """List applications for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.list_applications_by_candidate(candidate_id)
@router.get("/{candidate_id}/suspect-review", response_model=list[dict])
async def get_suspect_review(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get suspect review activities for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.get_suspect_review(candidate_id)


@router.get("/{candidate_id}/knowledge-graph", response_model=dict)
async def get_knowledge_graph(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get knowledge graph data for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.get_knowledge_graph(candidate_id)


@router.post("/{candidate_id}/github-analysis/start")
async def start_github_analysis(
    candidate_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
    payload: GitHubAnalysisStartRequest | None = None,
):
    """Queue GitHub profile analysis + GitHub-inspired question generation as background task."""
    profile_result = await session.execute(
        select(CandidateProfile).where(
            CandidateProfile.id == candidate_id,
            CandidateProfile.organization_id == current_user.organization_id,
            CandidateProfile.is_deleted == False,
        )
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate not found")

    latest_app_result = await session.execute(
        select(CandidateApplication)
        .where(
            CandidateApplication.candidate_id == candidate_id,
            CandidateApplication.organization_id == current_user.organization_id,
            CandidateApplication.is_deleted == False,
        )
        .order_by(CandidateApplication.applied_at.desc())
        .limit(1)
    )
    latest_app = latest_app_result.scalar_one_or_none()

    github_url = profile.github_url
    jd_text = ""

    if latest_app:
        cv_result = await session.execute(
            select(CVAnalysis).where(CVAnalysis.application_id == latest_app.id)
        )
        cv = cv_result.scalar_one_or_none()
        if cv and isinstance(cv.github_profile, dict):
            profile_obj = cv.github_profile.get("profile")
            if isinstance(profile_obj, dict):
                github_url = github_url or profile_obj.get("html_url")

        pos_result = await session.execute(select(Position).where(Position.id == latest_app.position_id))
        position = pos_result.scalar_one_or_none()
        if position:
            jd_text = str(position.job_description or position.description or "")

    if not github_url:
        raise HTTPException(status_code=422, detail="Candidate has no GitHub URL to analyze")

    github_token = (payload.github_token or "").strip() if payload else ""
    questions_to_generate = int(payload.questions_to_generate or 10) if payload else 10
    questions_to_generate = max(1, min(questions_to_generate, 30))

    current_user_id = getattr(current_user, "id", None) or getattr(current_user, "user_id", None)
    if not current_user_id:
        dumped = {}
        try:
            dumped = current_user.model_dump(by_alias=True)
        except Exception:
            dumped = {}
        current_user_id = dumped.get("user_id") or dumped.get("id")
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid authenticated user context")

    job = GitHubAnalysisJob(
        organization_id=current_user.organization_id,
        candidate_id=candidate_id,
        created_by_user_id=current_user_id,
        status="pending",
        github_url=github_url,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    run_github_analysis.delay(
        str(job.id),
        str(candidate_id),
        str(current_user.organization_id),
        github_url,
        jd_text,
        github_token,
        questions_to_generate,
    )

    return {
        "job_id": str(job.id),
        "status": "pending",
        "message": "GitHub analysis job queued",
    }
