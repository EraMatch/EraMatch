"""
GitHub analysis router.

Runs repository/profile analysis and produces profile-targeted interview questions.
Uses stage-specific Ollama models (filter/map/audit/synthesis) aligned with the
original GitHub Analysis workflow.
"""
from __future__ import annotations

import asyncio
import json
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

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts" / "github_analysis"

FILTER_MODEL = settings.OLLAMA_GH_FILTER_MODEL
MAP_MODEL = settings.OLLAMA_GH_MAP_MODEL
AUDIT_MODEL = settings.OLLAMA_GH_AUDIT_MODEL
SYNTH_MODEL = settings.OLLAMA_GH_SYNTH_MODEL

GITHUB_API = "https://api.github.com"


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

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{GITHUB_API}/users/{username}", headers=headers)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"GitHub profile fetch failed: {resp.status_code}")
    return resp.json()


async def _fetch_repos(username: str, token: str = "") -> list[RepoSummary]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=30.0) as client:
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

    async with httpx.AsyncClient(timeout=30.0) as client:
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
            file_list="\n".join(files[:300]),
        )
        relevance = await _llm_json(relevance_prompt, FILTER_MODEL)
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

    async with httpx.AsyncClient(timeout=30.0) as client:
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
    breakdown = {
        "push": 0,
        "pull_request": 0,
        "issues": 0,
        "review": 0,
        "other": 0,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
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
                else:
                    total += 1
                    breakdown["other"] += 1

            if stop:
                break

    return {
        "contributions_last_year": total,
        "source": "events_public",
        "estimated": True,
        "window_days": 365,
        "breakdown": breakdown,
    }


async def _fetch_repo_tree(owner: str, repo: str, branch: str, token: str = "") -> list[str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1", headers=headers)
        if resp.status_code == 404:
            resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/main?recursive=1", headers=headers)
    if resp.status_code >= 400:
        return []

    tree = resp.json().get("tree") or []
    files: list[str] = []
    for node in tree:
        if node.get("type") == "blob":
            files.append(node.get("path", ""))
    return files


async def _fetch_file_content(owner: str, repo: str, path: str, token: str = "") -> str:
    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"token {token}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}", headers=headers)
    if resp.status_code >= 400:
        return ""
    return resp.text[:10000]


async def _llm_json(prompt: str, model: str) -> Any:
    result = await chat_completion(messages=[{"role": "user", "content": prompt}], model=model)
    return _extract_json(result.get("content", ""))


@router.post("/analyze", response_model=GitHubAnalysisResponse)
async def analyze_github_profile(request: GitHubAnalysisRequest):
    username = _parse_github_username(request.github_url)

    profile = await _fetch_profile(username, request.github_token)
    repos = await _fetch_repos(username, request.github_token)

    # Phase 1: fast heuristic pre-filter before pillar extraction.
    pre_filtered_repos = _rank_repos_by_heuristics(repos, request.jd_text)[:50]
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
    pillar_report = await _llm_json(categorization_prompt, FILTER_MODEL)

    target_repos = _extract_target_repo_names(pillar_report)
    repos_to_scout = _rank_repos_by_heuristics(repos, request.jd_text, target_repos)[:6]

    # Stage 2: tournament-style relevance scoring in batches.
    best_repo: RepoSummary | None = None
    best_score = -1
    relevance_payload: dict[str, Any] = {}
    best_repo_tree: list[str] = []

    batch_size = 6 if ":cloud" in (FILTER_MODEL or "").lower() else 3
    for idx in range(0, len(repos_to_scout), batch_size):
        batch = repos_to_scout[idx : idx + batch_size]
        results = await asyncio.gather(
            *[
                _evaluate_repo_relevance(username, repo, request.jd_text, request.github_token)
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
        tree_files = best_repo_tree or await _fetch_repo_tree(username, best_repo.name, best_repo.default_branch, request.github_token)

        # Stage 3: key file selection (mapper model)
        key_files_prompt = _load_prompt(
            "key_files",
            readme_content=(best_repo.description or "")[:2000],
            file_list="\n".join(tree_files[:400]),
        )
        key_files_payload = await _llm_json(key_files_prompt, MAP_MODEL)
        if not isinstance(key_files_payload, dict):
            key_files_payload = {"thought_process": "", "files": []}

        selected_files = []
        for item in key_files_payload.get("files", [])[:3]:
            if isinstance(item, dict) and item.get("path"):
                selected_files.append(item["path"])

        code_chunks: list[str] = []
        for file_path in selected_files:
            snippet = await _fetch_file_content(username, best_repo.name, file_path, request.github_token)
            if snippet:
                code_chunks.append(f"FILE: {file_path}\n{snippet}")

        # Stage 4: deep audit (audit model)
        audit_prompt = _load_prompt("audit", code_context="\n\n".join(code_chunks)[:20000])
        audit_payload = await _llm_json(audit_prompt, AUDIT_MODEL)
        if isinstance(audit_payload, dict):
            audit_items = audit_payload.get("items") or []

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
        synth = await _llm_json(synth_prompt, SYNTH_MODEL)
        if isinstance(synth, dict):
            synthesis_payload = synth

    contribution_stats = await _fetch_contribution_stats(username, request.github_token)

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

    return GitHubAnalysisResponse(
        profile=analysis_data["profile"],
        stats=stats,
        top_repos=top_repos,
        languages=languages,
        analysis_data=analysis_data,
    )
