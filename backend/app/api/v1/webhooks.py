from fastapi import APIRouter, Request, HTTPException, Depends, Header
from pydantic import BaseModel
import logging

from app.api.deps import get_db
from sqlmodel.ext.asyncio.session import AsyncSession
from app.services.cv_ingestion import CVIngestionService
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

class WebhookCVParsePayload(BaseModel):
    tenant_id: str
    job_id: str
    file_path: str
    status: str
    parsed_data: dict | None = None
    error: str | None = None
    source: str = "upload"

async def verify_webhook_secret(x_webhook_secret: str = Header(None)):
    backend_secret = settings.WEBHOOK_SECRET or ""
    incoming_secret = x_webhook_secret or ""

    # If no secret is configured on the backend, allow through (dev/insecure mode)
    if not backend_secret:
        allow_insecure = getattr(settings, "ALLOW_INSECURE_WEBHOOKS", False)
        env = getattr(settings, "ENV", "").lower()
        debug = getattr(settings, "DEBUG", False)
        if allow_insecure or env == "development" or debug:
            return True
        raise HTTPException(status_code=401, detail="Webhook secret not configured")

    if incoming_secret != backend_secret:
        logger.warning(f"Webhook secret mismatch: got={repr(incoming_secret)} expected={repr(backend_secret)}")
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    return True

@router.post("/cv-parsed", dependencies=[Depends(verify_webhook_secret)])
async def handle_cv_parsed_webhook(
    payload: WebhookCVParsePayload,
    db: AsyncSession = Depends(get_db)
):
    """
    Called by AI-service when CV parsing finishes (success or failure).
    """
    logger.info(f"Received CV parse webhook for file: {payload.file_path}, status: {payload.status}")
    
    ingestion_service = CVIngestionService(db)
    
    try:
        await ingestion_service.handle_async_parse_result(
            tenant_id=payload.tenant_id,
            job_id=payload.job_id,
            file_path=payload.file_path,
            status=payload.status,
            parsed_data=payload.parsed_data,
            error=payload.error,
            source=payload.source,
        )
        return {"message": "Webhook processed successfully"}
    except Exception as exc:
        logger.error(f"Error processing webhook: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
