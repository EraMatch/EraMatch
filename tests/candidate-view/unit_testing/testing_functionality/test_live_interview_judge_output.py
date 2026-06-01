"""
Unit tests for the live interview (LiV2) judge output format and scoring math.

No DB required — tests pure functions and data shape contracts.

Covers:
- Verdict thresholds: >= 60% → pass, < 40% → fail, else → review
- overall_score_pct calculation (weighted dim average, 0-4 scale → 0-100%)
- dimension_results structure the frontend reads
- li_v2_evaluation record shape
- Score stored in candidate_pipeline_progress as pct, passed flag from verdict
- Confidence calculation
"""
import pytest
from decimal import Decimal


def compute_overall_score_pct(dimension_results: dict, dimensions: list) -> float:
    """
    Mirrors _phase_c_score in judge.py.
    Each dimension score is 0-4, normalized to 0-100% and weighted.
    """
    if not dimension_results or not dimensions:
        return 0.0
    total_weight = 0.0
    weighted_sum = 0.0
    for dim in dimensions:
        dim_id = str(dim.get("dimension_id") or dim.get("id", ""))
        result = dimension_results.get(dim_id, {})
        weight = float(dim.get("weight", 1.0))
        raw_score = float(result.get("score", 0.0))
        normalized = (raw_score / 4.0) * 100.0
        weighted_sum += normalized * weight
        total_weight += weight
    return round(weighted_sum / total_weight, 2) if total_weight > 0 else 0.0


def auto_verdict(overall_score_pct: float) -> str:
    """Mirrors _auto_verdict: >= 60 → pass, < 40 → fail, else → review."""
    if overall_score_pct >= 60.0:
        return "pass"
    elif overall_score_pct < 40.0:
        return "fail"
    else:
        return "review"


def pct_to_progress_passed(verdict: str) -> bool:
    """Mirrors the progress update: passed = (verdict == 'pass')."""
    return verdict == "pass"


# ─────────────────────────────────────────────────────────
# Verdict thresholds
# ─────────────────────────────────────────────────────────

class TestVerdictThresholds:
    def test_60_is_pass(self):
        assert auto_verdict(60.0) == "pass"

    def test_59_9_is_review(self):
        assert auto_verdict(59.9) == "review"

    def test_40_0_is_review(self):
        assert auto_verdict(40.0) == "review"

    def test_39_9_is_fail(self):
        assert auto_verdict(39.9) == "fail"

    def test_0_is_fail(self):
        assert auto_verdict(0.0) == "fail"

    def test_100_is_pass(self):
        assert auto_verdict(100.0) == "pass"

    def test_exact_60_boundary(self):
        assert auto_verdict(60.0) == "pass"

    def test_exact_40_boundary(self):
        # 40.0 is not < 40, so it's review
        assert auto_verdict(40.0) == "review"

    def test_perfect_50_is_review(self):
        assert auto_verdict(50.0) == "review"

    def test_all_valid_verdicts(self):
        for pct in [0.0, 20.0, 39.9, 40.0, 50.0, 59.9, 60.0, 80.0, 100.0]:
            v = auto_verdict(pct)
            assert v in ("pass", "fail", "review"), f"Invalid verdict '{v}' for {pct}%"


# ─────────────────────────────────────────────────────────
# Score percentage math
# ─────────────────────────────────────────────────────────

class TestOverallScorePct:
    def test_max_score_all_dims(self):
        dims = [{"id": "d1", "weight": 1.0}, {"id": "d2", "weight": 1.0}]
        results = {"d1": {"score": 4.0}, "d2": {"score": 4.0}}
        assert compute_overall_score_pct(results, dims) == 100.0

    def test_zero_score_all_dims(self):
        dims = [{"id": "d1", "weight": 1.0}]
        results = {"d1": {"score": 0.0}}
        assert compute_overall_score_pct(results, dims) == 0.0

    def test_mid_score_single_dim(self):
        dims = [{"id": "d1", "weight": 1.0}]
        results = {"d1": {"score": 2.0}}
        assert compute_overall_score_pct(results, dims) == 50.0

    def test_score_1_of_4_is_25_pct(self):
        dims = [{"id": "d1", "weight": 1.0}]
        results = {"d1": {"score": 1.0}}
        assert compute_overall_score_pct(results, dims) == 25.0

    def test_score_3_of_4_is_75_pct(self):
        dims = [{"id": "d1", "weight": 1.0}]
        results = {"d1": {"score": 3.0}}
        assert compute_overall_score_pct(results, dims) == 75.0

    def test_weighted_two_dims(self):
        # d1: score=4, weight=2 → 100% × 2 = 200
        # d2: score=0, weight=1 → 0% × 1 = 0
        # weighted avg = 200/3 = 66.67
        dims = [{"id": "d1", "weight": 2.0}, {"id": "d2", "weight": 1.0}]
        results = {"d1": {"score": 4.0}, "d2": {"score": 0.0}}
        pct = compute_overall_score_pct(results, dims)
        assert abs(pct - 66.67) < 0.1

    def test_missing_dimension_treated_as_zero(self):
        dims = [{"id": "d1", "weight": 1.0}, {"id": "d2", "weight": 1.0}]
        results = {"d1": {"score": 4.0}}  # d2 missing
        pct = compute_overall_score_pct(results, dims)
        assert abs(pct - 50.0) < 0.1

    def test_empty_results_gives_zero(self):
        dims = [{"id": "d1", "weight": 1.0}]
        assert compute_overall_score_pct({}, dims) == 0.0

    def test_no_dimensions_gives_zero(self):
        assert compute_overall_score_pct({"d1": {"score": 4.0}}, []) == 0.0

    def test_three_equal_weight_dims(self):
        dims = [{"id": f"d{i}", "weight": 1.0} for i in range(3)]
        results = {f"d{i}": {"score": 2.0} for i in range(3)}
        assert compute_overall_score_pct(results, dims) == 50.0

    def test_dimension_id_as_string(self):
        dims = [{"dimension_id": "tech-1", "weight": 1.0}]
        results = {"tech-1": {"score": 4.0}}
        assert compute_overall_score_pct(results, dims) == 100.0

    def test_non_integer_score(self):
        dims = [{"id": "d1", "weight": 1.0}]
        results = {"d1": {"score": 3.2}}
        pct = compute_overall_score_pct(results, dims)
        assert abs(pct - 80.0) < 0.1


# ─────────────────────────────────────────────────────────
# dimension_results shape (frontend contract)
# ─────────────────────────────────────────────────────────

class TestDimensionResultsShape:
    def _sample(self):
        return {
            "d1": {
                "score": 3.2,
                "label": "Technical Knowledge",
                "answers": [
                    {"question_id": "q1", "score": 3, "anchor": "Demonstrates solid knowledge"},
                    {"question_id": "q2", "score": 4, "anchor": "Exceptional depth"},
                ],
                "coverage": 0.8,
            },
            "d2": {
                "score": 2.0,
                "label": "Communication",
                "answers": [],
                "coverage": 0.0,
            },
        }

    def test_each_dimension_has_score(self):
        dr = self._sample()
        for dim_id, result in dr.items():
            assert "score" in result, f"Dimension {dim_id} missing score"
            assert isinstance(result["score"], (int, float))

    def test_score_in_0_to_4_range(self):
        dr = self._sample()
        for dim_id, result in dr.items():
            assert 0.0 <= result["score"] <= 4.0, \
                f"Dimension {dim_id} score out of range: {result['score']}"

    def test_each_dimension_has_answers_list(self):
        dr = self._sample()
        for dim_id, result in dr.items():
            assert "answers" in result
            assert isinstance(result["answers"], list)

    def test_answer_has_score_and_anchor(self):
        dr = self._sample()
        for dim_id, result in dr.items():
            for ans in result.get("answers", []):
                assert "score" in ans
                assert "anchor" in ans or "question_id" in ans

    def test_answer_score_in_0_to_4(self):
        dr = self._sample()
        for dim_id, result in dr.items():
            for ans in result.get("answers", []):
                s = ans.get("score", 0)
                assert 0 <= s <= 4

    def test_empty_answers_allowed(self):
        dr = self._sample()
        assert isinstance(dr["d2"]["answers"], list)
        assert len(dr["d2"]["answers"]) == 0


# ─────────────────────────────────────────────────────────
# Evaluation record shape (li_v2_evaluation)
# ─────────────────────────────────────────────────────────

class TestEvaluationRecordShape:
    def _evaluation(self, pct=80.0):
        return {
            "evaluation_id": "eval-abc-123",
            "session_id": "sess-xyz-456",
            "overall_score": 3.2,
            "overall_score_pct": pct,
            "auto_verdict": auto_verdict(pct),
            "dimension_results": {
                "d1": {"score": 3.2, "answers": [], "label": "Tech"},
            },
            "flags": [],
            "confidence": 0.85,
        }

    def test_required_fields_present(self):
        ev = self._evaluation()
        required = {"evaluation_id", "session_id", "overall_score_pct", "auto_verdict"}
        assert required.issubset(ev.keys()), f"Missing: {required - ev.keys()}"

    def test_verdict_valid_value(self):
        for pct in [0.0, 39.9, 40.0, 59.9, 60.0, 100.0]:
            ev = self._evaluation(pct)
            assert ev["auto_verdict"] in ("pass", "fail", "review"), \
                f"Invalid verdict for {pct}%: {ev['auto_verdict']}"

    def test_score_pct_in_range(self):
        ev = self._evaluation(80.0)
        assert 0.0 <= ev["overall_score_pct"] <= 100.0

    def test_dimension_results_is_dict(self):
        ev = self._evaluation()
        assert isinstance(ev["dimension_results"], dict)

    def test_flags_is_list(self):
        ev = self._evaluation()
        assert isinstance(ev["flags"], list)

    def test_overall_score_is_0_to_4(self):
        ev = self._evaluation()
        assert 0.0 <= ev["overall_score"] <= 4.0

    def test_confidence_in_0_to_1(self):
        ev = self._evaluation()
        assert 0.0 <= ev["confidence"] <= 1.0


# ─────────────────────────────────────────────────────────
# Progress storage (candidate_pipeline_progress)
# ─────────────────────────────────────────────────────────

class TestProgressScoreStorage:
    def test_score_stored_as_decimal_pct(self):
        pct = 80.0
        stored = Decimal(str(pct))
        assert float(stored) == 80.0
        assert float(stored) <= 100.0

    def test_zero_score_stored_correctly(self):
        stored = Decimal("0.0")
        assert float(stored) == 0.0

    def test_fractional_pct_preserved(self):
        stored = Decimal("66.67")
        assert abs(float(stored) - 66.67) < 0.001

    def test_pass_verdict_sets_passed_true(self):
        assert pct_to_progress_passed("pass") is True

    def test_fail_verdict_sets_passed_false(self):
        assert pct_to_progress_passed("fail") is False

    def test_review_verdict_sets_passed_false(self):
        assert pct_to_progress_passed("review") is False

    def test_score_pct_used_not_raw_score(self):
        # overall_score is 0-4; overall_score_pct is 0-100
        # Progress stores the percentage, NOT the 0-4 value
        overall_score = 3.2
        overall_score_pct = (overall_score / 4.0) * 100
        stored = Decimal(str(round(overall_score_pct, 2)))
        assert float(stored) > 4.0, "Progress should store pct (>4), not raw score (0-4)"

    def test_all_verdict_values_covered(self):
        for verdict in ("pass", "fail", "review"):
            result = pct_to_progress_passed(verdict)
            assert isinstance(result, bool)
