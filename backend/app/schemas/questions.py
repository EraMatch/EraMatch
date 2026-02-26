from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class QuestionBankCreateRequest(BaseModel):
    id: str | None = None
    text: str
    category: str | None = None
    difficulty: str | None = "Medium"
    type: str  # Multiple Choice, Code, Essay
    tags: list[str] | None = []
    usageCount: int | None = 0
    avgScore: int | float | None = 0
    createdAt: str | None = None
    createdBy: str | None = None
    isFavorite: bool | None = False

    # Extra configs
    options: list[str] | None = None
    correctAnswer: int | list[int] | None = None
    multipleCorrect: bool | None = False
    explanation: str | None = None
    
    # Code
    codeLanguage: str | None = None
    codeTemplate: str | None = None
    testCases: list[dict] | None = None
    timeLimit: int | None = None
    memoryLimit: int | None = None
    # Essay
    maxWords: int | None = None
    expectedKeywords: list[str] | None = None
    rubric: str | None = None

class QuestionBankResponseItem(BaseModel):
    id: UUID
    text: str
    category: str
    difficulty: str
    type: str # Multiple Choice, Essay, Code
    tags: list[str]
    usageCount: int
    avgScore: int
    createdAt: str
    createdBy: str
    isFavorite: bool

    # Form specific settings
    options: list[str] | None = None
    correctAnswer: int | list[int] | None = None
    multipleCorrect: bool | None = False
    explanation: str | None = None
    # Code specific
    codeLanguage: str | None = None
    codeTemplate: str | None = None
    testCases: list[dict] | None = None
    timeLimit: int | None = None
    memoryLimit: int | None = None
    # Essay specific
    maxWords: int | None = None
    expectedKeywords: list[str] | None = None
    rubric: str | None = None

    model_config = ConfigDict(from_attributes=True)
