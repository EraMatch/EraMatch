"""
Tests for coding question schema fields and run-tests endpoint.
Backend must be running at http://localhost:8000.
"""
import pytest
import httpx

BASE_URL = "http://localhost:8000/api/v1"
RECRUITER_EMAIL = "hr@eramatch.com"
RECRUITER_PASSWORD = "admin12345"


@pytest.fixture(scope="module")
def recruiter_token():
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
        resp = c.post("/auth/organization-user/login", json={
            "email": RECRUITER_EMAIL, "password": RECRUITER_PASSWORD
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        return resp.json()["access_token"]


@pytest.fixture(scope="module")
def recruiter_client(recruiter_token):
    return httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {recruiter_token}"},
        timeout=30.0,
    )


class TestCodingQuestionSchema:
    """New coding fields are accepted on create and returned on read."""

    @pytest.fixture(scope="class")
    def coding_question_id(self, recruiter_client):
        payload = {
            "text": "Two Sum",
            "type": "Code",
            "difficulty": "Easy",
            "category": "Array",
            "tags": ["Array", "Hash Table"],
            "starterCode": "def two_sum(nums, target):\n    pass",
            "functionName": "two_sum",
            "inputFormat": "nums: List[int]\ntarget: int",
            "outputFormat": "List[int] — indices [i, j]",
            "examples": [
                {"input": "nums=[2,7,11,15], target=9", "output": "[0,1]", "explanation": "2+7=9"}
            ],
            "constraints": ["2 ≤ n ≤ 10⁴"],
            "topics": ["Array"],
            "testCases": [
                {"input": "[2,7,11,15]\n9", "expected": "[0,1]", "is_hidden": False},
                {"input": "[3,2,4]\n6",     "expected": "[1,2]", "is_hidden": True},
            ],
            "timeLimit": 10,
        }
        resp = recruiter_client.post("/questions/bank", json=payload)
        assert resp.status_code == 200, f"Create failed: {resp.text}"
        return resp.json()["id"]

    def test_starter_code_returned(self, recruiter_client, coding_question_id):
        resp = recruiter_client.get("/questions/bank")
        assert resp.status_code == 200
        q = next((x for x in resp.json() if x["id"] == coding_question_id), None)
        assert q is not None
        assert q["starterCode"] == "def two_sum(nums, target):\n    pass"

    def test_function_name_returned(self, recruiter_client, coding_question_id):
        resp = recruiter_client.get("/questions/bank")
        assert resp.status_code == 200
        q = next((x for x in resp.json() if x["id"] == coding_question_id), None)
        assert q["functionName"] == "two_sum"

    def test_examples_returned(self, recruiter_client, coding_question_id):
        resp = recruiter_client.get("/questions/bank")
        assert resp.status_code == 200
        q = next((x for x in resp.json() if x["id"] == coding_question_id), None)
        assert isinstance(q["examples"], list)
        assert q["examples"][0]["explanation"] == "2+7=9"

    def test_input_output_format_returned(self, recruiter_client, coding_question_id):
        resp = recruiter_client.get("/questions/bank")
        assert resp.status_code == 200
        q = next((x for x in resp.json() if x["id"] == coding_question_id), None)
        assert "nums" in q["inputFormat"]
        assert "indices" in q["outputFormat"]

    def test_constraints_returned(self, recruiter_client, coding_question_id):
        resp = recruiter_client.get("/questions/bank")
        assert resp.status_code == 200
        q = next((x for x in resp.json() if x["id"] == coding_question_id), None)
        assert isinstance(q["constraints"], list)
        assert q["constraints"][0] == "2 ≤ n ≤ 10⁴"


class TestRunTestsFunctionNameLookup:
    """run-tests uses function_name from question config, not regex."""

    def test_helper_function_does_not_confuse_extractor(self, recruiter_client):
        """
        Verify function_name field is stored and readable on coding questions.
        Full execution with helper functions is covered by test_coding_submission_flow.py.
        """
        resp = recruiter_client.get("/questions/bank")
        assert resp.status_code == 200
        coding_qs = [q for q in resp.json() if q.get("type") == "Code" and q.get("functionName")]
        assert len(coding_qs) > 0, "Need at least one coding question with functionName set"
        q = coding_qs[0]
        assert q["functionName"] is not None
        assert len(q["functionName"]) > 0


class TestSeedScriptNormalizer:
    """seed_leetcode.py normalization logic — no live DB needed."""

    def _normalize(self, problem, org_id):
        import sys as _sys
        _sys.path.insert(0, "/Users/anasahmed/Uni_projects/grad_project/Main_Dev/EraMatch/backend/scripts")
        from seed_leetcode import normalize
        return normalize(problem, org_id)

    def test_basic_normalization(self):
        from uuid import uuid4
        org = uuid4()
        problem = {
            "title": "Two Sum",
            "description": "Given nums and target, return indices.",
            "difficulty": "Easy",
            "python_starter_code": "class Solution:\n    def twoSum(self, nums, target):\n        pass",
            "examples": [{"input": "nums=[2,7,11,15],target=9", "output": "[0,1]", "explanation": "2+7=9"}],
            "constraints": ["2 ≤ n ≤ 10⁴"],
            "tags": [{"name": "Array"}, {"name": "Hash Table"}],
        }
        row = self._normalize(problem, org)
        cfg = row["question_config"]

        assert row["source"] == "leetcode"
        assert row["question_type"] == "coding"
        assert row["difficulty"] == 1
        assert cfg["function_name"] == "twoSum"
        assert "twoSum" in cfg["starter_code"]
        assert "class Solution" not in cfg["starter_code"]
        assert cfg["constraints"] == ["2 ≤ n ≤ 10⁴"]
        assert cfg["examples"][0]["explanation"] == "2+7=9"
        assert cfg["test_cases"][0]["is_hidden"] is False
        assert cfg["supported_languages"] == ["python"]

    def test_missing_starter_code_handled(self):
        from uuid import uuid4
        org = uuid4()
        problem = {
            "title": "No Starter",
            "description": "Some problem.",
            "difficulty": "Medium",
        }
        row = self._normalize(problem, org)
        assert row is not None
        assert row["question_config"]["starter_code"] is None
        assert row["question_config"]["function_name"] is None

    def test_difficulty_mapping(self):
        from uuid import uuid4
        org = uuid4()
        for diff_str, diff_int in [("Easy", 1), ("Medium", 2), ("Hard", 3)]:
            row = self._normalize({"title": f"Q-{diff_str}", "difficulty": diff_str}, org)
            assert row["difficulty"] == diff_int, f"{diff_str} should map to {diff_int}"

    def test_tag_extraction_from_dict_list(self):
        from uuid import uuid4
        org = uuid4()
        problem = {"title": "Q", "tags": [{"name": "Array"}, {"name": "DP"}]}
        row = self._normalize(problem, org)
        assert row["tags"] == ["Array", "DP"]
        assert row["question_config"]["topics"] == ["Array", "DP"]
