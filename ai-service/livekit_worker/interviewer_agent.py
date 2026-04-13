import json
import logging
import os
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
        def __init__(self, *args, **kwargs): pass
    AgentSession = Any  # type: ignore
    ChatContext = Any   # type: ignore
    _LIVEKIT_AVAILABLE = False

logger = logging.getLogger("eramatch.interviewer")

# config for now oonlyy — override in .env for prod
_INTERVIEWER_MODEL = os.getenv("INTERVIEWER_PRIMARY_MODEL", "gemini-2.5-flash-lite")
_COVERAGE_MODEL    = os.getenv("COVERAGE_CHECK_MODEL", "qwen3.5:4b-cloud")
_COVERAGE_BASEURL  = os.getenv("OLLAMA_HOST", "https://ollama.com") + "/v1"
_COVERAGE_API_KEY  = os.getenv("OLLAMA_API_KEY", "")


# ---------------------------------------------------------------------------
# Coverage state (per session)
# ---------------------------------------------------------------------------
@dataclass
class PillarState:
    """Represents one topical pillar (a bank question + its sub-criteria coverage)."""
    bank_item_id: str
    question_text: str
    dimension_name: str
    sub_criteria: list[str]                    # from question_rubric in bank
    covered: set[str] = field(default_factory=set)
    partial:  set[str] = field(default_factory=set)
    probe_count: int = 0
    MAX_PROBES: int = 2                        # max follow-ups per pillar

    @property
    def is_complete(self) -> bool:
        return len(self.covered) >= len(self.sub_criteria) or self.probe_count >= self.MAX_PROBES

    @property
    def missing(self) -> list[str]:
        return [s for s in self.sub_criteria if s not in self.covered]


def _build_pillars_from_bank(bank_items: list[dict]) -> list[PillarState]:
    """
    Convert frozen bank items into PillarState objects.
    Mandatory questions first, then sorted by dimension for coherent topical flow.
    """
    mandatory   = [i for i in bank_items if i.get("is_mandatory")]
    optional    = [i for i in bank_items if not i.get("is_mandatory")]
    ordered     = mandatory + optional

    pillars = []
    for item in ordered:
        sub_criteria = []
        rubric = item.get("question_rubric") or {}
        sub_criteria = rubric.get("sub_criteria", [])
        if isinstance(sub_criteria, list) and sub_criteria and isinstance(sub_criteria[0], dict):
            # handle {"text": ..., "weight": ...} format
            sub_criteria = [s.get("text", str(s)) for s in sub_criteria]

        pillars.append(PillarState(
            bank_item_id=item.get("bank_item_id", ""),
            question_text=item.get("text", ""),
            dimension_name=item.get("primary_dimension_id", ""),
            sub_criteria=sub_criteria or ["Demonstrate knowledge of the topic"],
        ))
    return pillars


# Inline coverage checker (small agent for now)
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
        headers = {"Authorization": f"Bearer {_COVERAGE_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": _COVERAGE_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 300,
        }
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(f"{_COVERAGE_BASEURL}/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            # Strip markdown fences if any
            raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            return json.loads(raw)
    except Exception as e:
        logger.warning(f"Coverage check failed ({e}), defaulting to all-missed.")
        return {"covered": [], "partial": [], "missed": sub_criteria}


# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------
def _opening_prompt(candidate_name: str, time_budget: int) -> str:
    return (
        f"You are a professional AI interviewer for EraMatch. "
        f"The candidate's name is {candidate_name}. "
        f"You have approximately {time_budget} minutes. "
        "Your style is warm, professional, and conversational — NOT robotic Q&A. "
        "Acknowledge what the candidate says before moving to the next topic. "
        "Do NOT reveal the sub-criteria or rubric to the candidate. "
        "When transitioning topics, use natural bridging phrases."
    )


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


# ---------------------------------------------------------------------------
# The Agent
# ---------------------------------------------------------------------------
class InterviewerAgent(Agent):
    """
      on_session_start → set system prompt, generate greeting
      on_user_turn_completed → check coverage, decide next action
    """

    def __init__(self, metadata: dict):
        self.session_id      = metadata.get("session_id", "unknown")
        self.candidate_name  = metadata.get("candidate_name", "Candidate")
        self.time_budget     = metadata.get("time_budget_minutes", 30)
        # Runtime state — filled after bank is fetched
        self.pillars: list[PillarState] = []
        self.current_pillar_idx: int = 0
        self.phase: str = "welcome"   # welcome | topic | probe | closing | done
        # Transcript for post-session judge
        self.transcript: list[dict] = []

        super().__init__(
            instructions=_opening_prompt(self.candidate_name, self.time_budget)
        )

    # ------------------------------------------------------------------
    # Session start: fetch bank from metadata passed by agent_server.py
    # ------------------------------------------------------------------
    async def on_session_start(self, session: AgentSession):
        """Called by LiveKit when the agent joins the room and is ready."""
        logger.info(f"[{self.session_id}] Session start — loading bank from context")

        # bank_items are passed via the session's userdata by agent_server.py
        bank_items = session.userdata.get("bank_items", [])
        if bank_items:
            self.pillars = _build_pillars_from_bank(bank_items)
            logger.info(f"[{self.session_id}] Loaded {len(self.pillars)} pillars from frozen bank")
        else:
            logger.warning(f"[{self.session_id}] No bank items — using fallback question")
            self.pillars = [PillarState(
                bank_item_id="fallback",
                question_text="Tell me about a challenging project you've worked on and what you learned from it.",
                dimension_name="General",
                sub_criteria=["Describes a specific challenge", "Explains how it was resolved", "Reflects on learnings"],
            )]

        # Generate opening greeting
        await session.generate_reply(
            instructions=(
                f"Welcome {self.candidate_name} warmly to the EraMatch live interview. "
                "Tell them the interview will feel like a natural conversation. "
                "Briefly explain how it works (you ask, they answer, natural back-and-forth). "
                "Then ask them to introduce themselves."
            )
        )
        self.phase = "topic"


    # Every time the candidate finishes speaking
    # ------------------------------------------------------------------
    async def on_user_turn_completed(self, session: AgentSession, turn_ctx: ChatContext):
        """
        Called after LiveKit turn detection signals the candidate has stopped speaking.
        This is the core decision loop.
        """
        if self.phase in ("closing", "done"):
            return

        # Extract last candidate utterance
        candidate_utterance = ""
        for msg in reversed(turn_ctx.messages):
            if hasattr(msg, "role") and msg.role == "user":
                candidate_utterance = str(msg.content or "")
                break

        # Log to transcript
        self.transcript.append({
            "role": "candidate",
            "text": candidate_utterance,
            "pillar_idx": self.current_pillar_idx,
            "phase": self.phase,
        })

        if not self.pillars or self.current_pillar_idx >= len(self.pillars):
            await self._close(session)
            return

        pillar = self.pillars[self.current_pillar_idx]

        # --- Inline coverage check (non-spoken, fast Qwen3.5) --------
        coverage = await _check_coverage(candidate_utterance, pillar.sub_criteria)
        pillar.covered.update(coverage.get("covered", []))
        pillar.partial.update(coverage.get("partial", []))
        logger.info(
            f"[{self.session_id}] Pillar {self.current_pillar_idx} coverage: "
            f"covered={len(pillar.covered)}/{len(pillar.sub_criteria)}"
        )

        if pillar.is_complete:
            # Advance to next pillar
            self.current_pillar_idx += 1
            if self.current_pillar_idx >= len(self.pillars):
                await self._close(session)
            else:
                next_pillar = self.pillars[self.current_pillar_idx]
                await session.generate_reply(instructions=_bridge_prompt(next_pillar))
                self.phase = "topic"
        else:
            # Ask a follow-up probe
            pillar.probe_count += 1
            await session.generate_reply(instructions=_probe_prompt(pillar))
            self.phase = "probe"

    async def _close(self, session: AgentSession):
        """Generate closing statement and signal the backend."""
        self.phase = "closing"
        await session.generate_reply(instructions=_closing_prompt(self.candidate_name))
        self.phase = "done"
        logger.info(f"[{self.session_id}] Interview complete. Transcript has {len(self.transcript)} turns.")
        # Phase 4: persist transcript for the Judge Agent via session userdata
        session.userdata["transcript"] = self.transcript
        session.userdata["session_complete"] = True
