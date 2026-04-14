"""
CV Parsing Router — AI Service

Extracts structured data from CV/resume text using LLM.

Endpoint:
  POST /cv-parsing/parse  — Parse raw CV text into structured JSON
"""
import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import settings
from services.ollama import chat_completion

router = APIRouter()
logger = logging.getLogger(__name__)

CV_PARSING_MODEL = settings.OLLAMA_CV_PARSING_MODEL or settings.OLLAMA_MODEL
PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts" / "cv_parsing"


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CVParseRequest(BaseModel):
    """Request body for CV parsing."""
    cv_text: str = Field(..., min_length=50, description="Raw text extracted from a CV/resume PDF")


class ContactInfo(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    other_links: list[str] = []


class WorkExperience(BaseModel):
    job_title: str | None = None
    company: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    description: str | None = None
    technologies: list[str] = []


class Education(BaseModel):
    degree: str | None = None
    institution: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    gpa: str | None = None
    honors: str | None = None


class SkillEntry(BaseModel):
    skill_name: str
    category: str | None = None
    proficiency: str | None = None


class Certification(BaseModel):
    name: str
    issuer: str | None = None
    date: str | None = None
    url: str | None = None


class Project(BaseModel):
    name: str
    description: str | None = None
    technologies: list[str] = []
    url: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class LanguageEntry(BaseModel):
    language: str
    proficiency: str | None = None


class MiscItem(BaseModel):
    category: str
    items: list[str] = []


class CVParseResponse(BaseModel):
    """Full structured CV parse result."""
    full_name: str | None = None
    email: str | None = None
    location: str | None = None
    years_of_experience: float | None = None
    seniority_level: str | None = None
    primary_domain: str | None = None
    summary: str | None = None
    has_github: bool | None = None
    has_linkedin: bool | None = None
    has_portfolio: bool | None = None
    contact_info: ContactInfo | None = None
    work_experience: list[WorkExperience] = []
    education: list[Education] = []
    skills: list[SkillEntry] = []
    certifications: list[Certification] = []
    projects: list[Project] = []
    languages: list[LanguageEntry] = []
    miscellaneous: list[MiscItem] = []


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _load_prompt(name: str, **kwargs: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    try:
        template = path.read_text(encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prompt file missing: {path}") from exc
    for key, value in kwargs.items():
        template = template.replace(f"{{{key}}}", value)
    return template


def _extract_json(content: str) -> dict:
    """Extract JSON object from LLM output, handling markdown fences."""
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)

    # Direct parse
    try:
        result = json.loads(content)
        if isinstance(result, dict):
            return result
    except Exception:
        pass

    # Fallback: find the JSON object
    obj_start = content.find("{")
    obj_end = content.rfind("}") + 1
    if obj_start != -1 and obj_end > obj_start:
        try:
            return json.loads(content[obj_start:obj_end])
        except Exception:
            pass

    raise ValueError("No valid JSON object found in LLM response")


SENIORITY_ALIASES = {
    "entry_level": "junior", "entry level": "junior", "entry": "junior",
    "associate": "junior", "graduate": "junior", "trainee": "intern",
    "staff": "senior", "sr": "senior", "sr.": "senior",
    "management": "executive", "director": "executive", "vp": "executive",
    "c-level": "executive", "cto": "executive", "ceo": "executive",
}
VALID_SENIORITY = {"intern", "junior", "mid", "senior", "lead", "principal", "executive"}

DOMAIN_ALIASES = {
    "swe": "software_engineering", "backend": "software_engineering",
    "frontend": "software_engineering", "fullstack": "software_engineering",
    "full_stack": "software_engineering", "web_development": "software_engineering",
    "mobile": "software_engineering", "embedded": "software_engineering",
    "ml": "data_science", "machine_learning": "data_science",
    "ai": "data_science", "data_engineering": "data_science",
    "data_analytics": "data_science", "data_analysis": "data_science",
    "sre": "devops", "infrastructure": "devops", "cloud": "devops",
    "platform": "devops", "ux": "design", "ui": "design",
    "graphic_design": "design", "pm": "product_management",
    "project_management": "product_management",
}
VALID_DOMAINS = {
    "software_engineering", "data_science", "devops", "design",
    "product_management", "marketing", "finance", "healthcare",
    "education", "other",
}


def _normalize_parsed(data: dict) -> dict:
    """Normalize seniority_level and primary_domain to canonical values."""
    # Seniority
    raw = (data.get("seniority_level") or "").strip().lower().replace("-", "_")
    if raw in VALID_SENIORITY:
        data["seniority_level"] = raw
    elif raw in SENIORITY_ALIASES:
        data["seniority_level"] = SENIORITY_ALIASES[raw]
    elif raw:
        data["seniority_level"] = "mid"  # safe default

    # Domain
    raw = (data.get("primary_domain") or "").strip().lower().replace(" ", "_").replace("-", "_")
    if raw in VALID_DOMAINS:
        data["primary_domain"] = raw
    elif raw in DOMAIN_ALIASES:
        data["primary_domain"] = DOMAIN_ALIASES[raw]
    elif raw:
        data["primary_domain"] = "other"

    # Sync contact_info ↔ top-level
    contact = data.get("contact_info") or {}
    if isinstance(contact, dict):
        if not data.get("full_name") and contact.get("full_name"):
            data["full_name"] = contact["full_name"]
        if not data.get("email") and contact.get("email"):
            data["email"] = contact["email"]
        if not data.get("location") and contact.get("location"):
            data["location"] = contact["location"]
        if contact.get("github_url") and data.get("has_github") is None:
            data["has_github"] = True
        if contact.get("linkedin_url") and data.get("has_linkedin") is None:
            data["has_linkedin"] = True
        if contact.get("portfolio_url") and data.get("has_portfolio") is None:
            data["has_portfolio"] = True

    return data


def _mock_parse_response(cv_text: str) -> CVParseResponse:
    """Return a deterministic mock response for local dev/testing."""
    return CVParseResponse(
        full_name="Mock Candidate",
        email="mock@example.com",
        location="Mock City",
        years_of_experience=3.0,
        seniority_level="mid",
        primary_domain="software_engineering",
        summary="Mock CV parse result for local development.",
        has_github=True,
        has_linkedin=True,
        has_portfolio=False,
        contact_info=ContactInfo(
            full_name="Mock Candidate",
            email="mock@example.com",
            phone="+1-555-0100",
            location="Mock City",
        ),
        skills=[
            SkillEntry(skill_name="Python", category="Programming", proficiency="advanced"),
            SkillEntry(skill_name="FastAPI", category="Framework", proficiency="intermediate"),
        ],
        work_experience=[
            WorkExperience(
                job_title="Software Engineer",
                company="Mock Corp",
                start_date="2021-01",
                is_current=True,
                description="Developed mock applications.",
            )
        ],
        education=[
            Education(
                degree="BSc Computer Science",
                institution="Mock University",
                end_date="2020",
            )
        ],
    )


# ─── Endpoint ────────────────────────────────────────────────────────────────

@router.post("/parse", response_model=CVParseResponse)
async def parse_cv(request: CVParseRequest):
    """
    Parse raw CV text into structured JSON using LLM.

    The caller (backend worker) is responsible for PDF text extraction.
    This endpoint only handles the AI structured extraction step.
    """
    # Mock mode for local testing
    if settings.USE_MOCK:
        logger.info("CV parsing: returning mock response (USE_MOCK=true)")
        return _mock_parse_response(request.cv_text)

    try:
        prompt = _load_prompt("parse", CV_TEXT=request.cv_text[:30000])

        result = await chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model=CV_PARSING_MODEL,
            response_format="json",
        )

        parsed = _extract_json(result.get("content", ""))
        normalized = _normalize_parsed(parsed)

        logger.info(
            "CV parsed: name=%s, email=%s, skills=%d, experience=%d",
            normalized.get("full_name"),
            normalized.get("email"),
            len(normalized.get("skills", [])),
            len(normalized.get("work_experience", [])),
        )

        return CVParseResponse(**normalized)

    except json.JSONDecodeError as exc:
        logger.error("CV parsing JSON decode error: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {exc}")
    except Exception as exc:
        logger.error("CV parsing failed: %s", exc)
        message = str(exc).lower()
        if "401" in message or "unauthorized" in message:
            raise HTTPException(
                status_code=401,
                detail="Ollama Cloud unauthorized. Check OLLAMA_API_KEY in ai-service/.env",
            )
        if "404" in message and "model" in message:
            raise HTTPException(
                status_code=502,
                detail=f"Model '{CV_PARSING_MODEL}' not found on Ollama Cloud.",
            )
        raise HTTPException(status_code=502, detail=f"CV parsing LLM error: {exc}")
