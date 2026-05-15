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

AI_SERVICE_URL = settings.AI_SERVICE_URL


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

@celery_app.task(bind=True, name="cv_parsing.extract_and_parse_cv", max_retries=2, default_retry_delay=30)
def extract_and_parse_cv(self, file_path: str, organization_id: str, position_id: str, source: str):
    """
    Extract text, then call AI-service's parse-async endpoint.
    """
    logger.info("[CVParsing] Starting extraction for %s", file_path)

    try:
        text = extract_text_from_pdf(file_path)
        if not text or len(text.strip()) < 50:
            logger.warning("[CVParsing] Text too short for %s, skipping", file_path)
            # We can still notify webhook of failure, or just let it die.
            return

        logger.info("[CVParsing] Extracted %d chars from %s", len(text), os.path.basename(file_path))

        # Call ai-service async endpoint
        resp = requests.post(
            f"{AI_SERVICE_URL}/cv-parsing/parse-async",
            json={
                "cv_text": text,
                "tenant_id": organization_id,
                "job_id": position_id,
                "file_path": file_path,
                "source": source
            },
            timeout=30,
        )
        resp.raise_for_status()

        logger.info("[CVParsing] Queued async task in AI service for %s", file_path)
        return {"status": "enqueued"}

    except Exception as exc:
        logger.error("[CVParsing] Extraction failed for %s: %s", file_path, exc)
        if isinstance(exc, requests.HTTPError):
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if isinstance(status_code, int) and 400 <= status_code < 500 and status_code != 429:
                raise
        raise self.retry(exc=exc)

@celery_app.task(bind=True, name="cv_parsing.persist_parsed_data", max_retries=2, default_retry_delay=5)
def persist_parsed_data(self, application_id: str, organization_id: str, file_path: str, parsed_data: dict):
    """
    Save the structured data returned by webhook.
    """
    logger.info("[CVParsing] Persisting parsed data for application %s", application_id)
    try:
        skills_list = [
            s["skill_name"]
            for s in parsed_data.get("skills", [])
            if isinstance(s, dict) and s.get("skill_name")
        ]
        experience_years = parsed_data.get("years_of_experience")

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
        logger.info("[CVParsing] Successfully persisted parsed data for %s", application_id)
    except Exception as exc:
        logger.error("[CVParsing] Persisting failed for %s: %s", application_id, exc)
        raise self.retry(exc=exc)
