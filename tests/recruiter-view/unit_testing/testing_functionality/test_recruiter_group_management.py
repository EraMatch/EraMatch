"""
Tests for Recruiter Group Management functionality.
Covers: group details, update, delete, stats, candidate progress,
        stages, activity log, interview assignment, offers, bulk progression.

Note: Group analysis/technical-ai/risks are already tested in
      admin-view/test_admin_group_insights.py — skipped here.

Backend endpoints (groups.py router):
  GET    /recruiter/groups/{id}
  PATCH  /recruiter/groups/{id}
  DELETE /recruiter/groups/{id}
  GET    /recruiter/groups/{id}/stats
  GET    /recruiter/groups/{id}/candidates/progress
  POST   /recruiter/groups/{id}/stages/start
  POST   /recruiter/groups/{id}/stages/close
  GET    /recruiter/groups/{id}/activity
  POST   /recruiter/groups/{id}/interviews/assign
  DELETE /recruiter/groups/{id}/interviews/{iid}
  POST   /recruiter/groups/{id}/offers/send
  POST   /recruiter/groups/{id}/candidates/bulk-progress
  POST   /recruiter/groups/{id}/interviews/schedule
  GET    /recruiter/groups/export
"""
import pytest
import uuid


class TestGroupDetails:
    """Tests for getting group details."""

    def _get_group_id(self, client):
        """Helper: return the ID of the first group from the first position."""
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        position_id = str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))
        groups_resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if groups_resp.status_code != 200 or not groups_resp.json():
            return None
        group = groups_resp.json()[0]
        return str(group.get("id") or group.get("group_id"))

    def test_group_details_returns_200(self, client):
        """GET /recruiter/groups/{id} returns 200."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_group_details_has_fields(self, client):
        """Group details has name and position info."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}")
        data = resp.json()
        has_name = any(k in data for k in ["name", "group_name", "groupName"])
        assert has_name, f"Group details missing name: {data}"

    def test_group_details_for_fake_id(self, client):
        """GET group with fake UUID returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/groups/{fake_id}")
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake group, got {resp.status_code}"
        )


class TestGroupStats:
    """Tests for group statistics."""

    def _get_group_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        position_id = str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))
        groups_resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if groups_resp.status_code != 200 or not groups_resp.json():
            return None
        return str(groups_resp.json()[0].get("id") or groups_resp.json()[0].get("group_id"))

    def test_group_stats_returns_200(self, client):
        """GET /recruiter/groups/{id}/stats returns 200."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stats")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_group_stats_is_dict(self, client):
        """Stats response is a dict."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stats")
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"


class TestCandidateProgress:
    """Tests for candidate progress within a group."""

    def _get_group_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        position_id = str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))
        groups_resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if groups_resp.status_code != 200 or not groups_resp.json():
            return None
        return str(groups_resp.json()[0].get("id") or groups_resp.json()[0].get("group_id"))

    def test_candidate_progress_returns_200(self, client):
        """GET /recruiter/groups/{id}/candidates/progress returns 200."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/candidates/progress")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_candidate_progress_is_list(self, client):
        """Candidate progress response is a list."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/candidates/progress")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"


class TestGroupActivityLog:
    """Tests for group activity log."""

    def _get_group_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        position_id = str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))
        groups_resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if groups_resp.status_code != 200 or not groups_resp.json():
            return None
        return str(groups_resp.json()[0].get("id") or groups_resp.json()[0].get("group_id"))

    def test_activity_log_returns_200(self, client):
        """GET /recruiter/groups/{id}/activity returns 200."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/activity")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_activity_log_is_list(self, client):
        """Activity log response is a list."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/activity")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"


class TestGroupUpdate:
    """Tests for updating a group."""

    def _get_group_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        position_id = str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))
        groups_resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if groups_resp.status_code != 200 or not groups_resp.json():
            return None
        return str(groups_resp.json()[0].get("id") or groups_resp.json()[0].get("group_id"))

    def test_update_group_returns_200(self, client):
        """PATCH /recruiter/groups/{id} with valid data returns 200."""
        gid = self._get_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.patch(f"/recruiter/groups/{gid}", json={
            "name": "Updated Test Group"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_update_nonexistent_group_returns_error(self, client):
        """PATCH group with fake UUID returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/recruiter/groups/{fake_id}", json={
            "name": "Should fail"
        })
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake group, got {resp.status_code}"
        )


class TestGroupStages:
    """Tests for starting and closing stages."""

    def _get_group_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        position_id = str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))
        groups_resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if groups_resp.status_code != 200 or not groups_resp.json():
            return None
        return str(groups_resp.json()[0].get("id") or groups_resp.json()[0].get("group_id"))

    def test_start_stage_for_fake_group_returns_error(self, client):
        """POST start stage for a fake group returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/recruiter/groups/{fake_id}/stages/start", json={
            "stage": "assessment"
        })
        assert resp.status_code in (404, 403, 422, 400), (
            f"Expected error for fake group stage start, got {resp.status_code}"
        )

    def test_close_stage_for_fake_group_returns_error(self, client):
        """POST close stage for a fake group returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/recruiter/groups/{fake_id}/stages/close", json={
            "stage": "assessment"
        })
        assert resp.status_code in (404, 403, 422, 400), (
            f"Expected error for fake group stage close, got {resp.status_code}"
        )


class TestGroupBulkProgress:
    """Tests for bulk candidate progression."""

    def test_bulk_progress_for_fake_group_returns_error(self, client):
        """POST bulk-progress for a fake group returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/recruiter/groups/{fake_id}/candidates/bulk-progress", json={
            "application_ids": [str(uuid.uuid4())],
            "action": "progress"
        })
        assert resp.status_code in (404, 403, 422, 400), (
            f"Expected error for fake group bulk-progress, got {resp.status_code}"
        )


class TestGroupOffers:
    """Tests for sending offers."""

    def test_send_offers_for_fake_group_returns_error(self, client):
        """POST send offers for a fake group returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/recruiter/groups/{fake_id}/offers/send", json={
            "application_ids": [str(uuid.uuid4())],
            "email_subject": "Test Offer",
            "email_body": "Congratulations!"
        })
        assert resp.status_code in (404, 403, 422, 400), (
            f"Expected error for fake group offers, got {resp.status_code}"
        )


class TestGroupInterviews:
    """Tests for interview assignment."""

    def test_delete_interview_for_fake_group_returns_error(self, client):
        """DELETE interview for a fake group returns error."""
        fake_group = str(uuid.uuid4())
        fake_interview = str(uuid.uuid4())
        resp = client.delete(f"/recruiter/groups/{fake_group}/interviews/{fake_interview}")
        assert resp.status_code in (404, 403, 422, 400), (
            f"Expected error for fake group interview delete, got {resp.status_code}"
        )


class TestGroupDelete:
    """Tests for deleting a group."""

    def test_delete_nonexistent_group_returns_error(self, client):
        """DELETE group with fake UUID returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/recruiter/groups/{fake_id}")
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake group delete, got {resp.status_code}"
        )
