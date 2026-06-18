"""
Audio amplitude analysis — adapted from futurproctor/proctoring/ml_models/audio_detection.py.

Changes from original:
- Removed PyAudio streaming loop (blocking, not suitable for an async API).
- Accepts raw PCM bytes or a numpy array produced by the WebSocket audio handler.
- Returns a plain dict; no WAV conversion (that's handled upstream if needed).
"""

from __future__ import annotations

import numpy as np

THRESHOLD = 2000  # amplitude units (16-bit PCM)
DTYPE = np.int16


def detect_speech(
    audio_data: bytes | np.ndarray,
    threshold: int = THRESHOLD,
) -> dict:
    """
    Determine whether speech-level audio is present in a PCM chunk.

    Args:
        audio_data: Raw 16-bit mono PCM bytes, or a numpy int16 array.
        threshold: Peak amplitude threshold above which speech is assumed.

    Returns:
        {
          "speech_detected": bool,
          "peak_amplitude": float,
          "rms": float,
        }
    """
    if isinstance(audio_data, (bytes, bytearray)):
        if len(audio_data) == 0:
            return {"speech_detected": False, "peak_amplitude": 0.0, "rms": 0.0}
        arr = np.frombuffer(audio_data, dtype=DTYPE)
    elif isinstance(audio_data, np.ndarray):
        arr = audio_data.astype(DTYPE) if audio_data.dtype != DTYPE else audio_data
    else:
        return {"speech_detected": False, "peak_amplitude": 0.0, "rms": 0.0}

    if arr.size == 0:
        return {"speech_detected": False, "peak_amplitude": 0.0, "rms": 0.0}

    peak = float(np.max(np.abs(arr)))
    rms = float(np.sqrt(np.mean(arr.astype(np.float64) ** 2)))

    return {
        "speech_detected": peak > threshold,
        "peak_amplitude": peak,
        "rms": rms,
    }
