"""
LiV2 test fixture factory functions.

Returns dicts representing request payloads for creating LiV2 entities via the API.
Does NOT directly create DB records — these are used to generate request payloads.
"""

import uuid
from copy import deepcopy
from typing import Optional

# ---------------------------------------------------------------------------
# Sample dimension data for rubrics
# ---------------------------------------------------------------------------
SAMPLE_DIMENSIONS = [
    {
        "dimension_id": "d3000001-0000-0000-0000-000000000001",
        "name": "Technical Knowledge",
        "weight": 40,
        "anchors": {
            "substandard": "Cannot explain basic concepts",
            "proficient": "Explains concepts clearly with examples",
            "excellent": "Demonstrates deep understanding with nuanced insights",
        },
    },
    {
        "dimension_id": "d3000002-0000-0000-0000-000000000002",
        "name": "Communication",
        "weight": 30,
        "anchors": {
            "substandard": "Unclear, disorganized responses",
            "proficient": "Clear and organized communication",
            "excellent": "Exceptional articulation with persuasive delivery",
        },
    },
    {
        "dimension_id": "d3000003-0000-0000-0000-000000000003",
        "name": "Problem Solving",
        "weight": 30,
        "anchors": {
            "substandard": "Cannot solve basic problems",
            "proficient": "Methodical approach to problem-solving",
            "excellent": "Creative and efficient problem-solving",
        },
    },
]

SAMPLE_BANK_ITEMS = [
    {
        "bank_item_id": "bi3000001-0000-0000-0000-000000000001",
        "text": "Tell me about your experience with distributed systems.",
        "primary_dimension_id": "d3000001-0000-0000-0000-000000000001",
        "dimension_name": "Technical Knowledge",
        "secondary_dimension_ids": ["d3000002-0000-0000-0000-000000000002"],
        "difficulty": "3",
        "is_mandatory": True,
        "is_approved": True,
        "estimated_duration_seconds": 180,
        "question_rubric": {
            "sub_criteria": [
                {"criterion": "Depth of knowledge", "weight": 0.5},
                {"criterion": "Practical application", "weight": 0.5},
            ]
        },
    },
    {
        "bank_item_id": "bi3000002-0000-0000-0000-000000000002",
        "text": "Describe how you would debug a performance issue in production.",
        "primary_dimension_id": "d3000003-0000-0000-0000-000000000003",
        "dimension_name": "Problem Solving",
        "secondary_dimension_ids": ["d3000001-0000-0000-0000-000000000001"],
        "difficulty": "4",
        "is_mandatory": True,
        "is_approved": True,
        "estimated_duration_seconds": 240,
        "question_rubric": {
            "sub_criteria": [
                {"criterion": "Analytical thinking", "weight": 0.6},
                {"criterion": "Communication of approach", "weight": 0.4},
            ]
        },
    },
    {
        "bank_item_id": "bi3000003-0000-0000-0000-000000000003",
        "text": "How do you handle disagreements with teammates about technical decisions?",
        "primary_dimension_id": "d3000002-0000-0000-0000-000000000002",
        "dimension_name": "Communication",
        "secondary_dimension_ids": ["d3000003-0000-0000-0000-000000000003"],
        "difficulty": "2",
        "is_mandatory": False,
        "is_approved": True,
        "estimated_duration_seconds": 150,
        "question_rubric": {
            "sub_criteria": [
                {"criterion": "Empathy and listening", "weight": 0.5},
                {"criterion": "Constructive resolution", "weight": 0.5},
            ]
        },
    },
]


def make_rubric_payload(group_id: str, organization_id: str, **overrides) -> dict:
    """Create a rubric creation payload with sample dimensions."""
    payload = {
        "group_id": group_id,
        "organization_id": organization_id,
        "dimensions": deepcopy(SAMPLE_DIMENSIONS),
        "time_budget_minutes": 30,
        "language": "en",
        "include_weak_topics": False,
    }
    payload.update(overrides)
    return payload


def make_frozen_rubric_payload(
    group_id: str, organization_id: str, **overrides
) -> dict:
    """Create a rubric payload with state='frozen' (ready for bank creation)."""
    payload = make_rubric_payload(group_id, organization_id, **overrides)
    payload["state"] = "frozen"
    return payload


def make_bank_payload(
    rubric_id: str, group_id: str, organization_id: str, **overrides
) -> dict:
    """Create a bank creation payload with sample items."""
    payload = {
        "rubric_id": rubric_id,
        "group_id": group_id,
        "organization_id": organization_id,
        "items": deepcopy(SAMPLE_BANK_ITEMS),
    }
    payload.update(overrides)
    return payload


def make_frozen_bank_payload(
    rubric_id: str, group_id: str, organization_id: str, **overrides
) -> dict:
    """Create a bank payload with state='frozen' (ready for session creation)."""
    payload = make_bank_payload(rubric_id, group_id, organization_id, **overrides)
    payload["state"] = "frozen"
    return payload


def make_liv2_session_payload(
    candidate_id: str,
    application_id: str,
    group_id: str,
    organization_id: str,
    rubric_id: str,
    bank_id: str,
    **overrides,
) -> dict:
    """Create a LiV2 session creation payload."""
    payload = {
        "candidate_id": candidate_id,
        "application_id": application_id,
        "group_id": group_id,
        "organization_id": organization_id,
        "rubric_id": rubric_id,
        "bank_id": bank_id,
        "room_name": f"li-v2-test-{uuid.uuid4().hex[:12]}",
        "state": "pending",
    }
    payload.update(overrides)
    return payload


def make_candidate_application_payload(
    candidate_id: str,
    position_id: str,
    group_id: str,
    organization_id: str,
    **overrides,
) -> dict:
    """Create a candidate application payload."""
    payload = {
        "candidate_id": candidate_id,
        "position_id": position_id,
        "group_id": group_id,
        "organization_id": organization_id,
        "status": "in_pipeline",
    }
    payload.update(overrides)
    return payload


def make_group_pipeline_stage_payload(
    group_id: str,
    organization_id: str,
    stage_type: str = "live_interview",
    stage_order: int = 1,
    config_id: Optional[str] = None,
    **overrides,
) -> dict:
    """Create a group_pipeline_stages payload for an active live_interview stage."""
    payload = {
        "group_id": group_id,
        "organization_id": organization_id,
        "stage_type": stage_type,
        "stage_order": stage_order,
        "state": "active",
        "acceptance_criteria": {"minimum_score": 60},
    }
    if config_id:
        payload["config_id"] = config_id
    payload.update(overrides)
    return payload


def make_pipeline_progress_payload(
    application_id: str, stage_id: str, status: str = "unlocked", **overrides
) -> dict:
    """Create a candidate_pipeline_progress payload."""
    payload = {
        "application_id": application_id,
        "stage_id": stage_id,
        "status": status,
        "session_type": "live_interview",
    }
    payload.update(overrides)
    return payload


def make_transcript(num_turns: int = 12) -> list[dict]:
    """Generate a sample transcript with the given number of turns (alternating ai/candidate)."""
    ai_prompts = [
        "Welcome to the interview. Can you tell me about your experience with React?",
        "How do you handle state management in a complex application?",
        "Can you describe a challenging bug you encountered and how you resolved it?",
        "How do you approach code reviews and ensuring code quality?",
        "How would you design an API for a real-time notification system?",
        "Do you have any questions for us?",
    ]
    candidate_responses = [
        "I've worked with React for about 3 years, building large-scale SPAs using hooks and Redux.",
        "I prefer using a combination of local state for UI concerns and a global store like Zustand or Redux Toolkit for shared state.",
        "We had a memory leak in a dashboard that re-rendered frequently. I used React DevTools profiler to identify unnecessary re-renders, then applied useMemo and useCallback.",
        "I follow a structured review checklist covering correctness, performance, security, and readability. I believe in reviewing within 24 hours.",
        "I'd use WebSockets for real-time delivery with a REST fallback. The API would support subscription management and message queuing for offline users.",
        "Yes, I'd love to know more about the team's tech stack and how you approach continuous integration and deployment.",
    ]
    phases = ["opening", "technical", "behavioral", "technical", "closing"]
    transcript = []
    for i in range(num_turns):
        is_ai = i % 2 == 0
        turn = {
            "role": "ai" if is_ai else "candidate",
            "text": ai_prompts[i // 2] if is_ai else candidate_responses[i // 2],
            "phase": phases[min(i // 2, len(phases) - 1)],
            "timestamp": float(i * 15),
        }
        transcript.append(turn)
    return transcript
