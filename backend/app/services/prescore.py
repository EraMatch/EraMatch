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
    ) -> dict[str, Any]:
        jd_critic_result = jd_critic_result if isinstance(jd_critic_result, dict) else {}
        jd_quality_score = float(jd_critic_result.get("score", 0.5))
        jd_quality_status = str(jd_critic_result.get("status", "unknown"))
        jd_quality_cap = jd_critic_result.get("cap")
        if jd_quality_cap is not None:
            jd_quality_cap = float(jd_quality_cap)

        if jd_quality_status == "ai_generation_failed":
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

        approved_questions = jd_critic_result.get("approved_questions") if isinstance(jd_critic_result, dict) else []
        if not isinstance(approved_questions, list):
            approved_questions = []
        all_generated_questions = jd_critic_result.get("questions") if isinstance(jd_critic_result, dict) else []
        has_generated_qag = isinstance(all_generated_questions, list) and len(all_generated_questions) > 0
        pending_qag_approval = has_generated_qag and not bool(approved_questions)

        normalized_qag = self._normalize_qag_questions(
            [q for q in approved_questions if isinstance(q, dict) and q.get("question")]
        ) if approved_questions else []

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

            explanation = [
                f"HD Eval + QAG: {yes_count}/{len(normalized_qag)} criteria passed",
                f"Weighted YES score = {round((weighted_yes / total_weight) * 100, 1)}%",
            ]
            if jd_quality_cap is not None and qag_score >= jd_quality_cap:
                explanation.append(f"JD quality cap applied at {jd_quality_cap}%")

            return {
                "version": self.VERSION,
                "pre_score_final": qag_score,
                "semantic_fit_score": qag_score,
                "skills_experience_score": qag_score,
                "optional_profile_boost": 0.0,
                "jd_quality_score": jd_quality_score,
                "jd_quality_status": jd_quality_status,
                "jd_quality_cap": jd_quality_cap,
                "jd_quality_cap_applied": bool(jd_quality_cap is not None and qag_score >= jd_quality_cap),
                "criteria_checks": checks,
                "jd_quality_feedback": jd_critic_result.get("feedback"),
                "score_explanation": explanation,
            }

        jd_text = " ".join(
            [
                job_title or "",
                job_description or "",
                " ".join(required_skills or []),
            ]
        )
        jd_tokens = self._tokenize(jd_text)

        candidate_text = self._extract_candidate_text(candidate_parsed_data, candidate_skills)
        candidate_tokens = self._tokenize(candidate_text)

        if jd_tokens and candidate_tokens:
            overlap = len(jd_tokens & candidate_tokens)
            semantic_fit = round((2 * overlap / (len(jd_tokens) + len(candidate_tokens))) * 100, 1)
        else:
            semantic_fit = 0.0

        required = [s.lower().strip() for s in (required_skills or []) if isinstance(s, str) and s.strip()]
        candidate_skill_set = {s.lower().strip() for s in (candidate_skills or []) if isinstance(s, str) and s.strip()}

        if required:
            matched = sum(1 for skill in required if skill in candidate_skill_set)
            skill_alignment = round((matched / len(required)) * 100, 1)
        else:
            skill_alignment = 60.0

        expected_exp = max(0, int(years_of_experience or 0))
        actual_exp = max(0.0, float(candidate_experience_years or 0.0))
        if expected_exp <= 0:
            experience_alignment = 70.0
        else:
            ratio = min(actual_exp / float(expected_exp), 1.25)
            experience_alignment = round(min(100.0, ratio * 100), 1)

        skills_experience_score = round((skill_alignment * 0.7) + (experience_alignment * 0.3), 1)

        boost = 0.0
        if isinstance(github_analysis_data, dict):
            contribution = github_analysis_data.get("contribution_score")
            code_quality = github_analysis_data.get("code_quality_score")
            repo_count = github_analysis_data.get("repo_count")

            c_val = float(contribution) if contribution is not None else 0.0
            q_val = float(code_quality) if code_quality is not None else 0.0
            r_val = float(repo_count) if repo_count is not None else 0.0

            boost = min(10.0, (c_val * 0.05) + (q_val * 0.05) + min(4.0, r_val * 0.2))

        weighted_base = round((semantic_fit * 0.55) + (skills_experience_score * 0.35) + (boost * 10 * 0.10), 1)
        capped = jd_quality_cap is not None and weighted_base > jd_quality_cap
        pre_score_final = round(min(weighted_base, jd_quality_cap) if jd_quality_cap is not None else weighted_base, 1)

        explanation = [
            f"Semantic fit {semantic_fit}% from JD/CV token overlap",
            f"Skills+experience {skills_experience_score}% (skills {skill_alignment}%, experience {experience_alignment}%)",
        ]
        if boost > 0:
            explanation.append(f"Optional profile boost +{round(boost, 1)} points from GitHub signals")
        if capped:
            explanation.append(f"JD quality gate applied: capped to {jd_quality_cap}% (quality={jd_quality_status})")
        if pending_qag_approval:
            explanation.append("Using heuristic score until technical recruiter approves generated QAG questions.")

        return {
            "version": self.VERSION,
            "pre_score_final": pre_score_final,
            "semantic_fit_score": semantic_fit,
            "skills_experience_score": skills_experience_score,
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
        }
