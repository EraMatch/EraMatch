from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
import json
from pathlib import Path

from app.api.deps import get_db, get_current_user
from app.models import InterviewResponse, OngoingInterview, CandidateApplication, CandidateProfile, QuestionImportJob

router = APIRouter(prefix="/background-tasks", tags=["Background Tasks"])

DEBUG_LOG_PATH = Path("logs/video_processing_debug.json")

@router.get("/")
async def get_background_tasks(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get a list of recent background tasks — both video analysis and question import jobs.
    """
    tasks = []

    # ── Video analysis tasks ──────────────────────────────────────────────────
    try:
        video_query = (
            select(
                InterviewResponse.response_id,
                InterviewResponse.processing_status,
                InterviewResponse.answered_at,
                InterviewResponse.question_text,
                CandidateProfile.full_name.label("candidate_name")
            )
            .join(OngoingInterview, InterviewResponse.session_id == OngoingInterview.session_id)
            .join(CandidateApplication, OngoingInterview.application_id == CandidateApplication.id)
            .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
            .order_by(desc(InterviewResponse.answered_at))
            .limit(limit)
        )
        video_result = await db.execute(video_query)
        for row in video_result.all():
            tasks.append({
                "id": str(row.response_id),
                "status": row.processing_status,
                "type": "Video Analysis",
                "task_category": "video",
                "candidate_name": row.candidate_name,
                "source_filename": None,
                "question": row.question_text[:50] + "..." if row.question_text else "N/A",
                "timestamp": row.answered_at.isoformat() if row.answered_at else None,
                "total_generated": None,
                "total_flagged": None,
                "total_approved": None,
            })
    except Exception:
        pass  # Video table may not have matching rows — don't fail the whole endpoint

    # ── Question import jobs ──────────────────────────────────────────────────
    try:
        import_query = (
            select(QuestionImportJob)
            .where(QuestionImportJob.organization_id == current_user.organization_id)
            .order_by(desc(QuestionImportJob.created_at))
            .limit(limit)
        )
        import_result = await db.execute(import_query)
        for job in import_result.scalars().all():
            type_label = {
                "generative": "Question Import (Generative)",
                "extraction": "Question Import (Extraction)",
                "csv": "Question Import (CSV/Excel)",
            }.get(job.import_type, "Question Import")

            tasks.append({
                "id": str(job.id),
                "status": job.status,
                "type": type_label,
                "task_category": "question_import",
                "candidate_name": None,
                "source_filename": job.source_filename,
                "question": job.source_filename or "Uploaded file",
                "timestamp": job.created_at.isoformat() if job.created_at else None,
                "total_generated": job.total_generated,
                "total_flagged": job.total_flagged,
                "total_approved": job.total_approved,
                "import_job_id": str(job.id),
            })
    except Exception:
        pass

    # Sort all tasks by timestamp descending
    tasks.sort(key=lambda t: t.get("timestamp") or "", reverse=True)
    return tasks[:limit]


@router.get("/{task_id}/logs")
async def get_task_logs(task_id: str, current_user = Depends(get_current_user)):
    """
    Get detailed logs for a specific background task.
    """
    if not DEBUG_LOG_PATH.exists():
        return {"logs": []}
        
    try:
        content = DEBUG_LOG_PATH.read_text()
        if not content:
            return {"logs": []}
            
        logs = json.loads(content)
        # Filter logs by response_id
        task_logs = [
            log for log in logs 
            if log.get("data", {}).get("response_id") == task_id
        ]
        return {"logs": task_logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading logs: {str(e)}")
