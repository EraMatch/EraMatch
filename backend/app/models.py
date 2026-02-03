"""
orm layer, modelling for the datbase 
"""
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel, Relationship, Column
from sqlalchemy import Text, JSON
from sqlalchemy.dialects.postgresql import JSONB



class UserRole(str, Enum):
    """User roles in the system."""
    ADMIN = "admin"
    HR = "hr"
    TECHNICAL = "technical"

