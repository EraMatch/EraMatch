"""
Unit tests for app.utils.helpers — small pure helper functions.
"""
from datetime import datetime
from uuid import UUID

from app.utils import helpers


class TestGenerateUuid:
    def test_returns_uuid_instance(self):
        assert isinstance(helpers.generate_uuid(), UUID)

    def test_values_are_unique(self):
        assert helpers.generate_uuid() != helpers.generate_uuid()


class TestFormatDatetime:
    def test_default_format(self):
        dt = datetime(2020, 1, 2, 3, 4, 5)
        assert helpers.format_datetime(dt) == "2020-01-02 03:04:05"

    def test_custom_format(self):
        dt = datetime(2020, 1, 2, 3, 4, 5)
        assert helpers.format_datetime(dt, "%Y") == "2020"
        assert helpers.format_datetime(dt, "%d/%m/%Y") == "02/01/2020"
