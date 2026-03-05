from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import DbSession, RecruiterUser
from app.schemas.assessments import AssessmentCreateRequest, AssessmentResponse
from app.services.assessments import AssessmentService

router = APIRouter(prefix="/assessments", tags=["Assessments"])

@router.post("", response_model=AssessmentResponse)
async def create_assessment(
    request_data: AssessmentCreateRequest,
    current_user: RecruiterUser,
    session: DbSession
):
    """
    Create a new assessment with its sections and manually added questions.
    """
    try:
        service = AssessmentService(session)
        # Using the current user's ID as the creator and their organization ID
        assessment = await service.create_assessment(
            request_data=request_data,
            user_id=current_user.id,
            organization_id=current_user.organization_id
        )
        
        return AssessmentResponse(
            assessment_id=assessment.id,
            title=assessment.title,
            status=assessment.status
        )
    except Exception as e:
        # Avoid masking specific HTTPExceptions raised by the service layer
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: UUID,
    current_user: RecruiterUser,
    session: DbSession
):
    """
    Get an assessment with its sections and questions by ID.
    """
    try:
        service = AssessmentService(session)
        return await service.get_assessment(
            assessment_id=assessment_id,
            organization_id=current_user.organization_id
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{assessment_id}", response_model=AssessmentResponse)
async def update_assessment(
    assessment_id: UUID,
    request_data: AssessmentCreateRequest,
    current_user: RecruiterUser,
    session: DbSession
):
    """
    Update an existing assessment and entirely replace its sections and questions.
    """
    try:
        service = AssessmentService(session)
        assessment = await service.update_assessment(
            assessment_id=assessment_id,
            request_data=request_data,
            user_id=current_user.id,
            organization_id=current_user.organization_id
        )
        
        return AssessmentResponse(
            assessment_id=assessment.id,
            title=assessment.title,
            status=assessment.status
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{assessment_id}")
async def delete_assessment(
    assessment_id: UUID,
    current_user: RecruiterUser,
    session: DbSession
):
    """
    Soft delete an assessment.
    """
    try:
        service = AssessmentService(session)
        await service.delete_assessment(
            assessment_id=assessment_id,
            organization_id=current_user.organization_id
        )
        return {"detail": "Assessment deleted successfully"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
