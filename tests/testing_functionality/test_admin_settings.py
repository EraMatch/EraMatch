"""
Tests for Admin Settings functionality.
Covers: get settings, update profile, update organization, preferences (notifications,
        security, workflow), subscription management, payment method management.

Backend endpoints:
  GET  /admin/settings
  PUT  /admin/settings/profile
  PUT  /admin/settings/organization
  PUT  /admin/settings/preferences
  GET  /admin/subscription
  GET  /admin/subscription/payment
  POST /admin/subscription/payment
  POST /admin/subscription/upgrade
"""
import pytest
import uuid


class TestGetSettings:
    """Tests for reading admin settings."""

    def test_get_settings_returns_200(self, client):
        """GET /admin/settings returns 200."""
        resp = client.get("/admin/settings")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_get_settings_has_profile_info(self, client):
        """Settings response includes profile fields."""
        resp = client.get("/admin/settings")
        data = resp.json()
        profile_fields = ["first_name", "last_name", "email"]
        for field in profile_fields:
            assert field in data, f"Missing '{field}' in settings: {data}"

    def test_get_settings_email_matches_admin(self, client):
        """Settings email should match the logged-in admin's email."""
        resp = client.get("/admin/settings")
        data = resp.json()
        email = data.get("email", "")
        assert email == "admin_1@eramatch.com", (
            f"Settings email mismatch: expected admin_1@eramatch.com, got '{email}'"
        )

    def test_get_settings_has_preferences(self, client):
        """Settings response includes a preferences/notifications section."""
        resp = client.get("/admin/settings")
        data = resp.json()
        # Preferences may be nested or at top level
        has_preferences = ("preferences" in data
                           or "email_notifications" in data
                           or "notifications" in data)
        assert has_preferences, f"No preferences section found in settings: {data}"

    def test_settings_has_organization_info(self, client):
        """Settings response includes organization name or ID."""
        resp = client.get("/admin/settings")
        data = resp.json()
        has_org = any(k in data for k in [
            "organization_name", "organization", "org_name", "organization_id"
        ])
        assert has_org, f"No organization info in settings: {data}"


class TestUpdateProfile:
    """Tests for updating admin profile information."""

    def test_update_profile_returns_success(self, client):
        """PUT /admin/settings/profile returns 200 with valid data."""
        resp = client.put("/admin/settings/profile", json={
            "first_name": "Admin",
            "last_name": "User",
            "email": "admin_1@eramatch.com"
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on profile update, got {resp.status_code}: {resp.text}"
        )

    def test_update_profile_first_name_only(self, client):
        """Can update just the first_name field."""
        resp = client.put("/admin/settings/profile", json={
            "first_name": "AdminUpdated"
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on partial profile update, got {resp.status_code}: {resp.text}"
        )

    def test_update_profile_reflects_in_settings(self, client):
        """After updating first_name, GET /admin/settings returns the new value."""
        new_name = f"TestAdmin_{uuid.uuid4().hex[:4]}"
        put_resp = client.put("/admin/settings/profile", json={"first_name": new_name})
        if put_resp.status_code not in (200, 204):
            pytest.skip(f"Profile update not available: {put_resp.status_code}")
        get_resp = client.get("/admin/settings")
        data = get_resp.json()
        actual = data.get("first_name", "")
        assert actual == new_name, f"Profile update not reflected: expected '{new_name}', got '{actual}'"
        # Restore original name
        client.put("/admin/settings/profile", json={"first_name": "Admin"})

    def test_update_profile_invalid_email_returns_error(self, client):
        """Profile update with malformed email returns 422."""
        resp = client.put("/admin/settings/profile", json={
            "email": "not_an_email"
        })
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 for invalid email, got {resp.status_code}: {resp.text}"
        )


class TestUpdateOrganization:
    """Tests for updating organization settings."""

    def test_update_organization_returns_success(self, client):
        """PUT /admin/settings/organization with valid data returns success."""
        resp = client.put("/admin/settings/organization", json={
            "organization_name": "EraMatch Test Org",
            "timezone": "UTC"
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on org update, got {resp.status_code}: {resp.text}"
        )

    def test_update_organization_partial_fields(self, client):
        """Can update just the timezone."""
        resp = client.put("/admin/settings/organization", json={
            "timezone": "America/New_York"
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on partial org update, got {resp.status_code}: {resp.text}"
        )


class TestUpdatePreferences:
    """Tests for notification, security, and workflow preference toggles."""

    def test_toggle_email_notifications_on(self, client):
        """Preferences update with email_notifications=True returns success."""
        resp = client.put("/admin/settings/preferences", json={
            "email_notifications": True
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204, got {resp.status_code}: {resp.text}"
        )

    def test_toggle_email_notifications_off(self, client):
        """Preferences update with email_notifications=False returns success."""
        resp = client.put("/admin/settings/preferences", json={
            "email_notifications": False
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204, got {resp.status_code}: {resp.text}"
        )

    def test_toggle_two_factor_auth(self, client):
        """Preferences update with two_factor_auth toggle returns success."""
        resp = client.put("/admin/settings/preferences", json={
            "two_factor_auth": True
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on 2FA toggle, got {resp.status_code}: {resp.text}"
        )

    def test_toggle_session_timeout(self, client):
        """Preferences update with session_timeout toggle returns success."""
        resp = client.put("/admin/settings/preferences", json={
            "session_timeout": True
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on session timeout toggle, got {resp.status_code}: {resp.text}"
        )

    def test_toggle_bypass_admin_approval(self, client):
        """Preferences update with bypass_admin_approval returns success."""
        resp = client.put("/admin/settings/preferences", json={
            "bypass_admin_approval": False
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on bypass_admin_approval, got {resp.status_code}: {resp.text}"
        )

    def test_update_multiple_preferences_at_once(self, client):
        """Can update multiple preferences in a single call."""
        resp = client.put("/admin/settings/preferences", json={
            "email_notifications": True,
            "two_factor_auth": False,
            "bypass_admin_approval": False
        })
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on multi-preference update, got {resp.status_code}: {resp.text}"
        )


class TestSubscription:
    """Tests for subscription plans and payment methods."""

    def test_get_subscription_returns_200(self, client):
        """GET /admin/subscription returns 200."""
        resp = client.get("/admin/subscription")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_subscription_has_plans(self, client):
        """Subscription response includes available plans."""
        resp = client.get("/admin/subscription")
        data = resp.json()
        # Plans can be under different keys depending on backend shape
        has_plans = any(k in data for k in [
            "plans", "availablePlans", "available_plans", "subscriptionPlans"
        ])
        # Some backends may return current plan info directly
        has_current = any(k in data for k in [
            "currentPlan", "current_plan", "plan", "plan_id"
        ])
        assert has_plans or has_current, (
            f"No plan info found in subscription response: {data}"
        )

    def test_get_payment_method_returns_200_or_null(self, client):
        """GET /admin/subscription/payment returns 200 (may be null if no card)."""
        resp = client.get("/admin/subscription/payment")
        assert resp.status_code in (200, 404), (
            f"Expected 200 or 404 for payment method, got {resp.status_code}: {resp.text}"
        )

    def test_payment_method_structure_if_present(self, client):
        """If payment method exists, it has brand, last4, expiry."""
        resp = client.get("/admin/subscription/payment")
        if resp.status_code == 404:
            pytest.skip("No payment method configured")
        data = resp.json()
        if data is None:
            pytest.skip("Payment method is null")
        for field in ["brand", "last4", "expiry"]:
            assert field in data, f"Payment method missing '{field}': {data}"

    def test_add_payment_method_returns_success(self, client):
        """POST /admin/subscription/payment with valid card data returns success."""
        resp = client.post("/admin/subscription/payment", json={
            "brand": "Visa",
            "last4": "4242",
            "expiry": "12/2027",
            "cardNumber": "4242424242424242",
            "cvc": "123",
            "cardName": "Admin User"
        })
        assert resp.status_code in (200, 201), (
            f"Expected 200/201 on add payment method, got {resp.status_code}: {resp.text}"
        )

    def test_add_payment_method_returns_card_info(self, client):
        """Add payment method response includes brand, last4, expiry."""
        resp = client.post("/admin/subscription/payment", json={
            "brand": "Mastercard",
            "last4": "5555",
            "expiry": "06/2026",
            "cardNumber": "5555555555554444",
            "cvc": "456",
            "cardName": "Admin Test"
        })
        if resp.status_code not in (200, 201):
            pytest.skip(f"Payment method add not available: {resp.status_code}")
        data = resp.json()
        for field in ["brand", "last4", "expiry"]:
            assert field in data, f"Add payment response missing '{field}': {data}"

    def test_upgrade_subscription_returns_success(self, client):
        """POST /admin/subscription/upgrade with a plan ID returns success."""
        # First get a valid plan ID
        sub_resp = client.get("/admin/subscription")
        if sub_resp.status_code != 200:
            pytest.skip("Cannot fetch subscription plans")
        sub_data = sub_resp.json()
        plans = (sub_data.get("plans") or sub_data.get("availablePlans")
                 or sub_data.get("available_plans") or [])
        if not plans:
            pytest.skip("No subscription plans available to upgrade to")
        plan_id = str(plans[0].get("id") or plans[0].get("plan_id") or plans[0].get("planID"))
        resp = client.post("/admin/subscription/upgrade", json={"planID": plan_id})
        assert resp.status_code in (200, 204), (
            f"Expected 200/204 on upgrade, got {resp.status_code}: {resp.text}"
        )
