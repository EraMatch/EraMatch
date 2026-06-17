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
from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import sync_session_factory
from app.models import CVAnalysis, CandidateApplication, QAGProcessingJob
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
# HELPERS
# =============================================================================

def _maybe_trigger_qag_recompute(application_id: str, organization_id: str) -> None:
    """Trigger QAG recompute for a position when all its CVs have been parsed."""
    from datetime import datetime, timezone

    with sync_session_factory() as session:
        app = session.execute(
            select(CandidateApplication).where(CandidateApplication.id == UUID(application_id))
        ).scalars().first()
        if not app:
            return

        position_id = app.position_id

        # Count applications that still have no analyzed CVAnalysis row
        unanalyzed_count = session.execute(
            select(func.count(CandidateApplication.id))
            .outerjoin(CVAnalysis, CVAnalysis.application_id == CandidateApplication.id)
            .where(
                CandidateApplication.position_id == position_id,
                CandidateApplication.organization_id == UUID(organization_id),
                CandidateApplication.is_deleted == False,
                CVAnalysis.analyzed_at.is_(None),
            )
        ).scalar() or 0

        if unanalyzed_count > 0:
            return  # Not all CVs done yet

        total_apps = session.execute(
            select(func.count(CandidateApplication.id))
            .where(
                CandidateApplication.position_id == position_id,
                CandidateApplication.organization_id == UUID(organization_id),
                CandidateApplication.is_deleted == False,
            )
        ).scalar() or 0

        if total_apps == 0:
            return

        # Skip if a QAG job is already running for this position
        running = session.execute(
            select(QAGProcessingJob).where(
                QAGProcessingJob.position_id == position_id,
                QAGProcessingJob.status.in_(["pending", "processing"]),
            )
        ).scalars().first()
        if running:
            return

        job = QAGProcessingJob(
            organization_id=UUID(organization_id),
            position_id=position_id,
            created_by_user_id=None,
            job_type="qag_resume_correction",
            status="processing",
            total_items=int(total_apps),
            processed_items=0,
            started_at=datetime.now(timezone.utc),
        )
        session.add(job)
        session.commit()
        session.refresh(job)

        celery_app.send_task(
            "qag.recompute_position_prescores",
            kwargs={
                "position_id": str(position_id),
                "organization_id": str(organization_id),
                "user_id": "system",
                "job_id": str(job.id),
            },
        )
        logger.info(
            "[CVParsing] Auto-triggered QAG recompute for position %s (job %s, %d candidates)",
            position_id, job.id, total_apps,
        )


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

    # Auto-trigger QAG recompute when this is the last CV parsed for the position
    try:
        _maybe_trigger_qag_recompute(application_id, organization_id)
    except Exception as _qag_exc:
        logger.warning("[CVParsing] QAG auto-trigger check failed for %s: %s", application_id, _qag_exc)
