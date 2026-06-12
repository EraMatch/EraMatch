import re
import logging
from datetime import datetime
from dateutil import parser as date_parser
from typing import Optional, Tuple, List, Dict, Any

logger = logging.getLogger(__name__)

CURRENT_KEYWORDS = {"present", "now", "current", "ongoing", "active", "today", "presently"}

MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
}

def parse_single_date(date_str: Optional[str]) -> Tuple[Optional[datetime], bool]:
    """
    Parse a single date string.
    Returns a tuple of (parsed_datetime, is_current_boolean).
    """
    if not date_str or not isinstance(date_str, str):
        return None, False

    clean_str = date_str.strip().lower()
    
    # Check if this indicates present/current
    if any(kw in clean_str for kw in CURRENT_KEYWORDS):
        return datetime.utcnow(), True

    # Try parsing using dateutil
    try:
        dt = date_parser.parse(date_str, fuzzy=True, default=datetime(2000, 1, 1))
        return dt, False
    except Exception:
        pass

    # Custom parsing rules for robustness
    # 1. Format: MM/YYYY or MM-YYYY
    match_my = re.search(r'\b(0?[1-9]|1[0-2])[/-]((?:19|20)\d\d)\b', clean_str)
    if match_my:
        month = int(match_my.group(1))
        year = int(match_my.group(2))
        return datetime(year, month, 1), False

    # 2. Format: YYYY/MM or YYYY-MM
    match_ym = re.search(r'\b((?:19|20)\d\d)[/-](0?[1-9]|1[0-2])\b', clean_str)
    if match_ym:
        year = int(match_ym.group(1))
        month = int(match_ym.group(2))
        return datetime(year, month, 1), False

    # 3. Textual month + 4-digit year, e.g., "June 2020" or "Jun 20" (extracting year)
    match_year = re.search(r'\b((?:19|20)?\d\d)\b', clean_str)
    if match_year:
        year_str = match_year.group(1)
        if len(year_str) == 2:
            year = 2000 + int(year_str) if int(year_str) < 50 else 1900 + int(year_str)
        else:
            year = int(year_str)

        # Look for month keywords in clean_str
        found_month = 1
        for month_name, month_num in MONTH_MAP.items():
            if month_name in clean_str:
                found_month = month_num
                break
        return datetime(year, found_month, 1), False

    return None, False

def parse_date_range(range_str: Optional[str]) -> Tuple[Optional[datetime], Optional[datetime], bool]:
    """
    Split and parse a date range string (e.g. '2022 - present', '2019 to 2021').
    Returns (start_date, end_date, is_current)
    """
    if not range_str or not isinstance(range_str, str):
        return None, None, False

    # Clean range separators
    # Split on common separators: -, to, until, en-dash, em-dash
    parts = re.split(r'\s*(?:-|–|—|to|until)\s*', range_str, maxsplit=1)

    if len(parts) == 1:
        # Check if the single string itself contains range indicators that weren't split properly,
        # or if it's just a single date/year.
        start_dt, start_is_curr = parse_single_date(parts[0])
        if start_is_curr:
            return datetime.utcnow(), datetime.utcnow(), True
        return start_dt, None, False

    start_str, end_str = parts[0], parts[1]
    
    start_dt, start_is_curr = parse_single_date(start_str)
    end_dt, end_is_curr = parse_single_date(end_str)

    # Handle edge cases
    if start_is_curr:
        return datetime.utcnow(), datetime.utcnow(), True

    if end_is_curr or (start_dt and not end_dt and (not end_str or not end_str.strip())):
        return start_dt, datetime.utcnow(), True

    return start_dt, end_dt, False

def calculate_duration_months(start: Optional[datetime], end: Optional[datetime], is_current: bool = False) -> int:
    """
    Calculate the duration in months between start and end dates.
    """
    if not start:
        return 0
    if not end:
        end = datetime.utcnow() if is_current else start

    # Ensure end is not before start
    if end < start:
        return 0

    months = (end.year - start.year) * 12 + (end.month - start.month)
    return max(1, months)

def format_duration(months: int) -> str:
    """
    Format months into a human-readable string (e.g., '2 years, 3 months').
    """
    if months <= 0:
        return "N/A"
    years = months // 12
    rem_months = months % 12

    parts = []
    if years > 0:
        parts.append(f"{years} year{'s' if years > 1 else ''}")
    if rem_months > 0 or not parts:
        parts.append(f"{rem_months} month{'s' if rem_months > 1 else ''}")

    return ", ".join(parts)

def normalize_work_experience(entry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes a single work experience entry's dates and computes duration.
    Modifies the entry in-place and returns it.
    """
    if not isinstance(entry, dict):
        return entry

    start_str = entry.get("start_date")
    end_str = entry.get("end_date")
    is_current_val = entry.get("is_current", False)
    duration_str = entry.get("duration") or entry.get("dates")

    # Determine start and end datetimes
    start_dt = None
    end_dt = None
    is_current = False

    # 1. Try parsing from duration range string if present and start/end are not clearly set
    if duration_str and (not start_str or not end_str):
        start_dt, end_dt, is_current = parse_date_range(duration_str)
    
    # 2. Try parsing start_date and end_date if they weren't resolved yet
    if not start_dt and start_str:
        # Check if start_date is actually a range
        if any(sep in str(start_str) for sep in ["-", "to", "until", "–", "—"]):
            start_dt, end_dt, is_current = parse_date_range(str(start_str))
        else:
            start_dt, start_is_curr = parse_single_date(str(start_str))
            if start_is_curr:
                is_current = True
                start_dt = datetime.utcnow()

    if not end_dt and end_str:
        end_dt, end_is_curr = parse_single_date(str(end_str))
        if end_is_curr:
            is_current = True

    # Sync is_current with what was passed in
    if is_current_val:
        is_current = True

    if is_current and not end_dt:
        end_dt = datetime.utcnow()

    # Calculate months and years
    months = calculate_duration_months(start_dt, end_dt, is_current)
    years = round(months / 12, 1)

    # Format the dates back into canonical strings
    if start_dt:
        entry["start_date"] = start_dt.strftime("%Y-%m")
    if end_dt:
        if is_current:
            entry["end_date"] = "Present"
        else:
            entry["end_date"] = end_dt.strftime("%Y-%m")
    elif is_current:
        entry["end_date"] = "Present"

    entry["is_current"] = is_current
    entry["duration_months"] = months
    entry["duration_years"] = years

    # Set duration string for display
    if start_dt:
        start_fmt = start_dt.strftime("%b %Y")
        end_fmt = "Present" if is_current else (end_dt.strftime("%b %Y") if end_dt else "N/A")
        entry["duration"] = f"{start_fmt} - {end_fmt}"
    else:
        entry["duration"] = duration_str or "N/A"

    return entry

def normalize_education(entry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes a single education entry's dates and sets duration.
    Modifies the entry in-place and returns it.
    """
    if not isinstance(entry, dict):
        return entry

    start_str = entry.get("start_date")
    end_str = entry.get("end_date")
    year_str = entry.get("year") or entry.get("dates")

    start_dt = None
    end_dt = None
    is_current = False

    # Try parsing range from year string if dates not set
    if year_str and (not start_str or not end_str):
        start_dt, end_dt, is_current = parse_date_range(year_str)

    if not start_dt and start_str:
        start_dt, _ = parse_single_date(str(start_str))

    if not end_dt and end_str:
        end_dt, is_curr = parse_single_date(str(end_str))
        if is_curr:
            is_current = True
            end_dt = datetime.utcnow()

    # Get years
    start_year = start_dt.year if start_dt else None
    end_year = end_dt.year if end_dt else None

    # Calculate duration
    duration = 0.0
    if start_year and end_year:
        duration = float(max(0, end_year - start_year))
    elif start_dt and end_dt:
        duration = round(calculate_duration_months(start_dt, end_dt) / 12, 1)

    # Format back to display
    if start_year and end_year:
        year_display = f"{start_year} - Present" if is_current else f"{start_year} - {end_year}"
    elif end_year:
        year_display = str(end_year)
    elif start_year:
        year_display = f"{start_year} - Present"
    else:
        year_display = year_str or "N/A"

    entry["start_date"] = start_dt.strftime("%Y-%m") if start_dt else start_str
    entry["end_date"] = "Present" if is_current else (end_dt.strftime("%Y-%m") if end_dt else end_str)
    entry["year"] = year_display
    entry["dates"] = year_display
    entry["duration_years"] = duration

    return entry
