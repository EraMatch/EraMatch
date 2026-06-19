"""
Unit tests for app.core.security — password hashing and JWT helpers.

These are pure unit tests: no database, no running server, no network. They
exercise the bcrypt hashing and the python-jose token encode/decode round-trip.
"""
from datetime import timedelta
from uuid import uuid4

import pytest

from app.core import security


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        hashed = security.hash_password("admin12345")
        assert isinstance(hashed, str)
        assert hashed != "admin12345"
        # bcrypt hashes start with the $2b$ (or $2a$/$2y$) identifier
        assert hashed.startswith("$2")

    def test_hash_is_salted_and_unique(self):
        """Two hashes of the same password differ because of the random salt."""
        assert security.hash_password("same") != security.hash_password("same")

    def test_verify_correct_password(self):
        hashed = security.hash_password("correct horse battery staple")
        assert security.verify_password("correct horse battery staple", hashed) is True

    def test_verify_wrong_password(self):
        hashed = security.hash_password("right-password")
        assert security.verify_password("wrong-password", hashed) is False

    def test_verify_against_malformed_hash_returns_false(self):
        """A non-bcrypt string must not raise — it returns False."""
        assert security.verify_password("anything", "not-a-real-hash") is False


# ---------------------------------------------------------------------------
# JWT access / refresh tokens
# ---------------------------------------------------------------------------
class TestJwtTokens:
    def test_access_token_round_trip(self):
        subject = str(uuid4())
        token = security.create_access_token(subject)
        payload = security.decode_token(token)
        assert payload is not None
        assert payload["sub"] == subject
        assert payload["type"] == "access"

    def test_access_token_accepts_uuid_subject(self):
        subject = uuid4()
        token = security.create_access_token(subject)
        payload = security.decode_token(token)
        assert payload["sub"] == str(subject)

    def test_access_token_carries_extra_data(self):
        token = security.create_access_token(
            "user-1", extra_data={"role": "hr", "org": "acme"}
        )
        payload = security.decode_token(token)
        assert payload["role"] == "hr"
        assert payload["org"] == "acme"

    def test_refresh_token_has_refresh_type(self):
        token = security.create_refresh_token("user-1")
        payload = security.decode_token(token)
        assert payload["type"] == "refresh"

    def test_tampered_token_is_rejected(self):
        token = security.create_access_token("user-1")
        # Flip the final character to invalidate the signature.
        tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
        assert security.decode_token(tampered) is None

    def test_expired_token_is_rejected(self):
        token = security.create_access_token(
            "user-1", expires_delta=timedelta(seconds=-1)
        )
        assert security.decode_token(token) is None

    def test_garbage_token_is_rejected(self):
        assert security.decode_token("not.a.jwt") is None
