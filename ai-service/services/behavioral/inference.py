"""
trial_c behavioral inference — ported from behavioural/fastapi_service/main.py.

Single-trial (trial_c) version: loads the NB-B3 temporal model once (lazy
singleton), extracts 8 uniform face-cropped frames from a video, and returns the
8-field behavioral assessment. No cloud APIs; weights load fully offline.
"""

import json
import logging
import tempfile
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional

import cv2
import numpy as np
import torch
import torchvision.transforms as T

from config import settings
from services.behavioral.face_crop import detect_and_crop_face
from services.behavioral.labels import (
    COMPOSED_EMOTIONS,
    EMOTION_CLASSES,
    EMOTION_MAP,
    TRAITS_6,
    TREND_LABELS,
)
from services.behavioral.model_nbb import TrialCTemporalModel

logger = logging.getLogger("behavioral")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NUM_FRAMES: int = 8

# ai-service root == parents[2] of services/behavioral/inference.py
_AI_SERVICE_ROOT: Path = Path(__file__).resolve().parents[2]

_EMOTIONS_LIST: List[str] = list(EMOTION_MAP.keys())
# Emotion base-score matrix for nearest-neighbour fallback, shape (8, 6)
_EMOTION_BASE: np.ndarray = np.array(
    [[EMOTION_MAP[e][t] for t in TRAITS_6] for e in _EMOTIONS_LIST],
    dtype=np.float32,
)

_FRAME_TRANSFORM = T.Compose([
    T.ToPILImage(),
    T.Resize((224, 224)),
    T.ToTensor(),
])

# Stable mock payload for USE_MOCK / API-shape tests.
SAMPLE_RESULT: Dict = {
    "confidence_level": 0.62,
    "anxiety_signal": 0.28,
    "engagement_level": 0.71,
    "emotional_stability": 0.66,
    "dominant_emotion": "neutral",
    "engagement_trend": "flat",
    "composed_ratio": 0.5,
    "behavioral_summary": (
        "The candidate displays moderate confidence with minimal visible anxiety "
        "and strong engagement throughout the clip. Engagement trend is flat over "
        "the course of the recording."
    ),
}

# ---------------------------------------------------------------------------
# Lazy model singleton
# ---------------------------------------------------------------------------

_device: Optional[torch.device] = None
_nbb_model: Optional[TrialCTemporalModel] = None
_nba_model = None  # backbone (TrialCResNet) — has forward_with_emotion
_emotion_prior_weights: Optional[torch.Tensor] = None


def _resolve_models_dir() -> Path:
    raw = Path(settings.BEHAVIORAL_MODELS_DIR)
    return raw if raw.is_absolute() else (_AI_SERVICE_ROOT / raw).resolve()


def load_model() -> None:
    """Load the trial_c NB-B3 model once into module globals (idempotent)."""
    global _device, _nbb_model, _nba_model, _emotion_prior_weights
    if _nbb_model is not None:
        return

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    models_dir = _resolve_models_dir()
    nbb_path = models_dir / settings.BEHAVIORAL_NBB_WEIGHTS
    if not nbb_path.exists():
        raise FileNotFoundError(
            f"trial_c NB-B weights not found at {nbb_path}. "
            f"Copy trial_c_nbb_best.pth into {models_dir}."
        )

    logger.info("Loading trial_c behavioral model: %s (device=%s)", nbb_path, _device)
    model = TrialCTemporalModel()
    model.load_state_dict(torch.load(nbb_path, map_location=_device))
    model.to(_device).eval()
    _nbb_model = model
    _nba_model = model.backbone   # TrialCResNet with trained emotion head
    _nba_model.eval()

    # Emotion-head prior correction weights (undo class-weighted CE training bias).
    _emotion_prior_weights = None
    nba_results = models_dir / "trial_c_nba_results.json"
    if nba_results.exists():
        weights = json.loads(nba_results.read_text()).get("emotion_class_weights")
        if weights:
            _emotion_prior_weights = torch.tensor(
                weights, dtype=torch.float32, device=_device
            )


# ---------------------------------------------------------------------------
# Frame extraction
# ---------------------------------------------------------------------------

def _extract_frames_from_path(video_path: str) -> np.ndarray:
    """
    Uniformly sample NUM_FRAMES face-cropped frames from a local video file.

    Returns:
        Float32 array of shape (NUM_FRAMES, 3, 224, 224) with values in [0, 1].

    Raises:
        ValueError: If the file cannot be opened or has no frames.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total < 1:
        cap.release()
        raise ValueError("Video has no readable frames")

    indices = np.linspace(0, max(total - 1, 0), NUM_FRAMES, dtype=int)
    frames: List[np.ndarray] = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ret, frame = cap.read()
        if not ret or frame is None:
            frame = np.zeros((224, 224, 3), dtype=np.uint8)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_rgb = detect_and_crop_face(frame_rgb)
        tensor = _FRAME_TRANSFORM(frame_rgb)
        frames.append(tensor.numpy())

    cap.release()
    return np.stack(frames, axis=0).astype(np.float32)


def download_and_extract_frames(url: str) -> np.ndarray:
    """Download a video from a URL and extract NUM_FRAMES uniform frames."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "EraMatch/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            video_bytes = resp.read()
    except urllib.error.URLError as exc:
        raise ValueError(f"Video download failed: {exc}") from exc

    suffix = Path(url.split("?")[0]).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = Path(tmp.name)
    try:
        return _extract_frames_from_path(str(tmp_path))
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def _nearest_emotion(scores_6: np.ndarray) -> str:
    """Map 6-dim behavioural scores to the closest emotion name by L2 distance."""
    dists = np.linalg.norm(_EMOTION_BASE - scores_6[None, :], axis=1)
    return _EMOTIONS_LIST[int(np.argmin(dists))]


def generate_summary(confidence: float, anxiety: float, engagement: float, trend: str) -> str:
    """Generate a two-sentence plain-English behavioral summary from scores."""
    if confidence >= 0.70:
        conf_desc = "high confidence"
    elif confidence >= 0.45:
        conf_desc = "moderate confidence"
    else:
        conf_desc = "low confidence"

    if anxiety < 0.30:
        anx_desc = "minimal visible anxiety"
    elif anxiety < 0.55:
        anx_desc = "some anxiety signals"
    else:
        anx_desc = "elevated anxiety"

    if engagement >= 0.65:
        eng_desc = "strong engagement"
    elif engagement >= 0.40:
        eng_desc = "moderate engagement"
    else:
        eng_desc = "low engagement"

    sentence1 = (
        f"The candidate displays {conf_desc} with {anx_desc} "
        f"and {eng_desc} throughout the clip."
    )
    sentence2 = f"Engagement trend is {trend} over the course of the recording."
    return f"{sentence1} {sentence2}"


def run_inference(frames_np: np.ndarray) -> Dict:
    """
    Run NB-A (per-frame emotion) and NB-B (temporal) inference on 8 frames.

    Args:
        frames_np: Float32 array of shape (8, 3, 224, 224) in [0, 1].

    Returns:
        Dict with the 7 non-summary output fields.
    """
    if _nbb_model is None:
        load_model()

    frames_tensor = torch.from_numpy(frames_np).to(_device)   # (8, 3, 224, 224)

    with torch.no_grad():
        # Per-frame emotions via the trained 7-class emotion head.
        if hasattr(_nba_model, "forward_with_emotion"):
            _, emotion_logits = _nba_model.forward_with_emotion(frames_tensor)
            emotion_probs = torch.softmax(emotion_logits, dim=1)
            if _emotion_prior_weights is not None:
                emotion_probs = emotion_probs / _emotion_prior_weights
            frame_emotions = [
                EMOTION_CLASSES[int(i)]
                for i in emotion_probs.argmax(dim=1).cpu().tolist()
            ]
        else:
            nba_np = _nba_model(frames_tensor).cpu().numpy()      # (8, 6)
            frame_emotions = [_nearest_emotion(nba_np[i]) for i in range(NUM_FRAMES)]

        # Temporal NB-B prediction → 5 aggregate scores + trend.
        video_tensor = frames_tensor.unsqueeze(0)                # (1, 8, 3, 224, 224)
        reg_out, trend_logits = _nbb_model(video_tensor)
        reg_np = reg_out.cpu().numpy()[0]                        # (5,)
        trend_idx = int(trend_logits.argmax(dim=1).cpu().item())

    dominant_emotion = Counter(frame_emotions).most_common(1)[0][0]
    composed_ratio = sum(1 for e in frame_emotions if e in COMPOSED_EMOTIONS) / NUM_FRAMES

    return {
        "confidence_level": float(np.clip(reg_np[0], 0.0, 1.0)),
        "anxiety_signal": float(np.clip(reg_np[1], 0.0, 1.0)),
        "engagement_level": float(np.clip(reg_np[2], 0.0, 1.0)),
        "emotional_stability": float(np.clip(reg_np[3], 0.0, 1.0)),
        "dominant_emotion": dominant_emotion,
        "engagement_trend": TREND_LABELS[trend_idx],
        "composed_ratio": float(composed_ratio),
    }


def analyze_video_url(video_url: str) -> Dict:
    """
    Public entry: download a video, run trial_c inference, return 8 fields.

    Honors settings.USE_MOCK (returns SAMPLE_RESULT without loading the model).
    """
    if settings.USE_MOCK:
        return dict(SAMPLE_RESULT)

    frames_np = download_and_extract_frames(video_url)
    raw = run_inference(frames_np)
    raw["behavioral_summary"] = generate_summary(
        confidence=raw["confidence_level"],
        anxiety=raw["anxiety_signal"],
        engagement=raw["engagement_level"],
        trend=raw["engagement_trend"],
    )
    return raw
