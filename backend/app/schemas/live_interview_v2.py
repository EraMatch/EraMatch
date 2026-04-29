from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from enum import Enum


class LiV2State(str, Enum):
    DRAFT = "draft"
    FROZEN = "frozen"


# --- Rubric Schemas ---


class RubricDimension(BaseModel):
    name: str = Field(
        ..., description="Name of the competency dimension (e.g. Technical Depth)"
    )
    weight: int = Field(..., ge=1, le=100, description="Weight percentage (1-100)")
    description: Optional[str] = Field(
        None, description="Description of what this dimension measures"
    )
    anchors: Optional[Dict[str, str]] = Field(
        None,
        description="Behavioral anchors for different levels (substandard, proficient, excellent)",
    )


class RubricCreate(BaseModel):
    group_id: UUID
    organization_id: UUID
    dimensions: List[RubricDimension]
    time_budget_minutes: Optional[int] = Field(default=30, ge=5, le=60)
    language: Optional[str] = Field(default="en")
    include_weak_topics: Optional[bool] = Field(default=False)


class RubricUpdate(BaseModel):
    dimensions: Optional[List[RubricDimension]] = None


class RubricResponse(BaseModel):
    rubric_id: UUID
    group_id: UUID
    organization_id: UUID
    dimensions: List[RubricDimension]
    state: LiV2State
    time_budget_minutes: int = 30
    language: str = "en"
    include_weak_topics: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Question Bank Schemas ---


class SubCriterion(BaseModel):
    name: str
    description: str


class BankItem(BaseModel):
    question_id: str = Field(..., description="Unique ID for the question in the bank")
    dimension_name: str = Field(
        ..., description="The rubric dimension this question maps to"
    )
    text: str = Field(..., description="The actual question text")
    intent: str = Field(..., description="The rationale/logic for asking this question")
    sub_criteria: List[SubCriterion] = Field(
        ..., description="Per-question scoring rubrics"
    )


class BankCreate(BaseModel):
    group_id: UUID
    organization_id: UUID
    items: List[BankItem]


class BankUpdate(BaseModel):
    items: Optional[List[BankItem]] = None


class BankResponse(BaseModel):
    bank_id: UUID
    group_id: UUID
    organization_id: UUID
    items: List[BankItem]
    state: LiV2State
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- AI Suggestion Schemas ---


class DimensionSuggestionRequest(BaseModel):
    group_id: UUID


class DimensionSuggestionResponse(BaseModel):
    suggestions: List[Dict[str, Any]] = Field(
        ..., description="Dimensions suggested by M0 AI (name, reason, example_anchor)"
    )


class AnchorGenerationRequest(BaseModel):
    dimensions: List[str]
    job_description: Optional[str] = None


class BankGenerationRequest(BaseModel):
    rubric_id: UUID


# --- Per-Question Scoring Schemas (Judge Pipeline) ---


class PerQuestionSubCriterion(BaseModel):
    """Result for one sub-criterion within a question."""

    name: str = Field(..., description="Name of the sub-criterion")
    score: int = Field(
        ..., ge=1, le=3, description="Score: 1=substandard, 2=proficient, 3=excellent"
    )
    covered: bool = Field(
        ..., description="Whether the candidate addressed this sub-criterion"
    )
    cited_quote: str = Field(
        ..., description="Direct quote from candidate supporting the score"
    )


class PerQuestionResult(BaseModel):
    """Judge result for a single question (pillar)."""

    question_text: str = Field(..., description="The question that was asked")
    question_score: float = Field(
        ..., description="Average sub-criteria score (1.0-3.0)"
    )
    dimension_id: str = Field(
        ..., description="Which rubric dimension this question maps to"
    )
    dimension_name: str = Field(..., description="Human-readable dimension name")
    sub_criteria: List[PerQuestionSubCriterion] = Field(
        ..., description="Per-sub-criterion scores"
    )
    reasoning: str = Field(
        ..., description="Why this overall question score was assigned"
    )
    anchor_matched: str = Field(
        ..., description="Overall anchor level: substandard/proficient/excellent"
    )
    cited_quote: str = Field(
        ..., description="Best quote supporting the overall question score"
    )
    weight: float = Field(
        ..., description="Weight of the parent dimension (from rubric)"
    )


# --- Freeze Schemas ---


class FreezeResponse(BaseModel):
    success: bool
    message: str
    errors: Optional[List[str]] = None
