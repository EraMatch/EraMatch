"""
Assurance log script for Admin Settings functionality.
Tests: read settings → update profile (with reflection) → org update → all preference toggles → subscription.

Run: python tests/logs/log_admin_settings.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_admin_token, make_client


def run():
    log = AssuranceLogger("Admin Settings")
    token = get_admin_token()
    client = make_client(token)

    # ── 1. Read full settings ─────────────────────────────────────────
    initial_settings = {}

    def test_get_settings():
        nonlocal initial_settings
        resp = client.get("/admin/settings")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        initial_settings = resp.json()
        return True, (
            f"email={initial_settings.get('email')}, "
            f"first_name={initial_settings.get('first_name')}, "
            f"role={initial_settings.get('role')}"
        )
    log.run("GET /admin/settings returns full settings", test_get_settings)

    # ── 2. Profile contains admin email ───────────────────────────────
    def test_email_correct():
        email = initial_settings.get("email", "")
        if email != "admin_1@eramatch.com":
            return False, f"Expected admin_1@eramatch.com, got '{email}'"
        return True, f"Profile email matches admin credentials"
    log.run("Settings email matches admin credentials", test_email_correct)

    # ── 3. Update profile and verify reflection ───────────────────────
    sentinel_name = f"LogTest_{uuid.uuid4().hex[:4]}"
    original_first_name = initial_settings.get("first_name", "Admin")

    def test_update_profile():
        resp = client.put("/admin/settings/profile", json={
            "first_name": sentinel_name
        })
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        # Verify read-back
        get_resp = client.get("/admin/settings")
        if get_resp.status_code != 200:
            return False, f"Read-back failed: HTTP {get_resp.status_code}"
        actual = get_resp.json().get("first_name", "")
        if actual != sentinel_name:
            return False, f"Reflection failed: expected '{sentinel_name}', got '{actual}'"
        return True, f"first_name updated to '{sentinel_name}' and reflected in GET"
    log.run("Update profile first_name and verify GET reflects change", test_update_profile)

    # ── 4. Restore original name ──────────────────────────────────────
    def test_restore_name():
        resp = client.put("/admin/settings/profile", json={"first_name": original_first_name})
        if resp.status_code not in (200, 204):
            return False, f"Restore failed: HTTP {resp.status_code}: {resp.text[:100]}"
        return True, f"first_name restored to '{original_first_name}'"
    log.run("Restore original first_name", test_restore_name)

    # ── 5. Update organization settings ──────────────────────────────
    def test_update_org():
        resp = client.put("/admin/settings/organization", json={
            "organization_name": "EraMatch Platform",
            "timezone": "UTC"
        })
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "Organization settings updated successfully"
    log.run("Update organization name and timezone", test_update_org)

    # ── 6. Toggle: email notifications ───────────────────────────────
    def test_toggle_email_notifications():
        resp = client.put("/admin/settings/preferences", json={"email_notifications": True})
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "email_notifications=True accepted"
    log.run("Toggle email_notifications preference", test_toggle_email_notifications)

    # ── 7. Toggle: 2FA ────────────────────────────────────────────────
    def test_toggle_2fa():
        resp = client.put("/admin/settings/preferences", json={"two_factor_auth": False})
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "two_factor_auth=False accepted"
    log.run("Toggle two_factor_auth preference", test_toggle_2fa)

    # ── 8. Toggle: bypass admin approval ─────────────────────────────
    def test_toggle_bypass():
        resp = client.put("/admin/settings/preferences", json={"bypass_admin_approval": False})
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "bypass_admin_approval=False accepted"
    log.run("Toggle bypass_admin_approval workflow preference", test_toggle_bypass)

    # ── 9. Get subscription plans ─────────────────────────────────────
    subscription_data = {}

    def test_get_subscription():
        nonlocal subscription_data
        resp = client.get("/admin/subscription")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        subscription_data = resp.json()
        plans = (subscription_data.get("plans")
                 or subscription_data.get("availablePlans")
                 or subscription_data.get("available_plans") or [])
        current = (subscription_data.get("currentPlan")
                   or subscription_data.get("current_plan")
                   or subscription_data.get("plan"))
        return True, f"Subscription loaded — {len(plans)} plan(s) available, current={current}"
    log.run("GET subscription plans and current plan", test_get_subscription)

    # ── 10. Get payment method ────────────────────────────────────────
    def test_get_payment_method():
        resp = client.get("/admin/subscription/payment")
        if resp.status_code not in (200, 404):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if data is None or resp.status_code == 404:
            return True, "No payment method configured (null/404) — graceful handling OK"
        brand = data.get("brand", "?")
        last4 = data.get("last4", "????")
        return True, f"Payment method: {brand} ending in {last4}"
    log.run("GET payment method (null-safe)", test_get_payment_method)

    # ── 11. Add payment method ────────────────────────────────────────
    def test_add_payment_method():
        resp = client.post("/admin/subscription/payment", json={
            "brand": "Visa",
            "last4": "0000",
            "expiry": "12/2029",
            "cardNumber": "4111111111111111",
            "cvc": "999",
            "cardName": "Assurance Test Card"
        })
        if resp.status_code not in (200, 201):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return True, f"Payment method added: {data.get('brand')} ending in {data.get('last4')}"
    log.run("Add new payment method via POST", test_add_payment_method)

    # ── 12. Invalid email rejected ────────────────────────────────────
    def test_invalid_email_rejected():
        resp = client.put("/admin/settings/profile", json={"email": "not_valid_email"})
        if resp.status_code in (400, 422):
            return True, f"Invalid email correctly rejected with HTTP {resp.status_code}"
        return False, f"Expected 400/422 for invalid email, got {resp.status_code}"
    log.run("Invalid email in profile update is rejected (422)", test_invalid_email_rejected)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
