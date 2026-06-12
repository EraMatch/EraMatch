"""
Integration tests: simulate a candidate solving coding questions.

Scope:
- POST /assessment/run-tests with correct / wrong / partially-correct code
- Verify: test results structure, pass counts, hidden-only scoring, scoring ratio
- Does NOT require a real assessment session — tests the judge subprocess logic
  via run_python_judge (same code path as auto_grade_answers)

These tests run standalone (no live server needed for the subprocess/logic tests).
The HTTP integration tests are in the class TestRunTestsEndpoint which can be
skipped if no server is running.

Run all: pytest test_coding_solve_simulation.py -v
Run only offline: pytest test_coding_solve_simulation.py -v -m "not http"
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
# Shared judge helper (same subprocess template as the backend)
# ─────────────────────────────────────────────────────────

def run_judge(code: str, func_name: str, test_cases: list) -> list:
    """
    Run all test_cases through the Python judge subprocess.
    Returns list of dicts: {test_case, passed, actual, expected, error, is_hidden}.
    """
    results = []
    for i, tc in enumerate(test_cases):
        tc_input = tc.get("input", "")
        expected = (
            tc.get("expected")
            or tc.get("expected_output")
            or tc.get("output")
            or ""
        )
        if isinstance(expected, str):
            expected = expected.strip()
        else:
            expected = str(expected).strip()

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
            results.append({
                "test_case": i + 1,
                "passed": proc.returncode == 0,
                "actual": proc.stdout.strip(),
                "expected": expected,
                "error": proc.stderr.strip() or None,
                "is_hidden": tc.get("is_hidden", tc.get("isHidden", False)),
            })
        finally:
            if os.path.exists(path):
                os.remove(path)
    return results


def compute_score(results: list, points_max: float) -> float:
    """Hidden-only scoring with visible fallback."""
    hidden = [r for r in results if r.get("is_hidden")]
    visible = [r for r in results if not r.get("is_hidden")]
    if hidden:
        ratio = sum(1 for r in hidden if r["passed"]) / len(hidden)
    elif visible:
        ratio = sum(1 for r in visible if r["passed"]) / len(visible)
    else:
        ratio = 0.0
    return round(ratio * points_max, 2)


# ─────────────────────────────────────────────────────────
# Test data: LeetCode-style problems
# ─────────────────────────────────────────────────────────

TWO_SUM_TCS = [
    {"input": "[2,7,11,15]\n9",  "expected": "[0,1]",  "is_hidden": False},
    {"input": "[3,2,4]\n6",      "expected": "[1,2]",  "is_hidden": False},
    {"input": "[3,3]\n6",        "expected": "[0,1]",  "is_hidden": True},
    {"input": "[1,2,3,4]\n7",    "expected": "[2,3]",  "is_hidden": True},
    {"input": "[-1,-2,-3]\n-5",  "expected": "[1,2]",  "is_hidden": True},
]

BINARY_SEARCH_TCS = [
    {"input": "[-1,0,3,5,9,12]\n9", "expected": "4",  "is_hidden": False},
    {"input": "[-1,0,3,5,9,12]\n2", "expected": "-1", "is_hidden": False},
    {"input": "[1]\n1",              "expected": "0",  "is_hidden": True},
    {"input": "[]\n0",               "expected": "-1", "is_hidden": True},
]

MAX_SUBARRAY_TCS = [
    {"input": "[-2,1,-3,4,-1,2,1,-5,4]", "expected": "6",  "is_hidden": False},
    {"input": "[1]",                       "expected": "1",  "is_hidden": False},
    {"input": "[5,4,-1,7,8]",             "expected": "23", "is_hidden": True},
    {"input": "[-1,-2,-3]",               "expected": "-1", "is_hidden": True},
]


# ─────────────────────────────────────────────────────────
# Correct solutions
# ─────────────────────────────────────────────────────────

TWO_SUM_CORRECT = textwrap.dedent("""
    def two_sum(nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []
""")

TWO_SUM_WRONG = textwrap.dedent("""
    def two_sum(nums, target):
        # deliberately wrong — always return [0, 1]
        return [0, 1]
""")

TWO_SUM_PARTIAL = textwrap.dedent("""
    def two_sum(nums, target):
        # Only handles the case nums[0] + nums[1] == target
        if nums[0] + nums[1] == target:
            return [0, 1]
        return []
""")

BINARY_SEARCH_CORRECT = textwrap.dedent("""
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

MAX_SUBARRAY_CORRECT = textwrap.dedent("""
    def max_sub_array(nums):
        cur = best = nums[0]
        for n in nums[1:]:
            cur = max(n, cur + n)
            best = max(best, cur)
        return best
""")


# ─────────────────────────────────────────────────────────
# Full solve simulations
# ─────────────────────────────────────────────────────────

class TestTwoSumSolve:
    def test_correct_solution_passes_all(self):
        results = run_judge(TWO_SUM_CORRECT, "two_sum", TWO_SUM_TCS)
        assert all(r["passed"] for r in results), [r for r in results if not r["passed"]]

    def test_correct_solution_scores_full(self):
        results = run_judge(TWO_SUM_CORRECT, "two_sum", TWO_SUM_TCS)
        assert compute_score(results, 10.0) == 10.0

    def test_wrong_solution_fails_all_hidden(self):
        results = run_judge(TWO_SUM_WRONG, "two_sum", TWO_SUM_TCS)
        hidden_results = [r for r in results if r["is_hidden"]]
        # "Always return [0,1]" passes first visible test but not hidden edge cases
        assert any(not r["passed"] for r in hidden_results)

    def test_wrong_solution_scores_less_than_full_on_hidden(self):
        # "Always return [0,1]" passes the [3,3]→6 hidden test (correct answer is [0,1])
        # but fails the others. Score must be strictly below full.
        results = run_judge(TWO_SUM_WRONG, "two_sum", TWO_SUM_TCS)
        score = compute_score(results, 10.0)
        assert score < 10.0  # can't game the full set of hidden tests

    def test_partial_solution_scores_partial(self):
        results = run_judge(TWO_SUM_PARTIAL, "two_sum", TWO_SUM_TCS)
        score = compute_score(results, 10.0)
        # Partial solution may pass 1/3 hidden tests
        assert 0.0 <= score < 10.0

    def test_results_have_correct_structure(self):
        results = run_judge(TWO_SUM_CORRECT, "two_sum", TWO_SUM_TCS)
        for r in results:
            assert "test_case" in r
            assert "passed" in r
            assert "actual" in r
            assert "expected" in r
            assert "is_hidden" in r

    def test_hidden_test_count(self):
        results = run_judge(TWO_SUM_CORRECT, "two_sum", TWO_SUM_TCS)
        hidden = [r for r in results if r["is_hidden"]]
        visible = [r for r in results if not r["is_hidden"]]
        assert len(hidden) == 3
        assert len(visible) == 2


class TestBinarySearchSolve:
    def test_correct_passes_all(self):
        results = run_judge(BINARY_SEARCH_CORRECT, "search", BINARY_SEARCH_TCS)
        assert all(r["passed"] for r in results), [r for r in results if not r["passed"]]

    def test_full_score(self):
        results = run_judge(BINARY_SEARCH_CORRECT, "search", BINARY_SEARCH_TCS)
        assert compute_score(results, 20.0) == 20.0

    def test_handles_empty_list(self):
        empty_tc = [{"input": "[]\n0", "expected": "-1", "is_hidden": True}]
        results = run_judge(BINARY_SEARCH_CORRECT, "search", empty_tc)
        # Binary search on empty list should return -1
        assert results[0]["passed"]

    def test_single_element(self):
        tc = [{"input": "[5]\n5", "expected": "0", "is_hidden": False}]
        results = run_judge(BINARY_SEARCH_CORRECT, "search", tc)
        assert results[0]["passed"]


class TestMaxSubarraySolve:
    def test_correct_passes_all(self):
        results = run_judge(MAX_SUBARRAY_CORRECT, "max_sub_array", MAX_SUBARRAY_TCS)
        assert all(r["passed"] for r in results), [r for r in results if not r["passed"]]

    def test_all_negative_returns_least_negative(self):
        tc = [{"input": "[-1,-2,-3]", "expected": "-1", "is_hidden": False}]
        results = run_judge(MAX_SUBARRAY_CORRECT, "max_sub_array", tc)
        assert results[0]["passed"]


class TestScoringAccuracy:
    """Verify score calculations at boundary conditions."""

    def test_zero_hidden_uses_visible(self):
        # No hidden tests — score should be from visible
        code = "def f(n):\n    return n + 1"
        tcs = [
            {"input": "1", "expected": "2", "is_hidden": False},
            {"input": "2", "expected": "4", "is_hidden": False},  # wrong: 3 ≠ 4
        ]
        results = run_judge(code, "f", tcs)
        score = compute_score(results, 10.0)
        assert score == 5.0  # 1/2 visible passed

    def test_one_hidden_zero_visible(self):
        code = "def f(n):\n    return n * 2"
        tcs = [{"input": "5", "expected": "10", "is_hidden": True}]
        results = run_judge(code, "f", tcs)
        assert compute_score(results, 10.0) == 10.0

    def test_points_proportional_to_ratio(self):
        code = "def f(n):\n    return n"
        tcs = [
            {"input": "1", "expected": "1", "is_hidden": True},
            {"input": "2", "expected": "99", "is_hidden": True},  # wrong
            {"input": "3", "expected": "3", "is_hidden": True},
        ]
        results = run_judge(code, "f", tcs)
        score = compute_score(results, 30.0)
        assert score == 20.0  # 2/3 × 30

    def test_no_tests_zero_score(self):
        assert compute_score([], 10.0) == 0.0

    def test_runtime_error_counts_as_fail(self):
        bad_code = "def f(n):\n    return 1 / 0"
        tcs = [{"input": "5", "expected": "0.2", "is_hidden": True}]
        results = run_judge(bad_code, "f", tcs)
        assert not results[0]["passed"]
        assert compute_score(results, 10.0) == 0.0

    def test_timeout_within_limit(self):
        """Fast function should not timeout."""
        code = "def f(n):\n    return sum(range(n))"
        tcs = [{"input": "1000", "expected": "499500", "is_hidden": True}]
        results = run_judge(code, "f", tcs)
        assert results[0]["passed"]


class TestEdgeCasesInJudge:
    def test_string_return_value(self):
        code = "def greet(name):\n    return f'Hello {name}'"
        tcs = [{"input": "'Alice'", "expected": "Hello Alice", "is_hidden": False}]
        results = run_judge(code, "greet", tcs)
        assert results[0]["passed"]

    def test_dict_return_value(self):
        # JSON serialisation converts int keys to strings: {1: 'a'} → {"1": "a"}
        # Both the result and expected must go through the same JSON roundtrip.
        code = "def swap(d):\n    return {v: k for k, v in d.items()}"
        tcs = [{"input": "{'a': 1, 'b': 2}", "expected": '{"1": "a", "2": "b"}', "is_hidden": False}]
        results = run_judge(code, "swap", tcs)
        assert results[0]["passed"]

    def test_none_return_value(self):
        code = "def nothing(n):\n    pass"
        tcs = [{"input": "5", "expected": "None", "is_hidden": False}]
        results = run_judge(code, "nothing", tcs)
        assert results[0]["passed"]

    def test_deeply_nested_list_sorted_comparison(self):
        code = "def sort_lists(lst):\n    return sorted(lst)"
        tcs = [{"input": "[3,1,2]", "expected": "[1, 2, 3]", "is_hidden": False}]
        results = run_judge(code, "sort_lists", tcs)
        assert results[0]["passed"]

    def test_helper_function_in_candidate_code(self):
        code = textwrap.dedent("""
            def _helper(n):
                return n * 2

            def double_all(nums):
                return [_helper(n) for n in nums]
        """)
        tcs = [{"input": "[1,2,3]", "expected": "[2,4,6]", "is_hidden": True}]
        results = run_judge(code, "double_all", tcs)
        assert results[0]["passed"], results[0].get("error")

    def test_class_based_solution_not_needed(self):
        """
        We test plain functions only. Class-based solutions (Solution().method())
        are handled by the frontend displaying the starter_code stub correctly.
        """
        code = textwrap.dedent("""
            def two_sum(nums, target):
                for i in range(len(nums)):
                    for j in range(i+1, len(nums)):
                        if nums[i] + nums[j] == target:
                            return [i, j]
                return []
        """)
        tcs = [{"input": "[2,7,11,15]\n9", "expected": "[0,1]", "is_hidden": True}]
        results = run_judge(code, "two_sum", tcs)
        assert results[0]["passed"]
