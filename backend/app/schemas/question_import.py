"""
Pydantic schemas for the Question Import feature.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ─── Job status schemas ───────────────────────────────────────────────────────

class ImportJobResponse(BaseModel):
    """Summary of an import job — used in the Background Tasks UI."""
    job_id: UUID
    status: str             # pending | processing | completed | failed
    import_type: str        # generative | csv | extraction
    source_filename: str | None
    total_generated: int
    total_flagged: int
    total_approved: int
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


# ─── Draft question schemas ───────────────────────────────────────────────────

class DraftQuestion(BaseModel):
    """
    A single AI-generated/extracted question in the staging review.
    Maps to QuestionBankCreateRequest after recruiter approval.
    """
    type: str                           # mcq | essay | code
    text: str
    difficulty: str = "Medium"          # Easy | Medium | Hard
    category: str = "General"
    tags: list[str] = []
    options: list[str] | None = None    # MCQ only
    correct_answer: int | None = None   # MCQ: 0-based index
    evidence: str | None = None
    reference_answer: str | None = None
    explanation: str | None = None
    rubric: str | None = None           # Essay/code
    max_words: int | None = None        # Essay
    rubric_yes_no_checks: list[dict] | None = None
    # Critic metadata (read-only in the UI)
    needs_review: bool = False
    critic_score: float = 1.0
    critic_weighted_score: float = 1.0
    critic_feedback: str | None = None
    critic_checks: list[dict] | None = None
    retry_count: int = 0
    original_question_id: UUID | None = None


class DraftQuestionsResponse(BaseModel):
    """Response for GET /questions/import/jobs/{id}/draft"""
    job_id: UUID
    import_type: str
    source_filename: str | None
    critic_stats: dict | None
    questions: list[DraftQuestion]


# ─── Approval schema ──────────────────────────────────────────────────────────

class ImportApproveRequest(BaseModel):
    """
    POST /questions/import/jobs/{id}/approve
    The recruiter selects which draft questions to commit to the live bank.
    """
    questions: list[DraftQuestion]


class ImportApproveResponse(BaseModel):
    imported_count: int
    skipped_count: int
    message: str
