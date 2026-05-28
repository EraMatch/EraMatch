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
