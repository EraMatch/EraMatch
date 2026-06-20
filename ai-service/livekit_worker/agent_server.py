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
    INTERVIEWER_PRIMARY_MODEL   = gemini-3-flash-preview:cloud  (primary — Gemini via Ollama Cloud)
    INTERVIEWER_SECONDARY_MODEL = gemma3:12b-cloud               (fallback if Gemini unavailable)
    COVERAGE_CHECK_MODEL       = gemma3:4b-cloud                 (small + fast inline checks, non-blocking)
"""

import os

# ── CRITICAL: Set KMP_DUPLICATE_LIB_OK BEFORE any numpy/torch imports ──
# On macOS, multiprocessing.spawn child processes inherit the parent's
# OpenMP runtime. When numpy/torch load their own copy, the duplicate
# libiomp5.dylib causes an OMP Error #15 crash (or fatal hang), which
# kills the job process before it can initialize within the 10s timeout.
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import json
import logging
from pathlib import Path

# ── Load .env BEFORE any livekit import (framework reads env at import time) ──
try:
    from dotenv import load_dotenv

    # Try ai-service root .env first, then walk up to project root
    _env_candidates = [
        Path(__file__).resolve().parent.parent / ".env",  # ai-service/.env
        Path(__file__).resolve().parents[3] / ".env",  # project root .env
    ]
    for _ep in _env_candidates:
        if _ep.exists():
            load_dotenv(dotenv_path=_ep, override=False)
            break
except ImportError:
    pass  # python-dotenv not installed; rely on shell env

import asyncpg
import httpx

from livekit import agents
from livekit.agents import AgentSession, AgentServer, room_io, TurnHandlingOptions
from livekit.agents import stt as stt_module
from livekit.agents import tts as tts_module
from livekit.agents import inference
from livekit.plugins import google, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from interviewer_agent import InterviewerAgent

logger = logging.getLogger("eramatch.livekit_worker")

# =============================================================================
# AGENT SERVER SETUP
# =============================================================================

server = AgentServer(initialize_process_timeout=60.0)


def prewarm(proc: agents.JobProcess):
    """
    Load models once at worker startup, reuse across sessions.
    Silero VAD is a lightweight (~1MB) model for speech start/end detection.
    """
    logger.info("Prewarming: loading Silero VAD...")
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.8,  # Interview-tuned: allow longer pauses
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
        conn = await asyncpg.connect(dsn, statement_cache_size=0)
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
    session_id = metadata.get("session_id", "unknown")
    candidate_name = metadata.get("candidate_name", "Candidate")
    bank_id = metadata.get("bank_id", "")
    time_budget = metadata.get("time_budget_minutes", 10)
    language = metadata.get("language", "en")
    context = metadata.get("context", {})

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
    primary_model = os.getenv("INTERVIEWER_PRIMARY_MODEL", "deepseek-v4-flash:cloud")
    secondary_model = os.getenv("INTERVIEWER_SECONDARY_MODEL", "gemma3:12b-cloud")
    primary_provider = os.getenv("INTERVIEWER_PRIMARY_PROVIDER", "").lower()
    # Suppress reasoning leakage on reasoning models (deepseek/minimax/gemini-flash):
    # without this they spend the token budget "thinking" and return empty/truncated
    # spoken content. Non-reasoning models (gemma3) safely ignore it.
    reasoning_effort = os.getenv("INTERVIEWER_REASONING_EFFORT", "none")

    # --- LLM selection: try primary, fallback to secondary ---
    # Determine provider from env var or model name:
    #   - model names with ':cloud' or known Ollama prefixes → Ollama (openai.LLM)
    #   - model names starting with 'gemini' → Google (google.LLM)
    #   - explicit INTERVIEWER_PRIMARY_PROVIDER overrides inference
    def _is_ollama_model(model_name: str) -> bool:
        return ":cloud" in model_name or model_name.startswith(
            ("gemma", "qwen", "llama", "mistral", "codellama", "deepseek")
        )

    llm = None

    # --- PRIMARY LLM ---
    use_ollama_primary = primary_provider == "ollama" or (
        not primary_provider and _is_ollama_model(primary_model)
    )

    if use_ollama_primary:
        ollama_base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        ollama_api_key = os.getenv("OLLAMA_API_KEY", "") or "ollama"
        llm = openai.LLM(
            model=primary_model,
            base_url=ollama_base + "/v1",
            api_key=ollama_api_key,
            reasoning_effort=reasoning_effort,
            timeout=httpx.Timeout(connect=30.0, read=120.0, write=30.0, pool=30.0),
        )
        logger.info(
            "[LLM-PRIMARY] Using %s via Ollama (base=%s, reasoning_effort=%s)",
            primary_model,
            ollama_base,
            reasoning_effort,
        )
    else:
        try:
            llm = google.LLM(model=primary_model)
            import asyncio
            from livekit.agents.llm import ChatContext

            test_chat_ctx = ChatContext()
            test_chat_ctx.add_message(role="user", content="hi")

            async def _test_gemini():
                async for _chunk in llm.chat(chat_ctx=test_chat_ctx):
                    break

            await asyncio.wait_for(_test_gemini(), timeout=15.0)
            logger.info(
                "[LLM-PRIMARY] Gemini %s is available (test passed)", primary_model
            )
        except Exception as e:
            logger.warning(
                "[LLM-FALLBACK] Gemini LLM unavailable: %s. Switching to %s",
                e,
                secondary_model,
            )
            llm = None

    # --- SECONDARY (fallback) LLM ---
    if llm is None:
        use_ollama_secondary = _is_ollama_model(secondary_model)
        if use_ollama_secondary:
            ollama_base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            ollama_api_key = os.getenv("OLLAMA_API_KEY", "") or "ollama"
            llm = openai.LLM(
                model=secondary_model,
                base_url=ollama_base + "/v1",
                api_key=ollama_api_key,
                reasoning_effort=reasoning_effort,
                timeout=httpx.Timeout(connect=30.0, read=120.0, write=30.0, pool=30.0),
            )
            logger.info(
                "[LLM-FALLBACK] Using %s via Ollama (base=%s, reasoning_effort=%s)",
                secondary_model,
                ollama_base,
                reasoning_effort,
            )
        else:
            llm = google.LLM(model=secondary_model)
            logger.info("[LLM-FALLBACK] Using %s via Google", secondary_model)

    # STT with fallback: Google Cloud chirp_2 → LiveKit Inference Deepgram
    # If Google STT credentials are missing or lack IAM permission, skip to Deepgram directly
    stt_provider = os.getenv("STT_PRIMARY_PROVIDER", "google").lower()
    stt_list = []

    if stt_provider == "google" and gcp_creds and os.path.exists(gcp_creds):
        try:
            google_stt = google.STT(
                languages=["en-US"],
                model="chirp_2",
                spoken_punctuation=True,
                credentials_file=gcp_creds,
            )
            stt_list.append(google_stt)
            logger.info(
                "[STT] Primary: google chirp_2 (credentials_file=%s)", gcp_creds
            )
        except Exception as e:
            logger.warning("[STT] Failed to initialize Google STT: %s — skipping", e)
    else:
        logger.info(
            "[STT] Google STT skipped (no credentials or STT_PRIMARY_PROVIDER=%s)",
            stt_provider,
        )

    fallback_stt = inference.STT(model="deepgram/nova-3", language="en")
    stt_list.append(fallback_stt)
    logger.info("[STT] Fallback: deepgram/nova-3 (via LiveKit Inference)")

    if len(stt_list) > 1:
        stt_adapter = stt_module.FallbackAdapter(
            stt_list,
            attempt_timeout=10.0,
            max_retry_per_stt=1,
            retry_interval=30.0,
        )
    else:
        stt_adapter = stt_list[0]

    # TTS: Google Cloud TTS primary (if creds available) → Deepgram aura-2 fallback
    # Google TTS is preferred — more stable than LiveKit Inference on flaky networks.
    # Deepgram via LiveKit Inference is kept as fallback only.
    tts_list = []

    if gcp_creds and os.path.exists(gcp_creds):
        try:
            google_tts = google.TTS(
                language="en-US",
                gender="neutral",
                voice_name=os.getenv("TTS_PRIMARY_VOICE", "en-US-Wavenet-D"),
                credentials_file=gcp_creds,
            )
            tts_list.append(google_tts)
            logger.info(
                "[TTS] Primary: google en-US-Wavenet-D (credentials_file=%s)",
                gcp_creds,
            )
        except Exception as e:
            logger.warning("[TTS] Failed to initialize Google TTS: %s — skipping", e)
    else:
        logger.info("[TTS] Google TTS skipped (no credentials file found)")

    # Fallback: Deepgram aura-2 via LiveKit Inference
    # IMPORTANT: inference.TTS expects voice NAMES (e.g. "athena"), not plugin model IDs
    tts_voice = os.getenv("DEEPGRAM_INFERENCE_VOICE", "athena")
    tts_list.append(
        inference.TTS(
            model="deepgram/aura-2",
            voice=tts_voice,
            language="en",
        )
    )
    logger.info(
        "[TTS] Fallback: deepgram/aura-2 (voice=%s) via LiveKit Inference", tts_voice
    )

    if len(tts_list) > 1:
        tts_adapter = tts_module.FallbackAdapter(
            tts_list,
            max_retry_per_tts=1,
        )
    else:
        tts_adapter = tts_list[0]

    session = AgentSession(
        stt=stt_adapter,
        llm=llm,
        tts=tts_adapter,
        vad=vad,
        turn_handling=TurnHandlingOptions(
            turn_detection=MultilingualModel(),
        ),
        # ── Interruption & turn-taking config ─────────────────────────
        allow_interruptions=True,
        min_interruption_duration=0.5,
        min_interruption_words=2,
        resume_false_interruption=True,
        false_interruption_timeout=1.0,
        # 1.5s silence before turn ends — interview candidates pause mid-thought
        min_endpointing_delay=1.5,
        max_endpointing_delay=4.0,
        # MUST be False with slow LLMs (Ollama/Gemini): preemptive_generation=True
        # caused a 35-second audio pipeline lead time (confirmed from logs), producing
        # overlapping double-responses after every candidate turn. Disable entirely.
        preemptive_generation=False,
        user_away_timeout=None,
        userdata={},
    )

    # --- Instantiate our stateful agent — pass bank_items directly so
    # on_session_start doesn't depend on userdata timing
    interviewer = InterviewerAgent(metadata=metadata, bank_items=bank_items)

    # --- Shutdown callback: persist transcript to DB, trigger Judge Agent ---
    # IMPORTANT: read from `session.userdata` first (where InterviewerAgent writes it),
    # but also fall back to the agent's own `transcript` attribute in case _close()
    # never ran (e.g. unexpected disconnect before _close() could write userdata).
    # ctx.proc.userdata is a different object (process-level) and is NOT used here.
    async def on_shutdown():
        # Defensive: session.userdata raises ValueError if session never fully started
        try:
            transcript = session.userdata.get("transcript", [])
            session_complete = session.userdata.get("session_complete", False)
            source = "session.userdata"
            userdata_available = True
        except ValueError:
            logger.warning(
                f"[SHUTDOWN] session={session_id} session never started, userdata not available"
            )
            transcript = []
            session_complete = False
            source = "interviewer.transcript (session never started)"
            userdata_available = False

        # Fallback: if userdata is empty but the agent has transcript turns,
        # it means _close() never ran (unexpected disconnect). Grab from agent directly.
        if (
            not transcript
            and hasattr(interviewer, "transcript")
            and interviewer.transcript
        ):
            transcript = list(interviewer.transcript)  # copy to avoid mutation
            source = "interviewer.transcript (fallback)"
            # Only persist to userdata if it's accessible
            if userdata_available:
                session.userdata["transcript"] = transcript

        logger.info(
            f"[SHUTDOWN] session={session_id} transcript_turns={len(transcript)} "
            f"source={source} session_complete={session_complete}"
        )

        if transcript:
            backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
            endpoint = (
                f"{backend_url}/api/v1/live-interview-v2/session/{session_id}/complete"
            )
            try:
                import httpx

                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(
                        endpoint,
                        json={"transcript": transcript},
                        headers={"Content-Type": "application/json"},
                    )
                    resp.raise_for_status()
                    logger.info(
                        f"Session {session_id}: transcript POSTed to backend ({len(transcript)} turns)"
                    )
            except Exception as e:
                logger.error(
                    f"Session {session_id}: failed to POST transcript to backend: {e}"
                )
        else:
            logger.warning(
                f"Session {session_id}: no transcript to save (source={source})"
            )

    ctx.add_shutdown_callback(on_shutdown)

    # --- Start the session ---
    # Defensive: session.start() connects to the LiveKit room. If the
    # connection token is invalid/expired (e.g. 401 Unauthorized) or the
    # room is unreachable, the error is caught here so on_shutdown can
    # still run gracefully (transcript may be empty for never-started sessions).
    try:
        await session.start(
            room=ctx.room,
            agent=interviewer,
            room_options=room_io.RoomOptions(
                audio_input=room_io.AudioInputOptions(
                    noise_cancellation=None,
                ),
            ),
        )
    except Exception as e:
        logger.error(
            "[AGENT-START-FAILED] session=%s error=%s — "
            "room connection failed. The on_shutdown callback will handle cleanup.",
            session_id,
            e,
        )
        # Let the error propagate so the LiveKit worker can mark the job as failed
        # and potentially retry. on_shutdown will still fire (defensive via BUG D fix).
        raise

    logger.info(
        "[AGENT-READY] session=%s bank_items=%d lang=%s budget=%d",
        session_id,
        len(bank_items),
        language,
        time_budget,
    )

    logger.info(f"Session {session_id}: agent is live and listening.")


if __name__ == "__main__":
    agents.cli.run_app(server)
