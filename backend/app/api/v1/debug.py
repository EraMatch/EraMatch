"""
Debug endpoints for developer monitoring.

Provides access to Celery task logs and processing results.
"""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/debug", tags=["Debug"])

DEBUG_LOG_PATH = Path("logs/video_processing_debug.json")


@router.get("/video-processing")
async def get_video_processing_logs(limit: int = 20):
    """
    Get recent video processing logs.
    
    Shows transcription and evaluation results for developer debugging.
    """
    if not DEBUG_LOG_PATH.exists():
        return {"logs": [], "message": "No processing logs yet"}
    
    try:
        logs = json.loads(DEBUG_LOG_PATH.read_text())
        return {
            "logs": logs[-limit:],
            "total": len(logs),
            "log_path": str(DEBUG_LOG_PATH.absolute()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading logs: {str(e)}")


@router.get("/video-processing/{response_id}")
async def get_response_logs(response_id: str):
    """
    Get processing logs for a specific response.
    """
    if not DEBUG_LOG_PATH.exists():
        return {"logs": [], "message": "No processing logs yet"}
    
    try:
        logs = json.loads(DEBUG_LOG_PATH.read_text())
        filtered = [log for log in logs if log.get("data", {}).get("response_id") == response_id]
        return {
            "response_id": response_id,
            "logs": filtered,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading logs: {str(e)}")


@router.delete("/video-processing")
async def clear_logs():
    """Clear all processing logs."""
    if DEBUG_LOG_PATH.exists():
        DEBUG_LOG_PATH.write_text("[]")
    return {"message": "Logs cleared"}
