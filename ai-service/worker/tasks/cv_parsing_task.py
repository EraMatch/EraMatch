import json
import logging
import httpx
import asyncio
from worker.celery_app import celery_app
from config import settings
from routers.cv_parsing import _load_prompt, _extract_json, _normalize_parsed, CV_PARSING_MODEL, _mock_parse_response
from services.ollama import chat_completion

logger = logging.getLogger(__name__)

async def async_parse_cv_and_webhook(cv_text: str, tenant_id: str, job_id: str, file_path: str, source: str):
    """
    Perform the CV parsing asynchronously and call the backend webhook upon success or failure.
    """
    webhook_payload = {
        "tenant_id": tenant_id,
        "job_id": job_id,
        "file_path": file_path,
        "source": source,
        "status": "failed",
        "parsed_data": None,
        "error": None
    }

    try:
        if settings.USE_MOCK:
            logger.info("CV parsing (async): returning mock response")
            mock_resp = _mock_parse_response(cv_text)
            webhook_payload["status"] = "success"
            webhook_payload["parsed_data"] = mock_resp.model_dump()
        else:
            prompt = _load_prompt("parse", CV_TEXT=cv_text[:30000])
            max_json_retries = 3
            last_json_error = None
            parsed = None

            for json_attempt in range(max_json_retries):
                result = await chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    model=CV_PARSING_MODEL,
                    response_format="json",
                    timeout_seconds=settings.OLLAMA_CV_PARSE_TIMEOUT_SECONDS,
                    host=settings.OLLAMA_LOCAL_HOST,
                )

                try:
                    parsed = _extract_json(result.get("content", ""))
                    break  # Valid JSON
                except (ValueError, json.JSONDecodeError) as json_exc:
                    last_json_error = json_exc
                    logger.warning("CV async parsing invalid JSON attempt %d", json_attempt + 1)
                    if json_attempt < max_json_retries - 1:
                        continue
                    raise ValueError(f"Invalid JSON after {max_json_retries} attempts: {last_json_error}")

            normalized = _normalize_parsed(parsed)
            webhook_payload["status"] = "success"
            webhook_payload["parsed_data"] = normalized
            
    except Exception as exc:
        logger.error(f"Async CV parsing failed for {file_path}: {exc}")
        webhook_payload["status"] = "failed"
        webhook_payload["error"] = str(exc)

    # Call backend webhook
    webhook_url = settings.BACKEND_WEBHOOK_URL
    if not webhook_url:
        logger.error("BACKEND_WEBHOOK_URL is not configured. Cannot send callback.")
        return

    headers = {}
    if settings.WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = settings.WEBHOOK_SECRET

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(webhook_url, json=webhook_payload, headers=headers, timeout=30.0)
            resp.raise_for_status()
            logger.info(f"Webhook notified successfully for {file_path}")
        except Exception as e:
            logger.error(f"Failed to notify webhook: {e}")

@celery_app.task(name="worker.tasks.cv_parsing_task.parse_cv_async", bind=True, max_retries=3)
def parse_cv_async(self, cv_text: str, tenant_id: str, job_id: str, file_path: str, source: str = "upload"):
    """
    Celery task that acts as a wrapper to run the async parsing logic.
    """
    try:
        asyncio.run(async_parse_cv_and_webhook(cv_text, tenant_id, job_id, file_path, source))
    except Exception as exc:
        logger.error(f"parse_cv_async celery task failed: {exc}")
        raise self.retry(exc=exc, countdown=10)
