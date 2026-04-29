"""
Live Interview V2 — Judge Agent Pipeline.

POST-SESSION process. Runs asynchronously after a session is marked complete.
Never runs during the live interview.

Pipeline (5 phases):
  A. Segmentation       — split transcript into evidence blocks per dimension
  B. Question Segments  — map transcript turns to questions via pillar_idx
  C. Per-Question Score — score each Q&A pair against sub-criteria (1-3)
  D. Weighted Score     — aggregate per-question → dimension → overall 0-100
  E. Report             — cited quotes + anchor matched + confidence per dimension

Backwards-compatible: dimension-level scoring (Phase A) is preserved as fallback
when bank items are unavailable or per-question scoring fails.
"""

import json
import logging
import math
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import select

from app.db import get_session
from app.models import (
    LiV2Session,
    LiV2Rubric,
    LiV2Bank,
    LiV2Evaluation,
    CandidateStageProgress,
    GroupStageConfig,
)
from app.integrations.llm import get_llm

logger = logging.getLogger("eramatch.live_interview.judge")

_JUDGE_MODEL = os.getenv("JUDGE_MODEL", "gemini-2.5-flash-lite")
_FALLBACK_JUDGE_MODEL = os.getenv("FALLBACK_JUDGE_MODEL", "gemma3:4b-cloud")


# =============================================================================
# HELPERS — safe numeric conversions
# =============================================================================


def _safe_int(value, default: int = 0) -> int:
    """Convert a value to int, returning default if conversion fails or value is NaN/Inf."""
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (TypeError, ValueError):
        return default


def _clamp(value, low, high):
    """Clamp a numeric value to [low, high]."""
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return low
        return max(low, min(high, f))
    except (TypeError, ValueError):
        return low


def _safe_decimal(value, default: Decimal = Decimal("0")) -> Decimal:
    """Convert a value to Decimal, returning default if conversion fails."""
    try:
        d = Decimal(str(value))
        if d.is_nan() or d.is_infinite():
            return default
        return d
    except (InvalidOperation, TypeError, ValueError):
        return default


def _normalize_sub_criteria(
    raw_sub_criteria: list, expected_names: list[str]
) -> list[dict]:
    """Normalize and validate LLM-returned sub_criteria scores.

    - Clamp each score to [1, 3]
    - Ensure every expected sub-criterion has an entry
    - Fill missing entries with score=1, covered=False
    """
    result = []
    seen_names = set()

    for sc in raw_sub_criteria:
        if not isinstance(sc, dict):
            continue
        name = str(sc.get("name", ""))
        score = _safe_int(sc.get("score"), default=1)
        score = max(1, min(3, score))
        result.append(
            {
                "name": name,
                "score": score,
                "covered": bool(sc.get("covered", False)),
                "cited_quote": str(sc.get("cited_quote", "")),
            }
        )
        seen_names.add(name.lower().strip())

    for expected_name in expected_names:
        if expected_name.lower().strip() not in seen_names:
            result.append(
                {
                    "name": expected_name,
                    "score": 1,
                    "covered": False,
                    "cited_quote": "",
                }
            )

    return result


# =============================================================================
# ENTRY POINT
# =============================================================================


async def run_judge_pipeline(session_id: str):
    logger.info(f"[Judge] Starting pipeline for session {session_id}")
    try:
        async for db in get_session():
            await _execute_pipeline(db, session_id)
            break
    except Exception as e:
        logger.error(
            f"[Judge] Pipeline failed for session {session_id}: {e}", exc_info=True
        )


async def _create_fail_evaluation(db, session, reason: str):
    """Create a minimal evaluation record marking the session as failed."""
    try:
        existing = await db.execute(
            select(LiV2Evaluation).where(LiV2Evaluation.session_id == session.id)
        )
        evaluation = existing.scalar_one_or_none()
        if not evaluation:
            evaluation = LiV2Evaluation(
                session_id=session.id,
                organization_id=session.organization_id,
            )
        evaluation.overall_score = Decimal("0.0")
        evaluation.overall_score_pct = 0
        evaluation.auto_verdict = "fail"
        evaluation.meets_criteria = False
        evaluation.coverage_ratio = Decimal("0.0")
        evaluation.dimension_scores = {}
        evaluation.evaluation_confidence = "low"
        evaluation.judged_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(evaluation)
        await db.commit()
        await db.refresh(evaluation)

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
                progress.score = Decimal("0")
                progress.max_score = Decimal("100")
                progress.passed = False
                db.add(progress)
                await db.commit()
    except Exception as e:
        logger.error("[Judge] Failed to create fail evaluation: %s", e, exc_info=True)


async def _execute_pipeline(db, session_id: str):
    result = await db.execute(select(LiV2Session).where(LiV2Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        logger.error("[Judge] Session %s not found", session_id)
        return

    transcript = session.transcript or []
    if not transcript:
        logger.warning(
            "[Judge] Empty transcript for session %s — creating fail evaluation",
            session_id,
        )
        await _create_fail_evaluation(
            db,
            session,
            reason="Empty transcript — no interview content to evaluate",
        )
        return

    if len(transcript) < 3:
        logger.warning(
            "[Judge] Very short transcript (%d turns) for session %s — confidence will be low",
            len(transcript),
            session_id,
        )

    rubric_result = await db.execute(
        select(LiV2Rubric).where(LiV2Rubric.id == session.rubric_id)
    )
    rubric = rubric_result.scalar_one_or_none()
    if not rubric:
        logger.error("[Judge] Rubric %s not found", session.rubric_id)
        return

    dimensions = rubric.dimensions or []
    if not dimensions:
        logger.warning("[Judge] Rubric has no dimensions — skipping")
        return

    bank_result = await db.execute(
        select(LiV2Bank).where(LiV2Bank.id == session.bank_id)
    )
    bank = bank_result.scalar_one_or_none()
    bank_items = []
    if bank and bank.items:
        bank_items = bank.items
    else:
        logger.warning(
            "[Judge] No bank items for session %s — will use dimension-level scoring only",
            session_id,
        )

    llm = get_llm("gemini", model=_JUDGE_MODEL, temperature=0.1)
    fallback_llm = get_llm("ollama", model=_FALLBACK_JUDGE_MODEL, temperature=0.1)

    transcript_text = _format_transcript(transcript)

    # --- Phase A: Dimension-level evidence extraction ---
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
        "[JUDGE-P1] session=%s complete dimensions_with_evidence=%d",
        session_id,
        evidence_with_content,
    )

    # --- Phase B: Per-question segmentation via pillar_idx ---
    question_evidence = _extract_question_evidence(transcript, bank_items)
    per_question_results = []
    logger.info(
        "[JUDGE-P2-Q] session=%s question_segments=%d",
        session_id,
        len(question_evidence),
    )

    # --- Phase C: Per-question scoring ---
    if question_evidence:
        per_question_results = await _phase_b_question(
            llm, fallback_llm, question_evidence, dimensions
        )
        logger.info(
            "[JUDGE-P2-Q] session=%s questions_scored=%d",
            session_id,
            len(per_question_results),
        )

        # --- Phase D: Weighted aggregation (per-question → dimension → overall) ---
        overall_score_pct, overall_score, coverage_ratio, dimension_results = (
            _phase_c_score_with_questions(per_question_results, dimensions)
        )
    else:
        # Fallback: dimension-level scoring only (original path)
        logger.info(
            "[JUDGE-P2] session=%s no question evidence — falling back to dimension-level scoring",
            session_id,
        )
        dimension_results = await _phase_b_anchor_match(
            llm, fallback_llm, evidence_blocks, dimensions
        )
        overall_score_pct, overall_score, coverage_ratio = _phase_c_score(
            dimension_results, dimensions
        )

    logger.info(
        "[JUDGE-P3] session=%s score_pct=%d coverage=%.3f",
        session_id,
        overall_score_pct,
        float(coverage_ratio),
    )

    # --- Phase E: Verdict + Confidence ---
    verdict = _auto_verdict(overall_score_pct)
    meets_criteria = overall_score_pct >= 60
    confidence = _confidence_from_results(dimension_results)
    logger.info(
        "[JUDGE-P4] session=%s verdict=%s meets_criteria=%s confidence=%s",
        session_id,
        verdict,
        meets_criteria,
        confidence,
    )

    # --- Persist ---
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
        per_question_results=per_question_results if per_question_results else None,
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
# PHASE A: Segmentation (dimension-level, unchanged)
# =============================================================================


async def _phase_a_segmentation(
    llm, fallback_llm, transcript_text: str, dimensions: list[dict]
) -> dict:
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
# PHASE B: Question-Evidence Extraction
# =============================================================================


def _extract_question_evidence(
    transcript: list[dict], bank_items: list[dict]
) -> list[dict]:
    """
    Split transcript into per-question Q&A pairs using pillar_idx.
    Each question (pillar) gets the AI question + candidate answer text.

    Returns [{question_text, dimension_id, candidate_answer, sub_criteria, pillar_idx}]
    """
    if not bank_items:
        return []

    question_map: dict[int, dict] = {}
    for idx, item in enumerate(bank_items):
        rubric = item.get("question_rubric") or {}
        raw_sub = rubric.get("sub_criteria", [])
        sub_criteria_names = []
        if isinstance(raw_sub, list) and raw_sub:
            if isinstance(raw_sub[0], dict):
                sub_criteria_names = [s.get("text", str(s)) for s in raw_sub]
            else:
                sub_criteria_names = [str(s) for s in raw_sub]

        question_map[idx] = {
            "question_text": item.get("text", ""),
            "dimension_id": item.get("primary_dimension_id", ""),
            "sub_criteria": sub_criteria_names
            if sub_criteria_names
            else ["Demonstrate knowledge of the topic"],
            "pillar_idx": idx,
        }

    pillar_turns: dict[int, list[dict]] = {}
    out_of_bounds_indices = set()
    for turn in transcript:
        pidx = turn.get("pillar_idx")
        if pidx is None:
            continue
        if pidx not in question_map:
            out_of_bounds_indices.add(pidx)
        pillar_turns.setdefault(pidx, []).append(turn)

    if out_of_bounds_indices:
        logger.warning(
            "[JUDGE-P2] Found out-of-bounds pillar_idx values: %s (bank has %d items)",
            sorted(out_of_bounds_indices),
            len(bank_items),
        )

    results = []
    for pidx, qinfo in question_map.items():
        turns = pillar_turns.get(pidx, [])
        if not turns:
            continue

        ai_questions = []
        candidate_answers = []
        for turn in turns:
            role = turn.get("role", "")
            text = turn.get("text", "").strip()
            if not text:
                continue
            if role == "agent":
                ai_questions.append(text)
            elif role == "candidate":
                candidate_answers.append(text)

        if not candidate_answers:
            results.append(
                {
                    "question_text": qinfo["question_text"],
                    "dimension_id": qinfo["dimension_id"],
                    "candidate_answer": "",
                    "sub_criteria": qinfo["sub_criteria"],
                    "pillar_idx": pidx,
                }
            )
            continue

        results.append(
            {
                "question_text": qinfo["question_text"],
                "dimension_id": qinfo["dimension_id"],
                "candidate_answer": " ".join(candidate_answers),
                "sub_criteria": qinfo["sub_criteria"],
                "pillar_idx": pidx,
            }
        )

    return results


# =============================================================================
# PHASE C: Per-Question Scoring
# =============================================================================


async def _phase_b_question(
    llm, fallback_llm, question_evidence: list[dict], dimensions: list[dict]
) -> list[dict]:
    """
    Score each question's sub-criteria individually via LLM.

    Returns a list of per-question result dicts:
    [{
        question_text, question_score, dimension_id, dimension_name,
        sub_criteria: [{name, score, covered, cited_quote}],
        reasoning, anchor_matched, cited_quote, weight
    }]
    """
    dim_by_id = {}
    for d in dimensions:
        dim_id = d.get("dimension_id", d.get("name", ""))
        dim_by_id[dim_id] = d

    results = []
    for qe in question_evidence:
        dim_id = qe["dimension_id"]
        dim = dim_by_id.get(dim_id, {})
        dim_name = dim.get("name", dim_id)
        anchors = dim.get("anchors", {})
        weight = float(dim.get("weight", 1.0 / max(len(dimensions), 1)))
        sub_criteria = qe["sub_criteria"]

        sub_criteria_text = "\n".join(
            f"  {i + 1}. {sc}" for i, sc in enumerate(sub_criteria)
        )
        anchors_text = (
            f"- Substandard (1): {anchors.get('substandard', 'Below expectations')}\n"
            f"- Proficient  (2): {anchors.get('proficient', 'Meets expectations')}\n"
            f"- Excellent   (3): {anchors.get('excellent', 'Exceeds expectations')}"
        )

        prompt = f"""You are a structured interview judge evaluating a SINGLE question-answer pair.

INTERVIEW QUESTION: {qe["question_text"]}

CANDIDATE'S ANSWER: {qe["candidate_answer"]}

RUBRIC DIMENSION: {dim_name}
BEHAVIORAL ANCHORS (frozen by recruiter):
{anchors_text}

SUB-CRITERIA — score EACH one individually:
{sub_criteria_text}

For each sub-criterion:
1. Assign a score (1=Substandard, 2=Proficient, 3=Excellent).
2. Mark whether the candidate addressed it (covered: true/false).
3. Cite a specific quote from the answer supporting the score.

Then provide:
- question_score: average of all sub-criteria scores (1.0-3.0)
- anchor_matched: the best-fitting overall anchor (substandard/proficient/excellent)
- reasoning: 1-2 sentences explaining the overall assessment
- cited_quote: the single most compelling quote from the candidate

Respond ONLY with valid JSON:
{{
  "sub_criteria_scores": [
    {{"name": "<sub-criterion name>", "score": <1|2|3>, "covered": <true|false>, "cited_quote": "<quote>"}}
  ],
  "question_score": <float 1.0-3.0>,
  "anchor_matched": "<substandard|proficient|excellent>",
  "reasoning": "<1-2 sentence explanation>",
  "cited_quote": "<best quote>"
}}"""

        result_base = {
            "question_text": qe["question_text"],
            "dimension_id": dim_id,
            "dimension_name": dim_name,
            "weight": weight,
            "pillar_idx": qe["pillar_idx"],
        }

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
            result_base["question_score"] = _clamp(
                float(parsed.get("question_score", 1.0)), 1.0, 3.0
            )
            result_base["anchor_matched"] = parsed.get("anchor_matched", "substandard")
            if result_base["anchor_matched"] not in (
                "substandard",
                "proficient",
                "excellent",
            ):
                logger.warning(
                    "[JUDGE-P2-Q] pillar %s invalid anchor '%s' — defaulting to substandard",
                    qe["pillar_idx"],
                    result_base["anchor_matched"],
                )
                result_base["anchor_matched"] = "substandard"
            result_base["reasoning"] = parsed.get("reasoning", "")
            result_base["cited_quote"] = parsed.get("cited_quote", "")
            raw_sub_criteria = parsed.get("sub_criteria_scores", [])
            result_base["sub_criteria"] = _normalize_sub_criteria(
                raw_sub_criteria, sub_criteria
            )
        except Exception as primary_exc:
            logger.warning(
                "[JUDGE-P2-Q] pillar %s primary failed: %s — trying fallback",
                qe["pillar_idx"],
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
                result_base["question_score"] = _clamp(
                    float(parsed.get("question_score", 1.0)), 1.0, 3.0
                )
                result_base["anchor_matched"] = parsed.get(
                    "anchor_matched", "substandard"
                )
                if result_base["anchor_matched"] not in (
                    "substandard",
                    "proficient",
                    "excellent",
                ):
                    result_base["anchor_matched"] = "substandard"
                result_base["reasoning"] = parsed.get("reasoning", "")
                result_base["cited_quote"] = parsed.get("cited_quote", "")
                raw_sub_criteria = parsed.get("sub_criteria_scores", [])
                result_base["sub_criteria"] = _normalize_sub_criteria(
                    raw_sub_criteria, sub_criteria
                )
                logger.info(
                    "[JUDGE-P2-Q] pillar %s fallback succeeded", qe["pillar_idx"]
                )
            except Exception as fallback_exc:
                logger.warning(
                    "[JUDGE-P2-Q] pillar %s both LLMs failed — defaulting to substandard",
                    qe["pillar_idx"],
                )
                result_base["question_score"] = 1.0
                result_base["anchor_matched"] = "substandard"
                result_base["reasoning"] = (
                    f"Evaluation failed (primary: {primary_exc}; fallback: {fallback_exc})"
                )
                result_base["cited_quote"] = ""
                result_base["sub_criteria"] = [
                    {"name": sc, "score": 1, "covered": False, "cited_quote": ""}
                    for sc in sub_criteria
                ]

        results.append(result_base)

    return results


# =============================================================================
# PHASE B (Legacy): Dimension-level Anchor Matching
# =============================================================================


async def _phase_b_anchor_match(
    llm, fallback_llm, evidence_blocks: dict, dimensions: list[dict]
) -> dict:
    """
    Dimension-level scoring (legacy fallback).
    For each dimension, compare extracted evidence vs behavioral anchors.
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
            score_val = _safe_int(parsed.get("score"), default=1)
            parsed["score"] = max(1, min(3, score_val))
            if parsed.get("anchor_matched") not in (
                "substandard",
                "proficient",
                "excellent",
            ):
                parsed["anchor_matched"] = "substandard"
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
                score_val = _safe_int(parsed.get("score"), default=1)
                parsed["score"] = max(1, min(3, score_val))
                if parsed.get("anchor_matched") not in (
                    "substandard",
                    "proficient",
                    "excellent",
                ):
                    parsed["anchor_matched"] = "substandard"
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


def _phase_c_score_with_questions(
    per_question_results: list[dict], dimensions: list[dict]
) -> tuple[int, Decimal, Decimal, dict]:
    """
    Aggregate per-question scores into dimension scores, then weighted overall.

    For each dimension:
      dimension_score = avg(q.question_score for q in dimension_questions) / 3 * 100
    Overall: weighted average of dimension_score * dimension_weight.
    Coverage: fraction of dimensions with at least one proficient/excellent question.

    Returns (overall_pct, overall_raw, coverage_ratio, dimension_results_dict).
    """
    score_map = {1: Decimal("0"), 2: Decimal("0.5"), 3: Decimal("1")}
    dim_by_id = {d.get("dimension_id", d.get("name", "")): d for d in dimensions}

    dim_questions: dict[str, list] = {}
    for qr in per_question_results:
        dim_id = qr.get("dimension_id", "")
        dim_questions.setdefault(dim_id, []).append(qr)

    dimension_results = {}

    for dim in dimensions:
        dim_id = dim.get("dimension_id", dim.get("name", ""))
        dim_name = dim.get("name", dim_id)
        weight = Decimal(str(dim.get("weight", 1.0 / max(len(dimensions), 1))))
        anchors = dim.get("anchors", {})
        questions = dim_questions.get(dim_id, [])

        if not questions:
            dimension_results[dim_id] = {
                "score": 1,
                "anchor_matched": "substandard",
                "cited_quote": "",
                "reasoning": "No questions were asked for this dimension.",
                "weight": float(weight),
                "dimension_name": dim_name,
            }
            continue

        avg_q_score = sum(
            Decimal(str(_clamp(q.get("question_score", 1.0), 1.0, 3.0)))
            for q in questions
        ) / Decimal(str(len(questions)))
        normalized_pct = int(
            ((avg_q_score - Decimal("1")) / Decimal("2")) * Decimal("100")
        )

        if avg_q_score >= Decimal("2.5"):
            anchor = "excellent"
            dim_score = 3
        elif avg_q_score >= Decimal("1.5"):
            anchor = "proficient"
            dim_score = 2
        else:
            anchor = "substandard"
            dim_score = 1

        all_cited = []
        all_reasoning = []
        for q in questions:
            if q.get("cited_quote"):
                all_cited.append(q["cited_quote"])
            if q.get("reasoning"):
                all_reasoning.append(
                    f"[{q.get('question_text', 'Q')[:60]}]: {q['reasoning']}"
                )

        dimension_results[dim_id] = {
            "score": dim_score,
            "anchor_matched": anchor,
            "cited_quote": all_cited[0] if all_cited else "",
            "reasoning": "; ".join(all_reasoning) if all_reasoning else "",
            "weight": float(weight),
            "dimension_name": dim_name,
        }

    total_weight = Decimal("0")
    weighted_sum = Decimal("0")
    covered_dimensions = 0

    for dim_id, result in dimension_results.items():
        weight = Decimal(str(result.get("weight", 0.0)))
        raw_score = _safe_int(result.get("score", 1), default=1)
        normalized = score_map.get(raw_score, Decimal("0"))

        weighted_sum += normalized * weight
        total_weight += weight
        if result.get("anchor_matched") in ("proficient", "excellent"):
            covered_dimensions += 1

    if total_weight == 0:
        return 0, Decimal("0.0"), Decimal("0.0"), dimension_results

    if abs(total_weight - Decimal("1")) > Decimal("0.05"):
        logger.warning(
            "[JUDGE-P3] Dimension weights sum to %s (expected ~1.0) — normalizing",
            total_weight,
        )

    overall_raw = weighted_sum / total_weight
    overall_pct = int(overall_raw * Decimal("100"))
    coverage_ratio = Decimal(
        str(round(covered_dimensions / max(len(dimension_results), 1), 3))
    )

    return (
        overall_pct,
        overall_raw.quantize(Decimal("0.0001")),
        coverage_ratio,
        dimension_results,
    )


def _phase_c_score(
    dimension_results: dict, dimensions: list[dict]
) -> tuple[int, Decimal, Decimal]:
    """
    Legacy dimension-level weighted score.
    dimension score: 1-3 (maps to 0%, 50%, 100%)
    """
    if not dimension_results:
        return 0, Decimal("0.0"), Decimal("0.0")

    score_map = {1: Decimal("0"), 2: Decimal("0.5"), 3: Decimal("1")}

    total_weight = Decimal("0")
    weighted_sum = Decimal("0")
    covered_dimensions = 0

    for dim_id, result in dimension_results.items():
        weight = Decimal(str(result.get("weight", 0.0)))
        raw_score = _safe_int(result.get("score", 1), default=1)
        normalized = score_map.get(raw_score, Decimal("0"))

        weighted_sum += normalized * weight
        total_weight += weight
        if result.get("anchor_matched") in ("proficient", "excellent"):
            covered_dimensions += 1

    if total_weight == 0:
        return 0, Decimal("0.0"), Decimal("0.0")

    if abs(total_weight - Decimal("1")) > Decimal("0.05"):
        logger.warning(
            "[JUDGE-P3] Dimension weights sum to %s (expected ~1.0) — normalizing",
            total_weight,
        )

    overall_raw = weighted_sum / total_weight
    overall_pct = int(overall_raw * Decimal("100"))
    coverage_ratio = Decimal(
        str(round(covered_dimensions / max(len(dimension_results), 1), 3))
    )

    return overall_pct, overall_raw.quantize(Decimal("0.0001")), coverage_ratio


# =============================================================================
# VERDICTS & CONFIDENCE
# =============================================================================


def _auto_verdict(score_pct) -> str:
    if isinstance(score_pct, Decimal):
        score_pct = int(score_pct)
    else:
        score_pct = _safe_int(score_pct, default=0)
    if score_pct >= 80:
        return "strong_pass"
    elif score_pct >= 60:
        return "pass"
    elif score_pct >= 40:
        return "borderline"
    else:
        return "fail"


def _confidence_from_results(dimension_results: dict) -> str:
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
    per_question_results: Optional[list] = None,
) -> LiV2Evaluation:
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

    if per_question_results is not None:
        evaluation.per_question_results = {
            f"pillar_{qr.get('pillar_idx', idx)}": {
                "question_text": qr.get("question_text"),
                "question_score": qr.get("question_score"),
                "dimension_id": qr.get("dimension_id"),
                "dimension_name": qr.get("dimension_name"),
                "sub_criteria": qr.get("sub_criteria", []),
                "reasoning": qr.get("reasoning"),
                "anchor_matched": qr.get("anchor_matched"),
                "cited_quote": qr.get("cited_quote"),
                "weight": qr.get("weight"),
            }
            for idx, qr in enumerate(per_question_results)
        }
    elif evaluation.per_question_results is None:
        evaluation.per_question_results = None

    db.add(evaluation)
    await db.commit()
    await db.refresh(evaluation)
    return evaluation


# =============================================================================
# HELPERS
# =============================================================================


def _format_transcript(transcript: list[dict]) -> str:
    lines = []
    for turn in transcript:
        role = turn.get("role", "unknown").upper()
        text = turn.get("text", "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines) if lines else "No transcript available."
