"""
Candidate Dashboard Service.

Provides data for the candidate portal dashboard.
"""
import logging
from uuid import UUID
from sqlalchemy import text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.exceptions import NotFoundException
from app.models import (
    CandidateProfile,
    CandidateApplication,
    CandidateGroup,
    Position,
    Assessment,
    AIInterviewConfig,
)

logger = logging.getLogger(__name__)


class CandidateDashboardService:
    """Service for candidate dashboard data."""
    
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_home(self, candidate_id: UUID, candidate: "CandidateProfile" = None, group_id: UUID | None = None) -> dict:
        """
        Get dashboard home data for a candidate.
        
        Returns candidate profile, application status, group info, project, 
        current stage, stages pipeline, and notifications.
        """
        
        try:
            # Get candidate profile
            profile_result = await self.session.execute(
                text("""
                    SELECT candidate_id, email, full_name, avatar_url, organization_id
                    FROM candidate_profiles 
                    WHERE candidate_id = :cid
                """),
                {"cid": str(candidate_id)}
            )
            profile_row = profile_result.fetchone()
            
            if not profile_row:
                return {
                    "profile": None,
                    "application": None,
                    "group": None,
                    "position": None,
                    "project": None,
                    "current_stage": None,
                    "stages": [],
                    "notifications": [],
                }
            
            profile = {
                "candidate_id": str(profile_row[0]),
                "email": profile_row[1],
                "full_name": profile_row[2],
                "avatar_url": profile_row[3],
            }
            
            # Get application info with position and project details
            query = """
                SELECT 
                    ca.application_id, 
                    ca.status, 
                    ca.applied_at, 
                    ca.group_id, 
                    ca.position_id,
                    p.job_title,
                    p.job_description,
                    pr.project_id,
                    pr.name as project_name,
                    pr.description as project_description,
                    cg.group_id,
                    cg.group_name
                FROM candidate_applications ca
                LEFT JOIN positions p ON ca.position_id = p.position_id
                LEFT JOIN projects pr ON p.project_id = pr.project_id
                LEFT JOIN candidate_groups cg ON ca.group_id = cg.group_id
                WHERE ca.candidate_id = :cid AND ca.is_deleted = false
            """
            params = {"cid": str(candidate_id)}
            
            if group_id:
                query += " AND ca.group_id = :gid"
                params["gid"] = str(group_id)
                
            query += " ORDER BY ca.applied_at DESC LIMIT 1"

            app_result = await self.session.execute(
                text(query),
                params
            )
            app_row = app_result.fetchone()
            
            # Debug: print query result
            print(f"[DEBUG] get_home for candidate_id={candidate_id}")
            print(f"[DEBUG] app_row result: {app_row}")
            
            if not app_row:
                print(f"[DEBUG] No application found, returning early")
                return {
                    "profile": profile,
                    "application": None,
                    "group": None,
                    "position": None,
                    "project": None,
                    "current_stage": None,
                    "stages": [],
                    "notifications": [],
                }
            
            application = {
                "application_id": str(app_row[0]),
                "status": app_row[1],
                "applied_at": app_row[2].isoformat() if app_row[2] else None,
            }
            
            position = {
                "position_id": str(app_row[4]) if app_row[4] else None,
                "job_title": app_row[5],
                "job_description": app_row[6],
            } if app_row[4] else None
            
            project = {
                "project_id": str(app_row[7]) if app_row[7] else None,
                "name": app_row[8],
                "description": app_row[9],
            } if app_row[7] else None
            
            group = {
                "group_id": str(app_row[10]) if app_row[10] else None,
                "group_name": app_row[11],
            } if app_row[10] else None
            
            # Get stages pipeline and current stage
            stages = []
            current_stage = None
            
            if app_row[3]:  # group_id exists
                # Get stage configs for the group
                stage_configs_result = await self.session.execute(
                    text("""
                        SELECT 
                            gps.stage_id,
                            gps.stage_type,
                            gps.stage_order,
                            gps.config_id,
                            gps.state,
                            gps.stage_name,
                            COALESCE(cpp.status, 'locked') as progress_status,
                            cpp.score,
                            cpp.started_at,
                            cpp.completed_at,
                            -- Get title from appropriate config table
                            CASE gps.stage_type
                                WHEN 'assessment' THEN (SELECT title FROM assessments WHERE assessment_id = gps.config_id)
                                WHEN 'ai_interview' THEN (SELECT title FROM ai_interview_configs WHERE config_id = gps.config_id)
                                WHEN 'live_interview' THEN (SELECT title FROM live_interview_configs WHERE config_id = gps.config_id)
                            END as stage_title
                        FROM group_pipeline_stages gps
                        LEFT JOIN candidate_pipeline_progress cpp 
                            ON cpp.application_id = :app_id 
                            AND cpp.stage_id = gps.stage_id
                        WHERE gps.group_id = :gid
                        ORDER BY gps.stage_order
                    """),
                    {"gid": str(app_row[3]), "app_id": str(app_row[0])}
                )
                stage_rows = stage_configs_result.fetchall()
                
                for row in stage_rows:
                    stage_type = row[1]
                    stage_order = row[2]
                    stage_name = row[5]
                    progress_status = row[6] or "locked"
                    
                    # Create human-readable title
                    title = row[10] or stage_name or stage_type.replace("_", " ").title()
                    
                    stage_data = {
                        "stage_id": str(row[0]),
                        "stage_type": stage_type,
                        "stage_order": stage_order,
                        "status": progress_status,
                        "title": title,
                        "score": float(row[7]) if row[7] else None,
                        "started_at": row[8].isoformat() if row[8] else None,
                        "completed_at": row[9].isoformat() if row[9] else None,
                    }
                    stages.append(stage_data)
                    
                    # Determine current stage (first unlocked or in_progress)
                    if current_stage is None and progress_status in ("unlocked", "in_progress"):
                        current_stage = stage_data.copy()
            
            # Generate REAL notifications based on actual stage progress
            notifications = []
            notif_id = 1
            for stg in stages:
                if stg["status"] == "completed":
                    notifications.append({
                        "id": notif_id,
                        "type": "success",
                        "title": f"{stg['title']} Completed",
                        "message": f"You have successfully completed {stg['title']}.",
                        "time": stg.get("completed_at", ""),
                        "read": True,
                    })
                    notif_id += 1
                elif stg["status"] == "in_progress":
                    notifications.append({
                        "id": notif_id,
                        "type": "warning",
                        "title": f"{stg['title']} In Progress",
                        "message": f"You have started {stg['title']}. Continue to complete it.",
                        "time": stg.get("started_at", ""),
                        "read": False,
                    })
                    notif_id += 1
                elif stg["status"] == "unlocked":
                    notifications.append({
                        "id": notif_id,
                        "type": "info",
                        "title": f"{stg['title']} Available",
                        "message": f"{stg['title']} is now unlocked and ready to start.",
                        "time": "",
                        "read": False,
                    })
                    notif_id += 1
                # locked stages get no notification
            
            return {
                "profile": profile,
                "application": application,
                "group": group,
                "position": position,
                "project": project,
                "current_stage": current_stage,
                "stages": stages,
                "notifications": notifications,
            }
            
        except Exception as e:
            logger.error(f"[ERROR] get_home failed for candidate_id={candidate_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "profile": {"candidate_id": str(candidate_id)},
                "application": None,
                "group": None,
                "position": None,
                "project": None,
                "current_stage": None,
                "stages": [],
                "notifications": [],
            }


    async def get_assessments(self, candidate_id: UUID, group_id: UUID | None = None) -> list[dict]:
        """
        Get list of assessments/stages available for the candidate.
        Returns stages with their status (locked, unlocked, in_progress, completed).
        Uses raw SQL with correct tables: group_pipeline_stages + candidate_pipeline_progress.
        """
        # 1. Get active application
        query = """
            SELECT application_id, group_id, status
            FROM candidate_applications
            WHERE candidate_id = :cid AND is_deleted = false
        """
        params = {"cid": str(candidate_id)}
        
        if group_id:
            query += " AND group_id = :gid"
            params["gid"] = str(group_id)
            
        query += " ORDER BY applied_at DESC LIMIT 1"
        
        app_result = await self.session.execute(
            text(query),
            params
        )
        app_row = app_result.mappings().first()
        if not app_row or not app_row["group_id"]:
            return []

        # 2. Get stages with progress
        stages_result = await self.session.execute(
            text("""
                SELECT
                    gps.stage_id, gps.stage_type, gps.stage_order,
                    gps.config_id, gps.state, gps.stage_name,
                    COALESCE(cpp.status, 'locked') as progress_status,
                    CASE gps.stage_type
                        WHEN 'assessment' THEN (SELECT title FROM assessments WHERE assessment_id = gps.config_id)
                        WHEN 'ai_interview' THEN (SELECT title FROM ai_interview_configs WHERE config_id = gps.config_id)
                        WHEN 'live_interview' THEN 'Live Interview'
                    END as stage_title,
                    CASE gps.stage_type
                        WHEN 'assessment' THEN (SELECT duration_minutes::text || ' mins' FROM assessments WHERE assessment_id = gps.config_id)
                        WHEN 'ai_interview' THEN '30-45 mins'
                        WHEN 'live_interview' THEN '45-60 mins'
                    END as duration
                FROM group_pipeline_stages gps
                LEFT JOIN candidate_pipeline_progress cpp
                    ON cpp.application_id = :app_id
                    AND cpp.stage_id = gps.stage_id
                WHERE gps.group_id = :gid
                ORDER BY gps.stage_order
            """),
            {"app_id": str(app_row["application_id"]), "gid": str(app_row["group_id"])}
        )
        stage_rows = stages_result.mappings().all()

        assessments = []
        for row in stage_rows:
            title = row["stage_title"] or row["stage_name"] or row["stage_type"].replace("_", " ").title()
            assessments.append({
                "id": str(row["stage_id"]),
                "type": row["stage_type"],
                "stage_order": row["stage_order"],
                "status": row["progress_status"],
                "title": title,
                "description": f"Complete the {title}",
                "expectedTime": row["duration"] or "Unknown",
            })

        return assessments

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================
    
    async def _get_profile(self, candidate_id: UUID) -> dict:
        """Get candidate profile as dict."""
        stmt = select(CandidateProfile).where(CandidateProfile.candidate_id == candidate_id)
        result = await self.session.execute(stmt)
        profile = result.scalar_one_or_none()
        
        if not profile:
            raise NotFoundException("Candidate profile not found")
        
        return {
            "candidate_id": str(profile.candidate_id),
            "email": profile.email,
            "full_name": profile.full_name,
            "avatar_url": profile.avatar_url,
        }
    
    async def _get_active_application(self, candidate_id: UUID) -> CandidateApplication | None:
        """Get the most recent active application for a candidate."""
        try:

            stmt = (
                select(CandidateApplication)
                .where(
                    CandidateApplication.candidate_id == candidate_id,
                    # CandidateApplication.is_deleted == False,
                )
                .order_by(CandidateApplication.applied_at.desc())
                .limit(1)
            )
            result = await self.session.execute(stmt)
            return result.scalar_one_or_none()

        except Exception as e:
            print(f"\n[DEBUG ERROR] _get_active_application failed: {str(e)}\n")
            # import traceback
            # traceback.print_exc()
            return None
    
    async def _get_group(self, group_id: UUID) -> CandidateGroup | None:
        """Get candidate group by ID."""
        stmt = select(CandidateGroup).where(CandidateGroup.group_id == group_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def _get_position(self, position_id: UUID) -> Position | None:
        """Get position by ID."""
        stmt = select(Position).where(Position.position_id == position_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    # Removed _get_stage_configs, _get_stage_progress_map, _get_stage_details
    # These used incorrect ORM models. Now using raw SQL in get_home and get_assessments.
