"""
Candidate Interview API endpoints.

Handles the AI video interview flow:
- Get interview config (questions)
- Start interview session
- Submit video response
- Check processing status
"""
from uuid import UUID
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import text, bindparam
from sqlalchemy.dialects.postgresql import UUID as pgUUID

from app.api.deps import CurrentCandidate, DbSession


router = APIRouter(prefix="/interview", tags=["Candidate Interview"])


# =============================================================================
# SCHEMAS
# =============================================================================

class InterviewConfigResponse(BaseModel):
    """Interview configuration for candidate."""
    config_id: str
    title: str | None
    instructions: str | None
    questions: list[dict]
    think_time_seconds: int
    answer_time_seconds: int
    max_retakes: int


class StartSessionRequest(BaseModel):
    """Request to start interview session."""
    config_id: str


class StartSessionResponse(BaseModel):
    """Response after starting session."""
    session_id: str
    message: str


class SubmitResponseRequest(BaseModel):
    """Request to submit video response."""
    session_id: str
    question_id: str
    question_order: int
    question_text: str
    video_url: str
    reference_answer: str | None = None


class SubmitResponseResponse(BaseModel):
    """Response after submitting video."""
    response_id: str
    task_id: str
    status: str
    message: str | None = None  # Optional for flexibility


class ProcessingStatusResponse(BaseModel):
    """Processing status for a session."""
    session_id: str
    status: str
    responses: list[dict]


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/config", response_model=InterviewConfigResponse)
async def get_interview_config(candidate: CurrentCandidate, session: DbSession):
    """
    Get interview configuration for the candidate's current AI interview stage.
    
    Returns questions, time limits, and instructions.
    """
    # Get the candidate's ai_interview stage config
    result = await session.execute(
        text("""
            SELECT 
                aic.config_id,
                aic.title,
                aic.instructions,
                aic.questions,
                COALESCE(aic.think_time_seconds, 30) as think_time,
                COALESCE(aic.answer_time_seconds, 120) as answer_time,
                COALESCE(aic.max_retakes, 1) as max_retakes
            FROM candidate_applications ca
            JOIN group_pipeline_stages gps ON ca.group_id = gps.group_id AND gps.stage_type = 'ai_interview'
            JOIN ai_interview_configs aic ON gps.config_id = aic.config_id
            WHERE ca.candidate_id = :cid AND (ca.is_deleted = false OR ca.is_deleted IS NULL)
            LIMIT 1
        """).bindparams(
            bindparam("cid", type_=pgUUID(as_uuid=True)),
        ),
        {"cid": candidate.candidate_id}
    )
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="No AI interview configured for this candidate")
    
    # Parse questions from JSONB
    questions_data = row[3] or {"questions": []}
    questions = questions_data.get("questions", [])
    
    # Normalize questions to list of dicts
    normalized_questions = []
    for i, q in enumerate(questions):
        if isinstance(q, str):
            normalized_questions.append({
                "id": f"q{i+1}",
                "text": q,
                "reference_answer": None,
            })
        elif isinstance(q, dict):
            normalized_questions.append({
                "id": q.get("id", f"q{i+1}"),
                "text": q.get("text", q.get("question", "")),
                "reference_answer": q.get("reference_answer"),
            })
    
    return InterviewConfigResponse(
        config_id=str(row[0]),
        title=row[1],
        instructions=row[2],
        questions=normalized_questions,
        think_time_seconds=row[4],
        answer_time_seconds=row[5],
        max_retakes=row[6],
    )


@router.post("/start", response_model=StartSessionResponse)
async def start_interview_session(
    request: StartSessionRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Start a new interview session.
    
    Creates an ongoing_interviews record to track interview progress.
    """
    from uuid import uuid4
    
    session_id = str(uuid4())
    
    # Get candidate's application and organization for this interview config
    result = await session.execute(
        text("""
            SELECT 
                ca.application_id,
                aic.organization_id,
                aic.interview_type
            FROM candidate_applications ca
            JOIN group_pipeline_stages gps ON ca.group_id = gps.group_id 
                AND gps.stage_type = 'ai_interview'
            JOIN ai_interview_configs aic ON gps.config_id = aic.config_id
            WHERE ca.candidate_id = :cid 
                AND aic.config_id = :config_id
                AND (ca.is_deleted = false OR ca.is_deleted IS NULL)
            LIMIT 1
        """).bindparams(
            bindparam("cid", type_=pgUUID(as_uuid=True)),
            bindparam("config_id", type_=pgUUID(as_uuid=True)),
        ),
        {"cid": candidate.candidate_id, "config_id": UUID(request.config_id)}
    )
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="No matching interview configuration found")
    
    application_id = str(row[0])
    organization_id = str(row[1])
    interview_type = row[2] or "recorded"
    
    # Create ongoing_interviews record
    await session.execute(
        text("""
            INSERT INTO ongoing_interviews (
                session_id, config_id, application_id,
                organization_id, interview_type, status, started_at
            ) VALUES (
                :sid, :config_id, :app_id,
                :org_id, :itype, 'in_progress', NOW()
            )
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
            bindparam("config_id", type_=pgUUID(as_uuid=True)),
            bindparam("app_id", type_=pgUUID(as_uuid=True)),
            bindparam("org_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "sid": UUID(session_id),
            "config_id": UUID(request.config_id),
            "app_id": UUID(application_id),
            "org_id": UUID(organization_id),
            "itype": interview_type,
        }
    )
    await session.commit()
    
    return StartSessionResponse(
        session_id=session_id,
        message="Interview session started. You can now submit video responses.",
    )


@router.post("/response", response_model=SubmitResponseResponse)
async def submit_video_response(
    background_tasks: BackgroundTasks,
    session: DbSession,
    candidate: CurrentCandidate,
    session_id: UUID = Form(...),
    question_id: str = Form(...),
    question_text: str = Form(...),
    video: UploadFile = File(...),
    reference_answer: str | None = Form(None),
):
    """
    Submit a video response for a question (multipart/form-data upload).
    Stores the video file to disk and queues processing.
    """
    from uuid import uuid4
    import os
    import shutil
    
    # Verify session belongs to candidate
    result = await session.execute(
        text("""
            SELECT oi.session_id 
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            WHERE oi.session_id = :session_id AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": session_id, "candidate_id": candidate.candidate_id}
    )
    if not result.scalar():
        raise HTTPException(status_code=403, detail="Invalid session or unauthorized")

    response_id = str(uuid4())
    
    # Save uploaded video to disk
    upload_dir = "static/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = ".webm"
    if video.filename:
        _, ext = os.path.splitext(video.filename)
        if ext:
            file_ext = ext
            
    filename = f"{response_id}{file_ext}"
    file_path = os.path.join(upload_dir, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save video: {str(e)}")
        
    # URL for access (relative to backend base)
    video_url_db = f"/static/uploads/{filename}"
    # Absolute URL for worker
    video_url_full = f"http://localhost:8000/static/uploads/{filename}"

    await session.execute(
        text("""
            INSERT INTO interview_responses (
                response_id, session_id, question_id, question_order,
                question_text, video_url, retake_number, answered_at, processing_status
            ) VALUES (
                :response_id, :session_id, :question_id, :question_order,
                :question_text, :video_url, 1, NOW(), 'pending'
            )
        """).bindparams(
            bindparam("response_id", type_=pgUUID(as_uuid=True)),
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "response_id": UUID(response_id),
            "session_id": session_id,
            "question_id": question_id,
            "question_order": int(question_id.replace("q", "")) if question_id.startswith("q") else 0,
            "question_text": question_text,
            "video_url": video_url_db,
        }
    )
    await session.commit()
    
    # Queue processing task (using BackgroundTasks for MVP)
    # For production with high load, enable Celery + Redis
    from worker.tasks.video import process_video_logic
    background_tasks.add_task(
        process_video_logic,
        response_id=response_id,
        video_url=video_url_full,
        question_text=question_text,
        reference_answer=reference_answer,
    )
    task_id = f"bg-{response_id[:8]}"
    
    return SubmitResponseResponse(
        response_id=response_id,
        status="queued",
        task_id=str(task_id),
        message="Video uploaded and queued for processing."
    )


@router.get("/status/{session_id}", response_model=ProcessingStatusResponse)
async def get_processing_status(
    session_id: str,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Get processing status for all responses in a session.
    
    Returns transcript and evaluation results when available.
    """
    result = await session.execute(
        text("""
            SELECT 
                response_id, question_id, question_order, question_text,
                video_url, transcript, ai_score, ai_feedback, answered_at
            FROM interview_responses
            WHERE session_id = :sid
            ORDER BY question_order
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
        ),
        {"sid": UUID(session_id)}
    )
    rows = result.fetchall()
    
    responses = []
    all_processed = True
    
    for row in rows:
        has_transcript = row[5] is not None
        has_score = row[6] is not None
        
        if not has_transcript or not has_score:
            all_processed = False
        
        responses.append({
            "response_id": str(row[0]),
            "question_id": row[1],
            "question_order": row[2],
            "question_text": row[3],
            "video_url": row[4],
            "transcript": row[5],
            "score": float(row[6]) if row[6] else None,
            "feedback": row[7],
            "status": "completed" if has_score else ("transcribed" if has_transcript else "processing"),
        })
    
    overall_status = "completed" if all_processed and responses else ("processing" if responses else "no_responses")
    
    return ProcessingStatusResponse(
        session_id=session_id,
        status=overall_status,
        responses=responses,
    )


class CompleteSessionRequest(BaseModel):
    session_id: str


class CompleteSessionResponse(BaseModel):
    session_id: str
    status: str
    message: str


@router.post("/complete", response_model=CompleteSessionResponse)
async def complete_interview_session(
    request: CompleteSessionRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Mark an interview session as completed.
    
    Updates the ongoing_interviews status to 'completed', sets completed_at timestamp,
    and unlocks the next pipeline stage.
    """
    from uuid import uuid4
    from sqlalchemy import bindparam
    from sqlalchemy.dialects.postgresql import UUID as pgUUID
    
    # Verify the session belongs to this candidate
    result = await session.execute(
        text("""
            SELECT oi.session_id, ca.application_id, ca.group_id
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            WHERE oi.session_id = :sid AND ca.candidate_id = :cid
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
            bindparam("cid", type_=pgUUID(as_uuid=True)),
        ),
        {"sid": UUID(request.session_id), "cid": candidate.candidate_id}
    )
    row = result.mappings().first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found or doesn't belong to candidate")
    
    application_id = row["application_id"]
    group_id = row["group_id"]
    
    # Update session status
    await session.execute(
        text("""
            UPDATE ongoing_interviews
            SET status = 'completed', completed_at = NOW()
            WHERE session_id = :sid
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
        ),
        {"sid": UUID(request.session_id)}
    )
    
    # Update candidate pipeline progress for this stage
    await session.execute(
        text("""
            UPDATE candidate_pipeline_progress cpp
            SET status = 'completed',
                completed_at = NOW(),
                session_id = :sid,
                session_type = 'ai_interview'
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            JOIN group_pipeline_stages gps ON ca.group_id = gps.group_id 
                AND gps.stage_type = 'ai_interview'
            WHERE oi.session_id = :sid
              AND cpp.application_id = ca.application_id
              AND cpp.stage_id = gps.stage_id
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
        ),
        {"sid": UUID(request.session_id)}
    )
    
    # NOTE: Stage transitions are recruiter-controlled.
    # The recruiter opens/closes stages for the group. Candidates only get
    # their own progress marked as 'completed'. No auto-unlock of next stage.
    
    await session.commit()
    
    return CompleteSessionResponse(
        session_id=request.session_id,
        status="completed",
        message="Interview session completed successfully.",
    )
