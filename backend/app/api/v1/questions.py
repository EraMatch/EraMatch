from typing import List
import json
from uuid import UUID
import httpx

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DbSession, RecruiterUser
from app.core.config import settings
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
import io
import re
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

MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
MAX_PDF_PAGES = 20


def _derive_rubric_yes_no_checks(payload: dict) -> list[dict]:
    rubric = str(payload.get("rubric") or "").strip()
    reference = str(payload.get("reference_answer") or "").strip()
    evidence = str(payload.get("evidence") or "").strip()
    source = "\n".join([part for part in [rubric, reference, evidence] if part]).strip()

    if not source:
        source = "Correctness, completeness, and alignment with expected answer"

    chunks = [
        c.strip(" -:;,.\n\t")
        for c in re.split(r"[\n\r\.;:]+", source)
        if c and c.strip()
    ]

    checks: list[str] = []
    for chunk in chunks:
        if len(chunk) < 10:
            continue
        lowered = chunk.lower()
        if lowered.startswith("excellent") or lowered.startswith("good") or lowered.startswith("satisfactory") or lowered.startswith("poor"):
            continue
        checks.append(f"Does the answer {chunk[0].lower() + chunk[1:] if len(chunk) > 1 else chunk.lower()}?")
        if len(checks) == 10:
            break

    while len(checks) < 10:
        idx = len(checks) + 1
        checks.append(f"Does the answer satisfy rubric criterion {idx} with clear evidence?")

    return [
        {"id": idx + 1, "check": checks[idx], "weight": 0.10}
        for idx in range(10)
    ]


class ImportPreflightResponse(BaseModel):
    is_pdf: bool
    total_pages: int | None
    max_pages_without_chunking: int
    requires_chunking: bool
    chunk_page_size: int
    chunk_count: int
    message: str


class RefineImportQuestionRequest(BaseModel):
    question_index: int


class RefineImportQuestionResponse(BaseModel):
    question_index: int
    refined_question: dict
    message: str


def _is_pdf_filename(filename: str | None) -> bool:
    return bool(filename and filename.lower().endswith(".pdf"))


def _count_pdf_pages(file_bytes: bytes) -> int:
    try:
        import pdfplumber
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="PDF parser is not available on the server") from exc

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            return len(pdf.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to read PDF pages. Please upload a valid PDF file.") from exc


def _build_page_chunks(total_pages: int, chunk_page_size: int) -> list[tuple[int, int]]:
    chunks: list[tuple[int, int]] = []
    page = 1
    while page <= total_pages:
        end_page = min(page + chunk_page_size - 1, total_pages)
        chunks.append((page, end_page))
        page = end_page + 1
    return chunks


def _extract_failed_criteria(question: dict) -> list[str]:
    checks = question.get("critic_checks")
    if not isinstance(checks, list):
        return []
    failed: list[str] = []
    for check in checks:
        if not isinstance(check, dict):
            continue
        verdict = str(check.get("verdict") or "").strip().upper()
        criterion = str(check.get("criterion") or "").strip()
        if verdict == "NO" and criterion:
            failed.append(criterion)
    return failed


def _build_refine_context(question: dict) -> str:
    parts: list[str] = []
    text = str(question.get("text") or "").strip()
    if text:
        parts.append(f"Question: {text}")

    options = question.get("options")
    if isinstance(options, list) and options:
        option_lines = [f"{idx + 1}. {str(opt)}" for idx, opt in enumerate(options)]
        parts.append("Options:\n" + "\n".join(option_lines))

    for label, key in [
        ("Evidence", "evidence"),
        ("Reference Answer", "reference_answer"),
        ("Rubric", "rubric"),
        ("Explanation", "explanation"),
    ]:
        value = str(question.get(key) or "").strip()
        if value:
            parts.append(f"{label}: {value}")

    return "\n\n".join(parts).strip()


def _resolve_current_user_ids(current_user: RecruiterUser) -> tuple[UUID, UUID]:
    """Resolve user/org IDs safely across SQLModel alias variants (id vs user_id)."""
    dumped = {}
    try:
        dumped = current_user.model_dump(by_alias=True)
    except Exception:
        dumped = {}

    user_id = (
        dumped.get("user_id")
        or dumped.get("id")
        or getattr(current_user, "user_id", None)
        or getattr(current_user, "id", None)
    )
    org_id = (
        dumped.get("organization_id")
        or getattr(current_user, "organization_id", None)
    )

    if not user_id or not org_id:
        raise HTTPException(status_code=401, detail="Invalid authenticated user context")

    return UUID(str(user_id)), UUID(str(org_id))


@router.post("/import/preflight", response_model=ImportPreflightResponse)
async def preflight_question_import(
    file: UploadFile = File(...),
    chunk_page_size: int = Form(MAX_PDF_PAGES),
):
    """Preflight check for import files to support chunking decisions before queueing."""
    if chunk_page_size < 1 or chunk_page_size > MAX_PDF_PAGES:
        raise HTTPException(
            status_code=422,
            detail=f"chunk_page_size must be between 1 and {MAX_PDF_PAGES} pages.",
        )

    file_bytes = await file.read()

    if len(file_bytes) > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) // (1024*1024):.1f} MB). Maximum is 5 MB.",
        )

    if not _is_pdf_filename(file.filename):
        return ImportPreflightResponse(
            is_pdf=False,
            total_pages=None,
            max_pages_without_chunking=MAX_PDF_PAGES,
            requires_chunking=False,
            chunk_page_size=chunk_page_size,
            chunk_count=1,
            message="This document type does not require PDF page chunking.",
        )

    total_pages = _count_pdf_pages(file_bytes)
    requires_chunking = total_pages > MAX_PDF_PAGES
    chunk_count = len(_build_page_chunks(total_pages, chunk_page_size))

    if requires_chunking:
        message = (
            f"This document has {total_pages} pages, which is higher than the system limit of "
            f"{MAX_PDF_PAGES} pages per run. You can process it in {chunk_count} chunk(s)."
        )
    else:
        message = f"PDF has {total_pages} pages and can be processed directly."

    return ImportPreflightResponse(
        is_pdf=True,
        total_pages=total_pages,
        max_pages_without_chunking=MAX_PDF_PAGES,
        requires_chunking=requires_chunking,
        chunk_page_size=chunk_page_size,
        chunk_count=chunk_count,
        message=message,
    )


@router.post("/import", status_code=202)
async def start_question_import(
    session: DbSession,
    current_user: RecruiterUser,
    file: UploadFile = File(...),
    import_type: str = Form("generative"),      # generative | extraction | csv
    num_questions: int = Form(10),
    context_hint: str = Form(""),
    question_types: str = Form("mcq,essay"),    # comma-separated
    mcq_count: int = Form(5),
    essay_count: int = Form(5),
    mcq_difficulty: str = Form("Medium"),
    essay_difficulty: str = Form("Medium"),
    process_in_chunks: bool = Form(False),
    chunk_page_size: int = Form(MAX_PDF_PAGES),
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
    if len(file_bytes) > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) // (1024*1024):.1f} MB). Maximum is 5 MB.",
        )

    if chunk_page_size < 1 or chunk_page_size > MAX_PDF_PAGES:
        raise HTTPException(
            status_code=422,
            detail=f"chunk_page_size must be between 1 and {MAX_PDF_PAGES} pages.",
        )

    current_user_id, current_org_id = _resolve_current_user_ids(current_user)

    # Encode file for Celery (JSON-safe)
    file_b64 = base64.b64encode(file_bytes).decode("utf-8")
    q_types = [t.strip() for t in question_types.split(",") if t.strip()]

    if import_type == "generative":
        total_requested = mcq_count + essay_count
        if total_requested <= 0:
            raise HTTPException(status_code=422, detail="At least one question must be requested")
        num_questions = total_requested

    is_pdf = _is_pdf_filename(file.filename)
    total_pages = _count_pdf_pages(file_bytes) if is_pdf else None

    if is_pdf and total_pages and total_pages > MAX_PDF_PAGES and not process_in_chunks:
        suggested_chunks = len(_build_page_chunks(total_pages, chunk_page_size))
        raise HTTPException(
            status_code=422,
            detail=(
                f"This document has {total_pages} pages which is higher than the limit ({MAX_PDF_PAGES}). "
                f"Enable chunking and choose pages per chunk to process it. Current chunk setting creates {suggested_chunks} chunk(s)."
            ),
        )

    chunks = [(None, None)]
    if is_pdf and total_pages:
        if process_in_chunks:
            chunks = _build_page_chunks(total_pages, chunk_page_size)
        else:
            chunks = [(1, total_pages)]

    created_jobs: list[QuestionImportJob] = []
    for idx, (start_page, end_page) in enumerate(chunks):
        if start_page is not None and end_page is not None and len(chunks) > 1:
            source_name = f"{file.filename} (Chunk {idx + 1}/{len(chunks)}: p{start_page}-{end_page})"
        else:
            source_name = file.filename

        job = QuestionImportJob(
            organization_id=current_org_id,
            created_by_user_id=current_user_id,
            status="pending",
            import_type=import_type,
            source_filename=source_name,
        )
        session.add(job)
        created_jobs.append(job)

    await session.commit()

    for idx, job in enumerate(created_jobs):
        await session.refresh(job)
        start_page, end_page = chunks[idx]

        run_question_import.delay(
            job_id=str(job.id),
            file_b64=file_b64,
            filename=file.filename or "upload",
            org_id=str(current_org_id),
            user_id=str(current_user_id),
            import_type=import_type,
            num_questions=num_questions,
            context_hint=context_hint,
            question_types=q_types,
            mcq_count=mcq_count,
            essay_count=essay_count,
            mcq_difficulty=mcq_difficulty,
            essay_difficulty=essay_difficulty,
            page_start=start_page,
            page_end=end_page,
            chunk_index=(idx + 1) if len(chunks) > 1 else None,
            chunk_count=len(chunks) if len(chunks) > 1 else None,
        )

    primary_job = created_jobs[0]
    return {
        "job_id": str(primary_job.id),
        "status": "pending",
        "message": (
            f"Queued {len(created_jobs)} chunked import job(s) successfully"
            if len(created_jobs) > 1
            else "Import job queued successfully"
        ),
        "chunked": len(created_jobs) > 1,
        "chunk_count": len(created_jobs),
        "job_ids": [str(job.id) for job in created_jobs],
    }


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
    if isinstance(raw_questions, str):
        try:
            raw_questions = json.loads(raw_questions)
        except Exception:
            raw_questions = []
    elif isinstance(raw_questions, dict):
        raw_questions = raw_questions.get("questions", [])

    if not isinstance(raw_questions, list):
        raw_questions = []

    questions: list[DraftQuestion] = []
    for q in raw_questions:
        if not isinstance(q, dict):
            continue
        try:
            q_type = str(q.get("type") or "").strip().lower()
            if q_type == "essay":
                checks = q.get("rubric_yes_no_checks")
                if not isinstance(checks, list) or len(checks) != 10:
                    q["rubric_yes_no_checks"] = _derive_rubric_yes_no_checks(q)
            else:
                q["rubric_yes_no_checks"] = None
            questions.append(DraftQuestion(**q))
        except Exception:
            continue

    critic_stats = job.critic_stats
    if isinstance(critic_stats, str):
        try:
            critic_stats = json.loads(critic_stats)
        except Exception:
            critic_stats = None

    return DraftQuestionsResponse(
        job_id=job.id,
        import_type=job.import_type,
        source_filename=job.source_filename,
        critic_stats=critic_stats,
        questions=questions,
    )


@router.post("/import/jobs/{job_id}/draft/refine", response_model=RefineImportQuestionResponse)
async def refine_import_question(
    job_id: UUID,
    request: RefineImportQuestionRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """
    Refine one staged draft question (any type) based on failed critic criteria.
    Returns the full refined question package for local staging replacement.
    """
    job = await session.get(QuestionImportJob, job_id)
    if not job or job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Import job not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail=f"Job is not completed yet (status: {job.status})")

    raw_questions = job.draft_questions or []
    if isinstance(raw_questions, str):
        try:
            raw_questions = json.loads(raw_questions)
        except Exception:
            raw_questions = []
    elif isinstance(raw_questions, dict):
        raw_questions = raw_questions.get("questions", [])

    if not isinstance(raw_questions, list):
        raw_questions = []

    if request.question_index < 0 or request.question_index >= len(raw_questions):
        raise HTTPException(status_code=422, detail="question_index is out of range")

    question = raw_questions[request.question_index]
    if not isinstance(question, dict):
        raise HTTPException(status_code=422, detail="Invalid question payload")

    context_text = _build_refine_context(question)
    if not context_text:
        raise HTTPException(status_code=422, detail="Cannot build context for refinement")

    ai_payload = {
        "raw_text": context_text,
        "question": question,
        "critic_feedback": str(question.get("critic_feedback") or ""),
        "failed_criteria": _extract_failed_criteria(question),
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(f"{settings.AI_SERVICE_URL}/question-import/refine-question", json=ai_payload)
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("detail")
            except Exception:
                detail = resp.text
            raise HTTPException(status_code=502, detail=f"AI refinement failed: {detail}")

        refined_question = resp.json().get("question")
        if not isinstance(refined_question, dict):
            raise HTTPException(status_code=502, detail="AI returned invalid refined question")

        return RefineImportQuestionResponse(
            question_index=request.question_index,
            refined_question=refined_question,
            message="Question refined based on failed critic criteria",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to call AI service for refinement: {exc}")


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
    current_user_id, current_org_id = _resolve_current_user_ids(current_user)

    job = await session.get(QuestionImportJob, job_id)
    if not job or job.organization_id != current_org_id:
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
            config["evidence"] = dq.evidence
            config["reference_answer"] = dq.reference_answer
            if dq.correct_answer is not None:
                correct_answer = {"answer": dq.correct_answer}
        elif q_type == "essay":
            config["max_words"] = dq.max_words or 500
            config["rubric"] = dq.rubric
            config["evidence"] = dq.evidence
            config["reference_answer"] = dq.reference_answer
        elif q_type == "code":
            config["language"] = "python"
            config["evidence"] = dq.evidence
            config["reference_answer"] = dq.reference_answer

        new_q = QuestionBank(
            organization_id=current_org_id,
            question_type=q_type,
            question_text=dq.text,
            question_config=config,
            correct_answer=correct_answer,
            category=dq.category or "Uncategorized",
            difficulty=diff_map.get(dq.difficulty, 2),
            tags=dq.tags or [],
            points=10,
            created_by_user_id=current_user_id,
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

