from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
from uuid import UUID

# =============================================================================
# QUESTION SCHEMAS
# =============================================================================

class QuestionCreate(BaseModel):
    id: str = Field(description="Frontend generated ID for reference during creation")
    type: str = Field(description="mcq, essay, or coding")
    questionText: str
    points: int = Field(default=10)
    
    # Optional fields depending on question type
    options: Optional[List[str]] = None
    correctAnswer: Optional[Union[int, List[int]]] = None
    multipleCorrect: Optional[bool] = None
    explanation: Optional[str] = None
    
    # Essay specific
    rubric: Optional[str] = None
    maxWords: Optional[int] = None
    expectedKeywords: Optional[List[str]] = None
    
    # Coding specific
    language: Optional[str] = None
    timeLimit: Optional[int] = None
    memoryLimit: Optional[int] = None
    codeTemplate: Optional[str] = None
    testCases: Optional[List[Dict[str, Any]]] = None
    
    # Common
    category: Optional[str] = None
    difficulty: Optional[str] = "Medium"
    tags: Optional[List[str]] = None

    # Reviewer/ground-truth metadata
    evidence: Optional[str] = None
    referenceAnswer: Optional[str] = None
    rubricYesNoChecks: Optional[List[Dict[str, Any]]] = None
    needsReview: Optional[bool] = None
    criticScore: Optional[float] = None
    criticWeightedScore: Optional[float] = None
    criticFeedback: Optional[str] = None
    criticChecks: Optional[List[Dict[str, Any]]] = None
    retryCount: Optional[int] = None

# =============================================================================
# SECTION SCHEMAS
# =============================================================================

class SectionCreate(BaseModel):
    id: str = Field(description="Frontend generated ID")
    order: int
    type: str = Field(description="mcq, essay, or coding")
    points: int
    selectionStrategy: str = Field(default="random")
    variantsToSelect: Optional[int] = Field(default=1)
    variants: List[QuestionCreate]

# =============================================================================
# ASSESSMENT SCHEMAS
# =============================================================================

class AssessmentCreateRequest(BaseModel):
    position_id: UUID
    group_id: UUID
    title: str
    description: Optional[str] = None
    duration_minutes: int
    passing_score: float
    difficulty_level: Optional[str] = None
    randomize_questions: bool = Field(default=False, alias="randomizeQuestions")
    proctoring: bool = Field(default=True)
    show_results: bool = Field(default=False, alias="showResults")
    allow_review: bool = Field(default=False, alias="allowReview")
    sections: List[SectionCreate]

class AssessmentResponse(BaseModel):
    assessment_id: UUID
    title: str
    status: str
    message: str = "Assessment created successfully"
