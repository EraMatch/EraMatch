from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from uuid import UUID

from app.api.deps import DbSession, CurrentUser, CurrentCandidate
from app.schemas.live_interview_v2 import (
    RubricCreate, RubricUpdate, RubricResponse, RubricDimension,
    BankCreate, BankUpdate, BankResponse,
    DimensionSuggestionRequest, DimensionSuggestionResponse,
    AnchorGenerationRequest, BankGenerationRequest, FreezeResponse
)
from app.services.live_interview.rubric import (
    suggest_dimensions_service, generate_anchors_service,
    create_rubric_service, get_rubric_service, freeze_rubric_service
)
from app.services.live_interview.bank import (
    generate_bank_service, create_bank_service,
    get_bank_service, freeze_bank_service
)
from app.services.live_interview.token import generate_session_token_service


router = APIRouter()

# --- Rubric Endpoints ---

@router.post("/rubric/suggest-dimensions", response_model=DimensionSuggestionResponse)
async def suggest_dimensions(
    request: DimensionSuggestionRequest,
    db: DbSession,
    current_user: CurrentUser
):
    """M0: Analyze job description to suggest scoring dimensions."""
    return await suggest_dimensions_service(db, request.group_id)

@router.post("/rubric/generate-anchors", response_model=List[RubricDimension])
async def generate_anchors(
    request: AnchorGenerationRequest,
    db: DbSession,
    current_user: CurrentUser
):
    """M_RUBRIC: Generate behavioral anchors for selected dimensions."""
    # We need the job description. User provides dimensions list.
    return await generate_anchors_service(request.dimensions, request.job_description or "")

@router.post("/rubric", response_model=RubricResponse)
async def create_rubric(
    rubric_in: RubricCreate,
    db: DbSession,
    current_user: CurrentUser
):
    """Save a draft rubric for a group."""
    return await create_rubric_service(db, rubric_in)

@router.get("/rubric/group/{group_id}", response_model=RubricResponse)
async def get_rubric_by_group(
    group_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Retrieve the rubric (draft or frozen) for a group."""
    return await get_rubric_service(db, group_id)

@router.put("/rubric/{rubric_id}", response_model=RubricResponse)
async def update_rubric(
    rubric_id: UUID,
    rubric_in: RubricUpdate,
    db: DbSession,
    current_user: CurrentUser
):
    """Update a draft rubric."""
    # Note: Logic inside service handles state checks
    # For now, we reuse create logic or implement update in service
    from app.schemas.live_interview_v2 import RubricCreate
    # Fetch existing to get group/org ids
    from sqlmodel import select
    from app.models import LiV2Rubric
    res = await db.execute(select(LiV2Rubric).where(LiV2Rubric.rubric_id == rubric_id))
    rubric = res.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
        
    updated_in = RubricCreate(
        group_id=rubric.group_id,
        organization_id=rubric.organization_id,
        dimensions=rubric_in.dimensions or []
    )
    return await create_rubric_service(db, updated_in)

@router.post("/rubric/{rubric_id}/freeze", response_model=RubricResponse)
async def freeze_rubric(
    rubric_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Validate and freeze a rubric (locking it from further edits)."""
    return await freeze_rubric_service(db, rubric_id)

# --- Question Bank Endpoints ---

@router.post("/bank/generate", response_model=BankCreate)
async def generate_bank(
    request: BankGenerationRequest,
    db: DbSession,
    current_user: CurrentUser
):
    """M_BANK: Generate a question bank based on a frozen rubric."""
    return await generate_bank_service(db, request.rubric_id)

@router.post("/bank", response_model=BankResponse)
async def create_bank(
    bank_in: BankCreate,
    db: DbSession,
    current_user: CurrentUser
):
    """Save a draft question bank for a group."""
    return await create_bank_service(db, bank_in)

@router.get("/bank/group/{group_id}", response_model=BankResponse)
async def get_bank_by_group(
    group_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Retrieve the question bank (draft or frozen) for a group."""
    return await get_bank_service(db, group_id)

@router.put("/bank/{bank_id}", response_model=BankResponse)
async def update_bank(
    bank_id: UUID,
    bank_in: BankUpdate,
    db: DbSession,
    current_user: CurrentUser
):
    """Update a draft question bank."""
    from sqlmodel import select
    from app.models import LiV2Bank
    res = await db.execute(select(LiV2Bank).where(LiV2Bank.bank_id == bank_id))
    bank = res.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank not found")
        
    updated_in = BankCreate(
        group_id=bank.group_id,
        organization_id=bank.organization_id,
        items=bank_in.items or []
    )
    return await create_bank_service(db, updated_in)

@router.post("/bank/{bank_id}/freeze", response_model=BankResponse)
async def freeze_bank(
    bank_id: UUID,
    db: DbSession,
    current_user: CurrentUser
):
    """Validate and freeze a question bank."""
    return await freeze_bank_service(db, bank_id)


# --- Candidate Session Endpoints ---

class SessionTokenResponse(APIRouter):
    token: str
    url: str
    room_name: str
    session_id: str


from pydantic import BaseModel as PydanticBaseModel

class SessionTokenOut(PydanticBaseModel):
    token: str
    url: str
    room_name: str
    session_id: str


@router.get("/session/token", response_model=SessionTokenOut)
async def get_session_token(
    db: DbSession,
    current_candidate: CurrentCandidate,
):
    """
    Candidate endpoint: generate a LiveKit room token for the live interview.

    The backend will:
    1. Verify the candidate's group has a frozen question bank.
    2. Create (or reuse) a LiV2Session record.
    3. Return a signed LiveKit JWT so the candidate can join the room.
    4. Dispatch the EraMatch Interviewer agent to the room.

    # TODO (Phase 3 hardening): Before issuing the token, validate that the
    # candidate's face embedding stored from earlier stages (assessment, recorded
    # interview) matches the current camera feed via the AI service. This prevents
    # impersonation across pipeline stages.
    """
    return await generate_session_token_service(
        db=db,
        application_id=current_candidate.application_id,
        candidate_id=current_candidate.candidate_id,
        organization_id=current_candidate.organization_id,
    )
