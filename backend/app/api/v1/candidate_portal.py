"""
Candidate Portal Routes.

Endpoints for candidate login, dashboard, and assessments.
These are used by the candidate-portal frontend.
"""

from fastapi import APIRouter
from sqlmodel import select

from app.api.deps import DbSession, CurrentCandidate
from app.services import CandidateAuthService
from app.schemas import (
    CandidateLoginRequest,
    CandidateAuthResponse,
    TokenResponse,
    RefreshRequest,
)
from app.models import (
    LiV2Session,
    LiV2Evaluation,
    CandidateApplication,
    CandidateGroup,
    CandidateProfile,
    Position,
    GroupStageConfig,
    CandidateStageProgress,
)

router = APIRouter(prefix="/candidate", tags=["Candidate Portal"])


# =============================================================================
# AUTHENTICATION
# =============================================================================


@router.post("/login", response_model=TokenResponse)
async def candidate_login(data: CandidateLoginRequest, session: DbSession):
    """
    Candidate login with email and password.

    Returns access and refresh tokens.
    """
    service = CandidateAuthService(session)
    return await service.login(data.email, data.password)


@router.post("/refresh", response_model=TokenResponse)
async def candidate_refresh(data: RefreshRequest, session: DbSession):
    """
    Refresh candidate access token.
    """
    service = CandidateAuthService(session)
    return await service.refresh_tokens(data.refresh_token)


@router.get("/me", response_model=CandidateAuthResponse)
async def get_candidate_me(candidate: CurrentCandidate):
    """
    Get current authenticated candidate profile.
    """
    return candidate


# =============================================================================
# DASHBOARD
# =============================================================================


@router.get("/home")
async def get_candidate_home(candidate: CurrentCandidate, session: DbSession):
    """
    Get candidate dashboard home data.

    Returns:
        - Candidate profile
        - Current application status
        - Group info
        - Current stage info
    """
    from app.services.candidates import CandidateDashboardService

    service = CandidateDashboardService(session)
    return await service.get_home(candidate.candidate_id)


@router.get("/assessments")
async def get_candidate_assessments(candidate: CurrentCandidate, session: DbSession):
    """
    Get available assessments/stages for the candidate.

    Returns list of stages with their status (locked, unlocked, in_progress, completed).
    """
    from app.services.candidates import CandidateDashboardService

    service = CandidateDashboardService(session)
    return await service.get_assessments(candidate.candidate_id)


@router.post("/stages/{stage_type}/start")
async def start_candidate_stage(
    stage_type: str, candidate: CurrentCandidate, session: DbSession
) -> dict:
    # placeholder for now, but will be used to go to details of a stage

    # Map stage types to frontend routes
    route_map = {
        "assessment": "/assessment/technical",
        "ai_interview": "/assessment/recorded",
        "live_interview": "/assessment/live",
    }

    redirect_url = route_map.get(
        stage_type, f"/assessment/{stage_type.replace('_', '-')}"
    )

    return {
        "message": f"Starting {stage_type.replace('_', ' ')} stage",
        "stage_type": stage_type,
        "redirect_url": redirect_url,
        "status": "pending_implementation",
        "candidate_id": str(candidate.candidate_id),
    }


# =============================================================================
# LIVE INTERVIEW V2 — CANDIDATE MONITORING
# =============================================================================


@router.get("/live-interview-v2/session")
async def get_candidate_live_interview(
    current_user: CurrentCandidate,
    db: DbSession,
):
    """
    Returns the candidate's own LiV2 session with evaluation if complete.

    Handles three states:
    - No session yet → null session/evaluation
    - Session completed but evaluation pending → session data + status "grading"
    - Evaluation complete → full session + evaluation data
    """
    app_stmt = (
        select(CandidateApplication)
        .join(GroupStageConfig, GroupStageConfig.group_id == CandidateApplication.group_id)
        .join(
            CandidateStageProgress,
            (CandidateStageProgress.application_id == CandidateApplication.id)
            & (CandidateStageProgress.stage_id == GroupStageConfig.stage_id),
        )
        .where(
            CandidateApplication.candidate_id == current_user.candidate_id,
            CandidateApplication.organization_id == current_user.organization_id,
            CandidateApplication.is_deleted == False,
            GroupStageConfig.stage_type == "live_interview",
            GroupStageConfig.state == "active",
        )
        .order_by(CandidateStageProgress.unlocked_at.desc().nullslast())
    )
    app_result = await db.execute(app_stmt)
    application = app_result.scalars().first()

    if not application:
        return _empty_response()

    session_stmt = (
        select(LiV2Session)
        .where(LiV2Session.application_id == application.id)
        .order_by(LiV2Session.created_at.desc())
        .limit(1)
    )
    session_result = await db.execute(session_stmt)
    liv2_session = session_result.scalar_one_or_none()

    if not liv2_session:
        return _empty_response()

    eval_stmt = select(LiV2Evaluation).where(
        LiV2Evaluation.session_id == liv2_session.id
    )
    eval_result = await db.execute(eval_stmt)
    evaluation = eval_result.scalar_one_or_none()

    group_stmt = select(CandidateGroup).where(CandidateGroup.id == application.group_id)
    group_result = await db.execute(group_stmt)
    group = group_result.scalar_one_or_none()

    position_stmt = select(Position).where(Position.id == application.position_id)
    position_result = await db.execute(position_stmt)
    position = position_result.scalar_one_or_none()

    position_name = position.job_title if position else ""
    group_name = group.group_name if group else ""

    profile_stmt = select(CandidateProfile).where(
        CandidateProfile.candidate_id == current_user.candidate_id
    )
    profile_result = await db.execute(profile_stmt)
    profile = profile_result.scalar_one_or_none()
    candidate_name = profile.full_name if profile else ""

    eval_data = None
    status = None
    estimated_time = None

    if evaluation and evaluation.judged_at:
        eval_data = {
            "overall_score_pct": evaluation.overall_score_pct,
            "auto_verdict": evaluation.auto_verdict,
            "meets_criteria": evaluation.meets_criteria,
            "coverage_ratio": float(evaluation.coverage_ratio)
            if evaluation.coverage_ratio
            else None,
            "dimension_scores": evaluation.dimension_scores or {},
            "evaluation_confidence": evaluation.evaluation_confidence,
            "judged_at": evaluation.judged_at.isoformat()
            if evaluation.judged_at
            else None,
        }
    elif liv2_session.state == "completed":
        status = "grading"
        estimated_time = "~30 seconds remaining"

    transcript = liv2_session.transcript or []
    return {
        "session_id": str(liv2_session.id),
        "candidate_name": candidate_name,
        "state": liv2_session.state,
        "transcript": transcript,
        "transcript_turns": len(transcript),
        "duration_seconds": liv2_session.duration_seconds,
        "started_at": liv2_session.started_at.isoformat()
        if liv2_session.started_at
        else None,
        "ended_at": liv2_session.ended_at.isoformat()
        if liv2_session.ended_at
        else None,
        "evaluation": eval_data,
        "position_name": position_name,
        "group_name": group_name,
        "status": status,
        "estimated_time": estimated_time,
    }


def _empty_response() -> dict:
    return {
        "session_id": None,
        "candidate_name": "",
        "state": None,
        "transcript": None,
        "transcript_turns": 0,
        "duration_seconds": None,
        "started_at": None,
        "ended_at": None,
        "evaluation": None,
        "position_name": "",
        "group_name": "",
        "status": None,
        "estimated_time": None,
    }
