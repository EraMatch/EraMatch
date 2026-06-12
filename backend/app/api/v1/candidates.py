"""
Candidate endpoints.
"""
import math
import re
from typing import Literal
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import select

from app.api.deps import DbSession, CurrentUser
from app.services import CandidateService
from app.models import CandidateProfile, CandidateApplication, Position, CVAnalysis, GitHubAnalysis, GitHubAnalysisJob, GroupStageConfig
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
    questions_to_generate: int | None = None,
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

    # If no count was explicitly provided, look it up from the group's assessment stage config
    if questions_to_generate is None and latest_app and latest_app.group_id:
        try:
            stage_result = await session.execute(
                select(GroupStageConfig).where(
                    GroupStageConfig.group_id == latest_app.group_id,
                    GroupStageConfig.stage_type == "assessment",
                )
            )
            stage_cfg = stage_result.scalar_one_or_none()
            if stage_cfg and isinstance(stage_cfg.acceptance_criteria, dict):
                questions_to_generate = int(
                    stage_cfg.acceptance_criteria.get("github_questions_count") or 10
                )
        except Exception:
            pass

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
    )

@router.post("/{candidate_id}/github-analysis/reanalyze")
async def reanalyze_github_profile(
    candidate_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
):
    """Force reanalysis of GitHub profile by queuing a new analysis job."""
    return await _queue_github_analysis_job(
        session=session,
        current_user=current_user,
        candidate_id=candidate_id,
    )


# ---------------------------------------------------------------------------
# Semantic / Keyword / Hybrid Search
# ---------------------------------------------------------------------------

class SearchCandidatePair(BaseModel):
    candidate_id: UUID   # CandidateProfile.id — returned as ranked id
    application_id: UUID  # CandidateApplication.id — used to look up CVAnalysis


class CandidateSearchRequest(BaseModel):
    query: str
    mode: Literal["keyword", "semantic", "hybrid"] = "keyword"
    candidates: list[SearchCandidatePair]


class CandidateSearchResponse(BaseModel):
    ranked_ids: list[str]         # candidate profile ids, ordered best → worst
    scores: dict[str, float]      # candidate_id (str) → normalized score 0..1
    mode_used: str


def _cosine_sim(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _kw_score(tokens: list[str], cv: CVAnalysis, query: str) -> float:
    """Port of frontend getSemanticScore() — token hit-rate across weighted fields."""
    if not tokens:
        return 0.0
    parsed = cv.parsed_data or {}

    skills_text = " ".join(cv.skills or []).lower()

    work_exp = parsed.get("work_experience") or []
    titles_text = " ".join(
        str(j.get("job_title") or j.get("title") or j.get("position") or "")
        for j in work_exp if isinstance(j, dict)
    ).lower()
    companies_text = " ".join(
        str(j.get("company") or j.get("organization") or "")
        for j in work_exp if isinstance(j, dict)
    ).lower()

    education = parsed.get("education") or []
    edu_text = " ".join(
        str(e.get("institution") or e.get("university") or e.get("school") or "") + " " +
        str(e.get("degree") or e.get("qualification") or "")
        for e in education if isinstance(e, dict)
    ).lower()

    location_text = str(parsed.get("location") or "").lower()

    def score_field(text: str, weight: float) -> float:
        if not text:
            return 0.0
        hits = sum(1 for t in tokens if t in text)
        return (hits / len(tokens)) * weight

    score = (
        score_field(skills_text, 40) +
        score_field(titles_text, 20) +
        score_field(companies_text, 12) +
        score_field(location_text, 10) +
        score_field(edu_text, 8)
    )

    m = re.search(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)", query, re.IGNORECASE)
    if m:
        target = int(m.group(1))
        exp = float(cv.experience_years or 0)
        score += 10 if exp >= target else max(0.0, (exp / max(target, 1)) * 10)

    return min(100.0, score)


@router.post("/search", response_model=CandidateSearchResponse)
async def search_candidates(
    body: CandidateSearchRequest,
    session: DbSession,
    current_user: CurrentUser,
):
    """Rank candidates by keyword, Jina semantic embeddings, or a hybrid blend."""
    if not body.candidates:
        return CandidateSearchResponse(ranked_ids=[], scores={}, mode_used=body.mode)

    app_ids = [p.application_id for p in body.candidates]
    app_to_profile = {p.application_id: p.candidate_id for p in body.candidates}

    stmt = (
        select(CVAnalysis)
        .join(CandidateApplication, CVAnalysis.application_id == CandidateApplication.id)
        .where(
            CVAnalysis.application_id.in_(app_ids),
            CandidateApplication.organization_id == current_user.organization_id,
        )
    )
    result = await session.execute(stmt)
    cv_map: dict[UUID, CVAnalysis] = {cv.application_id: cv for cv in result.scalars().all()}

    profile_ids = [str(p.candidate_id) for p in body.candidates]
    tokens = [t for t in body.query.lower().split() if len(t) > 1]
    RRF_K = 60

    # ── Keyword scores (always computed) ──────────────────────────────────────
    kw_scores: dict[str, float] = {
        str(pair.candidate_id): _kw_score(tokens, cv_map[pair.application_id], body.query)
        if pair.application_id in cv_map else 0.0
        for pair in body.candidates
    }

    # ── Semantic scores via Jina ───────────────────────────────────────────────
    sem_scores: dict[str, float] = {}
    mode_used = body.mode

    if body.mode in ("semantic", "hybrid"):
        from app.core.config import settings as _settings
        import httpx as _httpx
        import logging as _logging

        stored = {
            str(app_to_profile[aid]): cv_map[aid].profile_embedding
            for aid in app_ids
            if aid in cv_map and cv_map[aid].profile_embedding
        }
        if not stored:
            mode_used = "keyword"
        else:
            try:
                async with _httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(
                        f"{_settings.AI_SERVICE_URL.rstrip('/')}/llm/embed",
                        headers={"Content-Type": "application/json"},
                        json={"input": [body.query]},
                    )
                    resp.raise_for_status()
                    embeddings = resp.json().get("embeddings", [])
                    if not embeddings:
                        raise ValueError("Empty embeddings response from ai-service")
                    query_vec: list[float] = embeddings[0]

                for pid, emb in stored.items():
                    sem_scores[pid] = _cosine_sim(query_vec, emb) * 100

                for pair in body.candidates:
                    pid = str(pair.candidate_id)
                    if pid not in sem_scores:
                        sem_scores[pid] = kw_scores.get(pid, 0.0)

            except Exception as exc:
                mode_used = "keyword"
                _logging.getLogger(__name__).warning(f"[Search] Embedding via ai-service failed: {exc}")

    # ── Build final ranking ────────────────────────────────────────────────────
    def rrf(ranked: list[str]) -> dict[str, float]:
        return {cid: 1 / (RRF_K + rank + 1) for rank, cid in enumerate(ranked)}

    if mode_used == "keyword":
        final = sorted(profile_ids, key=lambda p: kw_scores.get(p, 0), reverse=True)
        raw_scores = kw_scores
    elif mode_used == "semantic":
        final = sorted(profile_ids, key=lambda p: sem_scores.get(p, 0), reverse=True)
        raw_scores = sem_scores
    else:  # hybrid
        kw_ranked = sorted(profile_ids, key=lambda p: kw_scores.get(p, 0), reverse=True)
        sem_ranked = sorted(profile_ids, key=lambda p: sem_scores.get(p, 0), reverse=True)
        rrf_scores = {
            p: rrf(kw_ranked).get(p, 0) + rrf(sem_ranked).get(p, 0)
            for p in profile_ids
        }
        final = sorted(profile_ids, key=lambda p: rrf_scores[p], reverse=True)
        raw_scores = rrf_scores

    max_s = max(raw_scores.values(), default=1) or 1
    normalized = {k: v / max_s for k, v in raw_scores.items()}

    return CandidateSearchResponse(ranked_ids=final, scores=normalized, mode_used=mode_used)


# ---------------------------------------------------------------------------
# Embedding Backfill
# ---------------------------------------------------------------------------

class BackfillEmbeddingsResponse(BaseModel):
    total: int          # cv_analysis rows with no embedding found
    succeeded: int
    failed: int
    skipped: int        # rows where profile text was empty


@router.post("/backfill-embeddings", response_model=BackfillEmbeddingsResponse)
async def backfill_embeddings(
    session: DbSession,
    current_user: CurrentUser,
):
    """
    Generate and store Jina profile embeddings for all cv_analysis rows that
    belong to this organisation and currently have profile_embedding = NULL.
    Call once after deploying the embedding feature to catch previously-parsed CVs.
    """
    from app.core.config import settings as _settings
    import httpx as _httpx
    import logging as _logging
    import asyncio as _asyncio

    _log = _logging.getLogger(__name__)

    # Fetch all cv_analysis rows scoped to this org that lack an embedding
    stmt = (
        select(CVAnalysis)
        .join(CandidateApplication, CVAnalysis.application_id == CandidateApplication.id)
        .where(
            CandidateApplication.organization_id == current_user.organization_id,
            CVAnalysis.profile_embedding.is_(None),
        )
    )
    result = await session.execute(stmt)
    rows: list[CVAnalysis] = list(result.scalars().all())

    total = len(rows)
    succeeded = failed = skipped = 0

    from app.services.cv_parsing import _build_profile_text

    for cv in rows:
        parsed = cv.parsed_data or {}

        work_history = cv.work_history or parsed.get("work_experience")
        education = cv.education or parsed.get("education")
        skills = cv.skills or parsed.get("skills") or []
        if isinstance(skills, list) and skills and isinstance(skills[0], str):
            skills_list = skills
        else:
            skills_list = []

        profile_text = _build_profile_text(
            skills_list,
            cv.experience_years,
            work_history,
            education,
        )

        if not profile_text:
            skipped += 1
            continue

        try:
            async with _httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_settings.AI_SERVICE_URL.rstrip('/')}/llm/embed",
                    headers={"Content-Type": "application/json"},
                    json={"input": [profile_text]},
                )
                resp.raise_for_status()
                embeddings = resp.json().get("embeddings", [])
                if not embeddings:
                    raise ValueError("Empty embeddings response")
                cv.profile_embedding = embeddings[0]
                session.add(cv)
            succeeded += 1
        except Exception as exc:
            _log.warning(f"[Backfill] Failed to embed cv_analysis {cv.id}: {exc}")
            failed += 1

        # Flush every 10 rows to avoid huge transactions
        if (succeeded + failed) % 10 == 0:
            try:
                await session.commit()
            except Exception:
                await session.rollback()

    try:
        await session.commit()
    except Exception:
        await session.rollback()

    return BackfillEmbeddingsResponse(
        total=total, succeeded=succeeded, failed=failed, skipped=skipped
    )
