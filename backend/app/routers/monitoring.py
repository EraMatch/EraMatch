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
    """Get only candidates who have actual interview responses - real data only."""

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
                (SELECT CASE
                    WHEN jsonb_typeof(aic.questions) = 'array' THEN jsonb_array_length(aic.questions)
                    WHEN jsonb_typeof(aic.questions->'questions') = 'array' THEN jsonb_array_length(aic.questions->'questions')
                    ELSE 5
                 END
                 FROM ai_interview_configs aic
                 WHERE aic.config_id = (
                     SELECT gps.config_id FROM group_pipeline_stages gps
                     JOIN candidate_applications ca2 ON ca2.group_id = gps.group_id
                     WHERE ca2.candidate_id = ls.candidate_id
                       AND gps.stage_type = 'ai_interview'
                     LIMIT 1
                 )) as total_questions,
                (SELECT AVG(ir.ai_score) FROM interview_responses ir
                 WHERE ir.session_id = ls.session_id AND ir.ai_score IS NOT NULL) as average_score,
                ls.status as status,
                ls.last_updated
            FROM latest_sessions ls
            WHERE ls.status IN ('completed', 'in_progress', 'not_started')
               OR (SELECT COUNT(*) FROM interview_responses ir WHERE ir.session_id = ls.session_id) > 0
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
            total_questions=max(row[4] or 3, 1),  # fallback to 3, ensure >= 1 to avoid div by zero
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


# =============================================================================
# monitoring for debugging in dev

class AssessmentCandidateDTO(BaseModel):
    candidate_id: str
    candidate_name: str
    candidate_email: str
    assessment_title: str
    total_questions: int
    answered_questions: int
    total_score: float | None
    max_score: int | None
    percentage: float | None
    status: str
    started_at: datetime | None
    submitted_at: datetime | None

    class Config:
        from_attributes = True


class AssessmentAnswerDTO(BaseModel):
    answer_id: str
    question_text: str
    question_type: str
    answer_data: dict
    is_correct: bool | None
    points_earned: float | None
    points_max: int
    time_spent_seconds: int | None
    answered_at: datetime | None

    class Config:
        from_attributes = True


@router.get("/assessment-candidates", response_model=List[AssessmentCandidateDTO])
async def get_assessment_candidates_progress(session: DbSession):
    """Get candidates who have actual assessment activity (answered questions)."""

    result = await session.execute(
        text("""
            WITH latest_sessions AS (
                -- For each candidate, pick the session with the most recent activity
                SELECT DISTINCT ON (ca.candidate_id)
                    ca.candidate_id,
                    oa.session_id,
                    oa.assessment_id,
                    oa.max_points,
                    oa.total_score,
                    oa.total_points,
                    oa.status,
                    oa.started_at,
                    oa.submitted_at
                FROM ongoing_assessments oa
                JOIN candidate_applications ca ON oa.application_id = ca.application_id
                WHERE (
                    (SELECT COUNT(*) FROM candidate_answers ca2 WHERE ca2.session_id = oa.session_id) > 0
                    OR oa.status = 'in_progress'
                )
                ORDER BY ca.candidate_id, COALESCE(oa.submitted_at, oa.started_at) DESC NULLS LAST
            )
            SELECT
                ls.candidate_id::text,
                cp.full_name,
                cp.email,
                a.title as assessment_title,
                ls.max_points,
                ls.total_score,
                ls.total_points,
                ls.status,
                ls.started_at,
                ls.submitted_at,
                ls.session_id::text,
                (SELECT COUNT(*) FROM candidate_answers ca2
                 WHERE ca2.session_id = ls.session_id) as answered_questions,
                (SELECT CASE
                    WHEN jsonb_typeof(oa2.assigned_questions->'questions') = 'array'
                    THEN jsonb_array_length(oa2.assigned_questions->'questions')
                    ELSE 0
                 END
                 FROM ongoing_assessments oa2
                 WHERE oa2.session_id = ls.session_id
                 LIMIT 1) as total_questions
            FROM latest_sessions ls
            JOIN candidate_profiles cp ON ls.candidate_id = cp.candidate_id
            JOIN assessments a ON ls.assessment_id = a.assessment_id
            WHERE (cp.is_deleted = false OR cp.is_deleted IS NULL)
            ORDER BY COALESCE(ls.submitted_at, ls.started_at) DESC NULLS LAST
            LIMIT 50
        """)
    )
    rows = result.mappings().all()

    return [
        AssessmentCandidateDTO(
            candidate_id=row["candidate_id"],
            candidate_name=row["full_name"] or "Unknown",
            candidate_email=row["email"] or "",
            assessment_title=row["assessment_title"] or "",
            total_questions=row["total_questions"] or 0,
            answered_questions=row["answered_questions"] or 0,
            total_score=float(row["total_points"]) if row["total_points"] else None,
            max_score=row["max_points"],
            percentage=float(row["total_score"]) if row["total_score"] else None,
            status=row["status"] or "not_started",
            started_at=row["started_at"],
            submitted_at=row["submitted_at"],
        )
        for row in rows
    ]


@router.get("/assessment-responses/{candidate_id}", response_model=List[AssessmentAnswerDTO])
async def get_assessment_responses(candidate_id: str, session: DbSession):
    """Get assessment answers for a specific candidate — only from their latest session."""

    result = await session.execute(
        text("""
            WITH latest_session AS (
                SELECT oa.session_id
                FROM ongoing_assessments oa
                JOIN candidate_applications ca ON oa.application_id = ca.application_id
                WHERE ca.candidate_id = :candidate_id
                ORDER BY COALESCE(oa.submitted_at, oa.started_at) DESC NULLS LAST
                LIMIT 1
            ),
            latest_answers AS (
                SELECT DISTINCT ON (ans.question_id)
                    ans.answer_id,
                    ans.question_id,
                    ans.answer_data,
                    ans.is_correct,
                    ans.points_earned,
                    ans.points_max,
                    ans.time_spent_seconds,
                    ans.answered_at
                FROM candidate_answers ans
                JOIN latest_session ls ON ans.session_id = ls.session_id
                ORDER BY ans.question_id, ans.answered_at DESC
            )
            SELECT
                la.answer_id::text,
                qb.question_text,
                qb.question_type,
                la.answer_data,
                la.is_correct,
                la.points_earned,
                la.points_max,
                la.time_spent_seconds,
                la.answered_at,
                qb.question_config,
                qb.correct_answer
            FROM latest_answers la
            JOIN question_bank qb ON la.question_id = qb.question_id
            ORDER BY la.answered_at ASC
        """),
        {"candidate_id": candidate_id}
    )
    rows = result.mappings().all()

    # Build response with MCQ options and reference answers included
    responses = []
    for row in rows:
        answer_data = row["answer_data"] or {}
        q_config = row["question_config"] or {}
        
        # Add MCQ options to answer_data for frontend display
        if row["question_type"] == "mcq":
            options = q_config.get("options", [])
            # Normalize options to array of strings
            normalized_options = []
            for opt in options:
                if isinstance(opt, str):
                    normalized_options.append(opt)
                elif isinstance(opt, dict):
                    normalized_options.append(opt.get("text", str(opt)))
                else:
                    normalized_options.append(str(opt))
            answer_data = {**answer_data, "_mcq_options": normalized_options}
        
        # Add reference answer and rubric for essay questions
        if row["question_type"] == "essay":
            correct_answer = row["correct_answer"] or {}
            reference = correct_answer.get("reference_answer")
            rubric = q_config.get("rubric")  # Rubric is in question_config
            
            if reference:
                answer_data = {**answer_data, "_reference_answer": reference}
            if rubric:
                answer_data = {**answer_data, "_rubric": rubric}
        
        responses.append(AssessmentAnswerDTO(
            answer_id=row["answer_id"],
            question_text=row["question_text"] or "",
            question_type=row["question_type"] or "",
            answer_data=answer_data,
            is_correct=row["is_correct"],
            points_earned=float(row["points_earned"]) if row["points_earned"] else None,
            points_max=row["points_max"] or 0,
            time_spent_seconds=row["time_spent_seconds"],
            answered_at=row["answered_at"],
        ))
    
    return responses
