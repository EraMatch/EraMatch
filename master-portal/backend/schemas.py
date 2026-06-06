from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


# ── Auth ─────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


# ── Master Users ──────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Organizations ─────────────────────────────────────────────────────────────
class OrgCreate(BaseModel):
    organization_name: str
    admin_email: EmailStr
    admin_password: str
    organization_size: str | None = None
    business_domain: str | None = None


class OrgUpdate(BaseModel):
    organization_name: str | None = None
    organization_size: str | None = None
    business_domain: str | None = None
    subscription_status: str | None = None


class OrgAdminUpdate(BaseModel):
    admin_email: EmailStr
    admin_password: str


class OrgResponse(BaseModel):
    organization_id: UUID
    organization_name: str
    admin_email: str
    organization_size: str | None
    business_domain: str | None
    subscription_status: str
    is_deleted: bool
    created_at: datetime

    class Config:
        from_attributes = True
