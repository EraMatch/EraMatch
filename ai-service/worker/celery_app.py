import os
from celery import Celery
from config import settings

# Initialize Celery
# Note: we use broker and result_backend from settings, which point to the AI-service's Redis DB (e.g. DB 1)
celery_app = Celery(
    "ai_service_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["worker.tasks.cv_parsing_task"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
