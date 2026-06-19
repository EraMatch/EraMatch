"""
Shared Haar-cascade face cropping — OpenCV preprocessing only.

Ported verbatim from the behavioural project (shared/face_crop.py). Train-time
and inference-time inputs must share the same tight face-crop distribution the
backbone was trained on.
"""

import cv2
import numpy as np

# Loaded once at module level; detectMultiScale is thread-safe for reads.
_face_cascade: cv2.CascadeClassifier = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def detect_and_crop_face(frame_rgb: np.ndarray, pad_ratio: float = 0.25) -> np.ndarray:
    """
    Detect the largest frontal face and return a padded crop.

    Falls back to the original frame when no face is found so processing is
    never blocked.

    Args:
        frame_rgb:  H×W×3 uint8 RGB image.
        pad_ratio:  Padding added around the bounding box relative to the
                    larger of width/height (default 0.25).

    Returns:
        Cropped face region (uint8 RGB), or the original frame if no face
        was detected.
    """
    gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
    faces = _face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40)
    )
    if len(faces) == 0:
        return frame_rgb

    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])   # largest by area
    pad = int(max(w, h) * pad_ratio)
    H, W = frame_rgb.shape[:2]
    x1, y1 = max(0, x - pad), max(0, y - pad)
    x2, y2 = min(W, x + w + pad), min(H, y + h + pad)
    return frame_rgb[y1:y2, x1:x2]
