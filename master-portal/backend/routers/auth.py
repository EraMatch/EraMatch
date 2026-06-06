from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_sqlite_session
from models import MasterUser
from schemas import ChangePasswordRequest, LoginRequest, TokenResponse
from security import create_token, get_current_user, hash_password, verify_password

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: Session = Depends(get_sqlite_session)):
    user = session.query(MasterUser).filter_by(username=body.username, is_active=True).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_token(user.username))


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_sqlite_session),
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect")
    if len(body.new_password) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 4 characters")
    db_user = session.query(MasterUser).filter_by(id=current_user.id).first()
    db_user.password_hash = hash_password(body.new_password)
    session.commit()
    return {"message": "Password changed successfully"}
