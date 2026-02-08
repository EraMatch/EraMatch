from app.services.auth import AuthService
from app.services.candidates import CandidateService, CandidateAuthService, CandidateDashboardService
from app.services.recruiter import RecruiterService
from app.services.admin import AdminService

__all__ = [
    "AuthService",
    "CandidateService",
    "CandidateAuthService",
    "CandidateDashboardService",
    "RecruiterService",
    "AdminService",
]
