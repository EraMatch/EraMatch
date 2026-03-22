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
from datetime import datetime, timezone
from uuid import UUID

import psycopg2
import requests

from worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://localhost:8001")

# File extraction limits
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_PDF_PAGES = 20
MAX_EXTRACT_CHARS = 50_000


# ─── DB helpers (psycopg2 — sync, Celery-safe) ───────────────────────────────

def get_db_conn():
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

def extract_text_from_pdf(file_bytes: bytes) -> tuple[str, int]:
    """Extract text from a PDF. Returns (text, page_count)."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            page_count = len(pdf.pages)
            text_parts = []
            for page in pdf.pages[:MAX_PDF_PAGES]:
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
            df = pd.read_excel(io.BytesIO(file_bytes))
        # Represent as text: header + rows
        lines = ["\t".join(str(c) for c in df.columns)]
        for _, row in df.iterrows():
            lines.append("\t".join(str(v) for v in row.values))
        return "\n".join(lines)
    except ImportError:
        raise RuntimeError("pandas/openpyxl not installed. Run: pip install pandas openpyxl")


def extract_text(file_bytes: bytes, filename: str) -> tuple[str, str]:
    """
    Auto-detect file type and extract raw text.
    Returns (raw_text, detected_type).
    """
    fname = filename.lower()
    if fname.endswith(".pdf"):
        text, pages = extract_text_from_pdf(file_bytes)
        if pages > MAX_PDF_PAGES:
            raise ValueError(
                f"PDF has {pages} pages (max {MAX_PDF_PAGES}). "
                "Please upload a shorter document or select a page range."
            )
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

def call_ai_generate(raw_text: str, num_questions: int, context_hint: str, q_types: list) -> dict:
    """POST to AI Service /question-import/generate"""
    resp = requests.post(
        f"{AI_SERVICE_URL}/question-import/generate",
        json={
            "raw_text": raw_text,
            "num_questions": num_questions,
            "context_hint": context_hint,
            "question_types": q_types,
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
    question_types: list | None = None,
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

    logger.info(f"[QuestionImport] Starting job {job_id} | type={import_type} | file={filename}")

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
        raw_text, detected_type = extract_text(file_bytes, filename)

        if len(raw_text) < 50:
            raise ValueError("Extracted text is too short. Please upload a richer document.")

        raw_text = raw_text[:MAX_EXTRACT_CHARS]
        logger.info(f"[QuestionImport] Extracted {len(raw_text)} chars from {detected_type}")

        # ── 4. Call AI Service ─────────────────────────────────────────────
        if import_type == "generative":
            ai_result = call_ai_generate(raw_text, num_questions, context_hint, question_types)
        else:
            # Both "extraction" and "csv" go through the extract endpoint
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
        raise self.retry(exc=exc)
    finally:
        if conn:
            conn.close()
