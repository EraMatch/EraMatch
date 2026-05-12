"""
Group management endpoints – maps to the EnhancedGroupOverviewV2 page.

Endpoints implemented:
  GET  /recruiter/groups/{group_id}                           → group details
  GET  /recruiter/groups/{group_id}/stats                     → group statistics
  GET  /recruiter/groups/{group_id}/candidates/progress       → candidate progress matrix
  POST /recruiter/groups/{group_id}/stages/start              → start current stage
  GET  /recruiter/groups/{group_id}/activity                  → activity log
  GET  /recruiter/groups/export                               → CSV export
  GET  /recruiter/groups/{group_id}/assessments/monitoring    → assessment monitoring
  POST /recruiter/groups/{group_id}/interviews/assign         → assign interview config
  PUT  /recruiter/groups/{group_id}/acceptance-criteria       → update acceptance criteria
  POST /recruiter/candidate_note                              → add candidate note
  GET  /candidate/details                                     → candidate details
  GET  /candidate/integrity-flags                             → integrity flags
"""
from uuid import UUID
from datetime import datetime
import asyncio
import json

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, RecruiterUser
from app.core.integrity_metrics import integrity_metrics
from app.services.group import GroupService
from app.schemas.group import (
    GroupDetailResponse,
    GroupStatsResponse,
    CandidateProgressResponse,
    GroupUpdateRequest,
    GroupDeleteRequest,
    StartStageRequest,
    StartStageResponse,
    CloseStageRequest,
    CloseStageResponse,
    ActivityLogResponse,
    AssessmentMonitoringResponse,
    AssignInterviewRequest,
    AssignInterviewResponse,
    AcceptanceCriteriaUpdate,
    AcceptanceCriteriaUpdateResponse,
    CandidateNoteCreate,
    CandidateNoteResponse,
    CandidateDetailResponse,
    IntegrityFlagsResponse,
    GroupIntegrityDecisionsResponse,
    SendOffersRequest,
    BulkProgressRequest,
    BulkProgressPreview,
    HoldResolveRequest,
    ScheduleInterviewRequest,
    ArchiveGroupRequest,
    ArchiveGroupResponse,
)

router = APIRouter(tags=["Groups"])


# ─── Export Group CSV (MUST be before {group_id} routes) ─────────────────────

@router.get("/recruiter/groups/export")
async def export_group_data(
    id: UUID = Query(..., description="Group ID to export"),
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Generate and download a CSV file containing complete candidate progress
    data for the group."""
    svc = GroupService(session, current_user)
    csv_str = await svc.export_group_csv(id)

    from datetime import datetime as dt

    filename = f"group_{id}_{dt.utcnow().strftime('%Y%m%d%H%M%S')}.csv"

    return StreamingResponse(
        iter([csv_str]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Group Detail ────────────────────────────────────────────────────────────

@router.get(
    "/recruiter/groups/{group_id}",
    response_model=GroupDetailResponse,
)
async def get_group_details(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Retrieve complete group configuration including metadata, assigned HR,
    filtration flow, and acceptance criteria."""
    svc = GroupService(session, current_user)
    return await svc.get_group_details(group_id)


@router.patch(
    "/recruiter/groups/{group_id}",
    response_model=GroupDetailResponse,
)
async def update_group(
    group_id: UUID,
    body: GroupUpdateRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Update group details (name, status)."""
    svc = GroupService(session, current_user)
    return await svc.update_group(group_id, body)


@router.post(
    "/recruiter/groups/{group_id}/archive",
    response_model=ArchiveGroupResponse,
)
async def archive_group(
    group_id: UUID,
    body: ArchiveGroupRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Archive a group after all stages are closed. Optionally send rejection emails
    to non-rejected candidates — guarded by application.status so each candidate
    receives at most one final-decision email."""
    svc = GroupService(session, current_user)
    return await svc.archive_group(group_id, body.send_rejections)


@router.delete(
    "/recruiter/groups/{group_id}",
    status_code=204,
)
async def delete_group(
    group_id: UUID,
    body: GroupDeleteRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Soft delete a group with options to release, reject, or transfer candidates."""
    svc = GroupService(session, current_user)
    await svc.delete_group(group_id, request=body)


# ─── Group Statistics ────────────────────────────────────────────────────────

@router.get(
    "/recruiter/groups/{group_id}/stats",
    response_model=GroupStatsResponse,
)
async def get_group_stats(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Return aggregated statistics for the group including stage completion
    counts and flagged candidates."""
    svc = GroupService(session, current_user)
    return await svc.get_group_stats(group_id)


# ─── Candidate Progress Matrix ──────────────────────────────────────────────

@router.get(
    "/recruiter/groups/{group_id}/candidates/progress",
    response_model=CandidateProgressResponse,
)
async def get_candidate_progress(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
    filter: str | None = Query(default=None, description='e.g. "completed", "flagged"'),
    sort: str | None = Query(default=None, description='e.g. "score", "name"'),
    stage: str | None = Query(default=None, description="The stage to filter by (e.g. 'assessment', 'ai-interview')"),
):
    """Retrieve all candidates in the group with their complete progress.
    Can be filtered by a specific stage to exclude locked candidates."""
    svc = GroupService(session, current_user)
    return await svc.get_candidate_progress(group_id, filter=filter, sort=sort, stage=stage)


# ─── Start Stage ─────────────────────────────────────────────────────────────

@router.post(
    "/recruiter/groups/{group_id}/stages/start",
    response_model=StartStageResponse,
)
async def start_stage(
    group_id: UUID,
    body: StartStageRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Initiate the current active filtration stage for all eligible candidates
    in the group.  Sends assessment/interview invitations based on current
    stage."""
    svc = GroupService(session, current_user)
    return await svc.start_stage(group_id, body.stage)


@router.post(
    "/recruiter/groups/{group_id}/stages/close",
    response_model=CloseStageResponse,
)
async def close_stage(
    group_id: UUID,
    body: CloseStageRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Close the current active filtration stage for the group."""
    svc = GroupService(session, current_user)
    return await svc.close_stage(group_id, body.stage)


# ─── Activity Log ────────────────────────────────────────────────────────────

@router.get(
    "/recruiter/groups/{group_id}/activity",
    response_model=ActivityLogResponse,
)
async def get_activity_log(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Retrieve chronological activity log for the group."""
    svc = GroupService(session, current_user)
    return await svc.get_activity_log(group_id, limit=limit, offset=offset)


# ─── Assessment Monitoring ──────────────────────────────────────────────────

@router.get(
    "/recruiter/groups/{group_id}/assessments/monitoring",
    response_model=AssessmentMonitoringResponse,
)
async def get_assessment_monitoring(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Legacy monitoring for the assessment stage."""
    svc = GroupService(session, current_user)
    return await svc.get_assessment_monitoring(group_id)


@router.get(
    "/recruiter/groups/{group_id}/stages/{stage_type}/monitoring",
    response_model=AssessmentMonitoringResponse,
)
async def get_stage_monitoring(
    group_id: UUID,
    stage_type: str,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Generic monitoring for any stage (assessment, ai-interview, live-interview).
    Filters candidates to only include those formally progressed to this stage."""
    svc = GroupService(session, current_user)
    return await svc.get_stage_monitoring(group_id, stage_type)


# ─── Assign Interview Config ────────────────────────────────────────────────

@router.post(
    "/recruiter/groups/{group_id}/interviews/assign",
    response_model=AssignInterviewResponse,
)
async def assign_interview(
    group_id: UUID,
    body: AssignInterviewRequest,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Assign an existing AI interview configuration to the group or create a
    new one."""
    svc = GroupService(session, current_user)
    return await svc.assign_interview(group_id, body)


@router.delete(
    "/recruiter/groups/{group_id}/interviews/{interview_id}",
)
async def delete_group_interview(
    group_id: UUID,
    interview_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Soft-delete an AI interview config and remove its association from 
    the group pipeline."""
    svc = GroupService(session, current_user)
    return await svc.delete_interview(group_id, interview_id)


# ─── Update Acceptance Criteria ──────────────────────────────────────────────

@router.put(
    "/recruiter/groups/{group_id}/acceptance-criteria",
    response_model=AcceptanceCriteriaUpdateResponse,
)
async def update_acceptance_criteria(
    group_id: UUID,
    body: AcceptanceCriteriaUpdate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Update the technical acceptance criteria for the group."""
    svc = GroupService(session, current_user)
    return await svc.update_acceptance_criteria(group_id, body)


# ─── Candidate Note ─────────────────────────────────────────────────────────

@router.post(
    "/recruiter/candidate_note",
    response_model=CandidateNoteResponse,
)
async def add_candidate_note(
    body: CandidateNoteCreate,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Create a new recruiter note/comment for a specific candidate
    application."""
    svc = GroupService(session, current_user)
    return await svc.add_candidate_note(body)


# ─── Candidate Details ──────────────────────────────────────────────────────

@router.get(
    "/candidate/details",
    response_model=CandidateDetailResponse,
)
async def get_candidate_details(
    id: UUID = Query(..., description="Candidate ID"),
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Retrieve complete candidate profile details including scores, contact
    information, and resume link."""
    svc = GroupService(session, current_user)
    return await svc.get_candidate_details(id)


# ─── Integrity Flags ────────────────────────────────────────────────────────

@router.get(
    "/candidate/integrity-flags",
    response_model=IntegrityFlagsResponse,
)
async def get_integrity_flags(
    application_id: UUID = Query(..., description="Candidate application ID"),
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Retrieve all suspected integrity violations for a specific candidate
    application."""
    svc = GroupService(session, current_user)
    return await svc.get_integrity_flags(application_id)


@router.get("/recruiter/suspicious-activity/poll")
async def poll_suspicious_activity(
    session: DbSession,
    current_user: RecruiterUser,
    since: str | None = Query(default=None, description="ISO datetime cursor"),
    limit: int = Query(default=100, ge=1, le=300),
):
    svc = GroupService(session, current_user)
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            since_dt = None

    rows = await svc.get_org_suspicious_activity(since=since_dt, limit=limit)
    cursor = rows[0]["created_at"].isoformat() if rows else since
    return {
        "records": [
            {
                **row,
                "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
            }
            for row in rows
        ],
        "cursor": cursor,
        "server_time": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/recruiter/suspicious-activity/stream")
async def stream_suspicious_activity(
    request: Request,
    session: DbSession,
    current_user: RecruiterUser,
    since: str | None = Query(default=None, description="ISO datetime cursor"),
):
    svc = GroupService(session, current_user)
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            since_dt = None

    async def event_generator():
        cursor = since_dt
        while True:
            if await request.is_disconnected():
                break

            rows = await svc.get_org_suspicious_activity(since=cursor, limit=100)
            if rows:
                cursor = rows[0]["created_at"]
                payload = {
                    "records": [
                        {
                            **row,
                            "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                        }
                        for row in rows
                    ],
                    "cursor": cursor.isoformat(),
                }
                yield f"event: suspicious\ndata: {json.dumps(payload)}\n\n"
            else:
                yield "event: heartbeat\ndata: {}\n\n"

            await asyncio.sleep(3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/recruiter/groups/{group_id}/alerts/poll")
async def poll_group_alerts(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
    since: str | None = Query(default=None, description="ISO datetime cursor"),
    limit: int = Query(default=25, ge=1, le=100),
):
    """Polling endpoint for recruiter integrity alerts (fallback when stream is unavailable)."""
    svc = GroupService(session, current_user)
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            since_dt = None

    alerts = await svc.get_group_integrity_alerts(group_id=group_id, since=since_dt, limit=limit)
    cursor = alerts[-1]["created_at"].isoformat() if alerts else since
    return {
        "alerts": alerts,
        "cursor": cursor,
        "server_time": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/recruiter/groups/{group_id}/alerts/stream")
async def stream_group_alerts(
    request: Request,
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
    since: str | None = Query(default=None, description="ISO datetime cursor"),
):
    """SSE stream that pushes recruiter integrity alerts; frontend should fallback to polling if stream fails."""
    svc = GroupService(session, current_user)
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            since_dt = None

    async def event_generator():
        cursor = since_dt
        while True:
            if await request.is_disconnected():
                break

            alerts = await svc.get_group_integrity_alerts(group_id=group_id, since=cursor, limit=50)
            if alerts:
                cursor = alerts[-1]["created_at"]
                payload = {
                    "alerts": [
                        {
                            **a,
                            "created_at": a["created_at"].isoformat(),
                        }
                        for a in alerts
                    ],
                    "cursor": cursor.isoformat(),
                }
                yield f"event: alerts\ndata: {json.dumps(payload)}\n\n"
            else:
                yield "event: heartbeat\ndata: {}\n\n"

            await asyncio.sleep(3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/recruiter/groups/{group_id}/integrity/metrics")
async def get_group_integrity_metrics(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
    window_minutes: int = Query(default=60, ge=5, le=24 * 60),
):
    """Aggregated integrity metrics for recruiter monitoring dashboard."""
    svc = GroupService(session, current_user)
    db_metrics = await svc.get_group_integrity_metrics(group_id=group_id, window_minutes=window_minutes)
    in_process_metrics = integrity_metrics.snapshot()
    return {
        "group_id": str(group_id),
        "window_minutes": window_minutes,
        "db_metrics": db_metrics,
        "in_process_metrics": in_process_metrics,
        "server_time": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/recruiter/groups/{group_id}/integrity/decisions", response_model=GroupIntegrityDecisionsResponse)
async def get_group_integrity_decisions(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
    stage: str | None = Query(default=None, description="Optional stage filter: assessment, ai_interview, live_interview"),
):
    """Candidate-level integrity decisions in a group, optionally scoped to one stage, with stage aggregates."""
    svc = GroupService(session, current_user)
    return await svc.get_group_integrity_decisions(group_id=group_id, stage=stage)

# ─── Final Offers ─────────────────────────────────────────────────────────────

@router.post("/recruiter/groups/{group_id}/offers/send")
async def send_group_offers(
    group_id: UUID,
    request: SendOffersRequest,
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Send final offers to candidates."""
    svc = GroupService(session, current_user)
    await svc.send_offers(group_id, request.application_ids, request.email_subject, request.email_body)
    return {"message": "Offers sent successfully"}


# ─── Bulk Candidate Progression ───────────────────────────────────────────────

@router.post("/recruiter/groups/{group_id}/candidates/bulk-progress")
async def bulk_progress_candidates(
    group_id: UUID,
    request: BulkProgressRequest,
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Progress, reject, or hold candidates in bulk."""
    svc = GroupService(session, current_user)
    await svc.bulk_progress(group_id, request.application_ids, request.action, request.current_stage_type, request.reason)
    return {"message": f"Successfully processed {len(request.application_ids)} candidates"}


@router.post(
    "/recruiter/groups/{group_id}/candidates/bulk-progress-preview",
    response_model=BulkProgressPreview,
)
async def preview_bulk_progress(
    group_id: UUID,
    request: BulkProgressRequest,
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Dry-run preview of bulk_progress: returns how many candidates will be auto-held."""
    svc = GroupService(session, current_user)
    return await svc.preview_bulk_progress(
        group_id, request.application_ids, request.action, request.current_stage_type
    )


@router.post("/recruiter/groups/{group_id}/candidates/held/resolve")
async def resolve_held_candidates(
    group_id: UUID,
    request: HoldResolveRequest,
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Reject or reactivate held candidates in a group."""
    svc = GroupService(session, current_user)
    await svc.resolve_held_candidates(group_id, request.actions)
    return {"message": f"Resolved {len(request.actions)} held candidates"}


@router.post("/recruiter/groups/{group_id}/reset-stages")
async def reset_stages(
    group_id: UUID,
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """DEV ONLY — resets all candidate stage progress for a group."""
    svc = GroupService(session, current_user)
    return await svc.reset_stages(group_id)


# ─── Schedule Live Interview ──────────────────────────────────────────────────

@router.post("/recruiter/groups/{group_id}/interviews/schedule")
async def schedule_live_interview(
    group_id: UUID,
    request: ScheduleInterviewRequest,
    session: DbSession = ...,
    current_user: RecruiterUser = ...,
):
    """Schedule a live interview for a candidate."""
    svc = GroupService(session, current_user)
    return await svc.schedule_live_interview(group_id, request)
