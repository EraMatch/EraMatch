"""
Assurance log script for Admin Requests (Approval) functionality.
Tests the full request lifecycle: create → list → approve/reject → verify.

Run: python tests/logs/log_admin_requests.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_admin_token, make_client


def run():
    log = AssuranceLogger("Admin Requests")
    token = get_admin_token()
    client = make_client(token)

    # ── 1. List pending requests ──────────────────────────────────────
    pending_requests = []

    def test_list_pending():
        nonlocal pending_requests
        resp = client.get("/admin/requests?status=pending")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        pending_requests = resp.json()
        return True, f"Found {len(pending_requests)} pending request(s)"
    log.run("List pending approval requests", test_list_pending)

    # ── 2. All pending have correct status ────────────────────────────
    def test_pending_status_correct():
        non_pending = [r for r in pending_requests
                       if r.get("status", "").lower() != "pending"]
        if non_pending:
            return False, f"{len(non_pending)} non-pending items in pending list"
        return True, f"All {len(pending_requests)} items correctly have status=pending"
    log.run("All returned requests have status=pending", test_pending_status_correct)

    # ── 3. Create a test project directly ────────────────────────────
    new_project_id = None

    def test_create_project():
        nonlocal new_project_id
        name = f"AssuranceTestProject_{uuid.uuid4().hex[:6]}"
        resp = client.post("/recruiter/projects", json={
            "name": name,
            "description": "Auto-created by assurance log test",
            "status": "active"
        })
        if resp.status_code not in (200, 201):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        new_project_id = str(data.get("project_id") or data.get("id") or "")
        return True, f"Created project '{name}' with ID {new_project_id}"
    log.run("Create new project via POST /recruiter/projects", test_create_project)

    # ── 4. Create a position in that project ─────────────────────────
    new_position_id = None

    def test_create_position():
        nonlocal new_position_id
        if not new_project_id:
            return False, "No project_id available — project creation failed"
        title = f"AssuranceTech_{uuid.uuid4().hex[:5]}"
        resp = client.post("/recruiter/positions", json={
            "job_title": title,
            "project_id": new_project_id,
            "description": "Auto-created position",
            "status": "open"
        })
        if resp.status_code not in (200, 201):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        new_position_id = str(data.get("id") or data.get("position_id") or "")
        return True, f"Created position '{title}' with ID {new_position_id}"
    log.run("Create new position via POST /recruiter/positions", test_create_position)

    # ── 5. List approved requests ─────────────────────────────────────
    def test_list_approved():
        resp = client.get("/admin/requests?status=approved")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        approved = resp.json()
        return True, f"Found {len(approved)} approved request(s)"
    log.run("List approved requests", test_list_approved)

    # ── 6. List rejected requests ─────────────────────────────────────
    def test_list_rejected():
        resp = client.get("/admin/requests?status=rejected")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        rejected = resp.json()
        return True, f"Found {len(rejected)} rejected request(s)"
    log.run("List rejected requests", test_list_rejected)

    # ── 7. Reject a pending request (lifecycle test) ──────────────────
    rejected_id = None

    def test_reject_pending():
        nonlocal rejected_id
        if not pending_requests:
            return True, "No pending requests to reject (skipped)"
        req = pending_requests[0]
        req_id = str(req.get("id") or req.get("request_id"))
        resp = client.patch(f"/admin/requests/{req_id}/reject", json={
            "review_notes": "Rejected by assurance log — automated test",
            "status": "rejected"
        })
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        rejected_id = req_id
        return True, f"Request {req_id} rejected successfully"
    log.run("Reject first pending request (lifecycle)", test_reject_pending)

    # ── 8. Verify rejected request no longer in pending ───────────────
    def test_verify_rejection():
        if not rejected_id:
            return True, "No rejection to verify (skipped)"
        resp = client.get("/admin/requests?status=pending")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        current_pending_ids = {
            str(r.get("id") or r.get("request_id")) for r in resp.json()
        }
        if rejected_id in current_pending_ids:
            return False, f"Rejected request {rejected_id} still appears in pending list!"
        return True, f"Request {rejected_id} correctly removed from pending list"
    log.run("Verify rejected request is gone from pending list", test_verify_rejection)

    # ── 9. Approve a project-type pending request ─────────────────────
    def test_approve_project_request():
        resp = client.get("/admin/requests?status=pending")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        project_reqs = [r for r in resp.json()
                        if r.get("request_type", "").lower() == "project"]
        if not project_reqs:
            return True, "No project-type pending requests to approve (skipped)"
        req_id = str(project_reqs[0].get("id") or project_reqs[0].get("request_id"))
        resp2 = client.patch(f"/admin/requests/{req_id}/approve", json={
            "review_notes": "Approved by assurance log",
            "status": "approved"
        })
        if resp2.status_code not in (200, 204):
            return False, f"HTTP {resp2.status_code}: {resp2.text[:200]}"
        return True, f"Project request {req_id} approved successfully"
    log.run("Approve a project-type pending request", test_approve_project_request)

    # ── 10. Non-existent request returns 404 ─────────────────────────
    def test_nonexistent_request_404():
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/admin/requests/{fake_id}/approve", json={
            "review_notes": "test",
            "status": "approved"
        })
        if resp.status_code not in (404, 422):
            return False, f"Expected 404/422, got {resp.status_code}"
        return True, f"Non-existent request correctly returns HTTP {resp.status_code}"
    log.run("Approving non-existent request returns 404/422", test_nonexistent_request_404)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
