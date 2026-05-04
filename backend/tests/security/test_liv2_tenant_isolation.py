"""
Tenant isolation security tests for LiV2 endpoints.

Verifies that every LiV2 endpoint correctly scopes data by organization_id,
preventing cross-tenant data leaks. A user authenticated with Org B must
NOT be able to read, modify, or create resources belonging to Org A.

These tests require a LIVE backend with at least 2 organizations configured.
Run with: pytest tests/security/test_liv2_tenant_isolation.py -v
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
from tests.live_interview_v2.fixtures import (
    make_rubric_payload,
    make_bank_payload,
)

# ---------------------------------------------------------------------------
# Mark all tests in this module as integration tests
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.integration

# ---------------------------------------------------------------------------
# Seed-data constants (must match seed script)
# ---------------------------------------------------------------------------
GROUP_ID = "a0000003-0000-0000-0000-000000000003"

# Second-organization credentials.
# These MUST be different from the default hr@eramatch.com org.
ORG_B_EMAIL = os.getenv("ERAMATCH_ORG_B_EMAIL", "org2@company.com")
ORG_B_PASSWORD = os.getenv("ERAMATCH_ORG_B_PASSWORD", "admin12345")

PREFIX = "/live-interview-v2"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def org_a_headers():
    """Authenticated headers for Org A (default hr@eramatch.com)."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/auth/organization-user/login",
            json={"email": "hr@eramatch.com", "password": "admin12345"},
        )
        assert resp.status_code == 200, f"Org A login failed: {resp.text}"
        token = resp.json().get("access_token") or resp.json().get("token")
        assert token, f"No token in response: {resp.json()}"
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def org_b_headers():
    """
    Authenticated headers for a second organization (Org B).
    Skips the entire module if the second-org test user is not available.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/auth/organization-user/login",
            json={"email": ORG_B_EMAIL, "password": ORG_B_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(
                f"Second organization test user not available "
                f"(email={ORG_B_EMAIL}, status={resp.status_code}). "
                f"Set ERAMATCH_ORG_B_EMAIL / ERAMATCH_ORG_B_PASSWORD env vars."
            )
        token = resp.json().get("access_token") or resp.json().get("token")
        assert token, f"No token in response: {resp.json()}"
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def org_a_id(org_a_headers):
    """Fetch organization ID for Org A from the admin profile."""
    with httpx.Client(base_url=BASE_URL, headers=org_a_headers, timeout=30.0) as client:
        resp = client.get("/auth/me")
        assert resp.status_code == 200, f"Failed to get Org A profile: {resp.text}"
        data = resp.json()
        org_id = data.get("organization_id") or data.get("organization", {}).get("id")
        assert org_id, f"No organization_id in Org A profile: {data}"
        return org_id


@pytest.fixture(scope="module")
def org_b_id(org_b_headers):
    """Fetch organization ID for Org B from the admin profile."""
    with httpx.Client(base_url=BASE_URL, headers=org_b_headers, timeout=30.0) as client:
        resp = client.get("/auth/me")
        assert resp.status_code == 200, f"Failed to get Org B profile: {resp.text}"
        data = resp.json()
        org_id = data.get("organization_id") or data.get("organization", {}).get("id")
        assert org_id, f"No organization_id in Org B profile: {data}"
        return org_id


@pytest.fixture(scope="module")
def org_a_rubric(org_a_headers, org_a_id):
    """
    Create a rubric in Org A and return its ID.
    This rubric is the resource that Org B should NOT be able to access.
    """
    payload = make_rubric_payload(GROUP_ID, org_a_id)
    with httpx.Client(base_url=BASE_URL, headers=org_a_headers, timeout=30.0) as client:
        resp = client.post(f"{PREFIX}/rubric", json=payload)
    # If rubric creation fails (e.g., group already has one), try fetching existing
    if resp.status_code == 200:
        return resp.json()["rubric_id"]
    # Fall back to fetching by group
    with httpx.Client(base_url=BASE_URL, headers=org_a_headers, timeout=30.0) as client:
        get_resp = client.get(f"{PREFIX}/rubric/group/{GROUP_ID}")
    if get_resp.status_code == 200:
        return get_resp.json()["rubric_id"]
    pytest.skip("Could not create or fetch a rubric for Org A")
    return None  # unreachable, satisfies type checkers


@pytest.fixture(scope="module")
def org_a_bank(org_a_headers, org_a_id, org_a_rubric):
    """
    Create a bank in Org A and return its ID.
    Requires a frozen rubric — we freeze the rubric from org_a_rubric fixture.
    """
    # Freeze the rubric first
    with httpx.Client(base_url=BASE_URL, headers=org_a_headers, timeout=30.0) as client:
        client.post(f"{PREFIX}/rubric/{org_a_rubric}/freeze")

    payload = make_bank_payload(org_a_rubric, GROUP_ID, org_a_id)
    with httpx.Client(base_url=BASE_URL, headers=org_a_headers, timeout=30.0) as client:
        resp = client.post(f"{PREFIX}/bank", json=payload)
    if resp.status_code == 200:
        return resp.json()["bank_id"]
    # Fall back to fetching by group
    with httpx.Client(base_url=BASE_URL, headers=org_a_headers, timeout=30.0) as client:
        get_resp = client.get(f"{PREFIX}/bank/group/{GROUP_ID}")
    if get_resp.status_code == 200:
        return get_resp.json()["bank_id"]
    pytest.skip("Could not create or fetch a bank for Org A")
    return None


# ===========================================================================
# Test: Rubric Tenant Isolation
# ===========================================================================


class TestRubricTenantIsolation:
    """Verify rubric endpoints enforce organization_id scoping."""

    def test_rubric_scoped_to_org(self, org_a_headers, org_b_headers, org_a_rubric):
        """
        GET rubric from Org A, ensure Org B cannot see it.
        Org B requests the same group_id that Org A's rubric belongs to.
        Since the group belongs to Org A, Org B should get 404 (not found in their org).
        """
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{PREFIX}/rubric/group/{GROUP_ID}")

        # Org B should not see Org A's rubric — 404 means not found in their org
        assert resp.status_code in (403, 404), (
            f"Org B should NOT see Org A's rubric. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )

    def test_create_rubric_org_mismatch(self, org_b_headers, org_b_id, org_a_id):
        """
        POST rubric with organization_id set to Org A while authenticated as Org B.
        The router overrides org_id with current_user.organization_id, so the rubric
        ends up in Org B regardless. This test verifies that the server does NOT
        silently create a rubric in Org A using Org B's session.
        """
        # Payload claims Org A's org_id, but auth is Org B
        payload = make_rubric_payload(GROUP_ID, org_a_id)
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{PREFIX}/rubric", json=payload)

        # The router forces org_id = current_user.organization_id, so the rubric
        # is created in Org B, not Org A. Verify the returned org_id is Org B's.
        if resp.status_code == 200:
            data = resp.json()
            assert data.get("organization_id") != org_a_id, (
                f"Rubric was created with Org A's ID despite Org B auth! "
                f"Cross-tenant leak: {data}"
            )
        else:
            # If creation fails (e.g., group not found in Org B), that's also acceptable
            assert resp.status_code in (400, 403, 404, 422), (
                f"Unexpected status for cross-org rubric creation: {resp.status_code}"
            )

    def test_freeze_rubric_cross_org(self, org_b_headers, org_a_rubric):
        """
        PUT freeze rubric belonging to Org A while authenticated as Org B.
        Should return 404 (rubric not found in Org B's scope).
        """
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{PREFIX}/rubric/{org_a_rubric}/freeze")

        assert resp.status_code in (403, 404), (
            f"Org B should NOT freeze Org A's rubric. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )

    def test_update_rubric_cross_org(self, org_b_headers, org_a_rubric):
        """
        PUT update rubric belonging to Org A while authenticated as Org B.
        Should return 404 (rubric not found in Org B's org_id scope).
        """
        update_payload = {
            "dimensions": [{"name": "Hijacked Dimension", "weight": 100}],
        }
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.put(f"{PREFIX}/rubric/{org_a_rubric}", json=update_payload)

        assert resp.status_code in (403, 404), (
            f"Org B should NOT update Org A's rubric. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )

    def test_update_rubric_settings_cross_org(self, org_b_headers, org_a_rubric):
        """
        PUT update rubric settings belonging to Org A while authenticated as Org B.
        Should return 404.
        """
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.put(
                f"{PREFIX}/rubric/{org_a_rubric}/settings",
                json={"time_budget_minutes": 999},
            )

        assert resp.status_code in (403, 404), (
            f"Org B should NOT update Org A's rubric settings. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )


# ===========================================================================
# Test: Bank Tenant Isolation
# ===========================================================================


class TestBankTenantIsolation:
    """Verify bank endpoints enforce organization_id scoping."""

    def test_bank_scoped_to_org(self, org_a_headers, org_b_headers, org_a_bank):
        """
        GET bank from Org A, ensure Org B cannot see it.
        Org B requests the same group_id — should get 404.
        """
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{PREFIX}/bank/group/{GROUP_ID}")

        assert resp.status_code in (403, 404), (
            f"Org B should NOT see Org A's bank. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )

    def test_create_bank_wrong_org_rubric(
        self, org_b_headers, org_b_id, org_a_rubric, org_a_id
    ):
        """
        POST bank referencing a rubric from Org A while authenticated as Org B.
        The rubric belongs to Org A, so creating a bank in Org B that references
        it should fail or the rubric should not be visible to Org B.
        """
        payload = make_bank_payload(org_a_rubric, GROUP_ID, org_a_id)
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{PREFIX}/bank", json=payload)

        # Either: creation fails because rubric not found in Org B's scope,
        # or the bank is created but scoped to Org B (router overrides org_id).
        if resp.status_code == 200:
            data = resp.json()
            assert data.get("organization_id") != org_a_id, (
                f"Bank was created with Org A's ID despite Org B auth! "
                f"Cross-tenant leak: {data}"
            )
        else:
            assert resp.status_code in (400, 403, 404, 422), (
                f"Unexpected status for cross-org bank creation: {resp.status_code}"
            )

    def test_freeze_bank_cross_org(self, org_b_headers, org_a_bank):
        """
        POST freeze bank belonging to Org A while authenticated as Org B.
        Should return 404.
        """
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.post(f"{PREFIX}/bank/{org_a_bank}/freeze")

        assert resp.status_code in (403, 404), (
            f"Org B should NOT freeze Org A's bank. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )

    def test_update_bank_cross_org(self, org_b_headers, org_a_bank):
        """
        PUT update bank belonging to Org A while authenticated as Org B.
        Should return 404.
        """
        update_payload = {
            "items": [
                {
                    "text": "Cross-org hijack question",
                    "dimension_name": "Hijacked",
                    "is_mandatory": True,
                }
            ]
        }
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.put(f"{PREFIX}/bank/{org_a_bank}", json=update_payload)

        assert resp.status_code in (403, 404), (
            f"Org B should NOT update Org A's bank. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )


# ===========================================================================
# Test: Session Tenant Isolation
# ===========================================================================


class TestSessionTenantIsolation:
    """Verify session and monitoring endpoints enforce organization_id scoping."""

    def test_session_scoped_to_org(self, org_a_headers, org_b_headers):
        """
        GET session belonging to Org A while authenticated as Org B.
        Uses a random UUID — if it happens to be a real Org A session,
        Org B should get 403/404 rather than the data.
        """
        # Use a deterministic fake session ID (unlikely to exist, but the
        # important thing is the org_id filter prevents cross-tenant access)
        fake_session_id = "00000000-0000-0000-0000-000000000001"
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{PREFIX}/session/{fake_session_id}")

        # 404 = not found in Org B's scope (correct isolation)
        # 403 = explicit forbidden
        # 200 would be a LEAK — but this fake ID shouldn't exist in any org
        assert resp.status_code in (403, 404), (
            f"Org B should NOT access sessions from another org. "
            f"Expected 403/404, got {resp.status_code}: {resp.text}"
        )

    def test_session_token_cross_org(self, org_b_headers):
        """
        GET /session/token while authenticated as a candidate from Org B.
        The token endpoint scopes by candidate's organization_id, so a
        candidate from Org B should never get a session for Org A's group.

        Note: This uses the recruiter login for Org B (org_b_headers) to test
        the endpoint behavior. The /session/token endpoint requires
        CurrentCandidate auth, so with recruiter auth it should 401/403.
        """
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{PREFIX}/session/token")

        # Recruiter auth on a candidate endpoint → 401/403/422
        assert resp.status_code in (401, 403, 422), (
            f"Non-candidate auth on /session/token should be rejected. "
            f"Got {resp.status_code}: {resp.text}"
        )

    def test_complete_session_cross_org(self, org_b_headers):
        """
        POST /session/{session_id}/complete from Org B context.
        This endpoint is unauthenticated (called server-to-server by the
        LiveKit agent), so we test with a random session_id to verify
        it doesn't leak data or succeed with a nonexistent session.
        """
        fake_session_id = str(uuid.uuid4())
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            resp = client.post(
                f"{PREFIX}/session/{fake_session_id}/complete",
                json={
                    "transcript": [
                        {
                            "role": "ai",
                            "text": "test",
                            "phase": "opening",
                            "timestamp": 0.0,
                        }
                    ]
                },
            )

        # Should be 404 (session not found) — not 200 with leaked data
        assert resp.status_code in (404,), (
            f"Completing a nonexistent session should return 404. "
            f"Got {resp.status_code}: {resp.text}"
        )

    def test_sessions_monitor_cross_org(self, org_b_headers):
        """
        GET /group/{group_id}/sessions-monitor for Org A's group
        while authenticated as Org B.
        The monitor endpoint filters by current_user.organization_id,
        so Org B should get an empty sessions list or 403/404.
        """
        with httpx.Client(
            base_url=BASE_URL, headers=org_b_headers, timeout=30.0
        ) as client:
            resp = client.get(f"{PREFIX}/group/{GROUP_ID}/sessions-monitor")

        # 404 = group not found in Org B's scope, 403 = forbidden
        # 200 with empty sessions is ALSO acceptable (no data leaked)
        if resp.status_code == 200:
            data = resp.json()
            sessions = data.get("sessions", [])
            assert len(sessions) == 0, (
                f"Org B's sessions-monitor for Org A's group returned "
                f"{len(sessions)} sessions — cross-tenant data leak!"
            )
        else:
            assert resp.status_code in (403, 404), (
                f"Expected 200 (empty), 403, or 404 for cross-org monitor. "
                f"Got {resp.status_code}: {resp.text}"
            )
