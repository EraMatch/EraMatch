"""
YOLOv11 object detection — adapted from futurproctor/proctoring/ml_models/object_detection.py.

Changes from original:
- Removed Django imports and module-level model initialisation.
- Model path resolved at call-time via the shared REGISTRY so the same yolo11s.pt
  that proctoring_engine.py loads is reused; no second copy is instantiated.
- Returns a typed dataclass instead of a bare tuple.
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.5
RESIZE_WIDTH = 640
_OBJECTS_OF_INTEREST = {"person", "cell phone", "cellphone", "mobile phone", "book"}


@dataclass
class DetectionResult:
    labels: list[tuple[str, float]] = field(default_factory=list)
    person_count: int = 0
    detected_objects: list[str] = field(default_factory=list)


def detect_objects(
    frame_bgr: np.ndarray,
    yolo_model,
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
) -> DetectionResult:
    """
    Run YOLOv11 inference on a BGR frame.

    Args:
        frame_bgr: Input image as a numpy BGR array.
        yolo_model: Loaded ultralytics.YOLO instance (from REGISTRY.get_yolo_model()).
        confidence_threshold: Minimum score to keep a detection.

    Returns:
        DetectionResult with labels, person_count, and detected_objects.
    """
    if frame_bgr is None or not isinstance(frame_bgr, np.ndarray):
        return DetectionResult()

    try:
        cv2 = importlib.import_module("cv2")
    except ImportError:
        return DetectionResult()

    # Resize to speed up inference while preserving aspect ratio
    h, w = frame_bgr.shape[:2]
    if w > RESIZE_WIDTH:
        frame_bgr = cv2.resize(frame_bgr, (RESIZE_WIDTH, int(RESIZE_WIDTH * h / w)))

    try:
        results = yolo_model(frame_bgr, verbose=False)
    except Exception as exc:
        logger.error("YOLO inference failed: %s", exc)
        return DetectionResult()

    result = DetectionResult()
    for r in results:
        for box in r.boxes.data.cpu().numpy():
            x1, y1, x2, y2, score, class_id = box
            if score < confidence_threshold:
                continue
            label = yolo_model.names[int(class_id)]
            result.labels.append((label, float(score)))
            lower = label.lower()
            if lower == "person":
                result.person_count += 1
                result.detected_objects.append("person")
            elif lower in {"cell phone", "cellphone", "mobile phone"}:
                result.detected_objects.append("cell phone")
            elif lower == "book":
                result.detected_objects.append("book")

    return result
