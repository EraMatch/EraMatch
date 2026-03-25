"""
GitHub analysis router.

Runs repository/profile analysis and produces profile-targeted interview questions.
Uses stage-specific Ollama models (filter/map/audit/synthesis) aligned with the
original GitHub Analysis workflow.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from services.ollama import chat_completion

router = APIRouter()
logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts" / "github_analysis"

FILTER_MODEL = settings.OLLAMA_GH_FILTER_MODEL
MAP_MODEL = settings.OLLAMA_GH_MAP_MODEL
AUDIT_MODEL = settings.OLLAMA_GH_AUDIT_MODEL
SYNTH_MODEL = settings.OLLAMA_GH_SYNTH_MODEL

GITHUB_API = "https://api.github.com"


def _http_timeout() -> float:
    return float(settings.GH_ANALYSIS_HTTP_TIMEOUT_SECONDS)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _safe_num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _time_ago(event_time: datetime, now: datetime) -> str:
    diff = now - event_time
    days = max(0, diff.days)
    if days >= 7:
        weeks = max(1, days // 7)
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"
    if days > 0:
        return f"{days} day{'s' if days != 1 else ''} ago"
    hours = max(0, int(diff.total_seconds() // 3600))
    if hours > 0:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    mins = max(1, int(diff.total_seconds() // 60))
    return f"{mins} min{'s' if mins != 1 else ''} ago"


def _event_to_activity(event: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    event_type = event.get("type") or ""
    payload = event.get("payload") or {}
    repo_name = (event.get("repo") or {}).get("name") or "unknown-repo"
    created_at = event.get("created_at")
    if not created_at:
        return None
    try:
        event_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except Exception:
        return None

    base = {
        "type": event_type,
        "repo": repo_name,
        "timestamp": created_at,
        "time_ago": _time_ago(event_time, now),
    }

    if event_type == "PullRequestEvent":
        pr = payload.get("pull_request") or {}
        action = payload.get("action") or "updated"
        number = pr.get("number") or ""
        title = (pr.get("title") or "").strip()
        return {
            **base,
            "action": action,
            "title": f"{action.title()} pull request #{number}".strip(),
            "description": title,
        }

    if event_type == "PullRequestReviewEvent":
        pr = payload.get("pull_request") or {}
        state = payload.get("review", {}).get("state") or "reviewed"
        number = pr.get("number") or ""
        title = (pr.get("title") or "").strip()
        return {
            **base,
            "action": "reviewed",
            "title": f"Reviewed PR #{number} ({state})".strip(),
            "description": title,
        }

    if event_type == "IssuesEvent":
        issue = payload.get("issue") or {}
        action = payload.get("action") or "updated"
        number = issue.get("number") or ""
        title = (issue.get("title") or "").strip()
        return {
            **base,
            "action": action,
            "title": f"{action.title()} issue #{number}".strip(),
            "description": title,
        }

    if event_type == "CreateEvent":
        ref_type = payload.get("ref_type") or "resource"
        ref = payload.get("ref") or ""
        label = f"Created {ref_type} {ref}".strip()
        return {
            **base,
            "action": "created",
            "title": label,
            "description": payload.get("description") or "",
        }

    if event_type == "PushEvent":
        commits = payload.get("commits") or []
        first_msg = ""
        if commits and isinstance(commits[0], dict):
            first_msg = str(commits[0].get("message") or "").strip().split("\n")[0]
        commit_count = int(payload.get("size") or len(commits) or 1)
        return {
            **base,
            "action": "pushed",
            "title": f"Pushed {commit_count} commit{'s' if commit_count != 1 else ''}",
            "description": first_msg,
        }

    return None


def _compute_quality_indicators(
    synthesis_payload: dict[str, Any],
    contribution_stats: dict[str, Any],
    audit_items: list[dict[str, Any]],
    total_stars: int,
    followers: int,
) -> dict[str, Any]:
    assessment = (synthesis_payload or {}).get("assessment") or {}
    correctness = _clamp(_safe_num(assessment.get("correctness"), 50.0), 0, 100)
    sustainability = _clamp(_safe_num(assessment.get("sustainability"), 50.0), 0, 100)
    knowledge = _clamp(_safe_num(assessment.get("knowledge"), 50.0), 0, 100)

    review_count = int(((contribution_stats.get("breakdown") or {}).get("review") or 0))
    contributions = int(contribution_stats.get("contributions_last_year") or 0)
    avg_review_time = contribution_stats.get("avg_pr_review_time_hours")

    doc_hits = 0
    test_hits = 0
    for item in audit_items or []:
        blob = (
            f"{item.get('title', '')} {item.get('description', '')} "
            f"{item.get('file_path', '')} {item.get('evidence_snippet', '')}"
        ).lower()
        if any(term in blob for term in ["doc", "readme", "comment"]):
            doc_hits += 1
        if any(term in blob for term in ["test", "pytest", "spec", "coverage"]):
            test_hits += 1

    documentation_pct = int(round(_clamp(0.7 * sustainability + 0.3 * knowledge + min(doc_hits, 10), 0, 100)))
    test_coverage_pct = int(round(_clamp(0.65 * correctness + 0.15 * knowledge + min(test_hits * 2, 15), 0, 100)))

    review_activity_score = _clamp(review_count * 10, 0, 100)
    review_quality_pct = _clamp(0.45 * knowledge + 0.25 * sustainability + 0.30 * review_activity_score, 0, 100)
    review_quality_5 = round(review_quality_pct / 20.0, 1)

    activity_score = _clamp(contributions * 1.4, 0, 100)
    community_score = _clamp((followers * 1.8) + (total_stars * 0.8), 0, 100)
    quality_score = _clamp((correctness + sustainability + knowledge) / 3.0, 0, 100)
    overall_github_score = int(round(_clamp(0.45 * quality_score + 0.35 * activity_score + 0.20 * community_score, 0, 100)))

    review_speed_note = "Insufficient PR review events"
    if isinstance(avg_review_time, (int, float)):
        if avg_review_time <= 4:
            review_speed_note = "Faster than ~85% of developers"
        elif avg_review_time <= 8:
            review_speed_note = "Faster than ~70% of developers"
        elif avg_review_time <= 16:
            review_speed_note = "Around average review turnaround"
        else:
            review_speed_note = "Slower than average review turnaround"

    return {
        "avg_pr_review_time_hours": avg_review_time,
        "avg_pr_review_time_note": review_speed_note,
        "code_documentation_pct": documentation_pct,
        "test_coverage_pct": test_coverage_pct,
        "code_review_quality_score": review_quality_5,
        "overall_github_score": overall_github_score,
        "inputs": {
            "quality_score": round(quality_score, 1),
            "activity_score": round(activity_score, 1),
            "community_score": round(community_score, 1),
        },
    }


class GitHubAnalysisRequest(BaseModel):
    github_url: str
    jd_text: str = ""
    github_token: str = ""


class GitHubAnalysisResponse(BaseModel):
    profile: dict
    stats: dict
    top_repos: list[dict]
    languages: list[dict]
    analysis_data: dict


class RepoSummary(BaseModel):
    name: str
    description: str = ""
    language: str = "Unknown"
    topics: list[str] = []
    size: int = 0
    stars: int = 0
    forks: int = 0
    url: str = ""
    updated_at: str = ""
    default_branch: str = "main"


def _load_prompt(name: str, **kwargs: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    try:
        template = path.read_text(encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prompt file missing: {path}") from exc
    rendered = template
    for key, value in kwargs.items():
        rendered = rendered.replace(f"{{{key}}}", value)
    return rendered


def _extract_json(payload: str) -> Any:
    content = (payload or "").strip()
    if content.startswith("```"):
        content = content.replace("```json", "").replace("```", "").strip()

    # first try direct parse
    try:
        return json.loads(content)
    except Exception:
        pass

    # fallback object extraction
    obj_start = content.find("{")
    obj_end = content.rfind("}") + 1
    if obj_start != -1 and obj_end > obj_start:
        try:
            return json.loads(content[obj_start:obj_end])
        except Exception:
            pass

    arr_start = content.find("[")
    arr_end = content.rfind("]") + 1
    if arr_start != -1 and arr_end > arr_start:
        return json.loads(content[arr_start:arr_end])

    raise ValueError("No JSON object/array in model output")


def _parse_github_username(github_url: str) -> str:
    url = (github_url or "").strip().rstrip("/")
    if not url:
        raise HTTPException(status_code=422, detail="github_url is required")

    parts = [p for p in url.split("/") if p]
    if "github.com" in parts:
        idx = parts.index("github.com")
        if len(parts) <= idx + 1:
            raise HTTPException(status_code=422, detail="Invalid GitHub URL")
        return parts[idx + 1]

    # allow passing username directly
    if len(parts) == 1 and " " not in parts[0]:
        return parts[0]

    raise HTTPException(status_code=422, detail="Invalid GitHub URL or username")


async def _fetch_profile(username: str, token: str = "") -> dict:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        resp = await client.get(f"{GITHUB_API}/users/{username}", headers=headers)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"GitHub profile fetch failed: {resp.status_code}")
    return resp.json()


async def _fetch_repos(username: str, token: str = "") -> list[RepoSummary]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        resp = await client.get(f"{GITHUB_API}/users/{username}/repos?sort=updated&per_page=100", headers=headers)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"GitHub repos fetch failed: {resp.status_code}")

    repos: list[RepoSummary] = []
    for item in resp.json():
        if item.get("fork"):
            continue
        repos.append(
            RepoSummary(
                name=item.get("name", ""),
                description=item.get("description") or "",
                language=item.get("language") or "Unknown",
                topics=item.get("topics") or [],
                size=int(item.get("size") or 0),
                stars=int(item.get("stargazers_count") or 0),
                forks=int(item.get("forks_count") or 0),
                url=item.get("html_url") or "",
                updated_at=item.get("updated_at") or "",
                default_branch=item.get("default_branch") or "main",
            )
        )
    return repos


def _extract_target_repo_names(pillar_report: Any) -> list[str]:
    target_names: list[str] = []
    if not isinstance(pillar_report, dict):
        return target_names

    pillars = pillar_report.get("pillars") or []
    for pillar in pillars:
        if not isinstance(pillar, dict):
            continue
        if not bool(pillar.get("is_satisfied")):
            continue
        top_repos = pillar.get("top_repos") or []
        for repo_name in top_repos:
            if isinstance(repo_name, str) and repo_name.strip():
                target_names.append(repo_name.strip())
    return list(dict.fromkeys(target_names))


def _rank_repos_by_heuristics(
    repos: list[RepoSummary],
    jd_text: str,
    target_repos: list[str] | None = None,
) -> list[RepoSummary]:
    jd_lower = (jd_text or "").lower()
    boosted_names = {name.lower() for name in (target_repos or [])}

    def score_repo(repo: RepoSummary) -> int:
        score = 0
        target_lang_match = False

        if repo.language and repo.language.lower() in jd_lower:
            score += 30
            target_lang_match = True

        keywords = list(repo.topics)
        keywords.extend(repo.name.replace("-", " ").replace("_", " ").split())
        for kw in keywords:
            if len(kw) > 2 and kw.lower() in jd_lower:
                score += 20
                break

        if repo.size > 500:
            score += 15
        elif repo.size > 50:
            score += 5

        if "notebook" in jd_lower or "data" in jd_lower:
            joined = f"{repo.name} {' '.join(repo.topics)}".lower()
            if any(term in joined for term in ["notebook", "jupyter", "analysis", "rag"]):
                score += 20

        if repo.name.lower() in boosted_names and score > 10:
            score += 40

        if repo.name.lower() not in boosted_names and target_lang_match and repo.size > 1000:
            score += 20

        return score

    return sorted(repos, key=score_repo, reverse=True)


async def _fetch_readme_content(owner: str, repo: str, token: str = "") -> str:
    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/readme", headers=headers)

    if resp.status_code >= 400:
        return ""
    return (resp.text or "")[:4000]


async def _evaluate_repo_relevance(
    username: str,
    repo: RepoSummary,
    jd_text: str,
    github_token: str,
) -> dict[str, Any]:
    try:
        files = await _fetch_repo_tree(username, repo.name, repo.default_branch, github_token)
        readme = await _fetch_readme_content(username, repo.name, github_token)
        relevance_prompt = _load_prompt(
            "relevance",
            jd=(jd_text or "")[:2000],
            readme_content=(readme or repo.description or "")[:2000],
            file_list="\n".join(files[: settings.GH_ANALYSIS_FILE_LIST_FOR_RELEVANCE]),
        )
        relevance = await _llm_json(relevance_prompt, FILTER_MODEL, stage="relevance")
        score = int(relevance.get("relevanceScore", 0)) if isinstance(relevance, dict) else 0
        return {
            "repo": repo,
            "score": score,
            "relevance": relevance if isinstance(relevance, dict) else {},
            "tree_files": files,
            "readme": readme,
        }
    except Exception:
        return {
            "repo": repo,
            "score": 0,
            "relevance": {},
            "tree_files": [],
            "readme": "",
        }


async def _fetch_contribution_stats(username: str, token: str = "") -> dict[str, Any]:
    if token:
        gql_stats = await _fetch_contributions_graphql(username, token)
        if gql_stats:
            return gql_stats

    return await _fetch_contributions_from_events(username, token)


async def _fetch_contributions_graphql(username: str, token: str) -> dict[str, Any] | None:
    query = """
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
          }
        }
      }
    }
    """

    now = datetime.now(timezone.utc)
    from_date = (now - timedelta(days=365)).isoformat()
    to_date = now.isoformat()

    headers = {
        "Authorization": f"bearer {token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        resp = await client.post(
            "https://api.github.com/graphql",
            json={"query": query, "variables": {"login": username, "from": from_date, "to": to_date}},
            headers=headers,
        )

    if resp.status_code >= 400:
        return None

    payload = resp.json()
    data = payload.get("data") or {}
    user = data.get("user") or {}
    contributions = ((user.get("contributionsCollection") or {}).get("contributionCalendar") or {}).get("totalContributions")

    if contributions is None:
        return None

    return {
        "contributions_last_year": int(contributions),
        "source": "graphql",
        "estimated": False,
        "window_days": 365,
    }


async def _fetch_contributions_from_events(username: str, token: str = "") -> dict[str, Any]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=365)
    total = 0
    recent_activity: list[dict[str, Any]] = []
    review_durations_hours: list[float] = []
    breakdown = {
        "push": 0,
        "pull_request": 0,
        "issues": 0,
        "review": 0,
        "other": 0,
    }

    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        for page in range(1, 11):
            resp = await client.get(
                f"{GITHUB_API}/users/{username}/events/public?per_page=100&page={page}",
                headers=headers,
            )
            if resp.status_code >= 400:
                break

            events = resp.json()
            if not events:
                break

            stop = False
            for event in events:
                created_at = event.get("created_at")
                if not created_at:
                    continue
                try:
                    event_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                except Exception:
                    continue

                if event_time < since:
                    stop = True
                    continue

                event_type = event.get("type") or ""
                payload = event.get("payload") or {}
                if event_type == "PushEvent":
                    commit_count = int(payload.get("size") or len(payload.get("commits") or []))
                    commit_count = max(commit_count, 1)
                    total += commit_count
                    breakdown["push"] += commit_count
                elif event_type == "PullRequestEvent":
                    total += 1
                    breakdown["pull_request"] += 1
                elif event_type == "IssuesEvent":
                    total += 1
                    breakdown["issues"] += 1
                elif event_type == "PullRequestReviewEvent":
                    total += 1
                    breakdown["review"] += 1
                    pr = payload.get("pull_request") or {}
                    pr_created_at = pr.get("created_at")
                    if pr_created_at:
                        try:
                            pr_created = datetime.fromisoformat(pr_created_at.replace("Z", "+00:00"))
                            delta_hours = max(0.0, (event_time - pr_created).total_seconds() / 3600.0)
                            review_durations_hours.append(delta_hours)
                        except Exception:
                            pass
                else:
                    total += 1
                    breakdown["other"] += 1

                if len(recent_activity) < 8:
                    activity_row = _event_to_activity(event, now)
                    if activity_row:
                        recent_activity.append(activity_row)

            if stop:
                break

    avg_review_time = None
    if review_durations_hours:
        avg_review_time = round(sum(review_durations_hours) / len(review_durations_hours), 1)

    return {
        "contributions_last_year": total,
        "source": "events_public",
        "estimated": True,
        "window_days": 365,
        "breakdown": breakdown,
        "recent_activity": recent_activity,
        "avg_pr_review_time_hours": avg_review_time,
    }


async def _fetch_repo_tree(owner: str, repo: str, branch: str, token: str = "") -> list[str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1", headers=headers)
        if resp.status_code == 404:
            resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/main?recursive=1", headers=headers)
    if resp.status_code >= 400:
        return []

    tree = resp.json().get("tree") or []
    files: list[str] = []
    max_tree_files = max(100, int(settings.GH_ANALYSIS_MAX_TREE_FILES))
    for node in tree:
        if node.get("type") == "blob":
            files.append(node.get("path", ""))
            if len(files) >= max_tree_files:
                break
    return files


async def _fetch_file_content(owner: str, repo: str, path: str, token: str = "") -> str:
    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}", headers=headers)
    if resp.status_code >= 400:
        return ""
    return resp.text[:10000]


async def _llm_json(prompt: str, model: str, stage: str = "unknown") -> Any:
    started = time.perf_counter()
    timeout_seconds = float(settings.OLLAMA_GH_STAGE_TIMEOUT_SECONDS)
    result = await chat_completion(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        timeout_seconds=timeout_seconds,
    )
    parsed = _extract_json(result.get("content", ""))
    logger.info(
        "github_analysis stage=%s model=%s prompt_len=%s elapsed=%.2fs",
        stage,
        model,
        len(prompt),
        time.perf_counter() - started,
    )
    return parsed


@router.post("/analyze", response_model=GitHubAnalysisResponse)
async def analyze_github_profile(request: GitHubAnalysisRequest):
    total_started = time.perf_counter()
    username = _parse_github_username(request.github_url)
    effective_github_token = (request.github_token or settings.GITHUB_TOKEN or "").strip()
    logger.info("github_analysis start username=%s", username)

    profile = await _fetch_profile(username, effective_github_token)
    repos = await _fetch_repos(username, effective_github_token)
    logger.info("github_analysis fetched profile_repos=%s", len(repos))

    # Phase 1: fast heuristic pre-filter before pillar extraction.
    pre_filtered_repos = _rank_repos_by_heuristics(repos, request.jd_text)[:30]
    repo_lines = "\n".join(
        f"- {r.name}: {r.description[:300]} (Lang: {r.language}, Topics: {r.topics})"
        for r in pre_filtered_repos
    )

    profile_context = (
        f"Candidate: {profile.get('name') or profile.get('login')} (@{profile.get('login')})\n"
        f"Bio: {profile.get('bio') or ''}\n"
        f"Location: {profile.get('location') or ''}\n"
        f"Repos: {profile.get('public_repos') or 0}, Followers: {profile.get('followers') or 0}"
    )

    # Stage 1: categorization / mandate mapping (filter model)
    categorization_prompt = _load_prompt(
        "categorization",
        jd=(request.jd_text or "")[:2500],
        repo_list=repo_lines[:12000],
        profile_context=profile_context,
    )
    try:
        pillar_report = await _llm_json(categorization_prompt, FILTER_MODEL, stage="categorization")
    except Exception as exc:
        logger.warning("github_analysis categorization_failed username=%s error=%s", username, exc)
        pillar_report = {"pillars": [], "error": str(exc)}

    target_repos = _extract_target_repo_names(pillar_report)
    repos_to_scout = _rank_repos_by_heuristics(repos, request.jd_text, target_repos)[: max(1, int(settings.GH_ANALYSIS_REPO_SCOUT_LIMIT))]

    # Stage 2: tournament-style relevance scoring in batches.
    best_repo: RepoSummary | None = None
    best_score = -1
    relevance_payload: dict[str, Any] = {}
    best_repo_tree: list[str] = []

    batch_size = 4 if ":cloud" in (FILTER_MODEL or "").lower() else 2
    for idx in range(0, len(repos_to_scout), batch_size):
        batch = repos_to_scout[idx : idx + batch_size]
        logger.info(
            "github_analysis relevance_batch username=%s batch_start=%s batch_size=%s",
            username,
            idx,
            len(batch),
        )
        results = await asyncio.gather(
            *[
                _evaluate_repo_relevance(username, repo, request.jd_text, effective_github_token)
                for repo in batch
            ]
        )
        for result in results:
            score = int(result.get("score") or 0)
            if score > best_score:
                best_score = score
                best_repo = result["repo"]
                relevance_payload = result.get("relevance") or {}
                best_repo_tree = result.get("tree_files") or []
        if best_score >= 80:
            break

    if not best_repo and repos:
        best_repo = repos[0]

    key_files_payload: dict[str, Any] = {"thought_process": "", "files": []}
    audit_items: list[dict] = []
    synthesis_payload: dict[str, Any] = {
        "assessment": {"correctness": 0, "sustainability": 0, "speed": 0, "knowledge": 0},
        "archetypes": [],
        "questions": [],
        "executive_summary": "",
    }

    if best_repo:
        tree_files = best_repo_tree or await _fetch_repo_tree(username, best_repo.name, best_repo.default_branch, effective_github_token)

        # Stage 3: key file selection (mapper model)
        key_files_prompt = _load_prompt(
            "key_files",
            readme_content=(best_repo.description or "")[:2000],
            file_list="\n".join(tree_files[: settings.GH_ANALYSIS_FILE_LIST_FOR_KEYFILES]),
        )
        try:
            key_files_payload = await _llm_json(key_files_prompt, MAP_MODEL, stage="key_files")
        except Exception as exc:
            logger.warning("github_analysis key_files_failed username=%s repo=%s error=%s", username, best_repo.name, exc)
            key_files_payload = {"thought_process": "", "files": []}
        if not isinstance(key_files_payload, dict):
            key_files_payload = {"thought_process": "", "files": []}

        selected_files = []
        for item in key_files_payload.get("files", [])[:3]:
            if isinstance(item, dict) and item.get("path"):
                selected_files.append(item["path"])

        code_chunks: list[str] = []
        for file_path in selected_files:
            snippet = await _fetch_file_content(username, best_repo.name, file_path, effective_github_token)
            if snippet:
                code_chunks.append(f"FILE: {file_path}\n{snippet}")

        # Stage 4: deep audit (audit model)
        audit_prompt = _load_prompt("audit", code_context="\n\n".join(code_chunks)[:20000])
        try:
            audit_payload = await _llm_json(audit_prompt, AUDIT_MODEL, stage="audit")
            if isinstance(audit_payload, dict):
                audit_items = audit_payload.get("items") or []
        except Exception as exc:
            logger.warning("github_analysis audit_failed username=%s repo=%s error=%s", username, best_repo.name, exc)

        # Stage 5: synthesis + question generation (synth model)
        audit_summary = "\n".join(
            f"- Finding: {a.get('title', '')}\n  Concept: {a.get('description', '')}\n  Source File: {a.get('file_path', '')}\n  Evidence: {str(a.get('evidence_snippet', ''))[:200]}"
            for a in audit_items[:8]
            if isinstance(a, dict)
        )
        synth_prompt = _load_prompt(
            "synthesis",
            profile_context=profile_context,
            audit_summary=audit_summary[:12000],
        )
        try:
            synth = await _llm_json(synth_prompt, SYNTH_MODEL, stage="synthesis")
            if isinstance(synth, dict):
                synthesis_payload = synth
        except Exception as exc:
            logger.warning("github_analysis synthesis_failed username=%s repo=%s error=%s", username, best_repo.name, exc)

    contribution_stats = await _fetch_contribution_stats(username, effective_github_token)

    # Aggregate language usage from repo metadata
    lang_counter: dict[str, int] = defaultdict(int)
    total_stars = 0
    top_repos = []
    for r in repos[:12]:
        lang_counter[r.language] += 1
        total_stars += r.stars
        top_repos.append(
            {
                "name": r.name,
                "description": r.description,
                "language": r.language,
                "stars": r.stars,
                "forks": r.forks,
                "url": r.url,
                "updatedAt": r.updated_at,
            }
        )

    lang_total = sum(lang_counter.values()) or 1
    colors = ["#3178c6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#14b8a6"]
    languages = []
    for idx, (lang, count) in enumerate(sorted(lang_counter.items(), key=lambda x: x[1], reverse=True)[:6]):
        languages.append({"name": lang, "percentage": round((count / lang_total) * 100, 1), "color": colors[idx % len(colors)]})

    stats = {
        "public_repos": int(profile.get("public_repos") or len(repos)),
        "followers": int(profile.get("followers") or 0),
        "total_stars": total_stars,
        "contributions_last_year": int(contribution_stats.get("contributions_last_year") or 0),
    }

    quality_indicators = _compute_quality_indicators(
        synthesis_payload=synthesis_payload,
        contribution_stats=contribution_stats,
        audit_items=[a for a in audit_items if isinstance(a, dict)],
        total_stars=total_stars,
        followers=stats["followers"],
    )

    analysis_data = {
        "models": {
            "filter_model": FILTER_MODEL,
            "map_model": MAP_MODEL,
            "audit_model": AUDIT_MODEL,
            "synth_model": SYNTH_MODEL,
        },
        "pillar_report": pillar_report,
        "relevance": relevance_payload,
        "tournament": {
            "target_repos": target_repos,
            "best_repo": best_repo.name if best_repo else None,
            "best_score": best_score,
            "repos_considered": [r.name for r in repos_to_scout],
        },
        "key_files": key_files_payload,
        "audit": audit_items,
        "synthesis": synthesis_payload,
        "contribution_stats": contribution_stats,
        "recent_activity": contribution_stats.get("recent_activity") or [],
        "quality_indicators": quality_indicators,
        "overall_github_score": quality_indicators.get("overall_github_score"),
        "profile": {
            "login": profile.get("login"),
            "name": profile.get("name"),
            "bio": profile.get("bio"),
            "location": profile.get("location"),
            "company": profile.get("company"),
            "public_repos": stats["public_repos"],
            "followers": stats["followers"],
            "html_url": profile.get("html_url"),
            "avatar_url": profile.get("avatar_url"),
        },
    }

    logger.info(
        "github_analysis complete username=%s elapsed=%.2fs best_repo=%s",
        username,
        time.perf_counter() - total_started,
        best_repo.name if best_repo else None,
    )

    return GitHubAnalysisResponse(
        profile=analysis_data["profile"],
        stats=stats,
        top_repos=top_repos,
        languages=languages,
        analysis_data=analysis_data,
    )
