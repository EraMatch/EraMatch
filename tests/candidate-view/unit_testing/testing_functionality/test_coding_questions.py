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
