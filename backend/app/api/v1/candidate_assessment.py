"""
Candidate Assessment API endpoints.

Handles the technical assessment flow:
- Get assessment config (questions)
- Start assessment session (select questions per section, create snapshots)
- Save individual answers (auto-grade MCQ)
- Run code (via Judge0 CE)
- Submit final assessment

Tables used (actual DB schema on gcdvpmqmwagusenewrie):
- group_pipeline_stages       (stage_id PK, group_id, stage_type, stage_order, config_id → assessments, state)
- candidate_pipeline_progress (progress_id PK, application_id, stage_id FK, status, session_id, score, ...)
- assessments                 (assessment_id PK, title, instructions, duration_minutes, passing_score, structure)
- assessment_sections         (section_id PK, assessment_id, section_order, section_title, question_type, variants_to_select, selection_strategy)
- section_question_pool       (pool_entry_id PK, section_id, question_id FK, is_active)
- question_bank               (question_id PK, question_type, question_text, question_config, correct_answer, points)
- candidate_assigned_questions(assignment_id PK, session_id, section_id, pool_entry_id, question_snapshot JSONB, display_order)
- ongoing_assessments         (session_id PK, assessment_id, application_id, organization_id, assigned_questions, status, ...)
- candidate_answers           (answer_id PK, session_id, question_id, question_order, answer_data, is_correct, points_earned, points_max, assignment_id)
"""
import json
import logging
import random
from datetime import datetime, timezone
from uuid import UUID, uuid4
import asyncio
import subprocess
import tempfile
import os
import time as time_module
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text, bindparam
from sqlalchemy.dialects.postgresql import UUID as pgUUID, JSONB
from app.api.deps import CurrentCandidate, DbSession


logger = logging.getLogger(__name__)

AI_SERVICE_URL = "http://localhost:8001"

router = APIRouter(prefix="/assessment", tags=["Candidate Assessment"])


# =============================================================================
# SCHEMAS
# =============================================================================

class AssessmentConfigResponse(BaseModel):
    """Assessment configuration for candidate."""
    assessment_id: str
    title: str
    instructions: str | None
    duration_minutes: int
    passing_score: float
    sections: list[dict]
    stage_id: str          # group_pipeline_stages.stage_id


class StartAssessmentRequest(BaseModel):
    """Request to start assessment session."""
    assessment_id: str
    stage_id: str          # group_pipeline_stages.stage_id


class StartAssessmentResponse(BaseModel):
    """Response after starting session."""
    session_id: str
    questions: list[dict]
    duration_minutes: int
    started_at: str
    message: str
    remaining_seconds: int | None = None
    saved_answers: dict | None = None


class SaveAnswerRequest(BaseModel):
    """Request to save a single answer."""
    session_id: str
    question_id: str
    answer_data: dict
    time_spent_seconds: int | None = None


class SaveAnswerResponse(BaseModel):
    """Response after saving answer."""
    answer_id: str
    is_correct: bool | None = None
    points_earned: float | None = None
    message: str


class RunCodeRequest(BaseModel):
    """Request to run code."""
    code: str
    language: str
    stdin: str | None = None


class RunCodeResponse(BaseModel):
    """Response with code execution result."""
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    status: str
    time: str | None = None
    memory: int | None = None


class SubmitAssessmentRequest(BaseModel):
    """Request to submit the full assessment."""
    session_id: str


class SubmitAssessmentResponse(BaseModel):
    """Response after submitting assessment."""
    total_score: float
    max_score: int
    percentage: float
    passed: bool
    message: str


class RunTestsRequest(BaseModel):
    """Request to run all test cases for a coding question (counts as a trial)."""
    session_id: str
    question_id: str
    code: str
    language: str


class RunTestsResponse(BaseModel):
    """Response with test results and attempt info."""
    attempt_count: int
    max_attempts: int
    visible_results: list[dict]
    all_passed: bool
    hidden_passed: int
    hidden_total: int
    message: str


# =============================================================================
# LANGUAGE MAP FOR PISTON API
# =============================================================================

PISTON_LANGUAGES = {
    "python": "python", "python3": "python",
    "javascript": "javascript", "js": "javascript",
    "node": "javascript", "nodejs": "javascript",
    "java": "java",
    "c": "c",
    "cpp": "c++", "c++": "c++",
    "csharp": "csharp", "c#": "csharp",
    "ruby": "ruby",
    "go": "go",
    "rust": "rust",
    "typescript": "typescript", "ts": "typescript",
}

PISTON_API_URL = "https://emkc.org/api/v2/piston"

# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/config", response_model=AssessmentConfigResponse)
async def get_assessment_config(
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Get assessment configuration and questions for the candidate's current
    assessment stage.

    Flow: candidate_pipeline_progress → group_pipeline_stages → assessments
          → assessment_sections → section_question_pool → question_bank
    """
    # 1. Find the unlocked/in_progress assessment stage for this candidate
    result = await session.execute(
        text("""
            SELECT
                cpp.progress_id,
                cpp.status        AS progress_status,
                cpp.application_id,
                cpp.stage_id,
                gps.config_id     AS assessment_id,
                a.title,
                a.instructions,
                a.duration_minutes,
                a.passing_score
            FROM candidate_pipeline_progress cpp
            JOIN candidate_applications ca
                ON cpp.application_id = ca.application_id
            JOIN group_pipeline_stages gps
                ON cpp.stage_id = gps.stage_id
            JOIN assessments a
                ON gps.config_id = a.assessment_id
            WHERE ca.candidate_id = :candidate_id
              AND gps.stage_type  = 'assessment'
              AND gps.state       = 'active'
              AND cpp.status IN ('unlocked', 'in_progress')
            ORDER BY gps.stage_order
            LIMIT 1
        """),
        {"candidate_id": str(candidate.candidate_id)}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="No assessment available for this candidate")

    assessment_id = str(row["assessment_id"])
    stage_id = str(row["stage_id"])

    # 2. Load sections from assessment_sections
    sections_result = await session.execute(
        text("""
            SELECT section_id, section_order, section_title, question_type,
                   variants_to_select, selection_strategy
            FROM assessment_sections
            WHERE assessment_id = :assessment_id
            ORDER BY section_order
        """),
        {"assessment_id": assessment_id}
    )
    sections = sections_result.mappings().all()

    # 3. For each section, load questions from the pool → question_bank
    enriched_sections = []
    for sec in sections:
        pool_result = await session.execute(
            text("""
                SELECT sqp.pool_entry_id, sqp.question_id,
                       qb.question_type, qb.question_text, qb.question_config, qb.points
                FROM section_question_pool sqp
                JOIN question_bank qb ON qb.question_id = sqp.question_id AND qb.is_deleted = false
                WHERE sqp.section_id = :section_id
                  AND sqp.is_active = true
                ORDER BY sqp.variant_order
            """),
            {"section_id": str(sec["section_id"])}
        )
        pool_questions = pool_result.mappings().all()

        enriched_questions = []
        for q in pool_questions:
            enriched_questions.append({
                "question_id": str(q["question_id"]),
                "question_type": q["question_type"],
                "question_text": q["question_text"],
                "question_config": q["question_config"] or {},
                "points": q["points"] or 10,
            })

        enriched_sections.append({
            "section_id": str(sec["section_id"]),
            "section_title": sec["section_title"] or f"Section {sec['section_order']}",
            "question_type": sec["question_type"],
            "variants_to_select": sec["variants_to_select"],
            "total_in_pool": len(enriched_questions),
            "questions": enriched_questions,
        })

    return AssessmentConfigResponse(
        assessment_id=assessment_id,
        title=row["title"],
        instructions=row["instructions"],
        duration_minutes=row["duration_minutes"],
        passing_score=float(row["passing_score"]),
        sections=enriched_sections,
        stage_id=stage_id,
    )


@router.post("/start", response_model=StartAssessmentResponse)
async def start_assessment_session(
    request: StartAssessmentRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Start (or resume) an assessment session.
    Selects questions per section using variants_to_select and selection_strategy.
    Creates candidate_assigned_questions snapshots and ongoing_assessments record.
    """
    return await _start_assessment_session_impl(request, candidate, session)


async def _start_assessment_session_impl(
    request: StartAssessmentRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    # 1. Verify candidate owns this stage
    verify = await session.execute(
        text("""
            SELECT cpp.progress_id, cpp.status, ca.application_id, ca.organization_id
            FROM candidate_pipeline_progress cpp
            JOIN candidate_applications ca
                ON cpp.application_id = ca.application_id
            WHERE ca.candidate_id = :candidate_id
              AND cpp.stage_id    = :stage_id
        """).bindparams(
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
            bindparam("stage_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "candidate_id": candidate.candidate_id,
            "stage_id": UUID(request.stage_id),
        }
    )
    progress = verify.mappings().first()
    if not progress:
        raise HTTPException(status_code=404, detail="Assessment stage not found for this candidate")

    if progress["status"] == "completed":
        raise HTTPException(status_code=400, detail="Assessment already completed")

    application_id = progress["application_id"]  # keep as UUID from asyncpg
    org_id = progress["organization_id"]            # keep as UUID from asyncpg

    # 2. Resume existing session?
    if progress["status"] == "in_progress":
        existing = await session.execute(
            text("""
                SELECT session_id, started_at, assigned_questions
                FROM ongoing_assessments
                WHERE assessment_id = :assessment_id
                  AND application_id = :application_id
                  AND status = 'in_progress'
                LIMIT 1
            """).bindparams(
                bindparam("assessment_id", type_=pgUUID(as_uuid=True)),
                bindparam("application_id", type_=pgUUID(as_uuid=True)),
            ),
            {
                "assessment_id": UUID(request.assessment_id),
                "application_id": application_id,
            }
        )
        existing_session = existing.mappings().first()
        if existing_session:
            aq = existing_session["assigned_questions"] or {}
            existing_sid = existing_session["session_id"]
            started_at = existing_session["started_at"]

            # Get duration
            dur = await session.execute(
                text("SELECT duration_minutes FROM assessments WHERE assessment_id = :id").bindparams(
                    bindparam("id", type_=pgUUID(as_uuid=True)),
                ),
                {"id": UUID(request.assessment_id)}
            )
            dur_row = dur.mappings().first()
            duration_minutes = dur_row["duration_minutes"] if dur_row else 60

            # Calculate remaining seconds
            elapsed = (datetime.now(timezone.utc) - started_at.replace(tzinfo=timezone.utc)).total_seconds()
            remaining = max(0, int(duration_minutes * 60 - elapsed))

            # Fetch saved answers for this session
            answers_result = await session.execute(
                text("""
                    SELECT question_id, answer_data
                    FROM candidate_answers
                    WHERE session_id = :session_id
                """).bindparams(
                    bindparam("session_id", type_=pgUUID(as_uuid=True)),
                ),
                {"session_id": existing_sid}
            )
            saved_answers = {}
            for ans in answers_result.mappings().all():
                ad = ans["answer_data"] or {}
                saved_answers[str(ans["question_id"])] = {
                    "answer_data": ad,
                    "attempt_count": ad.get("attempt_count", 0) if isinstance(ad, dict) else 0,
                }

            return StartAssessmentResponse(
                session_id=str(existing_sid),
                questions=aq.get("questions", []),
                duration_minutes=duration_minutes,
                started_at=str(started_at),
                message="Resuming existing assessment session.",
                remaining_seconds=remaining,
                saved_answers=saved_answers if saved_answers else None,
            )

    # 3. Fetch assessment details + sections
    assessment = await session.execute(
        text("SELECT assessment_id, duration_minutes, passing_score FROM assessments WHERE assessment_id = :id").bindparams(
            bindparam("id", type_=pgUUID(as_uuid=True)),
        ),
        {"id": UUID(request.assessment_id)}
    )
    assessment_row = assessment.mappings().first()
    if not assessment_row:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # 4. Select questions per section
    sections_result = await session.execute(
        text("""
            SELECT section_id, section_order, section_title, question_type,
                   variants_to_select, selection_strategy
            FROM assessment_sections
            WHERE assessment_id = :assessment_id
            ORDER BY section_order
        """).bindparams(
            bindparam("assessment_id", type_=pgUUID(as_uuid=True)),
        ),
        {"assessment_id": UUID(request.assessment_id)}
    )
    sections = sections_result.mappings().all()

    session_id = uuid4()
    assigned_questions = []
    max_points = 0
    display_order = 0

    for sec in sections:
        # Get pool questions for this section
        pool_result = await session.execute(
            text("""
                SELECT sqp.pool_entry_id, sqp.question_id,
                       qb.question_type, qb.question_text, qb.question_config, 
                       qb.correct_answer, qb.points
                FROM section_question_pool sqp
                JOIN question_bank qb ON qb.question_id = sqp.question_id AND qb.is_deleted = false
                WHERE sqp.section_id = :section_id
                  AND sqp.is_active = true
                ORDER BY sqp.variant_order
            """).bindparams(
                bindparam("section_id", type_=pgUUID(as_uuid=True)),
            ),
            {"section_id": sec["section_id"]}
        )
        pool = pool_result.mappings().all()

        # Select questions based on strategy
        variants_to_select = sec["variants_to_select"] or len(pool)
        if sec["selection_strategy"] == "random" and len(pool) > variants_to_select:
            selected = random.sample(list(pool), variants_to_select)
        else:
            selected = list(pool)[:variants_to_select]

        for q in selected:
            display_order += 1
            q_points = q["points"] or 10

            # Build question snapshot (frozen copy)
            snapshot = {
                "question_id": str(q["question_id"]),
                "question_type": q["question_type"],
                "question_text": q["question_text"],
                "question_config": q["question_config"] or {},
                "correct_answer": q["correct_answer"] or {},
                "points": q_points,
            }

            assignment_id = uuid4()
            await session.execute(
                text("""
                    INSERT INTO candidate_assigned_questions
                    (assignment_id, session_id, section_id, pool_entry_id,
                     question_snapshot, display_order, assigned_at)
                    VALUES (
                        :assignment_id, :session_id, :section_id, :pool_entry_id,
                        :question_snapshot, :display_order, NOW()
                    )
                """).bindparams(
                    bindparam("assignment_id", type_=pgUUID(as_uuid=True)),
                    bindparam("session_id", type_=pgUUID(as_uuid=True)),
                    bindparam("section_id", type_=pgUUID(as_uuid=True)),
                    bindparam("pool_entry_id", type_=pgUUID(as_uuid=True)),
                    bindparam("question_snapshot", type_=JSONB),
                ),
                {
                    "assignment_id": assignment_id,
                    "session_id": session_id,
                    "section_id": sec["section_id"],
                    "pool_entry_id": q["pool_entry_id"],
                    "question_snapshot": snapshot,
                    "display_order": display_order,
                }
            )

            # Build the question data for the response (WITHOUT correct_answer)
            q_data = {
                "question_id": str(q["question_id"]),
                "assignment_id": str(assignment_id),
                "section_title": sec["section_title"] or f"Section {sec['section_order']}",
                "question_type": q["question_type"],
                "question_text": q["question_text"],
                "question_config": q["question_config"] or {},
                "points": q_points,
                "order": display_order,
            }

            # Strip correct_answer from config sent to candidate
            if "correct_answer" in q_data["question_config"]:
                del q_data["question_config"]["correct_answer"]

            assigned_questions.append(q_data)
            max_points += q_points

    # 5. Create ongoing_assessments record
    await session.execute(
        text("""
            INSERT INTO ongoing_assessments
            (session_id, assessment_id, application_id, organization_id,
             assigned_questions, status, started_at, max_points)
            VALUES (
                :session_id, :assessment_id, :application_id, :organization_id,
                :assigned_questions, :status, NOW(), :max_points
            )
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("assessment_id", type_=pgUUID(as_uuid=True)),
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
            bindparam("organization_id", type_=pgUUID(as_uuid=True)),
            bindparam("assigned_questions", type_=JSONB),
        ),
        {
            "session_id": session_id,
            "assessment_id": UUID(request.assessment_id),
            "application_id": application_id,
            "organization_id": org_id,
            "assigned_questions": {"questions": assigned_questions},
            "status": "in_progress",
            "max_points": max_points,
        }
    )

    # 6. Update candidate_pipeline_progress to in_progress
    await session.execute(
        text("""
            UPDATE candidate_pipeline_progress
            SET status = 'in_progress',
                session_id = :session_id,
                started_at = NOW()
            WHERE progress_id = :progress_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("progress_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_id,
            "progress_id": progress["progress_id"],
        }
    )

    await session.commit()

    return StartAssessmentResponse(
        session_id=str(session_id),
        questions=assigned_questions,
        duration_minutes=assessment_row["duration_minutes"],
        started_at=str(datetime.utcnow()),
        message="Assessment session started successfully.",
    )


@router.post("/answer", response_model=SaveAnswerResponse)
async def save_answer(
    request: SaveAnswerRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Save or update a single answer. Auto-grades MCQ questions.
    """
    # 1. Verify session belongs to candidate
    verify = await session.execute(
        text("""
            SELECT oa.session_id, oa.status
            FROM ongoing_assessments oa
            JOIN candidate_applications ca ON oa.application_id = ca.application_id
            WHERE oa.session_id = :session_id
              AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(request.session_id),
            "candidate_id": candidate.candidate_id,
        }
    )
    oa = verify.mappings().first()
    if not oa:
        raise HTTPException(status_code=404, detail="Assessment session not found")
    if oa["status"] == "completed":
        raise HTTPException(status_code=400, detail="Assessment already submitted")

    # 2. Get question details from question_bank (for auto-grading) or from snapshot
    question = await session.execute(
        text("""
            SELECT question_id, question_type, correct_answer, points
            FROM question_bank
            WHERE question_id = :question_id
        """).bindparams(
            bindparam("question_id", type_=pgUUID(as_uuid=True)),
        ),
        {"question_id": UUID(request.question_id)}
    )
    q = question.mappings().first()

    q_type = q["question_type"] if q else "essay"
    q_points = q["points"] if q else 10

    # 3. Auto-grade MCQ
    is_correct = None
    points_earned = None
    if q and q_type == "mcq" and q["correct_answer"]:
        correct = q["correct_answer"]
        selected = request.answer_data.get("selected_option")
        
        # Get the correct index - handle both formats
        # Format 1: {"correct_index": 2} (direct index)
        # Format 2: {"correct_option": "c"} (letter option id)
        correct_index = correct.get("correct_index")
        if correct_index is None and correct.get("correct_option"):
            # Convert letter to index: "a"=0, "b"=1, etc.
            correct_option = correct.get("correct_option")
            if isinstance(correct_option, str) and len(correct_option) == 1:
                correct_index = ord(correct_option.lower()) - ord('a')
        
        if selected is not None and correct_index is not None:
            is_correct = selected == correct_index
            points_earned = float(q_points) if is_correct else 0.0

    # 4. Find assignment_id if exists
    assignment = await session.execute(
        text("""
            SELECT assignment_id FROM candidate_assigned_questions
            WHERE session_id = :session_id
              AND question_snapshot->>'question_id' = :question_id
            LIMIT 1
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(request.session_id),
            "question_id": request.question_id,
        }
    )
    assignment_row = assignment.mappings().first()
    assignment_id = assignment_row["assignment_id"] if assignment_row else None

    # 5. Upsert answer
    existing = await session.execute(
        text("""
            SELECT answer_id FROM candidate_answers
            WHERE session_id = :session_id
              AND question_id = :question_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("question_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(request.session_id),
            "question_id": UUID(request.question_id),
        }
    )
    existing_answer = existing.mappings().first()

    if existing_answer:
        answer_id = str(existing_answer["answer_id"])
        await session.execute(
            text("""
                UPDATE candidate_answers
                SET answer_data = :answer_data,
                    is_correct = :is_correct,
                    points_earned = :points_earned,
                    time_spent_seconds = :time_spent_seconds,
                    answered_at = NOW()
                WHERE answer_id = :answer_id
            """).bindparams(
                bindparam("answer_data", type_=JSONB),
                bindparam("answer_id", type_=pgUUID(as_uuid=True)),
            ),
            {
                "answer_data": request.answer_data,
                "is_correct": is_correct,
                "points_earned": points_earned,
                "time_spent_seconds": request.time_spent_seconds,
                "answer_id": UUID(answer_id),
            }
        )
    else:
        answer_id = str(uuid4())
        await session.execute(
            text("""
                INSERT INTO candidate_answers
                (answer_id, session_id, question_id, question_order,
                 answer_data, is_correct, points_earned, points_max,
                 time_spent_seconds, answered_at, assignment_id)
                VALUES (
                    :answer_id, :session_id, :question_id, :question_order,
                    :answer_data, :is_correct, :points_earned, :points_max,
                    :time_spent_seconds, NOW(), :assignment_id
                )
            """).bindparams(
                bindparam("answer_id", type_=pgUUID(as_uuid=True)),
                bindparam("session_id", type_=pgUUID(as_uuid=True)),
                bindparam("question_id", type_=pgUUID(as_uuid=True)),
                bindparam("answer_data", type_=JSONB),
                bindparam("assignment_id", type_=pgUUID(as_uuid=True)),
            ),
            {
                "answer_id": UUID(answer_id),
                "session_id": UUID(request.session_id),
                "question_id": UUID(request.question_id),
                "question_order": 0,
                "answer_data": request.answer_data,
                "is_correct": is_correct,
                "points_earned": points_earned,
                "points_max": q_points,
                "time_spent_seconds": request.time_spent_seconds,
                "assignment_id": assignment_id,
            }
        )

    await session.commit()

    return SaveAnswerResponse(
        answer_id=answer_id,
        is_correct=is_correct,
        points_earned=points_earned,
        message="Answer saved successfully.",
    )


class HeartbeatResponse(BaseModel):
    session_id: str
    remaining_seconds: int
    status: str
    answered_count: int


@router.get("/heartbeat/{session_id}", response_model=HeartbeatResponse)
async def assessment_heartbeat(
    session_id: str,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Heartbeat endpoint to sync timer and get current status.
    Called periodically by frontend to ensure timer accuracy even when tab is inactive.
    """
    # Verify session belongs to candidate
    verify = await session.execute(
        text("""
            SELECT oa.session_id, oa.status, oa.started_at, oa.submitted_at
            FROM ongoing_assessments oa
            JOIN candidate_applications ca ON oa.application_id = ca.application_id
            WHERE oa.session_id = :session_id
              AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(session_id),
            "candidate_id": candidate.candidate_id,
        }
    )
    oa = verify.mappings().first()
    if not oa:
        raise HTTPException(status_code=404, detail="Assessment session not found")
    
    # Check if already completed
    if oa["status"] == "completed" or oa["submitted_at"]:
        return HeartbeatResponse(
            session_id=session_id,
            remaining_seconds=0,
            status="completed",
            answered_count=0,
        )
    
    # Get duration and calculate remaining time
    remaining_seconds = 0
    if oa["started_at"]:
        dur = await session.execute(
            text("""
                SELECT a.duration_minutes 
                FROM ongoing_assessments oa
                JOIN assessments a ON oa.assessment_id = a.assessment_id
                WHERE oa.session_id = :session_id
            """).bindparams(
                bindparam("session_id", type_=pgUUID(as_uuid=True)),
            ),
            {"session_id": UUID(session_id)}
        )
        dur_row = dur.mappings().first()
        duration_minutes = dur_row["duration_minutes"] if dur_row else 60
        
        elapsed = (datetime.now(timezone.utc) - oa["started_at"].replace(tzinfo=timezone.utc)).total_seconds()
        remaining_seconds = max(0, int(duration_minutes * 60 - elapsed))
    
    # Get answered count
    count_result = await session.execute(
        text("SELECT COUNT(*) as cnt FROM candidate_answers WHERE session_id = :session_id"),
        {"session_id": UUID(session_id)}
    )
    answered_count = count_result.scalar() or 0
    
    # Check if time expired
    if remaining_seconds <= 0:
        # Auto-finalize the session
        await finalize_expired_assessment_sessions(session, session_id=UUID(session_id))
        return HeartbeatResponse(
            session_id=session_id,
            remaining_seconds=0,
            status="expired",
            answered_count=answered_count,
        )
    
    return HeartbeatResponse(
        session_id=session_id,
        remaining_seconds=remaining_seconds,
        status=oa["status"],
        answered_count=answered_count,
    )


@router.post("/run-code", response_model=RunCodeResponse)
async def run_code(
    request: RunCodeRequest,
    candidate: CurrentCandidate,
):
    """
    Execute code locally (for Python and Javascript/Node).
    Uses subprocess.run via asyncio.to_thread for Windows compatibility
    (asyncio.create_subprocess_exec raises NotImplementedError on Windows).
    """
    import asyncio
    import subprocess
    import tempfile
    import os
    import time as time_module

    language = request.language.lower()

    # We only securely support Python and JS in this basic local wrapper
    if language not in ["python", "python3", "javascript", "js", "node"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {request.language}. Local sandbox only supports python/javascript."
        )

    # Determine execution command and file extension
    if language in ["python", "python3"]:
        cmd = ["python"]
        ext = ".py"
    else:
        cmd = ["node"]
        ext = ".js"

    # Write code to a temporary file
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False, mode="w", encoding="utf-8") as f:
        f.write(request.code)
        temp_file_path = f.name

    def _run_subprocess():
        """Blocking subprocess call — runs in a thread."""
        stdin_data = request.stdin if request.stdin else None
        start = time_module.perf_counter()
        try:
            result = subprocess.run(
                [*cmd, temp_file_path],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=10,
            )
            elapsed = round(time_module.perf_counter() - start, 3)
            return {
                "stdout": result.stdout or "",
                "stderr": result.stderr or "",
                "returncode": result.returncode,
                "time": str(elapsed),
                "timed_out": False,
            }
        except subprocess.TimeoutExpired:
            elapsed = round(time_module.perf_counter() - start, 3)
            return {
                "stdout": "",
                "stderr": "Execution timed out (10s limit).",
                "returncode": -1,
                "time": str(elapsed),
                "timed_out": True,
            }

    try:
        result = await asyncio.to_thread(_run_subprocess)

        if result["timed_out"]:
            return RunCodeResponse(
                stdout="",
                stderr=result["stderr"],
                compile_output="",
                status="Time Limit Exceeded",
                time=result["time"],
                memory=None,
            )

        status_desc = "Accepted" if result["returncode"] == 0 else "Runtime Error"
        return RunCodeResponse(
            stdout=result["stdout"],
            stderr=result["stderr"],
            compile_output="",
            status=status_desc,
            time=result["time"],
            memory=None,
        )
    finally:
        # Clean up temp file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)



@router.post("/run-tests", response_model=RunTestsResponse)
async def run_tests(
    request: RunTestsRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    run all test cases for a coding question. counts as a trial attempt.
    saves the answer + test results to DB.
    """

    MAX_ATTEMPTS_DEFAULT = 5

    # 1. Verify session belongs to candidate
    verify = await session.execute(
        text("""
            SELECT oa.session_id, oa.status
            FROM ongoing_assessments oa
            JOIN candidate_applications ca ON oa.application_id = ca.application_id
            WHERE oa.session_id = :session_id
              AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(request.session_id),
            "candidate_id": candidate.candidate_id,
        }
    )
    oa = verify.mappings().first()
    if not oa:
        raise HTTPException(status_code=404, detail="Assessment session not found")
    if oa["status"] == "completed":
        raise HTTPException(status_code=400, detail="Assessment already submitted")

    # 2. Get question snapshot (includes test_cases in correct_answer/question_config)
    snapshot_result = await session.execute(
        text("""
            SELECT assignment_id, question_snapshot
            FROM candidate_assigned_questions
            WHERE session_id = :session_id
              AND question_snapshot->>'question_id' = :question_id
            LIMIT 1
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(request.session_id),
            "question_id": request.question_id,
        }
    )
    snap_row = snapshot_result.mappings().first()
    if not snap_row:
        raise HTTPException(status_code=404, detail="Question not found in this session")

    snapshot = snap_row["question_snapshot"]
    assignment_id = snap_row["assignment_id"]
    q_config = snapshot.get("question_config", {})
    correct_answer = snapshot.get("correct_answer", {})

    # Get test cases from question_config or correct_answer
    test_cases = q_config.get("test_cases", []) or correct_answer.get("test_cases", [])
    max_attempts = q_config.get("max_attempts", MAX_ATTEMPTS_DEFAULT)
    q_points = snapshot.get("points", 10)

    # 3. Get current attempt count
    existing = await session.execute(
        text("""
            SELECT answer_id, answer_data
            FROM candidate_answers
            WHERE session_id = :session_id
              AND question_id = :question_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("question_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(request.session_id),
            "question_id": UUID(request.question_id),
        }
    )
    existing_answer = existing.mappings().first()
    current_attempt = 0
    if existing_answer and existing_answer["answer_data"]:
        current_attempt = existing_answer["answer_data"].get("attempt_count", 0)

    if current_attempt >= max_attempts:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum attempts ({max_attempts}) reached for this question."
        )

    # 4. Run code against ALL test cases
    language = request.language.lower()
    if language in ["python", "python3"]:
        ext = ".py"
        is_python = True
    elif language in ["javascript", "js", "node"]:
        ext = ".js"
        is_python = False
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {request.language}")

    # Create the candidate's code file
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False, mode="w", encoding="utf-8") as f:
        f.write(request.code)
        temp_file_path = f.name

    visible_results = []
    hidden_passed = 0
    hidden_total = 0
    all_passed = True

    def _extract_function_name_python(code: str) -> str | None:
        """Extract function name from Python code (def function_name(...))."""
        import re
        match = re.search(r'def\s+(\w+)\s*\(', code)
        return match.group(1) if match else None

    def _extract_function_name_js(code: str) -> str | None:
        """Extract function name from JS code (function name(...) or const name = (...) =>)."""
        import re
        # Try function declaration
        match = re.search(r'function\s+(\w+)\s*\(', code)
        if match:
            return match.group(1)
        # Try arrow function or const
        match = re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>', code)
        if match:
            return match.group(1)
        return None

    def _run_test_case_py(candidate_code: str, func_name: str, test_input: str, expected: str) -> dict:
        """Run a single test case for Python - executes code and calls function."""
        import ast
        import json
        import inspect

        start = time_module.perf_counter()

        parsed_input = test_input

        # Build judge wrapper with smart argument unpacking
        judge_code = f'''
import sys
import json
import ast
import inspect

# Candidate's code
{candidate_code}

# Parse the test input
try:
    test_input = ast.literal_eval({repr(parsed_input)})
except:
    test_input = {repr(parsed_input)}

# Get the function
func = locals().get({repr(func_name)})
if func is None:
    print("ERROR:FUNCTION_NOT_FOUND", file=sys.stderr)
    sys.exit(1)

# Smart argument unpacking:
# - If input is a dict AND function has multiple params → unpack as kwargs
# - If input is a list → unpack as positional args
# - Otherwise → pass as single argument
try:
    sig = inspect.signature(func)
    param_count = len([p for p in sig.parameters.values()
                       if p.default == inspect.Parameter.empty
                       and p.kind not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)])

    if isinstance(test_input, dict) and param_count > 1:
        result = func(**test_input)
    elif isinstance(test_input, list) and param_count > 1:
        result = func(*test_input)
    else:
        result = func(test_input)

    # Convert result to comparable format
    if isinstance(result, (list, dict)):
        result_str = json.dumps(result, sort_keys=True)
        # Use ast.literal_eval for expected (handles Python dict repr with single quotes)
        expected_val = ast.literal_eval({repr(expected)})
        expected_str = json.dumps(expected_val, sort_keys=True)
        print(result_str)
        sys.exit(0 if result_str == expected_str else 1)
    else:
        result_str = str(result)
        expected_str = {repr(expected)}
        print(result_str)
        sys.exit(0 if result_str == expected_str else 1)
except Exception as e:
    print(f"ERROR:{{e}}", file=sys.stderr)
    sys.exit(1)
'''
        
        with tempfile.NamedTemporaryFile(suffix='.py', delete=False, mode='w', encoding='utf-8') as f:
            f.write(judge_code)
            judge_path = f.name
        
        try:
            result = subprocess.run(
                ['python', judge_path],
                capture_output=True, text=True, timeout=10,
            )
            elapsed = round(time_module.perf_counter() - start, 3)
            
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            
            if 'ERROR:FUNCTION_NOT_FOUND' in stderr:
                return {
                    "passed": False,
                    "actual": "Function not found in your code",
                    "expected": expected,
                    "error": stderr,
                    "time": str(elapsed)
                }
            elif result.returncode == 0:
                return {
                    "passed": True,
                    "actual": stdout,
                    "expected": expected,
                    "time": str(elapsed)
                }
            else:
                return {
                    "passed": False,
                    "actual": stdout if stdout else "Wrong output",
                    "expected": expected,
                    "error": stderr if stderr else None,
                    "time": str(elapsed)
                }
        except subprocess.TimeoutExpired:
            return {
                "passed": False,
                "actual": "",
                "expected": expected,
                "error": "Time limit exceeded (10s)",
                "time": "10.0"
            }
        finally:
            if os.path.exists(judge_path):
                os.remove(judge_path)

    def _run_test_case_js(candidate_code: str, func_name: str, test_input: str, expected: str) -> dict:
        """Run a single test case for JavaScript - executes code and calls function."""
        start = time_module.perf_counter()
        
        # Build judge wrapper
        # Pass the test input as a JSON string and parse it in JS
        judge_code = f'''
// Candidate's code
{candidate_code}

// Test input - parse from JSON string
const test_input_str = {repr(test_input)};
let test_input;
try {{
    test_input = JSON.parse(test_input_str);
}} catch (e) {{
    // If JSON parse fails, try evaluating as JS literal
    try {{
        test_input = eval(test_input_str);
    }} catch (e2) {{
        test_input = test_input_str;
    }}
}}

// Get the function
const func = eval({repr(func_name)});
if (typeof func !== 'function') {{
    console.error('ERROR:FUNCTION_NOT_FOUND');
    process.exit(1);
}}

try {{
    let result;
    if (Array.isArray(test_input)) {{
        result = func(...test_input);
    }} else if (typeof test_input === 'object' && test_input !== null) {{
        result = func({{...test_input}});
    }} else {{
        result = func(test_input);
    }}
    
    // Convert result to comparable format
    const resultStr = JSON.stringify(result);
    const expectedStr = JSON.stringify(JSON.parse({repr(expected)}));
    
    console.log(resultStr);
    process.exit(resultStr === expectedStr ? 0 : 1);
}} catch (e) {{
    console.error('ERROR:' + e.message);
    process.exit(1);
}}
'''
        
        with tempfile.NamedTemporaryFile(suffix='.js', delete=False, mode='w', encoding='utf-8') as f:
            f.write(judge_code)
            judge_path = f.name
        
        try:
            result = subprocess.run(
                ['node', judge_path],
                capture_output=True, text=True, timeout=10,
            )
            elapsed = round(time_module.perf_counter() - start, 3)
            
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            
            if 'ERROR:FUNCTION_NOT_FOUND' in stderr:
                return {
                    "passed": False,
                    "actual": "Function not found in your code",
                    "expected": expected,
                    "error": stderr,
                    "time": str(elapsed)
                }
            elif result.returncode == 0:
                return {
                    "passed": True,
                    "actual": stdout,
                    "expected": expected,
                    "time": str(elapsed)
                }
            else:
                return {
                    "passed": False,
                    "actual": stdout if stdout else "Wrong output",
                    "expected": expected,
                    "error": stderr if stderr else None,
                    "time": str(elapsed)
                }
        except subprocess.TimeoutExpired:
            return {
                "passed": False,
                "actual": "",
                "expected": expected,
                "error": "Time limit exceeded (10s)",
                "time": "10.0"
            }
        finally:
            if os.path.exists(judge_path):
                os.remove(judge_path)

    def _run_simple_stdin(candidate_file: str, stdin_data: str, expected: str) -> dict:
        """Run code with stdin input (legacy support for simple I/O)."""
        start = time_module.perf_counter()
        try:
            result = subprocess.run(
                ['python' if is_python else 'node', candidate_file],
                input=stdin_data,
                capture_output=True, text=True, timeout=10,
            )
            elapsed = round(time_module.perf_counter() - start, 3)
            return {
                "passed": result.stdout.strip() == expected,
                "actual": result.stdout.strip(),
                "expected": expected,
                "error": result.stderr if result.stderr else None,
                "time": str(elapsed)
            }
        except subprocess.TimeoutExpired:
            return {
                "passed": False,
                "actual": "",
                "expected": expected,
                "error": "Time limit exceeded",
                "time": "10.0"
            }

    # Extract function name from candidate code
    func_name = _extract_function_name_python(request.code) if is_python else _extract_function_name_js(request.code)
    
    try:
        for tc in test_cases:
            test_input = tc.get("input", "")
            expected = tc.get("expected_output", "").strip() if tc.get("expected_output") else str(tc.get("expected", "")).strip()
            is_hidden = tc.get("is_hidden", False)

            # Use function-based execution if we can extract function name
            if func_name:
                if is_python:
                    test_result = await asyncio.to_thread(_run_test_case_py, request.code, func_name, test_input, expected)
                else:
                    test_result = await asyncio.to_thread(_run_test_case_js, request.code, func_name, test_input, expected)
            else:
                # Fall back to simple stdin for legacy support
                test_result = await asyncio.to_thread(_run_simple_stdin, temp_file_path, test_input, expected)
            
            passed = test_result["passed"]
            if not passed:
                all_passed = False

            if is_hidden:
                hidden_total += 1
                if passed:
                    hidden_passed += 1
            else:
                visible_results.append({
                    "passed": passed,
                    "expected": test_result["expected"],
                    "actual": test_result["actual"],
                    "error": test_result.get("error"),
                    "time": test_result["time"],
                })
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    # 5. Increment attempt count and save
    new_attempt = current_attempt + 1
    total_tests = len(test_cases)
    passed_tests = len([r for r in visible_results if r["passed"]]) + hidden_passed
    score_ratio = passed_tests / total_tests if total_tests > 0 else 0
    points_earned = round(q_points * score_ratio, 2)

    answer_data = {
        "code": request.code,
        "language": request.language,
        "attempt_count": new_attempt,
        "test_results": visible_results,
        "hidden_passed": hidden_passed,
        "hidden_total": hidden_total,
        "all_passed": all_passed,
        "score_ratio": score_ratio,
    }

    if existing_answer:
        await session.execute(
            text("""
                UPDATE candidate_answers
                SET answer_data = :answer_data,
                    is_correct = :is_correct,
                    points_earned = :points_earned,
                    answered_at = NOW()
                WHERE answer_id = :answer_id
            """).bindparams(
                bindparam("answer_data", type_=JSONB),
                bindparam("answer_id", type_=pgUUID(as_uuid=True)),
            ),
            {
                "answer_data": answer_data,
                "is_correct": all_passed,
                "points_earned": points_earned,
                "answer_id": existing_answer["answer_id"],
            }
        )
    else:
        await session.execute(
            text("""
                INSERT INTO candidate_answers
                (answer_id, session_id, question_id, question_order,
                 answer_data, is_correct, points_earned, points_max,
                 answered_at, assignment_id)
                VALUES (
                    :answer_id, :session_id, :question_id, 0,
                    :answer_data, :is_correct, :points_earned, :points_max,
                    NOW(), :assignment_id
                )
            """).bindparams(
                bindparam("answer_id", type_=pgUUID(as_uuid=True)),
                bindparam("session_id", type_=pgUUID(as_uuid=True)),
                bindparam("question_id", type_=pgUUID(as_uuid=True)),
                bindparam("answer_data", type_=JSONB),
                bindparam("assignment_id", type_=pgUUID(as_uuid=True)),
            ),
            {
                "answer_id": uuid4(),
                "session_id": UUID(request.session_id),
                "question_id": UUID(request.question_id),
                "answer_data": answer_data,
                "is_correct": all_passed,
                "points_earned": points_earned,
                "points_max": q_points,
                "assignment_id": assignment_id,
            }
        )

    await session.commit()

    return RunTestsResponse(
        attempt_count=new_attempt,
        max_attempts=max_attempts,
        visible_results=visible_results,
        all_passed=all_passed,
        hidden_passed=hidden_passed,
        hidden_total=hidden_total,
        message=f"Attempt {new_attempt}/{max_attempts}. {'All tests passed!' if all_passed else 'Some tests failed.'}",
    )


# auto grading

async def auto_grade_answers(session_id: UUID, db_session):
    """
    Grade all ungraded essay and coding answers for a session.

    - Essay: calls AI service /evaluate/grade-essay
    - Coding: runs code against hidden test cases via subprocess

    Updates candidate_answers.points_earned and answer_data.ai_feedback in place.
    """
    import asyncio
    import subprocess
    import tempfile
    import os
    import time as time_module

    # Fetch ungraded answers (essay + coding) with their question snapshots
    ungraded = await db_session.execute(
        text("""
            SELECT
                ca.answer_id,
                ca.question_id,
                ca.answer_data,
                ca.points_max,
                caq.question_snapshot
            FROM candidate_answers ca
            LEFT JOIN candidate_assigned_questions caq
                ON ca.assignment_id = caq.assignment_id
            WHERE ca.session_id = :session_id
              AND ca.points_earned IS NULL
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": session_id}
    )
    rows = ungraded.mappings().all()

    if not rows:
        logger.info(f"[auto_grade] No ungraded answers for session {session_id}")
        return

    logger.info(f"[auto_grade] Grading {len(rows)} ungraded answer(s) for session {session_id}")

    for row in rows:
        answer_id = row["answer_id"]
        answer_data = row["answer_data"] or {}
        points_max = float(row["points_max"] or 10)
        snapshot = row["question_snapshot"] or {}

        q_type = snapshot.get("question_type", "essay")
        q_text = snapshot.get("question_text", "")
        correct_answer = snapshot.get("correct_answer") or {}
        q_config = snapshot.get("question_config") or {}

        points_earned = None
        feedback_data = {}

        # ── ESSAY GRADING (via AI service) ────────────────────────────
        if q_type == "essay":
            essay_text = answer_data.get("text", answer_data.get("essay_text", ""))
            if isinstance(answer_data, str):
                essay_text = answer_data

            reference = correct_answer.get("reference_answer", "")
            rubric = q_config.get("rubric")  # Get rubric from question_config

            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(
                        f"{AI_SERVICE_URL}/evaluate/grade-essay",
                        json={
                            "question_text": q_text,
                            "essay_response": essay_text,
                            "reference_answer": reference,
                            "rubric": rubric,  # Include rubric for better grading
                            "max_points": points_max,
                        },
                    )
                    if resp.status_code == 200:
                        grade = resp.json()
                        points_earned = float(grade["points_earned"])
                        feedback_data = {
                            "ai_score": grade["score"],
                            "ai_feedback": grade["feedback"],
                            "ai_strengths": grade.get("strengths", []),
                            "ai_improvements": grade.get("improvements", []),
                        }
                        logger.info(f"[auto_grade] Essay {answer_id}: score={grade['score']}, pts={points_earned}/{points_max}")
                    else:
                        logger.warning(f"[auto_grade] AI service returned {resp.status_code}: {resp.text[:200]}")
                        # Fallback: give partial credit
                        points_earned = round(points_max * 0.5, 2)
                        feedback_data = {"ai_feedback": "AI grading unavailable – partial credit assigned."}
            except Exception as e:
                logger.error(f"[auto_grade] AI service error: {e}")
                points_earned = round(points_max * 0.5, 2)
                feedback_data = {"ai_feedback": f"AI grading error – partial credit assigned. Error: {str(e)[:100]}"}

        # ── CODING GRADING (via test case execution) ──────────────────
        elif q_type == "coding":
            code = answer_data.get("code", "")
            language = answer_data.get("language", q_config.get("language", "python")).lower()
            test_cases = q_config.get("test_cases", correct_answer.get("test_cases", []))

            if not test_cases:
                # No test cases – give full credit if code was written
                points_earned = float(points_max) if code.strip() else 0.0
                feedback_data = {"ai_feedback": "No test cases available – full credit for submission."}
                logger.info(f"[auto_grade] Coding {answer_id}: no test cases, pts={points_earned}")
            else:
                import re
                
                # Extract function name from candidate code
                def _extract_py(code_str):
                    match = re.search(r'def\s+(\w+)\s*\(', code_str)
                    return match.group(1) if match else None
                
                def _extract_js(code_str):
                    match = re.search(r'function\s+(\w+)\s*\(', code_str)
                    if match: return match.group(1)
                    match = re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>', code_str)
                    return match.group(1) if match else None
                
                func_name = _extract_py(code) if language in ["python", "python3"] else _extract_js(code)
                
                passed = 0
                total = len(test_cases)
                test_results = []

                if language in ["python", "python3"]:
                    ext = ".py"
                    is_py = True
                elif language in ["javascript", "js", "node"]:
                    ext = ".js"
                    is_py = False
                else:
                    ext = ".py"
                    is_py = True

                with tempfile.NamedTemporaryFile(suffix=ext, delete=False, mode="w", encoding="utf-8") as f:
                    f.write(code)
                    temp_path = f.name

                try:
                    for i, tc in enumerate(test_cases):
                        tc_input = tc.get("input", "")
                        expected_output = tc.get("expected_output", tc.get("output", ""))
                        if isinstance(expected_output, str):
                            expected_output = expected_output.strip()
                        else:
                            expected_output = str(expected_output).strip()

                        if func_name and is_py:
                            # Use function-based judge for Python
                            judge_code = f'''
import sys
import json
import ast

# Candidate's code
{code}

# Parse the test input
try:
    test_input = ast.literal_eval({repr(tc_input)})
except:
    test_input = {repr(tc_input)}

func = locals().get({repr(func_name)})
if func is None:
    print("ERROR:FUNCTION_NOT_FOUND", file=sys.stderr)
    sys.exit(1)

# Call the function - pass input as single argument
try:
    result = func(test_input)
    
    if isinstance(result, (list, dict)):
        result_str = json.dumps(result, sort_keys=True)
        expected_str = json.dumps(json.loads({repr(expected_output)}), sort_keys=True)
        print(result_str)
        sys.exit(0 if result_str == expected_str else 1)
    else:
        result_str = str(result)
        expected_str = {repr(expected_output)}
        print(result_str)
        sys.exit(0 if result_str == expected_str else 1)
except Exception as e:
    print(f"ERROR:{{e}}", file=sys.stderr)
    sys.exit(1)
'''
                            with tempfile.NamedTemporaryFile(suffix='.py', delete=False, mode='w', encoding='utf-8') as fj:
                                fj.write(judge_code)
                                judge_path = fj.name
                            
                            try:
                                result = subprocess.run(['python', judge_path], capture_output=True, text=True, timeout=10)
                                stdout = result.stdout.strip()
                                stderr = result.stderr.strip()
                                tc_passed = result.returncode == 0
                                error = stderr if 'ERROR:' in stderr else None
                            finally:
                                if os.path.exists(judge_path):
                                    os.remove(judge_path)
                        elif func_name and not is_py:
                            # Use function-based judge for JavaScript
                            judge_code = f'''
// Candidate's code
{code}

// Test input
const test_input_str = {repr(tc_input)};
let test_input;
try {{
    test_input = JSON.parse(test_input_str);
}} catch (e) {{
    try {{
        test_input = eval(test_input_str);
    }} catch (e2) {{
        test_input = test_input_str;
    }}
}}

const func = eval({repr(func_name)});
if (typeof func !== 'function') {{
    console.error('ERROR:FUNCTION_NOT_FOUND');
    process.exit(1);
}}

try {{
    let result;
    if (Array.isArray(test_input)) {{
        result = func(...test_input);
    }} else if (typeof test_input === 'object' && test_input !== null) {{
        result = func({{...test_input}});
    }} else {{
        result = func(test_input);
    }}
    
    const resultStr = JSON.stringify(result);
    const expectedStr = JSON.stringify(JSON.parse({repr(expected_output)}));
    
    console.log(resultStr);
    process.exit(resultStr === expectedStr ? 0 : 1);
}} catch (e) {{
    console.error('ERROR:' + e.message);
    process.exit(1);
}}
'''
                            with tempfile.NamedTemporaryFile(suffix='.js', delete=False, mode='w', encoding='utf-8') as fj:
                                fj.write(judge_code)
                                judge_path = fj.name
                            
                            try:
                                result = subprocess.run(['node', judge_path], capture_output=True, text=True, timeout=10)
                                stdout = result.stdout.strip()
                                stderr = result.stderr.strip()
                                tc_passed = result.returncode == 0
                                error = stderr if 'ERROR:' in stderr else None
                            finally:
                                if os.path.exists(judge_path):
                                    os.remove(judge_path)
                        else:
                            # Fall back to stdin for legacy questions
                            def _run_stdin(path, stdin_data):
                                try:
                                    result = subprocess.run(
                                        ['python' if is_py else 'node', path],
                                        input=stdin_data,
                                        capture_output=True,
                                        text=True,
                                        timeout=10,
                                    )
                                    return result.stdout.strip(), result.stderr.strip(), result.returncode
                                except subprocess.TimeoutExpired:
                                    return "", "Timeout", -1
                            
                            stdout, stderr, rc = await asyncio.to_thread(_run_stdin, temp_path, tc_input)
                            tc_passed = (rc == 0 and stdout == expected_output)
                            error = stderr if stderr else None

                        if tc_passed:
                            passed += 1
                        test_results.append({
                            "test_case": i + 1,
                            "passed": tc_passed,
                            "expected": str(expected_output)[:100],
                            "actual": stdout[:100] if stdout else "",
                            "error": error[:100] if error else None,
                        })

                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)

                ratio = passed / total if total > 0 else 0
                points_earned = round(ratio * points_max, 2)
                feedback_data = {
                    "ai_feedback": f"{passed}/{total} test cases passed.",
                    "test_results": test_results,
                }
                logger.info(f"[auto_grade] Coding {answer_id}: {passed}/{total} passed, pts={points_earned}/{points_max}")

        # ── UPDATE the answer row ─────────────────────────────────────
        if points_earned is not None:
            # Merge feedback into existing answer_data
            if isinstance(answer_data, dict):
                updated_data = {**answer_data, **feedback_data}
            else:
                updated_data = {"original_answer": answer_data, **feedback_data}

            await db_session.execute(
                text("""
                    UPDATE candidate_answers
                    SET points_earned = :points_earned,
                        answer_data = :answer_data
                    WHERE answer_id = :answer_id
                """).bindparams(
                    bindparam("answer_id", type_=pgUUID(as_uuid=True)),
                    bindparam("answer_data", type_=JSONB),
                ),
                {
                    "points_earned": points_earned,
                    "answer_data": updated_data,
                    "answer_id": answer_id,
                }
            )

    logger.info(f"[auto_grade] Finished grading session {session_id}")


@router.post("/submit", response_model=SubmitAssessmentResponse)
async def submit_assessment(
    request: SubmitAssessmentRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Submit the assessment. Auto-grades essay/coding answers, calculates
    total score, updates progress, and marks the stage as completed.
    """
    # 1. Verify session belongs to candidate
    verify = await session.execute(
        text("""
            SELECT oa.session_id, oa.status, oa.started_at, oa.max_points,
                   oa.assessment_id, ca.application_id
            FROM ongoing_assessments oa
            JOIN candidate_applications ca ON oa.application_id = ca.application_id
            WHERE oa.session_id = :session_id
              AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": UUID(request.session_id),
            "candidate_id": candidate.candidate_id,
        }
    )
    oa = verify.mappings().first()
    if not oa:
        raise HTTPException(status_code=404, detail="Assessment session not found")
    if oa["status"] == "completed":
        raise HTTPException(status_code=400, detail="Assessment already submitted")

    # 1b. AUTO-GRADE ungraded essay/coding answers before calculating score
    try:
        await auto_grade_answers(UUID(request.session_id), session)
    except Exception as e:
        logger.error(f"Auto-grading failed (non-fatal): {e}")
        # Continue with submission even if grading fails

    # 2. Calculate total score
    score_result = await session.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN points_earned IS NOT NULL THEN points_earned ELSE 0 END), 0) as total_earned,
                COALESCE(SUM(points_max), 0) as total_max
            FROM candidate_answers
            WHERE session_id = :session_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": UUID(request.session_id)}
    )
    scores = score_result.mappings().first()
    total_earned = float(scores["total_earned"])
    total_max = int(oa["max_points"] or scores["total_max"] or 0)

    submit_time = datetime.now(timezone.utc)
    started_at = oa["started_at"]
    if started_at and started_at.tzinfo is None:
        from datetime import timezone as tz
        started_at = started_at.replace(tzinfo=tz.utc)
    time_spent = int((submit_time - started_at).total_seconds()) if started_at else 0

    # 3. Get passing score
    assess = await session.execute(
        text("SELECT passing_score FROM assessments WHERE assessment_id = :id").bindparams(
            bindparam("id", type_=pgUUID(as_uuid=True)),
        ),
        {"id": oa["assessment_id"]}
    )
    assess_row = assess.mappings().first()
    passing_score = float(assess_row["passing_score"]) if assess_row else 60.0

    percentage = (total_earned / total_max * 100) if total_max > 0 else 0
    passed = percentage >= passing_score

    # 4. Update ongoing_assessments
    await session.execute(
        text("""
            UPDATE ongoing_assessments
            SET status = 'completed',
                submitted_at = NOW(),
                time_spent_seconds = :time_spent,
                total_score = :total_score,
                total_points = :total_earned,
                max_points = :max_points
            WHERE session_id = :session_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "time_spent": time_spent,
            "total_score": percentage,
            "total_earned": int(total_earned),
            "max_points": total_max,
            "session_id": UUID(request.session_id),
        }
    )

    # 5. Update candidate_pipeline_progress to 'completed'
    await session.execute(
        text("""
            UPDATE candidate_pipeline_progress
            SET status = 'completed',
                score = :score,
                max_score = :max_score,
                passed = :passed,
                completed_at = NOW()
            WHERE application_id = :application_id
              AND stage_id IN (
                  SELECT gps.stage_id 
                  FROM group_pipeline_stages gps
                  WHERE gps.config_id = :assessment_id
                    AND gps.stage_type = 'assessment'
              )
        """).bindparams(
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
            bindparam("assessment_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "score": percentage,
            "max_score": total_max,
            "passed": passed,
            "application_id": oa["application_id"],
            "assessment_id": oa["assessment_id"],
        }
    )

    # NOTE: Stage transitions are recruiter-controlled.
    # The recruiter opens/closes stages for the group. Candidates only get
    # their own progress marked as 'completed'. No auto-unlock of next stage.

    await session.commit()

    return SubmitAssessmentResponse(
        total_score=total_earned,
        max_score=total_max,
        percentage=round(percentage, 2),
        passed=passed,
        message="Assessment submitted successfully!" if passed else "Assessment submitted. You did not meet the passing score.",
    )
