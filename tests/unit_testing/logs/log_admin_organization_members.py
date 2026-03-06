"""
Assurance log script for Admin Organization Members functionality.
Tests the full member lifecycle: list → register → verify → suspend → activate → remove.

Run: python tests/logs/log_admin_organization_members.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_admin_token, make_client


def run():
    log = AssuranceLogger("Admin Organization Members")
    token = get_admin_token()
    client = make_client(token)

    # ── 1. List all members ───────────────────────────────────────────
    all_members = []

    def test_list_members():
        nonlocal all_members
        resp = client.get("/admin/users")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        all_members = resp.json()
        return True, f"Listed {len(all_members)} member(s)"
    log.run("List all organization members", test_list_members)

    # ── 2. Member stats ───────────────────────────────────────────────
    def test_member_stats():
        resp = client.get("/admin/members/stats")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return True, (
            f"totalActive={data.get('totalActive')}, "
            f"adminsCount={data.get('adminsCount')}, "
            f"recruitersCount={data.get('recruitersCount')}"
        )
    log.run("Fetch member stats (totalActive/adminsCount/recruitersCount)", test_member_stats)

    # ── 3. Register HR employee ───────────────────────────────────────
    test_hr_email = f"log_hr_{uuid.uuid4().hex[:8]}@eramatch-test.com"
    registered_hr_id = None

    def test_register_hr():
        nonlocal registered_hr_id
        resp = client.post("/admin/members/register", json={
            "first_name": "LogTest",
            "last_name": "HRUser",
            "email": test_hr_email,
            "role": "hr"
        })
        if resp.status_code not in (200, 201):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        registered_hr_id = str(data.get("id") or data.get("user_id") or "")
        return True, f"HR registered: email={test_hr_email}, id={registered_hr_id}"
    log.run("Register new HR employee", test_register_hr)

    # ── 4. Registered user appears in list ───────────────────────────
    def test_hr_in_list():
        resp = client.get("/admin/users")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        emails = [m.get("email", "").lower() for m in resp.json()]
        if test_hr_email.lower() not in emails:
            return False, f"{test_hr_email} NOT found in member list"
        return True, f"{test_hr_email} correctly appears in member list"
    log.run("Registered HR appears in member list", test_hr_in_list)

    # ── 5. Get privileges for the registered user ─────────────────────
    def test_get_privileges():
        if not registered_hr_id:
            return False, "No registered HR ID available"
        resp = client.get(f"/admin/members/{registered_hr_id}/privileges")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        perms = data.get("permissions", {})
        return True, f"Privileges fetched: {perms}"
    log.run("Fetch privileges for newly registered HR", test_get_privileges)

    # ── 6. Update privileges ──────────────────────────────────────────
    def test_update_privileges():
        if not registered_hr_id:
            return False, "No registered HR ID available"
        resp = client.patch(f"/admin/members/{registered_hr_id}/privileges", json={
            "permissions": {
                "managePositions": True,
                "manageUsers": False,
                "manageCandidates": True,
                "viewAnalytics": True,
                "exportData": False
            }
        })
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "Privileges updated successfully"
    log.run("Update member privileges (managePositions=True)", test_update_privileges)

    # ── 7. Suspend member ─────────────────────────────────────────────
    def test_suspend_member():
        if not registered_hr_id:
            return False, "No registered HR ID available"
        resp = client.patch(f"/admin/members/{registered_hr_id}/status?status=suspended")
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Member {registered_hr_id} suspended"
    log.run("Suspend the newly registered HR member", test_suspend_member)

    # ── 8. Verify member is suspended in list ─────────────────────────
    def test_verify_suspended():
        if not registered_hr_id:
            return False, "No registered HR ID available"
        resp = client.get("/admin/users")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        member = next((m for m in resp.json()
                       if str(m.get("id") or m.get("user_id")) == registered_hr_id), None)
        if not member:
            return False, f"Member {registered_hr_id} not found in list"
        status = member.get("status", "").lower()
        if status != "suspended":
            return False, f"Expected suspended, got '{status}'"
        return True, f"Member status correctly shows 'suspended'"
    log.run("Verify suspended status is reflected in member list", test_verify_suspended)

    # ── 9. Reactivate member ──────────────────────────────────────────
    def test_activate_member():
        if not registered_hr_id:
            return False, "No registered HR ID available"
        resp = client.patch(f"/admin/members/{registered_hr_id}/status?status=active")
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Member {registered_hr_id} reactivated"
    log.run("Reactivate the suspended HR member", test_activate_member)

    # ── 10. Remove member ─────────────────────────────────────────────
    def test_remove_member():
        if not registered_hr_id:
            return False, "No registered HR ID available"
        resp = client.delete(f"/admin/members/{registered_hr_id}")
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Member {registered_hr_id} removed"
    log.run("Remove the test HR member", test_remove_member)

    # ── 11. Verify member is gone from list ───────────────────────────
    def test_verify_removed():
        resp = client.get("/admin/users")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        emails = [m.get("email", "").lower() for m in resp.json()]
        if test_hr_email.lower() in emails:
            return False, f"{test_hr_email} still appears in list after deletion!"
        return True, f"{test_hr_email} correctly removed from member list"
    log.run("Verify removed member is absent from list", test_verify_removed)

    # ── 12. Duplicate email rejected ─────────────────────────────────
    def test_duplicate_email():
        # Admin email already exists
        resp = client.post("/admin/members/register", json={
            "first_name": "Dup",
            "last_name": "Admin",
            "email": "admin_1@eramatch.com",
            "role": "admin"
        })
        if resp.status_code not in (400, 409):
            return False, f"Expected 400/409 for duplicate, got {resp.status_code}"
        return True, f"Duplicate email correctly rejected with HTTP {resp.status_code}"
    log.run("Duplicate email registration rejected (400/409)", test_duplicate_email)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
