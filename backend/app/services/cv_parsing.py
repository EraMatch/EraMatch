import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CVAnalysis, CandidateApplication, CandidateProfile, Position

logger = logging.getLogger(__name__)


def _to_relative_url(file_path: str) -> str:
    """Convert an absolute filesystem path to a /static/... relative URL."""
    normalized = file_path.replace("\\", "/")
    idx = normalized.find("/static/")
    if idx != -1:
        return normalized[idx:]
    return "/" + normalized.lstrip("/")


def _build_profile_text(
    skills: list[str] | None,
    experience_years,
    work_history: list | None,
    education: list | None,
) -> str:
    """Build a flat profile string used as input for Jina embedding."""
    parts: list[str] = []
    if skills:
        parts.append("Skills: " + ", ".join(skills))
    if work_history:
        titles = [w.get("job_title", "") for w in work_history if w.get("job_title")]
        companies = [w.get("company", "") for w in work_history if w.get("company")]
        if titles:
            parts.append("Titles: " + ", ".join(titles))
        if companies:
            parts.append("Companies: " + ", ".join(companies))
    if education:
        unis = [e.get("institution", "") for e in education if e.get("institution")]
        if unis:
            parts.append("Education: " + ", ".join(unis))
    if experience_years is not None:
        parts.append(f"{float(experience_years):.1f} years experience")
    return " | ".join(filter(None, parts))


def _jina_embed_sync(text: str, ai_service_url: str) -> list[float] | None:
    """Request a Jina embedding from the ai-service (synchronous, safe for Celery workers)."""
    import requests as _req
    try:
        resp = _req.post(
            f"{ai_service_url.rstrip('/')}/llm/embed",
            headers={"Content-Type": "application/json"},
            json={"input": [text]},
            timeout=30,
        )
        resp.raise_for_status()
        embeddings = resp.json().get("embeddings", [])
        return embeddings[0] if embeddings else None
    except Exception as e:
        logger.warning(f"[CVParsing] Embedding via ai-service failed: {e}")
        return None


class CVParsingWorkerService:
    """Synchronous service for CV parsing database operations in Celery workers."""

    def __init__(self, session: Session):
        self.session = session

    def upsert_cv_analysis(
        self,
        application_id: UUID,
        organization_id: UUID,
        file_path: str,
        parsed_data: dict,
        skills_list: list[str],
        experience_years: float | None,
    ):
        """Create or update CVAnalysis with parsed data using SQLAlchemy."""
        prescore = parsed_data.get("prescore_v2") if isinstance(parsed_data, dict) else {}
        match_score = None
        if isinstance(prescore, dict) and prescore.get("pre_score_final") is not None:
            try:
                match_score = float(prescore.get("pre_score_final"))
            except (TypeError, ValueError):
                match_score = None

        education_list = parsed_data.get("education") if isinstance(parsed_data, dict) else None
        work_history_list = parsed_data.get("work_experience") if isinstance(parsed_data, dict) else None

        stmt = select(CVAnalysis).where(CVAnalysis.application_id == application_id)
        analysis = self.session.execute(stmt).scalars().first()

        if analysis:
            analysis.parsed_data = parsed_data
            if skills_list:
                analysis.skills = skills_list
            if experience_years is not None:
                analysis.experience_years = experience_years
            if match_score is not None:
                analysis.match_score = match_score
            if education_list is not None:
                analysis.education = education_list
            if work_history_list is not None:
                analysis.work_history = work_history_list
            analysis.cv_file_url = _to_relative_url(file_path)
            analysis.analyzed_at = datetime.utcnow()
            logger.info(f"[CVParsing] Updated existing CVAnalysis for application {application_id}")
        else:
            analysis = CVAnalysis(
                application_id=application_id,
                organization_id=organization_id,
                cv_file_url=_to_relative_url(file_path),
                parsed_data=parsed_data,
                skills=skills_list if skills_list else None,
                experience_years=experience_years if experience_years is not None else None,
                match_score=match_score if match_score is not None else 0.0,
                education=education_list,
                work_history=work_history_list,
                analyzed_at=datetime.utcnow()
            )
            self.session.add(analysis)
            logger.info(f"[CVParsing] Created new CVAnalysis for application {application_id}")

        self.session.commit()

        # Back-populate resume_url on the application and compute keyword_match_score if possible
        try:
            app_stmt = select(CandidateApplication).where(CandidateApplication.id == application_id)
            application = self.session.execute(app_stmt).scalars().first()
            if application:
                if not application.resume_url:
                    application.resume_url = _to_relative_url(file_path)
                    self.session.add(application)
                    self.session.commit()

                # Compute keyword_match_score eagerly if position already has jd_keywords
                if analysis.keyword_match_score is None:
                    pos_stmt = select(Position).where(Position.id == application.position_id)
                    position = self.session.execute(pos_stmt).scalars().first()
                    if position and isinstance(position.jd_keywords, dict) and position.jd_keywords:
                        from app.services.prescore import PreScoreService
                        scorer = PreScoreService()
                        kw_score = scorer.compute_keyword_match_score(
                            jd_keywords=position.jd_keywords,
                            candidate_parsed_data=parsed_data,
                            candidate_skills=skills_list or [],
                        )
                        analysis.keyword_match_score = kw_score
                        self.session.add(analysis)
                        self.session.commit()
        except Exception as e:
            logger.warning(f"[CVParsing] Post-persist enrichment failed for app {application_id}: {e}")

        # Generate and store Jina profile embedding via ai-service
        try:
            from app.core.config import settings as _settings
            if _settings.AI_SERVICE_URL and not analysis.profile_embedding:
                profile_text = _build_profile_text(
                    skills_list, experience_years, work_history_list, education_list
                )
                if profile_text:
                    vec = _jina_embed_sync(profile_text, _settings.AI_SERVICE_URL)
                    if vec:
                        analysis.profile_embedding = vec
                        self.session.add(analysis)
                        self.session.commit()
                        logger.info(f"[CVParsing] Stored profile embedding for application {application_id}")
        except Exception as e:
            logger.warning(f"[CVParsing] Failed to store profile embedding for {application_id}: {e}")

    def backfill_candidate_profile(self, application_id: UUID, parsed_data: dict):
        """
        Update CandidateProfile with contact info extracted from the CV.
        Only updates fields that are currently empty/placeholder.
        """
        try:
            # 1. Get CandidateApplication to find the CandidateProfile
            app_stmt = select(CandidateApplication).where(CandidateApplication.id == application_id)
            application = self.session.execute(app_stmt).scalars().first()
            if not application:
                return

            candidate_id = application.candidate_id

            # 2. Get CandidateProfile
            profile_stmt = select(CandidateProfile).where(CandidateProfile.id == candidate_id)
            profile = self.session.execute(profile_stmt).scalars().first()
            if not profile:
                return

            contact = parsed_data.get("contact_info") or {}
            updated = False

            # Email: update only if current is a placeholder
            parsed_email = parsed_data.get("email") or contact.get("email")
            if parsed_email and "@example.com" in (profile.email or ""):
                profile.email = parsed_email
                updated = True

            # Full name: update if current looks like a placeholder
            parsed_name = parsed_data.get("full_name") or contact.get("full_name")
            if parsed_name and ("@example.com" in (profile.email or "") or profile.full_name == profile.email):
                profile.full_name = parsed_name
                updated = True

            # Phone
            parsed_phone = contact.get("phone")
            if parsed_phone and not profile.phone:
                profile.phone = parsed_phone
                updated = True

            # Location
            parsed_location = parsed_data.get("location") or contact.get("location")
            if parsed_location and not profile.location:
                profile.location = parsed_location
                updated = True

            # LinkedIn
            parsed_linkedin = contact.get("linkedin_url")
            if parsed_linkedin and not profile.linkedin_url:
                profile.linkedin_url = parsed_linkedin
                updated = True

            # GitHub
            parsed_github = contact.get("github_url")
            if parsed_github and not profile.github_url:
                profile.github_url = parsed_github
                updated = True

            # Portfolio
            parsed_portfolio = contact.get("portfolio_url")
            if parsed_portfolio and not profile.portfolio_url:
                profile.portfolio_url = parsed_portfolio
                updated = True

            if updated:
                self.session.add(profile)
                self.session.commit()
                logger.info(f"[CVParsing] Backfilled CandidateProfile {candidate_id}")

        except Exception as e:
            logger.error(f"[CVParsing] Failed to backfill candidate profile for app {application_id}: {e}")
            self.session.rollback()
