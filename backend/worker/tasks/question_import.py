"""
Celery task for AI-powered question import.

Handles both:
  - Path A: Generative (upload material → AI generates questions)
  - Path B: Deterministic (upload CSV/Excel → AI extracts & maps, or PDF/MD → AI structures)

Follows the same psycopg2 + requests pattern as worker/tasks/video.py.
"""
import base64
import io
import json
import logging
import os
import re
from datetime import datetime, timezone
from uuid import UUID

import psycopg2
import requests

from app.core.config import settings
from worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────
# Prefer shared settings so worker and API read the same .env values.
DATABASE_URL = settings.DATABASE_URL or os.environ.get("DATABASE_URL", "")
AI_SERVICE_URL = settings.AI_SERVICE_URL

# File extraction limits
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_PDF_PAGES = 20
MAX_EXTRACT_CHARS = 50_000


# ─── DB helpers (psycopg2 — sync, Celery-safe) ───────────────────────────────

def get_db_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured for Celery worker")
    sync_url = DATABASE_URL.replace("+asyncpg", "")
    return psycopg2.connect(sync_url)


def update_job_status(conn, job_id: str, status: str, **extra_fields):
    """Update a QuestionImportJob row with status and optional extra fields."""
    fields = {"status": status}
    fields.update(extra_fields)

    set_clauses = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [job_id]

    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE question_import_jobs SET {set_clauses} WHERE job_id = %s",
            values,
        )
    conn.commit()


# ─── Text extraction helpers ──────────────────────────────────────────────────

def extract_text_from_pdf(
    file_bytes: bytes,
    page_start: int | None = None,
    page_end: int | None = None,
) -> tuple[str, int]:
    """Extract text from a PDF. Returns (text, total_page_count)."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            page_count = len(pdf.pages)
            if page_start is None or page_end is None:
                if page_count > MAX_PDF_PAGES:
                    raise ValueError(
                        f"PDF has {page_count} pages (max {MAX_PDF_PAGES}). "
                        "Please upload a shorter document or select a page range."
                    )
                page_start = 1
                page_end = page_count

            if page_start < 1 or page_end < page_start or page_end > page_count:
                raise ValueError(
                    f"Invalid page range {page_start}-{page_end} for PDF with {page_count} pages."
                )

            if (page_end - page_start + 1) > MAX_PDF_PAGES:
                raise ValueError(
                    f"Selected page range {page_start}-{page_end} exceeds max {MAX_PDF_PAGES} pages per chunk."
                )

            text_parts = []
            for page in pdf.pages[page_start - 1:page_end]:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
            return "\n\n".join(text_parts), page_count
    except ImportError:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from a DOCX file."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")


def extract_text_from_csv_xlsx(file_bytes: bytes, filename: str) -> str:
    """
    For CSV/XLSX: convert to a readable text representation.
    Returns the entire table as tab-separated text so the Critic can reason about it.
    """
    try:
        import pandas as pd
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            excel_engine = "xlrd" if filename.lower().endswith(".xls") else "openpyxl"
            df = pd.read_excel(io.BytesIO(file_bytes), engine=excel_engine)
        # Represent as text: header + rows
        lines = ["\t".join(str(c) for c in df.columns)]
        for _, row in df.iterrows():
            lines.append("\t".join(str(v) for v in row.values))
        return "\n".join(lines)
    except ImportError:
        raise RuntimeError("Spreadsheet dependencies missing. Run: pip install pandas openpyxl xlrd")


def _normalize_column_name(value: str) -> str:
    lowered = str(value or "").strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
    return lowered.strip("_")


def _build_template_column_map(columns: list[str]) -> dict[str, str]:
    aliases = {
        "type": ["type", "question_type", "q_type", "questiontype"],
        "text": ["text", "question", "question_text", "prompt", "question_prompt"],
        "difficulty": ["difficulty", "level"],
        "category": ["category", "topic", "domain", "skill"],
        "tags": ["tags", "tag", "keywords", "keyword"],
        "options": ["options", "choices", "answers", "mcq_options"],
        "correct_answer": [
            "correct_answer",
            "answer",
            "correct",
            "correct_option",
            "answer_index",
            "correct_index",
        ],
        "evidence": ["evidence", "source_evidence", "source"],
        "reference_answer": ["reference_answer", "reference", "model_answer", "expected_answer"],
        "explanation": ["explanation", "rationale", "reasoning"],
        "rubric": ["rubric", "grading_rubric", "scoring_rubric"],
        "max_words": ["max_words", "word_limit", "max_word_count"],
    }

    normalized_to_original: dict[str, str] = {}
    for col in columns:
        normalized_to_original[_normalize_column_name(col)] = col

    mapped: dict[str, str] = {}
    for canonical, alias_list in aliases.items():
        for alias in alias_list:
            key = _normalize_column_name(alias)
            if key in normalized_to_original:
                mapped[canonical] = normalized_to_original[key]
                break

    return mapped


def _value_to_text(value: object) -> str:
    if value is None:
        return ""
    try:
        import pandas as pd
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return str(value).strip()


def _parse_question_type(raw_value: object) -> str:
    raw = _value_to_text(raw_value).lower().replace("-", " ").replace("_", " ")
    if raw in {"mcq", "multiple choice", "multiplechoice", "true false", "true/false"}:
        return "mcq"
    if raw in {"essay", "open ended", "open-ended", "long answer"}:
        return "essay"
    if raw in {"code", "coding", "programming"}:
        return "code"
    return "essay"


def _parse_difficulty(raw_value: object) -> str:
    value = _value_to_text(raw_value).capitalize()
    if value in {"Easy", "Medium", "Hard"}:
        return value
    return "Medium"


def _parse_tags(raw_value: object) -> list[str]:
    text = _value_to_text(raw_value)
    if not text:
        return []
    parts = re.split(r"[,|]", text)
    return [p.strip() for p in parts if p.strip()]


def _parse_options(raw_value: object) -> list[str]:
    text = _value_to_text(raw_value)
    if not text:
        return []

    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            pass

    if "|" in text:
        parts = text.split("|")
    elif ";" in text:
        parts = text.split(";")
    elif "\n" in text:
        parts = text.splitlines()
    else:
        parts = [text]

    return [p.strip() for p in parts if p.strip()]


def _parse_correct_answer(raw_value: object, options: list[str]) -> int | None:
    text = _value_to_text(raw_value)
    if not text:
        return None

    if re.fullmatch(r"\d+", text):
        idx = int(text)
        return idx if 0 <= idx < len(options) else None

    if re.fullmatch(r"[A-Za-z]", text):
        idx = ord(text.upper()) - ord("A")
        return idx if 0 <= idx < len(options) else None

    lowered = text.lower()
    for idx, option in enumerate(options):
        if option.strip().lower() == lowered:
            return idx

    return None

def parse_spreadsheet_template_questions(
    file_bytes: bytes,
    filename: str,
    sheet_name: str | None = None,
    column_mapping_override: dict[str, str] | None = None,
    apply_auto_fixes: bool = False,
) -> tuple[list[dict], list[dict], list[dict], bool]:
    """
    Deterministic parser for EraMatch spreadsheet template.
    Returns (questions, row_errors, auto_fix_actions, deterministic_used).
    deterministic_used=False means required columns were not mapped and caller may fallback to AI.
    """
    try:
        import pandas as pd
    except ImportError:
        logger.warning("[QuestionImport] pandas/openpyxl missing for spreadsheet parsing")
        return [], [], [], False

    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes), dtype=object)
        else:
            excel_engine = "xlrd" if filename.lower().endswith(".xls") else "openpyxl"
            if sheet_name:
                df = pd.read_excel(io.BytesIO(file_bytes), dtype=object, sheet_name=sheet_name, engine=excel_engine)
            else:
                df = pd.read_excel(io.BytesIO(file_bytes), dtype=object, engine=excel_engine)
    except ImportError as exc:
        logger.warning(f"[QuestionImport] Missing Excel parser dependency: {exc}")
        return [], [], [], False
    except Exception as exc:
        logger.warning(f"[QuestionImport] Failed reading spreadsheet for template parsing: {exc}")
        return [], [], [], False

    if df.empty:
        return [], [], [], True

    base_map = _build_template_column_map([str(c) for c in df.columns])
    col_map: dict[str, str] = dict(base_map)

    if column_mapping_override:
        valid_cols = {str(c) for c in df.columns}
        for key, value in column_mapping_override.items():
            if not value:
                continue
            col_name = str(value)
            if col_name in valid_cols:
                col_map[key] = col_name

    if "type" not in col_map or "text" not in col_map:
        return [], [], [], False

    parsed_questions: list[dict] = []
    row_errors: list[dict] = []
    auto_fix_actions: list[dict] = []

    for row_idx, row in enumerate(df.iterrows(), start=2):
        _, row_data = row
        q_text = _value_to_text(row_data.get(col_map["text"]))
        q_type = _parse_question_type(row_data.get(col_map["type"]))

        if not q_text:
            row_errors.append({"row": row_idx, "error": "Question text is empty", "question_type": q_type, "question_text": ""})
            continue

        difficulty = _parse_difficulty(row_data.get(col_map.get("difficulty", "")))
        category = _value_to_text(row_data.get(col_map.get("category", ""))) or "General"
        tags = _parse_tags(row_data.get(col_map.get("tags", "")))

        evidence = _value_to_text(row_data.get(col_map.get("evidence", ""))) or None
        reference_answer = _value_to_text(row_data.get(col_map.get("reference_answer", ""))) or None
        explanation = _value_to_text(row_data.get(col_map.get("explanation", ""))) or None
        rubric = _value_to_text(row_data.get(col_map.get("rubric", ""))) or None

        max_words_value = _value_to_text(row_data.get(col_map.get("max_words", "")))
        max_words: int | None = None
        if max_words_value and re.fullmatch(r"\d+", max_words_value):
            max_words = int(max_words_value)

        options: list[str] | None = None
        correct_answer: int | None = None

        if q_type == "mcq":
            options = _parse_options(row_data.get(col_map.get("options", "")))
            if len(options) < 2:
                if apply_auto_fixes and len(options) == 1:
                    auto_fix_actions.append(
                        {
                            "row": row_idx,
                            "error": "MCQ requires at least 2 options",
                            "fix_applied": "Converted question type to essay due to single option",
                        }
                    )
                    q_type = "essay"
                    options = None
                    correct_answer = None
                else:
                    row_errors.append({
                        "row": row_idx,
                        "error": "MCQ requires at least 2 options",
                        "question_type": q_type,
                        "question_text": q_text[:300],
                    })
                    continue

            if q_type == "mcq":
                correct_answer = _parse_correct_answer(row_data.get(col_map.get("correct_answer", "")), options or [])
                if correct_answer is None:
                    if apply_auto_fixes and options and len(options) >= 2:
                        correct_answer = 0
                        auto_fix_actions.append(
                            {
                                "row": row_idx,
                                "error": "MCQ correct_answer is missing or invalid",
                                "fix_applied": "Set correct_answer to first option (index 0)",
                            }
                        )
                    else:
                        row_errors.append({
                            "row": row_idx,
                            "error": "MCQ correct_answer is missing or invalid",
                            "question_type": q_type,
                            "question_text": q_text[:300],
                        })
                        continue
        elif q_type == "essay":
            if max_words is None:
                max_words = 500

        parsed_questions.append(
            {
                "type": q_type,
                "text": q_text,
                "difficulty": difficulty,
                "category": category,
                "tags": tags,
                "options": options,
                "correct_answer": correct_answer,
                "evidence": evidence,
                "reference_answer": reference_answer,
                "explanation": explanation,
                "rubric": rubric,
                "max_words": max_words,
                "rubric_yes_no_checks": None,
                "needs_review": False,
                "critic_score": 1.0,
                "critic_weighted_score": 1.0,
                "critic_feedback": None,
                "critic_checks": [],
                "retry_count": 0,
            }
        )

    return parsed_questions, row_errors[:500], auto_fix_actions[:500], True


def extract_text(
    file_bytes: bytes,
    filename: str,
    page_start: int | None = None,
    page_end: int | None = None,
) -> tuple[str, str]:
    """
    Auto-detect file type and extract raw text.
    Returns (raw_text, detected_type).
    """
    fname = filename.lower()
    if fname.endswith(".pdf"):
        text, pages = extract_text_from_pdf(file_bytes, page_start=page_start, page_end=page_end)
        return text, "pdf"
    elif fname.endswith(".docx") or fname.endswith(".doc"):
        return extract_text_from_docx(file_bytes), "docx"
    elif fname.endswith(".csv") or fname.endswith(".xlsx") or fname.endswith(".xls"):
        return extract_text_from_csv_xlsx(file_bytes, filename), "spreadsheet"
    elif fname.endswith(".md") or fname.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="replace"), "text"
    else:
        # Attempt raw text decode as fallback
        return file_bytes.decode("utf-8", errors="replace"), "unknown"


# ─── AI Service callers ───────────────────────────────────────────────────────

def call_ai_generate(
    raw_text: str,
    num_questions: int,
    context_hint: str,
    recruiter_instructions: str,
    q_types: list,
    mcq_count: int = 0,
    essay_count: int = 0,
    mcq_difficulty: str = "Medium",
    essay_difficulty: str = "Medium",
    mcq_easy_count: int = 0,
    mcq_medium_count: int = 0,
    mcq_hard_count: int = 0,
    essay_easy_count: int = 0,
    essay_medium_count: int = 0,
    essay_hard_count: int = 0,
) -> dict:
    """POST to AI Service /question-import/generate"""
    resp = requests.post(
        f"{AI_SERVICE_URL}/question-import/generate",
        json={
            "raw_text": raw_text,
            "num_questions": num_questions,
            "context_hint": context_hint,
            "recruiter_instructions": recruiter_instructions,
            "question_types": q_types,
            "mcq_count": mcq_count,
            "essay_count": essay_count,
            "mcq_difficulty": mcq_difficulty,
            "essay_difficulty": essay_difficulty,
            "mcq_easy_count": mcq_easy_count,
            "mcq_medium_count": mcq_medium_count,
            "mcq_hard_count": mcq_hard_count,
            "essay_easy_count": essay_easy_count,
            "essay_medium_count": essay_medium_count,
            "essay_hard_count": essay_hard_count,
        },
        timeout=300,  # Generator + Critic per question can take time
    )
    resp.raise_for_status()
    return resp.json()


def call_ai_extract(raw_text: str) -> dict:
    """POST to AI Service /question-import/extract"""
    resp = requests.post(
        f"{AI_SERVICE_URL}/question-import/extract",
        json={"raw_text": raw_text},
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()


# ─── Celery Task ─────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=2, default_retry_delay=10, name="question_import.run")
def run_question_import(
    self,
    job_id: str,
    file_b64: str,
    filename: str,
    org_id: str,
    user_id: str,
    import_type: str,          # "generative" | "extraction" | "csv"
    num_questions: int = 10,
    context_hint: str = "",
    recruiter_instructions: str = "",
    question_types: list | None = None,
    mcq_count: int = 0,
    essay_count: int = 0,
    mcq_difficulty: str = "Medium",
    essay_difficulty: str = "Medium",
    mcq_easy_count: int = 0,
    mcq_medium_count: int = 0,
    mcq_hard_count: int = 0,
    essay_easy_count: int = 0,
    essay_medium_count: int = 0,
    essay_hard_count: int = 0,
    page_start: int | None = None,
    page_end: int | None = None,
    chunk_index: int | None = None,
    chunk_count: int | None = None,
    sheet_name: str | None = None,
    column_mapping_json: str | None = None,
    apply_auto_fixes: bool = False,
):
    """
    Background task that:
    1. Decodes the uploaded file
    2. Enforces size/page limits
    3. Extracts raw text
    4. Calls the AI Service (Generator → Critic Agent loop)
    5. Saves draft questions + critic_stats to the DB
    6. Marks the job as completed (or failed)
    """
    if question_types is None:
        question_types = ["mcq", "essay"]

    chunk_meta = ""
    if chunk_index and chunk_count and page_start and page_end:
        chunk_meta = f" | chunk={chunk_index}/{chunk_count} pages={page_start}-{page_end}"

    logger.info(f"[QuestionImport] Starting job {job_id} | type={import_type} | file={filename}{chunk_meta}")

    conn = None
    try:
        conn = get_db_conn()

        # ── 1. Mark job as processing ─────────────────────────────────────
        update_job_status(conn, job_id, "processing")

        # ── 2. Decode & validate file size ───────────────────────────────
        file_bytes = base64.b64decode(file_b64)
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise ValueError(
                f"File is {len(file_bytes) // (1024*1024):.1f} MB — exceeds the 5 MB limit."
            )

        # ── 3. Extract text ───────────────────────────────────────────────
        raw_text, detected_type = extract_text(
            file_bytes,
            filename,
            page_start=page_start,
            page_end=page_end,
        )

        if len(raw_text) < 50:
            raise ValueError("Extracted text is too short. Please upload a richer document.")

        raw_text = raw_text[:MAX_EXTRACT_CHARS]
        logger.info(f"[QuestionImport] Extracted {len(raw_text)} chars from {detected_type}")

        # ── 4. Build draft questions ───────────────────────────────────────
        if import_type == "generative":
            ai_result = call_ai_generate(
                raw_text,
                num_questions,
                context_hint,
                recruiter_instructions,
                question_types,
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
            )
            questions = ai_result.get("questions", [])
            critic_stats = ai_result.get("critic_stats", {})
        elif import_type == "csv":
            column_mapping: dict[str, str] | None = None
            if column_mapping_json:
                try:
                    parsed_mapping = json.loads(column_mapping_json)
                    if isinstance(parsed_mapping, dict):
                        column_mapping = {
                            str(k): str(v)
                            for k, v in parsed_mapping.items()
                            if v is not None and str(v).strip()
                        }
                except Exception:
                    column_mapping = None

            questions, row_errors, auto_fix_actions, deterministic_used = parse_spreadsheet_template_questions(
                file_bytes,
                filename,
                sheet_name=sheet_name,
                column_mapping_override=column_mapping,
                apply_auto_fixes=bool(apply_auto_fixes),
            )

            if deterministic_used:
                logger.info(
                    f"[QuestionImport] job={job_id} spreadsheet parsed deterministically with {len(questions)} question(s), row_errors={len(row_errors)}"
                )
                critic_stats = {
                    "approved": len(questions),
                    "flagged": 0,
                    "rejected": 0,
                    "total_retries": 0,
                    "row_error_count": len(row_errors),
                    "row_errors": row_errors,
                    "auto_fix_enabled": bool(apply_auto_fixes),
                    "auto_fix_count": len(auto_fix_actions),
                    "auto_fix_actions": auto_fix_actions,
                    "sheet_name": sheet_name,
                }
            else:
                logger.info(f"[QuestionImport] job={job_id} spreadsheet template columns not detected, falling back to AI mapping")
                ai_result = call_ai_extract(raw_text)
                questions = ai_result.get("questions", [])
                critic_stats = ai_result.get("critic_stats", {})
        else:
            # "extraction" goes through extract endpoint
            ai_result = call_ai_extract(raw_text)
            questions = ai_result.get("questions", [])
            critic_stats = ai_result.get("critic_stats", {})

        total_generated = len(questions)
        total_flagged = critic_stats.get("flagged", 0) + critic_stats.get("rejected", 0)

        logger.info(
            f"[QuestionImport] job={job_id} generated={total_generated} flagged={total_flagged}"
        )

        # ── 5. Save to DB ──────────────────────────────────────────────────
        update_job_status(
            conn,
            job_id,
            "completed",
            draft_questions=json.dumps(questions),
            critic_stats=json.dumps(critic_stats),
            total_generated=total_generated,
            total_flagged=total_flagged,
            completed_at=datetime.now(timezone.utc),
        )

        return {"job_id": job_id, "status": "completed", "total_generated": total_generated}

    except Exception as exc:
        logger.error(f"[QuestionImport] job={job_id} FAILED: {exc}")
        if conn:
            try:
                update_job_status(
                    conn,
                    job_id,
                    "failed",
                    error_message=str(exc)[:1000],
                    completed_at=datetime.now(timezone.utc),
                )
            except Exception:
                pass
        if isinstance(exc, ValueError):
            raise
        raise self.retry(exc=exc)
    finally:
        if conn:
            conn.close()
