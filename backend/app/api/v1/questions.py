from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DbSession, RecruiterUser
from app.schemas.questions import QuestionBankCreateRequest, QuestionBankResponseItem
from app.services.questions import QuestionService

router = APIRouter(tags=["Questions"])

# Temporary schemas for inline responses
class FavoriteResponse(BaseModel):
    isFavorite: bool

class MessageResponse(BaseModel):
    message: str


@router.get("/bank", response_model=List[QuestionBankResponseItem])
async def get_question_bank(
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Fetch all available base questions for the organization's question bank.
    Includes customized config and user's favorite status.
    """
    svc = QuestionService(session, current_user)
    return await svc.get_question_bank()


@router.post("/bank", response_model=QuestionBankResponseItem)
async def create_question_bank(
    request_data: QuestionBankCreateRequest,
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Creates a new custom base question and enters it into the Question Bank.
    """
    svc = QuestionService(session, current_user)
    return await svc.create_question(request_data)


@router.post("/bank/{question_id}/favorite", response_model=FavoriteResponse)
async def toggle_question_favorite(
    question_id: UUID,
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Toggles the favorite status for a question in the bank for the current user.
    """
    svc = QuestionService(session, current_user)
    try:
        new_state = await svc.toggle_favorite(question_id)
        return FavoriteResponse(isFavorite=new_state)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/bank/{question_id}", response_model=MessageResponse)
async def delete_question_bank(
    question_id: UUID,
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Soft-deletes a custom question from the bank.
    """
    svc = QuestionService(session, current_user)
    try:
        await svc.delete_question(question_id)
        return MessageResponse(message="Question soft-deleted successfully")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# QUESTION IMPORT ENDPOINTS
# =============================================================================
import base64
from fastapi import UploadFile, File, Form
from sqlmodel import select
from datetime import datetime, timezone
from uuid import uuid4

from app.models import QuestionImportJob, QuestionBank
from app.schemas.question_import import (
    ImportJobResponse,
    DraftQuestionsResponse,
    DraftQuestion,
    ImportApproveRequest,
    ImportApproveResponse,
)
from worker.tasks.question_import import run_question_import


@router.post("/import", status_code=202)
async def start_question_import(
    session: DbSession,
    current_user: RecruiterUser,
    file: UploadFile = File(...),
    import_type: str = Form("generative"),      # generative | extraction | csv
    num_questions: int = Form(10),
    context_hint: str = Form(""),
    question_types: str = Form("mcq,essay"),    # comma-separated
):
    """
    Upload a file and queue a background AI question import job.
    Returns the job_id immediately; use GET /questions/import/jobs to poll status.

    - import_type=generative : Path A — AI generates NEW questions from material
    - import_type=extraction : Path B — AI extracts EXISTING questions from doc
    - import_type=csv        : Path B — AI maps CSV/XLSX columns to our schema
    """
    file_bytes = await file.read()

    # Validate file size early (5 MB limit)
    MAX_SIZE = 5 * 1024 * 1024
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) // (1024*1024):.1f} MB). Maximum is 5 MB.",
        )

    # Create the job record
    job = QuestionImportJob(
        organization_id=current_user.organization_id,
        created_by_user_id=current_user.user_id,
        status="pending",
        import_type=import_type,
        source_filename=file.filename,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    # Encode file for Celery (JSON-safe)
    file_b64 = base64.b64encode(file_bytes).decode("utf-8")
    q_types = [t.strip() for t in question_types.split(",") if t.strip()]

    # Queue Celery task
    run_question_import.delay(
        job_id=str(job.id),
        file_b64=file_b64,
        filename=file.filename or "upload",
        org_id=str(current_user.organization_id),
        user_id=str(current_user.user_id),
        import_type=import_type,
        num_questions=num_questions,
        context_hint=context_hint,
        question_types=q_types,
    )

    return {"job_id": str(job.id), "status": "pending", "message": "Import job queued successfully"}


@router.get("/import/jobs", response_model=list[ImportJobResponse])
async def list_import_jobs(
    session: DbSession,
    current_user: RecruiterUser,
):
    """List all question import jobs for the current organization."""
    result = await session.execute(
        select(QuestionImportJob)
        .where(QuestionImportJob.organization_id == current_user.organization_id)
        .order_by(QuestionImportJob.created_at.desc())
    )
    jobs = result.scalars().all()
    return [
        ImportJobResponse(
            job_id=j.id,
            status=j.status,
            import_type=j.import_type,
            source_filename=j.source_filename,
            total_generated=j.total_generated,
            total_flagged=j.total_flagged,
            total_approved=j.total_approved,
            error_message=j.error_message,
            created_at=j.created_at,
            completed_at=j.completed_at,
        )
        for j in jobs
    ]


@router.get("/import/jobs/{job_id}/draft", response_model=DraftQuestionsResponse)
async def get_draft_questions(
    job_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """
    Retrieve the AI-generated draft questions for a completed import job.
    Used to populate the Staging & Review UI.
    """
    job = await session.get(QuestionImportJob, job_id)
    if not job or job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Import job not found")
    if job.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Job is not completed yet (status: {job.status})",
        )

    raw_questions = job.draft_questions or []
    questions = [DraftQuestion(**q) for q in raw_questions]

    return DraftQuestionsResponse(
        job_id=job.id,
        import_type=job.import_type,
        source_filename=job.source_filename,
        critic_stats=job.critic_stats,
        questions=questions,
    )


@router.post("/import/jobs/{job_id}/approve", response_model=ImportApproveResponse)
async def approve_import_questions(
    job_id: UUID,
    request: ImportApproveRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """
    Commit recruiter-selected draft questions into the live Question Bank.
    Questions not selected are discarded.
    """
    job = await session.get(QuestionImportJob, job_id)
    if not job or job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Import job not found")

    diff_map = {"Easy": 1, "Medium": 2, "Hard": 3}
    type_map = {"mcq": "mcq", "essay": "essay", "code": "code"}

    imported = 0
    for dq in request.questions:
        q_type = type_map.get(dq.type, "essay")
        config: dict = {}
        correct_answer = None

        if q_type == "mcq":
            config["options"] = dq.options or []
            config["multiple_correct"] = False
            config["explanation"] = dq.explanation
            if dq.correct_answer is not None:
                correct_answer = {"answer": dq.correct_answer}
        elif q_type == "essay":
            config["max_words"] = dq.max_words or 500
            config["rubric"] = dq.rubric
        elif q_type == "code":
            config["language"] = "python"

        new_q = QuestionBank(
            organization_id=current_user.organization_id,
            question_type=q_type,
            question_text=dq.text,
            question_config=config,
            correct_answer=correct_answer,
            category=dq.category or "Uncategorized",
            difficulty=diff_map.get(dq.difficulty, 2),
            tags=dq.tags or [],
            points=10,
            created_by_user_id=current_user.user_id,
            is_base_question=True,
        )
        session.add(new_q)
        imported += 1

    # Update job counters
    job.total_approved = imported
    session.add(job)
    await session.commit()

    total_draft = len(job.draft_questions or [])
    skipped = total_draft - imported

    return ImportApproveResponse(
        imported_count=imported,
        skipped_count=skipped,
        message=f"Successfully imported {imported} question(s) into the bank.",
    )

