"""
Admin requests endpoints - approval workflow for project/position creation.
"""
from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends

from app.api.deps import DbSession, CurrentUser, AdminUser, HRUser
from app.services import AdminService, RecruiterService
from app.schemas.admin import (
    ApprovalRequestCreate, ApprovalRequestResponse, ApprovalDecisionRequest
)

router = APIRouter(prefix="/admin/requests", tags=["Approval Requests"])

@router.post("", response_model=ApprovalRequestResponse)
async def create_approval_request(
    request: ApprovalRequestCreate,
    session: DbSession,
    user: HRUser
):
    """
    Submit a request for project or position creation.
    Requires HR role.
    """
    service = AdminService(session, user)
    return await service.create_approval_request(request)

@router.get("", response_model=list[ApprovalRequestResponse])
async def list_approval_requests(
    session: DbSession,
    admin: AdminUser,
    status: str = "pending"
):
    """
    List all approval requests.
    Requires Admin role.
    """
    service = AdminService(session, admin)
    return await service.list_approval_requests(status=status)

@router.patch("/{request_id}/approve", response_model=ApprovalRequestResponse)
async def approve_request(
    request_id: UUID,
    decision: ApprovalDecisionRequest,
    session: DbSession,
    admin: AdminUser
):
    """
    Approve an approval request and execute creation.
    Requires Admin role.
    """
    decision.status = "approved"
    service = AdminService(session, admin)
    return await service.process_approval_request(request_id, decision)

@router.patch("/{request_id}/reject", response_model=ApprovalRequestResponse)
async def reject_request(
    request_id: UUID,
    decision: ApprovalDecisionRequest,
    session: DbSession,
    admin: AdminUser
):
    """
    Reject an approval request.
    Requires Admin role.
    """
    decision.status = "rejected"
    service = AdminService(session, admin)
    return await service.process_approval_request(request_id, decision)
