from app.services.auth import AuthService
from app.services.candidates import CandidateService, CandidateAuthService, CandidateDashboardService
from app.services.recruiter import RecruiterService
from app.services.admin import AdminService
from app.services.group import GroupService

__all__ = [
    "AuthService",
    "CandidateService",
    "CandidateAuthService",
    "CandidateDashboardService",
    "RecruiterService",
    "AdminService",
    "GroupService",
]
