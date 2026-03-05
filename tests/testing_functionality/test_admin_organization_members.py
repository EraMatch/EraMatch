"""
Tests for Admin Organization Members functionality.
Covers: list members, member stats, register employee, edit privileges,
        suspend/activate member, remove member, search/filter.

Backend endpoints:
  GET    /admin/users
  GET    /admin/members/stats
  POST   /admin/members/register
  DELETE /admin/members/{id}
  PATCH  /admin/members/{id}/status?status=...
  GET    /admin/members/{id}/privileges
  PATCH  /admin/members/{id}/privileges
"""
import pytest
import uuid


class TestMemberListing:
    """Tests for listing and displaying organization members."""

    def test_list_members_returns_200(self, client):
        """GET /admin/users returns 200."""
        resp = client.get("/admin/users")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_members_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/admin/users")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"

    def test_members_have_required_fields(self, client):
        """Each member in the list has id, email, role, status."""
        resp = client.get("/admin/users")
        members = resp.json()
        for member in members:
            assert "email" in member, f"Member missing email: {member}"
            has_id = any(k in member for k in ["id", "user_id"])
            assert has_id, f"Member missing ID: {member}"
            assert "role" in member, f"Member missing role: {member}"

    def test_admin_is_in_member_list(self, client):
        """The logged-in admin should appear in the member list."""
        resp = client.get("/admin/users")
        members = resp.json()
        emails = [m.get("email", "").lower() for m in members]
        assert "admin_1@eramatch.com" in emails, (
            f"Admin not found in member list. Emails found: {emails}"
        )

    def test_member_status_is_valid_value(self, client):
        """All members have a valid status value."""
        resp = client.get("/admin/users")
        members = resp.json()
        valid_statuses = {"active", "suspended", "pending", "inactive"}
        for member in members:
            status = member.get("status", "").lower()
            assert status in valid_statuses, (
                f"Invalid status '{status}' for member {member.get('email')}"
            )

    def test_member_role_is_valid_value(self, client):
        """All members have a recognized role."""
        resp = client.get("/admin/users")
        members = resp.json()
        valid_roles = {"admin", "hr", "technical", "recruiter", "viewer"}
        for member in members:
            role = member.get("role", "").lower()
            assert role in valid_roles, (
                f"Unexpected role '{role}' for member {member.get('email')}"
            )

    def test_list_members_pagination(self, client):
        """Pagination parameters skip and limit are accepted."""
        resp = client.get("/admin/users?skip=0&limit=5")
        assert resp.status_code == 200, f"Pagination failed: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) <= 5, f"Expected ≤5 results with limit=5, got {len(data)}"


class TestMemberStats:
    """Tests for member statistics dashboard."""

    def test_member_stats_returns_200(self, client):
        """GET /admin/members/stats returns 200."""
        resp = client.get("/admin/members/stats")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_member_stats_has_required_fields(self, client):
        """Stats response has totalActive, adminsCount, recruitersCount."""
        resp = client.get("/admin/members/stats")
        data = resp.json()
        expected = ["totalActive", "adminsCount", "recruitersCount"]
        for field in expected:
            assert field in data, f"Missing field '{field}' in member stats: {data}"

    def test_member_stats_values_are_non_negative(self, client):
        """All stat values should be >= 0."""
        resp = client.get("/admin/members/stats")
        data = resp.json()
        for field in ["totalActive", "adminsCount", "recruitersCount"]:
            val = data.get(field, -1)
            assert val >= 0, f"Field '{field}' has negative value: {val}"

    def test_member_stats_total_active_matches_list(self, client):
        """totalActive count is consistent with the user list active count."""
        stats_resp = client.get("/admin/members/stats")
        members_resp = client.get("/admin/users")
        if stats_resp.status_code != 200 or members_resp.status_code != 200:
            pytest.skip("Could not fetch both stats and member list")
        total_active_stat = stats_resp.json().get("totalActive", 0)
        active_in_list = sum(
            1 for m in members_resp.json()
            if m.get("status", "").lower() == "active"
        )
        assert total_active_stat == active_in_list, (
            f"Mismatch: stats say {total_active_stat} active, list has {active_in_list}"
        )


class TestRegisterEmployee:
    """Tests for registering new employees."""

    def test_register_hr_employee(self, client):
        """POST /admin/members/register creates a new HR user."""
        unique_email = f"test_hr_{uuid.uuid4().hex[:8]}@eramatch-test.com"
        payload = {
            "firstName": "Test",
            "lastName": "HRUser",
            "email": unique_email,
            "role": "hr"
        }
        resp = client.post("/admin/members/register", json=payload)
        assert resp.status_code in (200, 201), (
            f"Expected 200/201 for HR registration, got {resp.status_code}: {resp.text}"
        )

    def test_register_technical_employee(self, client):
        """POST /admin/members/register creates a new Technical user."""
        unique_email = f"test_tech_{uuid.uuid4().hex[:8]}@eramatch-test.com"
        payload = {
            "firstName": "Test",
            "lastName": "TechUser",
            "email": unique_email,
            "role": "technical"
        }
        resp = client.post("/admin/members/register", json=payload)
        assert resp.status_code in (200, 201), (
            f"Expected 200/201 for Technical registration, got {resp.status_code}: {resp.text}"
        )

    def test_register_returns_user_data(self, client):
        """Register response includes at minimum an email or ID."""
        unique_email = f"test_reg_{uuid.uuid4().hex[:8]}@eramatch-test.com"
        payload = {
            "firstName": "Test",
            "lastName": "Registered",
            "email": unique_email,
            "role": "hr"
        }
        resp = client.post("/admin/members/register", json=payload)
        if resp.status_code not in (200, 201):
            pytest.skip(f"Registration not available: {resp.status_code}")
        data = resp.json()
        has_id = any(k in data for k in ["id", "user_id", "email"])
        assert has_id, f"Register response missing user id/email: {data}"

    def test_register_missing_email_returns_422(self, client):
        """Registration without email returns 422."""
        resp = client.post("/admin/members/register", json={
            "firstName": "No",
            "lastName": "Email",
            "role": "hr"
        })
        assert resp.status_code in (400, 422), (
            f"Expected validation error, got {resp.status_code}: {resp.text}"
        )

    def test_register_missing_role_returns_error(self, client):
        """Registration without a role should fail validation."""
        unique_email = f"norole_{uuid.uuid4().hex[:8]}@eramatch-test.com"
        resp = client.post("/admin/members/register", json={
            "firstName": "No",
            "lastName": "Role",
            "email": unique_email
        })
        assert resp.status_code in (400, 422), (
            f"Expected validation error on missing role, got {resp.status_code}: {resp.text}"
        )

    def test_register_duplicate_email_returns_400(self, client):
        """Registering the same email twice returns 400."""
        unique_email = f"dup_{uuid.uuid4().hex[:8]}@eramatch-test.com"
        payload = {"firstName": "ToDelete", "lastName": "User", "email": unique_email, "role": "hr"}
        # First registration
        first = client.post("/admin/members/register", json=payload)
        if first.status_code not in (200, 201):
            pytest.skip("First registration failed, cannot test duplicate")
        # Second registration with same email
        second = client.post("/admin/members/register", json=payload)
        assert second.status_code in (400, 409), (
            f"Expected 400/409 for duplicate email, got {second.status_code}: {second.text}"
        )


class TestMemberPrivileges:
    """Tests for reading and updating member permissions."""

    def _get_non_admin_member_id(self, client):
        """Helper: return the ID of the first non-admin member."""
        resp = client.get("/admin/users")
        if resp.status_code != 200:
            return None
        members = resp.json()
        non_admins = [m for m in members if m.get("role", "").lower() != "admin"]
        if not non_admins:
            return None
        return str(non_admins[0].get("id") or non_admins[0].get("user_id"))

    def test_get_privileges_returns_200(self, client):
        """GET /admin/members/{id}/privileges returns 200."""
        member_id = self._get_non_admin_member_id(client)
        if not member_id:
            pytest.skip("No non-admin member available")
        resp = client.get(f"/admin/members/{member_id}/privileges")
        assert resp.status_code == 200, (
            f"Expected 200 for privileges, got {resp.status_code}: {resp.text}"
        )

    def test_privileges_has_permissions_object(self, client):
        """Privileges response includes a permissions object with flags."""
        member_id = self._get_non_admin_member_id(client)
        if not member_id:
            pytest.skip("No non-admin member available")
        resp = client.get(f"/admin/members/{member_id}/privileges")
        if resp.status_code != 200:
            pytest.skip("Privileges endpoint not available")
        data = resp.json()
        assert "permissions" in data, f"Missing 'permissions' in response: {data}"
        perms = data["permissions"]
        expected_flags = [
            "managePositions", "manageUsers", "manageCandidates",
            "viewAnalytics", "exportData"
        ]
        for flag in expected_flags:
            assert flag in perms, f"Missing permission flag '{flag}' in: {perms}"

    def test_update_privileges_returns_success(self, client):
        """PATCH /admin/members/{id}/privileges returns success."""
        member_id = self._get_non_admin_member_id(client)
        if not member_id:
            pytest.skip("No non-admin member available")
        resp = client.patch(f"/admin/members/{member_id}/privileges", json={
            "permissions": {
                "managePositions": True,
                "manageUsers": False,
                "manageCandidates": True,
                "viewAnalytics": True,
                "exportData": False
            }
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on privileges update, got {resp.status_code}: {resp.text}"
        )


class TestMemberStatusManagement:
    """Tests for suspending, activating, and removing members."""

    def _get_hr_member_id(self, client):
        """Helper: return the ID of the first HR member."""
        resp = client.get("/admin/users")
        if resp.status_code != 200:
            return None
        members = resp.json()
        hr_members = [m for m in members if m.get("role", "").lower() == "hr"]
        if not hr_members:
            return None
        return str(hr_members[0].get("id") or hr_members[0].get("user_id"))

    def test_suspend_member_returns_success(self, client):
        """PATCH /admin/members/{id}/status?status=suspended returns success."""
        member_id = self._get_hr_member_id(client)
        if not member_id:
            pytest.skip("No HR member available to suspend")
        resp = client.patch(f"/admin/members/{member_id}/status?status=suspended")
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on suspend, got {resp.status_code}: {resp.text}"
        )

    def test_activate_member_returns_success(self, client):
        """PATCH /admin/members/{id}/status?status=active returns success."""
        member_id = self._get_hr_member_id(client)
        if not member_id:
            pytest.skip("No HR member available to activate")
        resp = client.patch(f"/admin/members/{member_id}/status?status=active")
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on activate, got {resp.status_code}: {resp.text}"
        )

    def test_invalid_status_value_returns_error(self, client):
        """PATCH with invalid status should return 422."""
        member_id = self._get_hr_member_id(client)
        if not member_id:
            pytest.skip("No HR member available")
        resp = client.patch(f"/admin/members/{member_id}/status?status=invalid_status")
        assert resp.status_code in (400, 422, 404), (
            f"Expected 400/422/404 for invalid status, got {resp.status_code}: {resp.text}"
        )

    def test_update_nonexistent_member_status(self, client):
        """PATCH with a fake member ID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/admin/members/{fake_id}/status?status=suspended")
        assert resp.status_code in (404, 422), (
            f"Expected 404 for fake member, got {resp.status_code}: {resp.text}"
        )

    def test_remove_registered_test_member(self, client):
        """Register a test user, then immediately remove them. Verifies full cycle."""
        unique_email = f"remove_me_{uuid.uuid4().hex[:8]}@eramatch-test.com"
        reg_resp = client.post("/admin/members/register", json={
            "first_name": "ToDelete",
            "last_name": "User",
            "email": unique_email,
            "role": "hr"
        })
        if reg_resp.status_code not in (200, 201):
            pytest.skip("Registration not available for remove test")
        data = reg_resp.json()
        member_id = str(data.get("id") or data.get("user_id"))
        del_resp = client.delete(f"/admin/members/{member_id}")
        assert del_resp.status_code in (200, 204), (
            f"Expected 200/204 on delete, got {del_resp.status_code}: {del_resp.text}"
        )
        # Verify removed member no longer appears in list
        list_resp = client.get("/admin/users")
        if list_resp.status_code == 200:
            member_emails = [m.get("email") for m in list_resp.json()]
            assert unique_email not in member_emails, (
                f"Deleted member {unique_email} still appears in list!"
            )

    def test_remove_nonexistent_member_returns_404(self, client):
        """DELETE with a fake member ID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/admin/members/{fake_id}")
        assert resp.status_code in (404, 422), (
            f"Expected 404 for fake member delete, got {resp.status_code}: {resp.text}"
        )
