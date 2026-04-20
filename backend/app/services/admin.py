from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func, desc, col, cast, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import (
    User, Organization, Position, Project, CandidateApplication, Hire, 
    CandidateStageProgress, OrganizationUser, UserPermission, PaymentMethod,
    SystemLog, CandidateGroup, Offer, SubscriptionPlan, ProctoringFlag,
    ApprovalRequest, Notification, GroupStageConfig
)
from app.core.exceptions import ForbiddenException
from app.schemas.admin import (
    GlobalStatsResponse, PipelineStatsResponse, PipelineStageStats, HealthAnalyticsResponse,
    HealthMetrics, QualityMetrics, IntegrityStats, StageTiming,
    MemberStatsResponse, MemberPermissions, MemberPrivilegesResponse, 
    MemberRegisterRequest, MemberRegisterResponse, ReassignRequest,
    PaymentMethodCreate, SubscriptionUpgradeRequest,
    ApprovalRequestCreate, ApprovalDecisionRequest
)
import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from app.core.security import hash_password
import secrets
import string
from app.services.notification import NotificationService
from app.services.email import EmailService
from app.schemas.project import ProjectCreate, PositionCreate


class AdminService:
    def __init__(self, session: AsyncSession, current_user: User):
        self.session = session
        self.current_user = current_user
        self.organization_id = current_user.organization_id

    # User management
    async def list_users(self, skip: int = 0, limit: int = 50) -> list[dict]:
        """List all users in organization."""
        try:
            query = select(OrganizationUser).where(
                OrganizationUser.organization_id == self.organization_id,
                OrganizationUser.is_deleted == False
            ).offset(skip).limit(limit)
            
            result = await self.session.execute(query)
            users = result.scalars().all()
            
            # Convert to dict and normalize ID
            data = []
            for u in users:
                u_dict = u.model_dump()
                u_dict["id"] = str(u.id) # Normalize user_id/id
                u_dict["user_id"] = str(u.id)
                data.append(u_dict)
            return data
        except Exception as e:
            print(f"Error listing users: {e}")
            return []

    async def get_user(self, user_id: UUID) -> dict:
        """Get user by ID."""
        try:
            query = select(OrganizationUser).where(
                OrganizationUser.organization_id == self.organization_id,
                OrganizationUser.id == user_id,
                OrganizationUser.is_deleted == False
            )
            result = await self.session.execute(query)
            user = result.scalar_one_or_none()
            
            if user:
                u_dict = user.model_dump()
                u_dict["id"] = str(user.id)
                u_dict["user_id"] = str(user.id)
                return u_dict
            return None
        except Exception as e:
            print(f"Error getting user: {e}")
            return None

    async def update_user_role(self, user_id: UUID, role: str) -> dict:
        """Update user role and redistribute workload if recruiter role is removed."""
        try:
            from fastapi import HTTPException
            res = await self.session.execute(
                select(OrganizationUser).where(
                    OrganizationUser.organization_id == self.organization_id,
                    OrganizationUser.id == user_id,
                    OrganizationUser.is_deleted == False
                )
            )
            user = res.scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
                
            old_role = user.role.lower() if user.role else ""
            new_role = role.lower()
            
            # If turning a recruiter into something else, redistribute their workload
            if old_role in ["hr", "technical"] and new_role not in ["hr", "technical"]:
                await self.distribute_workload(user.id, old_role)
                
            user.role = new_role
            self.session.add(user)
            await self.session.commit()
            
            u_dict = user.model_dump()
            u_dict["id"] = str(user.id)
            u_dict["user_id"] = str(user.id)
            return u_dict
            
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error updating user role: {e}")
            await self.session.rollback()
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"Failed to update user role: {str(e)}")

    async def create_user(self, email: str, password: str, role: str, first_name: str, last_name: str) -> User:
        pass

    # Organization settings
    async def get_organization(self) -> Organization:
        pass

    async def list_organization_groups(self) -> list[dict]:
        """List all position groups in the organization."""
        try:
            from app.models import OrganizationUser as OU
            from sqlalchemy.orm import aliased
            HRUser = aliased(OU)
            TechUser = aliased(OU)
            
            query = select(
                CandidateGroup, Position, HRUser, TechUser
            ).join(
                Position, CandidateGroup.position_id == Position.id
            ).outerjoin(
                HRUser, Position.assigned_hr_id == HRUser.id
            ).outerjoin(
                TechUser, Position.assigned_tech_id == TechUser.id
            ).where(
                Position.organization_id == self.organization_id,
                Position.is_deleted == False
            )
            
            result = await self.session.execute(query)
            rows = result.all()
            
            group_ids = [row[0].id for row in rows]
            counts = {}
            if group_ids:
                count_query = select(
                    CandidateApplication.group_id, func.count(CandidateApplication.id)
                ).where(
                    CandidateApplication.group_id.in_(group_ids)
                ).group_by(CandidateApplication.group_id)
                count_res = await self.session.execute(count_query)
                for g_id, c in count_res.all():
                    counts[g_id] = c
            
            groups = []
            for group, pos, hr, tech in rows:
                cand_count = counts.get(group.id, 0)
                groups.append({
                    "id": group.id,
                    "name": group.name,
                    "candidateCount": cand_count,
                    "status": group.status or "active",
                    "createdDate": group.created_at,
                    "position_id": pos.id,
                    "progress": 0,
                    "stage": "Initial",
                    "assigned_hr_name": f"{hr.first_name} {hr.last_name}" if hr else None,
                    "assigned_tech_name": f"{tech.first_name} {tech.last_name}" if tech else None,
                    "recruiter": f"{hr.first_name} {hr.last_name}" if hr else "Unassigned",
                    "lastUpdated": "Just now",
                    "integrityIssues": 0,
                    "hasAssessment": False,
                    "hasAIInterview": False,
                    "hasLiveInterview": False
                })
            return groups
            
        except Exception as e:
            print(f"Error listing groups: {e}")
            return []

    async def get_global_stats(self) -> GlobalStatsResponse:
        """
        Get global stats for the organization using DB queries.
        """
        org_id = self.organization_id

        try:
            # 1. Open Positions
            q_pos = select(func.count()).where(
                Position.organization_id == org_id,
                Position.status == "open",
                Position.is_deleted == False
            )
            
            # 2. Active Projects
            q_proj = select(func.count()).where(
                Project.organization_id == org_id,
                Project.status == "active",
                Project.is_deleted == False
            )
            
            # 3. Total Applicants - filter by deleted positions/projects
            q_apps = select(func.count()).select_from(CandidateApplication).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False
            )
            
            # Execute counts sequentially to avoid sqlite locking
            res_pos = await self.session.execute(q_pos)
            res_proj = await self.session.execute(q_proj)
            res_apps = await self.session.execute(q_apps)
            
            open_positions = res_pos.scalar() or 0
            active_projects = res_proj.scalar() or 0
            total_applicants = res_apps.scalar() or 0
            
            # 4. Hires for Time to Fill
            # Join Hire -> CandidateApplication to get applied_at
            q_hires = select(Hire.hired_at, CandidateApplication.applied_at).join(
                CandidateApplication
            ).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                Hire.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False
            )
            
            res_hires = await self.session.execute(q_hires)
            hire_data = res_hires.all()

            avg_time_to_fill = 0.0
            if hire_data:
                total_days = 0
                count = 0
                for hired_at, applied_at in hire_data:
                    if hired_at and applied_at:
                        delta = hired_at - applied_at
                        total_days += (delta.total_seconds() / 86400.0)
                        count += 1
                
                if count > 0:
                    avg_time_to_fill = total_days / count

            # 5. Integrity Stats
            # Count proctoring flags by severity
            q_integrity = select(ProctoringFlag.severity).join(
                CandidateApplication, ProctoringFlag.application_id == CandidateApplication.id
            ).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False
            )
            
            res_integrity = await self.session.execute(q_integrity)
            flags = res_integrity.scalars().all()
            
            high_risk = sum(1 for f in flags if str(f).lower() == 'high')
            medium_risk = sum(1 for f in flags if str(f).lower() == 'medium')
            low_risk = sum(1 for f in flags if str(f).lower() == 'low')
            total_cheating = len(flags)
            
            integrity_stats = {
                "cheatingDetected": total_cheating,
                "highRisk": high_risk,
                "mediumRisk": medium_risk,
                "lowRisk": low_risk
            }

            # 6. Stage Timing
            # Calculate from CandidateStageProgress timestamps
            # We want average days per stage for this organization
            q_stages = select(
                GroupStageConfig.stage_type,
                func.avg(CandidateStageProgress.completed_at - CandidateStageProgress.started_at)
            ).join(
                GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id
            ).join(
                CandidateApplication
            ).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False,
CandidateStageProgress.completed_at.isnot(None),
                CandidateStageProgress.started_at.isnot(None)
            ).group_by(GroupStageConfig.stage_type)
            
            res_stages = await self.session.execute(q_stages)
            stage_data = res_stages.all()
            
            stage_map = {str(s).lower(): round(float(d.total_seconds() / 86400.0), 1) if d else 0 for s, d in stage_data}
            
            # Target days for stages
            targets = {
                "screening": 3,
                "assessment": 5,
                "interview": 7,
                "ai_interview": 7,
                "offer": 5
            }
            
            # Map to response format
            stage_timing = []
            for s_type, target in targets.items():
                days = stage_map.get(s_type, 0)
                status = "good" if days <= target else "slow"
                if days == 0: status = "good" # fallback
                
                stage_timing.append({
                    "stage": s_type.replace('_', ' ').title(),
                    "days": int(days) if days > 0 else 0,
                    "target": target,
                    "status": status
                })

            # 7. Health & Quality
            # Health: Based on project applicant counts (reusing logic from get_health_analytics)
            # Fetch active projects and applicant counts in one query
            q_health = select(
                Project.id,
                func.count(CandidateApplication.id).label("app_count")
            ).select_from(Project).outerjoin(
                Position, Project.id == Position.project_id
            ).outerjoin(
                CandidateApplication, Position.id == CandidateApplication.position_id
            ).where(
                Project.organization_id == org_id,
                Project.status == "active",
                Project.is_deleted == False,
                Position.is_deleted == False,
                or_(CandidateApplication.id.is_(None), CandidateApplication.is_deleted == False)
            ).group_by(Project.id)
            
            res_health = await self.session.execute(q_health)
            health_rows = res_health.all()
            
            on_track = 0
            at_risk = 0
            for row in health_rows:
                if row.app_count < 2:
                    at_risk += 1
                else:
                    on_track += 1
            
            # Velocity: Hires per active project
            velocity = total_applicants / max(1, active_projects) / 10.0 # Heuristic if hires aren't easy to count
            if hire_data:
                velocity = len(hire_data) / max(1, active_projects)
            
            # Quality: Assessment scores
            q_scores = select(CandidateStageProgress.score).join(
                GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id
            ).join(
                CandidateApplication
            ).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False,
                GroupStageConfig.stage_type == "assessment",
                CandidateStageProgress.score.isnot(None)
            )
            res_scores = await self.session.execute(q_scores)
            scores = [float(s) for s in res_scores.scalars().all()]
            high_q = sum(1 for s in scores if s >= 80)
            low_q = len(scores) - high_q
            
            return GlobalStatsResponse(
                openPositions=open_positions,
                activeProjects=active_projects,
                totalApplicants=total_applicants,
                avgTimeToFill=float(avg_time_to_fill),
                analytics=HealthAnalyticsResponse(
                    health=HealthMetrics(onTrack=on_track, atRisk=at_risk),
                    velocity=round(float(velocity), 1), 
                    quality=QualityMetrics(high=high_q, needsImprove=low_q),
                    integrity=integrity_stats,
                    stageTiming=stage_timing
                )
            )

        except Exception as e:
            print(f"Error fetching global stats via DB: {e}")
            import traceback
            traceback.print_exc()
            return GlobalStatsResponse(
                openPositions=0,
                activeProjects=0,
                totalApplicants=0,
                avgTimeToFill=0.0
            )

    async def get_pipeline_stats(self, project_id: UUID | None = None, position_id: UUID | None = None) -> PipelineStatsResponse:
        """
        Get counts of candidates in each stage for the recruitment pipeline.
        Cumulative funnel logic should be applied in the frontend.
        """
        org_id = self.organization_id
        
        try:
            # Base query
            query = select(CandidateApplication.status, func.count(CandidateApplication.id)).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False
            )
            
            # Apply position filter if provided
            if position_id:
                query = query.where(CandidateApplication.position_id == position_id)
            # Apply project filter if provided (only if position_id is not provided to avoid redundant joins)
            elif project_id:
                # Need to join with Position to get project_id
                query = query.join(Position, CandidateApplication.position_id == Position.id).where(
                    Position.project_id == project_id,
                    Position.is_deleted == False
                )
            else:
                # If no project/position filter, we still want to filter out candidates 
                # from deleted positions/projects
                query = query.join(Position, CandidateApplication.position_id == Position.id).where(
                    Position.is_deleted == False
                ).join(Project, Position.project_id == Project.id).where(
                    Project.is_deleted == False
                )
            
            query = query.group_by(CandidateApplication.status)
            
            res = await self.session.execute(query)
            rows = res.all()
            
            # Initialize counts
            counts = {
                "applied": 0,
                "screening": 0,
                "assessment": 0,
                "interview": 0,
                "offer": 0
            }
            
            for status, count in rows:
                s = str(status).lower()
                # All candidates are counted in 'Applied'
                counts["applied"] += count
                
                if s == "screening":
                    counts["screening"] += count
                elif s == "assessment":
                    counts["assessment"] += count
                elif s in ["offer", "offered", "hired", "accepted"]:
                    counts["offer"] += count
            
            # Funnel Logic (Non-cumulative in DB, we make it cumulative here)
            # A candidate in 'Offer' has passed all previous stages.
            offer_total = counts["offer"]
            interview_total = counts["interview"] + offer_total
            assessment_total = counts["assessment"] + interview_total
            screening_total = counts["screening"] + assessment_total
            # Applied is ALREADY the total count because we summed all statuses into it above
            applied_total = counts["applied"]
            
            total_base = applied_total if applied_total > 0 else 1
            
            stages_data = [
                {"stage": "Applied", "count": applied_total, "percentage": 100, "color": "#6366f1"},
                {"stage": "Screening", "count": screening_total, "percentage": round((screening_total/total_base)*100), "color": "#8b5cf6"},
                {"stage": "Assessment", "count": assessment_total, "percentage": round((assessment_total/total_base)*100), "color": "#a855f7"},
                {"stage": "Interview", "count": interview_total, "percentage": round((interview_total/total_base)*100), "color": "#c084fc"},
                {"stage": "Offer", "count": offer_total, "percentage": round((offer_total/total_base)*100), "color": "#10b981"}
            ]

            return PipelineStatsResponse(stages=[PipelineStageStats(**s) for s in stages_data])
            
        except Exception as e:
            print(f"Error fetching pipeline stats: {e}")
            return PipelineStatsResponse(stages=[])

    async def get_health_analytics(self) -> HealthAnalyticsResponse:
        """
        Get project health, hiring velocity, and portfolio quality with efficient queries.
        """
        org_id = self.organization_id
        
        try:
            # 1. & 2. Project counts and Hire counts
            q_stats = select(
                func.count(Project.id).label("active_projects"),
                select(func.count(Hire.id)).where(Hire.organization_id == org_id).scalar_subquery().label("total_hires")
            ).where(
                Project.organization_id == org_id,
                Project.status == "active",
                Project.is_deleted == False
            )
            
            res_stats = await self.session.execute(q_stats)
            stats_row = res_stats.first()
            
            active_proj_count = stats_row.active_projects if stats_row else 0
            hires_count = stats_row.total_hires if stats_row else 0
            velocity = hires_count / max(1, active_proj_count)

            # 3. Project Health (Reusing logic for consistency)
            q_health = select(
                Project.id,
                func.count(CandidateApplication.id).label("app_count")
            ).select_from(Project).outerjoin(
                Position, Project.id == Position.project_id
            ).outerjoin(
                CandidateApplication, Position.id == CandidateApplication.position_id
            ).where(
                Project.organization_id == org_id,
                Project.status == "active",
                Project.is_deleted == False,
                Position.is_deleted == False,
                or_(CandidateApplication.id.is_(None), CandidateApplication.is_deleted == False)
            ).group_by(Project.id)
            
            res_health = await self.session.execute(q_health)
            health_rows = res_health.all()
            
            on_track_count = 0
            at_risk_count = 0
            for row in health_rows:
                if row.app_count < 2:
                    at_risk_count += 1
                else:
                    on_track_count += 1

            # 4. Quality (One query for all scores)
            q_scores = select(CandidateStageProgress.score).join(
                GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id
            ).join(
                CandidateApplication
            ).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False,
                GroupStageConfig.stage_type == "assessment",
                CandidateStageProgress.score.isnot(None)
            )
            
            res_scores = await self.session.execute(q_scores)
            scores = [float(s) for s in res_scores.scalars().all()]
            
            high_quality = sum(1 for s in scores if s >= 80)
            needs_improve = len(scores) - high_quality
            
            if not scores and hires_count > 0:
                high_quality = hires_count
                needs_improve = 0

            # 5. Real Stage Timing
            q_stages = select(
                GroupStageConfig.stage_type,
                func.avg(CandidateStageProgress.completed_at - CandidateStageProgress.started_at)
            ).join(
                GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id
            ).join(
                CandidateApplication
            ).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False,
CandidateStageProgress.completed_at.isnot(None),
                CandidateStageProgress.started_at.isnot(None)
            ).group_by(GroupStageConfig.stage_type)
            
            res_stages = await self.session.execute(q_stages)
            stage_data = res_stages.all()
            stage_map = {str(s).lower(): round(float(d.total_seconds() / 86400.0), 1) if d else 0 for s, d in stage_data}
            
            targets = {"screening": 3, "assessment": 5, "interview": 7, "ai_interview": 7, "offer": 5}
            stage_timing = []
            for s_type, target in targets.items():
                days = stage_map.get(s_type, 0)
                stage_timing.append({
                    "stage": s_type.replace('_', ' ').title(),
                    "days": int(days) if days > 0 else 0,
                    "target": target,
                    "status": "good" if (days <= target or days == 0) else "slow"
                })

            q_integrity = select(ProctoringFlag.severity).join(
                CandidateApplication, ProctoringFlag.application_id == CandidateApplication.id
            ).join(
                Position, CandidateApplication.position_id == Position.id
            ).join(
                Project, Position.project_id == Project.id
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False,
                Position.is_deleted == False,
                Project.is_deleted == False
            )
            
            res_integrity = await self.session.execute(q_integrity)
            flags = res_integrity.scalars().all()
            
            high_risk = sum(1 for f in flags if str(f).lower() == 'high')
            medium_risk = sum(1 for f in flags if str(f).lower() == 'medium')
            low_risk = sum(1 for f in flags if str(f).lower() == 'low')
            
            integrity_stats = {
                "cheatingDetected": len(flags),
                "highRisk": high_risk,
                "mediumRisk": medium_risk,
                "lowRisk": low_risk
            }

            return HealthAnalyticsResponse(
                health={"onTrack": on_track_count, "atRisk": at_risk_count},
                velocity=round(float(velocity), 1),
                quality={"high": high_quality, "needsImprove": needs_improve},
                stageTiming=stage_timing,
                integrity=integrity_stats
            )

        except Exception as e:
            print(f"Error fetching health analytics: {e}")
            import traceback
            traceback.print_exc()
            return HealthAnalyticsResponse(
                health={"onTrack": 0, "atRisk": 0},
                velocity=0.0,
                quality={"high": 0, "needsImprove": 0},
                stageTiming=[
                    {"stage": "Screening", "days": 0, "target": 3, "status": "good"},
                    {"stage": "Assessment", "days": 0, "target": 5, "status": "good"},
                    {"stage": "Interview", "days": 0, "target": 7, "status": "good"},
                    {"stage": "Offer", "days": 0, "target": 5, "status": "good"}
                ],
                integrity={"cheatingDetected": 0, "highRisk": 0, "mediumRisk": 0, "lowRisk": 0}
            )

    async def get_payment_method(self) -> dict:
        """
        Get payment method details for the organization with safe fallbacks.
        """
        try:
            print(f"DEBUG: Fetching PM for OrgID: {self.organization_id}")
            query = select(PaymentMethod).where(
                PaymentMethod.organization_id == self.organization_id
            )
            result = await self.session.execute(query)
            pms = result.scalars().all()
            print(f"DEBUG: Found {len(pms)} PMs")
            
            if not pms:
                return None
            
            # Return the default payment method, or the first one
            payment_method = next((pm for pm in pms if pm.is_default), pms[0])
            
            return {
                "brand": payment_method.card_brand or "Visa",
                "last4": payment_method.last4 or "4242",
                "expiry": payment_method.expiry_date or "12/2026"
            }
            
        except Exception as e:
            print(f"Error fetching payment method: {e}")
            return None

    async def add_payment_method(self, data: PaymentMethodCreate) -> dict:
        """Add a new payment method and set it as default."""
        # In a real app, we would integrate with Stripe here.
        # For now, we save it to the DB.
        
        # Reset existing default
        from sqlalchemy import update
        await self.session.execute(
            update(PaymentMethod)
            .where(PaymentMethod.organization_id == self.organization_id)
            .values(is_default=False)
        )
        
        new_pm = PaymentMethod(
            organization_id=self.organization_id,
            card_brand=data.brand,
            last4=data.last4,
            expiry_date=data.expiry,
            is_default=True
        )
        
        self.session.add(new_pm)
        await self.session.commit()
        await self.session.refresh(new_pm)
        
        return {
            "brand": new_pm.card_brand,
            "last4": new_pm.last4,
            "expiry": new_pm.expiry_date
        }

    async def upgrade_subscription(self, plan_id: UUID) -> bool:
        """Upgrade organization's subscription plan."""
        res_org = await self.session.execute(
            select(Organization).where(Organization.id == self.organization_id)
        )
        org = res_org.scalar_one_or_none()
        
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
            
        org.plan_id = plan_id
        org.subscription_status = "active"
        
        self.session.add(org)
        await self.session.commit()
        
        return True

    async def get_member_stats(self) -> MemberStatsResponse:
        """
        Get counts for Active Members, System Admins, and Recruiting Force using DB aggregations.
        """
        org_id = self.organization_id
        
        try:
            # 1. Members count by status and role
            query = select(OrganizationUser.status, OrganizationUser.role, func.count()).where(
                OrganizationUser.organization_id == org_id,
                OrganizationUser.is_deleted == False
            ).group_by(OrganizationUser.status, OrganizationUser.role)
            
            result = await self.session.execute(query)
            rows = result.all()
            
            total_active = 0
            admins_count = 0
            recruiters_count = 0
            
            for status, role, count in rows:
                s = str(status).lower()
                r = str(role).lower()
                
                if s == "active":
                    total_active += count
                
                if r == "admin":
                    admins_count += count
                elif r in ["hr", "technical"] and s == "active":
                    recruiters_count += count
            
            return MemberStatsResponse(
                totalActive=total_active,
                adminsCount=admins_count,
                recruitersCount=recruiters_count
            )
            
        except Exception as e:
            print(f"Error fetching member stats: {e}")
            return MemberStatsResponse(totalActive=0, pendingRequests=0, openRoles=0)

    async def get_member_privileges(self, user_id: UUID) -> MemberPrivilegesResponse:
        """Fetch permission flags for a user."""
        org_id = self.organization_id
        
        try:
            # 1. Fetch user first_name
            res_user = await self.session.execute(
                select(OrganizationUser.first_name).where(
                    OrganizationUser.organization_id == org_id,
                    OrganizationUser.id == user_id
                )
            )
            first_name = res_user.scalar_one_or_none() or "Unknown"
            
            # 2. Fetch permissions
            res_perms = await self.session.execute(
                select(UserPermission).where(UserPermission.user_id == user_id) # UserPermission.user_id is OK as it's not aliased id
            )
            perms = res_perms.scalar_one_or_none()
            
            permissions = MemberPermissions(
                managePositions=perms.can_manage_positions if perms else False,
                manageUsers=perms.can_manage_users if perms else False,
                manageCandidates=perms.can_manage_candidates if perms else False,
                viewAnalytics=perms.can_view_analytics if perms else True,
                exportData=perms.can_export_data if perms else False
            )
                
            return MemberPrivilegesResponse(
                firstName=first_name,
                permissions=permissions
            )
            
        except Exception as e:
            print(f"Error fetching member privileges: {e}")
            import traceback
            traceback.print_exc()
            return MemberPrivilegesResponse(
                firstName="Unknown",
                permissions=MemberPermissions(
                    managePositions=False,
                    manageUsers=False,
                    manageCandidates=False,
                    viewAnalytics=False,
                    exportData=False
                )
            )

    async def update_member_privileges(self, user_id: UUID, permissions: MemberPermissions):
        """Update permission flags for a user."""
        try:
            # Check if exists
            res = await self.session.execute(
                select(UserPermission).where(UserPermission.user_id == user_id)
            )
            existing_perm = res.scalar_one_or_none()
            
            if existing_perm:
                existing_perm.can_manage_positions = permissions.managePositions
                existing_perm.can_manage_users = permissions.manageUsers
                existing_perm.can_manage_candidates = permissions.manageCandidates
                existing_perm.can_view_analytics = permissions.viewAnalytics
                existing_perm.can_export_data = permissions.exportData
                self.session.add(existing_perm)
            else:
                new_perm = UserPermission(
                    user_id=user_id,
                    can_manage_positions=permissions.managePositions,
                    can_manage_users=permissions.manageUsers,
                    can_manage_candidates=permissions.manageCandidates,
                    can_view_analytics=permissions.viewAnalytics,
                    can_export_data=permissions.exportData
                )
                self.session.add(new_perm)
            
            await self.session.commit()
            return True
        except Exception as e:
            print(f"Error updating member privileges: {e}")
            await self.session.rollback()
            raise HTTPException(status_code=500, detail="Failed to update privileges")

    async def register_member(self, request: MemberRegisterRequest) -> MemberRegisterResponse:
        """Register a new organization user and set default permissions."""
        org_id = self.organization_id
        
        try:
            # 1. Check if user already exists in this organization
            res = await self.session.execute(
                select(OrganizationUser).where(
                    OrganizationUser.organization_id == org_id,
                    OrganizationUser.email == request.email
                )
            )
            existing_user = res.scalar_one_or_none()
            
            if existing_user:
                if not existing_user.is_deleted:
                    raise HTTPException(status_code=400, detail="Member with this email already exists in the organization.")
                
                # Reactivate soft-deleted user
                existing_user.is_deleted = False
                existing_user.status = "active"
                existing_user.first_name = request.firstName
                existing_user.last_name = request.lastName
                existing_user.role = request.role
                existing_user.department_id = UUID(str(request.deptID)) if request.deptID else None
                
                self.session.add(existing_user)
                await self.session.commit()
                return MemberRegisterResponse(success=True, userID=existing_user.id)

            # 2. Generate temporary password
            alphabet = string.ascii_letters + string.digits
            temp_password = ''.join(secrets.choice(alphabet) for i in range(12))
            pwd_hash = hash_password(temp_password)
            
            # 3. Create User
            new_user = OrganizationUser(
                organization_id=org_id,
                first_name=request.firstName,
                last_name=request.lastName,
                email=request.email,
                password_hash=pwd_hash,
                role=request.role,
                department_id=UUID(str(request.deptID)) if request.deptID else None,
                status="active"
            )
            self.session.add(new_user)
            await self.session.commit()
            await self.session.refresh(new_user)
            
            # 3. Create default permissions
            new_perm = UserPermission(
                user_id=new_user.id,
                can_manage_positions=False,
                can_manage_candidates=False,
                can_view_analytics=True,
                can_export_data=False
            )
            self.session.add(new_perm)
            await self.session.commit()
            
            print(f"DEBUG: Created user {request.email} with temp password: {temp_password}")
            
            # Send welcome email with temporary password
            try:
                await EmailService.send_welcome_email(
                    email=request.email,
                    name=f"{request.firstName} {request.lastName}",
                    role=request.role,
                    temp_password=temp_password
                )
            except Exception as email_err:
                print(f"Failed to send welcome email: {email_err}")
            
            return MemberRegisterResponse(success=True, userID=new_user.id)
            
        except HTTPException:
            await self.session.rollback()
            raise
        except Exception as e:
            print(f"Error registering member: {e}")
            await self.session.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to register member: {str(e)}")

    async def list_recruiters_by_role(self, role: str) -> list[dict]:
        """Fetch users from organization_users filtered by role."""
        org_id = self.organization_id
        
        try:
            query = select(OrganizationUser).where(
                OrganizationUser.organization_id == org_id,
                OrganizationUser.role == role,
                OrganizationUser.is_deleted == False,
                OrganizationUser.status == "active"
            )
            result = await self.session.execute(query)
            users = result.scalars().all()
            
            recruiters_list = []
            for u in users:
                # Count active assignments based on role
                if role.lower() == 'hr':
                    count_query = select(func.count()).where(
                        Position.assigned_hr_id == u.id,
                        Position.status == 'open',
                        Position.is_deleted == False
                    )
                else:
                    count_query = select(func.count()).where(
                        Position.assigned_tech_id == u.id,
                        Position.status == 'open',
                        Position.is_deleted == False
                    )
                
                res_count = await self.session.execute(count_query)
                count = res_count.scalar() or 0
                
                recruiters_list.append({
                    "id": str(u.id), 
                    "name": f"{u.first_name} {u.last_name}",
                    "assignedCount": count
                })
            
            return recruiters_list
        except Exception as e:
            print(f"Error listing recruiters by role: {e}")
            return []

    async def reassign_recruiter(self, position_id: UUID, request: ReassignRequest) -> bool:
        """Update position assignments and log action in system_logs."""
        org_id = self.organization_id
        
        try:
            # Fetch old value
            query = select(Position).where(Position.id == position_id)
            res = await self.session.execute(query)
            position = res.scalar_one_or_none()
            
            if not position:
                return False
                
            old_value = None
            # Verify new recruiter is not suspended if recruiter_id is provided
            res_rec = await self.session.execute(
                select(OrganizationUser).where(OrganizationUser.id == request.recruiterID)
            )
            new_rec = res_rec.scalar_one_or_none()
            if not new_rec or new_rec.status == "suspended":
                raise HTTPException(status_code=400, detail="Cannot assign to a suspended or non-existent recruiter")

            if request.type.upper() == 'HR':
                old_value = str(position.assigned_hr_id) if position.assigned_hr_id else None
                position.assigned_hr_id = request.recruiterID
            else:
                old_value = str(position.assigned_tech_id) if position.assigned_tech_id else None
                position.assigned_tech_id = request.recruiterID
            
            self.session.add(position)
            
            # Insert audit log
            log = SystemLog(
                organization_id=org_id,
                user_id=self.current_user.id if self.current_user.role != "admin" else None,
                action=f"reassign_{request.type.lower()}_recruiter",
                entity_type="position",
                entity_id=position_id,
                details={
                    "field": "assigned_hr_id" if request.type.lower() == "hr" else "assigned_tech_id",
                    "old_value": old_value,
                    "new_value": str(request.recruiterID)
                }
            )
            self.session.add(log)
            
            await self.session.commit()
            
            # Send reassignment email
            try:
                await EmailService.send_reassignment_email(
                    email=new_rec.email,
                    name=f"{new_rec.first_name} {new_rec.last_name}",
                    position_title=position.title
                )
            except Exception as email_err:
                print(f"Failed to send reassignment email: {email_err}")
                
            return True
        except Exception as e:
            print(f"Error reassigning recruiter: {e}")
            await self.session.rollback()
            return False

    async def notify_recruiters(self, position_id: UUID) -> bool:
        """Send notifications to the recruiters assigned to this position."""
        try:
            # 1. Fetch position details
            query = select(Position).where(Position.id == position_id)
            res = await self.session.execute(query)
            position = res.scalar_one_or_none()
            
            if not position:
                return False
            
            assigned_ids = []
            if position.assigned_hr_id:
                assigned_ids.append(position.assigned_hr_id)
            if position.assigned_tech_id:
                assigned_ids.append(position.assigned_tech_id)
            
            if not assigned_ids:
                return False

            notification_service = NotificationService(self.session)
            
            for recruiter_id in assigned_ids:
                # Fetch recruiter info
                res_user = await self.session.execute(
                    select(OrganizationUser).where(OrganizationUser.id == recruiter_id)
                )
                user_data = res_user.scalar_one_or_none()
                
                if user_data:
                    name = user_data.first_name
                    email = user_data.email
                    
                    # Create in-app notification
                    await notification_service.create_notification(
                        organization_id=self.organization_id,
                        recipient_user_id=recruiter_id,
                        title="New Position Assignment",
                        message=f"You have been assigned to the position: {position.job_title}",
                        data={"position_id": str(position_id)}
                    )
                    
                    # Send email
                    await notification_service.send_notification_email(
                        organization_id=self.organization_id,
                        recipient_email=email,
                        subject=f"New Assignment: {position.job_title}",
                        message_body=f"Hello {name},\n\nYou have been assigned as a recruiter for the position '{position.job_title}'. Please log in to the portal to view the details."
                    )

            return True
        except Exception as e:
            print(f"Error notifying recruiters: {e}")
            return False

    async def list_archived_projects(self) -> list[dict]:
        """
        List closed projects with position and candidate counts in one bulk operation.
        """
        org_id = self.organization_id
        
        try:
            # Main query to fetch projects and counts
            # We use subqueries for counts to avoid complex join multipliers
            q_pos_count = select(func.count(Position.id)).where(Position.project_id == Project.id).scalar_subquery()
            
            # For candidate count, we join Position and CandidateApplication for each project
            q_cand_count = select(func.count(CandidateApplication.id)).select_from(Position).join(
                CandidateApplication, Position.id == CandidateApplication.position_id
            ).where(Position.project_id == Project.id).scalar_subquery()

            query = select(
                Project,
                q_pos_count.label("pos_count"),
                q_cand_count.label("total_cand")
            ).where(
                Project.organization_id == org_id,
                Project.status == "closed",
                Project.is_deleted == False
            ).order_by(desc(Project.closed_at))
            
            res = await self.session.execute(query)
            rows = res.all()
            
            transformed = []
            for p, pos_count, total_cand in rows:
                transformed.append({
                    "id": str(p.id),
                    "projectName": p.name,
                    "openDate": p.created_at.isoformat() if p.created_at else "2026-02-01T00:00:00Z",
                    "closedDate": p.closed_at.isoformat() if p.closed_at else (p.created_at.isoformat() if p.created_at else "2026-02-05T00:00:00Z"),
                    "positionsCount": pos_count or 0,
                    "totalCandidates": total_cand or 0
                })
            return transformed
        except Exception as e:
            print(f"Error listing archived projects: {e}")
            return []

    async def list_archived_positions(self, project_id: UUID) -> list[dict]:
        """List job positions within an archived project with counts in one query."""
        org_id = self.organization_id
        
        try:
            # 1. Fetch project name first
            res_proj = await self.session.execute(
                select(Project.name).where(Project.id == project_id)
            )
            project_name = res_proj.scalar_one_or_none() or "Unknown Project"

            # 2. Main query for positions and counts
            q_cand_count = select(func.count(CandidateApplication.id)).where(
                CandidateApplication.position_id == Position.id
            ).scalar_subquery()
            
            q_group_count = select(func.count(CandidateGroup.id)).where(
                CandidateGroup.position_id == Position.id
            ).scalar_subquery()

            query = select(
                Position,
                q_cand_count.label("cand_count"),
                q_group_count.label("group_count")
            ).where(
                Position.project_id == project_id,
                Position.organization_id == org_id,
                Position.is_deleted == False
            )
            
            res = await self.session.execute(query)
            rows = res.all()
            
            transformed = []
            for pos, cand_count, group_count in rows:
                status = str(pos.status)
                if status.lower() == "closed":
                    status = "Filled"

                transformed.append({
                    "id": str(pos.id),
                    "jobTitle": pos.job_title,
                    "projectName": project_name,
                    "closureStatus": status,
                    "candidatesCount": cand_count or 0,
                    "groupsCreated": group_count or 0,
                    "closedDate": "2026-02-05", # Default
                    "closureReason": "Project Closed"
                })
            return transformed
        except Exception as e:
            print(f"Error listing archived positions: {e}")
            return []

    async def get_position_archive_details(self, position_id: UUID) -> dict:
        """Get statistics and hired candidate info for a closed position with parallel fetching."""
        try:
            # 1. Overview and Counts in parallel
            q_pos = select(Position).where(Position.id == position_id)
            q_app_ids = select(CandidateApplication.id).where(CandidateApplication.position_id == position_id)
            q_groups = select(func.count(CandidateGroup.id)).where(CandidateGroup.position_id == position_id)
            
            from app.models import CandidateProfile
            q_hire = select(Hire, CandidateProfile).select_from(Hire).join(
                CandidateApplication, Hire.application_id == CandidateApplication.id
            ).join(
                CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id
            ).where(
                Hire.position_id == position_id
            )
            
            res_pos = await self.session.execute(q_pos)
            res_app_ids = await self.session.execute(q_app_ids)
            res_groups = await self.session.execute(q_groups)
            res_hire = await self.session.execute(q_hire)
            
            pos = res_pos.scalar_one_or_none()
            if not pos:
                return {}
            
            app_ids = res_app_ids.scalars().all()
            group_count = res_groups.scalar() or 0
            hire_row = res_hire.first()
            
            # 2. Stage Progression Stats (One query for all progress)
            assessments_passed = 0
            ai_interviews_passed = 0
            live_interviews_passed = 0
            
            if app_ids:
                q_prog = (
                    select(GroupStageConfig.stage_type, func.count())
                    .join(
                        CandidateStageProgress,
                        GroupStageConfig.stage_id == CandidateStageProgress.stage_id
                    )
                    .where(
                        CandidateStageProgress.application_id.in_(app_ids),
                        CandidateStageProgress.status == "completed"
                    )
                    .group_by(GroupStageConfig.stage_type)
                )
                
                res_prog = await self.session.execute(q_prog)
                prog_rows = res_prog.all()
                
                for st, count in prog_rows:
                    if st == "assessment":
                        assessments_passed = count
                    elif st in ["ai_interview", "live_ai"]:
                        ai_interviews_passed = count
                    elif st == "live_interview":
                        live_interviews_passed = count

            hired_cand = None
            hired_at_iso = None
            if hire_row:
                hire, profile = hire_row
                hired_at_iso = hire.hired_at.isoformat() if hire.hired_at else None
                hired_cand = {
                    "name": profile.full_name,
                    "email": profile.email,
                    "id": str(profile.id)
                }

            return {
                "jobTitle": pos.job_title,
                "closureStatus": "Filled" if str(pos.status).lower() == "closed" else pos.status,
                "totalCandidates": len(app_ids),
                "groupsCreated": group_count,
                "assessmentsPassed": assessments_passed,
                "aiInterviewsPassed": ai_interviews_passed,
                "liveInterviewsPassed": live_interviews_passed,
                "hiredCandidate": hired_cand,
                "closedDate": hired_at_iso or "2026-02-05"
            }

        except Exception as e:
            print(f"Error getting position archive details: {e}")
            import traceback
            traceback.print_exc()
            return {}

    async def get_settings(self) -> dict:
        """
        Get aggregated admin settings (Profile, Org, Preferences).
        """
        org_id = self.organization_id
        user_id = self.current_user.id
        
        try:
            # 1. Fetch User Profile
            if self.current_user.role == "admin":
                # For admins, we fetch the specific OrganizationUser record for this org with role='admin'.
                # Use .first() in case there are multiple admins to avoid MultipleResultsFound.
                res_user = await self.session.execute(
                    select(OrganizationUser).where(
                        OrganizationUser.organization_id == org_id,
                        OrganizationUser.role == "admin"
                    ).limit(1)
                )
            else:
                res_user = await self.session.execute(
                    select(OrganizationUser).where(OrganizationUser.id == user_id)
                )
            user_data = res_user.scalars().first()
            
            # If still not found but is admin, use current_user as fallback
            if not user_data and self.current_user.role == "admin":
                user_data = self.current_user
            
            # 2. Fetch Organization Details
            res_org = await self.session.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org_data = res_org.scalar_one_or_none()
            
            if not user_data or not org_data:
                raise Exception("User or Org not found")
            
            # 3. Ensure user_data has necessary attributes (if it was a fallback)
            first_name = getattr(user_data, "first_name", "Admin")
            last_name = getattr(user_data, "last_name", "")
            email = getattr(user_data, "email", self.current_user.email)
            role = getattr(user_data, "role", "admin")
            
            # 3. Fetch User Preferences
            org_settings = org_data.settings or {}
            timezone = org_settings.get("timezone", "UTC-08:00 (Pacific Time)")
            
            # Construct response
            return {
                # Profile
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "role": role,
                
                # Organization
                "organization_name": org_data.organization_name,
                "organization_email": org_data.admin_email,
                "timezone": timezone,
                
                # Preferences (Saved in organization settings)
                "email_notifications": org_settings.get("email_notifications", True),
                "new_member_requests": org_settings.get("new_member_requests", True),
                "project_updates": org_settings.get("project_updates", True),
                "weekly_summary": org_settings.get("weekly_summary", False),
                "two_factor_auth": org_settings.get("two_factor_auth", False),
                "session_timeout": org_settings.get("session_timeout", True),
                "bypass_admin_approval": org_settings.get("bypass_admin_approval", False)
            }
            
        except Exception as e:
            print(f"Error fetching settings: {e}")
            raise HTTPException(status_code=500, detail="Failed to fetch settings")

    async def update_profile(self, first_name: str | None, last_name: str | None, email: str | None) -> bool:
        """Update admin user profile."""
        user_id = self.current_user.id
        
        try:
            if self.current_user.role == "admin":
                res = await self.session.execute(
                    select(OrganizationUser).where(
                        OrganizationUser.organization_id == self.organization_id,
                        OrganizationUser.role == "admin"
                    ).limit(1)
                )
            else:
                res = await self.session.execute(
                    select(OrganizationUser).where(OrganizationUser.id == user_id)
                )
            user = res.scalars().first()
            
            if not user:
                return False
                
            if first_name is not None: user.first_name = first_name
            if last_name is not None: user.last_name = last_name
            if email is not None: 
                user.email = email
                # Sync with Organization table if this is the admin
                if self.current_user.role == "admin":
                    res_org = await self.session.execute(
                        select(Organization).where(Organization.id == self.organization_id)
                    )
                    org = res_org.scalar_one_or_none()
                    if org:
                        org.admin_email = email
                        self.session.add(org)
            
            self.session.add(user)
            await self.session.commit()
            return True
        except Exception as e:
            print(f"Error updating profile: {e}")
            await self.session.rollback()
            raise HTTPException(status_code=500, detail="Failed to update profile")

    async def update_organization(self, name: str | None, email: str | None, timezone: str | None) -> bool:
        """Update organization details."""
        org_id = self.organization_id
        
        try:
            res = await self.session.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = res.scalar_one_or_none()
            
            if not org:
                return False
                
            if name: org.organization_name = name
            if email: 
                org.admin_email = email
                # Sync with OrganizationUser table for the admin
                res_user = await self.session.execute(
                    select(OrganizationUser).where(
                        OrganizationUser.organization_id == self.organization_id,
                        OrganizationUser.role == "admin"
                    ).limit(1)
                )
                user = res_user.scalars().first()
                if user:
                    user.email = email
                    self.session.add(user)
            
            if timezone:
                current_settings = dict(org.settings) if org.settings else {}
                current_settings["timezone"] = timezone
                org.settings = current_settings
                
            self.session.add(org)
            await self.session.commit()
            return True
        except Exception as e:
            print(f"Error updating organization: {e}")
            await self.session.rollback()
            raise HTTPException(status_code=500, detail="Failed to update organization")

    async def update_preferences(self, prefs: dict) -> bool:
        """Update preferences and save to organization settings."""
        org_id = self.organization_id
        try:
            res = await self.session.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = res.scalar_one_or_none()
            if not org:
                return False
                
            current_settings = dict(org.settings) if org.settings else {}
            # Update settings with new preferences
            for key, value in prefs.items():
                if key == "bypass_admin_approval" and self.current_user.role != "admin":
                    continue
                current_settings[key] = value
                
            org.settings = current_settings
            self.session.add(org)
            await self.session.commit()
            return True
        except Exception as e:
            print(f"Error updating preferences: {e}")
            await self.session.rollback()
            return False

    async def delete_user(self, user_id: UUID) -> bool:
        """Soft delete a user by setting is_deleted to True."""
        try:
            res = await self.session.execute(
                select(OrganizationUser).where(
                    OrganizationUser.organization_id == self.organization_id,
                    OrganizationUser.id == user_id,
                    OrganizationUser.is_deleted == False
                )
            )
            user = res.scalar_one_or_none()
            if user:
                user.is_deleted = True
                user.status = "deleted"
                self.session.add(user)
                await self.session.commit()
                return True
            return False
        except Exception as e:
            print(f"Error deleting user: {e}")
            await self.session.rollback()
            return False

    async def distribute_workload(self, user_id: UUID, role: str) -> None:
        """
        Redistribute open positions from a suspended recruiter to active recruiters of the same role.
        Round-robin assignment.
        """
        try:
            # 1. Get all OPEN positions assigned to this user
            if role == 'hr':
                query_pos = select(Position).where(
                    Position.assigned_hr_id == user_id,
                    Position.status == 'open',
                    Position.is_deleted == False
                )
            else:
                query_pos = select(Position).where(
                    Position.assigned_tech_id == user_id,
                    Position.status == 'open',
                    Position.is_deleted == False
                )
            
            res_pos = await self.session.execute(query_pos)
            positions = res_pos.scalars().all()
            
            if not positions:
                return

            # 2. Get active recruiters of the same role
            query_recruiters = select(OrganizationUser).where(
                OrganizationUser.organization_id == self.organization_id,
                OrganizationUser.role == role,
                OrganizationUser.status == 'active',
                OrganizationUser.is_deleted == False
            )
            res_rec = await self.session.execute(query_recruiters)
            recruiters = res_rec.scalars().all()
            
            if not recruiters:
                # No active recruiters to assign to. Leave orphaned or log warning.
                print(f"Warning: No active {role} recruiters available for redistribution.")
                return

            # 3. Redistribute
            num_recruiters = len(recruiters)
            for i, position in enumerate(positions):
                target_recruiter = recruiters[i % num_recruiters]
                
                old_val = str(user_id)
                new_val = str(target_recruiter.id)
                
                if role == 'hr':
                    position.assigned_hr_id = target_recruiter.id
                else:
                    position.assigned_tech_id = target_recruiter.id
                
                self.session.add(position)
                
                # Log redistribution
                log = SystemLog(
                    organization_id=self.organization_id,
                    user_id=None, # System action
                    action=f"auto_redistribute_{role}",
                    entity_type="position",
                    entity_id=position.id,
                    details={
                        "reason": "recruiter_suspension",
                        "old_recruiter": old_val,
                        "new_recruiter": new_val
                    }
                )
                self.session.add(log)
                
            await self.session.flush() # Ensure changes are staged
            
        except Exception as e:
            print(f"Error distributing workload: {e}")
            # Don't rollback here, let the caller handle transaction management or swallow checks
            # But since this is called within update_user_status transaction, we should be careful.
            raise e

    async def update_user_status(self, user_id: UUID, status: str) -> bool:
        """Update user status (active/suspended). Admins cannot be suspended."""
        try:
            res = await self.session.execute(
                select(OrganizationUser).where(
                    OrganizationUser.organization_id == self.organization_id,
                    OrganizationUser.id == user_id,
                    OrganizationUser.is_deleted == False
                )
            )
            user = res.scalar_one_or_none()
            if not user:
                return False
                
            if status == "suspended" and user.role == "admin":
                raise HTTPException(status_code=400, detail="Cannot suspend an administrator account")
                
            user.status = status
            self.session.add(user)
            
            # Auto-redistribute if suspending a recruiter
            if status == "suspended" and user.role in ["hr", "technical"]:
                await self.distribute_workload(user.id, user.role.lower())
                
            await self.session.commit()
            return True
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error updating user status: {e}")
            await self.session.rollback()
            return False

    async def get_subscription_plans(self) -> dict:
        """Fetch subscription plans from DB and calculate current usage with safe fallbacks."""
        org_id = self.organization_id

        fallback_plans = [
            {
                "id": "professional",
                "name": "Professional",
                "price": 299.0,
                "features": ["Unlimited Positions", "Advanced Analytics", "Priority Support"],
                "limits": {},
                "recommended": True
            }
        ]

        
        default_usage = {
            "activePositions": 0,
            "maxPositions": 50,
            "candidatesProcessed": 0,
            "maxCandidates": 1000,
            "storageUsed": 15,
            "maxStorage": 100
        }
        
        current_plan = {
            "name": "Professional",
            "price": 299,
            "billingCycle": "Monthly",
            "nextBillingDate": "N/A"
        }

        try:
            # 1. Fetch Organization & Current Plan
            res_org = await self.session.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = res_org.scalar_one_or_none()
            
            # 2. Fetch All available plans
            res_plans = await self.session.execute(select(SubscriptionPlan))
            plans = res_plans.scalars().all()
            
            # 3. Calculate usage
            q_pos = select(func.count(Position.id)).where(
                Position.organization_id == org_id,
                Position.status == "open",
                Position.is_deleted == False
            )
            q_apps = select(func.count(CandidateApplication.id)).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False
            )
            
            res_pos = await self.session.execute(q_pos)
            res_apps = await self.session.execute(q_apps)
            
            active_positions = res_pos.scalar() or 0
            total_apps = res_apps.scalar() or 0
            
            default_usage["activePositions"] = active_positions
            default_usage["candidatesProcessed"] = total_apps
            
            # 4. Map current plan details
            if org:
                # Calculate next billing date
                if org.created_at:
                    now = datetime.now(timezone.utc)
                    days_since = (now - org.created_at).days
                    # Assume 30-day billing cycle for now
                    cycle_days = 30
                    cycles = (days_since // cycle_days) + 1
                    next_bill = org.created_at + timedelta(days=cycles * cycle_days)
                    current_plan["nextBillingDate"] = next_bill.strftime("%b %d, %Y")

                if org.plan_id:
                    for p in plans:
                        if p.id == org.plan_id:
                            current_plan["name"] = p.name
                            current_plan["price"] = float(p.monthly_price)
                            break

            available_plans = []
            for p in plans:
                # Safe access to JSON fields
                features = []
                if p.features_json and isinstance(p.features_json, dict):
                    features = p.features_json.get("features", [])
                
                limits = {}
                if p.limits_json and isinstance(p.limits_json, dict):
                    limits = p.limits_json

                available_plans.append({
                    "id": str(p.id),
                    "name": p.name,
                    "price": float(p.monthly_price),
                    "features": features,
                    "limits": limits,
                    "recommended": p.name == "Professional"
                })

            return {
                "currentPlan": current_plan,
                "usage": default_usage,
                "availablePlans": available_plans if available_plans else fallback_plans
            }
        except Exception as e:
            print(f"Error fetching subscription plans: {e}")
            import traceback
            traceback.print_exc()
            return {
                "currentPlan": current_plan,
                "usage": default_usage,
                "availablePlans": fallback_plans
            }

    async def get_recent_assignments(self, limit: int = 5) -> list[dict]:
        """Fetch recent recruiter assignment logs from SystemLog."""
        org_id = self.organization_id
        try:
            query = select(SystemLog).where(
                SystemLog.organization_id == org_id,
                SystemLog.action.ilike("reassign_%")
            ).order_by(desc(SystemLog.created_at)).limit(limit)
            
            res = await self.session.execute(query)
            logs = res.scalars().all()
            
            results = []
            for log in logs:
                details = log.details or {}
                # Fetch position name
                pos_name = "Unknown Position"
                if log.entity_id:
                    res_p = await self.session.execute(select(Position.job_title).where(Position.id == log.entity_id))
                    pos_name = res_p.scalar() or "Unknown Position"
                
                # Fetch recruiter name
                rec_name = "Unknown Recruiter"
                new_val = details.get("new_value")
                if new_val:
                    res_u = await self.session.execute(
                        select(OrganizationUser.first_name, OrganizationUser.last_name).where(OrganizationUser.id == UUID(new_val))
                    )
                    u = res_u.first()
                    if u:
                        rec_name = f"{u[0]} {u[1]}"

                results.append({
                    "id": str(log.id),
                    "recruiterName": rec_name,
                    "newValueName": rec_name,
                    "positionName": pos_name,
                    "timestamp": log.created_at.isoformat(),
                    "date": log.created_at.strftime("%b %d, %Y"),
                    "action": log.action,
                    "type": "New Assignment" if "reassign" in log.action else "Change"
                })
            return {"assignments": results}
        except Exception as e:
            print(f"Error fetching recent assignments: {e}")
            return {"assignments": []}

    async def list_organization_groups(self) -> list[dict]:
        """List all position groups in the organization with candidate counts."""
        org_id = self.organization_id
        try:
            # Join Group -> Position to filter by Org
            # Also join Position to get position title if needed, but Group usually has position_id
            
            query = select(CandidateGroup, Position.job_title).join(
                Position, CandidateGroup.position_id == Position.id
            ).where(
                Position.organization_id == org_id,
                Position.is_deleted == False
            ).order_by(desc(CandidateGroup.created_at))
            
            res = await self.session.execute(query)
            rows = res.all()
            
            if not rows:
                return []
                
            group_ids = [group.id for group, _ in rows]
            
            # Count candidates and integrity flags separately for robustness
            q_count = select(
                CandidateApplication.group_id, 
                func.count(CandidateApplication.id)
            ).where(
                CandidateApplication.group_id.in_(group_ids),
                CandidateApplication.is_deleted == False
            ).group_by(CandidateApplication.group_id)
            
            q_flags = select(
                CandidateApplication.group_id,
                func.count(ProctoringFlag.id)
            ).join(
                ProctoringFlag, ProctoringFlag.application_id == CandidateApplication.id
            ).where(
                CandidateApplication.group_id.in_(group_ids),
                CandidateApplication.is_deleted == False
            ).group_by(CandidateApplication.group_id)
            
            res_count = await self.session.execute(q_count)
            res_flags = await self.session.execute(q_flags)
            
            count_map = {row[0]: row[1] for row in res_count.all()}
            flags_map = {row[0]: row[1] for row in res_flags.all()}
            
            # Derive stage flags from GroupStageConfig (sole authoritative source)
            stage_types_res = await self.session.execute(
                select(GroupStageConfig.group_id, GroupStageConfig.stage_type).where(
                    GroupStageConfig.group_id.in_(group_ids),
                    GroupStageConfig.state != "inactive"
                )
            )
            
            stage_types_map = {}
            for row in stage_types_res.all():
                gid, stype = row[0], row[1].lower()
                if gid not in stage_types_map:
                    stage_types_map[gid] = set()
                stage_types_map[gid].add(stype)

            result = []
            for group, job_title in rows:
                gid = group.id
                
                count = count_map.get(gid, 0)
                flags = flags_map.get(gid, 0)
                stages = stage_types_map.get(gid, set())
                
                has_assessment = "assessment" in stages
                has_ai = "ai_interview" in stages
                has_live = "live_interview" in stages

                result.append({
                    "groupID": str(gid),
                    "id": str(gid),
                    "name": group.group_name,
                    "positionTitle": job_title,
                    "candidateCount": count,
                    "integrityIssues": flags,
                    "hasAssessment": has_assessment,
                    "hasAIInterview": has_ai,
                    "hasLiveInterview": has_live,
                    "position_id": str(group.position_id),
                    "status": group.status,
                    "createdDate": group.created_at
                })
            return result
        except Exception as e:
            print(f"Error listing organization groups: {e}")
            return []

    async def create_approval_request(self, request_data: ApprovalRequestCreate) -> ApprovalRequest:
        """Create a new approval request (called by HR)."""
        try:
            new_request = ApprovalRequest(
                organization_id=self.organization_id,
                requester_id=self.current_user.id,
                request_type=request_data.request_type,
                data=request_data.data,
                status="pending"
            )
            self.session.add(new_request)
            await self.session.commit()
            await self.session.refresh(new_request)
            
            # TODO: Notify admins
            return new_request
        except Exception as e:
            print(f"Error creating approval request: {e}")
            await self.session.rollback()
            raise HTTPException(status_code=500, detail="Failed to create approval request")

    async def list_approval_requests(self, status: str = "pending") -> list[dict]:
        """List all approval requests for an organization."""
        try:
            # Join with User to get requester name
            query = select(ApprovalRequest, User.first_name, User.last_name).join(
                User, ApprovalRequest.requester_id == User.id
            ).where(
                ApprovalRequest.organization_id == self.organization_id,
                ApprovalRequest.status == status
            ).order_by(desc(ApprovalRequest.created_at))
            
            result = await self.session.execute(query)
            rows = result.all()
            
            requests = []
            for req, fname, lname in rows:
                r_dict = req.model_dump()
                r_dict["requester_name"] = f"{fname} {lname}"
                r_dict["created_at"] = req.created_at.isoformat()
                requests.append(r_dict)
            return requests
        except Exception as e:
            print(f"Error listing approval requests: {e}")
            return []

    async def process_approval_request(self, request_id: UUID, decision: ApprovalDecisionRequest) -> ApprovalRequest:
        """Process an approval request (approve or reject)."""
        try:
            # 1. Fetch Request
            print(f"DEBUG: Processing approval request {request_id}")
            query = select(ApprovalRequest).where(
                ApprovalRequest.id == request_id,
                ApprovalRequest.organization_id == self.organization_id
            )
            result = await self.session.execute(query)
            req = result.scalar_one_or_none()
            
            if not req:
                raise HTTPException(status_code=404, detail="Request not found")
            
            if req.status != "pending":
                raise HTTPException(status_code=400, detail="Request is already processed")
            
            # 2. Update Request Status
            req.status = decision.status  # approved or rejected
            req.reviewer_id = self.current_user.id
            req.review_notes = decision.review_notes
            req.assigned_tech_id = decision.assigned_tech_id
            req.updated_at = datetime.utcnow()
            
            # 3. Update Entity Status & Notify
            notification_title = f"{req.request_type.capitalize()} Request {decision.status.capitalize()}"
            notification_msg = f"Your request to create {req.request_type} has been {decision.status}."
            if decision.review_notes:
                notification_msg += f"\nNotes: {decision.review_notes}"

            if req.request_type == "project":
                # Fetch project
                p_query = select(Project).where(Project.id == req.entity_id)
                p_res = await self.session.execute(p_query)
                project = p_res.scalar_one_or_none()
                
                if project:
                    if decision.status == "approved":
                        project.status = "active"
                        notification_msg += f"\nProject '{project.name}' is now active."
                    else:
                        project.status = "rejected"
                        project.is_deleted = True # Soft-delete on rejection
                        notification_msg += f"\nProject '{project.name}' has been rejected and removed."
                        
                        # Force update via direct SQL to avoid ORM state issues
                        from sqlalchemy import update
                        await self.session.execute(
                            update(Project)
                            .where(Project.id == project.id)
                            .values(status='rejected', is_deleted=True)
                        )
                    # self.session.add(project) # No longer needed if using update
                    
            elif req.request_type == "position":
                # Fetch position
                pos_query = select(Position).where(Position.id == req.entity_id)
                pos_res = await self.session.execute(pos_query)
                position = pos_res.scalar_one_or_none()
                
                if position:
                    if decision.status == "approved":
                        # Apply overrides and assignment
                        if decision.assigned_tech_id:
                            position.assigned_tech_id = decision.assigned_tech_id
                            req.assigned_tech_id = decision.assigned_tech_id

                        # Enforce Technical Recruiter Assignment
                        if not position.assigned_tech_id:
                             raise HTTPException(status_code=400, detail="A Technical Recruiter must be assigned to approve a position.")

                        # CHANGED: Admin approval now sends to Technical Review
                        position.status = "technical_review"
                        req.status = "technical_review" # Keep the request alive/in-review
                        
                        notification_msg += f"\nPosition '{position.job_title}' has been approved by Admin and is now pending Technical Review."
                        
                        # Notify Technical Recruiter
                        if position.assigned_tech_id:
                            tech_notification = Notification(
                                organization_id=self.organization_id,
                                recipient_user_id=position.assigned_tech_id,
                                type="alert",
                                title="Technical Review Assigned",
                                message=f"You have been assigned to review the position '{position.job_title}'. Please review and approve it.",
                                is_read=False,
                                created_at=datetime.utcnow()
                            )
                            self.session.add(tech_notification)

                    else:
                        position.status = "rejected"
                        position.is_deleted = True # Soft-delete on rejection
                        notification_msg += f"\nPosition '{position.job_title}' has been rejected and removed."
                    
                    self.session.add(position)
            
            # Create Notification
            notification = Notification(
                organization_id=self.organization_id,
                recipient_user_id=req.requester_id,
                type="alert",
                title=notification_title,
                message=notification_msg,
                is_read=False,
                created_at=datetime.utcnow()
            )
            self.session.add(notification)
            
            self.session.add(req)
            await self.session.commit()
            await self.session.refresh(req)
            
            return req
        except Exception as e:
            print(f"Error processing approval request: {e}")
            await self.session.rollback()
            raise e

    async def get_alerts(self, skip: int = 0, limit: int = 50) -> list[Notification]:
        """Fetch all organization alerts/notifications."""
        try:
            query = select(Notification).where(
                Notification.organization_id == self.organization_id
            ).order_by(desc(Notification.created_at)).offset(skip).limit(limit)
            
            result = await self.session.execute(query)
            return result.scalars().all()
        except Exception as e:
            print(f"Error fetching alerts: {e}")
            return []
