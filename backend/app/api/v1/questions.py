from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DbSession, RecruiterUser
from app.schemas.questions import QuestionBankCreateRequest, QuestionBankResponseItem
from app.services.questions import QuestionService

router = APIRouter(prefix="/questions", tags=["Questions"])

# Temporary schemas for inline responses
class FavoriteResponse(BaseModel):
    isFavorite: bool

class MessageResponse(BaseModel):
    message: str


@router.get("/bank", response_model=List[QuestionBankResponseItem])
async def get_question_bank(
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Fetch all available base questions for the organization's question bank.
    Includes customized config and user's favorite status.
    """
    svc = QuestionService(session, current_user)
    return await svc.get_question_bank()


@router.post("/bank", response_model=QuestionBankResponseItem)
async def create_question_bank(
    request_data: QuestionBankCreateRequest,
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Creates a new custom base question and enters it into the Question Bank.
    """
    svc = QuestionService(session, current_user)
    return await svc.create_question(request_data)


@router.post("/bank/{question_id}/favorite", response_model=FavoriteResponse)
async def toggle_question_favorite(
    question_id: UUID,
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Toggles the favorite status for a question in the bank for the current user.
    """
    svc = QuestionService(session, current_user)
    try:
        new_state = await svc.toggle_favorite(question_id)
        return FavoriteResponse(isFavorite=new_state)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/bank/{question_id}", response_model=MessageResponse)
async def delete_question_bank(
    question_id: UUID,
    session: DbSession,
    current_user: RecruiterUser
):
    """
    Soft-deletes a custom question from the bank.
    """
    svc = QuestionService(session, current_user)
    try:
        await svc.delete_question(question_id)
        return MessageResponse(message="Question soft-deleted successfully")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
