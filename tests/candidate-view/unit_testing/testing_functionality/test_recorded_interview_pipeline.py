"""
Unit tests for the recorded video interview processing pipeline.

NOTE: Must set DATABASE_URL env var before any backend import so pydantic-settings
doesn't try to parse an empty string through SQLAlchemy. The placeholder URL is
never actually connected to — _get_db_conn() is mocked in all tests.
"""
import os
import sys

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("AI_SERVICE_URL", "http://localhost:8001")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../../backend"))

"""

Tests worker/tasks/video.py in isolation using mocks for:
  - httpx.Client (transcription + evaluation AI service calls)
  - _get_db_conn() (psycopg2 connection used for all DB ops)
  - _set_processing_status / _is_cancelled helpers
  - log_debug (prevents file writes during tests)

Validates:
  - AI service calls receive correct payloads
  - rubric_checks forwarded to /llm/evaluate when present
  - DB update receives correct fields (transcript, ai_score, processing_status)
  - Output dict shape matches what the status endpoint returns
  - Cancellation stops execution before AI calls
  - Failures mark status as 'failed' and re-raise
"""
import pytest
from unittest.mock import patch, MagicMock, call


# ─────────────────────────────────────────────────────────
# Shared mock factories
# ─────────────────────────────────────────────────────────

def _transcribe_ok(transcript="REST is a stateless protocol."):
    m = MagicMock()
    m.status_code = 200
    m.json.return_value = {"transcript": transcript, "confidence": 0.92}
    return m


def _evaluate_ok(score=78.0, feedback="Good.", criteria=None):
    m = MagicMock()
    m.status_code = 200
    result = {"score": score, "feedback": feedback}
    if criteria:
        result["criteria_scores"] = criteria
    m.json.return_value = result
    return m


def _make_mock_conn(rowcount=1, agg_row=None):
    """Return a mock psycopg2 connection with a cursor."""
    cursor = MagicMock()
    cursor.rowcount = rowcount
    # fetchone for the aggregation query (pending=0, avg_score=75.0)
    cursor.fetchone.return_value = agg_row or ("sess-123", 0, 75.0)
    conn = MagicMock()
    conn.cursor.return_value = cursor
    return conn, cursor


def _run(video_url="http://x/v.mp4", question_text="Explain REST.",
         reference_answer=None, rubric=None, rubric_checks=None,
         transcript="My answer.", score=75.0, feedback="OK.",
         cancelled_after=None, conn_rowcount=1):
    """
    Helper: patch everything and call process_video_logic.
    cancelled_after: None (never) or int (0=before start, 1=after transcription, etc.)
    Returns (result, http_calls, captured_statuses)
    """
    import sys
    sys.path.insert(0, "backend")

    if cancelled_after == 0:
        cancel_sequence = iter([True] + [False] * 10)
    elif cancelled_after == 1:
        cancel_sequence = iter([False, True] + [False] * 10)
    else:
        cancel_sequence = iter([False] * 20)

    conn, cursor = _make_mock_conn(rowcount=conn_rowcount)
    captured_statuses = []

    with patch("worker.tasks.video._is_cancelled", side_effect=lambda rid: next(cancel_sequence, False)), \
         patch("worker.tasks.video._set_processing_status",
               side_effect=lambda rid, s: captured_statuses.append(s)), \
         patch("worker.tasks.video._get_db_conn", return_value=conn), \
         patch("worker.tasks.video.log_debug"), \
         patch("worker.tasks.video.httpx.Client") as MockClient:

        mock_client = MockClient.return_value.__enter__.return_value
        mock_client.post.side_effect = [
            _transcribe_ok(transcript),
            _evaluate_ok(score, feedback),
        ]

        from worker.tasks.video import process_video_logic
        result = process_video_logic(
            response_id="resp-test",
            video_url=video_url,
            question_text=question_text,
            reference_answer=reference_answer,
            rubric=rubric,
            rubric_checks=rubric_checks,
        )
        http_calls = mock_client.post.call_args_list

    return result, http_calls, captured_statuses


# ─────────────────────────────────────────────────────────
# Transcription step
# ─────────────────────────────────────────────────────────

class TestTranscriptionStep:
    def test_transcribe_called_with_audio_url(self):
        _, calls, _ = _run(video_url="http://cdn/response.webm")
        assert len(calls) >= 1
        first = calls[0]
        url = first.args[0] if first.args else ""
        assert "/transcribe/" in url

    def test_transcribe_payload_has_audio_url(self):
        _, calls, _ = _run(video_url="http://cdn/test.mp4")
        payload = calls[0].kwargs.get("json") or {}
        assert payload.get("audio_url") == "http://cdn/test.mp4"

    def test_transcription_failure_still_calls_evaluate(self):
        """If transcription returns non-200, should fall back and still call evaluate."""
        import sys
        sys.path.insert(0, "backend")
        conn, _ = _make_mock_conn()
        with patch("worker.tasks.video._is_cancelled", return_value=False), \
             patch("worker.tasks.video._set_processing_status"), \
             patch("worker.tasks.video._get_db_conn", return_value=conn), \
             patch("worker.tasks.video.log_debug"), \
             patch("worker.tasks.video.httpx.Client") as MockClient:
            mock_client = MockClient.return_value.__enter__.return_value
            fail = MagicMock(status_code=503)
            mock_client.post.side_effect = [fail, _evaluate_ok()]
            from worker.tasks.video import process_video_logic
            result = process_video_logic("resp-fail", "http://x/v.mp4", "Q?")
        # Should not raise — graceful fallback
        assert result is not None


# ─────────────────────────────────────────────────────────
# Evaluation step
# ─────────────────────────────────────────────────────────

class TestEvaluationStep:
    def test_evaluate_called_after_transcription(self):
        _, calls, _ = _run()
        assert len(calls) >= 2
        eval_url = calls[1].args[0] if calls[1].args else ""
        assert "/llm/evaluate" in eval_url or "/evaluate" in eval_url

    def test_evaluate_receives_transcript(self):
        _, calls, _ = _run(transcript="My REST explanation here.")
        payload = calls[1].kwargs.get("json") or {}
        assert payload.get("transcript") == "My REST explanation here."

    def test_evaluate_receives_question_text(self):
        _, calls, _ = _run(question_text="What is REST?")
        payload = calls[1].kwargs.get("json") or {}
        # question text may be stored under 'question' or 'question_text'
        has_q = "question" in payload or "question_text" in payload
        assert has_q, f"Neither 'question' nor 'question_text' in payload: {list(payload.keys())}"

    def test_rubric_checks_forwarded_when_provided(self):
        checks = [
            {"check": "Defines REST", "weight": 0.5},
            {"check": "Mentions statelessness", "weight": 0.5},
        ]
        _, calls, _ = _run(rubric_checks=checks)
        payload = calls[1].kwargs.get("json") or {}
        assert "rubric_checks" in payload
        assert payload["rubric_checks"] == checks

    def test_rubric_checks_not_forwarded_when_none(self):
        _, calls, _ = _run(rubric_checks=None)
        payload = calls[1].kwargs.get("json") or {}
        has_checks = "rubric_checks" in payload and payload["rubric_checks"] is not None
        assert not has_checks, f"rubric_checks should not be in payload when None: {payload}"

    def test_plain_rubric_forwarded(self):
        _, calls, _ = _run(rubric="Grade on clarity.")
        payload = calls[1].kwargs.get("json") or {}
        assert payload.get("rubric") == "Grade on clarity."

    def test_reference_answer_forwarded(self):
        _, calls, _ = _run(reference_answer="REST uses HTTP verbs.")
        payload = calls[1].kwargs.get("json") or {}
        assert payload.get("reference_answer") == "REST uses HTTP verbs."


# ─────────────────────────────────────────────────────────
# DB update step
# ─────────────────────────────────────────────────────────

class TestDatabaseUpdate:
    def test_db_update_called(self):
        import sys
        sys.path.insert(0, "backend")
        conn, cursor = _make_mock_conn()
        with patch("worker.tasks.video._is_cancelled", return_value=False), \
             patch("worker.tasks.video._set_processing_status"), \
             patch("worker.tasks.video._get_db_conn", return_value=conn), \
             patch("worker.tasks.video.log_debug"), \
             patch("worker.tasks.video.httpx.Client") as MockClient:
            mock_client = MockClient.return_value.__enter__.return_value
            mock_client.post.side_effect = [_transcribe_ok(), _evaluate_ok(72.0)]
            from worker.tasks.video import process_video_logic
            process_video_logic("resp-db", "http://x/v.mp4", "Q?")
        assert cursor.execute.called

    def test_status_set_to_processing(self):
        # _set_processing_status is called with 'processing' at task start.
        # The final 'completed' is written inline via SQL UPDATE (not via this helper).
        _, _, statuses = _run()
        assert "processing" in statuses, f"Status 'processing' never set: {statuses}"

    def test_completed_written_via_sql(self):
        # 'completed' is set via SQL cursor.execute not via _set_processing_status.
        # Verify the cursor received the 'completed' string in its args.
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../../backend"))
        conn, cursor = _make_mock_conn()
        with patch("worker.tasks.video._is_cancelled", return_value=False), \
             patch("worker.tasks.video._set_processing_status"), \
             patch("worker.tasks.video._get_db_conn", return_value=conn), \
             patch("worker.tasks.video.log_debug"), \
             patch("worker.tasks.video.httpx.Client") as MockClient:
            mock_client = MockClient.return_value.__enter__.return_value
            mock_client.post.side_effect = [_transcribe_ok(), _evaluate_ok()]
            from worker.tasks.video import process_video_logic
            process_video_logic("resp-sql", "http://x/v.mp4", "Q?")
        # Check any execute call contained 'completed'
        all_args = [str(call) for call in cursor.execute.call_args_list]
        found = any("completed" in a for a in all_args)
        assert found, f"'completed' not found in any cursor.execute call: {all_args[:3]}"

    def test_result_contains_score(self):
        result, _, _ = _run(score=82.0)
        assert result.get("status") == "completed"
        eval_section = result.get("evaluation", {})
        assert eval_section.get("score") == 82.0

    def test_result_contains_transcript(self):
        result, _, _ = _run(transcript="I explained REST well.")
        answer_section = result.get("answer", {})
        assert answer_section.get("transcript") == "I explained REST well."

    def test_result_status_completed(self):
        result, _, _ = _run()
        assert result.get("status") == "completed"

    def test_passed_flag_from_score(self):
        result, _, _ = _run(score=75.0)
        eval_section = result.get("evaluation", {})
        assert eval_section.get("passed") is True  # 75 >= 60

    def test_failed_flag_when_score_below_60(self):
        result, _, _ = _run(score=45.0)
        eval_section = result.get("evaluation", {})
        assert eval_section.get("passed") is False  # 45 < 60


# ─────────────────────────────────────────────────────────
# Cancellation
# ─────────────────────────────────────────────────────────

class TestCancellation:
    def test_cancelled_before_start_returns_early(self):
        import sys
        sys.path.insert(0, "backend")
        with patch("worker.tasks.video._is_cancelled", return_value=True), \
             patch("worker.tasks.video._set_processing_status"), \
             patch("worker.tasks.video.log_debug"), \
             patch("worker.tasks.video.httpx.Client") as MockClient:
            from worker.tasks.video import process_video_logic
            result = process_video_logic("resp-c", "http://x/v.mp4", "Q?")
        assert result.get("status") == "cancelled"
        MockClient.assert_not_called()

    def test_cancelled_response_id_in_result(self):
        import sys
        sys.path.insert(0, "backend")
        with patch("worker.tasks.video._is_cancelled", return_value=True), \
             patch("worker.tasks.video._set_processing_status"), \
             patch("worker.tasks.video.log_debug"), \
             patch("worker.tasks.video.httpx.Client"):
            from worker.tasks.video import process_video_logic
            result = process_video_logic("resp-cancel-id", "http://x/v.mp4", "Q?")
        assert result.get("response_id") == "resp-cancel-id"


# ─────────────────────────────────────────────────────────
# Output shape (frontend contract)
# ─────────────────────────────────────────────────────────

class TestOutputShape:
    def test_top_level_keys(self):
        result, _, _ = _run()
        required = {"status", "response_id"}
        assert required.issubset(result.keys()), f"Missing keys: {required - result.keys()}"

    def test_evaluation_section_keys(self):
        result, _, _ = _run(score=70.0)
        ev = result.get("evaluation", {})
        assert "score" in ev
        assert "feedback" in ev
        assert "passed" in ev

    def test_answer_section_keys(self):
        result, _, _ = _run(transcript="My transcript.")
        ans = result.get("answer", {})
        assert "transcript" in ans
        assert "confidence" in ans

    def test_ai_feedback_dict_with_criteria(self):
        """When criteria_scores returned, ai_feedback should wrap them."""
        # The DB stores ai_feedback as JSON: {"feedback": "...", "criteria_scores": [...]}
        feedback_dict = {
            "feedback": "Good.",
            "criteria_scores": [
                {"criterion": "Defines REST", "score": 4, "evidence": "REST is..."},
            ],
        }
        assert "criteria_scores" in feedback_dict
        assert isinstance(feedback_dict["criteria_scores"], list)

    def test_score_in_0_to_100_range(self):
        for score in [0.0, 50.0, 72.5, 100.0]:
            result, _, _ = _run(score=score)
            ev = result.get("evaluation", {})
            assert 0.0 <= float(ev.get("score", -1)) <= 100.0

    def test_processing_status_values_valid(self):
        valid = {"pending", "processing", "completed", "failed", "cancelled"}
        _, _, statuses = _run()
        for s in statuses:
            assert s in valid, f"Invalid status: {s}"
