"""
Candidate Interview API endpoints.

Handles the AI video interview flow:
- Get interview config (questions)
- Start interview session
- Submit video response
- Check processing status
"""
import json
import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import text, bindparam, String
from sqlalchemy.dialects.postgresql import UUID as pgUUID, JSONB

from app.api.deps import CurrentCandidate, DbSession
from app.core.integrity_metrics import integrity_metrics


router = APIRouter(prefix="/interview", tags=["Candidate Interview"])
logger = logging.getLogger(__name__)

INTERVIEW_INTEGRITY_EVENT_MAX_PER_MINUTE = 45
INTERVIEW_INTEGRITY_DUP_WINDOW_SECONDS = 8
INTERVIEW_ENFORCEMENT_WINDOW_SECONDS = 120
INTERVIEW_ENFORCEMENT_CRITICAL_EVENTS = {
    "paste_attempt",
    "paste_shortcut",
    "multi_face_detected",
    "voice_mismatch",
    "speaker_mismatch",
    "fusion_high_confidence_risk",
}


def _normalize_questions(questions_data) -> list[dict]:
    if isinstance(questions_data, dict):
        questions = questions_data.get("items") or questions_data.get("questions") or []
    elif isinstance(questions_data, list):
        questions = questions_data
    else:
        questions = []

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
    return normalized_questions


def _resolve_reference_answer(questions_data, question_id: str, question_text: str) -> str | None:
    normalized_questions = _normalize_questions(questions_data)
    for index, question in enumerate(normalized_questions, start=1):
        if question["id"] == question_id:
            return question.get("reference_answer")
        if question_id.startswith("q") and question_id[1:].isdigit() and int(question_id[1:]) == index:
            return question.get("reference_answer")
        if question.get("text", "").strip() == question_text.strip():
            return question.get("reference_answer")
    return None


def _resolve_rubric(questions_data, question_id: str, question_text: str) -> str | None:
    """Extract rubric from questions data for a specific question."""
    normalized_questions = _normalize_questions(questions_data)
    for index, question in enumerate(normalized_questions, start=1):
        if question["id"] == question_id:
            return question.get("rubric")
        if question_id.startswith("q") and question_id[1:].isdigit() and int(question_id[1:]) == index:
            return question.get("rubric")
        if question.get("text", "").strip() == question_text.strip():
            return question.get("rubric")
    return None


def _parse_feedback_value(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("feedback") or json.dumps(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return value
        if isinstance(parsed, dict):
            return parsed.get("feedback") or json.dumps(parsed)
        return str(parsed)
    return str(value)


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


class InterviewIntegrityEventRequest(BaseModel):
    session_id: str
    event_type: str
    severity: str | None = "low"
    source: str | None = "candidate_portal"
    confidence: float | None = None
    timestamp_seconds: int | None = None
    evidence: str | None = None
    metadata: dict | None = None


class InterviewIntegrityEventResponse(BaseModel):
    flag_id: str
    status: str
    message: str
    enforcement_action: str = "none"
    enforcement_reason: str | None = None


class InterviewIntegrityDecisionResponse(BaseModel):
    candidate_id: str
    application_id: str
    session_id: str
    session_type: str = "ai_interview"
    decision: str
    cheating_detected: bool
    total_flags: int
    high_flags: int
    medium_flags: int
    low_flags: int
    critical_flags: int
    latest_event_type: str | None = None
    recent_events: list[dict]
    enforcement_action: str = "none"
    enforcement_reason: str | None = None
    updated_at: str


def _normalize_severity(severity: str | None) -> str:
    normalized = (severity or "low").strip().lower()
    if normalized not in {"low", "medium", "high"}:
        return "low"
    return normalized


def _log_interview_integrity_metric(metric_name: str, **fields) -> None:
    payload = {
        "metric": "interview_integrity_event",
        "metric_name": metric_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    logger.info("interview_integrity_metric %s", json.dumps(payload, default=str, sort_keys=True))


async def _interview_enforcement_action(
    session,
    session_id: UUID,
    latest_event_type: str | None = None,
    latest_severity: str | None = None,
) -> tuple[str, str | None]:
    counters = await session.execute(
        text("""
            SELECT
              COUNT(*) FILTER (WHERE severity = 'high') AS high_cnt,
                            COUNT(*) FILTER (WHERE severity = 'medium') AS medium_cnt
            FROM proctoring_flags
            WHERE session_id = :session_id
              AND session_type = 'ai_interview'
              AND created_at >= NOW() - (:window_s || ' seconds')::INTERVAL
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_id,
            "window_s": str(INTERVIEW_ENFORCEMENT_WINDOW_SECONDS),
        },
    )
    row = counters.mappings().first() or {}
    high_cnt = int(row.get("high_cnt") or 0)
    medium_cnt = int(row.get("medium_cnt") or 0)

    event_type = (latest_event_type or "").strip().lower()
    severity = _normalize_severity(latest_severity)

    if event_type in INTERVIEW_ENFORCEMENT_CRITICAL_EVENTS:
        return "terminate", "critical_event_detected"
    if high_cnt >= 2 or medium_cnt >= 4:
        return "pause", "repeated_high_risk_pattern"
    if medium_cnt >= 2:
        return "warn", "elevated_risk_pattern"
    return "none", None


def _interview_decision_from_counts(
    total_flags: int,
    high_cnt: int,
    medium_cnt: int,
    critical_cnt: int,
    fusion_cnt: int,
) -> tuple[str, bool]:
    if critical_cnt > 0 or fusion_cnt > 0 or high_cnt >= 2 or medium_cnt >= 4:
        return "confirmed_cheating", True
    if high_cnt >= 1 or medium_cnt >= 2 or total_flags >= 3:
        return "suspicious_review", False
    if total_flags == 0:
        return "clean", False
    return "monitoring", False


async def _is_interview_integrity_rate_limited(session, session_id: UUID, detected_by: str) -> bool:
    res = await session.execute(
        text("""
            SELECT COUNT(*) AS cnt
            FROM proctoring_flags
            WHERE session_id = :session_id
              AND session_type = 'ai_interview'
              AND detected_by = :detected_by
              AND created_at >= NOW() - INTERVAL '1 minute'
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_id,
            "detected_by": detected_by,
        },
    )
    return int(res.scalar() or 0) >= INTERVIEW_INTEGRITY_EVENT_MAX_PER_MINUTE


async def _is_duplicate_interview_integrity_event(
    session,
    session_id: UUID,
    event_type: str,
    detected_by: str,
) -> bool:
    res = await session.execute(
        text("""
            SELECT flag_id
            FROM proctoring_flags
            WHERE session_id = :session_id
              AND session_type = 'ai_interview'
              AND event_type = :event_type
              AND detected_by = :detected_by
              AND created_at >= NOW() - (:dup_window || ' seconds')::INTERVAL
            LIMIT 1
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_id,
            "event_type": event_type,
            "detected_by": detected_by,
            "dup_window": str(INTERVIEW_INTEGRITY_DUP_WINDOW_SECONDS),
        },
    )
    return res.mappings().first() is not None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/config", response_model=InterviewConfigResponse)
async def get_interview_config(candidate: CurrentCandidate, session: DbSession):
    """
    Get interview configuration for the candidate's current AI interview stage.
    
    Returns questions, time limits, and instructions.
    """
    # Resolve the active stage first so live interviews can use their AI mirror config.
    stage_result = await session.execute(
        text("""
            SELECT 
                gps.stage_type,
                gps.config_id,
                gps.acceptance_criteria
            FROM candidate_applications ca
            JOIN group_pipeline_stages gps ON ca.group_id = gps.group_id AND gps.stage_type IN ('ai_interview', 'live_interview')
            JOIN candidate_pipeline_progress cpp
                ON cpp.application_id = ca.application_id
                AND cpp.stage_id = gps.stage_id
            WHERE ca.candidate_id = :cid
              AND gps.state = 'active'
              AND cpp.status IN ('unlocked', 'in_progress')
              AND (ca.is_deleted = false OR ca.is_deleted IS NULL)
            LIMIT 1
        """).bindparams(
            bindparam("cid", type_=pgUUID(as_uuid=True)),
        ),
        {"cid": candidate.candidate_id}
    )
    stage_row = stage_result.mappings().first()
    
    if not stage_row:
        raise HTTPException(status_code=404, detail="No AI interview configured for this candidate")

    if stage_row["stage_type"] == "live_interview":
        criteria = stage_row["acceptance_criteria"] or {}
        mirror_id = None
        if isinstance(criteria, dict):
            mirror_id = criteria.get("candidate_interview_config_id") or criteria.get("interview_config_id")

        if mirror_id:
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
                    FROM ai_interview_configs aic
                    WHERE aic.config_id = :cid
                      AND aic.is_deleted = false
                    LIMIT 1
                """).bindparams(
                    bindparam("cid", type_=pgUUID(as_uuid=True)),
                ),
                {"cid": UUID(str(mirror_id))}
            )
            row = result.fetchone()
            if row:
                normalized_questions = _normalize_questions(row[3] or {})
                return InterviewConfigResponse(
                    config_id=str(row[0]),
                    title=row[1],
                    instructions=row[2],
                    questions=normalized_questions,
                    think_time_seconds=row[4],
                    answer_time_seconds=row[5],
                    max_retakes=row[6],
                )

        live_result = await session.execute(
            text("""
                SELECT 
                    lic.config_id,
                    lic.title,
                    lic.instructions,
                    lic.suggested_questions,
                    COALESCE(lic.duration_minutes, 60) as duration_minutes
                FROM live_interview_configs lic
                WHERE lic.config_id = :cid
                  AND lic.is_deleted = false
                LIMIT 1
            """).bindparams(
                bindparam("cid", type_=pgUUID(as_uuid=True)),
            ),
            {"cid": UUID(str(stage_row["config_id"]))}
        )
        row = live_result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No live interview configured for this candidate")

        normalized_questions = _normalize_questions(row[3] or {})
        return InterviewConfigResponse(
            config_id=str(row[0]),
            title=row[1],
            instructions=row[2],
            questions=normalized_questions,
            think_time_seconds=30,
            answer_time_seconds=120,
            max_retakes=1,
        )

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
            FROM ai_interview_configs aic
            WHERE aic.config_id = :cid
              AND aic.is_deleted = false
            LIMIT 1
        """).bindparams(
            bindparam("cid", type_=pgUUID(as_uuid=True)),
        ),
        {"cid": UUID(str(stage_row["config_id"]))}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No AI interview configured for this candidate")

    normalized_questions = _normalize_questions(row[3] or {})

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
    
    # Get candidate's application, organization, and stage progress for this interview config
    result = await session.execute(
        text("""
            SELECT 
                ca.application_id,
                gps.stage_type,
                gps.config_id,
                gps.acceptance_criteria,
                cpp.progress_id,
                cpp.status
            FROM candidate_applications ca
            JOIN group_pipeline_stages gps ON ca.group_id = gps.group_id 
                AND gps.stage_type IN ('ai_interview', 'live_interview')
            JOIN candidate_pipeline_progress cpp
                ON cpp.application_id = ca.application_id
                AND cpp.stage_id = gps.stage_id
            WHERE ca.candidate_id = :cid 
                AND gps.state = 'active'
                AND cpp.status IN ('unlocked', 'in_progress')
                AND (ca.is_deleted = false OR ca.is_deleted IS NULL)
            LIMIT 1
        """).bindparams(
            bindparam("cid", type_=pgUUID(as_uuid=True)),
        ),
        {"cid": candidate.candidate_id}
    )
    row = result.mappings().first()
    
    if not row:
        raise HTTPException(status_code=404, detail="No matching interview configuration found")
    
    application_id = str(row["application_id"])
    stage_type = row["stage_type"]
    stage_config_id = row["config_id"]
    criteria = row["acceptance_criteria"] or {}
    progress_id = row["progress_id"]
    interview_type = "recorded"

    # Resolve the actual AI interview config used for the ongoing session.
    resolved_config_id = None
    if stage_type == "live_interview" and isinstance(criteria, dict):
        resolved_config_id = criteria.get("candidate_interview_config_id") or criteria.get("interview_config_id")
    else:
        resolved_config_id = stage_config_id

    if not resolved_config_id:
        raise HTTPException(status_code=404, detail="No interview configuration found for this stage")

    config_lookup = await session.execute(
        text("""
            SELECT config_id, organization_id, interview_type
            FROM ai_interview_configs
            WHERE config_id = :config_id
              AND is_deleted = false
            LIMIT 1
        """).bindparams(
            bindparam("config_id", type_=pgUUID(as_uuid=True)),
        ),
        {"config_id": UUID(str(resolved_config_id))}
    )
    config_row = config_lookup.mappings().first()
    if config_row:
        organization_id = str(config_row["organization_id"])
        interview_type = config_row["interview_type"] or ("live_ai" if stage_type == "live_interview" else "recorded")
    elif stage_type == "live_interview":
        # Fallback: if the AI mirror is missing, create a minimal one from the live config.
        from app.models import AIInterviewConfig, LiveInterviewConfig

        live_lookup = await session.execute(
            text("""
                SELECT config_id, organization_id, position_id, title, instructions, suggested_questions, duration_minutes
                FROM live_interview_configs
                WHERE config_id = :config_id
                  AND is_deleted = false
                LIMIT 1
            """).bindparams(
                bindparam("config_id", type_=pgUUID(as_uuid=True)),
            ),
            {"config_id": UUID(str(stage_config_id))}
        )
        live_row = live_lookup.mappings().first()
        if not live_row:
            raise HTTPException(status_code=404, detail="No matching interview configuration found")

        mirror_cfg = AIInterviewConfig(
            organization_id=UUID(str(live_row["organization_id"])),
            position_id=live_row["position_id"],
            title=live_row["title"] or "Live Interview",
            interview_type="live_ai",
            instructions=live_row["instructions"],
            max_retakes=1,
            questions=live_row["suggested_questions"] or {"items": []},
            total_duration_minutes=live_row["duration_minutes"] or 60,
            show_ai_feedback=True,
            recording_required=True,
        )
        session.add(mirror_cfg)
        await session.flush()
        resolved_config_id = mirror_cfg.config_id
        organization_id = str(mirror_cfg.organization_id)
        interview_type = mirror_cfg.interview_type
    else:
        raise HTTPException(status_code=404, detail="No matching interview configuration found")
    
    # Map interview_type to stage_type
    current_stage_type = 'ai_interview' if interview_type == 'recorded' else 'live_interview'

    existing_result = await session.execute(
        text("""
            SELECT session_id
            FROM ongoing_interviews
            WHERE application_id = :app_id
                AND config_id = :config_id
              AND status IN ('in_progress', 'not_started')
            LIMIT 1
        """).bindparams(
            bindparam("app_id", type_=pgUUID(as_uuid=True)),
            bindparam("config_id", type_=pgUUID(as_uuid=True)),
        ),
        {"app_id": UUID(application_id), "config_id": UUID(str(resolved_config_id))}
    )
    existing_session = existing_result.fetchone()
    if existing_session:
        # Update session status to in_progress if it's not_started
        await session.execute(
            text("""
                UPDATE ongoing_interviews
                SET status = 'in_progress', started_at = COALESCE(started_at, NOW())
                WHERE session_id = :sid AND status = 'not_started'
            """).bindparams(
                bindparam("sid", type_=pgUUID(as_uuid=True)),
            ),
            {"sid": existing_session[0]}
        )
        await session.execute(
            text("""
                UPDATE candidate_pipeline_progress
                SET status = 'in_progress',
                    session_id = :sid,
                    session_type = :stype,
                    started_at = COALESCE(started_at, NOW())
                WHERE progress_id = :progress_id
            """).bindparams(
                bindparam("sid", type_=pgUUID(as_uuid=True)),
                bindparam("progress_id", type_=pgUUID(as_uuid=True)),
                bindparam("stype", type_=String),
            ),
            {"sid": existing_session[0], "progress_id": progress_id, "stype": current_stage_type}
        )
        await session.commit()
        return StartSessionResponse(
            session_id=str(existing_session[0]),
            message="Interview session resumed.",
        )

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
                bindparam("itype", type_=String),
        ),
        {
            "sid": UUID(session_id),
            "app_id": UUID(application_id),
            "org_id": UUID(organization_id),
                "config_id": UUID(str(resolved_config_id)),
                "itype": interview_type,
        }
    )

    await session.execute(
        text("""
            UPDATE candidate_pipeline_progress
            SET status = 'in_progress',
                session_id = :sid,
                session_type = 'ai_interview',
                started_at = COALESCE(started_at, NOW())
            WHERE progress_id = :progress_id
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
            bindparam("progress_id", type_=pgUUID(as_uuid=True)),
        ),
        {"sid": UUID(session_id), "progress_id": progress_id}
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
            SELECT oi.session_id, oi.status, aic.questions
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            LEFT JOIN ai_interview_configs aic ON oi.config_id = aic.config_id
            WHERE oi.session_id = :session_id AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": session_id, "candidate_id": candidate.candidate_id}
    )
    session_row = result.mappings().first()
    if not session_row:
        raise HTTPException(status_code=403, detail="Invalid session or unauthorized")
    if session_row["status"] == "completed":
        raise HTTPException(status_code=400, detail="Interview session already completed")

    if not reference_answer:
        reference_answer = _resolve_reference_answer(
            session_row["questions"] or {},
            question_id,
            question_text,
        )
    
    rubric = _resolve_rubric(
        session_row["questions"] or {},
        question_id,
        question_text,
    )

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

    # Determine question_order safely — count existing responses for this session
    order_result = await session.execute(
        text("""
            SELECT COUNT(*) AS cnt FROM interview_responses
            WHERE session_id = :session_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": session_id}
    )
    order_row = order_result.mappings().first()
    next_order = (order_row["cnt"] if order_row else 0) + 1

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
            "question_order": next_order,
            "question_text": question_text,
            "video_url": video_url_db,
        }
    )
    await session.commit()
    
    # Queue processing task (using BackgroundTasks for MVP)
    # For production with high load, enable Celery + Redis
    from worker.tasks.video import process_video_logic
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[VIDEO] Adding background task for response {response_id}")
    background_tasks.add_task(
        process_video_logic,
        response_id=response_id,
        video_url=video_url_full,
        question_text=question_text,
        reference_answer=reference_answer,
        rubric=rubric,
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
    session_result = await session.execute(
        text("""
            SELECT oi.session_id, oi.status
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            WHERE oi.session_id = :sid
              AND ca.candidate_id = :cid
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
            bindparam("cid", type_=pgUUID(as_uuid=True)),
        ),
        {"sid": UUID(session_id), "cid": candidate.candidate_id}
    )
    session_row = session_result.mappings().first()
    if not session_row:
        raise HTTPException(status_code=404, detail="Interview session not found")

    result = await session.execute(
        text("""
            SELECT 
                response_id, question_id, question_order, question_text,
                video_url, transcript, ai_score, ai_feedback, answered_at,
                processing_status
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
    any_failed = False
    any_processing = False
    completed_count = 0
    
    for row in rows:
        derived_status = row[9]
        if not derived_status:
            if row[6] is not None:
                derived_status = "completed"
            elif row[5]:
                derived_status = "processing"
            else:
                derived_status = "pending"

        if derived_status == "failed":
            any_failed = True
        elif derived_status in ("pending", "processing"):
            any_processing = True
        elif derived_status == "completed":
            completed_count += 1

        responses.append({
            "response_id": str(row[0]),
            "question_id": row[1],
            "question_order": row[2],
            "question_text": row[3],
            "video_url": row[4],
            "transcript": row[5],
            "score": float(row[6]) if row[6] is not None else None,
            "feedback": _parse_feedback_value(row[7]),
            "status": derived_status,
        })
    
    if any_failed:
        overall_status = "failed"
    elif responses and completed_count == len(responses) and session_row["status"] == "completed":
        overall_status = "completed"
    elif responses or session_row["status"] in ("in_progress", "completed"):
        overall_status = "processing" if any_processing or responses else session_row["status"]
    else:
        overall_status = "no_responses"
    
    return ProcessingStatusResponse(
        session_id=session_id,
        status=overall_status,
        responses=responses,
    )


@router.post("/integrity-event", response_model=InterviewIntegrityEventResponse)
async def report_interview_integrity_event(
    request: InterviewIntegrityEventRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    try:
        session_uuid = UUID(request.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid session_id format") from exc

    verify = await session.execute(
        text("""
            SELECT oi.session_id,
                   oi.application_id,
                   oi.organization_id,
                   oi.status,
                   oi.started_at
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            WHERE oi.session_id = :session_id
              AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_uuid,
            "candidate_id": candidate.candidate_id,
        },
    )
    interview_session = verify.mappings().first()
    if not interview_session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if interview_session["status"] == "completed":
        raise HTTPException(status_code=400, detail="Interview already completed")

    normalized_event_type = (request.event_type or "").strip().lower()
    if not normalized_event_type:
        raise HTTPException(status_code=400, detail="event_type is required")

    detected_by = (request.source or "candidate_portal")[:50]

    if await _is_interview_integrity_rate_limited(session, session_uuid, detected_by):
        integrity_metrics.inc(stage="ai_interview", outcome="dropped", reason="rate_limited")
        _log_interview_integrity_metric(
            "interview_integrity_dropped_rate_limited",
            session_id=str(session_uuid),
            candidate_id=str(candidate.candidate_id),
            event_type=normalized_event_type,
            detected_by=detected_by,
            reason="rate_limited",
        )
        return InterviewIntegrityEventResponse(
            flag_id="rate_limited",
            status="dropped",
            message="Integrity event dropped due to rate limiting.",
            enforcement_action="none",
        )

    if await _is_duplicate_interview_integrity_event(session, session_uuid, normalized_event_type, detected_by):
        integrity_metrics.inc(stage="ai_interview", outcome="dropped", reason="duplicate_recent_window")
        _log_interview_integrity_metric(
            "interview_integrity_dropped_duplicate",
            session_id=str(session_uuid),
            candidate_id=str(candidate.candidate_id),
            event_type=normalized_event_type,
            detected_by=detected_by,
            reason="duplicate_recent_window",
            duplicate_window_seconds=INTERVIEW_INTEGRITY_DUP_WINDOW_SECONDS,
        )
        return InterviewIntegrityEventResponse(
            flag_id="duplicate",
            status="dropped",
            message="Integrity event dropped as duplicate in recent window.",
            enforcement_action="none",
        )

    event_ts = request.timestamp_seconds
    if event_ts is None:
        started_at = interview_session["started_at"]
        if started_at:
            event_ts = max(
                0,
                int((datetime.now(timezone.utc) - started_at.replace(tzinfo=timezone.utc)).total_seconds()),
            )
        else:
            event_ts = 0

    evidence_payload = {
        "source": request.source or "candidate_portal",
        "confidence": request.confidence,
        "evidence": request.evidence,
        "metadata": request.metadata or {},
    }

    flag_id = uuid4()
    await session.execute(
        text("""
            INSERT INTO proctoring_flags (
                flag_id,
                application_id,
                session_id,
                session_type,
                organization_id,
                timestamp_seconds,
                event_type,
                severity,
                evidence,
                detected_by,
                status,
                created_at
            )
            VALUES (
                :flag_id,
                :application_id,
                :session_id,
                'ai_interview',
                :organization_id,
                :timestamp_seconds,
                :event_type,
                :severity,
                :evidence,
                :detected_by,
                'pending',
                NOW()
            )
        """).bindparams(
            bindparam("flag_id", type_=pgUUID(as_uuid=True)),
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("organization_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "flag_id": flag_id,
            "application_id": interview_session["application_id"],
            "session_id": interview_session["session_id"],
            "organization_id": interview_session["organization_id"],
            "timestamp_seconds": event_ts,
            "event_type": normalized_event_type,
            "severity": _normalize_severity(request.severity),
            "evidence": json.dumps(evidence_payload),
            "detected_by": detected_by,
        },
    )

    integrity_metrics.inc(stage="ai_interview", outcome="accepted", reason="none")

    _log_interview_integrity_metric(
        "interview_integrity_accepted",
        session_id=str(interview_session["session_id"]),
        candidate_id=str(candidate.candidate_id),
        application_id=str(interview_session["application_id"]),
        event_type=normalized_event_type,
        severity=_normalize_severity(request.severity),
        detected_by=detected_by,
    )

    enforcement_action, enforcement_reason = await _interview_enforcement_action(
        session=session,
        session_id=interview_session["session_id"],
        latest_event_type=normalized_event_type,
        latest_severity=request.severity,
    )

    await session.commit()

    return InterviewIntegrityEventResponse(
        flag_id=str(flag_id),
        status="pending",
        message="Integrity event recorded.",
        enforcement_action=enforcement_action,
        enforcement_reason=enforcement_reason,
    )


@router.get("/integrity-decision/{session_id}", response_model=InterviewIntegrityDecisionResponse)
async def get_interview_integrity_decision(
    session_id: str,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """Return explicit cheating decision and evidence summary for an interview session."""
    try:
        session_uuid = UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid session_id format") from exc

    verify = await session.execute(
        text("""
            SELECT oi.session_id, oi.application_id
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            WHERE oi.session_id = :session_id
              AND ca.candidate_id = :candidate_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_uuid,
            "candidate_id": candidate.candidate_id,
        },
    )
    row = verify.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Interview session not found")

    counts_res = await session.execute(
        text("""
            SELECT
                COUNT(*) AS total_flags,
                COUNT(*) FILTER (WHERE severity = 'high') AS high_cnt,
                COUNT(*) FILTER (WHERE severity = 'medium') AS medium_cnt,
                COUNT(*) FILTER (WHERE severity = 'low') AS low_cnt,
                COUNT(*) FILTER (
                    WHERE event_type IN (
                        'paste_attempt',
                        'paste_shortcut',
                        'multi_face_detected',
                        'voice_mismatch',
                        'speaker_mismatch',
                        'fusion_high_confidence_risk'
                    )
                ) AS critical_cnt,
                COUNT(*) FILTER (WHERE event_type = 'fusion_high_confidence_risk') AS fusion_cnt
            FROM proctoring_flags
            WHERE session_id = :session_id
              AND session_type = 'ai_interview'
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": session_uuid},
    )
    counts = counts_res.mappings().first() or {}

    latest_event_res = await session.execute(
        text("""
            SELECT event_type
            FROM proctoring_flags
            WHERE session_id = :session_id
              AND session_type = 'ai_interview'
            ORDER BY created_at DESC
            LIMIT 1
        """).bindparams(bindparam("session_id", type_=pgUUID(as_uuid=True))),
        {"session_id": session_uuid},
    )
    latest_event_row = latest_event_res.mappings().first() or {}

    recent_res = await session.execute(
        text("""
            SELECT event_type, severity, detected_by, created_at
            FROM proctoring_flags
            WHERE session_id = :session_id
              AND session_type = 'ai_interview'
            ORDER BY created_at DESC
            LIMIT 10
        """).bindparams(bindparam("session_id", type_=pgUUID(as_uuid=True))),
        {"session_id": session_uuid},
    )
    recent_events = [
        {
            "event_type": r["event_type"],
            "severity": r["severity"],
            "detected_by": r["detected_by"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in recent_res.mappings().all()
    ]

    total_flags = int(counts.get("total_flags") or 0)
    high_cnt = int(counts.get("high_cnt") or 0)
    medium_cnt = int(counts.get("medium_cnt") or 0)
    low_cnt = int(counts.get("low_cnt") or 0)
    critical_cnt = int(counts.get("critical_cnt") or 0)
    fusion_cnt = int(counts.get("fusion_cnt") or 0)

    decision, cheating_detected = _interview_decision_from_counts(
        total_flags=total_flags,
        high_cnt=high_cnt,
        medium_cnt=medium_cnt,
        critical_cnt=critical_cnt,
        fusion_cnt=fusion_cnt,
    )

    enforcement_action, enforcement_reason = await _interview_enforcement_action(
        session=session,
        session_id=session_uuid,
    )

    return InterviewIntegrityDecisionResponse(
        candidate_id=str(candidate.candidate_id),
        application_id=str(row["application_id"]),
        session_id=str(row["session_id"]),
        decision=decision,
        cheating_detected=cheating_detected,
        total_flags=total_flags,
        high_flags=high_cnt,
        medium_flags=medium_cnt,
        low_flags=low_cnt,
        critical_flags=critical_cnt,
        latest_event_type=latest_event_row.get("event_type"),
        recent_events=recent_events,
        enforcement_action=enforcement_action,
        enforcement_reason=enforcement_reason,
        updated_at=datetime.now(timezone.utc).isoformat(),
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
    
    Updates the ongoing_interviews status to 'completed' and sets completed_at timestamp.
    """
    from uuid import uuid4
    from sqlalchemy import bindparam
    from sqlalchemy.dialects.postgresql import UUID as pgUUID
    
    # Verify the session belongs to this candidate
    result = await session.execute(
        text("""
            SELECT oi.session_id, ca.application_id, ca.group_id, oi.interview_type
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
    interview_type = row["interview_type"]
    
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
    
    # Map backend interview types to pipeline stage types
    stage_type = 'ai_interview' if interview_type == 'recorded' else 'live_interview'
    
    # Update candidate pipeline progress for this stage
    await session.execute(
        text("""
            UPDATE candidate_pipeline_progress
            SET status = 'completed',
                completed_at = NOW(),
                session_id = :sid,
                session_type = :session_type
            WHERE application_id = :application_id
              AND stage_id IN (
                  SELECT gps.stage_id 
                  FROM group_pipeline_stages gps
                  WHERE gps.group_id = :group_id
                    AND gps.stage_type = :stage_type
              )
        """).bindparams(
            bindparam("sid", type_=pgUUID(as_uuid=True)),
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
            bindparam("group_id", type_=pgUUID(as_uuid=True)),
            bindparam("session_type", type_=String),
            bindparam("stage_type", type_=String),
        ),
        {
            "sid": UUID(request.session_id),
            "application_id": application_id,
            "group_id": group_id,
            "session_type": stage_type,
            "stage_type": stage_type
        }
    )
    
    # --- Trigger Recruiter Notification ---
    # Fetch recruiter ID and candidate info
    recruiter_res = await session.execute(
        text("""
            SELECT 
                cg.assigned_hr_id,
                ca.organization_id,
                cp.full_name,
                cg.group_name,
                ca.application_id
            FROM ongoing_interviews oi
            JOIN candidate_applications ca ON oi.application_id = ca.application_id
            JOIN candidate_profiles cp ON ca.candidate_id = cp.candidate_id
            JOIN candidate_groups cg ON ca.group_id = cg.group_id
            WHERE oi.session_id = :sid
            LIMIT 1
        """),
        {"sid": request.session_id}
    )
    recruiter_row = recruiter_res.fetchone()
    
    if recruiter_row and recruiter_row[0]:  # assigned_hr_id
        await session.execute(
            text("""
                INSERT INTO notifications (
                    notification_id, organization_id, recipient_user_id,
                    type, title, message, data, is_read, created_at
                ) VALUES (
                    gen_random_uuid(), :org_id, :uid,
                    'stage_completed', :title, :msg, :data, false, NOW()
                )
            """).bindparams(
                bindparam("org_id", type_=pgUUID(as_uuid=True)),
                bindparam("uid", type_=pgUUID(as_uuid=True)),
                bindparam("title", type_=String),
                bindparam("msg", type_=String),
                bindparam("data", type_=JSONB),
            ),
            {
                "org_id": UUID(str(recruiter_row[1])),
                "uid": UUID(str(recruiter_row[0])),
                "title": f"{'Live' if interview_type != 'recorded' else 'AI'} Interview Completed",
                "msg": f"Candidate {recruiter_row[2]} has completed their {'live' if interview_type != 'recorded' else 'AI'} interview for group {recruiter_row[3]}.",
                "data": {"session_id": str(request.session_id), "application_id": str(recruiter_row[4])}
            }
        )
    
    await session.commit()
    
    return CompleteSessionResponse(
        session_id=request.session_id,
        status="completed",
        message="Interview session completed successfully.",
    )
