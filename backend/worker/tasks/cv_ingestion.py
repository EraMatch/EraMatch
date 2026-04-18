import logging
from uuid import UUID

from app.db.session import sync_session_factory
from app.services.cv_ingestion import CVIngestionWorkerService
from worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="cv_ingestion.process_zip")
def process_zip_ingestion(self, job_id: str, organization_id: str, position_id: str, zip_content: str):
    """Processes an uploaded ZIP file of CVs using synchronous psycopg2."""
    logger.info(f"Starting ZIP ingestion task for job {job_id}")
    with sync_session_factory() as session:
        try:
            service = CVIngestionWorkerService(session)
            service.process_zip_ingestion(
                UUID(job_id), 
                UUID(organization_id), 
                UUID(position_id), 
                zip_content
            )
        except Exception as e:
            logger.exception(f"ZIP ingestion task failed for job {job_id}: {e}")
            # The service.process_zip_ingestion already handles updating status to 'failed' 
            # for internal errors, but we catch top-level task errors here just in case.


@celery_app.task(bind=True, name="cv_ingestion.run_drive_sync")
def run_drive_ingestion(self, schedule_id: str):
    """Executes a Google Drive ingestion using synchronous psycopg2."""
    logger.info(f"Starting Drive ingestion task for schedule {schedule_id}")
    with sync_session_factory() as session:
        try:
            service = CVIngestionWorkerService(session)
            service.run_drive_ingestion(UUID(schedule_id))
        except Exception as e:
            logger.exception(f"Drive ingestion task failed for schedule {schedule_id}: {e}")


@celery_app.task(name="cv_ingestion.recover_missed_schedules")
def recover_missed_schedules():
    """
    Called on worker startup to re-enqueue any Drive schedules whose
    ETA passed while the Celery worker was down.
    """
    logger.info("Recovering missed schedules (Startup Task)")
    with sync_session_factory() as session:
        try:
            service = CVIngestionWorkerService(session)
            service.recover_missed_schedules()
        except Exception as e:
            logger.exception(f"Failed to recover missed schedules: {e}")

