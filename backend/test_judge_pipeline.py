"""
Judge Pipeline Standalone Test.

Tests the 4-phase judge pipeline with mock data:
  A. Segmentation  — extract evidence per dimension
  B. Anchor Match   — score each dimension vs behavioral anchors
  C. Weighted Score — compute overall score 0-100
  D. Verdict        — strong_pass/pass/borderline/fail

If Ollama is available at localhost:11434, uses the real LLM.
Otherwise, falls back to pre-computed mock outputs.

Usage:
    cd EraMatch/backend
    python test_judge_pipeline.py
"""

import asyncio
import json
import sys
import urllib.request
import urllib.error
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Try to import the real judge functions; fall back to local copies
# ---------------------------------------------------------------------------
sys.path.insert(0, ".")

try:
    from app.services.live_interview.judge import (
        _phase_c_score,
        _auto_verdict,
        _confidence_from_results,
        _format_transcript,
    )

    REAL_FUNCTIONS_AVAILABLE = True
except ImportError:
    REAL_FUNCTIONS_AVAILABLE = False

# If we can't import the real functions, we re-impute them locally
if not REAL_FUNCTIONS_AVAILABLE:

    def _phase_c_score(dimension_results: dict, dimensions: list) -> tuple:
        """Compute overall score as a weighted average, normalized to 0-100."""
        if not dimension_results:
            return 0, 0.0, 0.0
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
            return 0, 0.0, 0.0
        overall_raw = weighted_sum / total_weight
        overall_pct = round(overall_raw * 100)
        coverage_ratio = round(covered_dimensions / len(dimension_results), 3)
        return overall_pct, round(overall_raw, 4), coverage_ratio

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
        if not dimension_results:
            return "low"
        cited = sum(1 for r in dimension_results.values() if r.get("cited_quote"))
        ratio = cited / len(dimension_results)
        if ratio >= 0.8:
            return "high"
        elif ratio >= 0.5:
            return "medium"
        return "low"

    def _format_transcript(transcript: list) -> str:
        lines = []
        for turn in transcript:
            role = turn.get("role", "unknown").upper()
            text = turn.get("text", "").strip()
            if text:
                lines.append(f"{role}: {text}")
        return "\n".join(lines) if lines else "No transcript available."


# ===========================================================================
# MOCK DATA
# ===========================================================================

MOCK_RUBRIC_DIMENSIONS = [
    {
        "dimension_id": "technical_depth",
        "name": "Technical Depth",
        "weight": 0.4,
        "anchors": {
            "substandard": "Candidate shows superficial knowledge; cannot explain concepts beyond surface level; struggles with follow-up questions on technical topics.",
            "proficient": "Candidate demonstrates solid understanding of core technologies; can explain design decisions; references specific tools and patterns; handles most follow-up questions well.",
            "excellent": "Candidate shows deep expertise; explains trade-offs and edge cases; connects concepts across domains; proposes innovative solutions; demonstrates mastery of advanced patterns.",
        },
    },
    {
        "dimension_id": "problem_solving",
        "name": "Problem Solving",
        "weight": 0.3,
        "anchors": {
            "substandard": "Candidate jumps to solutions without analysis; cannot decompose problems; ignores constraints; gives up easily on challenging questions.",
            "proficient": "Candidate decomposes problems into sub-problems; considers trade-offs; proposes workable solutions; asks clarifying questions when needed.",
            "excellent": "Candidate systematically analyzes problems; identifies edge cases and constraints proactively; proposes multiple solution paths with trade-off analysis; demonstrates creative thinking.",
        },
    },
    {
        "dimension_id": "communication",
        "name": "Communication",
        "weight": 0.3,
        "anchors": {
            "substandard": "Candidate's answers are disorganized or incoherent; fails to address the question; uses jargon without explanation; provides vague or incomplete responses.",
            "proficient": "Candidate structures answers logically; uses appropriate technical vocabulary; provides concrete examples; communicates ideas clearly.",
            "excellent": "Candidate communicates with exceptional clarity and precision; tailors complexity to audience; uses analogies effectively; anticipates follow-up questions; demonstrates active listening.",
        },
    },
]

MOCK_TRANSCRIPT = [
    {
        "role": "ai",
        "text": "Tell me about your experience with React and how you handle state management in large applications.",
    },
    {
        "role": "candidate",
        "text": "I've been working with React for about 4 years now. In large applications, I typically use React hooks and the Context API for state management when the state is relatively simple and localized. For more complex applications with frequent state updates across many components, I prefer using Redux Toolkit because it provides a predictable state container with good devtools support. I also use custom hooks to encapsulate reusable stateful logic, which keeps components clean and makes the code more testable.",
    },
    {
        "role": "ai",
        "text": "Can you explain how you would optimize a React application that has performance issues with frequent re-renders?",
    },
    {
        "role": "candidate",
        "text": "First, I would use React DevTools Profiler to identify which components are re-rendering unnecessarily. Then I'd apply React.memo to components that receive the same props but still re-render. For expensive computations inside render, I'd use useMemo, and for callback functions passed as props, I'd use useCallback to maintain referential equality. I also look at whether the state structure itself is causing issues — sometimes splitting large state objects or using selectors with libraries like reselect can prevent unnecessary re-renders. In one project, I reduced render count by 60% just by memoizing selectors.",
    },
    {
        "role": "ai",
        "text": "Let's talk about system design. How would you design a real-time notification system for a platform like LinkedIn?",
    },
    {
        "role": "candidate",
        "text": "I'd approach this by first identifying the key requirements: real-time delivery, support for multiple notification types, scalability to millions of users, and reliability. I'd use a WebSocket-based approach for real-time delivery with Server-Sent Events as a fallback. On the backend, I'd set up a message queue using Kafka to handle the ingestion of notification events, then process them through a service that determines routing. For storage, I'd use a combination of Redis for active notifications and PostgreSQL for persistent history. The notification service would maintain connection state in Redis so we know which users are online. For offline users, I'd batch notifications and deliver them on reconnect.",
    },
    {
        "role": "ai",
        "text": "What about when things go wrong? How would you handle a situation where a critical production service is degraded?",
    },
    {
        "role": "candidate",
        "text": "I think the most important thing is to stay calm and follow a systematic approach. I'd start by checking the monitoring dashboards and recent deployments. If there was a recent deploy, I'd consider a quick rollback. Otherwise, I'd look at the metrics — CPU, memory, error rates, latency — to narrow down the issue. I'd also check logs for any error spikes. Once we have a mitigation in place, I'd do a root cause analysis afterward. I think communication is also important during incidents, so keeping stakeholders informed is key.",
    },
    {
        "role": "ai",
        "text": "How do you handle disagreements with teammates about technical decisions?",
    },
    {
        "role": "candidate",
        "text": "I try to understand their perspective first. Sometimes people have context I don't. I'd propose we write down the trade-offs of each approach and compare them against our project requirements. If we still disagree, I'd suggest building a small proof of concept for both approaches, or if time doesn't allow that, I'd escalate to the tech lead with a recommendation. I think it's important to separate the person from the idea so the discussion stays productive.",
    },
    {
        "role": "ai",
        "text": "Can you describe a time when you had to learn a new technology quickly to deliver a project?",
    },
    {
        "role": "candidate",
        "text": "I had to learn GraphQL in about a week for a project migration. I started with the official documentation and a couple of focused tutorials, then built a small prototype integrating it with our existing REST API. The key was focusing on just what I needed — queries, mutations, and schema design — rather than trying to learn everything. I also asked a senior engineer who had GraphQL experience to review my schema design early, which saved me from some mistakes. We delivered on time and the new API was significantly more efficient for our frontend team.",
    },
    {
        "role": "ai",
        "text": "If you had to choose between optimizing for performance or code maintainability, how would you decide?",
    },
    {
        "role": "candidate",
        "text": "It really depends on the context. I think maintainability is usually more important because code is read far more often than it's written, and premature optimization can introduce unnecessary complexity. But if performance is a genuine user-facing problem — like a slow page load affecting conversion rates — then we should address it. I'd measure first, identify the bottleneck, and optimize only the critical path. I'd also add comments explaining why the optimization exists so future developers don't accidentally remove it thinking it's unnecessary complexity.",
    },
]


# ---------------------------------------------------------------------------
# Pre-computed mock outputs for Phase A & B (when no LLM is available)
# ---------------------------------------------------------------------------

MOCK_PHASE_A_EVIDENCE = {
    "technical_depth": (
        "I typically use React hooks and the Context API for state management when the state is relatively simple and localized. "
        "For more complex applications with frequent state updates across many components, I prefer using Redux Toolkit because it provides a predictable state container with good devtools support. "
        "I'd use React DevTools Profiler to identify which components are re-rendering unnecessarily. Then I'd apply React.memo, useMemo, and useCallback. "
        "In one project, I reduced render count by 60% just by memoizing selectors."
    ),
    "problem_solving": (
        "I'd use a WebSocket-based approach for real-time delivery with Server-Sent Events as a fallback. "
        "On the backend, I'd set up a message queue using Kafka to handle the ingestion of notification events. "
        "For storage, I'd use a combination of Redis for active notifications and PostgreSQL for persistent history. "
        "I'd start by checking the monitoring dashboards and recent deployments. If there was a recent deploy, I'd consider a quick rollback."
    ),
    "communication": (
        "I try to understand their perspective first. Sometimes people have context I don't. "
        "I'd propose we write down the trade-offs of each approach and compare them against our project requirements. "
        "I think it's important to separate the person from the idea so the discussion stays productive. "
        "I think maintainability is usually more important because code is read far more often than it's written, and premature optimization can introduce unnecessary complexity."
    ),
}

MOCK_PHASE_B_RESULTS = {
    "technical_depth": {
        "score": 3,
        "anchor_matched": "excellent",
        "cited_quote": "I typically use React hooks and the Context API for state management... I prefer using Redux Toolkit because it provides a predictable state container with good devtools support... In one project, I reduced render count by 60% just by memoizing selectors.",
        "reasoning": "Candidate demonstrated deep expertise across multiple state management approaches, explained trade-offs between Context API and Redux, discussed optimization techniques with quantitative results, and showed mastery of advanced React patterns like memoization selectors.",
        "weight": 0.4,
        "dimension_name": "Technical Depth",
    },
    "problem_solving": {
        "score": 2,
        "anchor_matched": "proficient",
        "cited_quote": "I'd use a WebSocket-based approach for real-time delivery with Server-Sent Events as a fallback. On the backend, I'd set up a message queue using Kafka.",
        "reasoning": "Candidate decomposed the notification system problem into sub-problems (delivery, routing, storage) and proposed workable solutions with clear trade-offs. The incident response answer was systematic but could have explored more creative solutions.",
        "weight": 0.3,
        "dimension_name": "Problem Solving",
    },
    "communication": {
        "score": 2,
        "anchor_matched": "proficient",
        "cited_quote": "I try to understand their perspective first. Sometimes people have context I don't. I'd propose we write down the trade-offs of each approach.",
        "reasoning": "Candidate structures answers logically and provides concrete examples. Technical vocabulary is appropriate. The disagreement-resolution answer showed empathy and pragmatism, though some answers could have been more concise.",
        "weight": 0.3,
        "dimension_name": "Communication",
    },
}


# ===========================================================================
# LLM-BASED PHASES (when Ollama is available)
# ===========================================================================


async def _try_ollama_segmentation(
    transcript_text: str, dimensions: list
) -> Optional[dict]:
    """Attempt Phase A with a real LLM. Returns None on failure."""
    try:
        from langchain_ollama import ChatOllama
        from langchain_core.messages import HumanMessage

        llm = ChatOllama(
            model="gemma3:4b", temperature=0.1, base_url="http://localhost:11434"
        )
        dimension_list = "\n".join(
            f"- {d['dimension_id']}: {d['name']}" for d in dimensions
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
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = resp.content.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(raw)
    except Exception as e:
        print(f"  [WARN] Ollama segmentation failed: {e}")
        return None


async def _try_ollama_anchor_match(
    evidence_blocks: dict, dimensions: list
) -> Optional[dict]:
    """Attempt Phase B with a real LLM. Returns None on failure."""
    try:
        from langchain_ollama import ChatOllama
        from langchain_core.messages import HumanMessage

        llm = ChatOllama(
            model="gemma3:4b", temperature=0.1, base_url="http://localhost:11434"
        )
        results = {}
        for dim in dimensions:
            dim_id = dim["dimension_id"]
            evidence = evidence_blocks.get(dim_id, "No relevant content found.")
            anchors = dim.get("anchors", {})
            weight = float(dim.get("weight", 1.0 / len(dimensions)))

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
        return results
    except Exception as e:
        print(f"  [WARN] Ollama anchor matching failed: {e}")
        return None


# ===========================================================================
# OLLAMA AVAILABILITY CHECK
# ===========================================================================


def ollama_available() -> bool:
    """Check if Ollama is running at localhost:11434."""
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


# ===========================================================================
# PRETTY PRINTING
# ===========================================================================


def print_dimension_result(dim_id: str, result: dict):
    """Print a single dimension's evaluation in a readable format."""
    dim_name = result.get("dimension_name", dim_id)
    score = result.get("score", "?")
    anchor = result.get("anchor_matched", "?")
    weight = result.get("weight", 0.0)
    cited = result.get("cited_quote", "")
    reasoning = result.get("reasoning", "")

    # Map numeric score to percentage label
    score_labels = {1: "0% (Substandard)", 2: "50% (Proficient)", 3: "100% (Excellent)"}
    score_label = score_labels.get(score, f"{score} (?)")

    print(f"\n  Dimension: {dim_name} (weight {weight})")
    print(f"  Score: {score} → {score_label}")
    print(f"  Anchor Matched: {anchor}")
    if cited:
        # Truncate long quotes for readability
        cited_display = cited if len(cited) <= 200 else cited[:200] + "..."
        print(f'  Cited Quote: "{cited_display}"')
    else:
        print("  Cited Quote: (none)")
    if reasoning:
        print(f"  Reasoning: {reasoning}")
    else:
        print("  Reasoning: (none)")


def print_pipeline_results(
    evidence_blocks: dict,
    dimension_results: dict,
    overall_score_pct: int,
    overall_score: float,
    coverage_ratio: float,
    verdict: str,
    confidence: str,
    meets_criteria: bool,
):
    """Print the complete pipeline results."""
    print("\n" + "=" * 70)
    print("         JUDGE PIPELINE RESULTS")
    print("=" * 70)

    print("\n--- Phase A: Segmentation Evidence ---")
    for dim_id, evidence in evidence_blocks.items():
        dim_name = next(
            (d["name"] for d in MOCK_RUBRIC_DIMENSIONS if d["dimension_id"] == dim_id),
            dim_id,
        )
        truncated = evidence if len(evidence) <= 150 else evidence[:150] + "..."
        print(f"  [{dim_name}]: {truncated}")

    print("\n--- Phase B: Anchor Matching ---")
    for dim_id, result in dimension_results.items():
        print_dimension_result(dim_id, result)

    print("\n--- Phase C: Weighted Score ---")
    print(f"  Overall Score: {overall_score_pct}% (raw: {overall_score})")
    print(
        f"  Coverage Ratio: {coverage_ratio} ({int(coverage_ratio * len(MOCK_RUBRIC_DIMENSIONS))}/{len(MOCK_RUBRIC_DIMENSIONS)} dimensions proficient/excellent)"
    )

    print("\n--- Phase D: Verdict & Confidence ---")
    print(f"  Verdict: {verdict}")
    print(f"  Meets Criteria (>=60%): {meets_criteria}")
    print(f"  Confidence: {confidence}")

    print("\n" + "=" * 70)


# ===========================================================================
# VALIDATION
# ===========================================================================


def validate_explanations(dimension_results: dict, evidence_blocks: dict) -> list[str]:
    """
    Validate that explanations include cited quotes, reasoning,
    and that coverage ratio is correctly computed.
    Returns list of issues (empty = all good).
    """
    issues = []

    for dim_id, result in dimension_results.items():
        dim_name = result.get("dimension_name", dim_id)

        # 1. Check cited_quote is present and non-empty
        cited = result.get("cited_quote", "")
        if not cited:
            issues.append(f"FAIL: '{dim_name}' has no cited quote")
        else:
            # Verify quote appears in the evidence or transcript
            found_in_evidence = cited[:50] in (evidence_blocks.get(dim_id, ""))
            found_in_transcript = any(
                cited[:50] in turn["text"]
                for turn in MOCK_TRANSCRIPT
                if turn["role"] == "candidate"
            )
            if not found_in_evidence and not found_in_transcript:
                issues.append(
                    f"WARN: '{dim_name}' cited quote not found in evidence/transcript (may be paraphrased)"
                )

        # 2. Check reasoning is present and non-empty
        reasoning = result.get("reasoning", "")
        if not reasoning:
            issues.append(f"FAIL: '{dim_name}' has no reasoning text")

        # 3. Check score is valid (1, 2, or 3)
        score = result.get("score")
        if score not in (1, 2, 3):
            issues.append(f"FAIL: '{dim_name}' has invalid score: {score}")

        # 4. Check anchor_matched is valid
        anchor = result.get("anchor_matched")
        if anchor not in ("substandard", "proficient", "excellent"):
            issues.append(f"FAIL: '{dim_name}' has invalid anchor: {anchor}")

        # 5. Check anchor_matched is consistent with score
        score_anchor_map = {1: "substandard", 2: "proficient", 3: "excellent"}
        if score in score_anchor_map and anchor != score_anchor_map[score]:
            issues.append(
                f"FAIL: '{dim_name}' score={score} but anchor='{anchor}' (expected '{score_anchor_map[score]}')"
            )

    # 6. Verify no dimensions are scored "substandard" when candidate clearly answered well
    #    For Technical Depth, the candidate gave strong, detailed answers — should not be substandard
    td_result = dimension_results.get("technical_depth", {})
    if td_result.get("score") == 1:
        issues.append(
            "FAIL: 'Technical Depth' scored substandard despite candidate giving detailed, expert-level answers about React state management, performance optimization, and system design"
        )

    return issues


def validate_coverage_ratio(
    dimension_results: dict, coverage_ratio: float
) -> list[str]:
    """Verify coverage ratio matches what we'd compute independently."""
    issues = []
    expected_covered = sum(
        1
        for r in dimension_results.values()
        if r.get("anchor_matched") in ("proficient", "excellent")
    )
    expected_ratio = round(expected_covered / len(dimension_results), 3)
    if abs(coverage_ratio - expected_ratio) > 0.01:
        issues.append(
            f"FAIL: Coverage ratio mismatch: got {coverage_ratio}, expected {expected_ratio}"
        )
    return issues


# ===========================================================================
# MAIN
# ===========================================================================


async def main():
    use_ollama = ollama_available()
    transcript_text = _format_transcript(MOCK_TRANSCRIPT)

    print("=" * 70)
    print("         JUDGE PIPELINE TEST")
    print("=" * 70)
    print(f"\nTranscript: {len(MOCK_TRANSCRIPT)} turns")
    print(f"Dimensions: {len(MOCK_RUBRIC_DIMENSIONS)}")
    print(f"Ollama available: {use_ollama}")
    print(f"Mode: {'REAL LLM' if use_ollama else 'MOCK (pre-computed outputs)'}")

    # -------------------------------------------------------------------
    # Phase A: Segmentation
    # -------------------------------------------------------------------
    print("\n>>> Running Phase A: Segmentation...")
    if use_ollama:
        evidence_blocks = await _try_ollama_segmentation(
            transcript_text, MOCK_RUBRIC_DIMENSIONS
        )
        if evidence_blocks is None:
            print("  Falling back to mock evidence.")
            evidence_blocks = MOCK_PHASE_A_EVIDENCE
        else:
            print("  ✓ Ollama segmentation succeeded.")
    else:
        evidence_blocks = MOCK_PHASE_A_EVIDENCE
        print("  Using pre-computed mock evidence.")

    # -------------------------------------------------------------------
    # Phase B: Anchor Matching
    # -------------------------------------------------------------------
    print(">>> Running Phase B: Anchor Matching...")
    if use_ollama:
        dimension_results = await _try_ollama_anchor_match(
            evidence_blocks, MOCK_RUBRIC_DIMENSIONS
        )
        if dimension_results is None:
            print("  Falling back to mock results.")
            dimension_results = MOCK_PHASE_B_RESULTS
        else:
            print("  ✓ Ollama anchor matching succeeded.")
    else:
        dimension_results = MOCK_PHASE_B_RESULTS
        print("  Using pre-computed mock results.")

    # -------------------------------------------------------------------
    # Phase C: Weighted Score
    # -------------------------------------------------------------------
    print(">>> Running Phase C: Weighted Score...")
    overall_score_pct, overall_score, coverage_ratio = _phase_c_score(
        dimension_results, MOCK_RUBRIC_DIMENSIONS
    )
    print(f"  ✓ Score: {overall_score_pct}% (raw: {overall_score})")

    # -------------------------------------------------------------------
    # Phase D: Verdict & Confidence
    # -------------------------------------------------------------------
    print(">>> Running Phase D: Verdict & Confidence...")
    verdict = _auto_verdict(overall_score_pct)
    meets_criteria = overall_score_pct >= 60
    confidence = _confidence_from_results(dimension_results)
    print(f"  ✓ Verdict: {verdict}, Confidence: {confidence}")

    # -------------------------------------------------------------------
    # Print Full Results
    # -------------------------------------------------------------------
    print_pipeline_results(
        evidence_blocks=evidence_blocks,
        dimension_results=dimension_results,
        overall_score_pct=overall_score_pct,
        overall_score=overall_score,
        coverage_ratio=coverage_ratio,
        verdict=verdict,
        confidence=confidence,
        meets_criteria=meets_criteria,
    )

    # -------------------------------------------------------------------
    # Validation
    # -------------------------------------------------------------------
    print("\n--- Explanation Validation ---")
    explanation_issues = validate_explanations(dimension_results, evidence_blocks)
    coverage_issues = validate_coverage_ratio(dimension_results, float(coverage_ratio))
    all_issues = explanation_issues + coverage_issues

    if all_issues:
        print(f"\n  ❌ {len(all_issues)} issue(s) found:")
        for issue in all_issues:
            print(f"    - {issue}")
    else:
        print("\n  ✅ All validations passed:")
        print("    - Cited quotes present in all dimensions")
        print("    - Reasoning text present in all dimensions")
        print("    - Score/anchor consistency verified")
        print("    - No unjustified substandard scores")
        print("    - Coverage ratio correctly computed")

    # Final summary
    print("\n" + "=" * 70)
    print("         SUMMARY")
    print("=" * 70)
    print(f"  Overall Score : {overall_score_pct}%")
    print(f"  Verdict       : {verdict}")
    print(f"  Confidence    : {confidence}")
    print(f"  Meets Criteria: {meets_criteria}")
    print(f"  Coverage      : {coverage_ratio}")
    print(f"  Mode          : {'REAL LLM (Ollama)' if use_ollama else 'MOCK'}")
    print(f"  Issues        : {len(all_issues)}")
    print("=" * 70)

    return 0 if not all_issues else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
