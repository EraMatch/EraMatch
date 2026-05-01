"""
API contract integration tests for Live Interview V2 (LiV2) endpoints.

Tests verify:
1. Valid payloads → 2xx responses with correct schema shapes
2. Invalid payloads → 422 with error details
3. Missing auth → 401/403 (where applicable)
4. Not-found resources → 404

These tests require a LIVE backend at ERAMATCH_API_URL.
Run with: pytest tests/integration/test_liv2_api_contracts.py -v
"""

import os
import sys
import uuid

import httpx
import pytest

# ---------------------------------------------------------------------------
# Make the parent conftest importable
# ---------------------------------------------------------------------------
_HERE = os.path.abspath(os.path.dirname(__file__))
_BACKEND_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from tests.conftest import BASE_URL

# ---------------------------------------------------------------------------
# Mark all tests in this module as integration tests
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.integration

# ---------------------------------------------------------------------------
# Seed-data constants (must match seed script)
# ---------------------------------------------------------------------------
GROUP_ID = "a0000003-0000-0000-0000-000000000003"
RUBRIC_ID = "a0000040-0000-0000-0000-000000000040"
BANK_ID = "a0000041-0000-0000-0000-000000000041"

# ---------------------------------------------------------------------------
# Fixture helpers (reuse from liv2 fixtures module)
# ---------------------------------------------------------------------------
from tests.live_interview_v2.fixtures import (
    make_rubric_payload,
    make_frozen_rubric_payload,
    make_bank_payload,
    make_frozen_bank_payload,
)

# ---------------------------------------------------------------------------
# Auth fixtures (session-scoped, reuse login logic from conftest)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def admin_headers():
    """Authenticated headers for admin/HR user."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/auth/organization-user/login",
            json={"email": "hr@eramatch.com", "password": "admin12345"},
        )
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        token = resp.json().get("access_token") or resp.json().get("token")
        assert token, f"No token in response: {resp.json()}"
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def candidate_headers():
    """Authenticated headers for candidate user."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/candidate/login",
            json={"email": "sara.alharthi@example.com", "password": "admin12345"},
        )
        assert resp.status_code == 200, f"Candidate login failed: {resp.text}"
        token = resp.json().get("access_token") or resp.json().get("token")
        assert token, f"No token in response: {resp.json()}"
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def organization_id(admin_headers):
    """Fetch organization ID from the admin profile."""
    with httpx.Client(base_url=BASE_URL, headers=admin_headers, timeout=30.0) as client:
        resp = client.get("/auth/me")
        assert resp.status_code == 200, f"Failed to get profile: {resp.text}"
        data = resp.json()
        org_id = data.get("organization_id") or data.get("organization", {}).get("id")
        assert org_id, f"No organization_id in profile: {data}"
        return org_id


# ===========================================================================
# Test: Rubric Endpoints
# ===========================================================================


class TestRubricEndpoints:
    """Contract tests for /live-interview-v2/rubric endpoints."""

    PREFIX = "/live-interview-v2"

    def test_create_rubric_valid(self, admin_headers, organization_id):
        """POST /rubric with valid payload → 200 + RubricResponse."""
        payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/rubric", json=payload)

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        # Validate shape matches RubricResponse
        assert "rubric_id" in data, f"Missing 'rubric_id' in response: {data}"
        assert "group_id" in data, f"Missing 'group_id' in response: {data}"
        assert "organization_id" in data, (
            f"Missing 'organization_id' in response: {data}"
        )
        assert "dimensions" in data, f"Missing 'dimensions' in response: {data}"
        assert isinstance(data["dimensions"], list), f"'dimensions' should be a list"
        assert "state" in data, f"Missing 'state' in response: {data}"
        assert data["state"] in ("draft", "frozen"), (
            f"Unexpected state: {data['state']}"
        )

    def test_create_rubric_missing_fields(self, admin_headers):
        """POST /rubric with missing required fields → 422."""
        # Missing dimensions (required)
        payload = {"group_id": GROUP_ID, "organization_id": str(uuid.uuid4())}
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/rubric", json=payload)

        assert resp.status_code == 422, (
            f"Expected 422, got {resp.status_code}: {resp.text}"
        )
        error_data = resp.json()
        assert "detail" in error_data, f"Missing 'detail' in 422 response: {error_data}"

    def test_get_rubric_by_group(self, admin_headers, organization_id):
        """GET /rubric/group/{group_id} → 200 or 404."""
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/rubric/group/{GROUP_ID}")

        # Either a rubric exists (200) or not (404)
        assert resp.status_code in (200, 404), (
            f"Expected 200 or 404, got {resp.status_code}: {resp.text}"
        )
        if resp.status_code == 200:
            data = resp.json()
            assert "rubric_id" in data, f"Missing 'rubric_id' in response: {data}"
            assert "dimensions" in data, f"Missing 'dimensions' in response: {data}"
            assert "state" in data, f"Missing 'state' in response: {data}"

    def test_update_rubric(self, admin_headers, organization_id):
        """PUT /rubric/{rubric_id} → 200 + updated fields."""
        # First create a rubric to update
        payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            create_resp = client.post(f"{self.PREFIX}/rubric", json=payload)
        assert create_resp.status_code == 200, f"Create failed: {create_resp.text}"
        rubric_id = create_resp.json()["rubric_id"]

        # Now update it
        update_payload = {
            "dimensions": [
                {
                    "name": "Updated Dimension",
                    "weight": 50,
                }
            ],
            "time_budget_minutes": 45,
        }
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.put(f"{self.PREFIX}/rubric/{rubric_id}", json=update_payload)

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "rubric_id" in data, f"Missing 'rubric_id' in update response: {data}"

    def test_freeze_rubric(self, admin_headers, organization_id):
        """POST /rubric/{rubric_id}/freeze → 200 + state='frozen'."""
        # Create a fresh rubric first
        payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            create_resp = client.post(f"{self.PREFIX}/rubric", json=payload)
        assert create_resp.status_code == 200, f"Create failed: {create_resp.text}"
        rubric_id = create_resp.json()["rubric_id"]

        # Freeze it
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/rubric/{rubric_id}/freeze")

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data.get("state") == "frozen", f"Expected state='frozen', got: {data}"

    @pytest.mark.skip(reason="Requires AI service (Ollama) to be running")
    def test_suggest_dimensions(self, admin_headers):
        """POST /rubric/suggest-dimensions → 200."""
        payload = {"group_id": GROUP_ID}
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=60.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/rubric/suggest-dimensions", json=payload)

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "suggestions" in data, f"Missing 'suggestions' in response: {data}"
        assert isinstance(data["suggestions"], list), f"'suggestions' should be a list"

    def test_update_rubric_settings(self, admin_headers, organization_id):
        """PUT /rubric/{rubric_id}/settings → 200."""
        # Create a rubric first
        payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            create_resp = client.post(f"{self.PREFIX}/rubric", json=payload)
        assert create_resp.status_code == 200, f"Create failed: {create_resp.text}"
        rubric_id = create_resp.json()["rubric_id"]

        settings_payload = {
            "include_weak_topics": True,
            "language": "ar",
            "time_budget_minutes": 25,
        }
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.put(
                f"{self.PREFIX}/rubric/{rubric_id}/settings",
                json=settings_payload,
            )

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data.get("success") is True, f"Expected success=True, got: {data}"


# ===========================================================================
# Test: Bank Endpoints
# ===========================================================================


class TestBankEndpoints:
    """Contract tests for /live-interview-v2/bank endpoints."""

    PREFIX = "/live-interview-v2"

    def test_create_bank_valid(self, admin_headers, organization_id):
        """POST /bank with valid payload → 200 + BankResponse."""
        # First create+freeze a rubric so bank has something to reference
        rubric_payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            rubric_resp = client.post(f"{self.PREFIX}/rubric", json=rubric_payload)
        assert rubric_resp.status_code == 200, (
            f"Rubric create failed: {rubric_resp.text}"
        )
        rubric_id = rubric_resp.json()["rubric_id"]

        # Create bank
        bank_payload = make_bank_payload(rubric_id, GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/bank", json=bank_payload)

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "bank_id" in data, f"Missing 'bank_id' in response: {data}"
        assert "group_id" in data, f"Missing 'group_id' in response: {data}"
        assert "items" in data, f"Missing 'items' in response: {data}"
        assert isinstance(data["items"], list), f"'items' should be a list"
        assert "state" in data, f"Missing 'state' in response: {data}"

    def test_create_bank_missing_fields(self, admin_headers):
        """POST /bank with missing required fields → 422."""
        payload = {"group_id": GROUP_ID}
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/bank", json=payload)

        assert resp.status_code == 422, (
            f"Expected 422, got {resp.status_code}: {resp.text}"
        )
        error_data = resp.json()
        assert "detail" in error_data, f"Missing 'detail' in 422 response: {error_data}"

    def test_get_bank_by_group(self, admin_headers):
        """GET /bank/group/{group_id} → 200 or 404."""
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/bank/group/{GROUP_ID}")

        assert resp.status_code in (200, 404), (
            f"Expected 200 or 404, got {resp.status_code}: {resp.text}"
        )
        if resp.status_code == 200:
            data = resp.json()
            assert "bank_id" in data, f"Missing 'bank_id' in response: {data}"
            assert "items" in data, f"Missing 'items' in response: {data}"
            assert "state" in data, f"Missing 'state' in response: {data}"

    def test_update_bank(self, admin_headers, organization_id):
        """PUT /bank/{bank_id} → 200."""
        # Create rubric + bank first
        rubric_payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            rubric_resp = client.post(f"{self.PREFIX}/rubric", json=rubric_payload)
        assert rubric_resp.status_code == 200
        rubric_id = rubric_resp.json()["rubric_id"]

        bank_payload = make_bank_payload(rubric_id, GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            bank_resp = client.post(f"{self.PREFIX}/bank", json=bank_payload)
        assert bank_resp.status_code == 200, f"Bank create failed: {bank_resp.text}"
        bank_id = bank_resp.json()["bank_id"]

        update_payload = {
            "items": [
                {
                    "text": "Updated question text",
                    "dimension_name": "Technical Knowledge",
                    "is_mandatory": True,
                }
            ]
        }
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.put(f"{self.PREFIX}/bank/{bank_id}", json=update_payload)

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "bank_id" in data, f"Missing 'bank_id' in update response: {data}"

    def test_freeze_bank(self, admin_headers, organization_id):
        """POST /bank/{bank_id}/freeze → 200 + state='frozen'."""
        # Create rubric + bank
        rubric_payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            rubric_resp = client.post(f"{self.PREFIX}/rubric", json=rubric_payload)
        assert rubric_resp.status_code == 200
        rubric_id = rubric_resp.json()["rubric_id"]

        # Freeze the rubric first (banks require a frozen rubric)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            client.post(f"{self.PREFIX}/rubric/{rubric_id}/freeze")

        bank_payload = make_bank_payload(rubric_id, GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            bank_resp = client.post(f"{self.PREFIX}/bank", json=bank_payload)
        assert bank_resp.status_code == 200, f"Bank create failed: {bank_resp.text}"
        bank_id = bank_resp.json()["bank_id"]

        # Freeze the bank
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/bank/{bank_id}/freeze")

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data.get("state") == "frozen", f"Expected state='frozen', got: {data}"

    @pytest.mark.skip(reason="Requires AI service (Ollama) to be running")
    def test_generate_bank(self, admin_headers, organization_id):
        """POST /bank/generate → 200."""
        # Create + freeze rubric first
        rubric_payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            rubric_resp = client.post(f"{self.PREFIX}/rubric", json=rubric_payload)
        assert rubric_resp.status_code == 200
        rubric_id = rubric_resp.json()["rubric_id"]

        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            client.post(f"{self.PREFIX}/rubric/{rubric_id}/freeze")

        payload = {"rubric_id": rubric_id}
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=60.0
        ) as client:
            resp = client.post(f"{self.PREFIX}/bank/generate", json=payload)

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "items" in data or "bank_id" in data, (
            f"Unexpected response shape: {data}"
        )


# ===========================================================================
# Test: Session Endpoints
# ===========================================================================


class TestSessionEndpoints:
    """Contract tests for /live-interview-v2/session and monitoring endpoints."""

    PREFIX = "/live-interview-v2"

    def test_get_session_token(self, candidate_headers):
        """GET /session/token with valid auth → 200 + token, room_name, session_id."""
        with httpx.Client(
            base_url=BASE_URL, headers=candidate_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/session/token")

        # 200 if candidate has an active live_interview stage, or 403 if not
        if resp.status_code == 403:
            pytest.skip("No unlocked live interview stage for this candidate")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

        data = resp.json()
        assert "token" in data, f"Missing 'token' in response: {data}"
        assert "room_name" in data, f"Missing 'room_name' in response: {data}"
        assert "session_id" in data, f"Missing 'session_id' in response: {data}"
        # Validate room_name format
        assert data["room_name"].startswith("li-v2-"), (
            f"Room name should start with 'li-v2-', got: {data['room_name']}"
        )
        # Validate session_id is a valid UUID
        uuid.UUID(data["session_id"])  # raises ValueError if invalid

    def test_complete_session(self, candidate_headers):
        """POST /session/{session_id}/complete → 200 (uses unauth client)."""
        # Get a session first
        with httpx.Client(
            base_url=BASE_URL, headers=candidate_headers, timeout=30.0
        ) as client:
            token_resp = client.get(f"{self.PREFIX}/session/token")

        if token_resp.status_code == 403:
            pytest.skip("No unlocked live interview stage for this candidate")
        assert token_resp.status_code == 200, f"Token request failed: {token_resp.text}"
        session_id = token_resp.json()["session_id"]

        # Complete with unauthenticated client (agent calls this)
        transcript = [
            {
                "role": "ai",
                "text": "Hello, can you introduce yourself?",
                "phase": "opening",
                "timestamp": 0.0,
            },
            {
                "role": "candidate",
                "text": "I'm a software engineer with 3 years experience.",
                "phase": "opening",
                "timestamp": 15.0,
            },
        ]
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            resp = client.post(
                f"{self.PREFIX}/session/{session_id}/complete",
                json={"transcript": transcript},
            )

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "status" in data, f"Missing 'status' in complete response: {data}"
        assert "session_id" in data, (
            f"Missing 'session_id' in complete response: {data}"
        )

    def test_get_session(self, admin_headers):
        """GET /session/{session_id} → 200 or 404."""
        fake_session_id = "00000000-0000-0000-0000-000000000000"
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/session/{fake_session_id}")

        # Should be 404 (nonexistent session) or 403 (wrong org)
        assert resp.status_code in (200, 403, 404), (
            f"Expected 200/403/404, got {resp.status_code}: {resp.text}"
        )

    def test_get_sessions_monitor(self, admin_headers):
        """GET /group/{group_id}/sessions-monitor → 200."""
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/group/{GROUP_ID}/sessions-monitor")

        # 200 if group exists in org, 403/404 otherwise
        assert resp.status_code in (200, 403, 404), (
            f"Expected 200/403/404, got {resp.status_code}: {resp.text}"
        )

        if resp.status_code == 200:
            data = resp.json()
            assert "group_id" in data, f"Missing 'group_id' in monitor response: {data}"
            assert "summary" in data, f"Missing 'summary' in monitor response: {data}"
            assert "sessions" in data, f"Missing 'sessions' in monitor response: {data}"
            summary = data["summary"]
            assert "active" in summary, f"Missing 'active' in summary: {summary}"
            assert "completed" in summary, f"Missing 'completed' in summary: {summary}"
            assert "total" in summary, f"Missing 'total' in summary: {summary}"


# ===========================================================================
# Test: Error Handling
# ===========================================================================


class TestErrorHandling:
    """Contract tests for error responses across LiV2 endpoints."""

    PREFIX = "/live-interview-v2"

    def test_rubric_not_found(self, admin_headers):
        """GET /rubric/group/{nonexistent-group} → 404."""
        fake_group_id = str(uuid.uuid4())
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/rubric/group/{fake_group_id}")

        # A random UUID group should not have a rubric → 404
        assert resp.status_code == 404, (
            f"Expected 404 for nonexistent group, got {resp.status_code}: {resp.text}"
        )

    def test_bank_not_found(self, admin_headers):
        """GET /bank/group/{nonexistent-group} → 404."""
        fake_group_id = str(uuid.uuid4())
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/bank/group/{fake_group_id}")

        assert resp.status_code == 404, (
            f"Expected 404 for nonexistent group, got {resp.status_code}: {resp.text}"
        )

    def test_invalid_uuid(self, admin_headers):
        """GET /rubric/group/not-a-uuid → 422 (invalid path parameter)."""
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{self.PREFIX}/rubric/group/not-a-uuid")

        assert resp.status_code == 422, (
            f"Expected 422 for invalid UUID, got {resp.status_code}: {resp.text}"
        )
        error_data = resp.json()
        assert "detail" in error_data, f"Missing 'detail' in 422 response: {error_data}"

    def test_unauthorized_access(self):
        """Request without auth → 401 or 403."""
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            # Rubric endpoint requires auth (CurrentUser)
            rubric_resp = client.get(f"{self.PREFIX}/rubric/group/{GROUP_ID}")
            # Bank endpoint requires auth
            bank_resp = client.get(f"{self.PREFIX}/bank/group/{GROUP_ID}")
            # Session monitor requires auth
            monitor_resp = client.get(
                f"{self.PREFIX}/group/{GROUP_ID}/sessions-monitor"
            )

        for resp in [rubric_resp, bank_resp, monitor_resp]:
            assert resp.status_code in (401, 403), (
                f"Expected 401/403 for unauthed request, got {resp.status_code}: {resp.text}"
            )

    def test_update_frozen_rubric_settings_fails(self, admin_headers, organization_id):
        """PUT /rubric/{frozen_rubric_id}/settings → 400 (cannot update frozen)."""
        # Create and freeze a rubric
        payload = make_rubric_payload(GROUP_ID, organization_id)
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            rubric_resp = client.post(f"{self.PREFIX}/rubric", json=payload)
        assert rubric_resp.status_code == 200
        rubric_id = rubric_resp.json()["rubric_id"]

        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            client.post(f"{self.PREFIX}/rubric/{rubric_id}/freeze")

        # Try to update settings on frozen rubric
        with httpx.Client(
            base_url=BASE_URL, headers=admin_headers, timeout=30.0
        ) as client:
            resp = client.put(
                f"{self.PREFIX}/rubric/{rubric_id}/settings",
                json={"time_budget_minutes": 20},
            )

        assert resp.status_code == 400, (
            f"Expected 400 for updating frozen rubric settings, got {resp.status_code}: {resp.text}"
        )
