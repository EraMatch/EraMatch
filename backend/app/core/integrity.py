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

# Priority weight map for recruiter ranking UI.
# weight = PRIORITY_MAP.get(event_type, SEVERITY_BASE[severity]) * confidence
INTEGRITY_PRIORITY_MAP: dict[str, float] = {
    "paste_attempt": 10.0,
    "paste_shortcut": 10.0,
    "fusion_high_confidence_risk": 10.0,
    "multi_face_detected": 9.0,
    "voice_mismatch": 9.0,
    "speaker_mismatch": 8.5,
    "phone_detected": 8.0,
    "copy_attempt": 7.0,
    "no_face": 7.0,
    "tab_switch": 6.0,
    "fullscreen_exit": 5.0,
    "window_blur": 4.0,
}
INTEGRITY_SEVERITY_BASE: dict[str, float] = {"high": 5.0, "medium": 3.0, "low": 1.0}


def compute_priority_weight(event_type: str, severity: str, confidence: float) -> float:
    base = INTEGRITY_PRIORITY_MAP.get(event_type, INTEGRITY_SEVERITY_BASE.get(severity, 1.0))
    return round(base * max(0.0, min(1.0, confidence)), 2)
