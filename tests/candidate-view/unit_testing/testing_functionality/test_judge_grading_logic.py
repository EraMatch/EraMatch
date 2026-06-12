"""
Unit tests for judge grading logic — all 3 question types.

Covers:
- MCQ: correct/wrong/missing answer, letter vs index formats
- Essay: rubric_yes_no_checks persisted and routed to grade-essay-v2
- Coding: expected field name variants, single-arg, multi-arg, hidden-only scoring,
          Python function-based judge subprocess
"""
import ast
import json
import os
import subprocess
import sys
import tempfile
import textwrap

import pytest

# ─────────────────────────────────────────────────────────
# Helpers (mirrors auto_grade_answers logic in isolation)
# ─────────────────────────────────────────────────────────

def grade_mcq(answer_data: dict, correct_answer: dict, points_max: float) -> float:
    """Reproduces the MCQ grading logic from auto_grade_answers."""
    selected = answer_data.get("selected_option") if isinstance(answer_data, dict) else None
    correct_index = correct_answer.get("correct_index")
    if correct_index is None and correct_answer.get("correct_option"):
        opt = correct_answer.get("correct_option")
        if isinstance(opt, str) and len(opt) == 1:
            correct_index = ord(opt.lower()) - ord("a")
    if selected is not None and correct_index is not None:
        return float(points_max) if selected == correct_index else 0.0
    return 0.0


def normalise_expected(tc: dict) -> str:
    """Mirrors the fixed expected field lookup in auto_grade_answers."""
    raw = tc.get("expected") or tc.get("expected_output") or tc.get("output") or ""
    if isinstance(raw, str):
        return raw.strip()
    return str(raw).strip()


def parse_args(raw_input: str) -> list:
    """Mirrors the newline-split arg parser injected into judge subprocesses."""
    lines = [ln for ln in raw_input.strip().split("\n") if ln.strip()]
    args = []
    for ln in lines:
        try:
            args.append(ast.literal_eval(ln))
        except Exception:
            args.append(ln)
    return args


def score_hidden_only(test_results: list, test_cases: list, points_max: float) -> float:
    """Mirrors the hidden-only scoring fix in auto_grade_answers."""
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
        ratio = visible_passed / visible_total if visible_total > 0 else 0
    return round(ratio * points_max, 2)


def run_python_judge(code: str, func_name: str, tc_input: str, expected: str) -> dict:
    """Runs the function-based Python judge subprocess and returns {passed, actual, error}."""
    judge_code = textwrap.dedent(f"""
import sys, json, ast

{code}

_raw_input = {repr(tc_input)}
_lines = [ln for ln in _raw_input.strip().split("\\n") if ln.strip()]
_args = []
for _ln in _lines:
    try:
        _args.append(ast.literal_eval(_ln))
    except Exception:
        _args.append(_ln)

func = globals().get({repr(func_name)})
if func is None:
    print("ERROR:FUNCTION_NOT_FOUND", file=sys.stderr)
    sys.exit(1)

try:
    result = func(*_args) if len(_args) != 1 else func(_args[0])
    _expected_raw = {repr(expected)}
    if isinstance(result, (list, dict)):
        result_str = json.dumps(result, sort_keys=True)
        try:
            expected_str = json.dumps(json.loads(_expected_raw), sort_keys=True)
        except Exception:
            expected_str = _expected_raw.strip()
        print(result_str)
        sys.exit(0 if result_str == expected_str else 1)
    else:
        result_str = str(result)
        expected_str = _expected_raw.strip()
        print(result_str)
        sys.exit(0 if result_str == expected_str else 1)
except Exception as e:
    print(f"ERROR:{{e}}", file=sys.stderr)
    sys.exit(1)
""")
    with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w", encoding="utf-8") as f:
        f.write(judge_code)
        path = f.name
    try:
        proc = subprocess.run(
            [sys.executable, path],
            capture_output=True, text=True, timeout=10
        )
        return {
            "passed": proc.returncode == 0,
            "actual": proc.stdout.strip(),
            "error": proc.stderr.strip() or None,
        }
    finally:
        if os.path.exists(path):
            os.remove(path)


# ─────────────────────────────────────────────────────────
# MCQ Tests
# ─────────────────────────────────────────────────────────

class TestMCQGrading:
    def test_correct_answer_by_index(self):
        assert grade_mcq({"selected_option": 2}, {"correct_index": 2}, 10.0) == 10.0

    def test_wrong_answer_by_index(self):
        assert grade_mcq({"selected_option": 1}, {"correct_index": 2}, 10.0) == 0.0

    def test_correct_answer_by_letter_a(self):
        assert grade_mcq({"selected_option": 0}, {"correct_option": "a"}, 10.0) == 10.0

    def test_correct_answer_by_letter_c(self):
        assert grade_mcq({"selected_option": 2}, {"correct_option": "c"}, 10.0) == 10.0

    def test_wrong_answer_by_letter(self):
        assert grade_mcq({"selected_option": 0}, {"correct_option": "b"}, 10.0) == 0.0

    def test_missing_selection_gives_zero(self):
        assert grade_mcq({}, {"correct_index": 1}, 10.0) == 0.0

    def test_missing_correct_answer_gives_zero(self):
        assert grade_mcq({"selected_option": 2}, {}, 10.0) == 0.0

    def test_points_scale_correctly(self):
        assert grade_mcq({"selected_option": 0}, {"correct_index": 0}, 20.0) == 20.0

    def test_string_answer_data_gives_zero(self):
        # Non-dict answer_data (e.g. raw essay text submitted to MCQ) → 0
        assert grade_mcq("some text", {"correct_index": 0}, 10.0) == 0.0


# ─────────────────────────────────────────────────────────
# Expected-field normalisation Tests
# ─────────────────────────────────────────────────────────

class TestExpectedFieldNormalisation:
    def test_reads_expected_key(self):
        assert normalise_expected({"expected": "[0,1]"}) == "[0,1]"

    def test_reads_expected_output_key(self):
        assert normalise_expected({"expected_output": "[0,1]"}) == "[0,1]"

    def test_reads_output_key(self):
        assert normalise_expected({"output": "[0,1]"}) == "[0,1]"

    def test_prefers_expected_over_expected_output(self):
        assert normalise_expected({"expected": "A", "expected_output": "B"}) == "A"

    def test_missing_all_keys_returns_empty(self):
        assert normalise_expected({"input": "5"}) == ""

    def test_strips_whitespace(self):
        assert normalise_expected({"expected": "  [0, 1]  "}) == "[0, 1]"

    def test_non_string_expected_converted(self):
        assert normalise_expected({"expected": 42}) == "42"


# ─────────────────────────────────────────────────────────
# Arg parsing Tests
# ─────────────────────────────────────────────────────────

class TestArgParsing:
    def test_single_list_arg(self):
        assert parse_args("[2,7,11,15]") == [[2, 7, 11, 15]]

    def test_two_args_newline_separated(self):
        assert parse_args("[2,7,11,15]\n9") == [[2, 7, 11, 15], 9]

    def test_three_args(self):
        assert parse_args("5\n3\n2") == [5, 3, 2]

    def test_string_arg_preserved(self):
        args = parse_args("hello world")
        assert args == ["hello world"]

    def test_empty_lines_ignored(self):
        assert parse_args("[1,2]\n\n3\n") == [[1, 2], 3]

    def test_boolean_arg(self):
        assert parse_args("True") == [True]

    def test_nested_list(self):
        assert parse_args("[[1,2],[3,4]]") == [[[1, 2], [3, 4]]]


# ─────────────────────────────────────────────────────────
# Hidden-only scoring Tests
# ─────────────────────────────────────────────────────────

class TestHiddenOnlyScoring:
    def _make_results(self, specs):
        """specs = [(passed, is_hidden)] — 1-indexed test_case."""
        test_cases = [{"is_hidden": ih} for _, ih in specs]
        test_results = [{"test_case": i + 1, "passed": p} for i, (p, _) in enumerate(specs)]
        return test_results, test_cases

    def test_all_hidden_all_passed(self):
        tr, tc = self._make_results([(True, True), (True, True)])
        assert score_hidden_only(tr, tc, 10.0) == 10.0

    def test_all_hidden_half_passed(self):
        tr, tc = self._make_results([(True, True), (False, True)])
        assert score_hidden_only(tr, tc, 10.0) == 5.0

    def test_no_hidden_falls_back_to_visible(self):
        tr, tc = self._make_results([(True, False), (False, False)])
        assert score_hidden_only(tr, tc, 10.0) == 5.0

    def test_hidden_passed_visible_failed_scores_on_hidden(self):
        # 1 hidden (passed), 1 visible (failed) → score = 10 (hidden only)
        tr, tc = self._make_results([(True, True), (False, False)])
        assert score_hidden_only(tr, tc, 10.0) == 10.0

    def test_hidden_failed_visible_passed_scores_zero(self):
        # 1 hidden (failed), 1 visible (passed) → score = 0 (hidden only)
        tr, tc = self._make_results([(False, True), (True, False)])
        assert score_hidden_only(tr, tc, 10.0) == 0.0

    def test_no_test_cases_at_all(self):
        assert score_hidden_only([], [], 10.0) == 0.0

    def test_isHidden_camelCase_key(self):
        test_cases = [{"isHidden": True}]
        test_results = [{"test_case": 1, "passed": True}]
        assert score_hidden_only(test_results, test_cases, 10.0) == 10.0


# ─────────────────────────────────────────────────────────
# Python judge subprocess Tests (real subprocess execution)
# ─────────────────────────────────────────────────────────

class TestPythonJudge:
    TWO_SUM = textwrap.dedent("""
        def two_sum(nums, target):
            seen = {}
            for i, n in enumerate(nums):
                if target - n in seen:
                    return [seen[target - n], i]
                seen[n] = i
            return []
    """)

    BINARY_SEARCH = textwrap.dedent("""
        def search(nums, target):
            lo, hi = 0, len(nums) - 1
            while lo <= hi:
                mid = (lo + hi) // 2
                if nums[mid] == target:
                    return mid
                elif nums[mid] < target:
                    lo = mid + 1
                else:
                    hi = mid - 1
            return -1
    """)

    def test_two_sum_correct(self):
        r = run_python_judge(self.TWO_SUM, "two_sum", "[2,7,11,15]\n9", "[0,1]")
        assert r["passed"], f"Should pass, got error: {r['error']}"

    def test_two_sum_wrong_answer(self):
        r = run_python_judge(self.TWO_SUM, "two_sum", "[2,7,11,15]\n9", "[1,2]")
        assert not r["passed"], "Wrong expected output should fail"

    def test_two_sum_single_list_input_still_works(self):
        # Input where nums itself wraps everything — legacy format
        r = run_python_judge(self.TWO_SUM, "two_sum", "[3,2,4]\n6", "[1,2]")
        assert r["passed"]

    def test_binary_search_found(self):
        r = run_python_judge(self.BINARY_SEARCH, "search", "[-1,0,3,5,9,12]\n9", "4")
        assert r["passed"], r["error"]

    def test_binary_search_not_found(self):
        r = run_python_judge(self.BINARY_SEARCH, "search", "[-1,0,3,5,9,12]\n2", "-1")
        assert r["passed"], r["error"]

    def test_function_not_found_raises_error(self):
        r = run_python_judge(self.TWO_SUM, "nonexistent_func", "[1,2]\n3", "[0,1]")
        assert not r["passed"]
        assert r["error"] and "FUNCTION_NOT_FOUND" in r["error"]

    def test_runtime_error_does_not_crash_judge(self):
        bad_code = "def bad(nums, target):\n    return nums[9999]"
        r = run_python_judge(bad_code, "bad", "[1,2]\n3", "")
        assert not r["passed"]
        assert r["error"] is not None

    def test_list_output_json_normalised(self):
        code = "def rev(nums):\n    return nums[::-1]"
        r = run_python_judge(code, "rev", "[1,2,3]", "[3,2,1]")
        assert r["passed"], r["error"]

    def test_int_output(self):
        code = "def add(a, b):\n    return a + b"
        r = run_python_judge(code, "add", "3\n4", "7")
        assert r["passed"], r["error"]

    def test_bool_output(self):
        code = "def is_even(n):\n    return n % 2 == 0"
        r = run_python_judge(code, "is_even", "4", "True")
        assert r["passed"], r["error"]


# ─────────────────────────────────────────────────────────
# Essay config Tests
# ─────────────────────────────────────────────────────────

class TestEssayRubricConfig:
    """Verify rubric_yes_no_checks is preserved through config and routes to v2."""

    def test_rubric_checks_extracted_as_criteria(self):
        checks = [
            {"id": 1, "check": "Does the answer explain the concept clearly?", "weight": 0.5},
            {"id": 2, "check": "Does the answer provide a concrete example?", "weight": 0.5},
        ]
        q_config = {
            "rubric": "Grade this essay",
            "rubric_yes_no_checks": checks,
        }
        rubric_criteria = [
            c.get("check", "") for c in q_config.get("rubric_yes_no_checks", [])
            if isinstance(c, dict) and c.get("check")
        ]
        assert len(rubric_criteria) == 2
        assert rubric_criteria[0] == "Does the answer explain the concept clearly?"

    def test_empty_checks_falls_back_to_v1(self):
        q_config = {"rubric": "Grade this essay", "rubric_yes_no_checks": []}
        rubric_criteria = [
            c.get("check", "") for c in q_config.get("rubric_yes_no_checks", [])
            if isinstance(c, dict) and c.get("check")
        ]
        assert len(rubric_criteria) == 0  # → legacy /grade-essay path

    def test_missing_checks_key_falls_back_to_v1(self):
        q_config = {"rubric": "Grade this essay"}
        rubric_criteria = [
            c.get("check", "") for c in (q_config.get("rubric_yes_no_checks") or [])
            if isinstance(c, dict) and c.get("check")
        ]
        assert len(rubric_criteria) == 0

    def test_malformed_check_skipped(self):
        checks = [{"id": 1, "check": "Valid check", "weight": 0.5}, "bad_item", None]
        rubric_criteria = [
            c.get("check", "") for c in checks
            if isinstance(c, dict) and c.get("check")
        ]
        assert len(rubric_criteria) == 1

    def test_essay_config_saved_correctly(self):
        """Simulate assessments.py essay config building."""
        class FakeVariant:
            rubric = "Evaluate depth and accuracy"
            maxWords = 500
            expectedKeywords = ["REST", "HTTP", "stateless"]
            rubricYesNoChecks = [
                {"id": 1, "check": "Defines REST correctly", "weight": 0.4},
                {"id": 2, "check": "Mentions statelessness", "weight": 0.6},
            ]
            explanation = ""

        v = FakeVariant()
        config = {
            "rubric": v.rubric,
            "max_words": v.maxWords,
            "expected_keywords": v.expectedKeywords,
            "rubric_yes_no_checks": v.rubricYesNoChecks or [],
        }
        assert config["rubric_yes_no_checks"] == v.rubricYesNoChecks
        assert len(config["rubric_yes_no_checks"]) == 2
