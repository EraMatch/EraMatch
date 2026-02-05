from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func, desc, col, cast
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import (
    User, Organization, Position, Project, CandidateApplication, Hire, 
    CandidateStageProgress, OrganizationUser, UserPermission, PaymentMethod,
    SystemLog, CandidateGroup, Offer, SubscriptionPlan
)
from app.core.exceptions import ForbiddenException
from app.schemas.admin import (
    GlobalStatsResponse, PipelineStatsResponse, HealthAnalyticsResponse, 
    MemberStatsResponse, MemberPermissions, MemberPrivilegesResponse, 
    MemberRegisterRequest, MemberRegisterResponse, ReassignRequest
)
import asyncio
from datetime import datetime
from fastapi import HTTPException
from app.core.security import hash_password
import secrets
import string
from app.services.notification import NotificationService


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

    async def create_user(self, email: str, password: str, role: str, first_name: str, last_name: str) -> User:
        pass

    # Organization settings
    async def get_organization(self) -> Organization:
        pass

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
            
            # 3. Total Applicants
            q_apps = select(func.count()).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False
            )
            
            # Execute counts in parallel
            res_pos, res_proj, res_apps = await asyncio.gather(
                self.session.execute(q_pos),
                self.session.execute(q_proj),
                self.session.execute(q_apps)
            )
            
            open_positions = res_pos.scalar() or 0
            active_projects = res_proj.scalar() or 0
            total_applicants = res_apps.scalar() or 0
            
            # 4. Hires for Time to Fill
            # Join Hire -> CandidateApplication to get applied_at
            q_hires = select(Hire.hired_at, CandidateApplication.applied_at).join(
                CandidateApplication
            ).where(
                Hire.organization_id == org_id
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

            return GlobalStatsResponse(
                openPositions=open_positions,
                activeProjects=active_projects,
                totalApplicants=total_applicants,
                avgTimeToFill=float(avg_time_to_fill)
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

    async def get_pipeline_stats(self) -> PipelineStatsResponse:
        """
        Get counts for the recruitment funnel.
        """
        org_id = self.organization_id
        
        try:
            # Group by status to avoid fetching all rows
            query = select(CandidateApplication.status, func.count()).where(
                CandidateApplication.organization_id == org_id,
                CandidateApplication.is_deleted == False
            ).group_by(CandidateApplication.status)
            
            result = await self.session.execute(query)
            rows = result.all()
            
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
                if s == "applied":
                    counts["applied"] += count
                elif s == "screening":
                    counts["screening"] += count
                elif s == "in_pipeline": # Logic from original code
                    counts["interview"] += count
                elif s in ["offer", "offered", "hired", "accepted"]:
                    counts["offer"] += count
            
            return PipelineStatsResponse(**counts)
            
        except Exception as e:
            print(f"Error fetching pipeline stats: {e}")
            return PipelineStatsResponse(
                applied=0, screening=0, assessment=0, interview=0, offer=0
            )

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

            # 3. Project Health (Counts applicants per project in ONE query)
            # Join Project -> Position -> CandidateApplication
            q_health = select(
                Project.id,
                func.count(CandidateApplication.id).label("app_count")
            ).select_from(Project).join(
                Position, Project.id == Position.project_id
            ).join(
                CandidateApplication, Position.id == CandidateApplication.position_id
            ).where(
                Project.organization_id == org_id,
                Project.status == "active",
                Project.is_deleted == False,
                CandidateApplication.is_deleted == False
            ).group_by(Project.id)
            
            res_health = await self.session.execute(q_health)
            health_rows = res_health.all()
            
            # Map of project_id -> app_count for projects with at least 1 applicant
            app_counts = {row.id: row.app_count for row in health_rows}
            
            # We also need to account for active projects with 0 applicants (they won't show up in the join)
            # Fetch all active project IDs to compare
            q_all_active = select(Project.id).where(
                Project.organization_id == org_id,
                Project.status == "active",
                Project.is_deleted == False
            )
            res_all_active = await self.session.execute(q_all_active)
            all_active_pids = res_all_active.scalars().all()
            
            on_track_count = 0
            at_risk_count = 0
            
            for pid in all_active_pids:
                p_app_count = app_counts.get(pid, 0)
                if p_app_count < 2:
                    at_risk_count += 1
                else:
                    on_track_count += 1

            # 4. Quality (One query for all scores)
            q_scores = select(CandidateStageProgress.score).join(
                CandidateApplication
            ).where(
                CandidateApplication.organization_id == org_id,
                CandidateStageProgress.stage_type == "assessment",
                CandidateStageProgress.score.isnot(None)
            )
            
            res_scores = await self.session.execute(q_scores)
            scores = [float(s) for s in res_scores.scalars().all()]
            
            high_quality = sum(1 for s in scores if s > 80)
            needs_improve = len(scores) - high_quality
            
            if not scores and hires_count > 0:
                high_quality = hires_count
                needs_improve = 0

            return HealthAnalyticsResponse(
                health={"onTrack": on_track_count, "atRisk": at_risk_count},
                velocity=round(velocity, 1),
                quality={"high": high_quality, "needsImprove": needs_improve}
            )

        except Exception as e:
            print(f"Error fetching health analytics: {e}")
            return HealthAnalyticsResponse(
                health={"onTrack": 0, "atRisk": 0},
                velocity=0.0,
                quality={"high": 0, "needsImprove": 0}
            )

    async def get_payment_method(self) -> dict:
        """
        Get payment method details for the organization with safe fallbacks.
        """
        try:
            query = select(PaymentMethod).where(
                PaymentMethod.organization_id == self.organization_id
            )
            result = await self.session.execute(query)
            pms = result.scalars().all()
            
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
            import traceback
            traceback.print_exc()
            return None

    async def get_member_stats(self) -> MemberStatsResponse:
        """
        Get counts for Active Members, Pending Requests, and Open Roles using DB aggregations.
        """
        org_id = self.organization_id
        
        try:
            # 1. Members count by status
            q_members = select(OrganizationUser.status, func.count()).where(
                OrganizationUser.organization_id == org_id,
                OrganizationUser.is_deleted == False
            ).group_by(OrganizationUser.status)
            
            # 2. Open Roles count
            q_opens = select(func.count()).where(
                Position.organization_id == org_id,
                Position.status == "open",
                Position.is_deleted == False
            )
            
            res_members, res_opens = await asyncio.gather(
                self.session.execute(q_members),
                self.session.execute(q_opens)
            )
            
            members_rows = res_members.all()
            total_active = 0
            pending_requests = 0
            
            for status, count in members_rows:
                s = str(status).lower()
                if s == "active":
                    total_active += count
                elif s == "pending":
                    pending_requests += count
            
            open_roles = res_opens.scalar() or 0
            
            return MemberStatsResponse(
                totalActive=total_active,
                pendingRequests=pending_requests,
                openRoles=open_roles
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
            # The following lines were part of the instruction but are syntactically incorrect in this context.
            # They appear to be intended for a different function or a different part of the code.
            # result.append(PositionGroupResponse(
            # groupID=gid,
            # groupName=g.group_name,
            # candidatesCount=count,
            # status=g.status,
            # createdDate=g.created_at
            # ))
            # )

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
            
            return MemberRegisterResponse(success=True, userID=new_user.id)
            
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
                OrganizationUser.role == role
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
            if request.type.lower() == "hr":
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
                Position.organization_id == org_id
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
            
            res_pos, res_app_ids, res_groups, res_hire = await asyncio.gather(
                self.session.execute(q_pos),
                self.session.execute(q_app_ids),
                self.session.execute(q_groups),
                self.session.execute(q_hire)
            )
            
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
                q_prog = select(CandidateStageProgress.stage_type, func.count()).where(
                    CandidateStageProgress.application_id.in_(app_ids),
                    CandidateStageProgress.status == "completed"
                ).group_by(CandidateStageProgress.stage_type)
                
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
            res_user = await self.session.execute(
                select(OrganizationUser).where(OrganizationUser.id == user_id)
            )
            user_data = res_user.scalar_one_or_none()
            
            # 2. Fetch Organization Details
            res_org = await self.session.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org_data = res_org.scalar_one_or_none()
            
            if not user_data or not org_data:
                raise Exception("User or Org not found")
            
            # 3. Fetch User Preferences
            org_settings = org_data.settings or {}
            timezone = org_settings.get("timezone", "UTC-08:00 (Pacific Time)")
            
            # Construct response
            return {
                # Profile
                "first_name": user_data.first_name,
                "last_name": user_data.last_name,
                "email": user_data.email,
                "role": user_data.role,
                
                # Organization
                "organization_name": org_data.organization_name,
                "organization_email": org_data.admin_email,
                "timezone": timezone,
                
                # Preferences (Mocked/Default for now as partially supported)
                "email_notifications": True,
                "new_member_requests": True,
                "project_updates": True,
                "weekly_summary": False,
                "two_factor_auth": False,
                "session_timeout": True
            }
            
        except Exception as e:
            print(f"Error fetching settings: {e}")
            raise HTTPException(status_code=500, detail="Failed to fetch settings")

    async def update_profile(self, first_name: str | None, last_name: str | None, email: str | None) -> bool:
        """Update admin user profile."""
        user_id = self.current_user.id
        
        try:
            res = await self.session.execute(
                select(OrganizationUser).where(OrganizationUser.id == user_id)
            )
            user = res.scalar_one_or_none()
            
            if not user:
                return False
                
            if first_name: user.first_name = first_name
            if last_name: user.last_name = last_name
            if email: user.email = email
            
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
            if email: org.admin_email = email
            
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

    async def get_subscription_plans(self) -> dict:
        """Fetch subscription plans from DB and calculate current usage with safe fallbacks."""
        org_id = self.organization_id

        
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
            "nextBillingDate": "Mar 4, 2026"
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
            
            res_pos, res_apps = await asyncio.gather(
                self.session.execute(q_pos),
                self.session.execute(q_apps)
            )
            
            active_positions = res_pos.scalar() or 0
            total_apps = res_apps.scalar() or 0
            
            default_usage["activePositions"] = active_positions
            default_usage["candidatesProcessed"] = total_apps
            
            # 4. Map current plan details
            if org and org.plan_id:
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
            return results
        except Exception as e:
            print(f"Error fetching recent assignments: {e}")
            return []

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
            
            result = []
            for group, job_title in rows:
                gid = group.id
                
                # Count candidates in this group
                # Using CandidateApplication.group_id if it exists, or linking via stage progress?
                # RecruiterService uses CandidateApplication.group_id
                q_count = select(func.count()).where(
                    CandidateApplication.group_id == gid,
                    CandidateApplication.is_deleted == False
                )
                res_count = await self.session.execute(q_count)
                count = res_count.scalar() or 0
                
                result.append({
                    "groupID": str(gid),
                    "id": str(gid), # Helper for frontend
                    "groupName": group.group_name,
                    "positionTitle": job_title,
                    "candidatesCount": count,
                    "status": group.status,
                    "createdDate": group.created_at
                })
            return result
        except Exception as e:
            print(f"Error listing organization groups: {e}")
            return []
