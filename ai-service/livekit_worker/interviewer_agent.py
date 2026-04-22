"""
EraMatch Live Interview V2 — Stateful Interviewer Agent.

State machine:
  welcome → topic → probe → bridge → closing → done

Time enforcement:
  - Per-pillar budget = time_budget_minutes * 60 / num_pillars
  - If elapsed > 90% of total budget → force closing regardless of pillar count
  - If elapsed > per_pillar budget for current pillar → skip probe, advance pillar

Context injection:
  - Position title + JD excerpt → opening prompt (always)
  - CV skills list → opening prompt (always)
  - Weak assessment topics → opening prompt modifier (recruiter opt-in)
  - Language → TTS voice and prompt language instruction
"""

import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, TYPE_CHECKING

# Livekit imports are kept lazy so pure-logic unit tests can import
# this module without the livekit SDK installed in the test environment.
try:
    from livekit.agents import AgentSession, Agent, function_tool
    from livekit.agents.llm import ChatContext, ChatMessage

    _LIVEKIT_AVAILABLE = True
except ImportError:
    # Stub base class for test-environment imports
    class Agent:  # type: ignore
        def __init__(self, *args, **kwargs):
            pass

    AgentSession = Any  # type: ignore
    ChatContext = Any  # type: ignore
    _LIVEKIT_AVAILABLE = False

logger = logging.getLogger("eramatch.interviewer")

# config for now only — override in .env for prod
_INTERVIEWER_MODEL = os.getenv("INTERVIEWER_PRIMARY_MODEL", "gemini-2.5-flash-lite")
_COVERAGE_MODEL = os.getenv("COVERAGE_CHECK_MODEL", "gemma3:4b-cloud")
_COVERAGE_BASEURL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434") + "/v1"
_COVERAGE_API_KEY = os.getenv("OLLAMA_API_KEY", "") or "ollama"

# Language config
_LANGUAGE_VOICE_MAP = {
    "en": os.getenv("TTS_PRIMARY_VOICE", "en-US-Wavenet-D"),
    "ar": os.getenv("TTS_ARABIC_VOICE", "ar-XA-Wavenet-A"),
}


# ---------------------------------------------------------------------------
# Coverage state (per session)
# ---------------------------------------------------------------------------
@dataclass
class PillarState:
    """Represents one topical pillar (a bank question + its sub-criteria coverage)."""

    bank_item_id: str
    question_text: str
    dimension_name: str
    sub_criteria: list[str]  # from question_rubric in bank
    covered: set[str] = field(default_factory=set)
    partial: set[str] = field(default_factory=set)
    probe_count: int = 0
    MAX_PROBES: int = 2  # max follow-ups per pillar

    @property
    def is_complete(self) -> bool:
        return (
            len(self.covered) >= len(self.sub_criteria)
            or self.probe_count >= self.MAX_PROBES
        )

    @property
    def missing(self) -> list[str]:
        return [s for s in self.sub_criteria if s not in self.covered]


def _build_pillars_from_bank(bank_items: list[dict]) -> list[PillarState]:
    """
    Convert frozen bank items into PillarState objects.
    Mandatory questions first, then sorted by dimension for coherent topical flow.
    """
    mandatory = [i for i in bank_items if i.get("is_mandatory")]
    optional = [i for i in bank_items if not i.get("is_mandatory")]
    ordered = mandatory + optional

    pillars = []
    for item in ordered:
        sub_criteria = []
        rubric = item.get("question_rubric") or {}
        sub_criteria = rubric.get("sub_criteria", [])
        if (
            isinstance(sub_criteria, list)
            and sub_criteria
            and isinstance(sub_criteria[0], dict)
        ):
            # handle {"text": ..., "weight": ...} format
            sub_criteria = [s.get("text", str(s)) for s in sub_criteria]

        pillars.append(
            PillarState(
                bank_item_id=item.get("bank_item_id", ""),
                question_text=item.get("text", ""),
                dimension_name=item.get("primary_dimension_id", ""),
                sub_criteria=sub_criteria or ["Demonstrate knowledge of the topic"],
            )
        )
    return pillars


# ---------------------------------------------------------------------------
# Inline coverage checker (small fast model)
# ---------------------------------------------------------------------------
async def _check_coverage(candidate_utterance: str, sub_criteria: list[str]) -> dict:
    """
    Lightweight structured LLM call to determine which sub-criteria the
    candidate's last response covered.

    Returns: { "covered": [...], "partial": [...], "missed": [...] }
    """
    if not sub_criteria:
        return {"covered": [], "partial": [], "missed": []}

    prompt = (
        "You are a coverage evaluator. Respond ONLY with valid JSON.\n"
        "Given the candidate's response and the sub-criteria list, classify each criterion.\n\n"
        f"Candidate said:\n{candidate_utterance}\n\n"
        f"Sub-criteria:\n{json.dumps(sub_criteria)}\n\n"
        'Respond: {"covered": [...], "partial": [...], "missed": [...]}'
    )

    try:
        import httpx

        headers = {"Content-Type": "application/json"}
        if _COVERAGE_API_KEY:
            headers["Authorization"] = f"Bearer {_COVERAGE_API_KEY}"
        payload = {
            "model": _COVERAGE_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 300,
        }
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{_COVERAGE_BASEURL}/chat/completions", json=payload, headers=headers
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            # Strip markdown fences if any
            raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            result = json.loads(raw)
            logger.info(
                "[COVERAGE] covered=%s partial=%s missed=%s",
                result.get("covered", []),
                result.get("partial", []),
                result.get("missed", []),
            )
            return result
    except Exception as e:
        logger.warning("[COVERAGE] Ollama call failed: %s", e)
        return {"covered": [], "partial": [], "missed": sub_criteria}


# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------


def _opening_prompt(
    candidate_name: str,
    time_budget: int,
    context: dict | None = None,
    language: str = "en",
) -> str:
    """Build the system prompt for the interviewer agent, injecting context if available."""
    lang_instruction = (
        "Conduct the entire interview in Arabic (Modern Standard Arabic). "
        if language == "ar"
        else "Conduct the entire interview in English. "
    )

    base = (
        f"You are a professional AI interviewer for EraMatch. "
        f"The candidate's name is {candidate_name}. "
        f"You have approximately {time_budget} minutes. "
        f"{lang_instruction}"
        "Your style is warm, professional, and conversational — NOT robotic Q&A. "
        "Acknowledge what the candidate says before moving to the next topic. "
        "Do NOT reveal the sub-criteria or rubric to the candidate. "
        "When transitioning topics, use natural bridging phrases. "
        "When you are running low on time, naturally consolidate remaining questions."
    )

    # ── Context injection block ──────────────────────────────────────────
    if context:
        lines = []

        if context.get("position_title"):
            lines.append(f"Role being interviewed for: {context['position_title']}")

        if context.get("job_description_excerpt"):
            lines.append(
                f"Job description context:\n{context['job_description_excerpt']}"
            )

        skills = context.get("cv_skills", [])
        if skills:
            skills_str = ", ".join(skills[:15])
            lines.append(
                f"Candidate's listed skills (from their CV): {skills_str}. "
                "Use this to calibrate the depth of technical questions — don't ask questions "
                "about skills they've clearly not listed unless testing adaptability."
            )

        experience = context.get("experience_summary", [])
        if experience:
            experience_str = " | ".join(experience)
            lines.append(
                f"Candidate's recent experience: {experience_str}. "
                "You may refer to these roles when asking for examples of past work."
            )

        projects = context.get("projects", [])
        if projects:
            projects_str = ", ".join(projects)
            lines.append(
                f"Candidate's notable projects: {projects_str}. "
                "Feel free to ask them to elaborate on these projects if relevant to the dimension being evaluated."
            )

        weak = context.get("weak_topics")
        if weak:
            weak_str = ", ".join(weak)
            lines.append(
                f"Areas where the candidate previously scored low in assessments: {weak_str}. "
                "When these topics naturally arise within the interview dimensions, "
                "probe a bit deeper — but do NOT directly reference the assessment or scores."
            )

        if lines:
            context_block = "\n\n".join(lines)
            base += f"\n\n--- CANDIDATE BACKGROUND ---\n{context_block}\n--- END BACKGROUND ---"

    return base


def _topic_intro_prompt(pillar: PillarState) -> str:
    return (
        f"Introduce this topic naturally and ask the following question in your own words:\n"
        f"Topic area: {pillar.dimension_name}\n"
        f"Core question: {pillar.question_text}\n"
        "Keep it conversational. Do not number the question."
    )


def _probe_prompt(pillar: PillarState) -> str:
    missing = "\n".join(f"- {s}" for s in pillar.missing)
    return (
        f"The candidate hasn't fully addressed these aspects yet:\n{missing}\n"
        "Generate ONE short follow-up question that will naturally elicit this information "
        "without explicitly revealing what you're looking for. Be encouraging."
    )


def _bridge_prompt(next_pillar: PillarState) -> str:
    return (
        f"Acknowledge the candidate's previous answer briefly (1 sentence), then "
        f"naturally transition to a new topic: '{next_pillar.dimension_name}'. "
        f"Ask this question in your own words: {next_pillar.question_text}"
    )


def _closing_prompt(candidate_name: str) -> str:
    return (
        f"The interview is now complete. Thank {candidate_name} sincerely, "
        "let them know the results will be reviewed and they'll hear back soon. "
        "Ask if they have any questions for you before wrapping up."
    )


def _time_warning_closing_prompt(candidate_name: str, remaining_pillars: int) -> str:
    """Used when time budget forces early close."""
    return (
        f"We are approaching the end of our scheduled time. "
        f"Briefly acknowledge there {'are' if remaining_pillars > 1 else 'is'} "
        f"{remaining_pillars} more {'topics' if remaining_pillars > 1 else 'topic'} "
        "we didn't have time to fully explore. "
        f"Thank {candidate_name} warmly and wrap up professionally."
    )


# ---------------------------------------------------------------------------
# The Agent
# ---------------------------------------------------------------------------
class InterviewerAgent(Agent):
    """
    on_session_start → set system prompt, generate greeting
    on_user_turn_completed → check coverage, enforce time, decide next action
    """

    def __init__(self, metadata: dict, bank_items: list | None = None):
        self.session_id = metadata.get("session_id", "unknown")
        self.candidate_name = metadata.get("candidate_name", "Candidate")
        self.time_budget = metadata.get("time_budget_minutes", 30)
        self.language = metadata.get("language", "en")
        self.context = metadata.get("context", {})
        # Bank items injected at construction time (avoids userdata timing race)
        self._bank_items: list[dict] = bank_items or []

        # Runtime state — filled after bank is fetched
        self.pillars: list[PillarState] = []
        self.current_pillar_idx: int = 0
        self.phase: str = "welcome"  # welcome | topic | probe | closing | done

        # Time tracking
        self.session_start_time: float = 0.0
        self.time_per_pillar: float = 0.0  # computed after pillars are loaded

        # Transcript for post-session judge
        self.transcript: list[dict] = []

        super().__init__(
            instructions=_opening_prompt(
                self.candidate_name,
                self.time_budget,
                self.context,
                self.language,
            )
        )

    # ------------------------------------------------------------------
    # Session start: fetch bank from metadata passed by agent_server.py
    # ------------------------------------------------------------------
    async def on_session_start(self, session: AgentSession):
        """Called by LiveKit when the agent joins the room and is ready."""
        logger.info(f"[{self.session_id}] Session start — loading bank from context")
        self.session_start_time = time.time()

        # bank_items injected at construction time (no userdata timing dependency)
        bank_items = self._bank_items
        if bank_items:
            self.pillars = _build_pillars_from_bank(bank_items)
            logger.info(
                f"[{self.session_id}] Loaded {len(self.pillars)} pillars from frozen bank"
            )
        else:
            logger.warning(
                f"[{self.session_id}] No bank items — using fallback question"
            )
            self.pillars = [
                PillarState(
                    bank_item_id="fallback",
                    question_text="Tell me about a challenging project you've worked on and what you learned from it.",
                    dimension_name="General",
                    sub_criteria=[
                        "Describes a specific challenge",
                        "Explains how it was resolved",
                        "Reflects on learnings",
                    ],
                )
            ]

        # Compute per-pillar time budget (seconds)
        total_seconds = self.time_budget * 60
        self.time_per_pillar = total_seconds / max(len(self.pillars), 1)
        logger.info(
            f"[{self.session_id}] Time budget: {self.time_budget}min "
            f"({total_seconds}s total, ~{self.time_per_pillar:.0f}s/pillar)"
        )

        # Generate opening greeting
        cv_mention = ""
        if self.context.get("cv_skills"):
            cv_mention = (
                "You've seen the candidate's profile. "
                "Greet them naturally by name only — no mention of their CV. "
            )
        await session.generate_reply(
            instructions=(
                f"Welcome {self.candidate_name} warmly to the EraMatch live interview. "
                f"{cv_mention}"
                "Tell them the interview will feel like a natural conversation. "
                "Briefly explain how it works (you ask, they answer, natural back-and-forth). "
                "Then ask them to introduce themselves."
            )
        )
        self.phase = "topic"

    # ------------------------------------------------------------------
    # Time enforcement helpers
    # ------------------------------------------------------------------
    def _elapsed(self) -> float:
        """Seconds since session started."""
        return time.time() - self.session_start_time if self.session_start_time else 0.0

    def _is_time_over_budget(self) -> bool:
        """Returns True if we've used 90%+ of the total time budget."""
        total_seconds = self.time_budget * 60
        return self._elapsed() >= total_seconds * 0.90

    def _is_pillar_over_time(self) -> bool:
        """Returns True if we've spent more than the per-pillar budget on the current pillar."""
        pillar_start = (
            self.session_start_time + self.current_pillar_idx * self.time_per_pillar
        )
        return time.time() - pillar_start > self.time_per_pillar

    # ------------------------------------------------------------------
    # Every time the candidate finishes speaking
    # ------------------------------------------------------------------
    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ):
        """
        Called after LiveKit turn detection signals the candidate has stopped speaking.
        This is the core decision loop.
        """
        if self.phase in ("closing", "done"):
            return

        # ── Time enforcement: force close if over 90% budget ──────────────
        if self._is_time_over_budget():
            remaining = len(self.pillars) - self.current_pillar_idx - 1
            logger.info(
                f"[{self.session_id}] Time budget at 90% ({self._elapsed():.0f}s). "
                f"Forcing close. {remaining} pillars skipped."
            )
            await self._close(self.session, forced=True, remaining_pillars=remaining)
            return

        # Extract last candidate utterance
        candidate_utterance = str(new_message.content or "")

        self.transcript.append(
            {
                "role": "candidate",
                "text": candidate_utterance,
                "pillar_idx": self.current_pillar_idx,
                "phase": self.phase,
                "elapsed_seconds": round(self._elapsed()),
            }
        )
        # Defensive: session.userdata may raise ValueError if session not fully initialized
        try:
            self.session.userdata["transcript"] = self.transcript
        except ValueError:
            logger.warning(
                f"[{self.session_id}] session.userdata not set in on_user_turn_completed, "
                "transcript stored on agent only"
            )

        if not self.pillars or self.current_pillar_idx >= len(self.pillars):
            await self._close(self.session)
            return

        pillar = self.pillars[self.current_pillar_idx]

        # --- Inline coverage check (non-spoken, fast Qwen3.5) ------------
        coverage = await _check_coverage(candidate_utterance, pillar.sub_criteria)
        pillar.covered.update(coverage.get("covered", []))
        pillar.partial.update(coverage.get("partial", []))
        logger.info(
            f"[{self.session_id}] Pillar {self.current_pillar_idx} coverage: "
            f"covered={len(pillar.covered)}/{len(pillar.sub_criteria)} "
            f"elapsed={self._elapsed():.0f}s"
        )

        # ── Time enforcement: skip probe if pillar is over time ────────────
        advance_due_to_time = self._is_pillar_over_time() and not pillar.is_complete

        if pillar.is_complete or advance_due_to_time:
            if advance_due_to_time:
                logger.info(
                    f"[{self.session_id}] Pillar {self.current_pillar_idx} over time budget — advancing"
                )
            # Advance to next pillar
            self.current_pillar_idx += 1
            if self.current_pillar_idx >= len(self.pillars):
                await self._close(self.session)
            else:
                next_pillar = self.pillars[self.current_pillar_idx]
                await self.session.generate_reply(
                    instructions=_bridge_prompt(next_pillar)
                )
                self.phase = "topic"
        else:
            # Ask a follow-up probe
            pillar.probe_count += 1
            await self.session.generate_reply(instructions=_probe_prompt(pillar))
            self.phase = "probe"

    async def _close(
        self, session: AgentSession, forced: bool = False, remaining_pillars: int = 0
    ):
        """Generate closing statement and signal the backend."""
        self.phase = "closing"
        if forced and remaining_pillars > 0:
            await session.generate_reply(
                instructions=_time_warning_closing_prompt(
                    self.candidate_name, remaining_pillars
                )
            )
        else:
            await session.generate_reply(
                instructions=_closing_prompt(self.candidate_name)
            )
        self.phase = "done"
        logger.info(
            f"[{self.session_id}] Interview complete. "
            f"Transcript: {len(self.transcript)} turns. "
            f"Total time: {self._elapsed():.0f}s"
        )
        # Phase 4: persist transcript for the Judge Agent via session userdata
        try:
            session.userdata["transcript"] = self.transcript
            session.userdata["session_complete"] = True
        except ValueError:
            logger.warning(
                f"[{self.session_id}] session.userdata not set in _close, "
                "transcript stored on agent only"
            )
