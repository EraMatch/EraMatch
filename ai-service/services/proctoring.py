"""Production proctoring signal engine.

This module delegates to the weighted local proctoring implementation and
re-exports both public APIs and selected internal helpers used by tests.

Includes ported logic from the FuturProctor Cheating Prevention system.
"""

from . import proctoring_engine as _impl

# --- Core signal evaluators ---
REGISTRY = _impl.REGISTRY
inference_readiness = _impl.inference_readiness
evaluate_face_signal = _impl.evaluate_face_signal
evaluate_voice_signal = _impl.evaluate_voice_signal
evaluate_gaze_signal = _impl.evaluate_gaze_signal
evaluate_emotion_signal = _impl.evaluate_emotion_signal
evaluate_environment_signal = _impl.evaluate_environment_signal

# --- Ported from FuturProctor: Face encoding & matching ---
extract_face_encoding = _impl.extract_face_encoding
extract_face_encoding_b64 = _impl.extract_face_encoding_b64
match_face_encodings = _impl.match_face_encodings

# --- Ported from FuturProctor: Audio detection ---
detect_audio_amplitude = _impl.detect_audio_amplitude
create_wav_bytes = _impl.create_wav_bytes
AUDIO_THRESHOLD = _impl.AUDIO_THRESHOLD
AUDIO_SAMPLE_RATE = _impl.AUDIO_SAMPLE_RATE

# --- Ported from FuturProctor: Liveness challenge ---
LivenessChallenge = _impl.LivenessChallenge

# --- Ported from FuturProctor: Unified frame processor ---
process_frame = _impl.process_frame
process_frame_b64 = _impl.process_frame_b64

# --- Ported from FuturProctor: Trust & browser event validation ---
compute_trust_score = _impl.compute_trust_score
validate_tab_switch_event = _impl.validate_tab_switch_event
validate_browser_event = _impl.validate_browser_event
BROWSER_PREVENTION_EVENTS = _impl.BROWSER_PREVENTION_EVENTS

# --- Test hooks / helper exports ---
_frame_face_observations = _impl._frame_face_observations
_emotion_from_frame = _impl._emotion_from_frame
_voice_embedding_from_waveform = _impl._voice_embedding_from_waveform
