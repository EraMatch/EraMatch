"""
Live Interview V2 — Session Token Service.

Generates a LiveKit JWT for a candidate joining a room and optionally
dispatches the EraMatch Interviewer agent to the room via the LiveKit API.
"""
import json
import logging
import os
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from livekit import api as lk_api
from sqlmodel import select

from app.models import LiV2Session, LiV2Bank, LiV2Rubric, CandidateProfile, CandidateApplication
from app.core.exceptions import NotFoundException, BadRequestException

logger = logging.getLogger("eramatch.live_interview.token")

_LK_URL    = os.getenv("LIVEKIT_URL", "")
_LK_KEY    = os.getenv("LIVEKIT_API_KEY", "")
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
    3. Generate a LiveKit JWT for the candidate.
    4. Dispatch the interviewer agent to the room.

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
        select(CandidateApplication).where(CandidateApplication.application_id == application_id)
    )
    application = app_res.scalar_one_or_none()
    if not application:
        raise NotFoundException("Application not found")

    group_id = application.group_id

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

    # --- 2. Look up candidate name ---------------------------------
    cand_res = await db.execute(
        select(CandidateProfile).where(CandidateProfile.candidate_id == candidate_id)
    )
    candidate = cand_res.scalar_one_or_none()
    candidate_name = candidate.full_name if candidate else "Candidate"

    # --- 3. Reuse or create a session record -----------------------
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
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        logger.info(f"Created new LiV2Session {session.id} → room {room_name}")
    else:
        room_name = session.room_name
        logger.info(f"Reusing LiV2Session {session.id} → room {room_name}")

    # --- 4. Generate a LiveKit JWT for the candidate ---------------
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

    # --- 5. Dispatch the agent to the room (idempotent) ------------
    await _dispatch_agent_if_not_present(
        room_name=room_name,
        session=session,
        candidate_name=candidate_name,
        rubric=rubric,
        bank=bank,
    )

    return {
        "token": token,
        "url": _LK_URL,
        "room_name": room_name,
        "session_id": str(session.id),
    }


async def _dispatch_agent_if_not_present(room_name: str, session, candidate_name: str, rubric, bank):
    """
    Dispatches the EraMatch Interviewer agent to the room via the LiveKit API.
    Idempotent — LiveKit will not spawn a second agent if one is already present.

    The metadata JSON is what the agent_server.py reads in `interviewer_session()`.
    """
    metadata = json.dumps({
        "session_id": str(session.id),
        "candidate_id": str(session.candidate_id),
        "candidate_name": candidate_name,
        "rubric_id": str(rubric.id),
        "bank_id": str(bank.id),
        "time_budget_minutes": rubric.time_budget_minutes,
        "group_id": str(session.group_id),
        "organization_id": str(session.organization_id),
    })

    try:
        lk_client = lk_api.LiveKitAPI(url=_LK_URL, api_key=_LK_KEY, api_secret=_LK_SECRET)
        await lk_client.agent.create_dispatch(
            lk_api.CreateAgentDispatchRequest(
                agent_name="eramatch-interviewer",
                room=room_name,
                metadata=metadata,
            )
        )
        logger.info(f"Agent dispatched to room {room_name}")
    except Exception as e:
        # Non-fatal: candidate can still join the room; agent will retry on reconnect
        logger.warning(f"Agent dispatch failed (non-fatal): {e}")
