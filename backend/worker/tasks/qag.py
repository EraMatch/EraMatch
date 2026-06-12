"""
Celery task for recomputing candidate pre-scores against QAG automatically.
"""
import asyncio
import logging
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.db.session import sync_session_factory
from app.models import (
    Position,
    CandidateApplication,
    CandidateProfile,
    CVAnalysis,
    GitHubAnalysis,
    QAGProcessingJob,
)
from app.services.prescore import PreScoreService
from worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# Max seconds to wait for the LLM to evaluate a single candidate.
# If Ollama takes longer than this, we skip the candidate and use the
# heuristic fallback score instead of blocking the whole queue.
PER_CANDIDATE_TIMEOUT_SECONDS = 120


async def _run_prescore_async(
    job_title, job_description, required_skills, years_of_experience,
    candidate_skills, candidate_experience_years, candidate_parsed_data,
    github_analysis_data, jd_critic_result,
    profile_embedding=None, jd_embedding=None,
    position_experience_level=None, position_education_level=None, jd_keywords=None,
):
    scorer = PreScoreService()
    return await asyncio.wait_for(
        scorer.score_candidate_prescore(
            job_title=job_title,
            job_description=job_description,
            required_skills=required_skills,
            years_of_experience=years_of_experience,
            candidate_skills=candidate_skills,
            candidate_experience_years=candidate_experience_years,
            candidate_parsed_data=candidate_parsed_data,
            github_analysis_data=github_analysis_data,
            jd_critic_result=jd_critic_result,
            profile_embedding=profile_embedding,
            jd_embedding=jd_embedding,
            position_experience_level=position_experience_level,
            position_education_level=position_education_level,
            jd_keywords=jd_keywords,
        ),
        timeout=PER_CANDIDATE_TIMEOUT_SECONDS,
    )


def _heuristic_prescore(position, cv, gh):
    """Fast fallback scoring based purely on token overlap and skills (no LLM)."""
    scorer = PreScoreService()

    parsed = cv.parsed_data if isinstance(cv.parsed_data, dict) else {}

    # 1. Fuzzy skill match
    skill_alignment = scorer.fuzzy_skill_match(
        required_skills=list(position.required_skills or []) if isinstance(position.required_skills, list) else [],
        candidate_skills=list(cv.skills or []),
    )

    # 2. Experience alignment
    expected_exp = max(0, int(position.years_of_experience or 0))
    actual_exp = max(0.0, float(cv.experience_years or 0.0))
    if actual_exp <= 0.0:
        computed_yoe = scorer.calculate_yoe_from_work_history(parsed)
        if computed_yoe is not None and computed_yoe > 0:
            actual_exp = computed_yoe
    if expected_exp <= 0:
        experience_alignment = 70.0
    else:
        ratio = min(actual_exp / float(expected_exp), 1.25)
        experience_alignment = round(min(100.0, ratio * 100), 1)

    skills_experience_score = round((skill_alignment * 0.7) + (experience_alignment * 0.3), 1)

    # 3. Token overlap
    import re
    WORD_RE = re.compile(r"[a-z]{2,}")
    def _tokenize(text):
        return {tok for tok in WORD_RE.findall((text or "").lower()) if len(tok) > 1}

    jd_text = " ".join([
        position.job_title or "",
        position.job_description or "",
        " ".join(position.required_skills or []) if isinstance(position.required_skills, list) else "",
    ])
    jd_tokens = _tokenize(jd_text)
    candidate_text = " ".join([str(parsed.get("summary") or ""), " ".join(cv.skills or [])])
    candidate_tokens = _tokenize(candidate_text)
    if jd_tokens and candidate_tokens:
        overlap = len(jd_tokens & candidate_tokens)
        token_overlap = round((2 * overlap / (len(jd_tokens) + len(candidate_tokens))) * 100, 1)
    else:
        token_overlap = 0.0

    # 4. Seniority alignment
    seniority_score = scorer.seniority_alignment(
        position_level=getattr(position, "experience_level", None),
        candidate_seniority=parsed.get("seniority_level"),
    )

    # 5. Education alignment
    edu_score = scorer.education_alignment(
        required_level=getattr(position, "education_level", None),
        candidate_parsed_data=parsed,
    )

    # Composite
    pre_score_final = round(
        (skill_alignment * 0.35)
        + (experience_alignment * 0.20)
        + (token_overlap * 0.20)
        + (seniority_score * 0.10)
        + (edu_score * 0.10),
        1,
    )

    return {
        "version": "heuristic_fallback_v2",
        "pre_score_final": pre_score_final,
        "semantic_fit_score": token_overlap,
        "skills_experience_score": skills_experience_score,
        "skill_alignment": skill_alignment,
        "experience_alignment": experience_alignment,
        "keyword_coverage": token_overlap,
        "seniority_score": seniority_score,
        "education_score": edu_score,
        "optional_profile_boost": 0.0,
        "jd_quality_score": 0.5,
        "jd_quality_status": "llm_timeout_fallback",
        "jd_quality_cap": None,
        "jd_quality_cap_applied": False,
        "criteria_checks": [],
        "score_explanation": [
            "LLM timed out — heuristic score used.",
            f"Skills match {skill_alignment}% (fuzzy synonym matching)",
            f"Experience alignment {experience_alignment}%",
            f"Keyword coverage {token_overlap}%",
            f"Seniority fit {seniority_score}%",
            f"Education fit {edu_score}%",
        ],
    }


@celery_app.task(
    bind=True,
    name="qag.recompute_position_prescores",
    max_retries=0,        # Don't auto-retry — avoid duplicate runs
    soft_time_limit=3600, # 1-hour overall soft limit
    time_limit=3900,      # Hard kill at 65 minutes
)
def recompute_position_prescores(self, position_id: str, organization_id: str, user_id: str, job_id: str):
    """
    Background task to evaluate all candidates for a given position
    against the newly approved HD Eval + QAG rubric.

    Each candidate gets up to PER_CANDIDATE_TIMEOUT_SECONDS for the LLM call.
    If it times out, a heuristic fallback score is saved instead so the job
    always completes and never hangs.
    """
    logger.info("[QAG] Starting recompute for position_id=%s, job_id=%s", position_id, job_id)

    with sync_session_factory() as session:
        job = session.get(QAGProcessingJob, UUID(job_id))
        if not job:
            logger.error("[QAG] Job tracking record not found for job_id=%s", job_id)
            return

        position = session.get(Position, UUID(position_id))
        if not position:
            job.status = "failed"
            job.error_message = "Position not found"
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
            return

        try:
            query = (
                select(CandidateApplication, CandidateProfile, CVAnalysis, GitHubAnalysis)
                .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
                .outerjoin(CVAnalysis, CandidateApplication.id == CVAnalysis.application_id)
                .outerjoin(
                    GitHubAnalysis,
                    (GitHubAnalysis.candidate_id == CandidateProfile.id)
                    & (GitHubAnalysis.organization_id == UUID(organization_id)),
                )
                .where(
                    CandidateApplication.position_id == UUID(position_id),
                    CandidateApplication.organization_id == UUID(organization_id),
                    CandidateApplication.is_deleted == False,
                )
            )
            result = session.execute(query)
            rows = result.all()
            candidates_found = len(rows)

            job.total_items = candidates_found
            session.commit()

            # Read the approved QAG rubric from the position record
            jd_critic_result = position.jd_hdeval_qag if isinstance(position.jd_hdeval_qag, dict) else {}
            approved_questions = jd_critic_result.get("approved_questions", [])
            logger.info(
                "[QAG] position=%s has %d approved questions, evaluating %d candidates",
                position_id, len(approved_questions), candidates_found
            )

            updates = 0
            timeouts = 0

            for app, profile, cv, gh in rows:
                if not cv:
                    cv = CVAnalysis(
                        application_id=app.id,
                        organization_id=UUID(organization_id),
                        cv_file_url=app.resume_url,
                        parsed_data={},
                        skills=[],
                        experience_years=0,
                        match_score=0,
                    )
                    session.add(cv)

                parsed_data = cv.parsed_data if isinstance(cv.parsed_data, dict) else {}

                try:
                    prescore = asyncio.run(
                        _run_prescore_async(
                            job_title=position.job_title,
                            job_description=position.job_description,
                            required_skills=position.required_skills if isinstance(position.required_skills, list) else [],
                            years_of_experience=position.years_of_experience,
                            candidate_skills=cv.skills or [],
                            candidate_experience_years=float(cv.experience_years or 0.0),
                            candidate_parsed_data=parsed_data,
                            github_analysis_data={
                                "contribution_score": gh.contribution_score if gh else None,
                                "code_quality_score": gh.code_quality_score if gh else None,
                                "repo_count": gh.repo_count if gh else None,
                            },
                            jd_critic_result=jd_critic_result,
                            profile_embedding=cv.profile_embedding,
                            jd_embedding=position.jd_embedding,
                            position_experience_level=getattr(position, "experience_level", None),
                            position_education_level=getattr(position, "education_level", None),
                            jd_keywords=position.jd_keywords if isinstance(position.jd_keywords, dict) else None,
                        )
                    )
                    logger.info(
                        "[QAG] Scored candidate application_id=%s score=%.1f",
                        app.id, prescore.get("pre_score_final", 0)
                    )
                except (asyncio.TimeoutError, Exception) as exc:
                    timeouts += 1
                    logger.warning(
                        "[QAG] LLM call failed/timed-out for application_id=%s (%s). Using heuristic fallback.",
                        app.id, type(exc).__name__
                    )
                    prescore = _heuristic_prescore(position, cv, gh)

                parsed_data["prescore_v2"] = prescore
                cv.parsed_data = parsed_data
                flag_modified(cv, "parsed_data")
                new_score = prescore.get("pre_score_final", 0)
                # Defense-in-depth: never overwrite an existing valid (non-zero) score with 0.
                existing_score = float(cv.match_score) if cv.match_score is not None else 0.0
                if (new_score is None or float(new_score) == 0.0) and existing_score > 0.0:
                    logger.warning(
                        "[QAG] Skipping 0 overwrite for application_id=%s; keeping existing score=%.1f",
                        app.id, existing_score,
                    )
                else:
                    cv.match_score = new_score
                cv.analyzed_at = datetime.now(timezone.utc)
                session.add(cv)
                updates += 1

                job.processed_items = updates
                session.commit()

            # Mark job complete
            job.status = "completed"
            job.processed_items = updates
            job.summary = {
                "position_id": position_id,
                "candidates_found": candidates_found,
                "candidates_processed": updates,
                "llm_scored": updates - timeouts,
                "heuristic_fallback": timeouts,
                "candidates_skipped": max(0, candidates_found - updates),
                "zero_reason": (
                    "No applications found for this position at run time."
                    if candidates_found == 0
                    else None
                ),
            }
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
            logger.info(
                "[QAG] Done. position=%s: %d scored by LLM, %d used heuristic fallback.",
                position_id, updates - timeouts, timeouts
            )

        except Exception as exc:
            logger.error("[QAG] Fatal error for job_id=%s: %s", job_id, exc, exc_info=True)
            job.status = "failed"
            job.error_message = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            session.commit()

@celery_app.task(
    bind=True,
    name="qag.generate_position_qag",
    max_retries=0,
    soft_time_limit=600,
    time_limit=660,
)
def generate_position_qag(self, position_id: str, job_id: str):
    """Background task to generate QAG questions for a position."""
    logger.info("[QAG] Starting generation for position_id=%s, job_id=%s", position_id, job_id)

    with sync_session_factory() as session:
        job = session.get(QAGProcessingJob, UUID(job_id))
        position = session.get(Position, UUID(position_id))
        
        if not position or not job:
            if job:
                job.status = "failed"
                job.error_message = "Position not found"
                job.completed_at = datetime.now(timezone.utc)
                session.commit()
            return
            
        try:
            scorer = PreScoreService()
            
            async def _run():
                return await scorer.run_position_jd_critic(
                    job_title=position.job_title,
                    job_description=position.job_description,
                    required_skills=position.required_skills if isinstance(position.required_skills, list) else [],
                    years_of_experience=position.years_of_experience,
                )
            
            critic = asyncio.run(_run())
            
            position.jd_hdeval_qag = critic
            flag_modified(position, "jd_hdeval_qag")
            session.add(position)
            
            question_count = len(critic.get("questions") or []) if isinstance(critic, dict) else 0
            status = str(critic.get("status") or "completed") if isinstance(critic, dict) else "completed"
            provider = str(critic.get("provider") or "ai-service:ollama") if isinstance(critic, dict) else "ai-service:ollama"
            job.source_provider = provider

            if status == "ai_generation_failed" or question_count == 0:
                job.status = "failed"
                job.processed_items = 0
                job.error_message = str(critic.get("feedback") or "AI-only QAG generation failed") if isinstance(critic, dict) else "AI-only QAG generation failed"
                job.summary = {
                    "status": status,
                    "question_count": question_count,
                }
            else:
                job.status = "completed"
                job.processed_items = question_count
                job.summary = {
                    "status": status,
                    "question_count": question_count,
                    "fallback_used": bool(critic.get("fallback_used", False)) if isinstance(critic, dict) else False,
                }
            
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
            logger.info("[QAG] Generated QAG for position=%s: %d questions", position_id, question_count)
            
        except Exception as exc:
            logger.error("[QAG] Fatal error generating QAG for job_id=%s: %s", job_id, exc, exc_info=True)
            job.status = "failed"
            job.error_message = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
