"""
Candidate endpoints.
"""
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import select

from app.api.deps import DbSession, CurrentUser
from app.services import CandidateService
from app.models import CandidateProfile, CandidateApplication, Position, CVAnalysis, GitHubAnalysis, GitHubAnalysisJob
from app.schemas import (
    CandidateCreate,
    CandidateUpdate,
    CandidateResponse,
    ApplicationCreate,
    ApplicationResponse,
)
from worker.tasks.github_analysis import run_github_analysis

router = APIRouter(prefix="/candidates", tags=["Candidates"])


class PersistSuspectArtifactsRequest(BaseModel):
    application_id: UUID | None = None
    suspicious_timestamps: list[int] = Field(default_factory=list)
    window_seconds: int = Field(default=5, ge=1, le=30)


class GitHubAnalysisReviewQuestion(BaseModel):
    questionText: str
    type: str = Field(default="essay")
    difficulty: str = Field(default="Medium")
    sourceFile: str | None = None
    referenceAnswer: str | None = None
    rubric: str | None = None
    rubricYesNoChecks: list[dict] = Field(default_factory=list)
    selectionReason: str | None = None
    jdRelation: str | None = None
    evidence: str | None = None
    selected: bool = True


class PersistGitHubAnalysisReviewRequest(BaseModel):
    review_notes: str | None = None
    questions: list[GitHubAnalysisReviewQuestion] = Field(default_factory=list)


async def _queue_github_analysis_job(
    *,
    session: DbSession,
    current_user: CurrentUser,
    candidate_id: UUID,
    questions_to_generate: int = 10,
):
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
    cv_projects: list[dict] = []

    if latest_app:
        cv_result = await session.execute(
            select(CVAnalysis).where(CVAnalysis.application_id == latest_app.id)
        )
        cv = cv_result.scalar_one_or_none()
        if cv and isinstance(cv.github_profile, dict):
            profile_obj = cv.github_profile.get("profile")
            if isinstance(profile_obj, dict):
                github_url = github_url or profile_obj.get("html_url")

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

        pos_result = await session.execute(select(Position).where(Position.id == latest_app.position_id))
        position = pos_result.scalar_one_or_none()
        if position:
            jd_text = str(position.job_description or position.description or "")

    if not github_url:
        raise HTTPException(status_code=422, detail="Candidate has no GitHub URL to analyze")

    questions_to_generate = max(1, min(int(questions_to_generate or 10), 30))

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

    existing_job_result = await session.execute(
        select(GitHubAnalysisJob).where(
            GitHubAnalysisJob.organization_id == current_user.organization_id,
            GitHubAnalysisJob.candidate_id == candidate_id,
            GitHubAnalysisJob.status.in_(["pending", "processing"]),
        )
    )
    existing_job = existing_job_result.scalar_one_or_none()
    if existing_job:
        return {
            "job_id": str(existing_job.id),
            "status": existing_job.status,
            "message": "GitHub analysis job already running",
        }

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
        "",
        questions_to_generate,
        cv_projects,
    )

    return {
        "job_id": str(job.id),
        "status": "pending",
        "message": "GitHub analysis job queued",
    }


@router.post("/{candidate_id}/github-analysis/review")
async def persist_github_analysis_review(
    candidate_id: UUID,
    data: PersistGitHubAnalysisReviewRequest,
    session: DbSession,
    current_user: CurrentUser,
):
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

    github_res = await session.execute(
        select(GitHubAnalysis).where(
            GitHubAnalysis.candidate_id == candidate_id,
            GitHubAnalysis.organization_id == current_user.organization_id,
        )
    )
    github = github_res.scalar_one_or_none()
    if not github:
        raise HTTPException(status_code=404, detail="GitHub analysis record not found")

    analysis_data = github.analysis_data if isinstance(github.analysis_data, dict) else {}
    synthesis = analysis_data.get("synthesis") if isinstance(analysis_data.get("synthesis"), dict) else {}

    normalized_questions = []
    for item in data.questions:
        normalized_questions.append(
            {
                "question": item.questionText,
                "question_text": item.questionText,
                "type": item.type,
                "question_type": item.type,
                "difficulty": item.difficulty,
                "source_file": item.sourceFile or "",
                "reference_answer": item.referenceAnswer or "",
                "rubric": item.rubric or "",
                "rubric_yes_no_checks": item.rubricYesNoChecks if isinstance(item.rubricYesNoChecks, list) else [],
                "selection_reason": item.selectionReason or "",
                "jd_relation": item.jdRelation or "",
                "evidence": item.evidence or "",
                "selected": item.selected,
            }
        )

    reviewed_count = sum(1 for item in data.questions if item.selected)
    review_payload = {
        "questions": normalized_questions,
        "selected_count": reviewed_count,
        "total_count": len(normalized_questions),
        "review_notes": data.review_notes,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by_user_id": str(getattr(current_user, "id", None) or getattr(current_user, "user_id", "")),
    }

    analysis_data["question_review"] = review_payload
    if isinstance(synthesis, dict):
        synthesis.setdefault("questions", synthesis.get("questions") if isinstance(synthesis.get("questions"), list) else [])
        analysis_data["synthesis"] = synthesis

    github.analysis_data = analysis_data
    github.generated_questions = normalized_questions
    github.analyzed_at = datetime.utcnow()
    session.add(github)

    latest_job_result = await session.execute(
        select(GitHubAnalysisJob)
        .where(
            GitHubAnalysisJob.organization_id == current_user.organization_id,
            GitHubAnalysisJob.candidate_id == candidate_id,
            GitHubAnalysisJob.status == "completed",
        )
        .order_by(GitHubAnalysisJob.created_at.desc())
        .limit(1)
    )
    latest_job = latest_job_result.scalar_one_or_none()
    if latest_job:
        latest_job.generated_questions = normalized_questions
        latest_job.total_generated = len(normalized_questions)
        session.add(latest_job)

    await session.commit()

    return {
        "message": "GitHub analysis review saved",
        "candidate_id": str(candidate_id),
        "selected_count": reviewed_count,
        "total_count": len(normalized_questions),
    }


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
    existing_result = await session.execute(
        select(CandidateProfile).where(
            CandidateProfile.id == candidate_id,
            CandidateProfile.organization_id == current_user.organization_id,
            CandidateProfile.is_deleted == False,
        )
    )
    existing_profile = existing_result.scalar_one_or_none()
    previous_github_url = (existing_profile.github_url or "").strip() if existing_profile else ""

    updated = await service.update_profile(candidate_id, data)

    new_github_url = (updated.github_url or "").strip() if updated else ""
    github_url_just_added = bool(new_github_url and not previous_github_url)
    if github_url_just_added:
        try:
            await _queue_github_analysis_job(
                session=session,
                current_user=current_user,
                candidate_id=candidate_id,
            )
        except HTTPException:
            pass

    return updated


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
@router.get("/{candidate_id}/suspect-review", response_model=dict)
async def get_suspect_review(
    candidate_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
    application_id: UUID | None = Query(default=None),
):
    """Get suspect review activities for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.get_suspect_review(candidate_id, application_id)


@router.post("/{candidate_id}/suspect-review/decompression-artifacts", response_model=dict)
async def persist_suspect_review_artifacts(
    candidate_id: UUID,
    data: PersistSuspectArtifactsRequest,
    session: DbSession,
    current_user: CurrentUser,
):
    """Persist decompressed suspect segments as review artifacts linked to proctoring flags."""
    service = CandidateService(session, current_user.organization_id)
    reviewer_user_id = getattr(current_user, "id", None) or getattr(current_user, "user_id", None)
    if reviewer_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid authenticated recruiter context")

    return await service.persist_suspect_review_artifacts(
        candidate_id=candidate_id,
        reviewer_user_id=reviewer_user_id,
        suspicious_timestamps=data.suspicious_timestamps,
        application_id=data.application_id,
        window_seconds=data.window_seconds,
    )

@router.post("/{candidate_id}/github-analysis/start")
async def start_github_analysis(
    candidate_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
):
    """Queue GitHub profile analysis + GitHub-inspired question generation as background task."""
    return await _queue_github_analysis_job(
        session=session,
        current_user=current_user,
        candidate_id=candidate_id,
        questions_to_generate=10,
    )
