"""
Video processing tasks for AI interview responses.

Flow:
1. Receive video URL and response details
2. Call AI service for transcription (Whisper)
3. Call AI service for evaluation (Ollama LLM)
4. Update database with results
5. Log to debug file for developer monitoring
"""
import json
import httpx
from datetime import datetime
from pathlib import Path
from uuid import UUID

from worker.celery_app import celery_app
from app.core.config import settings


AI_SERVICE_URL = settings.AI_SERVICE_URL

# Debug log file for developer monitoring
DEBUG_LOG_PATH = Path("logs/video_processing_debug.json")
DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def _get_db_conn():
    import psycopg2
    return psycopg2.connect(settings.DATABASE_URL.replace("+asyncpg", ""))


def _get_processing_status(response_id: str) -> str | None:
    conn = _get_db_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT processing_status FROM interview_responses WHERE response_id = %s",
            (response_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        return row[0] if row else None
    finally:
        conn.close()


def _set_processing_status(response_id: str, status: str) -> None:
    conn = _get_db_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE interview_responses SET processing_status = %s WHERE response_id = %s",
            (status, response_id),
        )
        conn.commit()
        cursor.close()
    finally:
        conn.close()


def _is_cancelled(response_id: str) -> bool:
    status = (_get_processing_status(response_id) or "").lower()
    return status == "cancelled"


def log_debug(step: str, data: dict):
    """Log processing steps to debug file."""
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "step": step,
        "data": data,
    }
    
    # Append to log file
    logs = []
    if DEBUG_LOG_PATH.exists():
        try:
            logs = json.loads(DEBUG_LOG_PATH.read_text())
        except:
            logs = []
    
    logs.append(entry)
    
    # Keep last 100 entries
    logs = logs[-100:]
    DEBUG_LOG_PATH.write_text(json.dumps(logs, indent=2, default=str))
    
    print(f"[DEBUG] {step}: {data}")


def process_video_logic(
    response_id: str,
    video_url: str,
    question_text: str,
    reference_answer: str | None = None,
    rubric: str | None = None,
    rubric_checks: list[dict] | None = None,
) -> dict:
    """
    Core logic for video processing.
    
    Can be called directly (by BackgroundTasks) or via Celery wrapper.
    """
    import sys
    print(f"[VIDEO_WORKER] Starting processing for response_id={response_id}", file=sys.stderr)
    print(f"[VIDEO_WORKER] video_url={video_url}", file=sys.stderr)
    print(f"[VIDEO_WORKER] question_text={question_text[:50]}...", file=sys.stderr)
    
    log_debug("task_started", {
        "response_id": response_id,
        "video_url": video_url,
        "question_text": question_text[:100] if question_text else None,
        "has_rubric": rubric is not None,
    })
    
    try:
        # Step 0: Mark as processing unless already cancelled
        if _is_cancelled(response_id):
            log_debug("task_cancelled_before_start", {"response_id": response_id})
            return {"status": "cancelled", "response_id": response_id}
        _set_processing_status(response_id, 'processing')

        if _is_cancelled(response_id):
            log_debug("task_cancelled_after_processing_mark", {"response_id": response_id})
            return {"status": "cancelled", "response_id": response_id}
        
        # Step 1: Transcribe video
        log_debug("transcription_started", {"response_id": response_id})
        
        with httpx.Client(timeout=300.0) as client:
            transcribe_response = client.post(
                f"{AI_SERVICE_URL}/transcribe/",
                json={"audio_url": video_url, "language": "en"},
            )
            
            if transcribe_response.status_code == 200:
                transcribe_result = transcribe_response.json()
                transcript = transcribe_result.get("transcript", "")
                confidence = transcribe_result.get("confidence", 0.0)
            else:
                transcript = f"[Transcription error: {transcribe_response.status_code}]"
                confidence = 0.0
        
        log_debug("transcription_completed", {
            "response_id": response_id,
            "transcript_length": len(transcript),
            "confidence": confidence,
        })

        if _is_cancelled(response_id):
            log_debug("task_cancelled_after_transcription", {"response_id": response_id})
            return {"status": "cancelled", "response_id": response_id}
        
        # Step 2: Evaluate with LLM
        log_debug("evaluation_started", {
            "response_id": response_id,
            "has_reference": bool(reference_answer),
            "has_rubric": bool(rubric),
            "has_rubric_checks": bool(rubric_checks),
        })

        eval_payload: dict = {
            "transcript": transcript,
            "reference_answer": reference_answer,
            "question": question_text,
            "rubric": rubric,
        }
        if rubric_checks:
            eval_payload["rubric_checks"] = rubric_checks

        with httpx.Client(timeout=120.0) as client:
            evaluate_response = client.post(
                f"{AI_SERVICE_URL}/llm/evaluate",
                json=eval_payload,
            )

            if evaluate_response.status_code == 200:
                eval_result = evaluate_response.json()
                score = eval_result.get("score", 50.0)
                feedback = eval_result.get("feedback", "Evaluation completed")
                criteria_scores = eval_result.get("criteria_scores") or None
            else:
                score = 50.0
                feedback = f"Evaluation error: {evaluate_response.status_code}"
                criteria_scores = None

        log_debug("evaluation_completed", {
            "response_id": response_id,
            "score": score,
            "has_criteria_scores": bool(criteria_scores),
        })

        # Step 2.5: Behavioral analysis (trial_c) — best-effort. A failure here
        # must never break transcription/scoring, so it is fully isolated.
        behavioral_analysis = None
        try:
            log_debug("behavioral_started", {"response_id": response_id})
            with httpx.Client(timeout=180.0) as client:
                behavioral_response = client.post(
                    f"{AI_SERVICE_URL}/behavioral/analyze",
                    json={"video_url": video_url},
                )
                if behavioral_response.status_code == 200:
                    behavioral_analysis = behavioral_response.json()
                    log_debug("behavioral_completed", {
                        "response_id": response_id,
                        "dominant_emotion": behavioral_analysis.get("dominant_emotion"),
                    })
                else:
                    log_debug("behavioral_non_200", {
                        "response_id": response_id,
                        "status": behavioral_response.status_code,
                    })
        except Exception as exc:
            log_debug("behavioral_failed", {"response_id": response_id, "error": str(exc)})

        if _is_cancelled(response_id):
            log_debug("task_cancelled_after_evaluation", {"response_id": response_id})
            return {"status": "cancelled", "response_id": response_id}
        
        # Step 3: Update database
        log_debug("database_update_started", {"response_id": response_id})
        
        # Use synchronous database connection; do not overwrite if cancelled mid-flight.
        conn = _get_db_conn()
        cursor = conn.cursor()
        
        ai_feedback_payload: dict = {"feedback": feedback}
        if criteria_scores:
            ai_feedback_payload["criteria_scores"] = criteria_scores

        cursor.execute(
            """
            UPDATE interview_responses
            SET transcript = %s,
                transcript_confidence = %s,
                ai_score = %s,
                ai_feedback = %s,
                behavioral_analysis = %s,
                processing_status = %s
            WHERE response_id = %s AND processing_status <> 'cancelled'
            """,
            (
                transcript,
                confidence,
                score,
                json.dumps(ai_feedback_payload),
                json.dumps(behavioral_analysis) if behavioral_analysis else None,
                'completed',
                response_id,
            )
        )
        conn.commit()
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            log_debug("task_cancelled_before_db_commit", {"response_id": response_id})
            return {"status": "cancelled", "response_id": response_id}
        cursor.close()
        conn.close()

        log_debug("database_update_completed", {"response_id": response_id})

        # After each response is processed, check if all responses for this session are done.
        # If so, aggregate scores into ongoing_interviews and candidate_pipeline_progress.
        conn2 = _get_db_conn()
        cur2 = conn2.cursor()
        cur2.execute(
            """
            SELECT ir.session_id,
                   COUNT(*) FILTER (WHERE ir.processing_status NOT IN ('completed','failed')) AS pending,
                   AVG(ir.ai_score) AS avg_score
            FROM interview_responses ir
            WHERE ir.session_id = (
                SELECT session_id FROM interview_responses WHERE response_id = %s LIMIT 1
            )
            GROUP BY ir.session_id
            """,
            (response_id,)
        )
        agg = cur2.fetchone()
        if agg and agg[1] == 0 and agg[2] is not None:
            session_id_val, _, avg_score = agg
            cur2.execute(
                "UPDATE ongoing_interviews SET overall_score = %s WHERE session_id = %s",
                (float(avg_score), session_id_val)
            )
            # Update candidate_pipeline_progress score for the ai_interview stage
            cur2.execute(
                """
                UPDATE candidate_pipeline_progress cpp
                SET score = %s
                FROM ongoing_interviews oi
                JOIN candidate_applications ca ON ca.application_id = oi.application_id
                JOIN group_pipeline_stages gps
                  ON gps.group_id = ca.group_id AND gps.stage_type = 'ai_interview'
                WHERE oi.session_id = %s
                  AND cpp.application_id = oi.application_id
                  AND cpp.stage_id = gps.stage_id
                  AND oi.status = 'completed'
                """,
                (float(avg_score), session_id_val)
            )
            conn2.commit()
        cur2.close()
        conn2.close()

        # Build comprehensive assessment report
        result = {
            "status": "completed",
            "response_id": response_id,
            "question": {
                "text": question_text,
                "reference_answer": reference_answer,
            },
            "answer": {
                "transcript": transcript,
                "confidence": confidence,
                "video_url": video_url,
            },
            "evaluation": {
                "score": score,
                "feedback": feedback,
                "max_score": 100.0,
                "pass_threshold": 60.0,
                "passed": score >= 60.0,
            },
            "processed_at": datetime.utcnow().isoformat(),
        }
        
        log_debug("task_completed", result)
        return result

    except Exception as exc:
        try:
            _set_processing_status(response_id, 'failed')
        except Exception:
            pass
        log_debug("task_error", {
            "response_id": response_id,
            "error": str(exc),
        })
        raise exc


@celery_app.task(bind=True, max_retries=3)
def process_video_response(
    self,
    response_id: str,
    video_url: str,
    question_text: str,
    reference_answer: str | None = None,
    rubric_checks: list[dict] | None = None,
) -> dict:
    """Wrapper for Celery task."""
    try:
        return process_video_logic(
            response_id,
            video_url,
            question_text,
            reference_answer=reference_answer,
            rubric_checks=rubric_checks,
        )
    except Exception as exc:
        self.retry(exc=exc, countdown=2**self.request.retries)
