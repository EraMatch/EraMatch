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

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, RecruiterUser
from app.services.group import GroupService
from app.schemas.group import (
    GroupDetailResponse,
    GroupStatsResponse,
    CandidateProgressResponse,
    GroupUpdateRequest,
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
    SendOffersRequest,
    BulkProgressRequest,
    ScheduleInterviewRequest,
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


@router.delete(
    "/recruiter/groups/{group_id}",
    status_code=204,
)
async def delete_group(
    group_id: UUID,
    session: DbSession,
    current_user: RecruiterUser,
):
    """Soft delete a group and release all assigned candidates."""
    svc = GroupService(session, current_user)
    await svc.delete_group(group_id)


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
):
    """Retrieve all candidates in the group with their complete progress through
    all stages including scores, status, and flags."""
    svc = GroupService(session, current_user)
    return await svc.get_candidate_progress(group_id, filter=filter, sort=sort)


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
    """Retrieve detailed monitoring data for the assessment stage."""
    svc = GroupService(session, current_user)
    return await svc.get_assessment_monitoring(group_id)


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
    await svc.bulk_progress(group_id, request.application_ids, request.action, request.reason)
    return {"message": f"Successfully processed {len(request.application_ids)} candidates"}


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
