"""
Candidate Dashboard Service.

Provides data for the candidate portal dashboard.
"""
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


class CandidateDashboardService:
    """Service for candidate dashboard data."""
    
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_home(self, candidate_id: UUID, candidate: "CandidateProfile" = None) -> dict:
        """
        Get dashboard home data for a candidate.
        
        Returns candidate profile, application status, group info, and current stage.
        """
        # Simple approach - return basic candidate info without complex joins
        # This avoids potential model/query issues
        from sqlalchemy import text
        
        try:
            # Use raw SQL to avoid model issues
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
                    "current_stage": None,
                }
            
            profile = {
                "candidate_id": str(profile_row[0]),
                "email": profile_row[1],
                "full_name": profile_row[2],
                "avatar_url": profile_row[3],
            }
            
            # Get application info
            app_result = await self.session.execute(
                text("""
                    SELECT application_id, status, applied_at, group_id, position_id
                    FROM candidate_applications 
                    WHERE candidate_id = :cid AND is_deleted = false
                    ORDER BY applied_at DESC
                    LIMIT 1
                """),
                {"cid": str(candidate_id)}
            )
            app_row = app_result.fetchone()
            
            if not app_row:
                return {
                    "profile": profile,
                    "application": None,
                    "group": None,
                    "position": None,
                    "current_stage": None,
                }
            
            application = {
                "application_id": str(app_row[0]),
                "status": app_row[1],
                "applied_at": app_row[2].isoformat() if app_row[2] else None,
            }
            
            # Get group info if exists
            group = None
            if app_row[3]:  # group_id
                group_result = await self.session.execute(
                    text("""
                        SELECT group_id, group_name
                        FROM candidate_groups 
                        WHERE group_id = :gid
                    """),
                    {"gid": str(app_row[3])}
                )
                group_row = group_result.fetchone()
                if group_row:
                    group = {
                        "group_id": str(group_row[0]),
                        "group_name": group_row[1],
                    }
            
            # Get position info
            position = None
            if app_row[4]:  # position_id
                pos_result = await self.session.execute(
                    text("""
                        SELECT position_id, job_title
                        FROM positions 
                        WHERE position_id = :pid
                    """),
                    {"pid": str(app_row[4])}
                )
                pos_row = pos_result.fetchone()
                if pos_row:
                    position = {
                        "position_id": str(pos_row[0]),
                        "job_title": pos_row[1],
                    }
            
            return {
                "profile": profile,
                "application": application,
                "group": group,
                "position": position,
                "current_stage": None,  # Simplified for now
            }
            
        except Exception as e:
            print(f"[DEBUG ERROR] get_home failed: {e}")
            import traceback
            traceback.print_exc()
            # Return minimal data on error
            return {
                "profile": {"candidate_id": str(candidate_id)},
                "application": None,
                "group": None,
                "position": None,
                "current_stage": None,
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
