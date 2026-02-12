"""
Monitoring endpoints for interview responses and AI evaluation results.
Updated to use cloud Supabase schema (candidate_profiles, ongoing_interviews, interview_responses).
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from typing import List
from pydantic import BaseModel
from datetime import datetime

from app.api.deps import DbSession, CurrentCandidate

router = APIRouter(prefix="/interview/monitoring", tags=["monitoring"])


class InterviewResponseDTO(BaseModel):
    id: str
    candidate_name: str
    candidate_email: str
    question_number: int
    question_text: str
    video_url: str | None
    transcription: str | None
    ai_score: float | None
    ai_feedback: str | None
    processing_status: str
    submitted_at: datetime

    class Config:
        from_attributes = True


class CandidateProgressDTO(BaseModel):
    candidate_id: str
    candidate_name: str
    candidate_email: str
    total_questions: int
    completed_questions: int
    average_score: float | None
    status: str
    last_updated: datetime

    class Config:
        from_attributes = True


@router.get("/candidates", response_model=List[CandidateProgressDTO])
async def get_candidates_progress(session: DbSession):
    """Get only candidates who have started an interview session - real data only."""
    
    result = await session.execute(
        text("""
            WITH latest_sessions AS (
                SELECT DISTINCT ON (cp.candidate_id)
                    oi.session_id,
                    cp.candidate_id,
                    cp.full_name,
                    cp.email,
                    oi.status,
                    COALESCE(oi.completed_at, oi.started_at) as last_updated
                FROM ongoing_interviews oi
                JOIN candidate_applications ca ON oi.application_id = ca.application_id
                JOIN candidate_profiles cp ON ca.candidate_id = cp.candidate_id
                WHERE (cp.is_deleted = false OR cp.is_deleted IS NULL)
                ORDER BY cp.candidate_id, COALESCE(oi.completed_at, oi.started_at) DESC NULLS LAST
            )
            SELECT 
                ls.candidate_id::text,
                ls.full_name,
                ls.email,
                (SELECT COUNT(*) FROM interview_responses ir 
                 WHERE ir.session_id = ls.session_id) as completed_questions,
                3 as total_questions,
                (SELECT AVG(ir.ai_score) FROM interview_responses ir 
                 WHERE ir.session_id = ls.session_id AND ir.ai_score IS NOT NULL) as average_score,
                ls.status as status,
                ls.last_updated
            FROM latest_sessions ls
            ORDER BY ls.last_updated DESC NULLS LAST
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    
    return [
        CandidateProgressDTO(
            candidate_id=str(row[0]),
            candidate_name=row[1] or "Unknown",
            candidate_email=row[2] or "",
            completed_questions=row[3] or 0,
            total_questions=row[4],
            average_score=float(row[5]) if row[5] else None,
            status=row[6] or "in_progress",
            last_updated=row[7] or datetime.utcnow()
        )
        for row in rows
    ]


@router.get("/responses/{candidate_id}", response_model=List[InterviewResponseDTO])
async def get_candidate_responses(candidate_id: str, session: DbSession):
    """Get all interview responses for a specific candidate - using cloud schema."""
    
    result = await session.execute(
        text("""
            SELECT 
                ir.response_id::text,
                cp.full_name,
                cp.email,
                ir.question_order,
                ir.question_text,
                ir.video_url,
                ir.transcript,
                ir.ai_score,
                ir.ai_feedback::text,
                COALESCE(ir.processing_status, 'pending') as processing_status,
                ir.answered_at
            FROM interview_responses ir
            JOIN ongoing_interviews oi ON ir.session_id = oi.session_id
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            JOIN candidate_profiles cp ON ca.candidate_id = cp.candidate_id
            WHERE cp.candidate_id = :candidate_id
            ORDER BY ir.question_order ASC
        """),
        {"candidate_id": candidate_id}
    )
    rows = result.fetchall()
    
    return [
        InterviewResponseDTO(
            id=str(row[0]),
            candidate_name=row[1] or "Unknown",
            candidate_email=row[2] or "",
            question_number=row[3],
            question_text=row[4] or "",
            video_url=row[5],
            transcription=row[6],
            ai_score=float(row[7]) if row[7] else None,
            ai_feedback=row[8],
            processing_status=row[9],
            submitted_at=row[10] or datetime.utcnow()
        )
        for row in rows
    ]
