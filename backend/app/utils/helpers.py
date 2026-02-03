from datetime import datetime
from uuid import UUID, uuid4
import re


def generate_uuid() -> UUID:
    """Generate a new UUID."""
    return uuid4()


def format_datetime(dt: datetime, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Format datetime to string."""
    return dt.strftime(fmt)

