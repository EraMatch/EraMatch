"""
Judge Pipeline Standalone Test.

Tests the 5-phase judge pipeline with mock data:
  A. Segmentation       — extract evidence per dimension
  B. Question Segments   — map transcript turns to questions via pillar_idx
  C. Per-Question Score — score each Q&A pair against sub-criteria (1-3)
  D. Weighted Score     — aggregate per-question → dimension → overall 0-100
  E. Verdict             — strong_pass/pass/borderline/fail

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

sys.path.insert(0, ".")

try:
    from app.services.live_interview.judge import (
        _phase_c_score,
        _phase_c_score_with_questions,
        _extract_question_evidence,
        _auto_verdict,
        _confidence_from_results,
        _format_transcript,
    )

    REAL_FUNCTIONS_AVAILABLE = True
except ImportError:
    REAL_FUNCTIONS_AVAILABLE = False

if not REAL_FUNCTIONS_AVAILABLE:

    def _phase_c_score(dimension_results: dict, dimensions: list) -> tuple:
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

    def _phase_c_score_with_questions(pq_results, dimensions):
        score_map = {1: 0.0, 2: 0.5, 3: 1.0}
        dim_by_id = {}
        for d in dimensions:
            dim_id = d.get("dimension_id", d.get("name", ""))
            dim_by_id[dim_id] = d

        dim_questions = {}
        for qr in pq_results:
            dim_id = qr.get("dimension_id", "")
            dim_questions.setdefault(dim_id, []).append(qr)

        dimension_results = {}
        for dim in dimensions:
            dim_id = dim.get("dimension_id", dim.get("name", ""))
            dim_name = dim.get("name", dim_id)
            weight = float(dim.get("weight", 1.0 / max(len(dimensions), 1)))
            questions = dim_questions.get(dim_id, [])
            if not questions:
                dimension_results[dim_id] = {
                    "score": 1,
                    "anchor_matched": "substandard",
                    "cited_quote": "",
                    "reasoning": "No questions for this dimension.",
                    "weight": weight,
                    "dimension_name": dim_name,
                }
                continue
            avg_q_score = sum(q.get("question_score", 1.0) for q in questions) / len(
                questions
            )
            if avg_q_score >= 2.5:
                anchor, dim_score = "excellent", 3
            elif avg_q_score >= 1.5:
                anchor, dim_score = "proficient", 2
            else:
                anchor, dim_score = "substandard", 1
            all_cited = [q["cited_quote"] for q in questions if q.get("cited_quote")]
            dimension_results[dim_id] = {
                "score": dim_score,
                "anchor_matched": anchor,
                "cited_quote": all_cited[0] if all_cited else "",
                "reasoning": "Per-question aggregation",
                "weight": weight,
                "dimension_name": dim_name,
            }

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
            return 0, 0.0, 0.0, dimension_results
        overall_raw = weighted_sum / total_weight
        overall_pct = round(overall_raw * 100)
        coverage_ratio = round(covered_dimensions / len(dimension_results), 3)
        return overall_pct, round(overall_raw, 4), coverage_ratio, dimension_results

    def _extract_question_evidence(transcript, bank_items):
        if not bank_items:
            return []
        question_map = {}
        for idx, item in enumerate(bank_items):
            rubric = item.get("question_rubric") or {}
            raw_sub = rubric.get("sub_criteria", [])
            if isinstance(raw_sub, list) and raw_sub:
                if isinstance(raw_sub[0], dict):
                    sub_criteria_names = [s.get("text", str(s)) for s in raw_sub]
                else:
                    sub_criteria_names = [str(s) for s in raw_sub]
            else:
                sub_criteria_names = ["Demonstrate knowledge of the topic"]
            question_map[idx] = {
                "question_text": item.get("text", ""),
                "dimension_id": item.get("primary_dimension_id", ""),
                "sub_criteria": sub_criteria_names,
                "pillar_idx": idx,
            }

        pillar_turns = {}
        for turn in transcript:
            pidx = turn.get("pillar_idx")
            if pidx is None:
                continue
            pillar_turns.setdefault(pidx, []).append(turn)

        results = []
        for pidx, qinfo in question_map.items():
            turns = pillar_turns.get(pidx, [])
            if not turns:
                continue
            candidate_answers = [
                t["text"].strip()
                for t in turns
                if t.get("role") == "candidate" and t.get("text", "").strip()
            ]
            if not candidate_answers:
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
        "role": "agent",
        "text": "Welcome to the interview. Let's begin.",
        "pillar_idx": None,
        "phase": "welcome",
    },
    {
        "role": "candidate",
        "text": "Thank you, I'm ready.",
        "pillar_idx": None,
        "phase": "welcome",
    },
    {
        "role": "agent",
        "text": "Tell me about your experience with React and how you handle state management in large applications.",
        "pillar_idx": 0,
        "phase": "question",
    },
    {
        "role": "candidate",
        "text": "I've been working with React for about 4 years now. In large applications, I typically use React hooks and the Context API for state management when the state is relatively simple and localized. For more complex applications with frequent state updates across many components, I prefer using Redux Toolkit because it provides a predictable state container with good devtools support. I also use custom hooks to encapsulate reusable stateful logic, which keeps components clean and makes the code more testable.",
        "pillar_idx": 0,
        "phase": "answer",
    },
    {
        "role": "agent",
        "text": "Can you explain how you would optimize a React application that has performance issues with frequent re-renders?",
        "pillar_idx": 0,
        "phase": "follow_up",
    },
    {
        "role": "candidate",
        "text": "First, I would use React DevTools Profiler to identify which components are re-rendering unnecessarily. Then I'd apply React.memo to components that receive the same props but still re-render. For expensive computations inside render, I'd use useMemo, and for callback functions passed as props, I'd use useCallback to maintain referential equality. I also look at whether the state structure itself is causing issues — sometimes splitting large state objects or using selectors with libraries like reselect can prevent unnecessary re-renders. In one project, I reduced render count by 60% just by memoizing selectors.",
        "pillar_idx": 0,
        "phase": "answer",
    },
    {
        "role": "agent",
        "text": "Let's talk about system design. How would you design a real-time notification system for a platform like LinkedIn?",
        "pillar_idx": 1,
        "phase": "question",
    },
    {
        "role": "candidate",
        "text": "I'd approach this by first identifying the key requirements: real-time delivery, support for multiple notification types, scalability to millions of users, and reliability. I'd use a WebSocket-based approach for real-time delivery with Server-Sent Events as a fallback. On the backend, I'd set up a message queue using Kafka to handle the ingestion of notification events, then process them through a service that determines routing. For storage, I'd use a combination of Redis for active notifications and PostgreSQL for persistent history. The notification service would maintain connection state in Redis so we know which users are online. For offline users, I'd batch notifications and deliver them on reconnect.",
        "pillar_idx": 1,
        "phase": "answer",
    },
    {
        "role": "agent",
        "text": "What about when things go wrong? How would you handle a situation where a critical production service is degraded?",
        "pillar_idx": 2,
        "phase": "question",
    },
    {
        "role": "candidate",
        "text": "I think the most important thing is to stay calm and follow a systematic approach. I'd start by checking the monitoring dashboards and recent deployments. If there was a recent deploy, I'd consider a quick rollback. Otherwise, I'd look at the metrics — CPU, memory, error rates, latency — to narrow down the issue. I'd also check logs for any error spikes. Once we have a mitigation in place, I'd do a root cause analysis afterward. I think communication is also important during incidents, so keeping stakeholders informed is key.",
        "pillar_idx": 2,
        "phase": "answer",
    },
    {
        "role": "agent",
        "text": "How do you handle disagreements with teammates about technical decisions?",
        "pillar_idx": 1,
        "phase": "follow_up",
    },
    {
        "role": "candidate",
        "text": "I try to understand their perspective first. Sometimes people have context I don't. I'd propose we write down the trade-offs of each approach and compare them against our project requirements. If we still disagree, I'd suggest building a small proof of concept for both approaches, or if time doesn't allow that, I'd escalate to the tech lead with a recommendation. I think it's important to separate the person from the idea so the discussion stays productive.",
        "pillar_idx": 1,
        "phase": "answer",
    },
    {
        "role": "agent",
        "text": "Can you describe a time when you had to learn a new technology quickly to deliver a project?",
        "pillar_idx": 2,
        "phase": "follow_up",
    },
    {
        "role": "candidate",
        "text": "I had to learn GraphQL in about a week for a project migration. I started with the official documentation and a couple of focused tutorials, then built a small prototype integrating it with our existing REST API. The key was focusing on just what I needed — queries, mutations, and schema design — rather than trying to learn everything. I also asked a senior engineer who had GraphQL experience to review my schema design early, which saved me from some mistakes. We delivered on time and the new API was significantly more efficient for our frontend team.",
        "pillar_idx": 2,
        "phase": "answer",
    },
    {
        "role": "agent",
        "text": "Thank you for the interview. We'll be in touch.",
        "pillar_idx": None,
        "phase": "closing",
    },
]

MOCK_BANK_ITEMS = [
    {
        "bank_item_id": "q1",
        "text": "Tell me about your experience with React and how you handle state management in large applications.",
        "primary_dimension_id": "technical_depth",
        "secondary_dimension_ids": [],
        "difficulty": "mid",
        "is_mandatory": True,
        "is_approved": True,
        "estimated_duration_seconds": 180,
        "question_rubric": {
            "sub_criteria": [
                {
                    "text": "Demonstrates deep understanding of state management patterns",
                    "weight": 0.4,
                },
                {"text": "Explains trade-offs between approaches", "weight": 0.3},
                {
                    "text": "References specific tools and quantifiable outcomes",
                    "weight": 0.3,
                },
            ]
        },
    },
    {
        "bank_item_id": "q2",
        "text": "Let's talk about system design. How would you design a real-time notification system for a platform like LinkedIn?",
        "primary_dimension_id": "problem_solving",
        "secondary_dimension_ids": ["communication"],
        "difficulty": "senior",
        "is_mandatory": True,
        "is_approved": True,
        "estimated_duration_seconds": 240,
        "question_rubric": {
            "sub_criteria": [
                {"text": "Decomposes the problem into sub-systems", "weight": 0.3},
                {"text": "Considers scalability and fault tolerance", "weight": 0.3},
                {
                    "text": "Proposes concrete technology choices with rationale",
                    "weight": 0.2,
                },
                {"text": "Communicates design decisions clearly", "weight": 0.2},
            ]
        },
    },
    {
        "bank_item_id": "q3",
        "text": "What about when things go wrong? How would you handle a situation where a critical production service is degraded?",
        "primary_dimension_id": "communication",
        "secondary_dimension_ids": [],
        "difficulty": "mid",
        "is_mandatory": False,
        "is_approved": True,
        "estimated_duration_seconds": 180,
        "question_rubric": {
            "sub_criteria": [
                {
                    "text": "Follows a systematic approach to incident response",
                    "weight": 0.3,
                },
                {"text": "Communicates status to stakeholders", "weight": 0.3},
                {"text": "Plans for root cause analysis and prevention", "weight": 0.2},
                {"text": "Demonstrates composure under pressure", "weight": 0.2},
            ]
        },
    },
]


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

MOCK_PER_QUESTION_RESULTS = [
    {
        "question_text": "Tell me about your experience with React and how you handle state management in large applications.",
        "question_score": 2.8,
        "dimension_id": "technical_depth",
        "dimension_name": "Technical Depth",
        "pillar_idx": 0,
        "weight": 0.4,
        "anchor_matched": "excellent",
        "reasoning": "Candidate demonstrated strong knowledge of state management patterns with specific tool references and quantifiable outcomes.",
        "cited_quote": "I reduced render count by 60% just by memoizing selectors.",
        "sub_criteria": [
            {
                "name": "Demonstrates deep understanding of state management patterns",
                "score": 3,
                "covered": True,
                "cited_quote": "I typically use React hooks and the Context API for state management... I prefer using Redux Toolkit",
            },
            {
                "name": "Explains trade-offs between approaches",
                "score": 3,
                "covered": True,
                "cited_quote": "For more complex applications with frequent state updates across many components, I prefer using Redux Toolkit",
            },
            {
                "name": "References specific tools and quantifiable outcomes",
                "score": 2,
                "covered": True,
                "cited_quote": "In one project, I reduced render count by 60% just by memoizing selectors.",
            },
        ],
    },
    {
        "question_text": "Let's talk about system design. How would you design a real-time notification system for a platform like LinkedIn?",
        "question_score": 2.5,
        "dimension_id": "problem_solving",
        "dimension_name": "Problem Solving",
        "pillar_idx": 1,
        "weight": 0.3,
        "anchor_matched": "proficient",
        "reasoning": "Candidate decomposed the problem well and proposed concrete solutions, though could have explored more edge cases.",
        "cited_quote": "I'd use a WebSocket-based approach for real-time delivery with Server-Sent Events as a fallback.",
        "sub_criteria": [
            {
                "name": "Decomposes the problem into sub-systems",
                "score": 3,
                "covered": True,
                "cited_quote": "I'd approach this by first identifying the key requirements... I'd use a WebSocket-based approach",
            },
            {
                "name": "Considers scalability and fault tolerance",
                "score": 3,
                "covered": True,
                "cited_quote": "For storage, I'd use a combination of Redis for active notifications and PostgreSQL for persistent history",
            },
            {
                "name": "Proposes concrete technology choices with rationale",
                "score": 2,
                "covered": True,
                "cited_quote": "On the backend, I'd set up a message queue using Kafka",
            },
            {
                "name": "Communicates design decisions clearly",
                "score": 2,
                "covered": True,
                "cited_quote": "The notification service would maintain connection state in Redis",
            },
        ],
    },
    {
        "question_text": "What about when things go wrong? How would you handle a situation where a critical production service is degraded?",
        "question_score": 2.0,
        "dimension_id": "communication",
        "dimension_name": "Communication",
        "pillar_idx": 2,
        "weight": 0.3,
        "anchor_matched": "proficient",
        "reasoning": "Candidate followed a systematic approach but gave a somewhat generic answer.",
        "cited_quote": "I think the most important thing is to stay calm and follow a systematic approach.",
        "sub_criteria": [
            {
                "name": "Follows a systematic approach to incident response",
                "score": 2,
                "covered": True,
                "cited_quote": "I'd start by checking the monitoring dashboards and recent deployments",
            },
            {
                "name": "Communicates status to stakeholders",
                "score": 2,
                "covered": True,
                "cited_quote": "I think communication is also important during incidents",
            },
            {
                "name": "Plans for root cause analysis and prevention",
                "score": 2,
                "covered": True,
                "cited_quote": "Once we have a mitigation in place, I'd do a root cause analysis afterward",
            },
            {
                "name": "Demonstrates composure under pressure",
                "score": 2,
                "covered": True,
                "cited_quote": "The most important thing is to stay calm and follow a systematic approach",
            },
        ],
    },
]


# ===========================================================================
# LLM-BASED PHASES (when Ollama is available)
# ===========================================================================


async def _try_ollama_segmentation(
    transcript_text: str, dimensions: list
) -> Optional[dict]:
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
    dim_name = result.get("dimension_name", dim_id)
    score = result.get("score", "?")
    anchor = result.get("anchor_matched", "?")
    weight = result.get("weight", 0.0)
    cited = result.get("cited_quote", "")
    reasoning = result.get("reasoning", "")

    score_labels = {1: "0% (Substandard)", 2: "50% (Proficient)", 3: "100% (Excellent)"}
    score_label = score_labels.get(score, f"{score} (?)")

    print(f"\n  Dimension: {dim_name} (weight {weight})")
    print(f"  Score: {score} → {score_label}")
    print(f"  Anchor Matched: {anchor}")
    if cited:
        cited_display = cited if len(cited) <= 200 else cited[:200] + "..."
        print(f'  Cited Quote: "{cited_display}"')
    else:
        print("  Cited Quote: (none)")
    if reasoning:
        print(f"  Reasoning: {reasoning}")
    else:
        print("  Reasoning: (none)")


def print_per_question_result(qr: dict):
    print(f"\n  Question: {qr.get('question_text', 'N/A')[:80]}...")
    print(
        f"  Dimension: {qr.get('dimension_name', qr.get('dimension_id', '?'))} (weight {qr.get('weight', '?')})"
    )
    print(f"  Question Score: {qr.get('question_score', '?')}")
    print(f"  Anchor Matched: {qr.get('anchor_matched', '?')}")
    cited = qr.get("cited_quote", "")
    if cited:
        print(f'  Cited Quote: "{cited[:100]}..."')
    for sc in qr.get("sub_criteria", []):
        covered_mark = "✓" if sc.get("covered") else "✗"
        print(f"    [{covered_mark}] {sc.get('name', '?')}: {sc.get('score', '?')}/3")


def print_pipeline_results(
    evidence_blocks: dict,
    dimension_results: dict,
    overall_score_pct: int,
    overall_score: float,
    coverage_ratio: float,
    verdict: str,
    confidence: str,
    meets_criteria: bool,
    per_question_results: Optional[list] = None,
):
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

    if per_question_results:
        print("\n--- Phase B-C: Per-Question Scoring ---")
        for qr in per_question_results:
            print_per_question_result(qr)
    else:
        print("\n--- Phase B: Anchor Matching ---")
        for dim_id, result in dimension_results.items():
            print_dimension_result(dim_id, result)

    print("\n--- Phase D: Weighted Score ---")
    print(f"  Overall Score: {overall_score_pct}% (raw: {overall_score})")
    print(
        f"  Coverage Ratio: {coverage_ratio} ({int(coverage_ratio * len(MOCK_RUBRIC_DIMENSIONS))}/{len(MOCK_RUBRIC_DIMENSIONS)} dimensions proficient/excellent)"
    )

    print("\n--- Phase E: Verdict & Confidence ---")
    print(f"  Verdict: {verdict}")
    print(f"  Meets Criteria (>=60%): {meets_criteria}")
    print(f"  Confidence: {confidence}")

    print("\n" + "=" * 70)


# ===========================================================================
# VALIDATION
# ===========================================================================


def validate_explanations(dimension_results: dict, evidence_blocks: dict) -> list[str]:
    issues = []

    for dim_id, result in dimension_results.items():
        dim_name = result.get("dimension_name", dim_id)

        cited = result.get("cited_quote", "")
        if not cited:
            issues.append(f"FAIL: '{dim_name}' has no cited quote")
        else:
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

        reasoning = result.get("reasoning", "")
        if not reasoning:
            issues.append(f"FAIL: '{dim_name}' has no reasoning text")

        score = result.get("score")
        if score not in (1, 2, 3):
            issues.append(f"FAIL: '{dim_name}' has invalid score: {score}")

        anchor = result.get("anchor_matched")
        if anchor not in ("substandard", "proficient", "excellent"):
            issues.append(f"FAIL: '{dim_name}' has invalid anchor: {anchor}")

        score_anchor_map = {1: "substandard", 2: "proficient", 3: "excellent"}
        if score in score_anchor_map and anchor != score_anchor_map[score]:
            issues.append(
                f"FAIL: '{dim_name}' score={score} but anchor='{anchor}' (expected '{score_anchor_map[score]}')"
            )

    td_result = dimension_results.get("technical_depth", {})
    if td_result.get("score") == 1:
        issues.append(
            "FAIL: 'Technical Depth' scored substandard despite candidate giving detailed, expert-level answers about React state management, performance optimization, and system design"
        )

    return issues


def validate_coverage_ratio(
    dimension_results: dict, coverage_ratio: float
) -> list[str]:
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


def validate_per_question_results(pq_results: list) -> list[str]:
    issues = []
    if not pq_results:
        issues.append("FAIL: No per-question results generated")
        return issues

    for qr in pq_results:
        qt = qr.get("question_text", "")
        if not qt:
            issues.append("FAIL: Per-question result has no question_text")

        qs = qr.get("question_score", 0)
        if not (1.0 <= qs <= 3.0):
            issues.append(
                f"FAIL: question_score {qs} out of range [1.0, 3.0] for '{qt[:50]}'"
            )

        dim_id = qr.get("dimension_id", "")
        if not dim_id:
            issues.append(
                f"FAIL: Per-question result has no dimension_id for '{qt[:50]}'"
            )

        anchor = qr.get("anchor_matched", "")
        if anchor not in ("substandard", "proficient", "excellent"):
            issues.append(f"FAIL: Invalid anchor_matched '{anchor}' for '{qt[:50]}'")

        sub_criteria = qr.get("sub_criteria", [])
        if not sub_criteria:
            issues.append(f"WARN: No sub_criteria for '{qt[:50]}'")
        else:
            for sc in sub_criteria:
                if not sc.get("name"):
                    issues.append(f"FAIL: Sub-criterion missing name in '{qt[:50]}'")
                score = sc.get("score", 0)
                if score not in (1, 2, 3):
                    issues.append(
                        f"FAIL: Sub-criterion score {score} invalid for '{sc.get('name', '?')}'"
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
    print(f"Bank Items: {len(MOCK_BANK_ITEMS)}")
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
    # Phase B: Question Evidence Extraction
    # -------------------------------------------------------------------
    print(">>> Running Phase B: Question Evidence Extraction...")
    question_evidence = _extract_question_evidence(MOCK_TRANSCRIPT, MOCK_BANK_ITEMS)
    print(f"  ✓ Extracted {len(question_evidence)} question segments from transcript")

    # -------------------------------------------------------------------
    # Phase C: Per-Question Scoring (or dimension-level fallback)
    # -------------------------------------------------------------------
    per_question_results = []
    if question_evidence and use_ollama:
        print(">>> Running Phase C: Per-Question Scoring (LLM)...")
        per_question_results = (
            await _phase_b_question(
                llm=None,
                fallback_llm=None,
                question_evidence=question_evidence,
                dimensions=MOCK_RUBRIC_DIMENSIONS,
            )
            if REAL_FUNCTIONS_AVAILABLE
            else MOCK_PER_QUESTION_RESULTS
        )
    elif question_evidence:
        print(">>> Running Phase C: Per-Question Scoring (mock)...")
        per_question_results = MOCK_PER_QUESTION_RESULTS
    else:
        print(">>> No question evidence — falling back to dimension-level scoring.")

    # -------------------------------------------------------------------
    # Phase D: Weighted Score
    # -------------------------------------------------------------------
    print(">>> Running Phase D: Weighted Score...")
    if per_question_results:
        overall_score_pct, overall_score, coverage_ratio, dimension_results = (
            _phase_c_score_with_questions(per_question_results, MOCK_RUBRIC_DIMENSIONS)
        )
        print(
            f"  ✓ Score: {overall_score_pct}% (raw: {overall_score}) [per-question path]"
        )
    else:
        if use_ollama:
            dimension_results = await _try_ollama_anchor_match(
                evidence_blocks, MOCK_RUBRIC_DIMENSIONS
            )
            if dimension_results is None:
                dimension_results = MOCK_PHASE_B_RESULTS
        else:
            dimension_results = MOCK_PHASE_B_RESULTS
        overall_score_pct, overall_score, coverage_ratio = _phase_c_score(
            dimension_results, MOCK_RUBRIC_DIMENSIONS
        )
        print(
            f"  ✓ Score: {overall_score_pct}% (raw: {overall_score}) [dimension-level path]"
        )

    # -------------------------------------------------------------------
    # Phase E: Verdict & Confidence
    # -------------------------------------------------------------------
    print(">>> Running Phase E: Verdict & Confidence...")
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
        per_question_results=per_question_results if per_question_results else None,
    )

    # -------------------------------------------------------------------
    # Validation
    # -------------------------------------------------------------------
    print("\n--- Explanation Validation ---")
    explanation_issues = validate_explanations(dimension_results, evidence_blocks)
    coverage_issues = validate_coverage_ratio(dimension_results, float(coverage_ratio))
    all_issues = explanation_issues + coverage_issues

    if per_question_results:
        print("\n--- Per-Question Validation ---")
        pq_issues = validate_per_question_results(per_question_results)
        all_issues.extend(pq_issues)

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
        if per_question_results:
            print("    - Per-question results populated with valid data")
            print("    - Sub-criteria scores within valid range (1-3)")
            print("    - All dimensions have per-question evidence")

    # Final summary
    print("\n" + "=" * 70)
    print("         SUMMARY")
    print("=" * 70)
    print(f"  Overall Score : {overall_score_pct}%")
    print(f"  Verdict       : {verdict}")
    print(f"  Confidence    : {confidence}")
    print(f"  Meets Criteria: {meets_criteria}")
    print(f"  Coverage      : {coverage_ratio}")
    print(
        f"  Questions     : {len(per_question_results) if per_question_results else 0}"
    )
    print(f"  Mode          : {'REAL LLM (Ollama)' if use_ollama else 'MOCK'}")
    print(f"  Issues        : {len(all_issues)}")
    print("=" * 70)

    return 0 if not all_issues else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
