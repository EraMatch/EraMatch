from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import List, Optional
from uuid import UUID

from app.api.deps import DbSession, CurrentUser, CurrentCandidate
from app.schemas.live_interview_v2 import (
    RubricCreate, RubricUpdate, RubricResponse, RubricDimension,
    BankCreate, BankUpdate, BankResponse,
    DimensionSuggestionRequest, DimensionSuggestionResponse,
    AnchorGenerationRequest, BankGenerationRequest, FreezeResponse
)
from app.services.live_interview.rubric import (
    suggest_dimensions_service, generate_anchors_service,
    create_rubric_service, get_rubric_service, freeze_rubric_service
)
from app.services.live_interview.bank import (
    generate_bank_service, create_bank_service,
    get_bank_service, freeze_bank_service
)
from app.services.live_interview.token import generate_session_token_service
from app.services.live_interview.session import (
    complete_session_service, get_session_with_evaluation
)
from pydantic import BaseModel as PydanticBaseModel


router = APIRouter()

# --- Rubric Endpoints ---

@router.post("/rubric/suggest-dimensions", response_model=DimensionSuggestionResponse)
async def suggest_dimensions(
    request: DimensionSuggestionRequest,
    db: DbSession,
    current_user: CurrentUser
):
    """M0: Analyze job description to suggest scoring dimensions."""
    return await suggest_dimensions_service(db, request.group_id)

@router.post("/rubric/generate-anchors", response_model=List[RubricDimension])
async def generate_anchors(
    request: AnchorGenerationRequest,
    db: DbSession,
    current_user: CurrentUser
):
    """M_RUBRIC: Generate behavioral anchors for selected dimensions."""
    # We need the job description. User provides dimensions list.
    return await generate_anchors_service(request.dimensions, request.job_description or "")

@router.post("/rubric", response_model=RubricResponse)
async def create_rubric(
    rubric_in: RubricCreate,
    db: DbSession,
    current_user: CurrentUser
):
    """Save a draft rubric for a group."""
    return await create_rubric_service(db, rubric_in)

@router.get("/rubric/group/{group_id}", response_model=RubricResponse)
async def get_rubric_by_group(
    group_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Retrieve the rubric (draft or frozen) for a group."""
    return await get_rubric_service(db, group_id)

@router.put("/rubric/{rubric_id}", response_model=RubricResponse)
async def update_rubric(
    rubric_id: UUID,
    rubric_in: RubricUpdate,
    db: DbSession,
    current_user: CurrentUser,
):
    """Update a draft rubric (dimensions only)."""
    from sqlmodel import select
    from app.models import LiV2Rubric
    res = await db.execute(select(LiV2Rubric).where(LiV2Rubric.rubric_id == rubric_id))
    rubric = res.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    from app.schemas.live_interview_v2 import RubricCreate
    updated_in = RubricCreate(
        group_id=rubric.group_id,
        organization_id=rubric.organization_id,
        dimensions=rubric_in.dimensions or [],
        time_budget_minutes=rubric.time_budget_minutes,
        language=rubric.language,
        include_weak_topics=rubric.include_weak_topics,
    )
    return await create_rubric_service(db, updated_in)


class RubricSettingsIn(PydanticBaseModel):
    """Payload for PATCH /rubric/{id}/settings — updates config-only fields before freeze."""
    include_weak_topics: Optional[bool] = None
    language: Optional[str] = None
    time_budget_minutes: Optional[int] = None


@router.put("/rubric/{rubric_id}/settings")
async def update_rubric_settings(
    rubric_id: UUID,
    settings: RubricSettingsIn,
    db: DbSession,
    current_user: CurrentUser,
):
    """
    Update only the interview config settings (NOT dimensions or anchors).
    Can be called right before freeze, including from the FreezeConfirmation step.
    """
    from sqlmodel import select
    from app.models import LiV2Rubric
    res = await db.execute(select(LiV2Rubric).where(LiV2Rubric.rubric_id == rubric_id))
    rubric = res.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    if rubric.state == "frozen":
        raise HTTPException(status_code=400, detail="Cannot update a frozen rubric")

    if settings.include_weak_topics is not None:
        rubric.include_weak_topics = settings.include_weak_topics
    if settings.language is not None:
        rubric.language = settings.language
    if settings.time_budget_minutes is not None:
        rubric.time_budget_minutes = settings.time_budget_minutes

    db.add(rubric)
    await db.commit()
    await db.refresh(rubric)
    return {"success": True, "rubric_id": str(rubric_id)}

@router.post("/rubric/{rubric_id}/freeze", response_model=RubricResponse)
async def freeze_rubric(
    rubric_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Validate and freeze a rubric (locking it from further edits)."""
    return await freeze_rubric_service(db, rubric_id)

# --- Question Bank Endpoints ---

@router.post("/bank/generate", response_model=BankCreate)
async def generate_bank(
    request: BankGenerationRequest,
    db: DbSession,
    current_user: CurrentUser
):
    """M_BANK: Generate a question bank based on a frozen rubric."""
    return await generate_bank_service(db, request.rubric_id)

@router.post("/bank", response_model=BankResponse)
async def create_bank(
    bank_in: BankCreate,
    db: DbSession,
    current_user: CurrentUser
):
    """Save a draft question bank for a group."""
    return await create_bank_service(db, bank_in)

@router.get("/bank/group/{group_id}", response_model=BankResponse)
async def get_bank_by_group(
    group_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Retrieve the question bank (draft or frozen) for a group."""
    return await get_bank_service(db, group_id)

@router.put("/bank/{bank_id}", response_model=BankResponse)
async def update_bank(
    bank_id: UUID,
    bank_in: BankUpdate,
    db: DbSession,
    current_user: CurrentUser
):
    """Update a draft question bank."""
    from sqlmodel import select
    from app.models import LiV2Bank
    res = await db.execute(select(LiV2Bank).where(LiV2Bank.bank_id == bank_id))
    bank = res.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank not found")
        
    updated_in = BankCreate(
        group_id=bank.group_id,
        organization_id=bank.organization_id,
        items=bank_in.items or []
    )
    return await create_bank_service(db, updated_in)

@router.post("/bank/{bank_id}/freeze", response_model=BankResponse)
async def freeze_bank(
    bank_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Validate and freeze a question bank."""
    return await freeze_bank_service(db, bank_id)


# --- Candidate Session Endpoints ---

class SessionTokenResponse(APIRouter):
    token: str
    url: str
    room_name: str
    session_id: str


from pydantic import BaseModel as PydanticBaseModel

class SessionTokenOut(PydanticBaseModel):
    token: str
    url: str
    room_name: str
    session_id: str


@router.get("/session/token", response_model=SessionTokenOut)
async def get_session_token(
    db: DbSession,
    current_candidate: CurrentCandidate,
):
    """
    Candidate endpoint: generate a LiveKit room token for the live interview.

    The backend will:
    1. Verify the candidate's group has a frozen question bank.
    2. Create (or reuse) a LiV2Session record.
    3. Return a signed LiveKit JWT so the candidate can join the room.
    4. Dispatch the EraMatch Interviewer agent to the room.
    """
    from sqlmodel import select
    from app.models import CandidateApplication

    # CandidateProfile doesn't carry application_id — look it up from the application table
    app_result = await db.execute(
        select(CandidateApplication).where(
            CandidateApplication.candidate_id == current_candidate.candidate_id
        )
    )
    application = app_result.scalars().first()
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No application found for this candidate.",
        )

    return await generate_session_token_service(
        db=db,
        application_id=application.id,
        candidate_id=current_candidate.candidate_id,
        organization_id=current_candidate.organization_id,
    )


# ---------------------------------------------------------------------------
# Session Completion (called by agent on_shutdown)
# ---------------------------------------------------------------------------

class SessionCompleteIn(PydanticBaseModel):
    """Payload from the LiveKit agent when the interview ends."""
    transcript: list[dict]


class SessionCompleteOut(PydanticBaseModel):
    status: str
    session_id: str
    duration_seconds: Optional[int] = None
    transcript_turns: Optional[int] = None


@router.post("/session/{session_id}/complete", response_model=SessionCompleteOut)
async def complete_session(
    session_id: UUID,
    payload: SessionCompleteIn,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """
    Called by the LiveKit Interviewer Agent on shutdown.
    Saves the transcript, transitions state to 'completed', and
    enqueues the Judge Agent pipeline as a background task.

    This endpoint is NOT protected by candidate/recruiter auth because it is
    called server-to-server from the LiveKit worker. The session_id in the URL
    serves as a capability token (it's a UUID only the agent knows).
    """
    return await complete_session_service(
        db=db,
        session_id=session_id,
        transcript=payload.transcript,
        background_tasks=background_tasks,
    )


# ---------------------------------------------------------------------------
# Session Results (for recruiter dashboard)
# ---------------------------------------------------------------------------

@router.get("/session/{session_id}")
async def get_session(
    session_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """
    Recruiter endpoint: fetch session state, transcript, and Judge evaluation.
    Returns evaluation as soon as it is available (may be null if judge is still running).
    """
    return await get_session_with_evaluation(db=db, session_id=session_id)


@router.get("/group/{group_id}/sessions")
async def list_group_sessions(
    group_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """
    Recruiter endpoint: list all sessions (with evaluation summaries) for a group.
    Used to populate the results table in the recruiter dashboard.
    """
    from sqlmodel import select
    from app.models import LiV2Session, LiV2Evaluation

    sessions_result = await db.execute(
        select(LiV2Session).where(LiV2Session.group_id == group_id)
        .order_by(LiV2Session.created_at.desc())
    )
    sessions = sessions_result.scalars().all()

    rows = []
    for s in sessions:
        eval_result = await db.execute(
            select(LiV2Evaluation).where(LiV2Evaluation.session_id == s.id)
        )
        ev = eval_result.scalar_one_or_none()
        rows.append({
            "session_id": str(s.id),
            "candidate_id": str(s.candidate_id),
            "state": s.state,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "duration_seconds": s.duration_seconds,
            "overall_score_pct": ev.overall_score_pct if ev else None,
            "auto_verdict": ev.auto_verdict if ev else None,
            "meets_criteria": ev.meets_criteria if ev else None,
            "evaluation_confidence": ev.evaluation_confidence if ev else None,
        })

    return {"group_id": str(group_id), "sessions": rows}


# ---------------------------------------------------------------------------
# Session Monitor (recruiter real-time dashboard)
# ---------------------------------------------------------------------------

@router.get("/group/{group_id}/sessions-monitor")
async def monitor_group_sessions(
    group_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """
    Recruiter endpoint: Returns all sessions for a group with reconstructed
    event timelines for the monitoring dashboard.
    State transitions are derived from session timestamps and evaluation status.
    Polling every 2–5s during active sessions is expected.
    """
    from sqlmodel import select
    from app.models import LiV2Session, LiV2Evaluation, CandidateProfile
    from datetime import timezone

    sessions_result = await db.execute(
        select(LiV2Session)
        .where(LiV2Session.group_id == group_id)
        .order_by(LiV2Session.created_at.desc())
    )
    sessions = sessions_result.scalars().all()

    def _reconstruct_events(s: LiV2Session, ev) -> list:
        """Build a chronological event log from session state + timestamps."""
        events = []
        events.append({
            "time": s.created_at.isoformat(),
            "type": "session_created",
            "icon": "circle-dot",
            "label": "Session created",
            "detail": f"Room: {s.room_name or 'not yet assigned'}",
            "level": "info",
        })
        if s.started_at:
            events.append({
                "time": s.started_at.isoformat(),
                "type": "candidate_joined",
                "icon": "user-check",
                "label": "Candidate joined room",
                "detail": f"State → in_progress",
                "level": "success",
            })
            events.append({
                "time": s.started_at.isoformat(),
                "type": "agent_dispatched",
                "icon": "bot",
                "label": "AI interviewer agent joined",
                "detail": "Agent online and listening",
                "level": "info",
            })
        if s.transcript:
            turn_count = len(s.transcript)
            last_turn = s.transcript[-1] if s.transcript else None
            events.append({
                "time": s.ended_at.isoformat() if s.ended_at else s.created_at.isoformat(),
                "type": "transcript_turns",
                "icon": "message-square",
                "label": f"Interview in progress",
                "detail": f"{turn_count} turns recorded",
                "level": "info",
            })
        if s.ended_at:
            events.append({
                "time": s.ended_at.isoformat(),
                "type": "session_completed",
                "icon": "check-circle",
                "label": "Session completed",
                "detail": f"Duration: {s.duration_seconds or 0}s · Turns: {len(s.transcript or [])}",
                "level": "success",
            })
            events.append({
                "time": s.ended_at.isoformat(),
                "type": "judge_queued",
                "icon": "zap",
                "label": "Judge pipeline queued",
                "detail": "Background evaluation starting",
                "level": "warning",
            })
        if ev and ev.judged_at:
            events.append({
                "time": ev.judged_at.isoformat(),
                "type": "evaluation_complete",
                "icon": "star",
                "label": "Evaluation complete",
                "detail": f"Score: {ev.overall_score_pct}% · Verdict: {ev.auto_verdict} · Confidence: {ev.evaluation_confidence}",
                "level": "success",
            })
        return events

    rows = []
    for s in sessions:
        # Look up candidate name
        cand_res = await db.execute(
            select(CandidateProfile).where(CandidateProfile.candidate_id == s.candidate_id)
        )
        cand = cand_res.scalar_one_or_none()

        # Look up evaluation
        eval_result = await db.execute(
            select(LiV2Evaluation).where(LiV2Evaluation.session_id == s.id)
        )
        ev = eval_result.scalar_one_or_none()

        # Derive judge status
        if ev and ev.judged_at:
            judge_status = "complete"
        elif s.state == "completed":
            judge_status = "running"
        else:
            judge_status = "pending"

        rows.append({
            "session_id": str(s.id),
            "candidate_id": str(s.candidate_id),
            "candidate_name": cand.full_name if cand else "Unknown",
            "room_name": s.room_name,
            "state": s.state,
            "transcript_turns": len(s.transcript or []),
            "duration_seconds": s.duration_seconds,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "created_at": s.created_at.isoformat(),
            "judge_status": judge_status,
            "evaluation": {
                "overall_score_pct": ev.overall_score_pct if ev else None,
                "auto_verdict": ev.auto_verdict if ev else None,
                "evaluation_confidence": ev.evaluation_confidence if ev else None,
                "judged_at": ev.judged_at.isoformat() if ev and ev.judged_at else None,
            } if ev else None,
            "events": _reconstruct_events(s, ev),
        })

    # Summary stats
    active = sum(1 for r in rows if r["state"] == "in_progress")
    judging = sum(1 for r in rows if r["judge_status"] == "running")
    completed = sum(1 for r in rows if r["judge_status"] == "complete")
    failed = sum(1 for r in rows if r["state"] == "failed")

    return {
        "group_id": str(group_id),
        "summary": {
            "active": active,
            "judging": judging,
            "completed": completed,
            "failed": failed,
            "total": len(rows),
        },
        "sessions": rows,
    }
