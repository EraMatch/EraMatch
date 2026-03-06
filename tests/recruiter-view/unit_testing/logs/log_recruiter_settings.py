"""
Assurance log script for Recruiter Settings functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_settings.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from log_utils import AssuranceLogger, get_recruiter_token, make_client


def run():
    log = AssuranceLogger("Recruiter Settings")
    token = get_recruiter_token()
    client = make_client(token)

    def test_get_settings():
        resp = client.get("/recruiter/settings")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, dict):
            return False, f"Expected dict, got {type(data)}"
        return True, f"Settings keys: {list(data.keys())}"
    log.run("GET /recruiter/settings returns 200", test_get_settings)

    def test_update_profile():
        resp = client.patch("/recruiter/settings/profile", json={
            "first_name": "Helen",
            "last_name": "Recruiter"
        })
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "Profile updated successfully"
    log.run("PATCH /recruiter/settings/profile returns 200", test_update_profile)

    def test_update_preferences():
        resp = client.patch("/recruiter/settings/preferences", json={
            "language": "en",
            "theme": "dark"
        })
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "Preferences updated successfully"
    log.run("PATCH /recruiter/settings/preferences returns 200", test_update_preferences)

    def test_update_ai_pipeline():
        resp = client.patch("/recruiter/settings/ai-pipeline", json={
            "enabled": True
        })
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, "AI pipeline settings updated successfully"
    log.run("PATCH /recruiter/settings/ai-pipeline returns 200", test_update_ai_pipeline)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
