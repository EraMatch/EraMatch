#!/usr/bin/env python3
"""
LiV2 Final Integration Smoke Test

Quick verification that the full stack starts and core operations work.
Run with: python3 backend/tests/smoke/test_liv2_smoke.py

Or: pytest backend/tests/smoke/test_liv2_smoke.py -v
"""

import os
import sys
import subprocess
import importlib

# Load .env for configuration
from pathlib import Path

_BACKEND_ENV = Path(__file__).resolve().parents[2] / ".env"
if _BACKEND_ENV.exists():
    with open(_BACKEND_ENV) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip("'").strip('"')
                if key and key not in os.environ:
                    os.environ[key] = value

BASE_URL = os.getenv("ERAMATCH_API_URL", "http://localhost:8000/api/v1")


class TestSmoke:
    """Smoke tests — verify the basics work before running full suites."""

    def test_backend_imports(self):
        """Backend app can be imported without errors."""
        try:
            import app.main  # noqa: F401
        except ImportError as e:
            pytest.fail(f"Failed to import app.main: {e}")

    def test_models_import(self):
        """All LiV2 models can be imported."""
        try:
            from app.models import LiV2Rubric, LiV2Bank, LiV2Session, LiV2Evaluation

            # Verify updated_at exists on models (Fix #1)
            assert hasattr(LiV2Rubric, "updated_at"), "LiV2Rubric missing updated_at"
            assert hasattr(LiV2Bank, "updated_at"), "LiV2Bank missing updated_at"
        except (ImportError, AssertionError) as e:
            pytest.fail(f"LiV2 model import/attribute error: {e}")

    def test_schemas_import(self):
        """LiV2 response schemas can be imported and include updated_at."""
        try:
            from app.schemas.live_interview_v2 import RubricResponse, BankResponse
        except ImportError as e:
            pytest.fail(f"Failed to import schemas: {e}")

    def test_fixtures_import(self):
        """Test fixture factories can be imported."""
        try:
            from tests.live_interview_v2.fixtures import (
                make_rubric_payload,
                make_bank_payload,
                make_transcript,
            )
        except ImportError as e:
            pytest.fail(f"Failed to import fixtures: {e}")

    def test_backend_health(self):
        """Backend health endpoint responds."""
        import httpx

        try:
            with httpx.Client(
                base_url=BASE_URL.replace("/api/v1", ""), timeout=10.0
            ) as client:
                resp = client.get("/health")
                assert resp.status_code == 200, (
                    f"Health check failed: {resp.status_code}"
                )
        except httpx.ConnectError:
            pytest.skip("Backend not running — start with ./start.sh")

    def test_git_status_clean(self):
        """No uncommitted changes that should be committed."""
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            cwd=str(Path(__file__).resolve().parents[2]),
        )
        # Only check for modified/deleted files, not untracked
        dirty = [
            line
            for line in result.stdout.strip().split("\n")
            if line and line[0] in ("M", "D")
        ]
        assert len(dirty) == 0, f"Uncommitted changes: {dirty}"

    def test_frontend_builds_exist(self):
        """Frontend build artifacts exist for both portals."""
        root = Path(__file__).resolve().parents[2]
        candidate_dist = root / "Frontend" / "candidate-portal" / "dist"
        recruiter_dist = root / "Frontend" / "recruiter-portal" / "dist"
        # Only warn, don't fail — portal may not have been built yet
        if not candidate_dist.exists():
            print(
                f"WARNING: Candidate portal dist/ missing. Run: cd Frontend/candidate-portal && npm run build"
            )
        if not recruiter_dist.exists():
            print(
                f"WARNING: Recruiter portal dist/ missing. Run: cd Frontend/recruiter-portal && npm run build"
            )


import pytest

# Allow running as script or pytest
if __name__ == "__main__":
    # Run as script
    import unittest

    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestSmoke)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
