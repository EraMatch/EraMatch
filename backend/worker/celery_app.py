"""
Celery application configuration.
"""
from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "eramatch",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "worker.tasks.video", 
        "worker.tasks.question_import", 
        "worker.tasks.github_analysis",
        "worker.tasks.cv_ingestion",
        "worker.tasks.cv_parsing",
    ],
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes max per task
    worker_prefetch_multiplier=1,
)

from celery.signals import worker_ready

@worker_ready.connect
def recover_schedules_on_startup(sender, **kwargs):
    """Trigger recovery of missed Drive API syncs when the worker starts."""
    from worker.tasks.cv_ingestion import recover_missed_schedules
    recover_missed_schedules.delay()
