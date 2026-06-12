"""
Unit tests for assessment score calculation logic.
No DB, no HTTP — tests the formulas directly.

Covers:
- Score percentage formula (total_earned / total_max * 100)
- Pass/fail threshold logic
- MCQ auto-grade (both index and letter formats)
- Multi-section score assembly
- Edge cases: zero max, fractional points, partial credit
"""
import pytest


def calc_score(total_earned: float, total_max: float) -> float:
    """Mirrors: percentage = (total_earned / total_max * 100) if total_max > 0 else 0"""
    return (total_earned / total_max * 100) if total_max > 0 else 0.0


def is_passed(percentage: float, passing_score: float) -> bool:
    return percentage >= passing_score


def calc_mcq_points(
    selected: int | None,
    correct_index: int | None,
    points_max: float,
    correct_option: str | None = None,
) -> float:
    """
    Mirrors MCQ grading logic from both save_answer and auto_grade_answers.
    Handles both correct_index (int) and correct_option (letter: 'a','b','c','d').
    """
    if correct_index is None and correct_option is not None:
        if isinstance(correct_option, str) and len(correct_option) == 1:
            correct_index = ord(correct_option.lower()) - ord('a')
    if selected is None or correct_index is None:
        return 0.0
    return float(points_max) if selected == correct_index else 0.0


def hidden_only_score(test_cases: list, test_results: list, points_max: float) -> float:
    """
    Mirrors auto_grade_answers hidden-only scoring.
    test_cases: list of dicts with is_hidden or isHidden
    test_results: list of dicts with test_case (1-indexed) and passed (bool)
    """
    hidden_results = [
        r for r in test_results
        if test_cases[r["test_case"] - 1].get("is_hidden")
        or test_cases[r["test_case"] - 1].get("isHidden")
    ]
    visible_results = [r for r in test_results if r not in hidden_results]
    hidden_passed = sum(1 for r in hidden_results if r["passed"])
    hidden_total = len(hidden_results)
    visible_passed = sum(1 for r in visible_results if r["passed"])
    visible_total = len(visible_results)

    if hidden_total > 0:
        ratio = hidden_passed / hidden_total
    else:
        ratio = visible_passed / visible_total if visible_total > 0 else 0.0
    return round(ratio * points_max, 2)


# ─────────────────────────────────────────────────────────
# Score formula
# ─────────────────────────────────────────────────────────

class TestScoreFormula:
    def test_full_marks(self):
        assert calc_score(100.0, 100.0) == 100.0

    def test_zero_earned(self):
        assert calc_score(0.0, 100.0) == 0.0

    def test_exact_60_pct(self):
        assert abs(calc_score(60.0, 100.0) - 60.0) < 0.001

    def test_weighted_sections_asymmetric(self):
        # 10 MCQ + 20 essay + 30 coding = 60 max, earn 40
        assert abs(calc_score(40.0, 60.0) - 66.67) < 0.1

    def test_zero_max_no_crash(self):
        assert calc_score(0.0, 0.0) == 0.0

    def test_fractional_coding_points(self):
        # 2/3 hidden tests passed on 30-point question → 20.0
        earned = round((2 / 3) * 30, 2)
        assert earned == 20.0

    def test_fractional_score_stored_as_percentage(self):
        pct = calc_score(7.5, 10.0)
        assert abs(pct - 75.0) < 0.001

    def test_score_never_exceeds_100(self):
        pct = calc_score(100.0, 100.0)
        assert pct <= 100.0

    def test_score_with_multiple_questions(self):
        # 10 MCQ earned + 15 essay earned + 20 coding earned = 45 / 60
        assert abs(calc_score(45.0, 60.0) - 75.0) < 0.01


# ─────────────────────────────────────────────────────────
# Pass/fail threshold
# ─────────────────────────────────────────────────────────

class TestPassFail:
    def test_passes_exactly_at_threshold(self):
        assert is_passed(60.0, 60.0) is True

    def test_fails_one_tenth_below(self):
        assert is_passed(59.9, 60.0) is False

    def test_passes_above_threshold(self):
        assert is_passed(90.0, 60.0) is True

    def test_zero_score_fails(self):
        assert is_passed(0.0, 60.0) is False

    def test_perfect_score_passes(self):
        assert is_passed(100.0, 60.0) is True

    def test_custom_threshold_80(self):
        assert is_passed(79.9, 80.0) is False
        assert is_passed(80.0, 80.0) is True

    def test_custom_threshold_50(self):
        assert is_passed(50.0, 50.0) is True
        assert is_passed(49.9, 50.0) is False

    def test_review_zone_fails(self):
        # 45% with 60% passing → fail
        assert is_passed(45.0, 60.0) is False


# ─────────────────────────────────────────────────────────
# MCQ auto-grade
# ─────────────────────────────────────────────────────────

class TestMCQAutoGrade:
    def test_correct_by_index(self):
        assert calc_mcq_points(2, 2, 10.0) == 10.0

    def test_wrong_by_index(self):
        assert calc_mcq_points(1, 2, 10.0) == 0.0

    def test_none_selected_gives_zero(self):
        assert calc_mcq_points(None, 2, 10.0) == 0.0

    def test_none_correct_index_gives_zero(self):
        assert calc_mcq_points(2, None, 10.0) == 0.0

    def test_first_option_index_0(self):
        assert calc_mcq_points(0, 0, 20.0) == 20.0

    def test_last_option_index_3(self):
        assert calc_mcq_points(3, 3, 15.0) == 15.0

    def test_correct_by_letter_a(self):
        assert calc_mcq_points(0, None, 10.0, correct_option="a") == 10.0

    def test_correct_by_letter_b(self):
        assert calc_mcq_points(1, None, 10.0, correct_option="b") == 10.0

    def test_correct_by_letter_c(self):
        assert calc_mcq_points(2, None, 10.0, correct_option="c") == 10.0

    def test_correct_by_letter_d(self):
        assert calc_mcq_points(3, None, 10.0, correct_option="d") == 10.0

    def test_wrong_by_letter(self):
        assert calc_mcq_points(0, None, 10.0, correct_option="b") == 0.0

    def test_uppercase_letter_handled(self):
        assert calc_mcq_points(0, None, 10.0, correct_option="A") == 10.0

    def test_points_scale(self):
        assert calc_mcq_points(0, 0, 25.0) == 25.0


# ─────────────────────────────────────────────────────────
# Hidden-only coding score
# ─────────────────────────────────────────────────────────

class TestHiddenOnlyScore:
    def _make(self, specs):
        """specs = [(passed, is_hidden)]"""
        tcs = [{"is_hidden": ih} for _, ih in specs]
        results = [{"test_case": i + 1, "passed": p} for i, (p, _) in enumerate(specs)]
        return tcs, results

    def test_all_hidden_passed(self):
        tcs, results = self._make([(True, True), (True, True), (True, True)])
        assert hidden_only_score(tcs, results, 30.0) == 30.0

    def test_two_thirds_hidden_passed(self):
        tcs, results = self._make([(True, True), (True, True), (False, True)])
        assert hidden_only_score(tcs, results, 30.0) == 20.0

    def test_no_hidden_uses_visible(self):
        tcs, results = self._make([(True, False), (False, False)])
        assert hidden_only_score(tcs, results, 10.0) == 5.0

    def test_hidden_passed_visible_failed_scores_on_hidden(self):
        tcs, results = self._make([(True, True), (False, False)])
        assert hidden_only_score(tcs, results, 10.0) == 10.0

    def test_hidden_failed_visible_passed_scores_zero(self):
        tcs, results = self._make([(False, True), (True, False)])
        assert hidden_only_score(tcs, results, 10.0) == 0.0

    def test_no_test_cases_gives_zero(self):
        assert hidden_only_score([], [], 10.0) == 0.0

    def test_camelcase_isHidden(self):
        tcs = [{"isHidden": True}]
        results = [{"test_case": 1, "passed": True}]
        assert hidden_only_score(tcs, results, 10.0) == 10.0

    def test_points_proportional(self):
        tcs, results = self._make([(True, True), (False, True), (False, True)])
        # 1/3 hidden → 1/3 * 30 = 10.0
        assert hidden_only_score(tcs, results, 30.0) == 10.0


# ─────────────────────────────────────────────────────────
# Multi-section assembly
# ─────────────────────────────────────────────────────────

class TestMultiSectionScore:
    def test_all_correct_gives_100(self):
        answers = [
            {"points_earned": 10.0, "points_max": 10.0},  # MCQ
            {"points_earned": 20.0, "points_max": 20.0},  # Essay
            {"points_earned": 30.0, "points_max": 30.0},  # Coding
        ]
        earned = sum(a["points_earned"] for a in answers)
        max_ = sum(a["points_max"] for a in answers)
        assert calc_score(earned, max_) == 100.0

    def test_all_wrong_gives_0(self):
        answers = [
            {"points_earned": 0.0, "points_max": 10.0},
            {"points_earned": 0.0, "points_max": 20.0},
            {"points_earned": 0.0, "points_max": 30.0},
        ]
        earned = sum(a["points_earned"] for a in answers)
        max_ = sum(a["points_max"] for a in answers)
        assert calc_score(earned, max_) == 0.0

    def test_mixed_performance(self):
        # MCQ correct (10), essay zero (0/20), coding 2/3 hidden (20/30)
        answers = [
            {"points_earned": 10.0, "points_max": 10.0},
            {"points_earned": 0.0,  "points_max": 20.0},
            {"points_earned": 20.0, "points_max": 30.0},
        ]
        earned = sum(a["points_earned"] for a in answers)
        max_ = sum(a["points_max"] for a in answers)
        pct = calc_score(earned, max_)
        # 30/60 = 50%
        assert abs(pct - 50.0) < 0.1
        assert is_passed(pct, 60.0) is False

    def test_just_passes_threshold(self):
        # Need 60% on 100-point assessment → earn exactly 60
        answers = [
            {"points_earned": 20.0, "points_max": 30.0},
            {"points_earned": 20.0, "points_max": 30.0},
            {"points_earned": 20.0, "points_max": 40.0},
        ]
        earned = sum(a["points_earned"] for a in answers)
        max_ = sum(a["points_max"] for a in answers)
        pct = calc_score(earned, max_)
        assert abs(pct - 60.0) < 0.1
        assert is_passed(pct, 60.0) is True

    def test_null_points_earned_treated_as_zero(self):
        # Ungraded questions (None points_earned) count as 0
        answers = [
            {"points_earned": 10.0, "points_max": 10.0},
            {"points_earned": None, "points_max": 20.0},  # ungraded
        ]
        earned = sum((a["points_earned"] or 0.0) for a in answers)
        max_ = sum(a["points_max"] for a in answers)
        pct = calc_score(earned, max_)
        assert abs(pct - 33.33) < 0.1
