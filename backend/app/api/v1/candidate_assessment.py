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
import os
from uuid import UUID, uuid4
import asyncio
import subprocess
import tempfile
import time as time_module
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from fastapi import UploadFile, File, Form
from sqlalchemy import text, bindparam
from sqlalchemy.dialects.postgresql import UUID as pgUUID, JSONB
from app.api.deps import CurrentCandidate, DbSession
from app.core.integrity_metrics import integrity_metrics


logger = logging.getLogger(__name__)

AI_SERVICE_URL = "http://localhost:8001"
INTEGRITY_EVENT_MAX_PER_MINUTE = 45
INTEGRITY_DUP_WINDOW_SECONDS = 8
INTEGRITY_ENFORCEMENT_WINDOW_SECONDS = 120
INTEGRITY_ENFORCEMENT_CRITICAL_EVENTS = {
    "paste_attempt",
    "paste_shortcut",
    "multi_face_detected",
    "voice_mismatch",
    "speaker_mismatch",
    "fusion_high_confidence_risk",
}

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


class IntegrityEventRequest(BaseModel):
    """Request to log a proctoring/integrity event during an assessment session."""
    session_id: str
    event_type: str = Field(min_length=1, max_length=50)
    severity: str = Field(default="low", max_length=10)
    source: str | None = Field(default=None, max_length=50)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    timestamp_seconds: int | None = Field(default=None, ge=0)
    evidence: str | None = None
    metadata: dict | None = None


class IntegrityEventResponse(BaseModel):
    """Response after storing an integrity event."""
    flag_id: str
    status: str
    message: str
    enforcement_action: str = "none"
    enforcement_reason: str | None = None


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


def _collect_candidate_keywords(
    cv_skills: list | None,
    cv_parsed_data: dict | None,
    cv_github_profile: dict | None,
    gh_top_languages: dict | None,
    gh_analysis_data: dict | None,
) -> list[str]:
    keywords: set[str] = set()

    for item in cv_skills or []:
        text = str(item or "").strip().lower()
        if text:
            keywords.add(text)

    if isinstance(gh_top_languages, dict):
        for lang in gh_top_languages.keys():
            text = str(lang or "").strip().lower()
            if text:
                keywords.add(text)

    for payload in [cv_parsed_data, cv_github_profile, gh_analysis_data]:
        if isinstance(payload, dict):
            for field in ["skills", "keywords", "matched_topics", "topics", "archetypes"]:
                value = payload.get(field)
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            for nested_key in ["name", "title", "pillar_name"]:
                                if nested_key in item:
                                    text = str(item.get(nested_key) or "").strip().lower()
                                    if text:
                                        keywords.add(text)
                        else:
                            text = str(item or "").strip().lower()
                            if text:
                                keywords.add(text)

    return sorted([kw for kw in keywords if len(kw) >= 2])


def _score_question_for_candidate(question: dict, candidate_keywords: list[str]) -> tuple[int, list[str]]:
    if not candidate_keywords:
        return 0, []

    text_blob = " ".join([
        str(question.get("question_text") or ""),
        str(question.get("question_type") or ""),
        str(question.get("question_config") or ""),
    ]).lower()

    tags = []
    qcfg = question.get("question_config")
    if isinstance(qcfg, dict):
        raw_tags = qcfg.get("tags")
        if isinstance(raw_tags, list):
            tags = [str(t or "").strip().lower() for t in raw_tags if str(t or "").strip()]

    matched: list[str] = []
    score = 0
    for kw in candidate_keywords:
        if kw in text_blob:
            matched.append(kw)
            score += 2
        elif any(kw == tag or kw in tag for tag in tags):
            matched.append(kw)
            score += 3

    return score, sorted(set(matched))


def _normalize_github_question(raw: dict, order: int) -> dict | None:
    if not isinstance(raw, dict):
        return None
    q_text = str(raw.get("question") or raw.get("question_text") or "").strip()
    if not q_text:
        return None

    q_type = str(raw.get("type") or raw.get("question_type") or "essay").strip().lower()
    if q_type not in {"mcq", "essay", "coding"}:
        q_type = "essay"

    options = raw.get("options") if isinstance(raw.get("options"), list) else []
    points = int(raw.get("points") or 10)

    question_config = {
        "source": "github_analysis",
        "difficulty": raw.get("difficulty") or "Medium",
        "selection_reason": raw.get("selection_reason") or "Generated from GitHub profile analysis",
        "source_file": raw.get("source_file") or "",
    }
    if options:
        question_config["options"] = options

    rubric_checks = raw.get("rubric_yes_no_checks") if isinstance(raw.get("rubric_yes_no_checks"), list) else []
    if q_type == "essay":
        if not rubric_checks:
            rubric_checks = [
                "Answer is technically accurate and coherent",
                "Includes practical reasoning or trade-offs",
                "Covers edge cases or failure handling",
                "Shows maintainability considerations",
                "Demonstrates performance/security awareness",
            ]
        question_config["rubric_yes_no_checks"] = rubric_checks

    correct_answer = {}
    ideal_answer = str(raw.get("ideal_answer") or raw.get("expected_answer") or "").strip()
    if ideal_answer:
        correct_answer["ideal_answer"] = ideal_answer
    if q_type == "mcq" and raw.get("correct_option") is not None:
        correct_answer["correct_option"] = raw.get("correct_option")

    return {
        "question_id": str(uuid4()),
        "question_type": q_type,
        "question_text": q_text,
        "question_config": question_config,
        "correct_answer": correct_answer,
        "points": points,
        "order": order,
    }

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
                            AND COALESCE(gps.state, 'not_started') != 'inactive'
              AND cpp.status IN ('unlocked', 'in_progress')
            ORDER BY gps.stage_order
            LIMIT 1
        """),
        {"candidate_id": str(candidate.candidate_id)}
    )
    row = result.mappings().first()
    if not row:
        # Fallback bootstrap: if the candidate has an active assessment stage but no
        # unlocked/in_progress progress row yet, initialize it so the candidate can start.
        fallback = await session.execute(
            text("""
                SELECT
                    ca.application_id,
                    ca.organization_id,
                    gps.stage_id,
                    gps.config_id     AS assessment_id,
                    a.title,
                    a.instructions,
                    a.duration_minutes,
                    a.passing_score,
                    cpp.progress_id,
                    cpp.status        AS progress_status
                FROM candidate_applications ca
                JOIN group_pipeline_stages gps
                    ON ca.group_id = gps.group_id
                JOIN assessments a
                    ON gps.config_id = a.assessment_id
                LEFT JOIN candidate_pipeline_progress cpp
                    ON cpp.application_id = ca.application_id
                   AND cpp.stage_id = gps.stage_id
                WHERE ca.candidate_id = :candidate_id
                  AND gps.stage_type  = 'assessment'
                  AND COALESCE(gps.state, 'not_started') != 'inactive'
                  AND (ca.is_deleted = false OR ca.is_deleted IS NULL)
                ORDER BY gps.stage_order
                LIMIT 1
            """),
            {"candidate_id": str(candidate.candidate_id)},
        )
        fallback_row = fallback.mappings().first()
        if not fallback_row:
            diag = await session.execute(
                text("""
                    SELECT
                      COUNT(*) AS app_count,
                      COUNT(*) FILTER (WHERE ca.group_id IS NOT NULL) AS grouped_app_count,
                      COUNT(*) FILTER (WHERE gps.stage_type = 'assessment') AS assessment_stage_count,
                      COUNT(*) FILTER (WHERE gps.stage_type = 'assessment' AND COALESCE(gps.state, 'not_started') != 'inactive') AS non_inactive_assessment_stage_count
                    FROM candidate_applications ca
                    LEFT JOIN group_pipeline_stages gps
                      ON gps.group_id = ca.group_id
                    WHERE ca.candidate_id = :candidate_id
                      AND (ca.is_deleted = false OR ca.is_deleted IS NULL)
                """),
                {"candidate_id": str(candidate.candidate_id)},
            )
            drow = diag.mappings().first() or {}
            if int(drow.get("app_count") or 0) == 0:
                raise HTTPException(status_code=404, detail="No application found for this candidate")
            if int(drow.get("grouped_app_count") or 0) == 0:
                raise HTTPException(status_code=404, detail="Candidate application is not assigned to any group")
            if int(drow.get("assessment_stage_count") or 0) == 0:
                raise HTTPException(status_code=404, detail="Candidate group has no assessment stage configured")
            if int(drow.get("non_inactive_assessment_stage_count") or 0) == 0:
                raise HTTPException(status_code=404, detail="Candidate assessment stage is inactive")
            raise HTTPException(status_code=404, detail="No assessment available for this candidate")

        existing_status = (fallback_row.get("progress_status") or "").strip().lower()
        now = datetime.now(timezone.utc)
        if existing_status in {"completed", "passed"}:
            raise HTTPException(status_code=400, detail="Assessment already completed")

        if fallback_row.get("progress_id") is None:
            await session.execute(
                text("""
                    INSERT INTO candidate_pipeline_progress (
                        progress_id,
                        application_id,
                        stage_id,
                        status,
                        session_type,
                        unlocked_at,
                        started_at
                    ) VALUES (
                        :progress_id,
                        :application_id,
                        :stage_id,
                        'in_progress',
                        'assessment',
                        :now_ts,
                        :now_ts
                    )
                """).bindparams(
                    bindparam("progress_id", type_=pgUUID(as_uuid=True)),
                    bindparam("application_id", type_=pgUUID(as_uuid=True)),
                    bindparam("stage_id", type_=pgUUID(as_uuid=True)),
                ),
                {
                    "progress_id": uuid4(),
                    "application_id": fallback_row["application_id"],
                    "stage_id": fallback_row["stage_id"],
                    "now_ts": now,
                },
            )
            await session.commit()
        elif existing_status in {"locked", "not_started", "unlocked", ""}:
            await session.execute(
                text("""
                    UPDATE candidate_pipeline_progress
                    SET status = 'in_progress',
                        session_type = 'assessment',
                        unlocked_at = COALESCE(unlocked_at, :now_ts),
                        started_at = COALESCE(started_at, :now_ts)
                    WHERE progress_id = :progress_id
                """).bindparams(
                    bindparam("progress_id", type_=pgUUID(as_uuid=True)),
                ),
                {
                    "progress_id": fallback_row["progress_id"],
                    "now_ts": now,
                },
            )
            await session.commit()

        row = {
            "assessment_id": fallback_row["assessment_id"],
            "stage_id": fallback_row["stage_id"],
            "title": fallback_row["title"],
            "instructions": fallback_row["instructions"],
            "duration_minutes": fallback_row["duration_minutes"],
            "passing_score": fallback_row["passing_score"],
        }

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


@router.post("/recording", response_model=dict)
async def upload_assessment_recording(
    session_id: str = Form(...),
    recording: UploadFile = File(...),
    candidate: CurrentCandidate = None,
    session: DbSession = None,
):
    """Persist system-captured assessment screen recording for recruiter review."""
    try:
        session_uuid = UUID(session_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid session_id format") from exc

    ownership = await session.execute(
        text("""
            SELECT oa.session_id
            FROM ongoing_assessments oa
            JOIN candidate_applications ca ON oa.application_id = ca.application_id
            WHERE oa.session_id = :session_id
              AND ca.candidate_id = :candidate_id
            LIMIT 1
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_uuid,
            "candidate_id": candidate.candidate_id,
        },
    )
    row = ownership.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Assessment session not found")

    if not recording.filename:
        raise HTTPException(status_code=400, detail="Recording file is required")

    ext = os.path.splitext(recording.filename)[1].lower() or ".webm"
    if ext not in {".webm", ".mp4", ".mkv"}:
        ext = ".webm"

    recordings_dir = os.path.join(os.getcwd(), "static", "proctoring", "assessments")
    os.makedirs(recordings_dir, exist_ok=True)
    file_name = f"{session_uuid}_{int(time_module.time())}{ext}"
    full_path = os.path.join(recordings_dir, file_name)

    data = await recording.read()
    if not data:
        raise HTTPException(status_code=400, detail="Recording file is empty")

    with open(full_path, "wb") as f:
        f.write(data)

    public_url = f"/static/proctoring/assessments/{file_name}"
    await session.execute(
        text("""
            UPDATE ongoing_assessments
            SET recording_url = :recording_url
            WHERE session_id = :session_id
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_uuid,
            "recording_url": public_url,
        },
    )
    await session.commit()

    return {
        "recording_url": public_url,
        "message": "Assessment screen recording stored",
    }


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

    # Pull candidate GitHub/CV signals to personalize question assignment.
    candidate_profile_result = await session.execute(
        text(
            """
            SELECT candidate_id
            FROM candidate_applications
            WHERE application_id = :application_id
            LIMIT 1
            """
        ).bindparams(
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
        ),
        {"application_id": application_id},
    )
    candidate_profile_row = candidate_profile_result.mappings().first()
    candidate_profile_id = candidate_profile_row["candidate_id"] if candidate_profile_row else candidate.candidate_id

    cv_signal_result = await session.execute(
        text(
            """
            SELECT skills, parsed_data, github_profile
            FROM cv_analysis
            WHERE application_id = :application_id
            LIMIT 1
            """
        ).bindparams(
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
        ),
        {"application_id": application_id},
    )
    cv_signal_row = cv_signal_result.mappings().first()

    gh_signal_result = await session.execute(
        text(
            """
            SELECT top_languages, analysis_data
            FROM github_analysis
            WHERE candidate_id = :candidate_id
              AND organization_id = :organization_id
            LIMIT 1
            """
        ).bindparams(
            bindparam("candidate_id", type_=pgUUID(as_uuid=True)),
            bindparam("organization_id", type_=pgUUID(as_uuid=True)),
        ),
        {"candidate_id": candidate_profile_id, "organization_id": org_id},
    )
    gh_signal_row = gh_signal_result.mappings().first()

    candidate_keywords = _collect_candidate_keywords(
        cv_signal_row.get("skills") if cv_signal_row else None,
        cv_signal_row.get("parsed_data") if cv_signal_row else None,
        cv_signal_row.get("github_profile") if cv_signal_row else None,
        gh_signal_row.get("top_languages") if gh_signal_row else None,
        gh_signal_row.get("analysis_data") if gh_signal_row else None,
    )

    stage_cfg = await session.execute(
        text(
            """
            SELECT acceptance_criteria
            FROM group_pipeline_stages
            WHERE stage_id = :stage_id
            LIMIT 1
            """
        ).bindparams(
            bindparam("stage_id", type_=pgUUID(as_uuid=True)),
        ),
        {"stage_id": UUID(request.stage_id)},
    )
    stage_cfg_row = stage_cfg.mappings().first()
    github_questions_count = 0
    if stage_cfg_row and isinstance(stage_cfg_row.get("acceptance_criteria"), dict):
        try:
            github_questions_count = int((stage_cfg_row.get("acceptance_criteria") or {}).get("github_questions_count") or 0)
        except Exception:
            github_questions_count = 0
    github_questions_count = max(0, min(github_questions_count, 30))

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
        selection_strategy = (sec["selection_strategy"] or "").lower()

        if selection_strategy == "random" and len(pool) > variants_to_select:
            if candidate_keywords:
                scored_pool = []
                for q in list(pool):
                    relevance_score, matched_keywords = _score_question_for_candidate(q, candidate_keywords)
                    scored_pool.append((q, relevance_score, matched_keywords))

                # Prefer profile-relevant questions first, then keep randomization among ties.
                random.shuffle(scored_pool)
                scored_pool.sort(key=lambda item: item[1], reverse=True)
                selected = [item[0] for item in scored_pool[:variants_to_select]]
                selection_matches = {str(item[0]["question_id"]): item[2] for item in scored_pool}
            else:
                selected = random.sample(list(pool), variants_to_select)
                selection_matches = {}
        else:
            selected = list(pool)[:variants_to_select]
            selection_matches = {}

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
                "assignment_context": {
                    "selection_strategy": selection_strategy,
                    "candidate_keywords": candidate_keywords[:20],
                    "matched_keywords": selection_matches.get(str(q["question_id"]), []),
                },
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

    if github_questions_count > 0 and gh_signal_row and isinstance(gh_signal_row.get("analysis_data"), dict):
        gh_questions = (((gh_signal_row.get("analysis_data") or {}).get("synthesis") or {}).get("questions") or [])
        selected_gh: list[dict] = []
        for raw_q in gh_questions:
            normalized = _normalize_github_question(raw_q, display_order + len(selected_gh) + 1)
            if normalized:
                selected_gh.append(normalized)
            if len(selected_gh) >= github_questions_count:
                break

        if selected_gh:
            target_section_id = sections[0]["section_id"] if sections else uuid4()
            for gh_q in selected_gh:
                display_order += 1
                assignment_id = uuid4()
                q_points = int(gh_q.get("points") or 10)

                snapshot = {
                    "question_id": gh_q["question_id"],
                    "question_type": gh_q["question_type"],
                    "question_text": gh_q["question_text"],
                    "question_config": gh_q.get("question_config") or {},
                    "correct_answer": gh_q.get("correct_answer") or {},
                    "points": q_points,
                    "assignment_context": {
                        "selection_strategy": "github_analysis",
                        "candidate_keywords": candidate_keywords[:20],
                        "matched_keywords": [],
                    },
                }

                await session.execute(
                    text(
                        """
                        INSERT INTO candidate_assigned_questions
                        (assignment_id, session_id, section_id, pool_entry_id,
                         question_snapshot, display_order, assigned_at)
                        VALUES (
                            :assignment_id, :session_id, :section_id, :pool_entry_id,
                            :question_snapshot, :display_order, NOW()
                        )
                        """
                    ).bindparams(
                        bindparam("assignment_id", type_=pgUUID(as_uuid=True)),
                        bindparam("session_id", type_=pgUUID(as_uuid=True)),
                        bindparam("section_id", type_=pgUUID(as_uuid=True)),
                        bindparam("pool_entry_id", type_=pgUUID(as_uuid=True)),
                        bindparam("question_snapshot", type_=JSONB),
                    ),
                    {
                        "assignment_id": assignment_id,
                        "session_id": session_id,
                        "section_id": target_section_id,
                        "pool_entry_id": uuid4(),
                        "question_snapshot": snapshot,
                        "display_order": display_order,
                    },
                )

                assigned_questions.append(
                    {
                        "question_id": gh_q["question_id"],
                        "assignment_id": str(assignment_id),
                        "section_title": "GitHub Profile Questions",
                        "question_type": gh_q["question_type"],
                        "question_text": gh_q["question_text"],
                        "question_config": gh_q.get("question_config") or {},
                        "points": q_points,
                        "order": display_order,
                    }
                )
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
    enforcement_action: str = "none"
    enforcement_reason: str | None = None


def _normalize_severity(raw: str | None) -> str:
    value = (raw or "low").strip().lower()
    if value not in {"low", "medium", "high"}:
        return "low"
    return value


def _score_event_type(event_type: str) -> float:
    weighted = {
        "paste_attempt": 3.0,
        "paste_shortcut": 3.0,
        "copy_attempt": 2.0,
        "copy_shortcut": 2.0,
        "tab_hidden": 2.0,
        "window_blur": 2.0,
        "inactivity_detected": 2.0,
        "inactivity_timeout": 3.0,
        "multi_face_detected": 3.0,
        "face_absent": 3.0,
        "voice_mismatch": 3.0,
        "gaze_off_screen": 2.0,
        "emotion_spike": 1.0,
    }
    return weighted.get(event_type, 1.0)


def _source_bucket(event_type: str) -> str:
    if event_type.startswith(("copy", "paste", "tab_", "window_", "inactivity", "context_menu")):
        return "browser"
    if "face" in event_type:
        return "face"
    if "voice" in event_type or "speaker" in event_type:
        return "voice"
    if "gaze" in event_type or "eye" in event_type:
        return "gaze"
    if "emotion" in event_type:
        return "emotion"
    return "other"


def _log_integrity_metric(metric_name: str, **fields) -> None:
    payload = {
        "metric": "integrity_event",
        "metric_name": metric_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    logger.info("integrity_metric %s", json.dumps(payload, default=str, sort_keys=True))


async def _assessment_enforcement_action(
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
              AND session_type = 'assessment'
              AND created_at >= NOW() - (:window_s || ' seconds')::INTERVAL
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "session_id": session_id,
            "window_s": str(INTEGRITY_ENFORCEMENT_WINDOW_SECONDS),
        },
    )
    row = counters.mappings().first() or {}
    high_cnt = int(row.get("high_cnt") or 0)
    medium_cnt = int(row.get("medium_cnt") or 0)

    event_type = (latest_event_type or "").strip().lower()
    severity = _normalize_severity(latest_severity)

    if event_type in INTEGRITY_ENFORCEMENT_CRITICAL_EVENTS:
        return "terminate", "critical_event_detected"
    if high_cnt >= 2 or medium_cnt >= 4:
        return "pause", "repeated_high_risk_pattern"
    if medium_cnt >= 2:
        return "warn", "elevated_risk_pattern"
    return "none", None


async def _synthesize_fusion_flag(
    session,
    application_id: UUID,
    session_id: UUID,
    organization_id: UUID,
) -> None:
    recent = await session.execute(
        text("""
            SELECT flag_id, event_type, severity, created_at
            FROM proctoring_flags
            WHERE application_id = :application_id
              AND session_id = :session_id
              AND session_type = 'assessment'
              AND created_at >= NOW() - INTERVAL '120 seconds'
              AND event_type <> 'fusion_high_confidence_risk'
            ORDER BY created_at DESC
            LIMIT 20
        """).bindparams(
            bindparam("application_id", type_=pgUUID(as_uuid=True)),
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {
            "application_id": application_id,
            "session_id": session_id,
        },
    )
    rows = recent.mappings().all()
    if not rows:
        return

    sev_weight = {"low": 1.0, "medium": 1.5, "high": 2.0}
    seen_types: set[str] = set()
    buckets: set[str] = set()
    fusion_score = 0.0

    for row in rows:
        event_type = (row["event_type"] or "").strip().lower()
        if not event_type or event_type in seen_types:
            continue
        seen_types.add(event_type)
        buckets.add(_source_bucket(event_type))
        fusion_score += _score_event_type(event_type) * sev_weight.get((row["severity"] or "low").lower(), 1.0)

    non_other_sources = {b for b in buckets if b != "other"}
    if fusion_score < 7.5 or len(non_other_sources) < 2:
        return

    recent_fusion = await session.execute(
        text("""
            SELECT flag_id
            FROM proctoring_flags
            WHERE session_id = :session_id
              AND event_type = 'fusion_high_confidence_risk'
              AND created_at >= NOW() - INTERVAL '30 seconds'
            LIMIT 1
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": session_id},
    )
    if recent_fusion.mappings().first():
        return

    fusion_severity = "high" if fusion_score >= 11 else "medium"
    evidence = {
        "fusion_score": round(fusion_score, 2),
        "signal_sources": sorted(non_other_sources),
        "contributing_event_types": sorted(seen_types),
        "window_seconds": 120,
    }

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
                'assessment',
                :organization_id,
                0,
                'fusion_high_confidence_risk',
                :severity,
                :evidence,
                'fusion_engine_v1',
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
            "flag_id": uuid4(),
            "application_id": application_id,
            "session_id": session_id,
            "organization_id": organization_id,
            "severity": fusion_severity,
            "evidence": json.dumps(evidence),
        },
    )


async def _is_integrity_rate_limited(
    session,
    session_id: UUID,
    detected_by: str,
) -> bool:
    res = await session.execute(
        text("""
            SELECT COUNT(*) AS cnt
            FROM proctoring_flags
            WHERE session_id = :session_id
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
    current_count = int(res.scalar() or 0)
    return current_count >= INTEGRITY_EVENT_MAX_PER_MINUTE


async def _is_duplicate_integrity_event(
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
            "dup_window": str(INTEGRITY_DUP_WINDOW_SECONDS),
        },
    )
    return res.mappings().first() is not None


@router.post("/integrity-event", response_model=IntegrityEventResponse)
async def report_integrity_event(
    request: IntegrityEventRequest,
    candidate: CurrentCandidate,
    session: DbSession,
):
    """
    Store a candidate integrity/proctoring event as a pending proctoring flag.
    """
    try:
        session_uuid = UUID(request.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid session_id format") from exc

    verify = await session.execute(
        text("""
            SELECT oa.session_id,
                   oa.application_id,
                   oa.organization_id,
                   oa.status,
                   oa.started_at
            FROM ongoing_assessments oa
            JOIN candidate_applications ca ON oa.application_id = ca.application_id
            WHERE oa.session_id = :session_id
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
    oa = verify.mappings().first()
    if not oa:
        raise HTTPException(status_code=404, detail="Assessment session not found")

    if oa["status"] == "completed":
        raise HTTPException(status_code=400, detail="Assessment already submitted")

    normalized_event_type = request.event_type.strip().lower()
    detected_by = (request.source or "candidate_portal")[:50]

    if await _is_integrity_rate_limited(session, session_uuid, detected_by):
        integrity_metrics.inc(stage="assessment", outcome="dropped", reason="rate_limited")
        _log_integrity_metric(
            "assessment_integrity_dropped_rate_limited",
            session_id=str(session_uuid),
            candidate_id=str(candidate.candidate_id),
            event_type=normalized_event_type,
            detected_by=detected_by,
            reason="rate_limited",
        )
        return IntegrityEventResponse(
            flag_id="rate_limited",
            status="dropped",
            message="Integrity event dropped due to rate limiting.",
            enforcement_action="none",
        )

    if await _is_duplicate_integrity_event(session, session_uuid, normalized_event_type, detected_by):
        integrity_metrics.inc(stage="assessment", outcome="dropped", reason="duplicate_recent_window")
        _log_integrity_metric(
            "assessment_integrity_dropped_duplicate",
            session_id=str(session_uuid),
            candidate_id=str(candidate.candidate_id),
            event_type=normalized_event_type,
            detected_by=detected_by,
            reason="duplicate_recent_window",
            duplicate_window_seconds=INTEGRITY_DUP_WINDOW_SECONDS,
        )
        return IntegrityEventResponse(
            flag_id="duplicate",
            status="dropped",
            message="Integrity event dropped as duplicate in recent window.",
            enforcement_action="none",
        )

    event_ts = request.timestamp_seconds
    if event_ts is None:
        if oa["started_at"]:
            elapsed = (datetime.now(timezone.utc) - oa["started_at"].replace(tzinfo=timezone.utc)).total_seconds()
            event_ts = max(0, int(elapsed))
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
                'assessment',
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
            "application_id": oa["application_id"],
            "session_id": oa["session_id"],
            "organization_id": oa["organization_id"],
            "timestamp_seconds": event_ts,
            "event_type": normalized_event_type,
            "severity": _normalize_severity(request.severity),
            "evidence": json.dumps(evidence_payload),
            "detected_by": detected_by,
        },
    )

    await _synthesize_fusion_flag(
        session=session,
        application_id=oa["application_id"],
        session_id=oa["session_id"],
        organization_id=oa["organization_id"],
    )

    integrity_metrics.inc(stage="assessment", outcome="accepted", reason="none")

    _log_integrity_metric(
        "assessment_integrity_accepted",
        session_id=str(oa["session_id"]),
        candidate_id=str(candidate.candidate_id),
        application_id=str(oa["application_id"]),
        event_type=normalized_event_type,
        severity=_normalize_severity(request.severity),
        detected_by=detected_by,
    )

    enforcement_action, enforcement_reason = await _assessment_enforcement_action(
        session=session,
        session_id=oa["session_id"],
        latest_event_type=normalized_event_type,
        latest_severity=request.severity,
    )

    await session.commit()

    return IntegrityEventResponse(
        flag_id=str(flag_id),
        status="pending",
        message="Integrity event recorded.",
        enforcement_action=enforcement_action,
        enforcement_reason=enforcement_reason,
    )


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
            enforcement_action="none",
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
        await finalize_expired_assessment_session(session, session_id=UUID(session_id))
        return HeartbeatResponse(
            session_id=session_id,
            remaining_seconds=0,
            status="expired",
            answered_count=answered_count,
            enforcement_action="none",
        )

    enforcement_action, enforcement_reason = await _assessment_enforcement_action(
        session=session,
        session_id=UUID(session_id),
    )
    if enforcement_action in {"pause", "terminate"}:
        return HeartbeatResponse(
            session_id=session_id,
            remaining_seconds=remaining_seconds,
            status="blocked_integrity",
            answered_count=answered_count,
            enforcement_action=enforcement_action,
            enforcement_reason=enforcement_reason,
        )
    
    return HeartbeatResponse(
        session_id=session_id,
        remaining_seconds=remaining_seconds,
        status=oa["status"],
        answered_count=answered_count,
        enforcement_action=enforcement_action,
        enforcement_reason=enforcement_reason,
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
    params = [p for p in sig.parameters.values()
              if p.default == inspect.Parameter.empty
              and p.kind not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)]
    param_count = len(params)

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

            # Skip grading if essay is too short (partial typing, not a real answer)
            if not essay_text or len(essay_text.strip()) < 20:
                points_earned = 0.0
                feedback_data = {
                    "ai_feedback": "Answer too short to grade. Please provide a more detailed response.",
                    "ai_score": 0.0,
                    "ai_strengths": [],
                    "ai_improvements": ["Provide a more detailed and substantive answer."],
                }
                logger.info(f"[auto_grade] Essay {answer_id}: too short ({len(essay_text.strip())} chars), pts=0")
            else:
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


async def finalize_expired_assessment_session(session, session_id: UUID) -> None:
    """Auto-finalize an expired session using the same scoring flow as normal submit."""
    verify = await session.execute(
        text("""
            SELECT oa.session_id, oa.status, oa.started_at, oa.max_points,
                   oa.assessment_id, ca.application_id
            FROM ongoing_assessments oa
            JOIN candidate_applications ca ON oa.application_id = ca.application_id
            WHERE oa.session_id = :session_id
            LIMIT 1
        """).bindparams(
            bindparam("session_id", type_=pgUUID(as_uuid=True)),
        ),
        {"session_id": session_id},
    )
    oa = verify.mappings().first()
    if not oa or oa["status"] == "completed":
        return

    try:
        await auto_grade_answers(session_id, session)
    except Exception as exc:
        logger.error("Auto-grading during expiration finalize failed (non-fatal): %s", exc)

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
        {"session_id": session_id},
    )
    scores = score_result.mappings().first()
    total_earned = float(scores["total_earned"])
    total_max = int(oa["max_points"] or scores["total_max"] or 0)

    assess = await session.execute(
        text("SELECT passing_score FROM assessments WHERE assessment_id = :id").bindparams(
            bindparam("id", type_=pgUUID(as_uuid=True)),
        ),
        {"id": oa["assessment_id"]},
    )
    assess_row = assess.mappings().first()
    passing_score = float(assess_row["passing_score"]) if assess_row else 60.0

    percentage = (total_earned / total_max * 100) if total_max > 0 else 0
    passed = percentage >= passing_score

    started_at = oa["started_at"]
    if started_at and started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    submit_time = datetime.now(timezone.utc)
    time_spent = int((submit_time - started_at).total_seconds()) if started_at else 0

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
            "session_id": session_id,
        },
    )

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
        },
    )

    _log_integrity_metric(
        "assessment_auto_expired_finalized",
        session_id=str(session_id),
        application_id=str(oa["application_id"]),
        percentage=round(percentage, 2),
        passed=passed,
        time_spent_seconds=time_spent,
    )

    await session.commit()


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
