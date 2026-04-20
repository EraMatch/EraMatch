"""
Live Interview V2 — Judge Agent Pipeline.

This is a POST-SESSION process. It runs asynchronously after a session is
marked complete. It never runs during the live interview.

Pipeline (4 phases):
  A. Segmentation   — split transcript into evidence blocks per dimension
  B. Anchor Match   — score each evidence block vs behavioral anchors (1/2/3)
  C. Weighted Score — Σ(dimension_score × weight) → overall score 0-100
  D. Report         — cited quotes + anchor matched + confidence per dimension

LLM: gemini-2.5-flash-lite for all dev phases.
     Swap to gemini-2.5-pro for Phase D in production for richer reasoning.

Key constraint: The Judge is LOCKED to the frozen rubric dimensions and
behavioral anchors captured at bank freeze time. It cannot introduce new
criteria or alter the weighting after candidates have already been assessed.
"""

import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import select

from app.db import get_session
from app.models import (
    LiV2Session,
    LiV2Rubric,
    LiV2Evaluation,
    CandidateStageProgress,
    GroupStageConfig,
)
from app.integrations.llm import get_llm

logger = logging.getLogger("eramatch.live_interview.judge")

_JUDGE_MODEL = os.getenv("JUDGE_MODEL", "gemini-2.5-flash-lite")
_FALLBACK_JUDGE_MODEL = os.getenv("FALLBACK_JUDGE_MODEL", "gemma3:4b-cloud")


# =============================================================================
# ENTRY POINT — called as a BackgroundTask
# =============================================================================


async def run_judge_pipeline(session_id: str):
    """
    Main entrypoint for the Judge pipeline.
    Called as a FastAPI BackgroundTask after session completion.
    """
    logger.info(f"[Judge] Starting pipeline for session {session_id}")
    try:
        async for db in get_session():
            await _execute_pipeline(db, session_id)
            break
    except Exception as e:
        logger.error(
            f"[Judge] Pipeline failed for session {session_id}: {e}", exc_info=True
        )


async def _execute_pipeline(db, session_id: str):
    # --- Load session ---
    result = await db.execute(select(LiV2Session).where(LiV2Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        logger.error(f"[Judge] Session {session_id} not found")
        return

    transcript = session.transcript or []
    if not transcript:
        logger.warning(f"[Judge] Empty transcript for session {session_id} — skipping")
        return

    # --- Load frozen rubric ---
    rubric_result = await db.execute(
        select(LiV2Rubric).where(LiV2Rubric.id == session.rubric_id)
    )
    rubric = rubric_result.scalar_one_or_none()
    if not rubric:
        logger.error(f"[Judge] Rubric {session.rubric_id} not found")
        return

    dimensions = rubric.dimensions or []
    if not dimensions:
        logger.warning(f"[Judge] Rubric has no dimensions — skipping")
        return

    llm = get_llm("gemini", model=_JUDGE_MODEL, temperature=0.1)
    fallback_llm = get_llm("ollama", model=_FALLBACK_JUDGE_MODEL, temperature=0.1)

    # Format transcript to plain text for LLM input
    transcript_text = _format_transcript(transcript)

    # --- Phase A: Segmentation (per-dimension evidence extraction) ---
    logger.info(
        "[JUDGE-P1] session=%s entry turns=%d dimensions=%d",
        session_id,
        len(transcript),
        len(dimensions),
    )
    evidence_blocks = await _phase_a_segmentation(
        llm, fallback_llm, transcript_text, dimensions
    )
    evidence_with_content = sum(
        1 for v in evidence_blocks.values() if v and v != "No relevant content found."
    )
    logger.info(
        "[JUDGE-P1] session=%s complete result=%d dimensions_with_evidence",
        session_id,
        evidence_with_content,
    )

    # --- Phase B: Anchor Matching (1=Substandard, 2=Proficient, 3=Excellent) ---
    logger.info("[JUDGE-P2] session=%s entry", session_id)
    dimension_results = await _phase_b_anchor_match(
        llm, fallback_llm, evidence_blocks, dimensions
    )
    logger.info(
        "[JUDGE-P2] session=%s complete dimensions_scored=%d",
        session_id,
        len(dimension_results),
    )

    # --- Phase C: Weighted Score ---
    logger.info("[JUDGE-P3] session=%s entry", session_id)
    overall_score_pct, overall_score, coverage_ratio = _phase_c_score(
        dimension_results, dimensions
    )
    logger.info(
        "[JUDGE-P3] session=%s complete score_pct=%d coverage=%.3f",
        session_id,
        overall_score_pct,
        float(coverage_ratio),
    )

    # --- Phase D: Verdict + Confidence ---
    logger.info("[JUDGE-P4] session=%s entry", session_id)
    verdict = _auto_verdict(overall_score_pct)
    meets_criteria = overall_score_pct >= 60
    confidence = _confidence_from_results(dimension_results)
    logger.info(
        "[JUDGE-P4] session=%s complete verdict=%s meets_criteria=%s confidence=%s",
        session_id,
        verdict,
        meets_criteria,
        confidence,
    )

    # --- Persist Evaluation ---
    evaluation = await _upsert_evaluation(
        db=db,
        session=session,
        dimension_results=dimension_results,
        overall_score=overall_score,
        overall_score_pct=overall_score_pct,
        coverage_ratio=coverage_ratio,
        verdict=verdict,
        meets_criteria=meets_criteria,
        confidence=confidence,
    )

    logger.info(
        f"[Judge] Completed session {session_id}: "
        f"score={overall_score_pct}% verdict={verdict} confidence={confidence}"
    )

    # --- Update candidate_pipeline_progress → completed ---
    try:
        stage_res = await db.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == session.group_id,
                GroupStageConfig.organization_id == session.organization_id,
                GroupStageConfig.stage_type == "live_interview",
            )
        )
        stage = stage_res.scalar_one_or_none()
        if stage:
            prog_res = await db.execute(
                select(CandidateStageProgress).where(
                    CandidateStageProgress.application_id == session.application_id,
                    CandidateStageProgress.stage_id == stage.stage_id,
                )
            )
            progress = prog_res.scalar_one_or_none()
            if progress:
                progress.status = "completed"
                progress.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                progress.score = Decimal(str(overall_score_pct))
                progress.max_score = Decimal("100")
                progress.passed = meets_criteria
                db.add(progress)
                await db.commit()
                logger.info(
                    "[PROGRESS] app=%s stage=%s status=completed score=%s",
                    session.application_id,
                    stage.stage_id,
                    overall_score_pct,
                )
            else:
                logger.warning(
                    "[PROGRESS] No candidate_pipeline_progress row for app=%s stage=%s",
                    session.application_id,
                    stage.stage_id,
                )
        else:
            logger.warning(
                "[PROGRESS] No live_interview stage found for group=%s org=%s",
                session.group_id,
                session.organization_id,
            )
    except Exception as e:
        logger.error("[PROGRESS] Failed to update pipeline progress after judge: %s", e)


# =============================================================================
# PHASE A: Segmentation
# =============================================================================


async def _phase_a_segmentation(
    llm, fallback_llm, transcript_text: str, dimensions: list[dict]
) -> dict:
    """
    Ask the LLM to extract the most relevant parts of the transcript
    for each rubric dimension. Returns {dimension_id: evidence_text}.
    """
    dimension_list = "\n".join(
        f"- {d.get('dimension_id', d.get('name', ''))}: {d.get('name', '')}"
        for d in dimensions
    )

    prompt = f"""You are analyzing a job interview transcript for an AI evaluation system.

TRANSCRIPT:
{transcript_text}

RUBRIC DIMENSIONS:
{dimension_list}

For each dimension, extract the most relevant 2-3 quotes or paraphrases from the candidate's responses.
If there is no relevant content for a dimension, say "No relevant content found."

Respond ONLY with valid JSON in this exact format:
{{
  "<dimension_id>": "<relevant evidence from candidate responses>",
  ...
}}"""

    try:
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = resp.content.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(raw)
    except Exception as primary_exc:
        logger.warning("[JUDGE-P1] primary failed: %s — trying fallback", primary_exc)
        try:
            resp = await fallback_llm.ainvoke([HumanMessage(content=prompt)])
            raw = (
                resp.content.strip()
                .lstrip("```json")
                .lstrip("```")
                .rstrip("```")
                .strip()
            )
            parsed = json.loads(raw)
            logger.info("[JUDGE-P1] fallback succeeded")
            return parsed
        except Exception as fallback_exc:
            logger.warning(
                "[JUDGE-P1] both LLMs failed (primary=%s, fallback=%s) — using empty evidence",
                primary_exc,
                fallback_exc,
            )
            return {d.get("dimension_id", d.get("name", "")): "" for d in dimensions}


# =============================================================================
# PHASE B: Anchor Matching
# =============================================================================


async def _phase_b_anchor_match(
    llm, fallback_llm, evidence_blocks: dict, dimensions: list[dict]
) -> dict:
    """
    For each dimension, compare the extracted evidence against the 3 behavioral
    anchors and assign a score (1=Substandard, 2=Proficient, 3=Excellent).

    Returns per-dimension result:
    {
        dimension_id: {
            score: 1|2|3,
            anchor_matched: "substandard"|"proficient"|"excellent",
            cited_quote: "...",
            reasoning: "...",
            weight: float
        }
    }
    """
    results = {}

    for dim in dimensions:
        dim_id = dim.get("dimension_id", dim.get("name", ""))
        evidence = evidence_blocks.get(dim_id, "No relevant content found.")
        anchors = dim.get("anchors", {})
        weight = float(dim.get("weight", 1.0 / len(dimensions)))

        if not evidence or evidence == "No relevant content found.":
            results[dim_id] = {
                "score": 1,
                "anchor_matched": "substandard",
                "cited_quote": "",
                "reasoning": "No relevant evidence found in the interview transcript.",
                "weight": weight,
                "dimension_name": dim.get("name", dim_id),
            }
            continue

        prompt = f"""You are a structured interview judge. Evaluate the candidate's performance on ONE competency dimension.

DIMENSION: {dim.get("name", dim_id)}

BEHAVIORAL ANCHORS (frozen by recruiter):
- Substandard (score 1): {anchors.get("substandard", "Below expectations")}
- Proficient  (score 2): {anchors.get("proficient", "Meets expectations")}
- Excellent   (score 3): {anchors.get("excellent", "Exceeds expectations")}

CANDIDATE EVIDENCE:
{evidence}

Your task:
1. Match the evidence to the most appropriate anchor.
2. Cite a specific quote from the evidence.
3. Explain your reasoning in 1-2 sentences.

CRITICAL: You CANNOT introduce new criteria. Only use the anchors above.

Respond ONLY with valid JSON:
{{
  "score": <1|2|3>,
  "anchor_matched": "<substandard|proficient|excellent>",
  "cited_quote": "<direct quote from candidate>",
  "reasoning": "<1-2 sentence explanation>"
}}"""

        try:
            resp = await llm.ainvoke([HumanMessage(content=prompt)])
            raw = (
                resp.content.strip()
                .lstrip("```json")
                .lstrip("```")
                .rstrip("```")
                .strip()
            )
            parsed = json.loads(raw)
            parsed["weight"] = weight
            parsed["dimension_name"] = dim.get("name", dim_id)
            results[dim_id] = parsed
        except Exception as primary_exc:
            logger.warning(
                "[JUDGE-P2] dimension %s primary failed: %s — trying fallback",
                dim_id,
                primary_exc,
            )
            try:
                resp = await fallback_llm.ainvoke([HumanMessage(content=prompt)])
                raw = (
                    resp.content.strip()
                    .lstrip("```json")
                    .lstrip("```")
                    .rstrip("```")
                    .strip()
                )
                parsed = json.loads(raw)
                parsed["weight"] = weight
                parsed["dimension_name"] = dim.get("name", dim_id)
                results[dim_id] = parsed
                logger.info("[JUDGE-P2] dimension %s fallback succeeded", dim_id)
            except Exception as fallback_exc:
                logger.warning(
                    "[JUDGE-P2] dimension %s both LLMs failed (primary=%s, fallback=%s) — defaulting to substandard",
                    dim_id,
                    primary_exc,
                    fallback_exc,
                )
                results[dim_id] = {
                    "score": 1,
                    "anchor_matched": "substandard",
                    "cited_quote": "",
                    "reasoning": f"Evaluation failed (primary: {primary_exc}; fallback: {fallback_exc})",
                    "weight": weight,
                    "dimension_name": dim.get("name", dim_id),
                }

    return results


# =============================================================================
# PHASE C: Weighted Score
# =============================================================================


def _phase_c_score(
    dimension_results: dict, dimensions: list[dict]
) -> tuple[int, Decimal, Decimal]:
    """
    Compute overall score as a weighted average, normalized to 0-100.

    dimension score: 1-3 (maps to 0%, 50%, 100%)
    """
    if not dimension_results:
        return 0, Decimal("0.0"), Decimal("0.0")

    score_map = {1: 0.0, 2: 0.5, 3: 1.0}

    total_weight = 0.0
    weighted_sum = 0.0
    covered_dimensions = 0

    for dim_id, result in dimension_results.items():
        weight = float(result.get("weight", 0.0))
        raw_score = int(result.get("score", 1))
        normalized = score_map.get(raw_score, 0.0)

        weighted_sum += normalized * weight
        total_weight += weight
        if result.get("anchor_matched") in ("proficient", "excellent"):
            covered_dimensions += 1

    if total_weight == 0:
        return 0, Decimal("0.0"), Decimal("0.0")

    overall_raw = weighted_sum / total_weight  # 0.0 - 1.0
    overall_pct = round(overall_raw * 100)
    coverage_ratio = Decimal(str(round(covered_dimensions / len(dimension_results), 3)))

    return overall_pct, Decimal(str(round(overall_raw, 4))), coverage_ratio


# =============================================================================
# VERDICTS & CONFIDENCE
# =============================================================================


def _auto_verdict(score_pct: int) -> str:
    if score_pct >= 80:
        return "strong_pass"
    elif score_pct >= 60:
        return "pass"
    elif score_pct >= 40:
        return "borderline"
    else:
        return "fail"


def _confidence_from_results(dimension_results: dict) -> str:
    """
    High confidence: all dimensions have a cited quote.
    Medium: most do.
    Low: few or none.
    """
    if not dimension_results:
        return "low"
    cited = sum(1 for r in dimension_results.values() if r.get("cited_quote"))
    ratio = cited / len(dimension_results)
    if ratio >= 0.8:
        return "high"
    elif ratio >= 0.5:
        return "medium"
    return "low"


# =============================================================================
# PERSIST
# =============================================================================


async def _upsert_evaluation(
    db,
    session,
    dimension_results: dict,
    overall_score: Decimal,
    overall_score_pct: int,
    coverage_ratio: Decimal,
    verdict: str,
    meets_criteria: bool,
    confidence: str,
) -> LiV2Evaluation:
    """Create or replace the evaluation record for this session."""
    # Check for existing evaluation
    existing = await db.execute(
        select(LiV2Evaluation).where(LiV2Evaluation.session_id == session.id)
    )
    evaluation = existing.scalar_one_or_none()

    if not evaluation:
        evaluation = LiV2Evaluation(
            session_id=session.id,
            organization_id=session.organization_id,
        )

    evaluation.overall_score = overall_score
    evaluation.overall_score_pct = overall_score_pct
    evaluation.auto_verdict = verdict
    evaluation.meets_criteria = meets_criteria
    evaluation.coverage_ratio = coverage_ratio
    evaluation.dimension_scores = dimension_results
    evaluation.evaluation_confidence = confidence
    evaluation.judged_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.add(evaluation)
    await db.commit()
    await db.refresh(evaluation)
    return evaluation


# =============================================================================
# HELPERS
# =============================================================================


def _format_transcript(transcript: list[dict]) -> str:
    """Convert raw transcript turns to readable text for LLM consumption."""
    lines = []
    for turn in transcript:
        role = turn.get("role", "unknown").upper()
        text = turn.get("text", "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines) if lines else "No transcript available."
