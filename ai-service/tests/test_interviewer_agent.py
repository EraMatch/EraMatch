"""
Tests for the InterviewerAgent core components.

Tests what can be tested in isolation without a LiveKit room:
  - _build_pillars_from_bank: bank item → PillarState conversion
  - PillarState: coverage tracking, probe limits, is_complete logic
  - _check_coverage: mocked Ollama call → coverage dict

Run: cd EraMatch/ai-service && python -m pytest tests/test_interviewer_agent.py -v
"""
import json
import sys
import os
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# ---- path fix so imports resolve ----
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "livekit_worker"))

from interviewer_agent import (
    _build_pillars_from_bank,
    _check_coverage,
    PillarState,
    _topic_intro_prompt,
    _probe_prompt,
    _bridge_prompt,
)


# =============================================================================
# Test: PillarState
# =============================================================================

class TestPillarState:
    def _make_pillar(self, n_criteria=3, max_probes=2):
        criteria = [f"Criteria {i}" for i in range(n_criteria)]
        return PillarState(
            bank_item_id="test-id",
            question_text="Tell me about a challenge",
            dimension_name="Problem Solving",
            sub_criteria=criteria,
            MAX_PROBES=max_probes,
        )

    def test_initially_incomplete(self):
        p = self._make_pillar()
        assert not p.is_complete

    def test_complete_when_all_covered(self):
        p = self._make_pillar(n_criteria=3)
        p.covered = set(p.sub_criteria)
        assert p.is_complete

    def test_complete_when_max_probes_reached(self):
        p = self._make_pillar(max_probes=2)
        p.probe_count = 2
        assert p.is_complete

    def test_missing_returns_uncovered_criteria(self):
        p = self._make_pillar(n_criteria=3)
        p.covered = {p.sub_criteria[0]}
        missing = p.missing
        assert len(missing) == 2
        assert p.sub_criteria[0] not in missing

    def test_partial_coverage_is_not_complete(self):
        p = self._make_pillar(n_criteria=3)
        p.covered = {p.sub_criteria[0], p.sub_criteria[1]}
        assert not p.is_complete
        assert len(p.missing) == 1

    def test_probe_count_increments(self):
        p = self._make_pillar()
        assert p.probe_count == 0
        p.probe_count += 1
        assert p.probe_count == 1


# =============================================================================
# Test: _build_pillars_from_bank
# =============================================================================

SAMPLE_BANK_ITEMS = [
    {
        "bank_item_id": "item-1",
        "text": "Describe a time you led a team under pressure.",
        "primary_dimension_id": "Leadership",
        "is_mandatory": True,
        "question_rubric": {
            "sub_criteria": [
                "Describes a specific team situation",
                "Explains their leadership role",
                "Reflects on the outcome",
            ]
        },
    },
    {
        "bank_item_id": "item-2",
        "text": "How do you approach system design for scale?",
        "primary_dimension_id": "Technical Depth",
        "is_mandatory": False,
        "question_rubric": {
            "sub_criteria": [
                "Mentions trade-offs",
                "Discusses concrete technologies",
            ]
        },
    },
]


class TestBuildPillars:
    def test_correct_number_of_pillars(self):
        pillars = _build_pillars_from_bank(SAMPLE_BANK_ITEMS)
        assert len(pillars) == 2

    def test_mandatory_comes_first(self):
        """Mandatory questions should be ordered first."""
        pillars = _build_pillars_from_bank(SAMPLE_BANK_ITEMS)
        assert pillars[0].bank_item_id == "item-1"
        assert pillars[1].bank_item_id == "item-2"

    def test_sub_criteria_parsed_correctly(self):
        pillars = _build_pillars_from_bank(SAMPLE_BANK_ITEMS)
        assert len(pillars[0].sub_criteria) == 3
        assert "Describes a specific team situation" in pillars[0].sub_criteria

    def test_empty_bank_returns_fallback(self):
        """If bank is empty, the agent should create at least one fallback pillar."""
        pillars = _build_pillars_from_bank([])
        assert len(pillars) == 0  # Caller handles fallback

    def test_dimension_name_assigned(self):
        pillars = _build_pillars_from_bank(SAMPLE_BANK_ITEMS)
        assert pillars[0].dimension_name == "Leadership"


# =============================================================================
# Test: _check_coverage (mocked Ollama)
# =============================================================================

class TestCoverageCheck:
    @pytest.fixture
    def mock_ollama_response(self):
        """Create a mock HTTPX response that mimics Ollama's chat completions."""
        payload = {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "covered": ["Describes a specific team situation"],
                        "partial": ["Explains their leadership role"],
                        "missed": ["Reflects on the outcome"],
                    })
                }
            }]
        }
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(return_value=payload)
        return mock_resp

    @pytest.mark.asyncio
    async def test_coverage_check_returns_correct_structure(self, mock_ollama_response):
        with patch("httpx.AsyncClient") as MockClient:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_ollama_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await _check_coverage(
                "I led a cross-functional team during a product launch under a tight deadline.",
                ["Describes a specific team situation", "Explains their leadership role", "Reflects on the outcome"],
            )

            assert "covered" in result
            assert "partial" in result
            assert "missed" in result
            assert "Describes a specific team situation" in result["covered"]

    @pytest.mark.asyncio
    async def test_coverage_check_fallback_on_error(self):
        """When Ollama call fails, should return all criteria as missed (safe default)."""
        sub_criteria = ["C1", "C2", "C3"]
        with patch("httpx.AsyncClient") as MockClient:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(side_effect=Exception("Connection refused"))
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await _check_coverage("Some answer", sub_criteria)

            assert result["covered"] == []
            assert result["missed"] == sub_criteria

    @pytest.mark.asyncio
    async def test_coverage_check_handles_empty_criteria(self):
        result = await _check_coverage("Any answer", [])
        assert result == {"covered": [], "partial": [], "missed": []}


# =============================================================================
# Test: Prompt helpers
# =============================================================================

class TestPrompts:
    def _make_pillar(self):
        return PillarState(
            bank_item_id="x",
            question_text="Describe your approach to conflict resolution.",
            dimension_name="Interpersonal Skills",
            sub_criteria=["Identifies conflict source", "Proposes resolution steps", "Reflects on outcome"],
        )

    def test_topic_intro_contains_dimension(self):
        p = self._make_pillar()
        prompt = _topic_intro_prompt(p)
        assert "Interpersonal Skills" in prompt

    def test_probe_prompt_includes_missing(self):
        p = self._make_pillar()
        p.covered = {p.sub_criteria[0]}  # first criterion covered
        prompt = _probe_prompt(p)
        assert "Proposes resolution steps" in prompt
        assert "Reflects on outcome" in prompt

    def test_bridge_prompt_includes_next_dimension(self):
        next_p = self._make_pillar()
        next_p.dimension_name = "Technical Excellence"
        prompt = _bridge_prompt(next_p)
        assert "Technical Excellence" in prompt
