from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func, col

from app.models import (
    User, Project, Position, CandidateApplication, CandidateGroup, 
    CandidateStageProgress, OrganizationUser, Hire, Offer
)
from app.schemas import (
    ProjectCreate, ProjectUpdate, PositionCreate, PositionUpdate, ApplicationUpdate,
    ProjectSummaryResponse, PositionInsightsResponse, PositionGroupResponse, InsightScores,
    GroupAnalysisResponse, TechnicalAIResponse, RiskBreakdownResponse, TechStats, AIStats
)
import asyncio
from typing import List


class RecruiterService:
    def __init__(self, session: AsyncSession, current_user: User):
        self.session = session
        self.current_user = current_user
        self.organization_id = current_user.organization_id

    # Project operations
    async def create_project(self, data: ProjectCreate) -> Project:
        # TODO: Create project
        pass

    async def get_project(self, project_id: UUID) -> Project:
        # TODO: Get project
        pass

    async def update_project(self, project_id: UUID, data: ProjectUpdate) -> Project:
        # TODO: Update project
        pass

    async def list_projects(self, status: str | None = None, skip: int = 0, limit: int = 50) -> list[dict]:
        """List all projects for the organization with aggregated counts."""
        org_id = self.organization_id
        
        print(f"Querying projects for organization_id: {org_id}")
        
        try:
            # 1. Fetch projects
            query = select(Project).where(
                Project.organization_id == org_id,
                Project.is_deleted == False
            )
            
            if status:
                query = query.where(Project.status == status)
                
            query = query.offset(skip).limit(limit)
            
            result = await self.session.execute(query)
            projects = result.scalars().all()
            
            if not projects:
                return []

            # 2. Enrich with counts
            enriched_projects = []
            for p in projects:
                pid = p.id
                
                # Count positions
                q_pos = select(func.count()).where(
                    Position.project_id == pid,
                    Position.is_deleted == False
                )
                res_pos = await self.session.execute(q_pos)
                pos_count = res_pos.scalar() or 0
                
                # Fetch position IDs for this project to query applicants and groups
                q_pos_ids = select(Position.id).where(
                    Position.project_id == pid,
                    Position.is_deleted == False
                )
                res_pos_ids = await self.session.execute(q_pos_ids)
                pos_ids = res_pos_ids.scalars().all()
                
                app_count = 0
                group_count = 0
                
                if pos_ids:
                    # Count applicants across positions
                    q_apps = select(func.count()).where(
                        CandidateApplication.position_id.in_(pos_ids),
                        CandidateApplication.is_deleted == False
                    )
                    res_apps = await self.session.execute(q_apps)
                    app_count = res_apps.scalar() or 0
                    
                    # Count candidate groups across positions
                    q_groups = select(func.count()).where(
                        CandidateGroup.position_id.in_(pos_ids)
                    )
                    res_groups = await self.session.execute(q_groups)
                    group_count = res_groups.scalar() or 0
                
                enriched_projects.append({
                    "project_id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "status": p.status,
                    "target_hire_count": p.target_hire_count,
                    "created_at": p.created_at.isoformat(),
                    "id": str(pid),  # Pydantic schema expects 'id'
                    "projectName": p.name,
                    "positionsCount": pos_count,
                    "applicantsCount": app_count,
                    "subGroupsCount": group_count,
                    "openDate": p.created_at.isoformat()
                })
            
            return enriched_projects
        except Exception as e:
            print(f"Error listing projects via DB: {e}")
            import traceback
            traceback.print_exc()
            return []

    # Position operations
    async def create_position(self, data: PositionCreate) -> Position:
        """Create a new position with validation for unique title in organization."""
        org_id = self.organization_id
        
        # Check if position with same title exists in the organization
        query = select(Position).where(
            Position.organization_id == org_id,
            Position.job_title == data.job_title,
            Position.is_deleted == False
        )
        res = await self.session.execute(query)
        if res.first():
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Position with this title already exists in the organization.")
            
        # Create position
        position = Position(
            **data.model_dump(),
            organization_id=org_id,
            status="open"
        )
        self.session.add(position)
        await self.session.commit()
        await self.session.refresh(position)
        
        return position

    async def get_position(self, position_id: UUID) -> Position:
        # TODO: Get position
        pass

    async def update_position(self, position_id: UUID, data: PositionUpdate) -> Position:
        # TODO: Update project
        pass

    async def list_positions(self, project_id: UUID | None = None, status: str | None = None, skip: int = 0, limit: int = 50) -> list[dict]:
        """List positions with enriched data using efficient batch queries."""
        org_id = self.organization_id
        
        try:
            # Subqueries for counts to avoid N+1
            q_cand_count = select(func.count(CandidateApplication.id)).where(
                CandidateApplication.position_id == Position.id,
                CandidateApplication.is_deleted == False
            ).scalar_subquery()

            query = select(Position, q_cand_count.label("cand_count")).where(
                Position.organization_id == org_id,
                Position.is_deleted == False
            )
            if project_id:
                query = query.where(Position.project_id == project_id)
            
            if status:
                query = query.where(Position.status == status)
            
            query = query.offset(skip).limit(limit)
            result = await self.session.execute(query)
            rows = result.all()
            
            # Fetch HR and Tech Recruiters in batch if needed? 
            # For now, let's keep it simple but correct.
            
            enriched = []
            for pos, cand_count in rows:
                pid = pos.id
                
                hr_name = None
                if pos.assigned_hr_id:
                    res_hr = await self.session.execute(
                        select(OrganizationUser).where(OrganizationUser.id == pos.assigned_hr_id)
                    )
                    hr = res_hr.scalar_one_or_none()
                    if hr:
                        hr_name = f"{hr.first_name} {hr.last_name}"
                
                tech_name = None
                if pos.assigned_tech_id:
                    res_tech = await self.session.execute(
                        select(OrganizationUser).where(OrganizationUser.id == pos.assigned_tech_id)
                    )
                    tech = res_tech.scalar_one_or_none()
                    if tech:
                        tech_name = f"{tech.first_name} {tech.last_name}"

                # Ensure we match PositionResponse schema precisely
                enriched.append({
                    "position_id": pid, # This maps to 'id' in schema because of alias="position_id"
                    "project_id": pos.project_id,
                    "job_title": pos.job_title,
                    "job_description": pos.job_description,
                    "required_skills": pos.required_skills if pos.required_skills else [],
                    "experience_level": pos.experience_level,
                    "work_type": pos.work_type,
                    "salary_min": float(pos.salary_min) if pos.salary_min else None,
                    "salary_max": float(pos.salary_max) if pos.salary_max else None,
                    "status": pos.status,
                    "created_at": pos.created_at,
                    "assignedHR": hr_name,
                    "assignedTechnicalRecruiter": tech_name,
                    "candidatesCount": cand_count or 0,
                    "applicantsCount": cand_count or 0,
                    "department": "Technical"
                })
            
            return enriched
        except Exception as e:
            print(f"Error listing positions: {e}")
            import traceback
            traceback.print_exc()
            return []

    # Application management
    async def update_application_status(self, application_id: UUID, data: ApplicationUpdate) -> CandidateApplication:
        # TODO: Update application status
        pass

    async def get_project_summary(self, project_id: UUID) -> ProjectSummaryResponse:
        """Get stats for a specific project with parallel fetching."""
        try:
            # 1. Open Positions
            q_ops = select(func.count()).where(
                Position.project_id == project_id,
                Position.status == "open", # Normalized case
                Position.is_deleted == False
            )
            
            # Position IDs for sub-counts
            q_pos_ids = select(Position.id).where(
                Position.project_id == project_id,
                Position.is_deleted == False
            )
            
            res_ops, res_pos_ids = await asyncio.gather(
                self.session.execute(q_ops),
                self.session.execute(q_pos_ids)
            )
            
            open_positions = res_ops.scalar() or 0
            pos_ids = res_pos_ids.scalars().all()
            
            total_applicants = 0
            avg_time = 0.0
            sub_groups = 0
            
            if pos_ids:
                # Parallel fetch for applicants, groups, and hire info
                q_apps = select(func.count()).where(
                    CandidateApplication.position_id.in_(pos_ids),
                    CandidateApplication.is_deleted == False
                )
                q_groups = select(func.count()).where(
                    CandidateGroup.position_id.in_(pos_ids),
                    CandidateGroup.status == "active"
                )
                q_hires = select(Hire.hired_at, CandidateApplication.applied_at).join(
                    CandidateApplication, Hire.application_id == CandidateApplication.id
                ).where(
                    Hire.position_id.in_(pos_ids)
                )
                
                res_apps, res_groups, res_hires = await asyncio.gather(
                    self.session.execute(q_apps),
                    self.session.execute(q_groups),
                    self.session.execute(q_hires)
                )
                
                total_applicants = res_apps.scalar() or 0
                sub_groups = res_groups.scalar() or 0
                
                hire_data = res_hires.all()
                time_diffs = []
                for hired_at, applied_at in hire_data:
                    if hired_at and applied_at:
                        diff = (hired_at - applied_at).days
                        time_diffs.append(max(0, diff))
                
                if time_diffs:
                    avg_time = sum(time_diffs) / len(time_diffs)

            return ProjectSummaryResponse(
                openPositions=open_positions,
                totalApplicants=total_applicants,
                subGroups=sub_groups,
                avgTimeToFill=round(avg_time, 1)
            )
        except Exception as e:
            print(f"Error fetching project summary: {e}")
            import traceback
            traceback.print_exc()
            return ProjectSummaryResponse(
                openPositions=0, totalApplicants=0, subGroups=0, avgTimeToFill=0.0
            )

    async def get_position_insights(self, position_id: UUID) -> PositionInsightsResponse:
        """Get detailed metrics for a position."""
        try:
            # 1. Conversion: Offered / Total Apps
            # Get total apps
            res_total = await self.session.execute(
                select(func.count()).where(
                    CandidateApplication.position_id == position_id
                )
            )
            total = res_total.scalar() or 0
            
            # Get offered apps
            res_offered = await self.session.execute(
                select(func.count()).where(
                    CandidateApplication.position_id == position_id,
                    CandidateApplication.status.in_(["offer", "offered", "hired"])
                )
            )
            offered = res_offered.scalar() or 0
            
            conversion = (offered / total * 100) if total > 0 else 0.0
            
            # 2. Scores: Assessment & Interview
            # We need application IDs for this position
            res_app_ids = await self.session.execute(
                select(CandidateApplication.id).where(
                    CandidateApplication.position_id == position_id
                )
            )
            app_ids = res_app_ids.scalars().all()
            
            score_assessment = 0.0
            score_interview = 0.0
            quality_score = 0.0
            integrity = 0
            
            if app_ids:
                # Fetch progress
                res_prog = await self.session.execute(
                    select(CandidateStageProgress.stage_type, CandidateStageProgress.score).where(
                        CandidateStageProgress.application_id.in_(app_ids)
                    )
                )
                progs = res_prog.all()
                
                assess_scores = [float(score) for stage, score in progs if stage == "assessment" and score is not None]
                inter_scores = [float(score) for stage, score in progs if stage in ["interview", "ai_interview"] and score is not None]
                
                if assess_scores:
                    score_assessment = sum(assess_scores) / len(assess_scores)
                if inter_scores:
                    score_interview = sum(inter_scores) / len(inter_scores)
                    
                all_scores = assess_scores + inter_scores
                if all_scores:
                    quality_score = sum(all_scores) / len(all_scores)
            
            return PositionInsightsResponse(
                conversion=round(conversion, 1),
                qualityScore=round(quality_score, 1),
                scores=InsightScores(assessment=round(score_assessment, 1), interview=round(score_interview, 1)),
                integrityIssues=integrity
            )
        except Exception as e:
            print(f"Error fetching position insights: {e}")
            return PositionInsightsResponse(
                conversion=0.0, qualityScore=0.0,
                scores=InsightScores(assessment=0.0, interview=0.0),
                integrityIssues=0
            )

    async def get_position_groups(self, position_id: UUID) -> list[PositionGroupResponse]:
        """List groups for a position."""
        try:
            res_groups = await self.session.execute(
                select(CandidateGroup).where(
                    CandidateGroup.position_id == position_id
                )
            )
            groups = res_groups.scalars().all()
            
            result = []
            for g in groups:
                gid = g.id
                res_count = await self.session.execute(
                    select(func.count()).where(
                        CandidateApplication.group_id == gid,
                        CandidateApplication.is_deleted == False
                    )
                )
                count = res_count.scalar() or 0
                
                result.append(PositionGroupResponse(
                    groupID=gid,
                    groupName=g.group_name,
                    candidatesCount=count,
                    status=g.status,
                    createdDate=g.created_at
                ))
            return result
        except Exception as e:
            print(f"Error listing position groups: {e}")
            return []

    async def get_group_analysis(self, group_id: UUID) -> GroupAnalysisResponse:
        """Get high-level analysis for a candidate group."""
        try:
            # Match Accuracy: Use random mock or calc from scores if possible
            match_acc = 92.5 # Mock
            
            # Total Candidates: Count apps in this group (via stage progress)
            res_count = await self.session.execute(
                select(func.count()).where(
                    CandidateStageProgress.group_id == group_id
                )
            )
            total = res_count.scalar() or 0
            
            # Active Phases: Mock
            active_phases = 2 
            
            # Integrity: Mock
            integrity = 98.0
            
            return GroupAnalysisResponse(
                matchAccuracy=match_acc,
                totalCandidates=total,
                activePhases=active_phases,
                integrityScore=integrity
            )
        except Exception as e:
            return GroupAnalysisResponse(matchAccuracy=0, totalCandidates=0, activePhases=0, integrityScore=0)

    async def get_group_technical_ai(self, group_id: UUID) -> TechnicalAIResponse:
        """Get combined technical and AI stats."""
        try:
            # Tech: Assessment scores
            res_tech = await self.session.execute(
                select(CandidateStageProgress.score).where(
                    CandidateStageProgress.group_id == group_id,
                    CandidateStageProgress.stage_type == "assessment",
                    CandidateStageProgress.score.isnot(None)
                )
            )
            tech_scores = [float(s) for s in res_tech.scalars().all()]
            avg_tech = sum(tech_scores) / len(tech_scores) if tech_scores else 0.0
            pass_rate_tech = (sum(1 for s in tech_scores if s >= 70) / len(tech_scores) * 100) if tech_scores else 0.0
            completed_tech = len(tech_scores)
            
            # AI: AI Interview scores
            res_ai = await self.session.execute(
                select(CandidateStageProgress.score).where(
                    CandidateStageProgress.group_id == group_id,
                    CandidateStageProgress.stage_type == "ai_interview",
                    CandidateStageProgress.score.isnot(None)
                )
            )
            ai_scores = [float(s) for s in res_ai.scalars().all()]
            avg_ai = sum(ai_scores) / len(ai_scores) if ai_scores else 0.0
            completed_ai = len(ai_scores)
            pass_rate_ai = (sum(1 for s in ai_scores if s >= 70) / len(ai_scores) * 100) if ai_scores else 0.0
            
            # Mock AI Sentiment/Confidence for now as they aren't in DB yet
            # In real system, query AI analysis table
            import random
            sentiment_pos = int(completed_ai * 0.6)
            sentiment_neu = int(completed_ai * 0.3)
            sentiment_neg = completed_ai - sentiment_pos - sentiment_neu
            
            return TechnicalAIResponse(
                tech=TechStats(
                    avgScore=round(avg_tech, 1), 
                    passRate=round(pass_rate_tech, 1),
                    completed=completed_tech
                ),
                ai=AIStats(
                    avgScore=round(avg_ai, 1),
                    avgConfidence=round(85.5, 1) if completed_ai else 0.0, # Mock
                    sentimentPositive=sentiment_pos,
                    sentimentNeutral=sentiment_neu,
                    sentimentNegative=sentiment_neg,
                    completed=completed_ai,
                    passRate=round(pass_rate_ai, 1)
                )
            )
        except Exception as e:
            return TechnicalAIResponse(
                tech=TechStats(avgScore=0, passRate=0, completed=0),
                ai=AIStats(avgScore=0, avgConfidence=0, sentimentPositive=0, sentimentNeutral=0, sentimentNegative=0, completed=0, passRate=0)
            )

    async def get_group_risks(self, group_id: UUID) -> RiskBreakdownResponse:
        """Get integrity risks."""
        # Simple breakdown mock based on count
        # Assuming 'integrity' stage or flag exists?
        # For now, return safe defaults or mock distribution
        return RiskBreakdownResponse(high=0, medium=0, low=0, cheatingDetected=0)
