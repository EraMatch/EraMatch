"""
Unit tests for app.utils.date_parser — pure date parsing / normalization logic.

No database or network: every function here operates on plain strings/dicts.
"""
from datetime import datetime

import pytest

from app.utils import date_parser as dp


# ---------------------------------------------------------------------------
# parse_single_date
# ---------------------------------------------------------------------------
class TestParseSingleDate:
    def test_none_returns_none_not_current(self):
        assert dp.parse_single_date(None) == (None, False)

    def test_empty_string_returns_none(self):
        assert dp.parse_single_date("") == (None, False)

    @pytest.mark.parametrize("kw", ["present", "Present", "current", "ongoing", "now"])
    def test_current_keywords_flag_is_current(self, kw):
        dt, is_current = dp.parse_single_date(kw)
        assert is_current is True
        assert isinstance(dt, datetime)

    def test_month_slash_year(self):
        dt, is_current = dp.parse_single_date("06/2020")
        assert is_current is False
        assert dt.year == 2020
        assert dt.month == 6

    def test_iso_year_month(self):
        dt, _ = dp.parse_single_date("2019-03")
        assert dt.year == 2019
        assert dt.month == 3


# ---------------------------------------------------------------------------
# parse_date_range
# ---------------------------------------------------------------------------
class TestParseDateRange:
    def test_none_returns_triple_none(self):
        assert dp.parse_date_range(None) == (None, None, False)

    def test_year_to_year(self):
        start, end, is_current = dp.parse_date_range("2019 to 2021")
        assert start.year == 2019
        assert end.year == 2021
        assert is_current is False

    def test_range_with_present_is_current(self):
        start, end, is_current = dp.parse_date_range("2022 - present")
        assert start.year == 2022
        assert is_current is True
        assert isinstance(end, datetime)


# ---------------------------------------------------------------------------
# calculate_duration_months
# ---------------------------------------------------------------------------
class TestCalculateDurationMonths:
    def test_basic_span(self):
        start = datetime(2020, 1, 1)
        end = datetime(2021, 4, 1)
        assert dp.calculate_duration_months(start, end) == 15

    def test_end_before_start_is_zero(self):
        assert dp.calculate_duration_months(datetime(2021, 1, 1), datetime(2020, 1, 1)) == 0

    def test_no_start_is_zero(self):
        assert dp.calculate_duration_months(None, datetime(2020, 1, 1)) == 0


# ---------------------------------------------------------------------------
# format_duration
# ---------------------------------------------------------------------------
class TestFormatDuration:
    @pytest.mark.parametrize(
        "months,expected",
        [
            (0, "N/A"),
            (-3, "N/A"),
            (1, "1 month"),
            (3, "3 months"),
            (12, "1 year"),
            (15, "1 year, 3 months"),
            (24, "2 years"),
            (25, "2 years, 1 month"),
        ],
    )
    def test_format(self, months, expected):
        assert dp.format_duration(months) == expected


# ---------------------------------------------------------------------------
# normalize_work_experience / normalize_education
# ---------------------------------------------------------------------------
class TestNormalize:
    def test_work_experience_computes_months(self):
        entry = {"duration": "Jan 2020 - Jan 2022"}
        out = dp.normalize_work_experience(entry)
        assert out["duration_months"] == 24
        assert out["is_current"] is False

    def test_work_experience_present_marks_current(self):
        entry = {"duration": "2021 - present"}
        out = dp.normalize_work_experience(entry)
        assert out["is_current"] is True
        assert out["end_date"] == "Present"

    def test_work_experience_non_dict_passthrough(self):
        assert dp.normalize_work_experience("nope") == "nope"

    def test_education_duration_years(self):
        entry = {"year": "2018 - 2022"}
        out = dp.normalize_education(entry)
        assert out["duration_years"] == 4.0
        assert out["year"] == "2018 - 2022"
