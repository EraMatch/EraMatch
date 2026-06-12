from __future__ import annotations

import json
import re
from pathlib import Path
from time import perf_counter
from typing import Any
import httpx

from app.integrations.llm import get_llm
from app.core.config import settings

_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "ai-service" / "prompts"

def _load_prompt(filename: str) -> str:
    """Load a prompt template from the prompts directory."""
    return (_PROMPTS_DIR / filename).read_text(encoding="utf-8")


WORD_RE = re.compile(r"[a-z0-9+#.]+")

# ── Skill synonym table for fuzzy matching ──────────────────────────────────
SKILL_SYNONYMS: dict[str, set[str]] = {
    "react": {"react", "react.js", "reactjs", "react js"},
    "node": {"node", "node.js", "nodejs", "node js"},
    "next": {"next", "next.js", "nextjs", "next js"},
    "vue": {"vue", "vue.js", "vuejs", "vue js"},
    "angular": {"angular", "angular.js", "angularjs"},
    "typescript": {"typescript", "ts"},
    "javascript": {"javascript", "js", "es6", "ecmascript"},
    "python": {"python", "python3"},
    "c++": {"c++", "cpp"},
    "c#": {"c#", "csharp", "c sharp"},
    ".net": {".net", "dotnet", "dot net"},
    "postgresql": {"postgresql", "postgres", "psql"},
    "mongodb": {"mongodb", "mongo"},
    "mysql": {"mysql"},
    "docker": {"docker", "containerization"},
    "kubernetes": {"kubernetes", "k8s"},
    "aws": {"aws", "amazon web services"},
    "gcp": {"gcp", "google cloud", "google cloud platform"},
    "azure": {"azure", "microsoft azure"},
    "ci/cd": {"ci/cd", "cicd", "ci cd", "continuous integration", "continuous deployment"},
    "redux": {"redux", "redux toolkit"},
    "graphql": {"graphql", "graph ql"},
    "rest": {"rest", "rest api", "rest apis", "restful"},
    "sql": {"sql"},
    "nosql": {"nosql", "no sql"},
    "terraform": {"terraform"},
    "git": {"git", "version control"},
    "agile": {"agile", "scrum", "kanban"},
    "machine learning": {"machine learning", "ml"},
    "deep learning": {"deep learning", "dl"},
    "tensorflow": {"tensorflow"},
    "pytorch": {"pytorch", "torch"},
    "pandas": {"pandas"},
    "numpy": {"numpy"},
    "scikit-learn": {"scikit-learn", "sklearn", "scikit learn"},
    "fastapi": {"fastapi", "fast api"},
    "django": {"django"},
    "flask": {"flask"},
    "express": {"express", "express.js", "expressjs"},
    "spring": {"spring", "spring boot", "springboot"},
    "html": {"html", "html5"},
    "css": {"css", "css3"},
    "sass": {"sass", "scss"},
    "webpack": {"webpack"},
    "vite": {"vite"},
    "cypress": {"cypress"},
    "jest": {"jest"},
    "selenium": {"selenium"},
    "tailwind": {"tailwind", "tailwindcss", "tailwind css"},
    "redis": {"redis"},
    "kafka": {"kafka", "apache kafka"},
    "elasticsearch": {"elasticsearch", "elastic search", "es"},
    "linux": {"linux", "unix"},
    "java": {"java"},
    "go": {"go", "golang"},
    "rust": {"rust"},
    "swift": {"swift"},
    "kotlin": {"kotlin"},
    "php": {"php"},
    "ruby": {"ruby"},
    "r": {"r"},
}

# Build reverse lookup: synonym string -> canonical key
_SYNONYM_TO_CANONICAL: dict[str, str] = {}
for _canonical, _synonyms in SKILL_SYNONYMS.items():
    for _syn in _synonyms:
        _SYNONYM_TO_CANONICAL[_syn] = _canonical

# ── Seniority / experience level mapping ────────────────────────────────────
SENIORITY_LEVEL_MAP: dict[str, int] = {
    "intern": 0, "internship": 0, "trainee": 0,
    "entry": 1, "entry level": 1, "entry-level": 1, "entry_level": 1,
    "junior": 1, "junior level": 1, "junior-level": 1,
    "mid": 2, "mid level": 2, "mid-level": 2, "mid_level": 2,
    "intermediate": 2, "associate": 2,
    "senior": 3, "senior level": 3, "senior-level": 3, "senior_level": 3, "sr": 3,
    "lead": 4, "staff": 4,
    "principal": 5,
    "executive": 6, "director": 6, "vp": 6, "c-level": 6, "management": 6,
}

# ── Education level mapping ─────────────────────────────────────────────────
EDUCATION_LEVEL_MAP: dict[str, int] = {
    "any": 0, "none": 0,
    "high school": 1, "high_school": 1, "secondary": 1, "diploma": 1,
    "associate": 2, "associate's": 2, "associates": 2,
    "bachelor": 3, "bachelor's": 3, "bachelors": 3,
    "bsc": 3, "ba": 3, "bs": 3, "b.sc": 3, "b.a": 3, "undergraduate": 3, "b.s": 3,
    "master": 4, "master's": 4, "masters": 4,
    "msc": 4, "ma": 4, "ms": 4, "m.sc": 4, "m.a": 4, "mba": 4,
    "graduate": 4, "postgraduate": 4, "m.s": 4,
    "phd": 5, "ph.d": 5, "doctorate": 5, "doctoral": 5, "dr": 5,
}


class PreScoreService:
    """Pre-score engine with LLM-based HD Eval + QAG style JD critic."""

    VERSION = "prescore_v2"
    QAG_QUESTION_COUNT = 50
    CRITIC_TESTS = [
        "Is the job title clear and specific for the role?",
        "Is the job description self-contained and understandable without missing context?",
        "Are required skills concrete and verifiable from candidate evidence?",
        "Is the experience requirement realistic and consistent with the role level?",
        "Are responsibilities action-oriented and measurable?",
        "Is the JD free from contradictory seniority or scope signals?",
        "Is language quality clear, concise, and free of ambiguity?",
        "Does the JD avoid biased or exclusionary phrasing?",
        "Is there clear alignment between role scope and required skills?",
        "Can this JD support consistent candidate ranking decisions?",
    ]
    CRITIC_WEIGHTS = [0.10] * len(CRITIC_TESTS)
    CRITIC_PASS_THRESHOLD = 0.7
    CRITIC_FLAG_THRESHOLD = 0.4

    def _parse_first_json_object(self, text: str | None) -> dict[str, Any]:
        if not isinstance(text, str) or not text.strip():
            return {}
        decoder = json.JSONDecoder()
        for idx, ch in enumerate(text):
            if ch != "{":
                continue
            try:
                obj, _ = decoder.raw_decode(text[idx:])
                if isinstance(obj, dict):
                    return obj
            except Exception:
                continue
        return {}

    async def _invoke_qag_llm(
        self,
        *,
        prompt: str,
        llm_provider: str | None = None,
        llm_model: str | None = None,
    ) -> tuple[str, str, str | None]:
        provider = (
            (llm_provider or settings.PRESCORE_LLM_PROVIDER or settings.DEFAULT_LLM_PROVIDER or "ollama")
            .strip()
            .lower()
        )
        model = llm_model or settings.PRESCORE_LLM_MODEL

        if settings.PRESCORE_USE_AI_SERVICE:
            url = f"{settings.AI_SERVICE_URL.rstrip('/')}/llm/chat"
            payload: dict[str, Any] = {
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
            }
            if model:
                payload["model"] = model

            async with httpx.AsyncClient(timeout=float(settings.PRESCORE_AI_SERVICE_TIMEOUT_SECONDS)) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json() if response.content else {}

            content = str(data.get("content") or "")
            used_model = str(data.get("model") or model or "") or None
            return content, "ai-service:ollama", used_model

        llm = get_llm(provider=provider, model=model, temperature=0.0)
        raw_response = await llm.ainvoke(prompt)
        content = raw_response.content if hasattr(raw_response, "content") else str(raw_response)
        return str(content), provider, model

    def _tokenize(self, text: str | None) -> set[str]:
        if not text:
            return set()
        return {tok for tok in WORD_RE.findall(text.lower()) if len(tok) > 1}

    @staticmethod
    def _cosine_sim(a: list[float], b: list[float]) -> float:
        """Cosine similarity → 0–100 float. Pure-Python, no numpy required."""
        import math
        dot = sum(x * y for x, y in zip(a, b))
        ma = math.sqrt(sum(x * x for x in a))
        mb = math.sqrt(sum(y * y for y in b))
        if ma == 0 or mb == 0:
            return 0.0
        return round(min(100.0, (dot / (ma * mb)) * 100), 1)
    # ── Fuzzy skill matching ─────────────────────────────────────────────

    def _canonicalize_skill(self, skill: str) -> str:
        """Map a skill string to its canonical form via the synonym table."""
        s = skill.lower().strip()
        return _SYNONYM_TO_CANONICAL.get(s, s)

    def fuzzy_skill_match(
        self,
        required_skills: list[str],
        candidate_skills: list[str],
    ) -> float:
        """Return 0-100 score comparing required vs candidate skills with synonym expansion."""
        if not required_skills:
            return 60.0  # no requirement → neutral

        req_canonical = {self._canonicalize_skill(s) for s in required_skills if s.strip()}
        cand_canonical = {self._canonicalize_skill(s) for s in candidate_skills if s.strip()}

        if not req_canonical:
            return 60.0

        matched = len(req_canonical & cand_canonical)
        return round((matched / len(req_canonical)) * 100, 1)

    # ── Seniority alignment ──────────────────────────────────────────────

    def seniority_alignment(
        self,
        position_level: str | None,
        candidate_seniority: str | None,
    ) -> float:
        """Return 0-100 alignment score between position level and candidate seniority."""
        if not position_level or not candidate_seniority:
            return 60.0  # unknown → neutral

        pos = SENIORITY_LEVEL_MAP.get(position_level.lower().strip(), None)
        cand = SENIORITY_LEVEL_MAP.get(candidate_seniority.lower().strip(), None)

        if pos is None or cand is None:
            return 60.0

        diff = abs(pos - cand)
        if diff == 0:
            return 100.0
        if diff == 1:
            return 80.0  # adjacent level — good fit
        if diff == 2:
            return 45.0  # 2 levels apart — stretch
        return 15.0      # 3+ levels — clear mismatch

    # ── Education alignment ──────────────────────────────────────────────

    def _extract_highest_education(self, parsed_data: dict[str, Any] | None) -> str | None:
        """Extract the highest education level from CV parsed_data.education list."""
        if not isinstance(parsed_data, dict):
            return None

        education = parsed_data.get("education")
        if not isinstance(education, list):
            return None

        max_level = -1
        max_label = None
        for entry in education:
            if not isinstance(entry, dict):
                continue
            degree = str(entry.get("degree") or "").lower().strip()
            if not degree:
                continue
            # Try matching each word in the degree string
            for token in degree.replace(".", " ").replace("'", "").split():
                level = EDUCATION_LEVEL_MAP.get(token)
                if level is not None and level > max_level:
                    max_level = level
                    max_label = token
            # Also try the full string
            level = EDUCATION_LEVEL_MAP.get(degree)
            if level is not None and level > max_level:
                max_level = level
                max_label = degree

        return max_label if max_level > 0 else None

    def education_alignment(
        self,
        required_level: str | None,
        candidate_parsed_data: dict[str, Any] | None,
    ) -> float:
        """Return 0-100 education alignment score."""
        if not required_level:
            return 60.0  # not specified → neutral

        req_rank = EDUCATION_LEVEL_MAP.get(required_level.lower().strip())
        if req_rank is None or req_rank == 0:  # "any"
            return 80.0

        highest = self._extract_highest_education(candidate_parsed_data)
        if not highest:
            return 40.0  # can't determine → slight penalty

        cand_rank = EDUCATION_LEVEL_MAP.get(highest, 0)
        diff = cand_rank - req_rank  # positive = over-qualified, negative = under
        if diff >= 0:
            return 100.0  # meets or exceeds
        if diff == -1:
            return 65.0   # one level below — acceptable
        return 30.0       # significantly under-qualified

    # ── YoE fallback from work history dates ─────────────────────────────

    def calculate_yoe_from_work_history(
        self, parsed_data: dict[str, Any] | None
    ) -> float | None:
        """Calculate total years of experience from work_experience date ranges."""
        if not isinstance(parsed_data, dict):
            return None

        work_exp = parsed_data.get("work_experience")
        if not isinstance(work_exp, list) or not work_exp:
            return None

        from app.utils.date_parser import parse_date_range, calculate_duration_months, parse_single_date
        from datetime import datetime as dt

        total_months = 0
        for entry in work_exp:
            if not isinstance(entry, dict):
                continue

            if "duration_months" in entry:
                total_months += entry["duration_months"]
                continue

            start_str = entry.get("start_date")
            end_str = entry.get("end_date")
            is_current = entry.get("is_current", False)
            duration_str = entry.get("duration") or entry.get("dates")

            start_dt = None
            end_dt = None

            if duration_str and (not start_str or not end_str):
                start_dt, end_dt, is_current = parse_date_range(duration_str)

            if not start_dt and start_str:
                if any(sep in str(start_str) for sep in ["-", "to", "until", "–", "—"]):
                    start_dt, end_dt, is_current = parse_date_range(str(start_str))
                else:
                    start_dt, start_is_curr = parse_single_date(str(start_str))
                    if start_is_curr:
                        is_current = True

            if not end_dt and end_str:
                end_dt, end_is_curr = parse_single_date(str(end_str))
                if end_is_curr:
                    is_current = True

            if is_current and not end_dt:
                end_dt = dt.utcnow()

            months = calculate_duration_months(start_dt, end_dt, is_current)
            total_months += months

        return round(total_months / 12, 1) if total_months > 0 else None


    def compute_keyword_match_score(
        self,
        *,
        jd_keywords: dict[str, Any] | None,
        candidate_parsed_data: dict[str, Any] | None,
        candidate_skills: list[str] | None,
    ) -> float:
        """
        Compute a keyword match score (0–100) by comparing position jd_keywords
        against a candidate's parsed CV data using weighted category matching.

        Category weights:
          technical_skills  50%  — most important: does the CV have the tech?
          domain_keywords   25%  — domain/industry alignment
          soft_skills       10%  — behavioral traits
          experience_keywords 10% — seniority and methodology fit
          education_keywords   5% — degree and certification fit
          seniority_signals    0% — informational only (already covered by experience)

        Returns 0.0 if no keywords are defined (not 0 — means "not computed").
        """
        if not isinstance(jd_keywords, dict):
            return 0.0

        # Build candidate text corpus
        candidate_text = self._extract_candidate_text(candidate_parsed_data, candidate_skills)
        # Also add skills array explicitly
        skills_text = " ".join(candidate_skills or [])
        full_text = (candidate_text + " " + skills_text).lower()

        # Category definitions: (key, weight)
        CATEGORY_WEIGHTS = [
            ("technical_skills",    0.50),
            ("domain_keywords",     0.25),
            ("soft_skills",         0.10),
            ("experience_keywords", 0.10),
            ("education_keywords",  0.05),
        ]

        weighted_score = 0.0
        total_weight = 0.0

        for category, weight in CATEGORY_WEIGHTS:
            keywords = jd_keywords.get(category, [])
            if not isinstance(keywords, list) or not keywords:
                # No keywords in this category — skip (don't penalize)
                continue

            total_weight += weight
            keywords_lower = [str(k).strip().lower() for k in keywords if str(k).strip()]
            if not keywords_lower:
                continue

            matched = sum(1 for kw in keywords_lower if kw in full_text)
            category_score = matched / len(keywords_lower)
            weighted_score += category_score * weight

        if total_weight <= 0:
            return 0.0

        # Normalize to 0–100
        return round((weighted_score / total_weight) * 100, 1)

    def _extract_candidate_text(self, parsed_data: dict[str, Any] | None, skills: list[str] | None) -> str:
        if not isinstance(parsed_data, dict):
            parsed_data = {}

        parts: list[str] = []
        summary = parsed_data.get("summary")
        if isinstance(summary, str):
            parts.append(summary)

        for key in ("work_history", "work_experience"):
            entries = parsed_data.get(key)
            if isinstance(entries, list):
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    for field in ("title", "job_title", "position", "company", "description"):
                        value = entry.get(field)
                        if isinstance(value, str):
                            parts.append(value)
                    responsibilities = entry.get("responsibilities")
                    if isinstance(responsibilities, list):
                        for item in responsibilities:
                            if isinstance(item, str):
                                parts.append(item)

        education = parsed_data.get("education")
        if isinstance(education, list):
            for entry in education:
                if not isinstance(entry, dict):
                    continue
                for field in ("degree", "institution", "university", "school"):
                    value = entry.get(field)
                    if isinstance(value, str):
                        parts.append(value)

        if isinstance(skills, list):
            parts.extend([s for s in skills if isinstance(s, str)])

        return " ".join(parts)

    def _build_position_critic_prompt(
        self,
        *,
        job_title: str | None,
        job_description: str | None,
        required_skills: list[str] | None,
        years_of_experience: int | None,
    ) -> str:
        criteria_lines = "\n".join(f"{i+1}. {test}" for i, test in enumerate(self.CRITIC_TESTS))
        jd_payload = {
            "job_title": job_title,
            "job_description": job_description,
            "required_skills": required_skills or [],
            "years_of_experience": years_of_experience,
        }
        return (
            "You are a strict JD quality critic. Evaluate the following position object against the criteria.\n"
            "Return ONLY plain text lines in this exact structure:\n"
            "CRITERION_1: YES|NO\n"
            "...\n"
            f"CRITERION_{len(self.CRITIC_TESTS)}: YES|NO\n"
            "OVERALL_SCORE: <float between 0 and 1>\n"
            "FEEDBACK: <one concise paragraph>\n\n"
            "Position JSON:\n"
            f"{json.dumps(jd_payload, indent=2)}\n\n"
            "Criteria:\n"
            f"{criteria_lines}\n"
        )

    def _build_position_qag_prompt(
        self,
        *,
        job_title: str | None,
        job_description: str | None,
        required_skills: list[str] | None,
        years_of_experience: int | None,
    ) -> str:
        jd_payload = json.dumps(
            {
                "job_title": job_title,
                "job_description": job_description,
                "required_skills": required_skills or [],
                "years_of_experience": years_of_experience,
            },
            indent=2,
        )
        template = _load_prompt("qag_generation.txt")
        return template.replace("{jd_payload}", jd_payload)

    def _normalize_qag_questions(
        self,
        raw_questions: list[dict[str, Any]],
        *,
        default_generation_source: str = "ai",
        generation_provider: str | None = None,
        generation_model: str | None = None,
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for idx, q in enumerate(raw_questions[: self.QAG_QUESTION_COUNT]):
            if not isinstance(q, dict):
                continue
            question = str(q.get("question") or "").strip()
            if not question:
                continue
            category = str(q.get("category") or "skills").strip().lower()
            try:
                weight = float(q.get("weight", 0.0))
            except Exception:
                weight = 0.0

            generation_source = str(q.get("generation_source") or default_generation_source).strip().lower()
            if generation_source not in {"ai", "fallback", "autofill", "manual"}:
                generation_source = default_generation_source

            question_provider = q.get("generation_provider")
            question_model = q.get("generation_model")
            normalized.append(
                {
                    "id": idx + 1,
                    "question": question,
                    "category": category,
                    "weight": max(0.0, weight),
                    "approved": bool(q.get("approved", True)),
                    "edited": bool(q.get("edited", False)),
                    "generation_source": generation_source,
                    "generation_provider": str(question_provider or generation_provider or ""),
                    "generation_model": str(question_model or generation_model or ""),
                }
            )

        # Deterministic fallback to 50 if LLM did not return enough.
        i = len(normalized)
        while i < self.QAG_QUESTION_COUNT:
            normalized.append(
                {
                    "id": i + 1,
                    "question": f"Does the resume provide evidence for JD criterion #{i+1}?",
                    "category": "quality",
                    "weight": 1.0 / self.QAG_QUESTION_COUNT,
                    "approved": True,
                    "edited": False,
                    "generation_source": "autofill",
                    "generation_provider": str(generation_provider or ""),
                    "generation_model": str(generation_model or ""),
                }
            )
            i += 1

        total = sum(float(q.get("weight", 0.0)) for q in normalized)
        if total <= 0:
            for q in normalized:
                q["weight"] = round(1.0 / self.QAG_QUESTION_COUNT, 6)
        else:
            for q in normalized:
                q["weight"] = round(float(q.get("weight", 0.0)) / total, 6)

        return normalized

    def _fallback_qag_questions(
        self,
        *,
        required_skills: list[str] | None,
        years_of_experience: int | None,
        job_title: str | None,
    ) -> list[dict[str, Any]]:
        skills = [s.strip() for s in (required_skills or []) if isinstance(s, str) and s.strip()]
        questions: list[dict[str, Any]] = []

        for s in skills:
            questions.append(
                {
                    "id": len(questions) + 1,
                    "question": f"Does the candidate resume explicitly demonstrate {s}?",
                    "category": "skills",
                    "weight": 0.0,
                    "approved": True,
                    "edited": False,
                    "generation_source": "fallback",
                    "generation_provider": "fallback",
                    "generation_model": "template",
                }
            )
            if len(questions) >= self.QAG_QUESTION_COUNT:
                break

        while len(questions) < self.QAG_QUESTION_COUNT:
            n = len(questions) + 1
            if years_of_experience and n % 5 == 0:
                text = f"Does the candidate show at least {years_of_experience} years of relevant experience?"
                category = "experience"
            elif job_title and n % 7 == 0:
                text = f"Does the candidate profile align with core responsibilities of {job_title}?"
                category = "responsibility"
            else:
                text = f"Is there resume evidence for JD requirement #{n}?"
                category = "quality"

            questions.append(
                {
                    "id": n,
                    "question": text,
                    "category": category,
                    "weight": 0.0,
                    "approved": True,
                    "edited": False,
                    "generation_source": "fallback",
                    "generation_provider": "fallback",
                    "generation_model": "template",
                }
            )

        return self._normalize_qag_questions(
            questions,
            default_generation_source="fallback",
            generation_provider="fallback",
            generation_model="template",
        )

    async def run_position_jd_critic(
        self,
        *,
        job_title: str | None,
        job_description: str | None,
        required_skills: list[str] | None,
        years_of_experience: int | None,
        llm_provider: str | None = None,
        llm_model: str | None = None,
    ) -> dict[str, Any]:
        prompt = self._build_position_qag_prompt(
            job_title=job_title,
            job_description=job_description,
            required_skills=required_skills,
            years_of_experience=years_of_experience,
        )

        started = perf_counter()
        try:
            content, provider_used, model_used = await self._invoke_qag_llm(
                prompt=prompt,
                llm_provider=llm_provider,
                llm_model=llm_model,
            )

            parsed = self._parse_first_json_object(content)
            questions = parsed.get("questions") if isinstance(parsed, dict) else None
            if not isinstance(questions, list):
                if settings.PRESCORE_ALLOW_FALLBACK:
                    questions = self._fallback_qag_questions(
                        required_skills=required_skills,
                        years_of_experience=years_of_experience,
                        job_title=job_title,
                    )
                else:
                    raise ValueError("AI response did not contain a valid questions list")
            normalized_questions = self._normalize_qag_questions(
                questions,
                default_generation_source="ai",
                generation_provider=provider_used,
                generation_model=model_used,
            )

            # Keep compatibility fields while shifting to 50-QAG artifact.
            score = 1.0 if len(normalized_questions) == self.QAG_QUESTION_COUNT else 0.5
            status = "approved"
            cap = None

            return {
                "version": self.VERSION,
                "score": score,
                "status": "pending_tech_review",
                "cap": cap,
                "feedback": "Generated HD Eval + QAG question set.",
                "question_count": len(normalized_questions),
                "questions": normalized_questions,
                "approved_questions": [],
                "criteria_checks": [],
                "provider": provider_used,
                "model": model_used,
                "generation_source": "ai",
                "fallback_used": False,
                "generation_duration_ms": int((perf_counter() - started) * 1000),
            }
        except Exception as exc:
            if not settings.PRESCORE_ALLOW_FALLBACK:
                return {
                    "version": self.VERSION,
                    "score": 0.0,
                    "status": "ai_generation_failed",
                    "cap": None,
                    "feedback": f"AI-only QAG generation failed: {exc}",
                    "question_count": 0,
                    "questions": [],
                    "approved_questions": [],
                    "criteria_checks": [],
                    "provider": "ai-service:ollama" if settings.PRESCORE_USE_AI_SERVICE else (llm_provider or settings.PRESCORE_LLM_PROVIDER),
                    "model": llm_model or settings.PRESCORE_LLM_MODEL,
                    "generation_source": "ai_error",
                    "fallback_used": False,
                    "generation_duration_ms": int((perf_counter() - started) * 1000),
                }

            fallback_questions = self._fallback_qag_questions(
                required_skills=required_skills,
                years_of_experience=years_of_experience,
                job_title=job_title,
            )
            return {
                "version": self.VERSION,
                "score": 0.5,
                "status": "pending_tech_review",
                "cap": None,
                "feedback": f"JD critic error: {exc}",
                "question_count": len(fallback_questions),
                "questions": fallback_questions,
                "approved_questions": [],
                "criteria_checks": [],
                "provider": "fallback",
                "model": None,
                "generation_source": "fallback",
                "fallback_used": True,
                "generation_duration_ms": int((perf_counter() - started) * 1000),
            }

    def _fallback_candidate_qag_results(
        self,
        *,
        questions: list[dict[str, Any]],
        candidate_text_tokens: set[str],
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for q in questions:
            qid = int(q.get("id") or (len(results) + 1))
            question = str(q.get("question") or "")
            q_tokens = self._tokenize(question)
            overlap = len(q_tokens & candidate_text_tokens)
            verdict = "YES" if overlap > 0 else "NO"
            reason = (
                "Relevant evidence tokens detected in parsed resume text."
                if verdict == "YES"
                else "No clear supporting evidence tokens found in parsed resume text."
            )
            results.append(
                {
                    "id": qid,
                    "verdict": verdict,
                    "reason": reason,
                    "evidence": "token_overlap" if verdict == "YES" else "none",
                }
            )
        return results

    def _build_candidate_qag_eval_prompt(
        self,
        *,
        questions: list[dict[str, Any]],
        candidate_payload: dict[str, Any],
    ) -> str:
        template = _load_prompt("qag_candidate_eval.txt")
        return (
            template
            .replace("{question_count}", str(len(questions)))
            .replace("{questions}", json.dumps(questions, indent=2))
            .replace("{candidate_payload}", json.dumps(candidate_payload, indent=2))
        )

    async def _evaluate_candidate_qag(
        self,
        *,
        questions: list[dict[str, Any]],
        candidate_payload: dict[str, Any],
        llm_provider: str | None = None,
        llm_model: str | None = None,
    ) -> list[dict[str, Any]]:
        candidate_text = self._extract_candidate_text(
            candidate_payload.get("candidate_parsed_data") if isinstance(candidate_payload, dict) else {},
            candidate_payload.get("candidate_skills") if isinstance(candidate_payload, dict) else [],
        )
        candidate_tokens = self._tokenize(candidate_text)

        if not questions:
            return []

        prompt = self._build_candidate_qag_eval_prompt(
            questions=[{"id": q.get("id"), "question": q.get("question")} for q in questions],
            candidate_payload=candidate_payload,
        )
        try:
            content, _, _ = await self._invoke_qag_llm(
                prompt=prompt,
                llm_provider=llm_provider,
                llm_model=llm_model,
            )
            parsed = self._parse_first_json_object(content)
            results = parsed.get("results") if isinstance(parsed, dict) else None
            if not isinstance(results, list):
                if settings.PRESCORE_ALLOW_FALLBACK:
                    return self._fallback_candidate_qag_results(questions=questions, candidate_text_tokens=candidate_tokens)
                raise ValueError("AI response did not contain a valid results list")

            normalized: list[dict[str, Any]] = []
            for item in results:
                if not isinstance(item, dict):
                    continue
                try:
                    qid = int(item.get("id"))
                except Exception:
                    continue
                verdict = str(item.get("verdict") or "NO").strip().upper()
                if verdict not in {"YES", "NO"}:
                    verdict = "NO"
                normalized.append(
                    {
                        "id": qid,
                        "verdict": verdict,
                        "reason": str(item.get("reason") or "No reason provided"),
                        "evidence": str(item.get("evidence") or ""),
                    }
                )

            if not normalized:
                if settings.PRESCORE_ALLOW_FALLBACK:
                    return self._fallback_candidate_qag_results(questions=questions, candidate_text_tokens=candidate_tokens)
                raise ValueError("AI response returned empty/invalid verdict rows")
            return normalized
        except Exception:
            if settings.PRESCORE_ALLOW_FALLBACK:
                return self._fallback_candidate_qag_results(questions=questions, candidate_text_tokens=candidate_tokens)
            raise

    async def score_candidate_prescore(
        self,
        *,
        job_title: str | None,
        job_description: str | None,
        required_skills: list[str] | None,
        years_of_experience: int | None,
        candidate_skills: list[str] | None,
        candidate_experience_years: float | None,
        candidate_parsed_data: dict[str, Any] | None,
        github_analysis_data: dict[str, Any] | None,
        jd_critic_result: dict[str, Any] | None,
        profile_embedding: list[float] | None = None,
        jd_embedding: list[float] | None = None,
        # ── New optional parameters for richer matching ──
        position_experience_level: str | None = None,
        position_education_level: str | None = None,
        jd_keywords: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # Compute embedding-based JD similarity when both vectors are available
        jd_embedding_similarity: float | None = None
        if profile_embedding and jd_embedding:
            jd_embedding_similarity = self._cosine_sim(profile_embedding, jd_embedding)

        jd_critic_result = jd_critic_result if isinstance(jd_critic_result, dict) else {}
        jd_quality_score = float(jd_critic_result.get("score", 0.5))
        jd_quality_status = str(jd_critic_result.get("status", "unknown"))
        jd_quality_cap = jd_critic_result.get("cap")
        if jd_quality_cap is not None:
            jd_quality_cap = float(jd_quality_cap)

        if jd_quality_status == "ai_generation_failed" and not settings.PRESCORE_ALLOW_FALLBACK:
            return {
                "version": self.VERSION,
                "pre_score_final": 0.0,
                "semantic_fit_score": 0.0,
                "skills_experience_score": 0.0,
                "optional_profile_boost": 0.0,
                "jd_quality_score": 0.0,
                "jd_quality_status": "ai_generation_failed",
                "jd_quality_cap": jd_quality_cap,
                "jd_quality_cap_applied": False,
                "criteria_checks": [],
                "jd_quality_feedback": jd_critic_result.get("feedback"),
                "score_explanation": [
                    "Scoring is blocked because AI-only QAG generation failed.",
                    "Fix ai-service/Ollama connectivity and regenerate the HD Eval + QAG question set.",
                ],
            }
        # When PRESCORE_ALLOW_FALLBACK is on, a failed QAG generation falls through to the
        # heuristic composite below (no approved questions → heuristic path) instead of a 0 score.

        approved_questions = jd_critic_result.get("approved_questions") if isinstance(jd_critic_result, dict) else []
        if not isinstance(approved_questions, list):
            approved_questions = []
        all_generated_questions = jd_critic_result.get("questions") if isinstance(jd_critic_result, dict) else []
        has_generated_qag = isinstance(all_generated_questions, list) and len(all_generated_questions) > 0
        pending_qag_approval = has_generated_qag and not bool(approved_questions)

        normalized_qag = self._normalize_qag_questions(
            [q for q in approved_questions if isinstance(q, dict) and q.get("question")]
        ) if approved_questions else []

        # Compute semantic_fit and skills/exp independently — used by BOTH QAG and heuristic paths
        if jd_embedding_similarity is not None:
            semantic_fit = jd_embedding_similarity
        else:
            jd_text = " ".join([job_title or "", job_description or "", " ".join(required_skills or [])])
            jd_tokens = self._tokenize(jd_text)
            candidate_text = self._extract_candidate_text(candidate_parsed_data, candidate_skills)
            candidate_tokens = self._tokenize(candidate_text)
            if jd_tokens and candidate_tokens:
                overlap = len(jd_tokens & candidate_tokens)
                semantic_fit = round((2 * overlap / (len(jd_tokens) + len(candidate_tokens))) * 100, 1)
            else:
                semantic_fit = 0.0

        _required = [s.lower().strip() for s in (required_skills or []) if isinstance(s, str) and s.strip()]
        _cand_skills = {s.lower().strip() for s in (candidate_skills or []) if isinstance(s, str) and s.strip()}
        _skill_aln = round((sum(1 for sk in _required if sk in _cand_skills) / len(_required)) * 100, 1) if _required else 60.0
        _exp_exp = max(0, int(years_of_experience or 0))
        _act_exp = max(0.0, float(candidate_experience_years or 0.0))
        _exp_aln = round(min(100.0, min(_act_exp / float(_exp_exp), 1.25) * 100), 1) if _exp_exp > 0 else 70.0
        skills_experience_score_shared = round((_skill_aln * 0.7) + (_exp_aln * 0.3), 1)

        if normalized_qag:
            candidate_payload = {
                "job_title": job_title,
                "job_description": job_description,
                "required_skills": required_skills or [],
                "years_of_experience": years_of_experience,
                "candidate_skills": candidate_skills or [],
                "candidate_experience_years": candidate_experience_years,
                "candidate_parsed_data": candidate_parsed_data or {},
            }
            try:
                qag_results = await self._evaluate_candidate_qag(
                    questions=normalized_qag,
                    candidate_payload=candidate_payload,
                )
            except Exception as exc:
                if not settings.PRESCORE_ALLOW_FALLBACK:
                    return {
                        "version": self.VERSION,
                        "pre_score_final": 0.0,
                        "semantic_fit_score": 0.0,
                        "skills_experience_score": 0.0,
                        "optional_profile_boost": 0.0,
                        "jd_quality_score": jd_quality_score,
                        "jd_quality_status": "ai_evaluation_failed",
                        "jd_quality_cap": jd_quality_cap,
                        "jd_quality_cap_applied": False,
                        "criteria_checks": [],
                        "jd_quality_feedback": str(exc),
                        "score_explanation": [
                            "Scoring is blocked because AI-only candidate QAG evaluation failed.",
                            "Fix ai-service/Ollama connectivity and re-run evaluation.",
                        ],
                    }
                # Fallback enabled: re-score with the heuristic composite (drop QAG) instead of a 0 score.
                fallback_critic = dict(jd_critic_result)
                fallback_critic["approved_questions"] = []
                fallback_critic["questions"] = []
                fallback_critic["status"] = "ai_evaluation_failed_fallback"
                fallback_result = await self.score_candidate_prescore(
                    job_title=job_title,
                    job_description=job_description,
                    required_skills=required_skills,
                    years_of_experience=years_of_experience,
                    candidate_skills=candidate_skills,
                    candidate_experience_years=candidate_experience_years,
                    candidate_parsed_data=candidate_parsed_data,
                    github_analysis_data=github_analysis_data,
                    jd_critic_result=fallback_critic,
                    position_experience_level=position_experience_level,
                    position_education_level=position_education_level,
                    jd_keywords=jd_keywords,
                )
                fallback_result["jd_quality_status"] = "ai_evaluation_failed_fallback_heuristic"
                fallback_result["jd_quality_feedback"] = str(exc)
                return fallback_result

            result_map = {int(r.get("id")): r for r in qag_results if isinstance(r, dict) and r.get("id") is not None}
            checks: list[dict[str, Any]] = []
            weighted_yes = 0.0
            total_weight = 0.0
            yes_count = 0

            for q in normalized_qag:
                qid = int(q.get("id") or 0)
                weight = float(q.get("weight") or 0.0)
                total_weight += weight
                eval_row = result_map.get(qid, {})
                verdict = str(eval_row.get("verdict") or "NO").upper()
                passed = verdict == "YES"
                if passed:
                    weighted_yes += weight
                    yes_count += 1

                checks.append(
                    {
                        "id": qid,
                        "criterion": q.get("question"),
                        "weight": round(weight, 6),
                        "passed": passed,
                        "verdict": verdict,
                        "reason": str(eval_row.get("reason") or "No reasoning available"),
                        "evidence": str(eval_row.get("evidence") or ""),
                    }
                )

            if total_weight <= 0:
                total_weight = 1.0
            qag_score = round((weighted_yes / total_weight) * 100, 1)
            if jd_quality_cap is not None:
                qag_score = round(min(qag_score, jd_quality_cap), 1)

            # Dual-score: also compute the heuristic semantic fit (pure compute, no extra AI cost).
            semantic_score = None
            try:
                _h_critic = dict(jd_critic_result)
                _h_critic["approved_questions"] = []
                _h_critic["questions"] = []
                _h_critic["status"] = "semantic_only"
                _h = await self.score_candidate_prescore(
                    job_title=job_title,
                    job_description=job_description,
                    required_skills=required_skills,
                    years_of_experience=years_of_experience,
                    candidate_skills=candidate_skills,
                    candidate_experience_years=candidate_experience_years,
                    candidate_parsed_data=candidate_parsed_data,
                    github_analysis_data=github_analysis_data,
                    jd_critic_result=_h_critic,
                    position_experience_level=position_experience_level,
                    position_education_level=position_education_level,
                    jd_keywords=jd_keywords,
                )
                semantic_score = _h.get("pre_score_final")
            except Exception:
                semantic_score = None

            explanation = [
                f"HD Eval + QAG: {yes_count}/{len(normalized_qag)} criteria passed",
                f"Weighted YES score = {round((weighted_yes / total_weight) * 100, 1)}%",
            ]
            if jd_quality_cap is not None and qag_score >= jd_quality_cap:
                explanation.append(f"JD quality cap applied at {jd_quality_cap}%")

            return {
                "version": self.VERSION,
                "pre_score_final": qag_score,
                "semantic_fit_score": semantic_fit,
                "skills_experience_score": skills_experience_score_shared,
                # Two distinct candidate scores (dual-score model):
                "semantic_score": semantic_score,
                "qag_score": qag_score,
                "optional_profile_boost": 0.0,
                "jd_quality_score": jd_quality_score,
                "jd_quality_status": jd_quality_status,
                "jd_quality_cap": jd_quality_cap,
                "jd_quality_cap_applied": bool(jd_quality_cap is not None and qag_score >= jd_quality_cap),
                "criteria_checks": checks,
                "jd_quality_feedback": jd_critic_result.get("feedback"),
                "score_explanation": explanation,
                "jd_embedding_similarity": jd_embedding_similarity,
            }

        # semantic_fit and skills_experience_score_shared already computed in shared block above
        # Keep skill_alignment / experience_alignment breakdown for explanation string
        required = [s.lower().strip() for s in (required_skills or []) if isinstance(s, str) and s.strip()]
        candidate_skill_set = {s.lower().strip() for s in (candidate_skills or []) if isinstance(s, str) and s.strip()}

        if required:
            matched = sum(1 for skill in required if skill in candidate_skill_set)
            skill_alignment = round((matched / len(required)) * 100, 1)
        else:
            skill_alignment = 60.0
        # ═══════════════════════════════════════════════════════════════════
        # HEURISTIC MODE — multi-signal composite (no QAG)
        # ═══════════════════════════════════════════════════════════════════

        # ── 1. Skill match (fuzzy, with synonym expansion) ──────────────
        skill_alignment = self.fuzzy_skill_match(
            required_skills=list(required_skills or []),
            candidate_skills=list(candidate_skills or []),
        )

        # ── 2. Experience alignment ─────────────────────────────────────
        expected_exp = max(0, int(years_of_experience or 0))
        actual_exp = max(0.0, float(candidate_experience_years or 0.0))

        # Fallback: compute YoE from work-history dates if the column is 0
        if actual_exp <= 0.0 and isinstance(candidate_parsed_data, dict):
            computed_yoe = self.calculate_yoe_from_work_history(candidate_parsed_data)
            if computed_yoe is not None and computed_yoe > 0:
                actual_exp = computed_yoe

        if expected_exp <= 0:
            experience_alignment = 70.0  # no requirement → neutral
        else:
            ratio = min(actual_exp / float(expected_exp), 1.25)
            experience_alignment = round(min(100.0, ratio * 100), 1)

        skills_experience_score = skills_experience_score_shared

        # ── 3. Keyword coverage (if jd_keywords available) ──────────────
        kw_score = 0.0
        if isinstance(jd_keywords, dict) and jd_keywords:
            kw_score = self.compute_keyword_match_score(
                jd_keywords=jd_keywords,
                candidate_parsed_data=candidate_parsed_data,
                candidate_skills=list(candidate_skills or []),
            )
        # Fallback: basic token overlap (kept as secondary signal)
        jd_text = " ".join([
            job_title or "",
            job_description or "",
            " ".join(required_skills or []),
        ])
        jd_tokens = self._tokenize(jd_text)
        candidate_text = self._extract_candidate_text(candidate_parsed_data, candidate_skills)
        candidate_tokens = self._tokenize(candidate_text)
        if jd_tokens and candidate_tokens:
            overlap = len(jd_tokens & candidate_tokens)
            token_overlap_score = round((2 * overlap / (len(jd_tokens) + len(candidate_tokens))) * 100, 1)
        else:
            token_overlap_score = 0.0

        # Use whichever keyword signal is richer
        keyword_coverage = max(kw_score, token_overlap_score)

        # ── 4. Seniority alignment ──────────────────────────────────────
        candidate_seniority = None
        if isinstance(candidate_parsed_data, dict):
            candidate_seniority = candidate_parsed_data.get("seniority_level")
        seniority_score = self.seniority_alignment(
            position_level=position_experience_level,
            candidate_seniority=candidate_seniority,
        )

        # ── 5. Education alignment ──────────────────────────────────────
        edu_score = self.education_alignment(
            required_level=position_education_level,
            candidate_parsed_data=candidate_parsed_data,
        )

        # ── 6. GitHub profile boost (additive, max 5 pts) ──────────────
        boost = 0.0
        if isinstance(github_analysis_data, dict):
            contribution = github_analysis_data.get("contribution_score")
            code_quality = github_analysis_data.get("code_quality_score")
            repo_count = github_analysis_data.get("repo_count")

            c_val = float(contribution) if contribution is not None else 0.0
            q_val = float(code_quality) if code_quality is not None else 0.0
            r_val = float(repo_count) if repo_count is not None else 0.0

            boost = min(5.0, (c_val * 0.03) + (q_val * 0.03) + min(2.0, r_val * 0.1))

        # ── Composite score ─────────────────────────────────────────────
        # Weights:  skills 35% | experience 20% | keywords 20% | seniority 10% | education 10% | github 5%
        weighted_base = round(
            (skill_alignment * 0.35)
            + (experience_alignment * 0.20)
            + (keyword_coverage * 0.20)
            + (seniority_score * 0.10)
            + (edu_score * 0.10)
            + (boost * 20 * 0.05),  # boost is 0-5, scale to 0-100 range
            1,
        )

        capped = jd_quality_cap is not None and weighted_base > jd_quality_cap
        pre_score_final = round(
            min(weighted_base, jd_quality_cap) if jd_quality_cap is not None else weighted_base, 1
        )

        semantic_source = "JD embedding similarity" if jd_embedding_similarity is not None else "JD/CV token overlap"
        explanation = [
            f"Semantic fit {semantic_fit}% from {semantic_source}",
            f"Skills+experience {skills_experience_score}% (skills {skill_alignment}%, experience {experience_alignment}%)",
            f"Skills match {skill_alignment}% (fuzzy synonym matching, {len(required_skills or [])} required skills)",
            f"Experience alignment {experience_alignment}% (candidate {actual_exp}y vs required {expected_exp}y)",
            f"Keyword coverage {keyword_coverage}% (JD/CV content alignment)",
            f"Seniority fit {seniority_score}%",
            f"Education fit {edu_score}%",
        ]
        if boost > 0:
            explanation.append(f"GitHub boost +{round(boost, 1)} points")
        if capped:
            explanation.append(f"JD quality gate applied: capped to {jd_quality_cap}% (quality={jd_quality_status})")
        if pending_qag_approval:
            explanation.append("Using heuristic score until technical recruiter approves generated QAG questions.")

        return {
            "version": self.VERSION,
            "pre_score_final": pre_score_final,
            # Two distinct candidate scores (Phase: dual-score model):
            #   semantic_score = heuristic JD↔CV fit (skills/experience/keywords/…)
            #   qag_score      = AI QAG yes/no evaluation (None until QAG approved)
            "semantic_score": pre_score_final,
            "qag_score": None,
            "semantic_fit_score": token_overlap_score,  # kept for backward compat
            "skills_experience_score": skills_experience_score,
            "skill_alignment": skill_alignment,
            "experience_alignment": experience_alignment,
            "keyword_coverage": keyword_coverage,
            "seniority_score": seniority_score,
            "education_score": edu_score,
            "optional_profile_boost": round(boost, 1),
            "jd_quality_score": jd_quality_score,
            "jd_quality_status": "pending_qag_approval" if pending_qag_approval else jd_quality_status,
            "jd_quality_cap": jd_quality_cap,
            "jd_quality_cap_applied": capped,
            "criteria_checks": jd_critic_result.get("criteria_checks", []),
            "jd_quality_feedback": (
                "QAG questions generated but not yet approved; currently using heuristic scoring."
                if pending_qag_approval
                else jd_critic_result.get("feedback")
            ),
            "score_explanation": explanation,
            "jd_embedding_similarity": jd_embedding_similarity,
        }
