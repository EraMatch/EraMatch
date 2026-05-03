"""Production proctoring signal engine.

This module delegates to the weighted local proctoring implementation and
re-exports both public APIs and selected internal helpers used by tests.
"""

from . import proctoring_engine as _impl

REGISTRY = _impl.REGISTRY
inference_readiness = _impl.inference_readiness
evaluate_face_signal = _impl.evaluate_face_signal
evaluate_voice_signal = _impl.evaluate_voice_signal
evaluate_gaze_signal = _impl.evaluate_gaze_signal
evaluate_emotion_signal = _impl.evaluate_emotion_signal

# Test hooks / helper exports.
_frame_face_observations = _impl._frame_face_observations
_emotion_from_frame = _impl._emotion_from_frame
_voice_embedding_from_waveform = _impl._voice_embedding_from_waveform
