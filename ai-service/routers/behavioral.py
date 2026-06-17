"""
Behavioral analysis router — trial_c.

POST /behavioral/analyze
Input:  {"video_url": "https://..."}
Output: 8-field behavioral JSON (confidence_level, anxiety_signal,
        engagement_level, emotional_stability, dominant_emotion,
        engagement_trend, composed_ratio, behavioral_summary)

This is a candidate-ASSESSMENT feature. It is intentionally separate from the
anti-cheating emotion/proctoring signals under /proctoring.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("behavioral")


class AnalyzeRequest(BaseModel):
    """POST /behavioral/analyze request body."""
    video_url: str


class BehavioralResponse(BaseModel):
    """8-field behavioral assessment of an interview clip."""
    confidence_level: float
    anxiety_signal: float
    engagement_level: float
    emotional_stability: float
    dominant_emotion: str
    engagement_trend: str
    composed_ratio: float
    behavioral_summary: str


@router.post("/analyze", response_model=BehavioralResponse)
def analyze(request: AnalyzeRequest) -> BehavioralResponse:
    """Analyze behavioral patterns in an interview video (trial_c model)."""
    logger.info("Behavioral analysis for video URL: %s", request.video_url)
    # Imported lazily so importing the router never triggers torch model load.
    from services.behavioral.inference import analyze_video_url

    try:
        result = analyze_video_url(request.video_url)
    except ValueError as exc:
        # Download / decode problems are client-fixable (bad URL, empty video).
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        # Missing model weights — server misconfiguration.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surface inference failure as 500
        logger.exception("Behavioral inference failed")
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc

    return BehavioralResponse(**result)


@router.get("/health")
def behavioral_health() -> dict:
    """Lightweight readiness probe (does not force model load)."""
    from pathlib import Path

    from config import settings
    from services.behavioral.inference import _resolve_models_dir

    models_dir = _resolve_models_dir()
    weights = models_dir / settings.BEHAVIORAL_NBB_WEIGHTS
    return {
        "service": "behavioral",
        "model": "trial_c",
        "weights_present": Path(weights).exists(),
        "weights_path": str(weights),
        "use_mock": settings.USE_MOCK,
    }
