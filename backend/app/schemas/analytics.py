from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field

class OverviewStats(BaseModel):
    totalProjects: int
    totalPositions: int
    totalGroups: int
    totalCandidates: int

class GroupStatusCount(BaseModel):
    status: str
    count: int
    color: str

class StageCount(BaseModel):
    stage: str
    count: int
    color: str

class ProjectPerformance(BaseModel):
    project: str
    groups: int
    candidates: int

class RecentActivity(BaseModel):
    groupName: str
    project: str
    stage: str
    time: str

class WeeklyTrend(BaseModel):
    day: str
    candidates: int

class RecruiterAnalyticsResponse(BaseModel):
    overview: OverviewStats
    groupsByStatus: list[GroupStatusCount]
    candidatesByStage: list[StageCount]
    projectPerformance: list[ProjectPerformance]
    recentActivity: list[RecentActivity]
    weeklyTrend: list[WeeklyTrend]
