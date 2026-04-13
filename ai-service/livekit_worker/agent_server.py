"""
LiveKit Agent Server — EraMatch Live Interview V2.

This is the entrypoint for the LiveKit agent worker. It runs as a
separate process from the main backend and AI service. When a candidate
starts a live interview, the backend dispatches a job to this worker
via the LiveKit Cloud agent dispatch API.

Usage:
    # Development (connects to LiveKit Cloud, auto-reloads)
    cd EraMatch/ai-service/livekit_worker
    python agent_server.py dev

    # Production
    python agent_server.py start

    # Download model files (Silero VAD weights)
    python agent_server.py download-files

Environment:
    LIVEKIT_URL        — wss://your-project.livekit.cloud
    LIVEKIT_API_KEY    — from LiveKit Cloud dashboard
    LIVEKIT_API_SECRET — from LiveKit Cloud dashboard
"""

import json
import logging
import os

from livekit import agents
from livekit.agents import AgentSession, Agent, AgentServer, room_io, TurnHandlingOptions
from livekit.plugins import google, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("eramatch.livekit_worker")

# =============================================================================
# AGENT SERVER SETUP
# =============================================================================

server = AgentServer()


def prewarm(proc: agents.JobProcess):
    """
    Load models once at worker startup, reuse across sessions.
    
    Silero VAD is a lightweight (~1MB) model that detects when a person
    starts and stops speaking. We load it here so it's ready when a
    session starts.
    """
    logger.info("Prewarming: loading Silero VAD...")
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.8,     # Wait longer for interview pauses
        activation_threshold=0.4,     # Slightly lower to not miss quiet speakers
        prefix_padding_duration=0.5,  # Capture beginning of speech
        sample_rate=16000,
        force_cpu=True,
    )
    logger.info("Prewarming complete.")


server.setup_fnc = prewarm


# =============================================================================
# SESSION ENTRYPOINT
# =============================================================================

@server.rtc_session(agent_name="eramatch-interviewer")
async def interviewer_session(ctx: agents.JobContext):
    """
    Entrypoint for each interview session.
    
    This is called by LiveKit Cloud when the backend dispatches an
    agent to a room. The job metadata contains session info:
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
    session_id = metadata.get("session_id", "unknown")
    candidate_name = metadata.get("candidate_name", "Candidate")
    
    logger.info(f"Session {session_id}: agent joining room for {candidate_name}")

    vad = ctx.proc.userdata["vad"]

    # Build the agent session with STT/LLM/TTS pipeline
    session = AgentSession(
        stt=google.STT(
            languages=["en-US"],
            model="chirp_2",
            spoken_punctuation=True,
            credentials_file=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        ),
        llm="google/gemini-2.5-flash-lite",
        tts=google.TTS(
            language="en-US",
            gender="neutral",
            voice_name=os.getenv("TTS_PRIMARY_VOICE", "en-US-Wavenet-D"),
            credentials_file=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        ),
        vad=vad,
        turn_handling=TurnHandlingOptions(
            turn_detection=MultilingualModel(),
        ),
    )

    # Skeleton agent — will be replaced with the full interviewer in Phase 3
    interviewer_agent = Agent(
        instructions=(
            f"You are a professional AI interviewer for EraMatch. "
            f"The candidate's name is {candidate_name}. "
            f"Greet the candidate warmly, introduce yourself, and ask them "
            f"to tell you briefly about their background. "
            f"Keep your responses concise and professional."
        ),
    )

    # Shutdown callback — persist context pool to Postgres
    async def on_shutdown():
        logger.info(f"Session {session_id}: shutting down, persisting state...")
        # Phase 3 will add context pool persistence here

    ctx.add_shutdown_callback(on_shutdown)

    # Start the session in the room
    await session.start(
        room=ctx.room,
        agent=interviewer_agent,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=None,
            ),
        ),
    )

    # Generate opening utterance
    await session.generate_reply(
        instructions=(
            f"Greet {candidate_name} warmly. Tell them you are the AI interviewer "
            f"for their live interview. Ask them to introduce themselves briefly."
        )
    )

    logger.info(f"Session {session_id}: agent is live and listening.")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    agents.cli.run_app(server)
