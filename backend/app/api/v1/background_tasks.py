from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
import json
from pathlib import Path
from uuid import UUID
from datetime import datetime, timedelta, timezone
from statistics import mean

from app.api.deps import get_db, get_current_user
from app.models import InterviewResponse, OngoingInterview, CandidateApplication, CandidateProfile, QuestionImportJob, GitHubAnalysisJob, QAGProcessingJob, Position

router = APIRouter(prefix="/background-tasks", tags=["Background Tasks"])

DEBUG_LOG_PATH = Path("logs/video_processing_debug.json")

SLO_WINDOW_HOURS = 24


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    sorted_vals = sorted(values)
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    rank = (len(sorted_vals) - 1) * p
    low = int(rank)
    high = min(low + 1, len(sorted_vals) - 1)
    frac = rank - low
    return float(sorted_vals[low] * (1 - frac) + sorted_vals[high] * frac)


def _build_alert(pipeline: str, severity: str, metric: str, threshold: float, actual: float, message: str) -> dict:
    return {
        "pipeline": pipeline,
        "severity": severity,
        "metric": metric,
        "threshold": threshold,
        "actual": round(actual, 4),
        "message": message,
    }


def _load_video_task_durations() -> dict[str, float]:
    if not DEBUG_LOG_PATH.exists():
        return {}
    try:
        logs = json.loads(DEBUG_LOG_PATH.read_text())
    except Exception:
        return {}

    starts: dict[str, datetime] = {}
    durations: dict[str, float] = {}
    for entry in logs if isinstance(logs, list) else []:
        if not isinstance(entry, dict):
            continue
        step = str(entry.get("step") or "")
        data = entry.get("data") if isinstance(entry.get("data"), dict) else {}
        response_id = str(data.get("response_id") or "").strip()
        ts = str(entry.get("timestamp") or "")
        if not response_id or not ts:
            continue
        try:
            timestamp = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            continue

        if step == "task_started":
            starts[response_id] = timestamp
        elif step == "task_completed" and response_id in starts:
            durations[response_id] = max(0.0, (timestamp - starts[response_id]).total_seconds())
    return durations

@router.get("/")
async def get_background_tasks(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get a list of recent background tasks — both video analysis and question import jobs.
    """
    tasks = []

    # ── Video analysis tasks ──────────────────────────────────────────────────
    try:
        video_query = (
            select(
                InterviewResponse.response_id,
                InterviewResponse.processing_status,
                InterviewResponse.answered_at,
                InterviewResponse.question_text,
                CandidateProfile.full_name.label("candidate_name")
            )
            .join(OngoingInterview, InterviewResponse.session_id == OngoingInterview.session_id)
            .join(CandidateApplication, OngoingInterview.application_id == CandidateApplication.id)
            .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
            .where(OngoingInterview.organization_id == current_user.organization_id)
            .order_by(desc(InterviewResponse.answered_at))
            .limit(limit)
        )
        video_result = await db.execute(video_query)
        for row in video_result.all():
            tasks.append({
                "id": str(row.response_id),
                "status": row.processing_status,
                "type": "Video Analysis",
                "task_category": "video",
                "candidate_name": row.candidate_name,
                "source_filename": None,
                "question": row.question_text[:50] + "..." if row.question_text else "N/A",
                "timestamp": row.answered_at.isoformat() if row.answered_at else None,
                "total_generated": None,
                "total_flagged": None,
                "total_approved": None,
            })
    except Exception:
        pass  # Video table may not have matching rows — don't fail the whole endpoint

    # ── Question import jobs ──────────────────────────────────────────────────
    try:
        import_query = (
            select(QuestionImportJob)
            .where(QuestionImportJob.organization_id == current_user.organization_id)
            .order_by(desc(QuestionImportJob.created_at))
            .limit(limit)
        )
        import_result = await db.execute(import_query)
        for job in import_result.scalars().all():
            type_label = {
                "generative": "Question Import (Generative)",
                "extraction": "Question Import (Extraction)",
                "csv": "Question Import (CSV/Excel)",
            }.get(job.import_type, "Question Import")

            tasks.append({
                "id": str(job.id),
                "status": job.status,
                "type": type_label,
                "task_category": "question_import",
                "candidate_name": None,
                "source_filename": job.source_filename,
                "question": job.source_filename or "Uploaded file",
                "timestamp": job.created_at.isoformat() if job.created_at else None,
                "total_generated": job.total_generated,
                "total_flagged": job.total_flagged,
                "total_approved": job.total_approved,
                "import_job_id": str(job.id),
            })
    except Exception:
        pass

    # ── GitHub analysis jobs ──────────────────────────────────────────────────
    try:
        gh_query = (
            select(GitHubAnalysisJob, CandidateProfile.full_name.label("candidate_name"))
            .join(CandidateProfile, GitHubAnalysisJob.candidate_id == CandidateProfile.id)
            .where(GitHubAnalysisJob.organization_id == current_user.organization_id)
            .order_by(desc(GitHubAnalysisJob.created_at))
            .limit(limit)
        )
        gh_result = await db.execute(gh_query)
        for job, candidate_name in gh_result.all():
            tasks.append({
                "id": str(job.id),
                "status": job.status,
                "type": "GitHub Analysis & Question Generation",
                "task_category": "github_analysis",
                "candidate_name": candidate_name,
                "source_filename": job.github_url,
                "question": candidate_name or "Candidate",
                "timestamp": job.created_at.isoformat() if job.created_at else None,
                "total_generated": job.total_generated,
                "total_flagged": None,
                "total_approved": None,
            })
    except Exception:
        pass

    # ── HD Eval + QAG jobs ───────────────────────────────────────────────────
    try:
        qag_query = (
            select(QAGProcessingJob, Position.job_title.label("position_title"), CandidateProfile.full_name.label("candidate_name"))
            .join(Position, QAGProcessingJob.position_id == Position.id)
            .outerjoin(CandidateProfile, QAGProcessingJob.candidate_id == CandidateProfile.id)
            .where(QAGProcessingJob.organization_id == current_user.organization_id)
            .order_by(desc(QAGProcessingJob.created_at))
            .limit(limit)
        )
        qag_result = await db.execute(qag_query)
        for job, position_title, candidate_name in qag_result.all():
            if job.job_type == "qag_generation":
                type_label = "HD Eval + QAG Generation"
            elif job.job_type == "qag_resume_correction":
                type_label = "HD Eval + QAG Resume Correction"
            else:
                type_label = "HD Eval + QAG Processing"

            summary = job.summary if isinstance(job.summary, dict) else {}
            total_generated = summary.get("question_count") if isinstance(summary.get("question_count"), int) else job.total_items
            total_approved = summary.get("applications_scored") if isinstance(summary.get("applications_scored"), int) else job.processed_items
            candidates_found = summary.get("candidates_found") if isinstance(summary.get("candidates_found"), int) else None
            candidates_processed = summary.get("candidates_processed") if isinstance(summary.get("candidates_processed"), int) else None
            candidates_skipped = summary.get("candidates_skipped") if isinstance(summary.get("candidates_skipped"), int) else None
            zero_reason = summary.get("zero_reason") if isinstance(summary.get("zero_reason"), str) else None

            tasks.append({
                "id": str(job.id),
                "status": job.status,
                "type": type_label,
                "task_category": "qag",
                "candidate_name": candidate_name,
                "source_filename": position_title,
                "question": position_title or "Position",
                "timestamp": job.created_at.isoformat() if job.created_at else None,
                "total_generated": total_generated,
                "total_flagged": None,
                "total_approved": total_approved,
                "qag_job_type": job.job_type,
                "processed_items": job.processed_items,
                "total_items": job.total_items,
                "candidates_found": candidates_found,
                "candidates_processed": candidates_processed,
                "candidates_skipped": candidates_skipped,
                "zero_reason": zero_reason,
            })
    except Exception:
        pass

    # Sort all tasks by timestamp descending
    tasks.sort(key=lambda t: t.get("timestamp") or "", reverse=True)
    return tasks[:limit]


@router.get("/slo-health")
async def get_background_task_slo_health(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return SLO metrics and triggered alerts for core background pipelines."""
    now = datetime.now(timezone.utc)
    # DB columns are TIMESTAMP WITHOUT TIME ZONE, so use naive UTC for comparisons.
    since = (now - timedelta(hours=SLO_WINDOW_HOURS)).replace(tzinfo=None)
    alerts: list[dict] = []

    # Question import metrics
    import_result = await db.execute(
        select(QuestionImportJob)
        .where(
            QuestionImportJob.organization_id == current_user.organization_id,
            QuestionImportJob.created_at >= since,
        )
        .order_by(desc(QuestionImportJob.created_at))
    )
    import_jobs = import_result.scalars().all()
    import_completed = [j for j in import_jobs if j.status in {"completed", "failed"} and j.completed_at]
    import_latencies = [max(0.0, (j.completed_at - j.created_at).total_seconds()) for j in import_completed]
    import_failures = len([j for j in import_jobs if j.status == "failed"])
    import_error_rate = (import_failures / len(import_jobs)) if import_jobs else 0.0
    import_p95 = _percentile(import_latencies, 0.95) or 0.0
    import_backlog = len([j for j in import_jobs if j.status in {"pending", "processing"}])

    if import_p95 > 180:
        alerts.append(_build_alert("question_import", "high", "p95_latency_seconds", 180, import_p95, "Question import latency exceeded 3-minute SLO"))
    if import_error_rate > 0.08:
        alerts.append(_build_alert("question_import", "high", "error_rate", 0.08, import_error_rate, "Question import error rate spike detected"))
    if import_backlog > 12:
        alerts.append(_build_alert("question_import", "medium", "backlog", 12, float(import_backlog), "Question import backlog is growing"))

    # GitHub analysis metrics
    gh_result = await db.execute(
        select(GitHubAnalysisJob)
        .where(
            GitHubAnalysisJob.organization_id == current_user.organization_id,
            GitHubAnalysisJob.created_at >= since,
        )
        .order_by(desc(GitHubAnalysisJob.created_at))
    )
    gh_jobs = gh_result.scalars().all()
    gh_completed = [j for j in gh_jobs if j.status in {"completed", "failed"} and j.completed_at]
    gh_latencies = [max(0.0, (j.completed_at - j.created_at).total_seconds()) for j in gh_completed]
    gh_failures = len([j for j in gh_jobs if j.status == "failed"])
    gh_error_rate = (gh_failures / len(gh_jobs)) if gh_jobs else 0.0
    gh_p95 = _percentile(gh_latencies, 0.95) or 0.0
    gh_backlog = len([j for j in gh_jobs if j.status in {"pending", "processing"}])

    if gh_p95 > 240:
        alerts.append(_build_alert("github_analysis", "high", "p95_latency_seconds", 240, gh_p95, "GitHub analysis latency exceeded 4-minute SLO"))
    if gh_error_rate > 0.12:
        alerts.append(_build_alert("github_analysis", "high", "error_rate", 0.12, gh_error_rate, "GitHub analysis error rate spike detected"))
    if gh_backlog > 10:
        alerts.append(_build_alert("github_analysis", "medium", "backlog", 10, float(gh_backlog), "GitHub analysis backlog is growing"))

    # Transcription/video metrics
    video_result = await db.execute(
        select(InterviewResponse)
        .join(OngoingInterview, InterviewResponse.session_id == OngoingInterview.session_id)
        .where(
            OngoingInterview.organization_id == current_user.organization_id,
            InterviewResponse.answered_at >= since,
        )
        .order_by(desc(InterviewResponse.answered_at))
    )
    video_rows = video_result.scalars().all()
    video_failures = len([r for r in video_rows if str(r.processing_status or "").lower() == "failed"])
    video_error_rate = (video_failures / len(video_rows)) if video_rows else 0.0
    video_backlog = len([r for r in video_rows if str(r.processing_status or "").lower() in {"pending", "processing"}])

    durations_by_response = _load_video_task_durations()
    video_durations = [durations_by_response.get(str(r.response_id)) for r in video_rows]
    video_durations_clean = [float(v) for v in video_durations if isinstance(v, (int, float))]
    video_p95 = _percentile(video_durations_clean, 0.95) or 0.0

    if video_p95 > 150:
        alerts.append(_build_alert("transcription", "high", "p95_latency_seconds", 150, video_p95, "Transcription pipeline latency exceeded 2.5-minute SLO"))
    if video_error_rate > 0.10:
        alerts.append(_build_alert("transcription", "high", "error_rate", 0.10, video_error_rate, "Transcription error rate spike detected"))
    if video_backlog > 15:
        alerts.append(_build_alert("transcription", "medium", "backlog", 15, float(video_backlog), "Transcription backlog is growing"))

    return {
        "generated_at": now.isoformat(),
        "window_hours": SLO_WINDOW_HOURS,
        "pipelines": {
            "question_import": {
                "slo": {"p95_latency_seconds": 180, "error_rate": 0.08, "backlog": 12},
                "metrics": {
                    "jobs": len(import_jobs),
                    "completed_jobs": len(import_completed),
                    "p95_latency_seconds": round(import_p95, 2),
                    "avg_latency_seconds": round(mean(import_latencies), 2) if import_latencies else 0.0,
                    "error_rate": round(import_error_rate, 4),
                    "backlog": import_backlog,
                },
            },
            "github_analysis": {
                "slo": {"p95_latency_seconds": 240, "error_rate": 0.12, "backlog": 10},
                "metrics": {
                    "jobs": len(gh_jobs),
                    "completed_jobs": len(gh_completed),
                    "p95_latency_seconds": round(gh_p95, 2),
                    "avg_latency_seconds": round(mean(gh_latencies), 2) if gh_latencies else 0.0,
                    "error_rate": round(gh_error_rate, 4),
                    "backlog": gh_backlog,
                },
            },
            "transcription": {
                "slo": {"p95_latency_seconds": 150, "error_rate": 0.10, "backlog": 15},
                "metrics": {
                    "jobs": len(video_rows),
                    "p95_latency_seconds": round(video_p95, 2),
                    "avg_latency_seconds": round(mean(video_durations_clean), 2) if video_durations_clean else 0.0,
                    "error_rate": round(video_error_rate, 4),
                    "backlog": video_backlog,
                    "durations_sampled": len(video_durations_clean),
                },
            },
        },
        "alerts": alerts,
    }


@router.get("/{task_id}/logs")
async def get_task_logs(task_id: str, current_user = Depends(get_current_user)):
    """
    Get detailed logs for a specific background task.
    """
    if not DEBUG_LOG_PATH.exists():
        return {"logs": []}
        
    try:
        content = DEBUG_LOG_PATH.read_text()
        if not content:
            return {"logs": []}
            
        logs = json.loads(content)
        # Filter logs by response_id
        task_logs = [
            log for log in logs 
            if log.get("data", {}).get("response_id") == task_id
        ]
        return {"logs": task_logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading logs: {str(e)}")


@router.delete("/{task_id}")
async def delete_background_task(
    task_id: UUID,
    task_category: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Delete a background task record.

    task_category:
      - video: deletes InterviewResponse row (scoped to current organization)
      - question_import: deletes QuestionImportJob row (scoped to current organization)
    """
    if task_category not in {"video", "question_import", "github_analysis", "qag"}:
        raise HTTPException(status_code=400, detail="task_category must be 'video', 'question_import', 'github_analysis', or 'qag'")

    if task_category == "question_import":
        job = await db.get(QuestionImportJob, task_id)
        if not job or job.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Task not found")

        await db.delete(job)
        await db.commit()
        return {"message": "Question import task deleted"}

    if task_category == "github_analysis":
        job = await db.get(GitHubAnalysisJob, task_id)
        if not job or job.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Task not found")

        await db.delete(job)
        await db.commit()
        return {"message": "GitHub analysis task deleted"}

    if task_category == "qag":
        job = await db.get(QAGProcessingJob, task_id)
        if not job or job.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Task not found")

        await db.delete(job)
        await db.commit()
        return {"message": "QAG processing task deleted"}

    # video task (preferred: organization-scoped join)
    result = await db.execute(
        select(InterviewResponse)
        .join(OngoingInterview, InterviewResponse.session_id == OngoingInterview.session_id)
        .where(
            InterviewResponse.response_id == task_id,
            OngoingInterview.organization_id == current_user.organization_id,
        )
    )
    video_task = result.scalar_one_or_none()

    # Fallback for legacy/orphan rows where join chain no longer resolves.
    # This keeps delete functional for rows already visible in the task list.
    if not video_task:
        video_task = await db.get(InterviewResponse, task_id)

    if not video_task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(video_task)
    await db.commit()
    return {"message": "Video analysis task deleted"}


@router.post("/stop-video")
async def stop_all_video_tasks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Stop all pending/processing video tasks for the current organization.
    Sets processing_status to 'cancelled'.
    """
    result = await db.execute(
        select(InterviewResponse)
        .join(OngoingInterview, InterviewResponse.session_id == OngoingInterview.session_id)
        .where(
            OngoingInterview.organization_id == current_user.organization_id,
            InterviewResponse.processing_status.in_(["pending", "processing"]),
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        task.processing_status = "cancelled"
        db.add(task)

    await db.commit()

    return {
        "stopped_count": len(tasks),
        "message": f"Stopped {len(tasks)} video task(s).",
    }


@router.post("/stop-question-import")
async def stop_all_question_import_tasks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Stop all pending/processing question import tasks for the current organization.
    Sets status to 'cancelled'.
    """
    result = await db.execute(
        select(QuestionImportJob)
        .where(
            QuestionImportJob.organization_id == current_user.organization_id,
            QuestionImportJob.status.in_(["pending", "processing"]),
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        task.status = "cancelled"
        db.add(task)

    await db.commit()

    return {
        "stopped_count": len(tasks),
        "message": f"Stopped {len(tasks)} question import task(s).",
    }


@router.post("/stop-github-analysis")
async def stop_all_github_analysis_tasks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Stop all pending/processing GitHub analysis tasks for the current organization."""
    result = await db.execute(
        select(GitHubAnalysisJob)
        .where(
            GitHubAnalysisJob.organization_id == current_user.organization_id,
            GitHubAnalysisJob.status.in_(["pending", "processing"]),
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        task.status = "cancelled"
        db.add(task)

    await db.commit()

    return {
        "stopped_count": len(tasks),
        "message": f"Stopped {len(tasks)} GitHub analysis task(s).",
    }


@router.post("/stop-qag")
async def stop_all_qag_tasks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Stop all pending/processing HD Eval + QAG tasks for the current organization."""
    result = await db.execute(
        select(QAGProcessingJob)
        .where(
            QAGProcessingJob.organization_id == current_user.organization_id,
            QAGProcessingJob.status.in_(["pending", "processing"]),
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        task.status = "cancelled"
        task.completed_at = datetime.utcnow()
        db.add(task)

    await db.commit()

    return {
        "stopped_count": len(tasks),
        "message": f"Stopped {len(tasks)} QAG processing task(s).",
    }


@router.post("/stop-video/{task_id}")
async def stop_video_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Stop a single pending/processing video task for the current organization.
    Sets processing_status to 'cancelled'.
    """
    result = await db.execute(
        select(InterviewResponse)
        .join(OngoingInterview, InterviewResponse.session_id == OngoingInterview.session_id)
        .where(
            OngoingInterview.organization_id == current_user.organization_id,
            InterviewResponse.response_id == task_id,
        )
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Video task not found")

    if task.processing_status not in ["pending", "processing"]:
        raise HTTPException(status_code=400, detail="Only pending or processing tasks can be stopped")

    task.processing_status = "cancelled"
    db.add(task)
    await db.commit()

    return {
        "message": "Video task stopped",
        "task_id": str(task.response_id),
        "status": task.processing_status,
    }


@router.post("/stop-question-import/{task_id}")
async def stop_question_import_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Stop a single pending/processing question import task for the current organization.
    Sets status to 'cancelled'.
    """
    task = await db.get(QuestionImportJob, task_id)

    if not task or task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Question import task not found")

    if task.status not in ["pending", "processing"]:
        raise HTTPException(status_code=400, detail="Only pending or processing tasks can be stopped")

    task.status = "cancelled"
    db.add(task)
    await db.commit()

    return {
        "message": "Question import task stopped",
        "task_id": str(task.id),
        "status": task.status,
    }


@router.post("/stop-github-analysis/{task_id}")
async def stop_github_analysis_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Stop a single pending/processing GitHub analysis task for the current organization."""
    task = await db.get(GitHubAnalysisJob, task_id)

    if not task or task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="GitHub analysis task not found")

    if task.status not in ["pending", "processing"]:
        raise HTTPException(status_code=400, detail="Only pending or processing tasks can be stopped")

    task.status = "cancelled"
    db.add(task)
    await db.commit()

    return {
        "message": "GitHub analysis task stopped",
        "task_id": str(task.id),
        "status": task.status,
    }


@router.post("/stop-qag/{task_id}")
async def stop_qag_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Stop a single pending/processing HD Eval + QAG task for the current organization."""
    task = await db.get(QAGProcessingJob, task_id)

    if not task or task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="QAG processing task not found")

    if task.status not in ["pending", "processing"]:
        raise HTTPException(status_code=400, detail="Only pending or processing tasks can be stopped")

    task.status = "cancelled"
    task.completed_at = datetime.utcnow()
    db.add(task)
    await db.commit()

    return {
        "message": "QAG processing task stopped",
        "task_id": str(task.id),
        "status": task.status,
    }
