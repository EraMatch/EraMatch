"""
Candidate services package.

Contains all services related to candidate functionality.
"""
from app.services.candidates.auth import CandidateAuthService
from app.services.candidates.dashboard import CandidateDashboardService
from app.services.candidates.candidate import CandidateService

__all__ = [
    "CandidateAuthService",
    "CandidateDashboardService",
    "CandidateService",
]
