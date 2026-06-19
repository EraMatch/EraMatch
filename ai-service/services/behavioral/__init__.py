"""
Behavioral analysis package — trial_c (ImageNet ResNet-18 + temporal transformer).

Ported into the EraMatch ai-service from the sibling `behavioural` project
(trial_c). Serves an 8-field behavioral assessment of an interview video. This
is a candidate-assessment feature and is intentionally SEPARATE from the
anti-cheating emotion/proctoring signals in services/proctoring_engine.py.
"""

from services.behavioral.inference import analyze_video_url

__all__ = ["analyze_video_url"]
