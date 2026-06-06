from typing import List
import json
from uuid import UUID
import httpx
from fastapi.responses import Response
from difflib import SequenceMatcher
import csv as csv_lib

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DbSession, RecruiterUser
from app.core.config import settings
from app.schemas.questions import QuestionBankCreateRequest, QuestionBankResponseItem
from app.services.questions import QuestionService

router = APIRouter(tags=["Questions"])

QUESTION_IMPORT_TEMPLATE_CSV = """type,text,difficulty,category,tags,options,correct_answer,evidence,reference_answer,explanation,rubric,max_words
mcq,What is the time complexity of binary search?,Medium,Algorithms,"search,complexity","O(n)|O(log n)|O(n log n)|O(1)",1,Array is sorted,Binary search halves the search space each step,Option index starts at 0,,
essay,Explain the Single Responsibility Principle.,Medium,Software Design,"oop,solid",,,Relates to maintainable classes,A class should have one reason to change,,Assess clarity and practical examples,250
"""

# Temporary schemas for inline responses
class FavoriteResponse(BaseModel):
    isFavorite: bool

class MessageResponse(BaseModel):
    message: str


class SpreadsheetPreflightRowError(BaseModel):
    row: int
    error: str


class SpreadsheetAutoFixSuggestion(BaseModel):
    row: int
    error: str
    suggestion: str
    auto_fixable: bool


class SpreadsheetMappingPreflightResponse(BaseModel):
    sheets: list[str]
    selected_sheet: str | None
    columns: list[str]
    mapping: dict[str, str | None]
    confidence: dict[str, float]
    uncertain_fields: list[str]
    valid_rows: int
    invalid_rows: int
    row_errors_preview: list[SpreadsheetPreflightRowError]
    auto_fix_suggestions_preview: list[SpreadsheetAutoFixSuggestion]
    auto_fixable_count: int
    unfixable_count: int


QUESTION_IMPORT_CANONICAL_FIELDS: list[str] = [
    "type",
    "text",
    "difficulty",
    "category",
    "tags",
    "options",
    "correct_answer",
    "evidence",
    "reference_answer",
    "explanation",
    "rubric",
    "max_words",
]


QUESTION_IMPORT_HEADER_ALIASES: dict[str, list[str]] = {
    "type": ["type", "question_type", "q_type", "questiontype"],
    "text": ["text", "question", "question_text", "prompt", "question_prompt"],
    "difficulty": ["difficulty", "level"],
    "category": ["category", "topic", "domain", "skill"],
    "tags": ["tags", "tag", "keywords", "keyword"],
    "options": ["options", "choices", "answers", "mcq_options"],
    "correct_answer": ["correct_answer", "answer", "correct", "correct_option", "answer_index", "correct_index"],
    "evidence": ["evidence", "source_evidence", "source"],
    "reference_answer": ["reference_answer", "reference", "model_answer", "expected_answer"],
    "explanation": ["explanation", "rationale", "reasoning"],
    "rubric": ["rubric", "grading_rubric", "scoring_rubric"],
    "max_words": ["max_words", "word_limit", "max_word_count"],
}


def _normalize_header(value: str) -> str:
    import re

    lowered = str(value or "").strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
    return lowered.strip("_")


def _to_row_dict(headers: list[str], row_values: list[object]) -> dict[str, str]:
    def as_text(v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    return {
        headers[i]: as_text(row_values[i]) if i < len(row_values) else ""
        for i in range(len(headers))
    }


def _detect_best_column_mapping(headers: list[str]) -> tuple[dict[str, str | None], dict[str, float], list[str]]:
    normalized_headers = {_normalize_header(h): h for h in headers}

    mapping: dict[str, str | None] = {}
    confidence: dict[str, float] = {}

    for field in QUESTION_IMPORT_CANONICAL_FIELDS:
        aliases = QUESTION_IMPORT_HEADER_ALIASES.get(field, [field])
        best_col: str | None = None
        best_score = 0.0

        for header in headers:
            hn = _normalize_header(header)
            for alias in aliases:
                an = _normalize_header(alias)
                if hn == an:
                    score = 1.0
                elif hn in normalized_headers and an in hn:
                    score = 0.9
                else:
                    score = SequenceMatcher(None, hn, an).ratio()

                if score > best_score:
                    best_score = score
                    best_col = header

        if best_score < 0.55:
            mapping[field] = None
            confidence[field] = 0.0
        else:
            mapping[field] = best_col
            confidence[field] = round(best_score, 3)

    uncertain_fields = [
        f for f, col in mapping.items()
        if col and confidence.get(f, 0.0) < 0.85
    ]

    return mapping, confidence, uncertain_fields


def _parse_mcq_options(text: str) -> list[str]:
    if not text:
        return []
    if "|" in text:
        parts = text.split("|")
    elif ";" in text:
        parts = text.split(";")
    elif "\n" in text:
        parts = text.splitlines()
    else:
        parts = [text]
    return [p.strip() for p in parts if p and p.strip()]


def _is_valid_correct_answer(raw: str, options: list[str]) -> bool:
    if not raw:
        return False
    if raw.isdigit():
        idx = int(raw)
        return 0 <= idx < len(options)
    if len(raw) == 1 and raw.isalpha():
        idx = ord(raw.upper()) - ord("A")
        return 0 <= idx < len(options)
    return any(opt.strip().lower() == raw.strip().lower() for opt in options)


def _validate_spreadsheet_rows(
    headers: list[str],
    rows: list[list[object]],
    mapping: dict[str, str | None],
) -> tuple[int, int, list[SpreadsheetPreflightRowError], list[SpreadsheetAutoFixSuggestion]]:
    type_col = mapping.get("type")
    text_col = mapping.get("text")
    options_col = mapping.get("options")
    correct_col = mapping.get("correct_answer")

    if not type_col or not text_col:
        invalid = len(rows)
        base_error = [SpreadsheetPreflightRowError(row=2, error="Missing required mapping for type/text")] if rows else []
        base_suggestion = [
            SpreadsheetAutoFixSuggestion(
                row=2,
                error="Missing required mapping for type/text",
                suggestion="Map both 'type' and 'text' columns before continuing.",
                auto_fixable=False,
            )
        ] if rows else []
        return 0, invalid, base_error, base_suggestion

    valid_rows = 0
    invalid_rows = 0
    errors: list[SpreadsheetPreflightRowError] = []
    suggestions: list[SpreadsheetAutoFixSuggestion] = []

    for idx, values in enumerate(rows):
        row_number = idx + 2
        row = _to_row_dict(headers, values)

        q_type = (row.get(type_col) or "").strip().lower().replace("_", " ").replace("-", " ")
        text = (row.get(text_col) or "").strip()

        if not text:
            invalid_rows += 1
            errors.append(SpreadsheetPreflightRowError(row=row_number, error="Question text is empty"))
            suggestions.append(
                SpreadsheetAutoFixSuggestion(
                    row=row_number,
                    error="Question text is empty",
                    suggestion="Add question text manually (cannot auto-fix).",
                    auto_fixable=False,
                )
            )
            continue

        normalized_type = "mcq" if q_type in {"mcq", "multiple choice", "multiplechoice", "true false", "true/false"} else ("essay" if q_type in {"essay", "open ended", "open ended question", "long answer"} else ("code" if q_type in {"code", "coding", "programming"} else "essay"))

        if normalized_type == "mcq":
            options = _parse_mcq_options((row.get(options_col) or "").strip() if options_col else "")
            correct = (row.get(correct_col) or "").strip() if correct_col else ""
            if len(options) < 2:
                invalid_rows += 1
                errors.append(SpreadsheetPreflightRowError(row=row_number, error="MCQ requires at least 2 options"))
                suggestions.append(
                    SpreadsheetAutoFixSuggestion(
                        row=row_number,
                        error="MCQ requires at least 2 options",
                        suggestion="Auto-fix can convert single-option MCQ rows to essay; otherwise add options manually.",
                        auto_fixable=len(options) == 1,
                    )
                )
                continue
            if not _is_valid_correct_answer(correct, options):
                invalid_rows += 1
                errors.append(SpreadsheetPreflightRowError(row=row_number, error="MCQ correct_answer is missing or invalid"))
                suggestions.append(
                    SpreadsheetAutoFixSuggestion(
                        row=row_number,
                        error="MCQ correct_answer is missing or invalid",
                        suggestion="Auto-fix can default correct_answer to the first option.",
                        auto_fixable=True,
                    )
                )
                continue

        valid_rows += 1

    return valid_rows, invalid_rows, errors[:50], suggestions[:80]


@router.get("/import/template")
async def download_question_import_template(
    current_user: RecruiterUser,
):
    """Download the EraMatch spreadsheet template for question import."""
    _ = current_user
    return Response(
        content=QUESTION_IMPORT_TEMPLATE_CSV,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="eramatch_question_import_template.csv"'
        },
    )


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


class RefactorQuestionsRequest(BaseModel):
    question_ids: list[str]
    refactor_type: str = "all"

@router.post("/bank/refactor/batch", response_model=MessageResponse)
async def refactor_questions_batch_api(
    request: RefactorQuestionsRequest,
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Triggers a background task to use AI to refactor missing attributes for the given questions.
    """
    try:
        from worker.tasks.question_refactor import refactor_questions_batch
        from app.models import QuestionImportJob
        current_user_id, current_org_id = _resolve_current_user_ids(current_user)
        
        job = QuestionImportJob(
            organization_id=current_org_id,
            created_by_user_id=current_user_id,
            status="pending",
            import_type="Generative", # Use Generative so it works with Review Imports page easily
            source_filename=f"AI Refactoring ({request.refactor_type})",
            total_generated=len(request.question_ids),
            total_flagged=0,
            total_approved=0,
            draft_questions=[]
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)

        refactor_questions_batch.delay(str(job.id), request.question_ids, str(current_org_id), request.refactor_type)
        return MessageResponse(message="Successfully queued questions for refactoring")
    except Exception as e:
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


@router.post("/import/spreadsheet/preflight", response_model=SpreadsheetMappingPreflightResponse)
async def preflight_spreadsheet_mapping(
    file: UploadFile = File(...),
    sheet_name: str = Form(""),
):
    """Inspect spreadsheet headers/sheets and return suggested mapping + confidence + row validation preview."""
    file_bytes = await file.read()

    if len(file_bytes) > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) // (1024*1024):.1f} MB). Maximum is 5 MB.",
        )

    filename = (file.filename or "").lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=422, detail="Only CSV/XLSX/XLS are supported for spreadsheet preflight")

    try:
        import pandas as pd
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="Spreadsheet preflight requires pandas/openpyxl on backend") from exc

    sheets: list[str] = []
    selected_sheet: str | None = None
    headers: list[str] = []
    rows: list[list[object]] = []

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes), dtype=object)
            selected_sheet = None
            headers = [str(c) for c in df.columns]
            rows = df.head(200).fillna("").values.tolist()
        else:
            excel_engine = "xlrd" if filename.endswith(".xls") else "openpyxl"
            try:
                workbook = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, dtype=object, engine=excel_engine)
            except ImportError as exc:
                required_pkg = "xlrd" if excel_engine == "xlrd" else "openpyxl"
                raise HTTPException(
                    status_code=500,
                    detail=f"Excel parsing dependency missing on backend: install '{required_pkg}'",
                ) from exc
            sheets = list(workbook.keys())
            if not sheets:
                raise HTTPException(status_code=422, detail="Spreadsheet has no sheets")
            if sheet_name and sheet_name in sheets:
                selected_sheet = sheet_name
            else:
                selected_sheet = sheets[0]
            df = workbook[selected_sheet]
            headers = [str(c) for c in df.columns]
            rows = df.head(200).fillna("").values.tolist()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to parse spreadsheet: {exc}") from exc

    mapping, confidence, uncertain_fields = _detect_best_column_mapping(headers)
    valid_rows, invalid_rows, row_errors, auto_fix_suggestions = _validate_spreadsheet_rows(headers, rows, mapping)
    auto_fixable_count = len([s for s in auto_fix_suggestions if s.auto_fixable])
    unfixable_count = len([s for s in auto_fix_suggestions if not s.auto_fixable])

    return SpreadsheetMappingPreflightResponse(
        sheets=sheets,
        selected_sheet=selected_sheet,
        columns=headers,
        mapping=mapping,
        confidence=confidence,
        uncertain_fields=uncertain_fields,
        valid_rows=valid_rows,
        invalid_rows=invalid_rows,
        row_errors_preview=row_errors,
        auto_fix_suggestions_preview=auto_fix_suggestions,
        auto_fixable_count=auto_fixable_count,
        unfixable_count=unfixable_count,
    )


@router.post("/import", status_code=202)
async def start_question_import(
    session: DbSession,
    current_user: RecruiterUser,
    file: UploadFile = File(...),
    import_type: str = Form("generative"),      # generative | extraction | csv
    num_questions: int = Form(10),
    context_hint: str = Form(""),
    recruiter_instructions: str = Form(""),
    question_types: str = Form("mcq,essay"),    # comma-separated
    mcq_count: int = Form(5),
    essay_count: int = Form(5),
    mcq_difficulty: str = Form("Medium"),
    essay_difficulty: str = Form("Medium"),
    mcq_easy_count: int = Form(0),
    mcq_medium_count: int = Form(0),
    mcq_hard_count: int = Form(0),
    essay_easy_count: int = Form(0),
    essay_medium_count: int = Form(0),
    essay_hard_count: int = Form(0),
    process_in_chunks: bool = Form(False),
    chunk_page_size: int = Form(MAX_PDF_PAGES),
    sheet_name: str = Form(""),
    column_mapping: str = Form(""),
    apply_auto_fixes: bool = Form(False),
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
        if any(v < 0 for v in [
            mcq_count,
            essay_count,
            mcq_easy_count,
            mcq_medium_count,
            mcq_hard_count,
            essay_easy_count,
            essay_medium_count,
            essay_hard_count,
        ]):
            raise HTTPException(status_code=422, detail="Question counts cannot be negative")

        mcq_split_total = mcq_easy_count + mcq_medium_count + mcq_hard_count
        essay_split_total = essay_easy_count + essay_medium_count + essay_hard_count

        if mcq_split_total > 0 or essay_split_total > 0:
            mcq_count = mcq_split_total
            essay_count = essay_split_total

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
            recruiter_instructions=recruiter_instructions,
            question_types=q_types,
            mcq_count=mcq_count,
            essay_count=essay_count,
            mcq_difficulty=mcq_difficulty,
            essay_difficulty=essay_difficulty,
            mcq_easy_count=mcq_easy_count,
            mcq_medium_count=mcq_medium_count,
            mcq_hard_count=mcq_hard_count,
            essay_easy_count=essay_easy_count,
            essay_medium_count=essay_medium_count,
            essay_hard_count=essay_hard_count,
            page_start=start_page,
            page_end=end_page,
            chunk_index=(idx + 1) if len(chunks) > 1 else None,
            chunk_count=len(chunks) if len(chunks) > 1 else None,
            sheet_name=sheet_name.strip() or None,
            column_mapping_json=column_mapping.strip() or None,
            apply_auto_fixes=apply_auto_fixes,
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
    def _risk_priority(job: QuestionImportJob) -> float:
        generated = max(1, int(job.total_generated or 0))
        flagged = int(job.total_flagged or 0)
        flagged_ratio = flagged / generated
        status = (job.status or "").lower()
        status_weight = 0
        if status == "failed":
            status_weight = 100
        elif status == "completed":
            status_weight = 40
        elif status == "processing":
            status_weight = 20
        return status_weight + (flagged * 2.5) + (flagged_ratio * 35.0)

    ranked_jobs = sorted(
        jobs,
        key=lambda j: (
            _risk_priority(j),
            j.created_at or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )

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
        for j in ranked_jobs
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
        config: dict = {
            "evidence": dq.evidence,
            "reference_answer": dq.reference_answer,
            "explanation": dq.explanation,
            "rubric": dq.rubric,
            "rubric_yes_no_checks": dq.rubric_yes_no_checks,
            "critic_score": dq.critic_score,
            "critic_weighted_score": dq.critic_weighted_score,
            "critic_feedback": dq.critic_feedback,
            "critic_checks": dq.critic_checks,
            "retry_count": dq.retry_count,
            "needs_review": dq.needs_review,
            "import_type": job.import_type,
            "import_job_id": str(job.id),
            "source_filename": job.source_filename,
        }
        correct_answer = None

        if q_type == "mcq":
            config["options"] = dq.options or []
            config["multiple_correct"] = False
            if dq.correct_answer is not None:
                correct_answer = {"answer": dq.correct_answer}
        elif q_type == "essay":
            config["max_words"] = dq.max_words or 500
        elif q_type == "code":
            config["language"] = "python"

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

        if dq.original_question_id:
            old_q = session.get(QuestionBank, dq.original_question_id)
            if old_q and not old_q.is_deleted:
                old_q.is_deleted = True
                session.add(old_q)

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


class GenerateVariantsRequest(BaseModel):
    questionText: str
    type: str = "essay"
    difficulty: str = "Medium"

    model_config = {"extra": "allow"}


@router.post("/generate-variants")
async def generate_question_variants(
    request: GenerateVariantsRequest,
    session: DbSession,
    current_user: RecruiterUser,
    numVariants: int = 3,
):
    """Generate AI variants of a base question with equal difficulty and different wording."""
    import asyncio
    from uuid import uuid4
    from app.services.recruiter import RecruiterService

    question_type = request.type.lower()
    question_text = request.questionText.strip()
    difficulty = request.difficulty

    if not question_text:
        raise HTTPException(status_code=422, detail="questionText is required")

    num = max(1, min(10, numVariants))
    svc = RecruiterService(session, current_user)
    context = f"Generate a variant with different wording but the same difficulty and structure as this question: {question_text}"

    tasks = [
        svc.generate_ai_question(
            question_type=question_type,
            topic=question_text,
            difficulty=difficulty,
            context=context,
        )
        for _ in range(num)
    ]
    results = await asyncio.gather(*tasks)

    variants = []
    for result in results:
        if isinstance(result, dict):
            result.setdefault("id", str(uuid4()))
            result.setdefault("type", question_type)
            result.setdefault("difficulty", difficulty)
            variants.append(result)

    return variants


@router.get("/import/jobs/{job_id}/row-errors-report")
async def download_import_row_errors_report(
    job_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Download CSV row-level validation report for spreadsheet imports (when available)."""
    job = await session.get(QuestionImportJob, job_id)
    if not job or job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Import job not found")

    stats = job.critic_stats or {}
    if isinstance(stats, str):
        try:
            stats = json.loads(stats)
        except Exception:
            stats = {}

    row_errors = stats.get("row_errors") if isinstance(stats, dict) else None
    if not isinstance(row_errors, list) or len(row_errors) == 0:
        raise HTTPException(status_code=404, detail="No row-level errors report available for this import job")

    out = io.StringIO()
    writer = csv_lib.writer(out)
    writer.writerow(["row", "error", "question_type", "question_text"])

    for err in row_errors:
        if not isinstance(err, dict):
            continue
        writer.writerow([
            err.get("row") or "",
            err.get("error") or "",
            err.get("question_type") or "",
            err.get("question_text") or "",
        ])

    csv_content = out.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="import_row_errors_{job_id}.csv"'
        },
    )

