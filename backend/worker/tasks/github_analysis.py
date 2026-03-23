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

import psycopg2
import requests

from app.core.config import settings
from worker.celery_app import celery_app

logger = logging.getLogger(__name__)

DATABASE_URL = settings.DATABASE_URL or os.environ.get("DATABASE_URL", "")
AI_SERVICE_URL = settings.AI_SERVICE_URL or os.environ.get("AI_SERVICE_URL", "http://localhost:8001")


def get_db_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured for Celery worker")
    sync_url = DATABASE_URL.replace("+asyncpg", "")
    return psycopg2.connect(sync_url)


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
):
    logger.info("[GitHubAnalysis] Starting job %s candidate=%s", job_id, candidate_id)
    conn = None
    try:
        conn = get_db_conn()
        update_job_status(conn, job_id, "processing")

        resp = requests.post(
            f"{AI_SERVICE_URL}/github-analysis/analyze",
            json={
                "github_url": github_url,
                "jd_text": jd_text,
                "github_token": github_token,
            },
            timeout=420,
        )
        resp.raise_for_status()
        payload = resp.json()

        _upsert_github_analysis(conn, candidate_id, org_id, github_url, payload)
        _update_cv_analysis_profile(conn, candidate_id, org_id, payload)

        generated_questions = ((payload.get("analysis_data") or {}).get("synthesis") or {}).get("questions") or []

        update_job_status(
            conn,
            job_id,
            "completed",
            analysis_data=json.dumps(payload.get("analysis_data") or {}),
            generated_questions=json.dumps(generated_questions),
            total_generated=len(generated_questions),
            completed_at=datetime.now(timezone.utc),
        )

        return {"job_id": job_id, "status": "completed", "total_generated": len(generated_questions)}

    except Exception as exc:
        logger.error("[GitHubAnalysis] job=%s failed: %s", job_id, exc)
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
        raise self.retry(exc=exc)
    finally:
        if conn:
            conn.close()
