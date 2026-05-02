"""
Live Interview V2 — Session Token Service.

Generates a LiveKit JWT for a candidate joining a room and optionally
dispatches the EraMatch Interviewer agent to the room via the LiveKit API.

Context injection order:
  1. Position title + first 600 chars of job description (always)
  2. Candidate's CV skills list from CVAnalysis.parsed_data (always)
  3. Candidate's weakest assessment topics (only if rubric.include_weak_topics=True
     AND the group has an assessment stage that was completed)
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from livekit import api as lk_api
from sqlmodel import select, func

from app.models import (
    LiV2Session,
    LiV2Bank,
    LiV2Rubric,
    CandidateProfile,
    CandidateApplication,
    Position,
    CandidateGroup,
    CVAnalysis,
    CandidateStageProgress,
    GroupStageConfig,
)
from app.core.exceptions import NotFoundException, BadRequestException
from app.services.live_interview.judge import run_judge_pipeline
from app.db.session import async_session_factory

logger = logging.getLogger("eramatch.live_interview.token")

_LK_URL = os.getenv("LIVEKIT_URL", "")
_LK_KEY = os.getenv("LIVEKIT_API_KEY", "")
_LK_SECRET = os.getenv("LIVEKIT_API_SECRET", "")


async def generate_session_token_service(
    db,
    application_id: UUID,
    candidate_id: UUID,
    organization_id: UUID,
) -> dict:
    """
    1. Verify the candidate has an active (unfrozen bank) LiV2 setup for their group.
    2. Create (or reuse) a LiV2Session record.
    3. Build context payload (CV + JD + optional weak topics).
    4. Generate a LiveKit JWT for the candidate.
    5. Dispatch the interviewer agent to the room.

    Returns:
        {
            "token": "...",                 # LiveKit JWT for the candidate
            "url": "wss://...",             # LiveKit Cloud URL
            "room_name": "li-v2-<uuid>",   # Room name
            "session_id": "...",
        }
    """
    # --- 1. Resolve application → group → frozen bank -------------
    app_res = await db.execute(
        select(CandidateApplication).where(
            CandidateApplication.id == application_id,
            CandidateApplication.candidate_id == candidate_id,
            CandidateApplication.organization_id == organization_id,
        )
    )
    application = app_res.scalar_one_or_none()
    if not application:
        raise NotFoundException("Application not found")

    group_id = application.group_id
    if not group_id:
        raise BadRequestException("Application is not assigned to a candidate group")

    stage_res = await db.execute(
        select(GroupStageConfig).where(
            GroupStageConfig.group_id == group_id,
            GroupStageConfig.organization_id == organization_id,
            GroupStageConfig.stage_type == "live_interview",
            GroupStageConfig.state == "active",
        )
    )
    live_stage = stage_res.scalar_one_or_none()
    if not live_stage:
        raise BadRequestException("Live interview stage is not active yet.")

    progress_res = await db.execute(
        select(CandidateStageProgress).where(
            CandidateStageProgress.application_id == application_id,
            CandidateStageProgress.stage_id == live_stage.stage_id,
        )
    )
    stage_progress = progress_res.scalar_one_or_none()
    if not stage_progress or stage_progress.status not in ("unlocked", "in_progress"):
        raise BadRequestException(
            "Live interview stage is not unlocked for this candidate."
        )

    # Look up the frozen bank for this group
    bank_res = await db.execute(
        select(LiV2Bank).where(
            LiV2Bank.group_id == group_id,
            LiV2Bank.organization_id == organization_id,
            LiV2Bank.state == "frozen",
        )
    )
    bank = bank_res.scalar_one_or_none()
    if not bank:
        raise BadRequestException(
            "No frozen question bank found for this group. "
            "Ask your recruiter to finalize the interview configuration."
        )

    # Look up the frozen rubric
    rubric_res = await db.execute(
        select(LiV2Rubric).where(LiV2Rubric.id == bank.rubric_id)
    )
    rubric = rubric_res.scalar_one_or_none()
    if not rubric:
        raise NotFoundException("Rubric linked to bank not found")

    # --- 2. Look up candidate name & profile -----------------------
    cand_res = await db.execute(
        select(CandidateProfile).where(CandidateProfile.candidate_id == candidate_id)
    )
    candidate = cand_res.scalar_one_or_none()
    candidate_name = candidate.full_name if candidate else "Candidate"

    # --- 3. Build context payload ----------------------------------
    context_payload = await _build_context_payload(
        db=db,
        candidate=candidate,
        application=application,
        group_id=group_id,
        organization_id=organization_id,
        rubric=rubric,
    )

    # --- 4. Reuse or create a session record -----------------------
    sess_res = await db.execute(
        select(LiV2Session).where(
            LiV2Session.application_id == application_id,
            LiV2Session.state.in_(["pending", "in_progress"]),
        )
    )
    session = sess_res.scalar_one_or_none()

    if not session:
        room_name = f"li-v2-{uuid4().hex[:12]}"
        session = LiV2Session(
            candidate_id=candidate_id,
            application_id=application_id,
            group_id=group_id,
            organization_id=organization_id,
            rubric_id=rubric.id,
            bank_id=bank.id,
            room_name=room_name,
            state="pending",
            context_pool=context_payload,  # store what context was given to agent
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        logger.info(f"Created new LiV2Session {session.id} → room {room_name}")
    else:
        room_name = session.room_name
        logger.info(f"Reusing LiV2Session {session.id} → room {room_name}")

    if session.state == "pending":
        session.state = "in_progress"
        session.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(session)

    # --- 4b. Update candidate_pipeline_progress → in_progress ----------
    try:
        stage_progress.status = "in_progress"
        if not stage_progress.started_at:
            stage_progress.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
        stage_progress.session_id = session.id
        stage_progress.session_type = "live_interview"
        db.add(stage_progress)
        await db.commit()
        logger.info(
            "[PROGRESS] app=%s stage=%s status=in_progress",
            application_id,
            live_stage.stage_id,
        )
    except Exception as e:
        logger.error(
            "[PROGRESS] Failed to update pipeline progress on token issue: %s", e
        )

    logger.info(
        "[TOKEN] session=%s context_keys=%s bank_items=%d time_budget=%d",
        session.id,
        list(context_payload.keys()),
        len(bank.items or []),
        rubric.time_budget_minutes,
    )

    # --- 5. Generate a LiveKit JWT for the candidate ---------------
    token = (
        lk_api.AccessToken(api_key=_LK_KEY, api_secret=_LK_SECRET)
        .with_identity(f"candidate:{candidate_id}")
        .with_name(candidate_name)
        .with_ttl(timedelta(hours=2))
        .with_grants(
            lk_api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .to_jwt()
    )

    # --- 6. Dispatch the agent to the room (idempotent) ------------
    await _dispatch_agent_if_not_present(
        room_name=room_name,
        session=session,
        candidate_name=candidate_name,
        rubric=rubric,
        bank=bank,
        context_payload=context_payload,
    )

    # --- 7. Schedule auto-termination if time budget exceeded -----------
    _schedule_auto_termination(
        session_id=session.id,
        time_budget_minutes=rubric.time_budget_minutes or 10,
    )

    return {
        "token": token,
        "url": _LK_URL,
        "room_name": room_name,
        "session_id": str(session.id),
        "time_budget_minutes": rubric.time_budget_minutes or 10,
    }


# =============================================================================
# AUTO-TERMINATION
# =============================================================================


async def _auto_terminate_session(session_id: UUID, time_budget_minutes: int):
    """
    Background coroutine: sleep for the rubric's time budget, then check
    whether the session is still in_progress. If so, complete it with
    whatever transcript exists (or empty) and fire the Judge pipeline.
    """
    sleep_seconds = time_budget_minutes * 60
    logger.info(
        "[AUTO-TERMINATE] Scheduled auto-termination for session %s in %d minutes",
        session_id,
        time_budget_minutes,
    )
    await asyncio.sleep(sleep_seconds)

    async with async_session_factory() as db:
        try:
            result = await db.execute(
                select(LiV2Session).where(LiV2Session.id == session_id)
            )
            session = result.scalar_one_or_none()

            if not session:
                logger.warning(
                    "[AUTO-TERMINATE] Session %s not found — skipping", session_id
                )
                return

            if session.state != "in_progress":
                logger.info(
                    "[AUTO-TERMINATE] Session %s is '%s' (not in_progress) — skipping",
                    session_id,
                    session.state,
                )
                return

            logger.info(
                "[AUTO-TERMINATE] Session %s still in_progress, auto-completing",
                session_id,
            )

            transcript = session.transcript or []

            started_at = session.started_at or session.created_at
            ended_at = datetime.now(timezone.utc).replace(tzinfo=None)
            duration = int((ended_at - started_at.replace(tzinfo=None)).total_seconds())

            session.state = "completed"
            session.ended_at = ended_at
            session.duration_seconds = duration
            session.transcript = transcript

            db.add(session)
            await db.commit()

            logger.info(
                "[AUTO-TERMINATE] Session %s auto-completed (%ds, %d transcript turns)",
                session_id,
                duration,
                len(transcript),
            )

            await run_judge_pipeline(str(session_id))

        except Exception:
            logger.exception(
                "[AUTO-TERMINATE] Error auto-terminating session %s", session_id
            )


def _schedule_auto_termination(session_id: UUID, time_budget_minutes: int):
    asyncio.create_task(_auto_terminate_session(session_id, time_budget_minutes))


# =============================================================================
# CONTEXT BUILDER
# =============================================================================


async def _build_context_payload(
    db,
    candidate,
    application,
    group_id: UUID,
    organization_id: UUID,
    rubric,
) -> dict:
    """
    Assembles the context that will be injected into the agent's opening prompt.

    Structure:
    {
        "position_title": "...",
        "job_description_excerpt": "...",   # first 600 chars
        "cv_skills": [...],                  # from CVAnalysis.parsed_data
        "weak_topics": [...] | None,         # only if rubric.include_weak_topics=True
    }
    """
    payload: dict = {
        "position_title": None,
        "job_description_excerpt": None,
        "cv_skills": [],
        "experience_summary": [],
        "projects": [],
        "weak_topics": None,
    }

    # ── Position title + JD excerpt ─────────────────────────────────────────
    try:
        group_res = await db.execute(
            select(CandidateGroup).where(CandidateGroup.id == group_id)
        )
        group = group_res.scalar_one_or_none()
        if group and group.position_id:
            pos_res = await db.execute(
                select(Position).where(Position.id == group.position_id)
            )
            pos = pos_res.scalar_one_or_none()
            if pos:
                payload["position_title"] = pos.job_title or pos.title or ""
                jd = pos.job_description or ""
                payload["job_description_excerpt"] = jd[:600] if jd else ""
    except Exception as e:
        logger.warning(f"Context builder: failed to load position — {e}")

    # ── CV Data (Skills, Experience, Projects) ───────────────────────────
    try:
        cv_res = await db.execute(
            select(CVAnalysis).where(CVAnalysis.application_id == application.id)
        )
        cv = cv_res.scalar_one_or_none()

        if cv:
            # 1. Skills
            if cv.skills and isinstance(cv.skills, list):
                payload["cv_skills"] = [str(s) for s in cv.skills[:20]]

            # 2. Experience & Projects (from parsed_data JSONB)
            if cv.parsed_data and isinstance(cv.parsed_data, dict):
                work_hist = cv.parsed_data.get("work_history", [])
                if work_hist and isinstance(work_hist, list):
                    payload["experience_summary"] = [
                        f"{w.get('title')} at {w.get('company')} ({w.get('duration')})"
                        for w in work_hist[:2]
                    ]

                projects = cv.parsed_data.get("projects", [])
                if projects and isinstance(projects, list):
                    payload["projects"] = [p.get("name", str(p)) for p in projects[:3]]
    except Exception as e:
        logger.warning(f"Context builder: failed to load CV data — {e}")

    # ── Weak Assessment Topics ─────────────────────────────────────────────
    if rubric.include_weak_topics:
        try:
            payload["weak_topics"] = await _get_weak_topics(
                db, application_id=application.id
            )
        except Exception as e:
            logger.warning(f"Context builder: failed to load weak topics — {e}")
            payload["weak_topics"] = None

    logger.info(
        f"Context payload built: "
        f"position={payload['position_title']!r} "
        f"skills={len(payload['cv_skills'])} "
        f"weak_topics={payload['weak_topics']}"
    )
    return payload


async def _get_weak_topics(db, application_id: UUID) -> list[str]:
    """
    Find the questions the candidate answered incorrectly during the assessment stage,
    group by topic, and return the top 3 weakest topic names.

    Returns a list of topic strings, or [] if no assessment data found.
    """
    from app.models import CandidateAnswer, OngoingAssessment

    # Find the assessment session for this application
    sess_res = await db.execute(
        select(OngoingAssessment)
        .where(
            OngoingAssessment.application_id == application_id,
            OngoingAssessment.status == "completed",
        )
        .order_by(OngoingAssessment.submitted_at.desc().nullslast())
        .limit(1)
    )
    assessment_session = sess_res.scalar_one_or_none()
    if not assessment_session:
        return []

    # Get incorrect answers
    answers_res = await db.execute(
        select(CandidateAnswer).where(
            CandidateAnswer.session_id == assessment_session.session_id,
            CandidateAnswer.is_correct == False,  # noqa: E712
        )
    )
    wrong_answers = answers_res.scalars().all()
    if not wrong_answers:
        return []

    # Look up question topics for these answers
    from app.models import QuestionBank

    topic_counts: dict[str, int] = {}
    for ans in wrong_answers:
        q_res = await db.execute(
            select(QuestionBank).where(QuestionBank.id == ans.question_id)
        )
        q = q_res.scalar_one_or_none()
        topic = q.category if q else None
        if topic:
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

    # Return top 3 weakest topics (most wrong answers)
    sorted_topics = sorted(topic_counts, key=lambda t: topic_counts[t], reverse=True)
    return sorted_topics[:3]


# =============================================================================
# AGENT DISPATCH
# =============================================================================


async def _dispatch_agent_if_not_present(
    room_name: str,
    session,
    candidate_name: str,
    rubric,
    bank,
    context_payload: dict,
):
    """
    Dispatches the EraMatch Interviewer agent to the room via the LiveKit API.
    Idempotent — LiveKit will not spawn a second agent if one is already present.

    The metadata JSON is what the agent_server.py reads in `interviewer_session()`.
    """
    metadata = json.dumps(
        {
            "session_id": str(session.id),
            "candidate_id": str(session.candidate_id),
            "candidate_name": candidate_name,
            "rubric_id": str(rubric.id),
            "bank_id": str(bank.id),
            "time_budget_minutes": rubric.time_budget_minutes,
            "language": rubric.language or "en",
            "group_id": str(session.group_id),
            "organization_id": str(session.organization_id),
            # Context injected into agent opening prompt:
            "context": context_payload,
        }
    )

    try:
        async with lk_api.LiveKitAPI(
            url=_LK_URL, api_key=_LK_KEY, api_secret=_LK_SECRET
        ) as lk_client:
            await lk_client.agent_dispatch.create_dispatch(
                lk_api.CreateAgentDispatchRequest(
                    agent_name="eramatch-interviewer",
                    room=room_name,
                    metadata=metadata,
                )
            )
            logger.info(
                f"Agent dispatched to room {room_name} with context keys: {list(context_payload.keys())}"
            )
    except Exception as e:
        # Non-fatal: candidate can still join; agent will retry on reconnect
        logger.warning(f"Agent dispatch failed (non-fatal): {e}")
