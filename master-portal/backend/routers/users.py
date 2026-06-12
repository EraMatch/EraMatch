from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_sqlite_session
from models import MasterUser
from schemas import UserCreate, UserResponse
from security import get_current_user, hash_password

router = APIRouter()


@router.get("", response_model=list[UserResponse])
def list_users(
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_sqlite_session),
):
    return session.query(MasterUser).order_by(MasterUser.created_at).all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_sqlite_session),
):
    if session.query(MasterUser).filter_by(username=body.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    if len(body.password) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 4 characters")
    user = MasterUser(username=body.username, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    current_user: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_sqlite_session),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own account")
    user = session.query(MasterUser).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = False
    session.commit()
