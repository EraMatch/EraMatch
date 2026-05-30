"""Production proctoring endpoints for anti-cheating signal adapters.

These endpoints expose stable contracts while model integrations are still
being productionized.
"""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from config import settings

from services.proctoring import (
    REGISTRY,
    evaluate_face_signal,
    evaluate_voice_signal,
    evaluate_gaze_signal,
    evaluate_emotion_signal,
    evaluate_environment_signal,
    inference_readiness,
    process_frame_b64,
    extract_face_encoding_b64,
    validate_browser_event,
    validate_tab_switch_event,
    compute_trust_score,
    LivenessChallenge,
    detect_audio_amplitude,
    BROWSER_PREVENTION_EVENTS,
)

router = APIRouter()


class ProctoringSignalResponse(BaseModel):
    signal_type: str
    event_type: str
    severity: str
    risk_score: float = Field(..., ge=0.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    adapter_mode: str = "production"
    recommendation: str
    metadata: dict = Field(default_factory=dict)


def _enforce_model_and_proof(signal_type: str, result: dict, request_used_raw: bool) -> dict:
    adapter_mode = result.get("adapter_mode", "weighted_rules_fallback")
    resolved_inputs = result.get("resolved_inputs", {}) or {}
    model_wiring = result.get("model_wiring", {}) or {}

    proof = {
        "signal_type": signal_type,
        "model_required": bool(settings.PROCTORING_REQUIRE_MODEL),
        "request_used_raw_payload": request_used_raw,
        "adapter_mode": adapter_mode,
        "model_backed": adapter_mode == "weighted_local_v1",
        "resolved_inputs": resolved_inputs,
        "model_wiring": model_wiring,
    }

    if settings.PROCTORING_REQUIRE_MODEL and request_used_raw and adapter_mode != "weighted_local_v1":
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Model-required mode rejected fallback inference.",
                "proof": proof,
            },
        )
    return proof


class FaceSignalRequest(BaseModel):
    session_id: str
    faces_detected: int = 1
    multiple_faces: bool = False
    face_match_score: float | None = Field(default=None, ge=0.0, le=1.0)
    liveness_score: float | None = Field(default=None, ge=0.0, le=1.0)
    face_model_score: float | None = Field(default=None, ge=0.0, le=1.0)
    frame_b64: str | None = None
    reference_embedding: list[float] | None = None


class VoiceSignalRequest(BaseModel):
    session_id: str
    speaker_match_score: float | None = Field(default=None, ge=0.0, le=1.0)
    voice_switch_detected: bool = False
    silence_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    background_speaker_count: int = Field(default=0, ge=0)
    voice_embedding: list[float] | None = None
    speaker_profile_id: str | None = None
    audio_waveform: list[float] | None = None
    audio_sample_rate: int | None = Field(default=None, ge=8000, le=96000)


class GazeSignalRequest(BaseModel):
    session_id: str
    off_screen_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    away_duration_seconds: float = Field(default=0.0, ge=0.0)
    rapid_shift_count: int = Field(default=0, ge=0)
    gaze_model_score: float | None = Field(default=None, ge=0.0, le=1.0)
    frame_b64: str | None = None


class EmotionSignalRequest(BaseModel):
    session_id: str
    dominant_emotion: str | None = None
    stress_score: float = Field(default=0.0, ge=0.0, le=1.0)
    negative_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    emotion_model_score: float | None = Field(default=None, ge=0.0, le=1.0)
    frame_b64: str | None = None


@router.get("/wiring-status")
async def proctoring_wiring_status():
    return {
        "adapter_mode": "weighted_local_v1",
        "wiring": REGISTRY.wired_status(),
    }


@router.get("/inference-readiness")
async def proctoring_inference_readiness():
    return inference_readiness()


@router.post("/face", response_model=ProctoringSignalResponse)
async def face_signal(request: FaceSignalRequest):
    result = evaluate_face_signal(
        faces_detected=request.faces_detected,
        multiple_faces=request.multiple_faces,
        face_match_score=request.face_match_score,
        liveness_score=request.liveness_score,
        face_model_score=request.face_model_score,
        frame_b64=request.frame_b64,
        reference_embedding=request.reference_embedding,
    )
    proof = _enforce_model_and_proof("face", result, request.frame_b64 is not None)
    return ProctoringSignalResponse(
        signal_type="face",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Escalate to recruiter review if event repeats within short window.",
        metadata={
            "session_id": request.session_id,
            "faces_detected": request.faces_detected,
            "multiple_faces": request.multiple_faces,
            "face_match_score": request.face_match_score,
            "liveness_score": request.liveness_score,
            "face_model_score": request.face_model_score,
            "used_raw_frame": request.frame_b64 is not None,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )


@router.post("/voice", response_model=ProctoringSignalResponse)
async def voice_signal(request: VoiceSignalRequest):
    result = evaluate_voice_signal(
        speaker_match_score=request.speaker_match_score,
        voice_switch_detected=request.voice_switch_detected,
        silence_ratio=request.silence_ratio,
        background_speaker_count=request.background_speaker_count,
        voice_embedding=request.voice_embedding,
        speaker_profile_id=request.speaker_profile_id,
        audio_waveform=request.audio_waveform,
        audio_sample_rate=request.audio_sample_rate,
    )
    proof = _enforce_model_and_proof("voice", result, request.audio_waveform is not None or request.voice_embedding is not None)
    return ProctoringSignalResponse(
        signal_type="voice",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Combine with face and browser signals before auto-high-risk judgment.",
        metadata={
            "session_id": request.session_id,
            "speaker_match_score": request.speaker_match_score,
            "voice_switch_detected": request.voice_switch_detected,
            "silence_ratio": request.silence_ratio,
            "background_speaker_count": request.background_speaker_count,
            "speaker_profile_id": request.speaker_profile_id,
            "used_voice_embedding": request.voice_embedding is not None,
            "used_raw_audio": request.audio_waveform is not None,
            "audio_sample_rate": request.audio_sample_rate,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )


@router.post("/gaze", response_model=ProctoringSignalResponse)
async def gaze_signal(request: GazeSignalRequest):
    result = evaluate_gaze_signal(
        off_screen_ratio=request.off_screen_ratio,
        away_duration_seconds=request.away_duration_seconds,
        rapid_shift_count=request.rapid_shift_count,
        gaze_model_score=request.gaze_model_score,
        frame_b64=request.frame_b64,
    )
    proof = _enforce_model_and_proof("gaze", result, request.frame_b64 is not None)
    return ProctoringSignalResponse(
        signal_type="gaze",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Treat sustained off-screen behavior as suspicious only with repeated evidence.",
        metadata={
            "session_id": request.session_id,
            "off_screen_ratio": request.off_screen_ratio,
            "away_duration_seconds": request.away_duration_seconds,
            "rapid_shift_count": request.rapid_shift_count,
            "gaze_model_score": request.gaze_model_score,
            "used_raw_frame": request.frame_b64 is not None,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )


@router.post("/emotion", response_model=ProctoringSignalResponse)
async def emotion_signal(request: EmotionSignalRequest):
    result = evaluate_emotion_signal(
        stress_score=request.stress_score,
        negative_ratio=request.negative_ratio,
        dominant_emotion=request.dominant_emotion,
        emotion_model_score=request.emotion_model_score,
        frame_b64=request.frame_b64,
    )
    proof = _enforce_model_and_proof("emotion", result, request.frame_b64 is not None)
    return ProctoringSignalResponse(
        signal_type="emotion",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Use emotion only as a secondary signal due false-positive sensitivity.",
        metadata={
            "session_id": request.session_id,
            "dominant_emotion": request.dominant_emotion,
            "stress_score": request.stress_score,
            "negative_ratio": request.negative_ratio,
            "emotion_model_score": request.emotion_model_score,
            "used_raw_frame": request.frame_b64 is not None,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )


# =============================================================================
# SESSION-STATEFUL ENDPOINTS (mirrors Django's server-side tracking)
# =============================================================================

from services.proctoring_session import SESSION_MANAGER


class EnvironmentSignalRequest(BaseModel):
    session_id: str
    frame_b64: str | None = None
    screen_frame_b64: str | None = None


@router.post("/environment", response_model=ProctoringSignalResponse)
async def environment_signal(request: EnvironmentSignalRequest):
    result = evaluate_environment_signal(frame_b64=request.frame_b64, screen_frame_b64=request.screen_frame_b64)
    proof = _enforce_model_and_proof("environment", result, request.frame_b64 is not None or request.screen_frame_b64 is not None)
    return ProctoringSignalResponse(
        signal_type="environment",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Flag prohibited objects immediately. Verify person count.",
        metadata={"session_id": request.session_id, "proof": proof,
                  "resolved_inputs": result.get("resolved_inputs", {})},
    )


class UnifiedFrameRequest(BaseModel):
    session_id: str
    frame_b64: str
    stored_face_encoding: list[float] | None = None
    face_check_interval: float = Field(default=10.0, ge=1.0)


@router.post("/analyze-frame")
async def analyze_frame(request: UnifiedFrameRequest):
    """Unified per-frame analysis with server-side session state."""
    session = SESSION_MANAGER.get_or_create(request.session_id)

    # Use session's stored face encoding if caller didn't provide one
    face_encoding = request.stored_face_encoding or session.reference_face_encoding

    result = process_frame_b64(
        frame_b64=request.frame_b64,
        stored_face_encoding=face_encoding,
        liveness_challenge=session.liveness_challenge,
        face_check_interval=request.face_check_interval,
        last_face_check_time=session.last_face_check_time,
    )

    # Update session state from result
    session.last_face_check_time = result.get("last_face_check_time", session.last_face_check_time)

    # Filter for temporal persistence (e.g. must look away for 3s to trigger)
    confirmed_violations = session.process_frame_violations(
        result.get("violations", []), 
        persist_seconds=3.0
    )

    # Record confirmed violations into session
    for violation in confirmed_violations:
        session.cheating_event_count += 1
        session.violations.append({**violation, "timestamp": __import__("time").time()})

    SESSION_MANAGER.save(session)

    return {
        "session_id": request.session_id,
        "is_terminated": session.is_terminated,
        "trust_score": session.get_trust_score(),
        **result,
    }


class BrowserEventRequest(BaseModel):
    session_id: str
    event_type: str


@router.post("/browser-event")
async def browser_event(request: BrowserEventRequest):
    """Session-stateful browser event tracking — count persists server-side."""
    session = SESSION_MANAGER.get_or_create(request.session_id)
    result = session.record_browser_event(request.event_type)
    SESSION_MANAGER.save(session)
    return {
        "session_id": request.session_id,
        "trust_score": session.get_trust_score(),
        **result,
    }


@router.post("/trust-score")
async def trust_score(request: BaseModel = None, session_id: str = ""):
    """Get trust score from session state."""
    session = SESSION_MANAGER.get(session_id)
    if session is None:
        score = compute_trust_score(0)
        return {"trust_score": score, "cheating_event_count": 0, "session_found": False}
    return {
        "trust_score": session.get_trust_score(),
        "cheating_event_count": session.cheating_event_count,
        "session_found": True,
    }


class FaceEncodingRequest(BaseModel):
    session_id: str | None = None
    frame_b64: str


@router.post("/extract-face-encoding")
async def extract_encoding(request: FaceEncodingRequest):
    """Extract face encoding and optionally store as session reference."""
    encoding = extract_face_encoding_b64(request.frame_b64)

    # If session_id provided, store as reference encoding for identity checks
    if encoding is not None and request.session_id:
        session = SESSION_MANAGER.get_or_create(request.session_id)
        session.reference_face_encoding = encoding
        SESSION_MANAGER.save(session)

    return {"encoding": encoding, "success": encoding is not None,
            "stored_as_reference": encoding is not None and request.session_id is not None}


# --- Session management endpoints ---

@router.post("/session/start")
async def start_session(session_id: str):
    """Create a new proctoring session (call when exam starts)."""
    session = SESSION_MANAGER.get_or_create(session_id)
    return session.summary()


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get current session state."""
    session = SESSION_MANAGER.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.summary()


@router.delete("/session/{session_id}")
async def end_session(session_id: str):
    """Destroy a proctoring session (call when exam ends)."""
    session = SESSION_MANAGER.get(session_id)
    summary = session.summary() if session else None
    destroyed = SESSION_MANAGER.destroy(session_id)
    return {"destroyed": destroyed, "final_state": summary}


@router.get("/sessions")
async def list_sessions():
    """List all active proctoring sessions."""
    return {"active_count": SESSION_MANAGER.active_count(), "sessions": SESSION_MANAGER.list_sessions()}


@router.websocket("/ws/audio-stream/{session_id}")
async def audio_stream_ws(websocket: WebSocket, session_id: str):
    """
    Continuous audio stream pipeline over WebSocket.
    Clients can stream raw PCM chunks to be analyzed in real-time.
    """
    await websocket.accept()
    session = SESSION_MANAGER.get_or_create(session_id)
    import time
    
    # We may need a speaker profile id, assuming it can be passed or stored. 
    # Usually we can get it from session, if we had one.
    # We will just evaluate voice signal with raw data.
    try:
        while True:
            # Receive raw PCM bytes from the client
            data = await websocket.receive_bytes()
            
            # Analyze audio chunk for amplitude
            result = detect_audio_amplitude(data)
            
            # Check continuous voice embedding
            # We convert raw bytes to float waveform roughly (assuming 16kHz PCM 16-bit)
            import numpy as np
            try:
                audio_array = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                waveform = audio_array.tolist()
            except Exception:
                waveform = None

            voice_result = evaluate_voice_signal(
                speaker_match_score=None,
                voice_switch_detected=False,
                silence_ratio=0.0,
                background_speaker_count=0,
                voice_embedding=None,
                speaker_profile_id=session_id, # Or use candidate ID if available
                audio_waveform=waveform,
                audio_sample_rate=16000
            )

            is_voice_switch = voice_result.get("event_type") == "voice_switch"
            
            if result.get("exceeds_threshold") or is_voice_switch:
                violations_to_process = []
                
                if result.get("exceeds_threshold"):
                    violations_to_process.append({
                        "type": "audio_spike",
                        "description": f"Audio spike detected (amplitude: {result['max_amplitude']})",
                        "severity": "medium",
                        "timestamp": time.time()
                    })
                    
                if is_voice_switch:
                    violations_to_process.append({
                        "type": "voice_switch",
                        "description": "Different speaker detected in background",
                        "severity": "high",
                        "timestamp": time.time()
                    })
                
                # Apply temporal filtering
                confirmed_violations = session.process_frame_violations(violations_to_process, persist_seconds=2.0)
                
                for v in confirmed_violations:
                    session.cheating_event_count += 1
                    session.violations.append(v)
                    
                if confirmed_violations:
                    SESSION_MANAGER.save(session)
            
            await websocket.send_json({
                "status": "processed",
                "trust_score": session.get_trust_score(),
                "audio_spike": result.get("exceeds_threshold", False),
                "voice_switch": is_voice_switch
            })
    except WebSocketDisconnect:
        # Client disconnected normally
        pass

