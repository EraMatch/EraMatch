"""Proctoring signal adapters wired to local draft model weights with raw payload inference."""

from __future__ import annotations

import base64
import binascii
import importlib
import os
from pathlib import Path
from typing import Any

import numpy as np

from config import settings


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _severity_from_risk(risk: float) -> str:
    if risk >= 0.75:
        return "high"
    if risk >= 0.45:
        return "medium"
    return "low"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _drafts_root() -> Path:
    configured = os.getenv("PROCTORING_DRAFTS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    default_from_settings = getattr(settings, "PROCTORING_DRAFTS_DIR", "../gp-assessment-env-drafts")
    return (_repo_root() / default_from_settings).resolve()


class _ModelRegistry:
    def __init__(self) -> None:
        root = _drafts_root()
        self.root = root
        self.emotion_model_file = root / "Emotion classification" / "model_keras.h5"
        self.emotion_weights_file = root / "Emotion classification" / "model_weights.h5"
        self.face_tflite_file = root / "Eye monitoring" / "mobilefacenet.tflite"
        self.gaze_weights_file = root / "Eye monitoring" / "Eye gaze" / "gaze_model_final.pth"
        self.speaker_profiles_dir = root / "Speaker Identification" / "speaker_profiles"

        self._speaker_profiles: dict[str, np.ndarray] | None = None
        self._emotion_loader_error: str | None = None
        self._voice_loader_error: str | None = None
        self._emotion_model: Any | None = None
        self._emotion_labels = [
            "anger",
            "contempt",
            "disgust",
            "fear",
            "happy",
            "sadness",
            "surprise",
        ]
        self._face_cascade: Any | None = None
        self._voice_feature_extractor: Any | None = None
        self._voice_model: Any | None = None

    def wired_status(self) -> dict[str, Any]:
        return {
            "drafts_root": str(self.root),
            "emotion_model_present": self.emotion_model_file.exists(),
            "emotion_weights_present": self.emotion_weights_file.exists(),
            "face_weights_present": self.face_tflite_file.exists(),
            "gaze_weights_present": self.gaze_weights_file.exists(),
            "speaker_profiles_present": self.speaker_profiles_dir.exists(),
            "emotion_loader_error": self._emotion_loader_error,
            "voice_loader_error": self._voice_loader_error,
        }

    def get_face_cascade(self) -> Any | None:
        cv2 = _get_cv2()
        if cv2 is None:
            return None
        if self._face_cascade is None:
            self._face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
        if self._face_cascade.empty():
            return None
        return self._face_cascade

    def get_emotion_model(self) -> Any | None:
        if self._emotion_model is not None:
            return self._emotion_model

        model_path = self.emotion_model_file if self.emotion_model_file.exists() else None
        if model_path is None:
            self._emotion_loader_error = "emotion_model_file_not_found"
            return None

        try:
            tf_models = importlib.import_module("tensorflow.keras.models")
            self._emotion_model = tf_models.load_model(str(model_path), compile=False)
            self._emotion_loader_error = None
            return self._emotion_model
        except Exception as exc:
            self._emotion_loader_error = str(exc)
            return None

    def get_voice_embedder(self) -> tuple[Any, Any] | None:
        if self._voice_feature_extractor is not None and self._voice_model is not None:
            return self._voice_feature_extractor, self._voice_model

        try:
            transformers = importlib.import_module("transformers")

            self._voice_feature_extractor = transformers.AutoFeatureExtractor.from_pretrained(
                "microsoft/wavlm-base-plus"
            )
            self._voice_model = transformers.WavLMModel.from_pretrained("microsoft/wavlm-base-plus")
            self._voice_model.eval()
            self._voice_loader_error = None
            return self._voice_feature_extractor, self._voice_model
        except Exception as exc:
            self._voice_loader_error = str(exc)
            return None

    def get_speaker_profile(self, profile_id: str | None) -> np.ndarray | None:
        profile_key = (profile_id or "yousef_said_wavlm").strip().lower()
        if self._speaker_profiles is None:
            self._speaker_profiles = {}
            if self.speaker_profiles_dir.exists():
                for npy_path in self.speaker_profiles_dir.glob("*.npy"):
                    self._speaker_profiles[npy_path.stem.lower()] = np.load(npy_path)
        return self._speaker_profiles.get(profile_key)


REGISTRY = _ModelRegistry()


def _dependency_available(module_name: str) -> bool:
    try:
        importlib.import_module(module_name)
        return True
    except Exception:
        return False


def _get_cv2() -> Any | None:
    try:
        return importlib.import_module("cv2")
    except Exception:
        return None


def _strip_data_url_prefix(blob: str) -> str:
    if "," in blob and blob.startswith("data:"):
        return blob.split(",", 1)[1]
    return blob


def _decode_image(frame_b64: str | None) -> np.ndarray | None:
    if not frame_b64:
        return None
    cv2 = _get_cv2()
    if cv2 is None:
        return None
    try:
        decoded = base64.b64decode(_strip_data_url_prefix(frame_b64), validate=False)
    except (binascii.Error, ValueError):
        return None
    arr = np.frombuffer(decoded, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return frame


def _to_float_waveform(
    audio_waveform: list[float] | None,
    audio_sample_rate: int | None,
) -> tuple[np.ndarray, int] | tuple[None, None]:
    if not audio_waveform:
        return None, None
    raw = np.asarray(audio_waveform, dtype=np.float32).flatten()
    if raw.size == 0:
        return None, None

    sr = int(audio_sample_rate or 16000)
    sr = max(8000, min(96000, sr))

    if sr != 16000:
        # Lightweight linear interpolation resampling to avoid heavy audio deps.
        duration = raw.shape[0] / sr
        target_len = max(1, int(duration * 16000))
        src_x = np.linspace(0.0, duration, num=raw.shape[0], endpoint=False)
        dst_x = np.linspace(0.0, duration, num=target_len, endpoint=False)
        raw = np.interp(dst_x, src_x, raw).astype(np.float32)
        sr = 16000

    raw = np.clip(raw, -1.0, 1.0)
    return raw, sr


def _emotion_from_frame(frame_bgr: np.ndarray | None) -> tuple[float | None, str | None, dict[str, float]]:
    cv2 = _get_cv2()
    if cv2 is None:
        return None, None, {}

    if frame_bgr is None:
        return None, None, {}

    model = REGISTRY.get_emotion_model()
    cascade = REGISTRY.get_face_cascade()
    if model is None or cascade is None:
        return None, None, {}

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.3, 5)
    if len(faces) == 0:
        return None, None, {}

    # Use the largest face as primary subject.
    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    roi_gray = gray[y : y + h, x : x + w]
    if roi_gray.size == 0:
        return None, None, {}

    roi = cv2.resize(roi_gray, (48, 48), interpolation=cv2.INTER_AREA)
    roi_rgb = cv2.cvtColor(roi, cv2.COLOR_GRAY2RGB).astype("float32") / 255.0
    roi_input = np.expand_dims(roi_rgb, axis=0)

    prediction = model.predict(roi_input, verbose=0)
    probs = np.asarray(prediction[0], dtype=np.float32)
    if probs.ndim != 1 or probs.size != len(REGISTRY._emotion_labels):
        return None, None, {}

    max_idx = int(np.argmax(probs))
    dominant = REGISTRY._emotion_labels[max_idx]
    distribution = {
        label: float(probs[idx]) for idx, label in enumerate(REGISTRY._emotion_labels)
    }
    stress = float(
        distribution.get("anger", 0.0)
        + distribution.get("fear", 0.0)
        + distribution.get("disgust", 0.0)
        + distribution.get("sadness", 0.0)
        + distribution.get("contempt", 0.0)
    )
    return _clamp(stress), dominant, distribution


def _voice_embedding_from_waveform(
    audio_waveform: list[float] | None,
    audio_sample_rate: int | None,
) -> np.ndarray | None:
    waveform, sample_rate = _to_float_waveform(audio_waveform, audio_sample_rate)
    if waveform is None:
        return None

    embedder = REGISTRY.get_voice_embedder()
    if embedder is None:
        return None

    try:
        torch = importlib.import_module("torch")
    except Exception as exc:
        REGISTRY._voice_loader_error = str(exc)
        return None

    feature_extractor, voice_model = embedder
    inputs = feature_extractor(waveform, sampling_rate=sample_rate, return_tensors="pt")
    with torch.no_grad():
        outputs = voice_model(**inputs)
    emb = outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy()
    if emb.ndim == 0:
        return None
    return emb.astype(np.float32)


def _frame_face_observations(frame_b64: str | None) -> dict[str, float | int | bool] | None:
    cv2 = _get_cv2()
    if cv2 is None:
        return None
    frame = _decode_image(frame_b64)
    cascade = REGISTRY.get_face_cascade()
    if frame is None or cascade is None:
        return None

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.2, 5)
    faces_detected = int(len(faces))

    liveness_score = 0.0
    if faces_detected > 0:
        x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
        roi = gray[y : y + h, x : x + w]
        if roi.size > 0:
            # Blur/laplacian-based sharpness proxy for liveness texture confidence.
            variance = float(cv2.Laplacian(roi, cv2.CV_64F).var())
            liveness_score = _clamp(variance / 220.0)

    return {
        "faces_detected": faces_detected,
        "multiple_faces": faces_detected > 1,
        "liveness_score": liveness_score,
    }


def inference_readiness() -> dict[str, Any]:
    wiring = REGISTRY.wired_status()

    cv2_available = _dependency_available("cv2")
    torch_available = _dependency_available("torch")
    transformers_available = _dependency_available("transformers")
    tensorflow_available = _dependency_available("tensorflow")

    face_ready = bool(cv2_available and wiring["face_weights_present"])
    gaze_ready = bool(cv2_available and wiring["gaze_weights_present"])
    emotion_ready = bool(
        cv2_available
        and tensorflow_available
        and wiring["emotion_model_present"]
        and wiring["emotion_weights_present"]
        and not wiring.get("emotion_loader_error")
    )
    voice_ready = bool(
        torch_available
        and transformers_available
        and wiring["speaker_profiles_present"]
        and not wiring.get("voice_loader_error")
    )

    return {
        "ready": face_ready and gaze_ready and emotion_ready and voice_ready,
        "dependencies": {
            "cv2": cv2_available,
            "tensorflow": tensorflow_available,
            "torch": torch_available,
            "transformers": transformers_available,
        },
        "models": {
            "face": {
                "ready": face_ready,
                "weights_present": wiring["face_weights_present"],
            },
            "gaze": {
                "ready": gaze_ready,
                "weights_present": wiring["gaze_weights_present"],
            },
            "emotion": {
                "ready": emotion_ready,
                "model_present": wiring["emotion_model_present"],
                "weights_present": wiring["emotion_weights_present"],
                "loader_error": wiring.get("emotion_loader_error"),
            },
            "voice": {
                "ready": voice_ready,
                "speaker_profiles_present": wiring["speaker_profiles_present"],
                "loader_error": wiring.get("voice_loader_error"),
            },
        },
        "wiring": wiring,
    }


def _cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    denom = float(np.linalg.norm(vec1) * np.linalg.norm(vec2))
    if denom == 0:
        return 0.0
    return float(np.dot(vec1, vec2) / denom)


def evaluate_face_signal(
    faces_detected: int,
    multiple_faces: bool,
    face_match_score: float | None,
    liveness_score: float | None,
    face_model_score: float | None = None,
    frame_b64: str | None = None,
) -> dict:
    risk = 0.0
    event_type = "face_ok"
    used_weighted_input = False

    resolved_face_match = face_match_score
    resolved_faces_detected = faces_detected
    resolved_multiple_faces = multiple_faces
    resolved_liveness = liveness_score

    inferred = _frame_face_observations(frame_b64)
    if inferred is not None:
        resolved_faces_detected = int(inferred["faces_detected"])
        resolved_multiple_faces = bool(inferred["multiple_faces"])
        resolved_liveness = float(inferred["liveness_score"])
        used_weighted_input = True

    if face_model_score is not None:
        resolved_face_match = face_model_score
        used_weighted_input = True

    if resolved_multiple_faces:
        risk += 0.85
        event_type = "multi_face_detected"
    elif resolved_faces_detected <= 0:
        risk += 0.75
        event_type = "face_absent"

    if resolved_face_match is not None and resolved_face_match < 0.55:
        risk += 0.55
        event_type = "face_mismatch"

    if resolved_liveness is not None and resolved_liveness < 0.5:
        risk += 0.35
        if event_type == "face_ok":
            event_type = "low_liveness"

    risk = _clamp(risk)
    confidence = _clamp(0.58 + (risk * 0.38))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "faces_detected": resolved_faces_detected,
            "multiple_faces": resolved_multiple_faces,
            "liveness_score": resolved_liveness,
            "face_match_score": resolved_face_match,
            "used_frame_inference": inferred is not None,
        },
    }


def evaluate_voice_signal(
    speaker_match_score: float | None,
    voice_switch_detected: bool,
    silence_ratio: float,
    background_speaker_count: int,
    voice_embedding: list[float] | None = None,
    speaker_profile_id: str | None = None,
    audio_waveform: list[float] | None = None,
    audio_sample_rate: int | None = None,
) -> dict:
    risk = 0.0
    event_type = "voice_ok"
    used_weighted_input = False

    resolved_speaker_match = speaker_match_score
    resolved_embedding: np.ndarray | None = None

    if audio_waveform:
        resolved_embedding = _voice_embedding_from_waveform(audio_waveform, audio_sample_rate)
        if resolved_embedding is not None:
            used_weighted_input = True

    if voice_embedding:
        resolved_embedding = np.asarray(voice_embedding, dtype=np.float32)
        used_weighted_input = True

    if resolved_embedding is not None:
        profile = REGISTRY.get_speaker_profile(speaker_profile_id)
        if profile is not None and resolved_embedding.shape == profile.shape:
            resolved_speaker_match = _clamp((_cosine_similarity(resolved_embedding, profile) + 1) / 2)

    if voice_switch_detected:
        risk += 0.85
        event_type = "voice_mismatch"

    if resolved_speaker_match is not None and resolved_speaker_match < 0.6:
        risk += 0.55
        event_type = "speaker_mismatch"

    if background_speaker_count > 0:
        risk += min(0.4, 0.15 * background_speaker_count)
        if event_type == "voice_ok":
            event_type = "background_speakers_detected"

    if silence_ratio > 0.7:
        risk += 0.2
        if event_type == "voice_ok":
            event_type = "excessive_silence"

    risk = _clamp(risk)
    confidence = _clamp(0.58 + (risk * 0.38))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "speaker_match_score": resolved_speaker_match,
            "used_raw_audio_inference": bool(audio_waveform) and resolved_embedding is not None,
            "used_voice_embedding": resolved_embedding is not None,
        },
    }


def evaluate_gaze_signal(
    off_screen_ratio: float,
    away_duration_seconds: float,
    rapid_shift_count: int,
    gaze_model_score: float | None = None,
    frame_b64: str | None = None,
) -> dict:
    risk = 0.0
    event_type = "gaze_ok"
    used_weighted_input = False

    resolved_off_screen_ratio = off_screen_ratio
    if gaze_model_score is None and frame_b64:
        inferred = _frame_face_observations(frame_b64)
        if inferred is not None:
            # Missing face in frame is treated as fully off-screen.
            resolved_off_screen_ratio = 1.0 if int(inferred["faces_detected"]) == 0 else 0.2
            used_weighted_input = True

    if resolved_off_screen_ratio >= 0.6:
        risk += 0.7
        event_type = "gaze_off_screen"
    elif resolved_off_screen_ratio >= 0.35:
        risk += 0.4
        event_type = "gaze_often_off_screen"

    if away_duration_seconds >= 10:
        risk += 0.35

    if rapid_shift_count >= 8:
        risk += 0.2

    if gaze_model_score is not None:
        used_weighted_input = True
        risk = _clamp((risk * 0.7) + (_clamp(gaze_model_score) * 0.3))

    risk = _clamp(risk)
    confidence = _clamp(0.52 + (risk * 0.43))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "off_screen_ratio": resolved_off_screen_ratio,
            "away_duration_seconds": away_duration_seconds,
            "rapid_shift_count": rapid_shift_count,
            "used_frame_inference": frame_b64 is not None,
        },
    }


def evaluate_emotion_signal(
    stress_score: float,
    negative_ratio: float,
    dominant_emotion: str | None,
    emotion_model_score: float | None = None,
    frame_b64: str | None = None,
) -> dict:
    risk = 0.0
    event_type = "emotion_ok"
    used_weighted_input = False

    resolved_stress = stress_score
    resolved_negative_ratio = negative_ratio
    resolved_dominant_emotion = dominant_emotion

    model_stress_score, model_dominant, model_distribution = _emotion_from_frame(_decode_image(frame_b64))
    if model_stress_score is not None:
        resolved_stress = model_stress_score
        resolved_dominant_emotion = model_dominant
        resolved_negative_ratio = _clamp(
            model_distribution.get("fear", 0.0)
            + model_distribution.get("disgust", 0.0)
            + model_distribution.get("sadness", 0.0)
            + model_distribution.get("anger", 0.0)
            + model_distribution.get("contempt", 0.0)
        )
        used_weighted_input = True

    if emotion_model_score is not None:
        resolved_stress = _clamp((resolved_stress * 0.6) + (_clamp(emotion_model_score) * 0.4))
        used_weighted_input = True

    if resolved_stress >= 0.8:
        risk += 0.55
        event_type = "emotion_stress_spike"
    elif resolved_stress >= 0.6:
        risk += 0.3
        event_type = "emotion_stress_rising"

    if resolved_negative_ratio >= 0.75:
        risk += 0.35
        if event_type == "emotion_ok":
            event_type = "emotion_negative_pattern"

    if resolved_dominant_emotion and resolved_dominant_emotion.lower() in {"fear", "disgust", "anger", "sadness", "contempt"}:
        risk += 0.15

    risk = _clamp(risk)
    confidence = _clamp(0.48 + (risk * 0.4))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "stress_score": resolved_stress,
            "negative_ratio": resolved_negative_ratio,
            "dominant_emotion": resolved_dominant_emotion,
            "distribution": model_distribution,
            "used_frame_inference": model_stress_score is not None,
        },
    }
