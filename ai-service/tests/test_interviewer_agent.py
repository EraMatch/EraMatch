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
    InterviewerAgent,
    PillarState,
)


# =============================================================================
# Test: PillarState
# =============================================================================

class TestPillarState:
    def _make_pillar(self, n_criteria=3):
        criteria = [f"Criteria {i}" for i in range(n_criteria)]
        return PillarState(
            bank_item_id="test-id",
            question_text="Tell me about a challenge",
            dimension_name="Problem Solving",
            sub_criteria=criteria,
        )

    def test_initially_incomplete(self):
        p = self._make_pillar()
        assert not p.is_complete

    def test_complete_when_all_covered(self):
        p = self._make_pillar(n_criteria=3)
        p.covered = set(p.sub_criteria)
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

    def test_coverage_check_returns_correct_structure(self, mock_ollama_response):
        with patch("httpx.AsyncClient") as MockClient:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_ollama_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)

            result = asyncio.run(
                _check_coverage(
                    "I led a cross-functional team during a product launch under a tight deadline.",
                    ["Describes a specific team situation", "Explains their leadership role", "Reflects on the outcome"],
                )
            )

            assert "covered" in result
            assert "partial" in result
            assert "missed" in result
            assert "Describes a specific team situation" in result["covered"]

    def test_coverage_check_fallback_on_error(self):
        """When Ollama call fails, should return all criteria as missed (safe default)."""
        sub_criteria = ["C1", "C2", "C3"]
        with patch("httpx.AsyncClient") as MockClient:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(side_effect=Exception("Connection refused"))
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)

            result = asyncio.run(_check_coverage("Some answer", sub_criteria))

            assert result["covered"] == []
            assert result["missed"] == sub_criteria

    def test_coverage_check_handles_empty_criteria(self):
        result = asyncio.run(_check_coverage("Any answer", []))
        assert result == {"covered": [], "partial": [], "missed": []}


# =============================================================================
# Test: InterviewerAgent pillar tracking
# =============================================================================

class TestInterviewerPillarTracking:
    def _make_agent(self):
        agent = InterviewerAgent.__new__(InterviewerAgent)
        agent.session_id = "test-session"
        agent.time_budget = 30
        agent.phase = "welcome"
        agent.current_pillar_idx = 0
        agent.pillars = _build_pillars_from_bank(SAMPLE_BANK_ITEMS)
        agent.transcript = []
        agent.control_trace = []
        agent.session_start_time = 1
        agent._coverage_tasks = []
        agent.session = MagicMock()
        agent.session.userdata = {}
        agent.firewall = MagicMock()
        agent.firewall.process.side_effect = lambda text: (text, 0, [])
        return agent

    def test_welcome_answer_is_not_mapped_to_rubric_pillar(self):
        agent = self._make_agent()

        assert agent._active_pillar_idx_for_transcript() is None

    def test_first_rubric_answer_maps_to_first_pillar(self):
        agent = self._make_agent()
        agent._mark_welcome_answer_recorded()

        assert agent.phase == "rubric"
        assert agent._active_pillar_idx_for_transcript("I led a team under pressure.") == 0

    def test_pillar_advances_after_each_rubric_answer(self):
        agent = self._make_agent()
        agent._mark_welcome_answer_recorded()

        first_idx = agent._active_pillar_idx_for_transcript("I led a team under pressure.")
        agent._advance_after_rubric_answer()
        second_idx = agent._active_pillar_idx_for_transcript("I design scalable systems with trade-offs.")

        assert first_idx == 0
        assert second_idx == 1

    def test_pillar_does_not_advance_past_last_question(self):
        agent = self._make_agent()
        agent._mark_welcome_answer_recorded()
        agent._advance_after_rubric_answer()
        agent._advance_after_rubric_answer()
        agent._advance_after_rubric_answer()

        assert agent._active_pillar_idx_for_transcript("I design scalable systems with trade-offs.") == 1

    def test_readiness_turn_does_not_advance_or_map_to_pillar(self):
        agent = self._make_agent()
        agent._mark_welcome_answer_recorded()

        assert agent._active_pillar_idx_for_transcript("yes") is None
        assert agent.current_pillar_idx == 0

    def test_clarification_turn_does_not_advance_or_map_to_pillar(self):
        agent = self._make_agent()
        agent._mark_welcome_answer_recorded()

        assert agent._active_pillar_idx_for_transcript("can you repeat the question?") is None
        assert agent.current_pillar_idx == 0

    def test_handle_turn_records_structured_pillar_indices(self):
        async def run_turns():
            agent = self._make_agent()
            agent._apply_coverage_async = AsyncMock()
            with patch.object(agent, "_elapsed", return_value=10):
                await agent._handle_turn(None, MagicMock(content="I am a frontend engineer."))
                await agent._handle_turn(None, MagicMock(content="yes"))
                await agent._handle_turn(None, MagicMock(content="I led a team under pressure."))
                await agent._handle_turn(None, MagicMock(content="I design scalable systems with trade-offs."))
                await asyncio.gather(*agent._coverage_tasks)
            return agent

        agent = asyncio.run(run_turns())

        assert "pillar_idx" not in agent.transcript[0]
        assert "pillar_idx" not in agent.transcript[1]
        assert agent.transcript[2]["pillar_idx"] == 0
        assert agent.transcript[3]["pillar_idx"] == 1
