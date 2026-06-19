"""
Unit/inference tests for the trial_c behavioral analysis port.

- test_analyze_mock: USE_MOCK path returns the 8-field sample (no torch model).
- test_run_inference_on_sample_video: loads the real trial_c weights and runs on
  the behavioural sample clip. Skipped automatically if weights or the sample
  video are not present.

Run: cd EraMatch/ai-service && python -m pytest tests/test_behavioral.py -v
"""
import os
import sys
from pathlib import Path

import pytest

AI_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_ROOT))

from services.behavioral import inference  # noqa: E402

_SAMPLE_VIDEO = Path("D:/em/behavioural/test_interview.mp4")
_WEIGHTS = inference._resolve_models_dir() / "trial_c_nbb_best.pth"

_EXPECTED_FIELDS = {
    "confidence_level",
    "anxiety_signal",
    "engagement_level",
    "emotional_stability",
    "dominant_emotion",
    "engagement_trend",
    "composed_ratio",
    "behavioral_summary",
}


def test_analyze_mock(monkeypatch):
    """USE_MOCK returns the stable 8-field sample without touching torch."""
    monkeypatch.setattr(inference.settings, "USE_MOCK", True)
    result = inference.analyze_video_url("http://example.com/whatever.mp4")
    assert set(result) == _EXPECTED_FIELDS
    assert isinstance(result["behavioral_summary"], str) and result["behavioral_summary"]
    assert result["engagement_trend"] in {"rising", "flat", "declining"}


@pytest.mark.skipif(not _WEIGHTS.exists(), reason="trial_c weights not present")
@pytest.mark.skipif(not _SAMPLE_VIDEO.exists(), reason="sample video not present")
def test_run_inference_on_sample_video():
    """Load trial_c and run end-to-end on the sample interview clip."""
    inference.load_model()
    frames = inference._extract_frames_from_path(str(_SAMPLE_VIDEO))
    assert frames.shape == (inference.NUM_FRAMES, 3, 224, 224)

    raw = inference.run_inference(frames)
    raw["behavioral_summary"] = inference.generate_summary(
        confidence=raw["confidence_level"],
        anxiety=raw["anxiety_signal"],
        engagement=raw["engagement_level"],
        trend=raw["engagement_trend"],
    )

    assert set(raw) == _EXPECTED_FIELDS
    for key in (
        "confidence_level",
        "anxiety_signal",
        "engagement_level",
        "emotional_stability",
        "composed_ratio",
    ):
        assert 0.0 <= raw[key] <= 1.0, f"{key} out of range: {raw[key]}"
    assert raw["engagement_trend"] in {"rising", "flat", "declining"}
    assert isinstance(raw["dominant_emotion"], str) and raw["dominant_emotion"]
