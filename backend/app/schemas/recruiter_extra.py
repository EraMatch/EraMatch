from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import List, Any

class FilterTemplateBase(BaseModel):
    name: str
    filters: dict

class FilterTemplateCreate(FilterTemplateBase):
    pass

class FilterTemplateResponse(FilterTemplateBase):
    id: UUID
    user_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class AIGenerateQuestionRequest(BaseModel):
    question_type: str  # mcq, essay, code, interview
    topic: str
    difficulty: str
    context: str = ""
    use_case: str = ""
    metadata: dict[str, Any] | None = None

class AIRefineQuestionRequest(BaseModel):
    question_text: str
    use_case: str = ""
    metadata: dict[str, Any] | None = None

class AIEnhanceTextRequest(BaseModel):
    text: str
    use_case: str = ""
    metadata: dict[str, Any] | None = None

class SuggestQuestionRubricRequest(BaseModel):
    question_text: str
    reference_answer: str | None = None
    context: dict[str, Any] | None = None  # {position_title, job_description, group_name, experience_level}

class JDEnrichmentRequest(BaseModel):
    job_title: str | None = None
    gaps_and_roles: str
    required_skills: list[str] = []

class JDEnrichmentResponse(BaseModel):
    suggested_job_title: str
    suggested_job_description: str
    suggested_skills: list[str]
    suggested_experience_level: str
    suggested_years_of_experience: int
    suggested_education_level: str
    suggested_traits: list[str]

