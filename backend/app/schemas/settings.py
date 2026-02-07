from pydantic import BaseModel, EmailStr

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

class AdminProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None

class OrganizationSettingsUpdate(BaseModel):
    organization_name: str | None = None
    admin_email: EmailStr | None = None
    timezone: str | None = None

class PreferencesUpdate(BaseModel):
    # Flexible dicts to store whatever keys the frontend sends
    email_notifications: bool | None = None
    new_member_requests: bool | None = None
    project_updates: bool | None = None
    weekly_summary: bool | None = None
    two_factor_auth: bool | None = None
    session_timeout: bool | None = None

class AdminSettingsResponse(BaseModel):
    # Profile
    first_name: str
    last_name: str
    email: str
    role: str
    
    # Organization
    organization_name: str
    organization_email: str
    timezone: str | None
    
    # Preferences (Notifications)
    email_notifications: bool
    new_member_requests: bool
    project_updates: bool
    weekly_summary: bool
    
    # Preferences (Security)
    two_factor_auth: bool
    session_timeout: bool
