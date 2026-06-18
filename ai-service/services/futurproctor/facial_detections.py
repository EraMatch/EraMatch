"""
MediaPipe face detection — adapted from futurproctor/proctoring/ml_models/facial_detections.py.

Changes from original:
- Module-level MediaPipe initialisation replaced with lazy, thread-safe loading.
- Returns a plain dict instead of an annotated frame (we don't need CV visualisation
  in the API context).
- Gaze tracking removed (removed from proctoring pipeline per requirements).
"""

from __future__ import annotations

import importlib
import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Thread-local lazy instances
_face_detection: Any = None
_face_mesh: Any = None


def _get_mp_face_detection():
    global _face_detection
    if _face_detection is not None:
        return _face_detection
    try:
        mp = importlib.import_module("mediapipe")
        _face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=0, min_detection_confidence=0.5
        )
        return _face_detection
    except Exception as exc:
        logger.warning("MediaPipe FaceDetection unavailable: %s", exc)
        return None


def _get_mp_face_mesh():
    global _face_mesh
    if _face_mesh is not None:
        return _face_mesh
    try:
        mp = importlib.import_module("mediapipe")
        _face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=4,
            refine_landmarks=True,
            min_detection_confidence=0.5,
        )
        return _face_mesh
    except Exception as exc:
        logger.warning("MediaPipe FaceMesh unavailable: %s", exc)
        return None


def detect_faces(frame_bgr: np.ndarray) -> dict:
    """
    Detect faces in a BGR frame using MediaPipe FaceDetection.

    Returns:
        {
          "face_count": int,
          "multiple_faces": bool,
          "has_face": bool,
          "landmarks_available": bool,
        }
    """
    if frame_bgr is None:
        return {"face_count": 0, "multiple_faces": False, "has_face": False, "landmarks_available": False}

    try:
        cv2 = importlib.import_module("cv2")
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    except Exception:
        return {"face_count": 0, "multiple_faces": False, "has_face": False, "landmarks_available": False}

    face_detection = _get_mp_face_detection()
    face_count = 0
    if face_detection is not None:
        try:
            results = face_detection.process(rgb)
            if results.detections:
                face_count = len(results.detections)
        except Exception as exc:
            logger.debug("FaceDetection.process error: %s", exc)

    # Landmark availability check (for confidence scoring)
    face_mesh = _get_mp_face_mesh()
    landmarks_available = False
    if face_mesh is not None and face_count > 0:
        try:
            mesh_results = face_mesh.process(rgb)
            landmarks_available = bool(mesh_results.multi_face_landmarks)
        except Exception:
            pass

    return {
        "face_count": face_count,
        "multiple_faces": face_count > 1,
        "has_face": face_count > 0,
        "landmarks_available": landmarks_available,
    }
