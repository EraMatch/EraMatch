"""Shared integrity / proctoring enforcement constants."""

INTEGRITY_EVENT_MAX_PER_MINUTE = 45
INTEGRITY_DUP_WINDOW_SECONDS = 8
INTEGRITY_ENFORCEMENT_WINDOW_SECONDS = 120
INTEGRITY_ENFORCEMENT_CRITICAL_EVENTS = {
    "paste_attempt",
    "paste_shortcut",
    "multi_face_detected",
    "voice_mismatch",
    "speaker_mismatch",
    "fusion_high_confidence_risk",
}
