"""
CV Parsing Schemas — Pydantic models for structured CV extraction.

Ported from the EraMatch Phase 1 Extraction Benchmark Notebook (cv-parsing.ipynb).
These schemas define the target structure for AI-powered CV parsing and are used
by the CVParsingAIService for LLM structured output.
"""
from typing import Any, Dict, List, Literal, Optional, get_args

from pydantic import BaseModel, Field, field_validator


# =============================================================================
# LITERAL TYPES
# =============================================================================

SeniorityLevel = Literal[
    "intern", "junior", "mid", "senior", "lead", "principal", "executive"
]

PrimaryDomain = Literal[
    "backend",
    "frontend",
    "data_science",
    "devops",
    "mobile",
    "cybersecurity",
    "product_management",
    "design",
    "qa_testing",
    "general_it",
]


# =============================================================================
# SUB-MODELS
# =============================================================================

class ContactInfo(BaseModel):
    full_name: Optional[str] = Field(default=None, description="Full name as written in the CV header or contact section.")
    email: Optional[str] = Field(default=None, description="Primary email address if explicitly present.")
    phone: Optional[str] = Field(default=None, description="Primary phone number if explicitly present.")
    location: Optional[str] = Field(default=None, description="City, region, or country if explicitly present.")
    linkedin_url: Optional[str] = Field(default=None, description="LinkedIn profile URL if explicitly present.")
    github_url: Optional[str] = Field(default=None, description="GitHub profile URL if explicitly present.")
    portfolio_url: Optional[str] = Field(default=None, description="Portfolio or personal website URL if explicitly present.")


class WorkExperience(BaseModel):
    company: str = Field(description="Employer, client, or organization name.")
    job_title: str = Field(description="Role title held at the company.")
    start_date: Optional[str] = Field(default=None, description="Role start date in YYYY-MM when month is known, otherwise YYYY.")
    end_date: Optional[str] = Field(default=None, description="Role end date in YYYY-MM, YYYY, or null if not supported by the CV.")
    duration_months: Optional[int] = Field(default=None, ge=0, description="Estimated duration in months when it can be derived reliably.")
    description: Optional[str] = Field(default=None, description="Short summary of the work performed in this role.")
    technologies: List[str] = Field(default_factory=list, description="Technologies, tools, or platforms explicitly associated with this role.")
    is_remote: Optional[bool] = Field(default=None, description="Whether the role is explicitly remote or hybrid-remote.")
    employment_type: Optional[str] = Field(default=None, description="Employment type if explicitly stated, such as full-time, contract, internship, or freelance.")


class Education(BaseModel):
    institution: str = Field(description="School, university, bootcamp, or training provider.")
    degree: Optional[str] = Field(default=None, description="Degree or certification title if explicitly present.")
    field_of_study: Optional[str] = Field(default=None, description="Field of study, major, or specialization if present.")
    graduation_date: Optional[str] = Field(default=None, description="Graduation or completion date in YYYY-MM or YYYY when available.")
    gpa: Optional[str] = Field(default=None, description="GPA or grade if explicitly present.")
    activities: Optional[str] = Field(default=None, description="Relevant academic activities, honors, or societies if present.")


class SkillEntry(BaseModel):
    skill_name: str = Field(description="Normalized skill, technology, platform, or methodology mentioned in the CV.")
    category: Optional[str] = Field(default=None, description="Optional grouping such as language, framework, cloud, database, or soft skill.")
    source: Literal["explicit", "inferred"] = Field(
        default="explicit",
        description='Use "explicit" when the skill comes from a dedicated skills/tools section, otherwise "inferred".',
    )


class MiscItem(BaseModel):
    label: Literal[
        "award",
        "volunteering",
        "hobby",
        "reference",
        "publication",
        "spoken_language",
        "personal_statement",
        "other",
    ] = Field(description="Category for uncaptured but relevant resume information.")
    raw_text: str = Field(description="Original text span for the misc item.")
    structured: Optional[Dict[str, Any]] = Field(default=None, description="Optional structured details when the item contains subfields worth preserving.")


class Project(BaseModel):
    name: str = Field(description="Project name or title.")
    description: Optional[str] = Field(default=None, description="Short summary of the project.")
    technologies: List[str] = Field(default_factory=list, description="Technologies used in the project when explicitly stated.")
    url: Optional[str] = Field(default=None, description="Project, demo, or repository URL if explicitly present.")
    date: Optional[str] = Field(default=None, description="Project date in YYYY-MM or YYYY when available.")


class Certification(BaseModel):
    name: str = Field(description="Certification or license name.")
    issuer: Optional[str] = Field(default=None, description="Issuing organization.")
    date: Optional[str] = Field(default=None, description="Issue date in YYYY-MM or YYYY when available.")
    credential_id: Optional[str] = Field(default=None, description="Credential or license identifier if explicitly present.")


# =============================================================================
# TOP-LEVEL CV SCHEMA
# =============================================================================

class CVSchema(BaseModel):
    """
    Structured CV extraction schema.

    This is the target output for AI-powered CV parsing. The LLM extracts
    information from raw CV text and maps it to this schema.
    """
    full_name: Optional[str] = Field(default=None, description="Candidate full name. Populate this top-level field when the name is present anywhere in the CV.")
    email: Optional[str] = Field(default=None, description="Primary email address. Populate this top-level field when present anywhere in the CV.")
    location: Optional[str] = Field(default=None, description="Candidate location, such as city, region, or country.")
    years_of_experience: Optional[float] = Field(
        default=None,
        ge=0,
        description="Estimated total years of professional experience derived from dated work experience rather than marketing claims.",
    )
    seniority_level: Optional[SeniorityLevel] = Field(
        default=None,
        description="Professional seniority level. Use one of intern, junior, mid, senior, lead, principal, or executive.",
    )
    primary_domain: Optional[PrimaryDomain] = Field(
        default=None,
        description="Primary professional domain. Use the best-supported domain from the controlled dataset taxonomy or null.",
    )
    has_github: Optional[bool] = Field(default=None, description="Whether the CV includes a GitHub profile or repository link.")
    has_linkedin: Optional[bool] = Field(default=None, description="Whether the CV includes a LinkedIn profile link.")

    contact_info: Optional[ContactInfo] = Field(default=None, description="Structured contact details block.")
    summary: Optional[str] = Field(default=None, description="Short professional summary or profile statement if explicitly present.")
    work_experience: List[WorkExperience] = Field(default_factory=list, description="Chronological work experience entries extracted from the CV.")
    education: List[Education] = Field(default_factory=list, description="Education entries extracted from the CV.")
    skills: List[SkillEntry] = Field(default_factory=list, description="All relevant skills mentioned anywhere in the CV.")
    projects: List[Project] = Field(default_factory=list, description="Projects section entries when explicitly present.")
    certifications: List[Certification] = Field(default_factory=list, description="Certifications or licenses explicitly present in the CV.")
    misc_data: List[MiscItem] = Field(default_factory=list, description="Other relevant information that does not cleanly fit the main sections.")

    @field_validator("seniority_level", mode="before")
    @classmethod
    def normalize_seniority_level(cls, value: Any) -> Any:
        if value is None or not isinstance(value, str):
            return value
        normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "entry": "junior",
            "entry_level": "junior",
            "jr": "junior",
            "mid_level": "mid",
            "midlevel": "mid",
            "sr": "senior",
            "staff": "lead",
            "head": "executive",
            "director": "executive",
            "vp": "executive",
            "vice_president": "executive",
            "c_level": "executive",
            "cxo": "executive",
        }
        return aliases.get(normalized, normalized)

    @field_validator("primary_domain", mode="before")
    @classmethod
    def normalize_primary_domain(cls, value: Any) -> Any:
        if value is None or not isinstance(value, str):
            return value
        normalized = value.strip().lower().replace("-", "_").replace(" ", "_").replace("/", "_")
        aliases = {
            # backend variants
            "backend_engineering": "backend",
            "back_end": "backend",
            "back_end_engineering": "backend",
            "server_side": "backend",
            # frontend variants
            "frontend_engineering": "frontend",
            "front_end": "frontend",
            "front_end_engineering": "frontend",
            "ui_development": "frontend",
            # data variants
            "data": "data_science",
            "data_engineering": "data_science",
            "data_analytics": "data_science",
            "data_analysis": "data_science",
            "ml": "data_science",
            "machine_learning": "data_science",
            "ai": "data_science",
            "artificial_intelligence": "data_science",
            # devops variants
            "cloud": "devops",
            "infrastructure": "devops",
            "sre": "devops",
            "site_reliability": "devops",
            "platform_engineering": "devops",
            # product variants
            "product": "product_management",
            "product_manager": "product_management",
            "pm": "product_management",
            # qa variants
            "qa": "qa_testing",
            "quality_assurance": "qa_testing",
            "quality_engineering": "qa_testing",
            "test_engineering": "qa_testing",
            "testing": "qa_testing",
            # general IT variants
            "it": "general_it",
            "general": "general_it",
            "information_technology": "general_it",
            "it_support": "general_it",
            "systems_administration": "general_it",
            # design variants
            "ui_ux": "design",
            "ux": "design",
            "ui": "design",
            "graphic_design": "design",
            "product_design": "design",
            # mobile variants
            "android": "mobile",
            "ios": "mobile",
            "mobile_development": "mobile",
            "react_native": "mobile",
            # security variants
            "security": "cybersecurity",
            "information_security": "cybersecurity",
            "infosec": "cybersecurity",
            "network_security": "cybersecurity",
        }
        canonical = aliases.get(normalized, normalized)
        valid = get_args(PrimaryDomain)
        # If after alias resolution the value is still not a known literal,
        # return None rather than letting Pydantic raise a hard ValidationError.
        return canonical if canonical in valid else None
