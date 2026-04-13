"""
LiveKit Agent Server — EraMatch Live Interview V2.

This is the entrypoint for the LiveKit agent worker. It runs as a
separate process from the main backend and AI service. When a candidate
starts a live interview, the backend dispatches a job to this worker
via the LiveKit Cloud agent dispatch API.


env vars:

    LIVEKIT_URL        — wss://your-project.livekit.cloud
    LIVEKIT_API_KEY    — from LiveKit Cloud dashboard
    LIVEKIT_API_SECRET — from LiveKit Cloud dashboard
    GOOGLE_APPLICATION_CREDENTIALS — GCP JSON for STT/TTS
    ELEVEN_API_KEY     — ElevenLabs fallback TTS key

Dev LLM Config (override in .env for prod):
    INTERVIEWER_PRIMARY_MODEL = gemini-2.5-flash-lite    (all roles in dev)
    COVERAGE_CHECK_MODEL      = qwen3.5:4b-cloud         (small + fast inline checks)
"""

import json
import logging
import os
import asyncpg

from livekit import agents
from livekit.agents import AgentSession, AgentServer, room_io, TurnHandlingOptions
from livekit.plugins import google, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from interviewer_agent import InterviewerAgent

logger = logging.getLogger("eramatch.livekit_worker")

# =============================================================================
# AGENT SERVER SETUP
# =============================================================================

server = AgentServer()


def prewarm(proc: agents.JobProcess):
    """
    Load models once at worker startup, reuse across sessions.
    Silero VAD is a lightweight (~1MB) model for speech start/end detection.
    """
    logger.info("Prewarming: loading Silero VAD...")
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.8,      # Interview-tuned: allow longer pauses
        activation_threshold=0.4,
        prefix_padding_duration=0.5,
        sample_rate=16000,
        force_cpu=True,
    )
    logger.info("Prewarming complete.")


server.setup_fnc = prewarm


# =============================================================================
# DB Helper — load frozen bank items from Supabase/Postgres
# =============================================================================

_DB_URL = os.getenv("DATABASE_URL", "")


async def _fetch_bank_items(bank_id: str) -> list[dict]:
    """
    Fetch frozen question bank items directly from Postgres.
    We use asyncpg for a lightweight connection without the full backend stack.
    """
    # Convert SQLAlchemy URL to asyncpg DSN (strip +asyncpg prefix)
    dsn = _DB_URL.replace("postgresql+asyncpg://", "postgresql://")
    try:
        conn = await asyncpg.connect(dsn)
        row = await conn.fetchrow(
            "SELECT items FROM li_v2_banks WHERE bank_id=$1::uuid", bank_id
        )
        await conn.close()
        if row and row["items"]:
            items = row["items"]
            return items if isinstance(items, list) else json.loads(items)
        return []
    except Exception as e:
        logger.error(f"Failed to fetch bank items for {bank_id}: {e}")
        return []


# =============================================================================
# SESSION ENTRYPOINT
# =============================================================================

@server.rtc_session(agent_name="eramatch-interviewer")
async def interviewer_session(ctx: agents.JobContext):
    """
    Entrypoint for each interview session.

    Metadata payload (sent by token.py dispatch):
    {
        "session_id": "uuid",
        "candidate_id": "uuid",
        "candidate_name": "...",
        "rubric_id": "uuid",
        "bank_id": "uuid",
        "time_budget_minutes": 30,
        "group_id": "uuid",
        "organization_id": "uuid"
    }
    """
    metadata = json.loads(ctx.job.metadata or "{}")
    session_id     = metadata.get("session_id", "unknown")
    candidate_name = metadata.get("candidate_name", "Candidate")
    bank_id        = metadata.get("bank_id", "")
    time_budget    = metadata.get("time_budget_minutes", 30)
    language       = metadata.get("language", "en")
    context        = metadata.get("context", {})

    logger.info(
        f"Session {session_id}: agent joining room for {candidate_name} "
        f"(lang={language}, budget={time_budget}min, "
        f"context_keys={list(context.keys()) if context else []})"
    )

    vad = ctx.proc.userdata["vad"]

    # --- Fetch frozen bank from DB before starting session ---
    bank_items = await _fetch_bank_items(bank_id)
    logger.info(f"Session {session_id}: loaded {len(bank_items)} bank items")

    # --- Build the pipeline ---
    gcp_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    session = AgentSession(
        stt=google.STT(
            languages=["en-US"],
            model="chirp_2",
            spoken_punctuation=True,
            credentials_file=gcp_creds,
        ),
        # Dev: gemini-2.5-flash-lite for ALL roles (fast + affordable)
        # Prod: swap Judge role to gemini-2.5-pro in Phase 4
        llm=f"google/{os.getenv('INTERVIEWER_PRIMARY_MODEL', 'gemini-2.5-flash-lite')}",
        tts=google.TTS(
            language="en-US",
            gender="neutral",
            voice_name=os.getenv("TTS_PRIMARY_VOICE", "en-US-Wavenet-D"),
            credentials_file=gcp_creds,
        ),
        vad=vad,
        turn_handling=TurnHandlingOptions(
            turn_detection=MultilingualModel(),
        ),
    )

    # --- Instantiate our stateful agent (with context from token dispatch) ---
    interviewer = InterviewerAgent(metadata=metadata)

    # Store bank items in userdata so on_session_start can access them
    ctx.proc.userdata["bank_items"] = bank_items

    # --- Shutdown callback: persist transcript to DB, trigger Judge Agent ---
    async def on_shutdown():
        transcript = ctx.proc.userdata.get("transcript", [])
        session_complete = ctx.proc.userdata.get("session_complete", False)
        logger.info(
            f"Session {session_id}: shutting down. "
            f"complete={session_complete}, turns={len(transcript)}"
        )

        if transcript:
            backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
            endpoint = f"{backend_url}/api/v1/li-v2/session/{session_id}/complete"
            try:
                import httpx
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(
                        endpoint,
                        json={"transcript": transcript},
                        headers={"Content-Type": "application/json"},
                    )
                    resp.raise_for_status()
                    logger.info(f"Session {session_id}: transcript POSTed to backend ({len(transcript)} turns)")
            except Exception as e:
                logger.error(f"Session {session_id}: failed to POST transcript to backend: {e}")
        else:
            logger.warning(f"Session {session_id}: no transcript to save")

    ctx.add_shutdown_callback(on_shutdown)

    # --- Start the session ---
    await session.start(
        room=ctx.room,
        agent=interviewer,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=None,
            ),
        ),
    )

    logger.info(f"Session {session_id}: agent is live and listening.")

if __name__ == "__main__":
    agents.cli.run_app(server)
