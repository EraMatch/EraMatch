"""
Celery task for AI-powered CV parsing.

This task:
1) Extracts text from PDF using PyMuPDF locally in the worker.
2) Calls ai-service /cv-parsing/parse via HTTP for AI extraction.
3) Stores parsed data in CVAnalysis using CVParsingWorkerService (SQLAlchemy).
4) Backfills CandidateProfile with extracted contact info.
"""
import logging
import os
from uuid import UUID

import requests

from app.core.config import settings
from app.db.session import sync_session_factory
from app.services.cv_parsing import CVParsingWorkerService
from worker.celery_app import celery_app

logger = logging.getLogger(__name__)

AI_SERVICE_URL = settings.AI_SERVICE_URL or os.environ.get("AI_SERVICE_URL", "http://localhost:8001")


# =============================================================================
# TEXT EXTRACTION (runs in worker, not in ai-service)
# =============================================================================

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract raw text from a PDF file using PyMuPDF.

    Text extraction is lightweight and runs directly in the worker
    so we don't need to transfer binary file data over HTTP.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError(
            "PyMuPDF is required for CV text extraction. "
            "Install it with: pip install PyMuPDF"
        )

    doc = fitz.open(file_path)
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    doc.close()
    return "\n".join(text_parts).strip()


# =============================================================================
# CELERY TASK
# =============================================================================

@celery_app.task(bind=True, name="cv_parsing.parse_cv", max_retries=2, default_retry_delay=30)
def parse_cv(self, application_id: str, organization_id: str, file_path: str):
    """
    Parse a single CV file and store structured results.

    Args:
        application_id: The CandidateApplication UUID (string).
        organization_id: The Organization UUID (string).
        file_path: Absolute path to the saved PDF file.
    """
    logger.info("[CVParsing] Starting task for application %s", application_id)

    try:
        # 1. Extract text from PDF (runs locally in worker)
        text = extract_text_from_pdf(file_path)
        if not text or len(text.strip()) < 50:
            logger.warning("[CVParsing] Text too short for application %s, skipping", application_id)
            return

        logger.info("[CVParsing] Extracted %d chars from %s", len(text), os.path.basename(file_path))

        # 2. Call ai-service for structured parsing
        resp = requests.post(
            f"{AI_SERVICE_URL}/cv-parsing/parse",
            json={"cv_text": text},
            timeout=120,
        )
        resp.raise_for_status()
        parsed_data = resp.json()

        logger.info(
            "[CVParsing] AI service returned: name=%s, email=%s, skills=%d",
            parsed_data.get("full_name"),
            parsed_data.get("email"),
            len(parsed_data.get("skills", [])),
        )

        # 3. Derive fields for CVAnalysis columns
        skills_list = [
            s["skill_name"]
            for s in parsed_data.get("skills", [])
            if isinstance(s, dict) and s.get("skill_name")
        ]
        experience_years = parsed_data.get("years_of_experience")

        # 4. Persist results in the database using SQLAlchemy
        with sync_session_factory() as session:
            service = CVParsingWorkerService(session)
            
            service.upsert_cv_analysis(
                UUID(application_id), 
                UUID(organization_id), 
                file_path, 
                parsed_data, 
                skills_list, 
                experience_years
            )
            
            service.backfill_candidate_profile(
                UUID(application_id), 
                parsed_data
            )

        logger.info("[CVParsing] Task completed for application %s", application_id)

        return {
            "application_id": application_id,
            "status": "completed",
            "full_name": parsed_data.get("full_name"),
            "skills_count": len(skills_list),
        }

    except Exception as exc:
        logger.error("[CVParsing] Task failed for application %s: %s", application_id, exc)

        # Don't retry on client errors from ai-service (4xx)
        if isinstance(exc, requests.HTTPError):
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if isinstance(status_code, int) and 400 <= status_code < 500 and status_code != 429:
                raise

        raise self.retry(exc=exc)
