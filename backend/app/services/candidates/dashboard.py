"""
Candidate Dashboard Service.

Provides data for the candidate portal dashboard.
"""
import logging
from uuid import UUID
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.exceptions import NotFoundException
from app.models import (
    CandidateProfile,
    CandidateApplication,
    CandidateGroup,
    GroupStageConfig,
    CandidateStageProgress,
    Position,
    Assessment,
    AIInterviewConfig,
)

logger = logging.getLogger(__name__)


class CandidateDashboardService:
    """Service for candidate dashboard data."""
    
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_home(self, candidate_id: UUID, candidate: "CandidateProfile" = None) -> dict:
        """
        Get dashboard home data for a candidate.
        
        Returns candidate profile, application status, group info, project, 
        current stage, stages pipeline, and notifications.
        """
        from sqlalchemy import text
        
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
            app_result = await self.session.execute(
                text("""
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
                    ORDER BY ca.applied_at DESC
                    LIMIT 1
                """),
                {"cid": str(candidate_id)}
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
                            gsc.config_id,
                            gsc.stage_type,
                            gsc.stage_order,
                            gsc.stage_config_id,
                            gsc.state,
                            COALESCE(csp.status, 'locked') as progress_status,
                            csp.score,
                            csp.started_at,
                            csp.completed_at,
                            -- Get title from appropriate config table
                            CASE gsc.stage_type
                                WHEN 'assessment' THEN (SELECT title FROM assessments WHERE assessment_id = gsc.stage_config_id)
                                WHEN 'ai_interview' THEN (SELECT title FROM ai_interview_configs WHERE config_id = gsc.stage_config_id)
                                WHEN 'live_interview' THEN (SELECT title FROM live_interview_configs WHERE config_id = gsc.stage_config_id)
                            END as stage_title
                        FROM group_stage_config gsc
                        LEFT JOIN candidate_stage_progress csp 
                            ON csp.application_id = :app_id 
                            AND csp.stage_type = gsc.stage_type 
                            AND csp.stage_order = gsc.stage_order
                        WHERE gsc.group_id = :gid
                        ORDER BY gsc.stage_order
                    """),
                    {"gid": str(app_row[3]), "app_id": str(app_row[0])}
                )
                stage_rows = stage_configs_result.fetchall()
                
                for row in stage_rows:
                    stage_type = row[1]
                    stage_order = row[2]
                    progress_status = row[5] or "locked"
                    
                    # Create human-readable title
                    title = row[9] or stage_type.replace("_", " ").title()
                    
                    stage_data = {
                        "config_id": str(row[0]),
                        "stage_type": stage_type,
                        "stage_order": stage_order,
                        "status": progress_status,
                        "title": title,
                        "score": float(row[6]) if row[6] else None,
                        "started_at": row[7].isoformat() if row[7] else None,
                        "completed_at": row[8].isoformat() if row[8] else None,
                    }
                    stages.append(stage_data)
                    
                    # Determine current stage (first unlocked or in_progress)
                    if current_stage is None and progress_status in ("unlocked", "in_progress"):
                        current_stage = stage_data.copy()
            
            # Generate mock notifications for UI
            notifications = [
                {
                    "id": 1,
                    "type": "success",
                    "title": "Assessment Completed",
                    "message": "You have successfully completed the technical assessment.",
                    "time": "2 hours ago",
                    "read": False
                },
                {
                    "id": 2,
                    "type": "info",
                    "title": "Next Step Available",
                    "message": "Your AI interview is now unlocked and ready to start.",
                    "time": "1 hour ago",
                    "read": False
                },
            ] if current_stage else []
            
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

    async def get_assessments(self, candidate_id: UUID) -> list[dict]:
        """
        Get list of assessments/stages available for the candidate.
        
        Returns stages with their status (locked, unlocked, in_progress, completed).
        """
        application = await self._get_active_application(candidate_id)
        
        if not application or not application.group_id:
            return []
        
        # Get stage configs for this group
        stage_configs = await self._get_stage_configs(application.group_id)
        
        # Get candidate's progress on each stage
        progress_map = await self._get_stage_progress_map(application.application_id)
        
        assessments = []
        for i, stage in enumerate(stage_configs):
            stage_key = f"{stage.stage_type}_{stage.stage_order}"
            progress = progress_map.get(stage_key)
            
            # Determine status
            if progress:
                status = progress.status
            else:
                # Check if previous stage is completed
                if i == 0:
                    status = "unlocked"  # First stage is always unlocked
                else:
                    prev_key = f"{stage_configs[i-1].stage_type}_{stage_configs[i-1].stage_order}"
                    prev_progress = progress_map.get(prev_key)
                    if prev_progress and prev_progress.status == "completed":
                        status = "unlocked"
                    else:
                        status = "locked"
            
            # Get stage details based on type
            stage_details = await self._get_stage_details(stage)
            
            assessments.append({
                "id": str(stage.config_id),
                "type": stage.stage_type,
                "stage_order": stage.stage_order,
                "status": status,
                "title": stage_details.get("title", f"Stage {stage.stage_order}: {stage.stage_type}"),
                "description": stage_details.get("description", ""),
                "expectedTime": stage_details.get("duration", "Unknown"),
                "questions": stage_details.get("questions"),
                "parts": stage_details.get("parts"),
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
                    CandidateApplication.is_deleted == False,
                )
                .order_by(CandidateApplication.applied_at.desc())
                .limit(1)
            )
            result = await self.session.execute(stmt)
            return result.scalar_one_or_none()
        except Exception as e:
            print(f"[DEBUG ERROR] _get_active_application failed: {e}")
            import traceback
            traceback.print_exc()
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
    
    async def _get_stage_configs(self, group_id: UUID) -> list[GroupStageConfig]:
        """Get stage configs for a group, ordered by stage_order."""
        stmt = (
            select(GroupStageConfig)
            .where(GroupStageConfig.group_id == group_id)
            .order_by(GroupStageConfig.stage_order)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def _get_stage_progress_map(self, application_id: UUID) -> dict:
        """Get map of stage progress keyed by 'stage_type_stage_order'."""
        stmt = select(CandidateStageProgress).where(
            CandidateStageProgress.application_id == application_id
        )
        result = await self.session.execute(stmt)
        progress_list = result.scalars().all()
        
        return {
            f"{p.stage_type}_{p.stage_order}": p
            for p in progress_list
        }
    
    async def _get_stage_details(self, stage: GroupStageConfig) -> dict:
        """Get title and details for a stage based on its type and config."""
        if stage.stage_type == "assessment":
            # Try to get assessment config
            stmt = select(Assessment).where(Assessment.id == stage.stage_config_id)
            result = await self.session.execute(stmt)
            assessment = result.scalar_one_or_none()
            
            if assessment:
                # Count questions from structure
                question_count = 0
                if assessment.structure and isinstance(assessment.structure, dict):
                    sections = assessment.structure.get("sections", [])
                    for section in sections:
                        question_count += len(section.get("question_ids", []))
                
                return {
                    "title": assessment.title,
                    "description": assessment.instructions or "Complete the technical assessment",
                    "duration": f"{assessment.duration_minutes} mins",
                    "questions": f"{question_count} questions" if question_count else None,
                }
        
        elif stage.stage_type == "ai_interview":
            stmt = select(AIInterviewConfig).where(AIInterviewConfig.id == stage.stage_config_id)
            result = await self.session.execute(stmt)
            config = result.scalar_one_or_none()
            
            if config:
                question_count = 0
                if config.questions and isinstance(config.questions, list):
                    question_count = len(config.questions)
                
                return {
                    "title": config.title,
                    "description": config.instructions or "Complete the AI interview",
                    "duration": "30-45 mins",
                    "parts": f"{question_count} parts" if question_count else "5 parts",
                }
        
        elif stage.stage_type == "live_interview":
            return {
                "title": "Live Interview",
                "description": "Schedule and complete a live interview with the hiring team",
                "duration": "45-60 mins",
                "parts": "1 part",
            }
        
        # Default fallback
        return {
            "title": stage.stage_type.replace("_", " ").title(),
            "description": f"Complete the {stage.stage_type.replace('_', ' ')} stage",
            "duration": "Unknown",
        }
