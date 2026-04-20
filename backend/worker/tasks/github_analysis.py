"""
Celery task for GitHub profile ingestion + analysis.

This task:
1) calls ai-service /github-analysis/analyze
2) upserts github_analysis table
3) updates cv_analysis.github_profile for latest application
4) updates github_analysis_jobs status/counters
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import requests

from app.core.config import settings
from worker.celery_app import celery_app

logger = logging.getLogger(__name__)

DATABASE_URL = settings.DATABASE_URL or os.environ.get("DATABASE_URL", "")
AI_SERVICE_URL = settings.AI_SERVICE_URL or os.environ.get("AI_SERVICE_URL", "http://localhost:8001")
DEBUG_LOG_PATH = Path("logs/github_analysis_debug.json")
DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_db_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured for Celery worker")
    sync_url = DATABASE_URL.replace("+asyncpg", "")
    return psycopg2.connect(sync_url)


def log_debug(step: str, data: dict):
    """Log GitHub analysis steps to a debug file for the background task UI."""
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "step": step,
        "data": data,
    }

    logs = []
    if DEBUG_LOG_PATH.exists():
        try:
            logs = json.loads(DEBUG_LOG_PATH.read_text())
        except Exception:
            logs = []

    logs.append(entry)
    logs = logs[-200:]
    DEBUG_LOG_PATH.write_text(json.dumps(logs, indent=2, default=str))

    logger.info("[GitHubAnalysis] %s %s", step, data)


def _derive_yes_no_checks(payload: dict) -> list[dict]:
    rubric = str(payload.get("rubric") or "").strip()
    reference = str(payload.get("reference_answer") or payload.get("referenceAnswer") or payload.get("ideal_answer") or "").strip()
    evidence = str(payload.get("evidence") or "").strip()
    seed_text = "\n".join([part for part in [rubric, reference, evidence] if part]).strip()
    if not seed_text:
        seed_text = "correctly answer the question with clear supporting rationale"

    candidates: list[str] = []
    for piece in [p.strip(" -:;,.
	") for p in seed_text.replace("\r", "\n").split("\n") if p.strip()]:
        if len(piece) < 8:
            continue
        if len(candidates) >= 10:
            break
        normalized = piece[0].lower() + piece[1:] if len(piece) > 1 else piece.lower()
        candidates.append(f"Does the answer {normalized}?")

    while len(candidates) < 10:
        candidates.append(f"Does the answer satisfy rubric criterion {len(candidates) + 1}?")

    return [
        {"id": idx + 1, "check": check, "weight": 0.10}
        for idx, check in enumerate(candidates[:10])
    ]


def update_job_status(conn, job_id: str, status: str, **extra_fields):
    fields = {"status": status}
    fields.update(extra_fields)

    set_clauses = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [job_id]

    with conn.cursor() as cur:
        cur.execute(f"UPDATE github_analysis_jobs SET {set_clauses} WHERE job_id = %s", values)
    conn.commit()


def _upsert_github_analysis(conn, candidate_id: str, org_id: str, github_url: str, payload: dict):
    languages = payload.get("languages") or []
    top_languages: dict[str, float] = {}
    if isinstance(languages, list):
        for item in languages:
            if isinstance(item, dict) and item.get("name"):
                top_languages[str(item.get("name"))] = float(item.get("percentage") or 0)

    stats = payload.get("stats") or {}
    analysis_data = payload.get("analysis_data") or {}

    repo_count = int(stats.get("public_repos") or 0)
    contribution_score = float(stats.get("contributions_last_year") or 0)

    assessment = (analysis_data.get("synthesis") or {}).get("assessment") or {}
    code_quality_score = float(assessment.get("correctness") or 0)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO github_analysis
                (analysis_id, candidate_id, organization_id, github_url, top_languages, repo_count,
                 contribution_score, code_quality_score, analysis_data, analyzed_at)
            VALUES
                (gen_random_uuid(), %s, %s, %s, %s::jsonb, %s, %s, %s, %s::jsonb, NOW())
            ON CONFLICT (candidate_id)
            DO UPDATE SET
                github_url = EXCLUDED.github_url,
                top_languages = EXCLUDED.top_languages,
                repo_count = EXCLUDED.repo_count,
                contribution_score = EXCLUDED.contribution_score,
                code_quality_score = EXCLUDED.code_quality_score,
                analysis_data = EXCLUDED.analysis_data,
                analyzed_at = NOW()
            """,
            (
                candidate_id,
                org_id,
                github_url,
                json.dumps(top_languages),
                repo_count,
                contribution_score,
                code_quality_score,
                json.dumps(analysis_data),
            ),
        )
    conn.commit()


def _update_cv_analysis_profile(conn, candidate_id: str, org_id: str, payload: dict):
    profile = payload.get("profile") or {}
    stats = payload.get("stats") or {}
    github_profile = {
        "profile": profile,
        "stats": stats,
        "languages": payload.get("languages") or [],
        "top_repos": payload.get("top_repos") or [],
        "keywords": [
            a.get("name")
            for a in ((payload.get("analysis_data") or {}).get("synthesis") or {}).get("archetypes", [])
            if isinstance(a, dict) and a.get("name")
        ],
    }

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT application_id
            FROM candidate_applications
            WHERE candidate_id = %s
              AND organization_id = %s
              AND is_deleted = false
            ORDER BY applied_at DESC
            LIMIT 1
            """,
            (candidate_id, org_id),
        )
        row = cur.fetchone()
        if not row:
            return
        application_id = row[0]

        cur.execute(
            """
            UPDATE cv_analysis
            SET github_profile = %s::jsonb
            WHERE application_id = %s
            """,
            (json.dumps(github_profile), application_id),
        )
    conn.commit()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=10, name="github_analysis.run")
def run_github_analysis(
    self,
    job_id: str,
    candidate_id: str,
    org_id: str,
    github_url: str,
    jd_text: str = "",
    github_token: str = "",
    questions_to_generate: int = 10,
    cv_projects: list[dict] | None = None,
):
    logger.info("[GitHubAnalysis] Starting job %s candidate=%s", job_id, candidate_id)
    log_debug("task_started", {
        "job_id": job_id,
        "candidate_id": candidate_id,
        "github_url": github_url,
        "questions_to_generate": questions_to_generate,
    })
    conn = None
    try:
        effective_github_token = (
            (github_token or "").strip()
            or (settings.GITHUB_TOKEN or "").strip()
            or (os.environ.get("GITHUB_TOKEN", "") or "").strip()
        )

        conn = get_db_conn()
        update_job_status(conn, job_id, "processing")
        log_debug("job_status_updated", {"job_id": job_id, "status": "processing"})

        log_debug("github_analysis_request_started", {"job_id": job_id, "candidate_id": candidate_id, "github_url": github_url})
        resp = requests.post(
            f"{AI_SERVICE_URL}/github-analysis/analyze",
            json={
                "github_url": github_url,
                "jd_text": jd_text,
                "github_token": effective_github_token,
                "cv_projects": cv_projects or [],
            },
            timeout=420,
        )
        resp.raise_for_status()
        payload = resp.json()
        log_debug("github_analysis_request_completed", {
            "job_id": job_id,
            "candidate_id": candidate_id,
            "status_code": resp.status_code,
            "repo_count": len(payload.get("top_repos") or []),
            "generated_question_count": len(((payload.get("analysis_data") or {}).get("synthesis") or {}).get("questions") or []),
        })

        all_generated_questions = ((payload.get("analysis_data") or {}).get("synthesis") or {}).get("questions") or []
        target_count = max(1, min(int(questions_to_generate or 10), 30))
        generated_questions = list(all_generated_questions)[:target_count]

        analysis_data = payload.get("analysis_data") or {}
        if isinstance(analysis_data, dict):
            synthesis = analysis_data.get("synthesis") or {}
            if isinstance(synthesis, dict):
                synthesis["questions"] = generated_questions
                analysis_data["synthesis"] = synthesis
            payload["analysis_data"] = analysis_data

        _upsert_github_analysis(conn, candidate_id, org_id, github_url, payload)
        _update_cv_analysis_profile(conn, candidate_id, org_id, payload)
        log_debug("database_upsert_completed", {"job_id": job_id, "candidate_id": candidate_id})

        normalized_questions = []
        for idx, q in enumerate(generated_questions):
            if not isinstance(q, dict):
                continue
            q_text = str(q.get("question") or q.get("question_text") or "").strip()
            if not q_text:
                continue
            q_type = str(q.get("type") or q.get("question_type") or "essay").strip().lower()
            if q_type not in {"mcq", "essay", "coding"}:
                q_type = "essay"
            normalized_questions.append(
                {
                    "type": q_type,
                    "question": q_text,
                    "question_text": q_text,
                    "difficulty": q.get("difficulty") or "Medium",
                    "points": int(q.get("points") or 10),
                    "options": q.get("options") if isinstance(q.get("options"), list) else [],
                    "ideal_answer": q.get("ideal_answer") or q.get("expected_answer") or "",
                    "reference_answer": q.get("reference_answer") or q.get("referenceAnswer") or q.get("ideal_answer") or q.get("expected_answer") or "",
                    "rubric": q.get("rubric") or "",
                    "rubric_yes_no_checks": q.get("rubric_yes_no_checks") if isinstance(q.get("rubric_yes_no_checks"), list) and len(q.get("rubric_yes_no_checks")) > 0 else _derive_yes_no_checks(q),
                    "selection_reason": q.get("selection_reason") or "Generated from GitHub profile analysis",
                    "jd_relation": q.get("jd_relation") or "",
                    "evidence": q.get("evidence") or "",
                    "source": "github_analysis",
                    "source_file": q.get("source_file") or "",
                }
            )

        if isinstance(payload.get("analysis_data"), dict):
            payload["analysis_data"]["question_delivery"] = {
                "count": len(normalized_questions),
                "target": "candidate_assessment",
                "mode": "assigned_on_assessment_start",
                "source": "github_analysis",
            }

        update_job_status(
            conn,
            job_id,
            "completed",
            analysis_data=json.dumps(payload.get("analysis_data") or {}),
            generated_questions=json.dumps(generated_questions),
            total_generated=len(generated_questions),
            completed_at=datetime.now(timezone.utc),
        )
        log_debug("task_completed", {
            "job_id": job_id,
            "candidate_id": candidate_id,
            "status": "completed",
            "total_generated": len(generated_questions),
        })

        return {
            "job_id": job_id,
            "status": "completed",
            "total_generated": len(generated_questions),
            "delivery_target": "candidate_assessment",
        }

    except Exception as exc:
        logger.error("[GitHubAnalysis] job=%s failed: %s", job_id, exc)
        log_debug("task_error", {
            "job_id": job_id,
            "candidate_id": candidate_id,
            "error": str(exc),
        })
        if conn:
            try:
                update_job_status(
                    conn,
                    job_id,
                    "failed",
                    error_message=str(exc)[:1000],
                    completed_at=datetime.now(timezone.utc),
                )
            except Exception:
                pass

        if isinstance(exc, requests.HTTPError):
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            # Client-side GitHub errors (invalid username/url/auth) should fail fast without retries.
            if isinstance(status_code, int) and 400 <= status_code < 500 and status_code != 429:
                raise

        raise self.retry(exc=exc)
    finally:
        if conn:
            conn.close()
