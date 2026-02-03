"""
Project and position schemas.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    """Create a new project."""
    name: str
    description: str | None = None
    target_hire_count: int = 1


class ProjectUpdate(BaseModel):
    """Update project."""
    name: str | None = None
    description: str | None = None
    status: str | None = None
    target_hire_count: int | None = None


class ProjectResponse(BaseModel):
    """Project response."""
    id: UUID
    name: str
    description: str | None
    status: str
    target_hire_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class PositionCreate(BaseModel):
    """Create a new position."""
    project_id: UUID
    job_title: str
    job_description: str
    required_skills: list[str] = []
    experience_level: str | None = None
    work_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None


class PositionUpdate(BaseModel):
    """Update position."""
    job_title: str | None = None
    job_description: str | None = None
    required_skills: list[str] | None = None
    experience_level: str | None = None
    work_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    status: str | None = None


class PositionResponse(BaseModel):
    """Position response."""
    id: UUID
    project_id: UUID
    job_title: str
    job_description: str
    required_skills: list[str]
    experience_level: str | None
    work_type: str | None
    salary_min: float | None
    salary_max: float | None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True
