"""
Label constants for trial_c behavioral inference.

Copied from the behavioural project's shared/dataset_loader.py (EMOTION_CLASSES)
and shared/heuristic_map.py (EMOTION_MAP). Only the constants needed at
inference are included here so we don't import the training-only dataset loader.
"""

from typing import Dict, List

# Canonical 7-class emotion ordering (RAF-DB folder order) used by the auxiliary
# emotion classification head in NB-A. Index i ↔ EMOTION_CLASSES[i].
EMOTION_CLASSES: List[str] = [
    "surprise", "fear", "disgust", "happy", "sad", "angry", "neutral"
]

# Trait order — must match the training label order (TRAITS_6).
TRAITS_6: List[str] = [
    "confidence", "anxiety", "engagement", "stability", "composed", "interview"
]

# Psychology-informed emotion → 6-trait base scores (8 emotions incl. calm).
# Used for the nearest-emotion fallback when no trained emotion head is present.
EMOTION_MAP: Dict[str, Dict[str, float]] = {
    "happy":   {"confidence": 0.8, "anxiety": 0.1, "engagement": 0.7,
                "stability": 0.7, "composed": 0.7, "interview": 0.75},
    "neutral": {"confidence": 0.6, "anxiety": 0.1, "engagement": 0.4,
                "stability": 0.8, "composed": 0.8, "interview": 0.60},
    "fear":    {"confidence": 0.2, "anxiety": 0.7, "engagement": 0.3,
                "stability": 0.3, "composed": 0.2, "interview": 0.25},
    "angry":   {"confidence": 0.3, "anxiety": 0.6, "engagement": 0.4,
                "stability": 0.3, "composed": 0.2, "interview": 0.30},
    "sad":     {"confidence": 0.3, "anxiety": 0.4, "engagement": 0.3,
                "stability": 0.4, "composed": 0.3, "interview": 0.30},
    "disgust": {"confidence": 0.3, "anxiety": 0.5, "engagement": 0.4,
                "stability": 0.3, "composed": 0.2, "interview": 0.25},
    "surprise":{"confidence": 0.5, "anxiety": 0.4, "engagement": 0.8,
                "stability": 0.4, "composed": 0.4, "interview": 0.50},
    "calm":    {"confidence": 0.7, "anxiety": 0.1, "engagement": 0.5,
                "stability": 0.9, "composed": 0.9, "interview": 0.75},
}

# Trend head index → label
TREND_LABELS: Dict[int, str] = {0: "rising", 1: "flat", 2: "declining"}

# Emotions counted toward the "composed" ratio
COMPOSED_EMOTIONS: frozenset = frozenset({"neutral", "calm"})
