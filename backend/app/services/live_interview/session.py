"""
Live Interview V2 — Session Lifecycle Service.

Handles:
  - complete_session: saves transcript, updates state, triggers Judge
  - get_session: fetches session + evaluation for recruiter view
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import select
from fastapi import BackgroundTasks

from app.models import LiV2Session, LiV2Evaluation, LiV2Rubric, CandidateProfile
from app.core.exceptions import NotFoundException, BadRequestException
from app.services.live_interview.judge import run_judge_pipeline
from worker.tasks.video import compress_recordings

logger = logging.getLogger("eramatch.live_interview.session")


async def complete_session_service(
    db,
    session_id: UUID,
    transcript: list[dict],
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Called by the agent's on_shutdown callback (via POST /li-v2/session/{id}/complete).

    1. Validates the session exists and is not already completed.
    2. Persists the transcript + state change.
    3. Enqueues the Judge pipeline as a background task.
    """
    result = await db.execute(select(LiV2Session).where(LiV2Session.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise NotFoundException(f"Session {session_id} not found")

    if session.state == "completed":
        existing_transcript = session.transcript or []
        # Race condition: auto-termination marked the session completed with an empty
        # transcript (fires at hard time limit). The agent's real transcript arrives
        # ~60s later via on_shutdown. Accept it and re-run the judge.
        if not existing_transcript and transcript:
            logger.info(
                "[COMPLETE] session=%s was auto-completed with empty transcript — "
                "accepting real transcript (%d turns) and re-running judge",
                session_id,
                len(transcript),
            )
            session.transcript = transcript
            db.add(session)
            await db.commit()
            await db.refresh(session)
            background_tasks.add_task(run_judge_pipeline, str(session_id))
            return {
                "status": "transcript_accepted_after_auto_complete",
                "session_id": str(session_id),
                "transcript_turns": len(transcript),
            }
        logger.info(
            "[COMPLETE] session=%s already completed with %d turns — skipping duplicate.",
            session_id,
            len(existing_transcript),
        )
        return {"status": "already_completed", "session_id": str(session_id)}

    if session.state not in ("pending", "in_progress"):
        raise BadRequestException(f"Cannot complete session in state '{session.state}'")

    if not transcript:
        logger.warning(
            "[COMPLETE] session=%s ignored empty transcript completion request",
            session_id,
        )
        return {
            "status": "ignored_empty_transcript",
            "session_id": str(session_id),
            "duration_seconds": session.duration_seconds,
            "transcript_turns": 0,
        }

    # Compute duration — strip tzinfo to match asyncpg's TIMESTAMP WITHOUT TIME ZONE column
    # (asyncpg returns tz-aware from reads but refuses tz-aware on writes for TIMESTAMP columns)
    started_at = session.started_at or session.created_at
    ended_at = datetime.now(timezone.utc).replace(tzinfo=None)
    duration = int((ended_at - started_at.replace(tzinfo=None)).total_seconds())

    session.state = "completed"
    session.ended_at = ended_at
    session.duration_seconds = duration
    session.transcript = transcript

    db.add(session)
    await db.commit()
    await db.refresh(session)
    logger.info(
        f"Session {session_id} completed ({duration}s, {len(transcript)} turns)"
    )

    logger.info(
        "[COMPLETE] session=%s turns=%d reason=%s judge_scheduled=%s",
        session_id,
        len(transcript),
        "agent_shutdown",
        True,
    )

    # Fire Judge pipeline asynchronously — doesn't block the agent shutdown
    background_tasks.add_task(run_judge_pipeline, str(session_id))

    # Compress screen + webcam recordings via Celery
    try:
        compress_recordings.delay(str(session_id), "live_interview")
    except Exception:
        pass  # Non-fatal: worker may be unavailable in dev

    return {
        "status": "completed",
        "session_id": str(session_id),
        "duration_seconds": duration,
        "transcript_turns": len(transcript),
    }


async def get_session_with_evaluation(
    db, session_id: UUID, organization_id: UUID | None = None
) -> dict:
    """
    For the recruiter dashboard: returns session details + evaluation if available.
    """
    filters = [LiV2Session.id == session_id]
    if organization_id:
        filters.append(LiV2Session.organization_id == organization_id)
    result = await db.execute(select(LiV2Session).where(*filters))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundException(f"Session {session_id} not found")

    eval_result = await db.execute(
        select(LiV2Evaluation).where(LiV2Evaluation.session_id == session_id)
    )
    evaluation = eval_result.scalar_one_or_none()

    # Fetch candidate name for display
    cand_result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.candidate_id == session.candidate_id
        )
    )
    candidate = cand_result.scalar_one_or_none()

    return {
        "session_id": str(session.id),
        "candidate_id": str(session.candidate_id),
        "candidate_name": candidate.full_name if candidate else None,
        "state": session.state,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "duration_seconds": session.duration_seconds,
        "room_name": session.room_name,
        "context_pool": session.context_pool or {},
        "transcript": session.transcript or [],
        "evaluation": _serialize_evaluation(evaluation) if evaluation else None,
    }


def _serialize_evaluation(ev: LiV2Evaluation) -> dict:
    return {
        "evaluation_id": str(ev.id),
        "overall_score": float(ev.overall_score) if ev.overall_score else None,
        "overall_score_pct": ev.overall_score_pct,
        "auto_verdict": ev.auto_verdict,
        "meets_criteria": ev.meets_criteria,
        "coverage_ratio": float(ev.coverage_ratio) if ev.coverage_ratio else None,
        "dimension_scores": ev.dimension_scores or {},
        "per_question_results": ev.per_question_results or [],
        "auto_tags": ev.auto_tags or {},
        "integrity_flags": ev.integrity_flags or {},
        "evaluation_confidence": ev.evaluation_confidence,
        "judge_model": ev.judge_model,
        "judged_at": ev.judged_at.isoformat() if ev.judged_at else None,
    }
