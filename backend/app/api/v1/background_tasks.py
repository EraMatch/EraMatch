from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from typing import List, Optional
import json
from pathlib import Path

from app.db.session import get_db
from app.models import InterviewResponse, OngoingInterview, CandidateApplication, CandidateProfile
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/background-tasks", tags=["Background Tasks"])

DEBUG_LOG_PATH = Path("logs/video_processing_debug.json")

@router.get("/")
async def get_background_tasks(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get a list of recent background tasks (interview response processing).
    """
    # Join InterviewResponse with CandidateProfile to get candidate name
    query = (
        select(
            InterviewResponse.response_id,
            InterviewResponse.processing_status,
            InterviewResponse.answered_at,
            InterviewResponse.question_text,
            CandidateProfile.full_name.label("candidate_name")
        )
        .join(OngoingInterview, InterviewResponse.session_id == OngoingInterview.session_id)
        .join(CandidateApplication, OngoingInterview.application_id == CandidateApplication.application_id)
        .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
        .order_by(desc(InterviewResponse.answered_at))
        .limit(limit)
    )
    
    results = db.execute(query).all()
    
    tasks = []
    for row in results:
        tasks.append({
            "id": str(row.response_id),
            "status": row.processing_status,
            "type": "Video Analysis",
            "candidate_name": row.candidate_name,
            "question": row.question_text[:50] + "..." if row.question_text else "N/A",
            "timestamp": row.answered_at.isoformat() if row.answered_at else None
        })
        
    return tasks

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
