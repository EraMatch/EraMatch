import base64
import os
import sys
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

os.environ["USE_MOCK"] = "true"

AI_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_ROOT))

from main import app  # noqa: E402
from services import proctoring_beta  # noqa: E402


def _frame_b64() -> str:
    fake_jpeg = b"\xff\xd8\xff\xdb\x00C\x00" + (b"\x00" * 128) + b"\xff\xd9"
    return "data:image/jpeg;base64," + base64.b64encode(fake_jpeg).decode("utf-8")


def test_proctoring_end_to_end_raw_payload_model_flags(monkeypatch):
    monkeypatch.setattr(
        proctoring_beta,
        "_frame_face_observations",
        lambda _: {"faces_detected": 1, "multiple_faces": False, "liveness_score": 0.72},
    )
    monkeypatch.setattr(
        proctoring_beta,
        "_emotion_from_frame",
        lambda _: (
            0.42,
            "neutral",
            {
                "anger": 0.01,
                "contempt": 0.01,
                "disgust": 0.01,
                "fear": 0.04,
                "happy": 0.80,
                "sadness": 0.11,
                "surprise": 0.02,
            },
        ),
    )

    embedding = np.array([0.1, 0.2, 0.3, 0.4], dtype=np.float32)
    monkeypatch.setattr(proctoring_beta, "_voice_embedding_from_waveform", lambda *_: embedding)
    monkeypatch.setattr(proctoring_beta.REGISTRY, "get_speaker_profile", lambda *_: embedding)

    client = TestClient(app)
    sid = "session-it-raw-01"
    frame_b64 = _frame_b64()
    audio_waveform = [0.01] * 1600

    face = client.post(
        "/beta/proctoring/face",
        json={
            "session_id": sid,
            "faces_detected": 1,
            "multiple_faces": False,
            "liveness_score": 0.1,
            "frame_b64": frame_b64,
        },
    )
    assert face.status_code == 200
    face_json = face.json()
    assert face_json["adapter_mode"] == "weighted_local_v1"
    assert face_json["metadata"]["resolved_inputs"]["used_frame_inference"] is True

    voice = client.post(
        "/beta/proctoring/voice",
        json={
            "session_id": sid,
            "silence_ratio": 0.1,
            "background_speaker_count": 0,
            "speaker_profile_id": "yousef_said_wavlm",
            "audio_waveform": audio_waveform,
            "audio_sample_rate": 16000,
        },
    )
    assert voice.status_code == 200
    voice_json = voice.json()
    assert voice_json["adapter_mode"] == "weighted_local_v1"
    assert voice_json["metadata"]["resolved_inputs"]["used_raw_audio_inference"] is True

    gaze = client.post(
        "/beta/proctoring/gaze",
        json={
            "session_id": sid,
            "off_screen_ratio": 0.2,
            "away_duration_seconds": 1.0,
            "rapid_shift_count": 0,
            "frame_b64": frame_b64,
        },
    )
    assert gaze.status_code == 200
    gaze_json = gaze.json()
    assert gaze_json["adapter_mode"] == "weighted_local_v1"
    assert gaze_json["metadata"]["resolved_inputs"]["used_frame_inference"] is True

    emotion = client.post(
        "/beta/proctoring/emotion",
        json={
            "session_id": sid,
            "stress_score": 0.1,
            "negative_ratio": 0.1,
            "dominant_emotion": "neutral",
            "frame_b64": frame_b64,
        },
    )
    assert emotion.status_code == 200
    emotion_json = emotion.json()
    assert emotion_json["adapter_mode"] == "weighted_local_v1"
    assert emotion_json["metadata"]["resolved_inputs"]["used_frame_inference"] is True
