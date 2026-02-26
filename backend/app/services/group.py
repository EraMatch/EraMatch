"""
Group management service — real DB queries for the EnhancedGroupOverviewV2 page.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import asyncio
from sqlalchemy import select, func, or_, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundException
from app.models import (
    AssessmentSection,
    CandidateApplication,
    CandidateGroup,
    CandidateProfile,
    CandidateStageProgress,
    GroupStageConfig,
    OngoingAssessment,
    OngoingInterview,
    OrganizationUser,
    Position,
    ProctoringFlag,
    RecruiterNote,
    Offer,
    RecruiterAssignmentLog,
    PipelineTransition,
    Notification,
    SystemLog,
    AIInterviewConfig,
    Assessment,
    User,
)
from app.schemas.group import (
    AcceptanceCriteriaResponse,
    AcceptanceCriteriaUpdate,
    AcceptanceCriteriaUpdateResponse,
    ActivityItem,
    ActivityLogResponse,
    ActivityUser,
    AssessmentConfig,
    AssessmentMonitoringCandidate,
    AssessmentMonitoringResponse,
    AssignedHRResponse,
    AssignInterviewRequest,
    AssignInterviewResponse,
    CandidateDetailResponse,
    CandidateNoteCreate,
    CandidateNoteResponse,
    CandidateProgressItem,
    CandidateProgressResponse,
    CandidateScores,
    CandidateStageStatus,
    FiltrationFlowStage,
    GroupAssessmentItem,
    GroupInterviewItem,
    GroupDetailResponse,
    GroupStatsResponse,
    IntegrityFlag,
    IntegrityFlagDetail,
    IntegrityFlagsResponse,
    MonitoringFlag,
    StageStatsResponse,
)


class GroupService:
    """Business logic for group management endpoints."""

    def __init__(self, session: AsyncSession, current_user: User):
        self.session = session
        self.user = current_user
        self.org_id = current_user.organization_id

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _get_group(self, group_id: UUID) -> CandidateGroup:
        res = await self.session.execute(
            select(CandidateGroup).where(
                CandidateGroup.id == group_id,
                CandidateGroup.organization_id == self.org_id,
            )
        )
        group = res.scalars().first()
        if not group:
            raise NotFoundException("Group not found")
        return group

    async def _get_position_for_group(self, group: CandidateGroup) -> Position:
        res = await self.session.execute(
            select(Position).where(Position.id == group.position_id)
        )
        pos = res.scalars().first()
        if not pos:
            raise NotFoundException("Position not found for group")
        return pos


    async def _get_candidates_progress_data(
        self, group_id: UUID, filter_str: str | None = None, sort_str: str | None = None
    ) -> list[CandidateProgressItem]:
        # Acceptance criteria for meets_criteria calculation
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(GroupStageConfig.group_id == group_id)
        )
        stage_configs = sc_res.scalars().all()
        min_score = 70.0
        allowed_risk = "Low"
        for sc in stage_configs:
            if sc.acceptance_criteria and isinstance(sc.acceptance_criteria, dict):
                min_score = sc.acceptance_criteria.get("min_technical_score", min_score)
                min_score = sc.acceptance_criteria.get("min_technical_score", min_score)
                allowed_integrity_risk = sc.acceptance_criteria.get("allowed_integrity_risk", allowed_risk)

        # Fetch applications + candidate profiles
        q = (
            select(CandidateApplication, CandidateProfile)
            .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
            .where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.is_deleted == False,
            )
        )
        res = await self.session.execute(q)
        rows = res.all()

        if not rows:
            return []

        app_ids = [app.id for app, _ in rows]

        # Fetch stage progress for all apps in one query
        prog_res = await self.session.execute(
            select(CandidateStageProgress, GroupStageConfig.stage_type)
            .join(GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id)
            .where(
                CandidateStageProgress.application_id.in_(app_ids),
                GroupStageConfig.group_id == group_id,
            )
        )
        all_progress = prog_res.all()
        # Index by (application_id, stage_type)
        prog_map: dict[tuple[UUID, str], CandidateStageProgress] = {}
        for p, s_type in all_progress:
            prog_map[(p.application_id, s_type)] = p

        # Fetch flags
        flag_res = await self.session.execute(
            select(ProctoringFlag).where(ProctoringFlag.application_id.in_(app_ids))
        )
        all_flags = flag_res.scalars().all()
        flag_map: dict[UUID, list[ProctoringFlag]] = {}
        for f in all_flags:
            flag_map.setdefault(f.application_id, []).append(f)

        # Fetch notes existence
        notes_res = await self.session.execute(
            select(RecruiterNote.application_id).where(
                RecruiterNote.application_id.in_(app_ids)
            )
        )
        apps_with_notes = set(notes_res.scalars().all())

        risk_levels = {"high": 3, "medium": 2, "low": 1, "none": 0}
        allowed_level = risk_levels.get(allowed_risk.lower(), 1)

        items: list[CandidateProgressItem] = []
        for app, cand in rows:
            assess_prog = prog_map.get((app.id, "assessment"))
            ai_prog = prog_map.get((app.id, "ai_interview"))

            assess_score = float(assess_prog.score) if assess_prog and assess_prog.score is not None else None
            ai_score = float(ai_prog.score) if ai_prog and ai_prog.score is not None else None

            assess_status = assess_prog.status if assess_prog else "pending"
            ai_status = ai_prog.status if ai_prog else "pending"

            app_flags = flag_map.get(app.id, [])
            integrity_flags = [
                IntegrityFlag(
                    severity=f.severity,
                    stage=f.session_type,
                    description=f.event_type,
                )
                for f in app_flags
            ]

            # Determine meets_criteria
            max_flag_sev = max(
                (risk_levels.get(f.severity.lower(), 0) for f in app_flags), default=0
            )
            score_ok = (assess_score is not None and assess_score >= min_score) if assess_score is not None else True
            risk_ok = max_flag_sev <= allowed_level
            meets = score_ok and risk_ok

            # Verdict
            if assess_status == "completed" and ai_status == "completed":
                verdict = "pass" if meets else "fail"
            elif assess_status == "completed" or ai_status == "completed":
                verdict = "conditional"
            else:
                verdict = "pending"

            items.append(CandidateProgressItem(
                application_id=app.id,
                candidate_id=cand.id,
                name=cand.full_name,
                email=cand.email,
                assessment=CandidateStageStatus(score=assess_score, status=assess_status),
                ai_interview=CandidateStageStatus(score=ai_score, status=ai_status),
                meets_criteria=meets,
                verdict=verdict,
                flags=integrity_flags,
                status=app.status.replace("_", " ").title() if app.status else "Active",
                has_notes=app.id in apps_with_notes,
            ))
        
        # Apply filters
        if filter_str:
            fl = filter_str.lower()
            if fl == "completed":
                items = [i for i in items if i.assessment.status == "completed" and i.ai_interview.status == "completed"]
            elif fl == "flagged":
                items = [i for i in items if i.flags]
            elif fl == "pending":
                items = [i for i in items if i.assessment.status != "completed" or i.ai_interview.status != "completed"]

        # Apply sort
        if sort_str:
            if sort_str == "score":
                items.sort(key=lambda i: (i.assessment.score or 0), reverse=True)
            elif sort_str == "name":
                items.sort(key=lambda i: i.name.lower())

        return items

    # ── 1. GET /recruiter/groups/{groupId} ────────────────────────────────────

    async def get_group_details(self, group_id: UUID) -> GroupDetailResponse:
        group = await self._get_group(group_id)
        position = await self._get_position_for_group(group)

        # Assigned HR
        assigned_hr: AssignedHRResponse | None = None
        if group.assigned_hr_id:
            res_hr = await self.session.execute(
                select(OrganizationUser).where(OrganizationUser.id == group.assigned_hr_id)
            )
            hr = res_hr.scalars().first()
            if hr:
                assigned_hr = AssignedHRResponse(id=hr.id, name=f"{hr.first_name} {hr.last_name}")

        # Build flow from GroupStageConfig rows (sole authoritative source)
        stage_configs_res = await self.session.execute(
            select(GroupStageConfig)
            .where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.state != 'inactive'
            )
            .order_by(GroupStageConfig.stage_order)
        )
        stage_configs = stage_configs_res.scalars().all()

        flow = [
            FiltrationFlowStage(order=sc.stage_order, stage=sc.stage_type, status=sc.state)
            for sc in stage_configs
        ]

        # Assessment / interview config ids from stage configs
        assessment_config_id: UUID | None = None
        interview_config_id: UUID | None = None
        for sc in stage_configs:
            if sc.stage_type == "assessment" and sc.acceptance_criteria:
                assessment_config_id = sc.acceptance_criteria.get("assessment_id") if isinstance(sc.acceptance_criteria, dict) else None
            if sc.stage_type in ["ai_interview", "live_interview"] and sc.acceptance_criteria:
                found_id = sc.acceptance_criteria.get("interview_config_id") if isinstance(sc.acceptance_criteria, dict) else None
                if found_id:
                    interview_config_id = found_id

        # Acceptance criteria — merge from all stage configs
        criteria = AcceptanceCriteriaResponse()
        for sc in stage_configs:
            if sc.acceptance_criteria and isinstance(sc.acceptance_criteria, dict):
                if "min_technical_score" in sc.acceptance_criteria:
                    criteria.min_technical_score = sc.acceptance_criteria["min_technical_score"]
                if "allowed_integrity_risk" in sc.acceptance_criteria:
                    criteria.allowed_integrity_risk = sc.acceptance_criteria["allowed_integrity_risk"]
                if "required_verdict" in sc.acceptance_criteria:
                    criteria.required_verdict = sc.acceptance_criteria["required_verdict"]

        # Fetch detailed candidates
        candidates = await self._get_candidates_progress_data(group_id)

        # Calculate pipeline stages
        pipeline_stages = []
        from app.schemas.group import PipelineStage
        
        # Helper specific to frontend display names
        stage_names = {
            "assessment": "Technical Assessment",
            "ai_interview": "AI Interview",
            "live_interview": "Live Interview",
            "review": "Review",
            "offer": "Offer"
        }

        # Use flow to determine stages
        for stage_conf in flow:
            st_type = stage_conf.stage.lower().replace("-", "_") # normalize
            st_name = stage_names.get(st_type, stage_conf.stage.title())
            
            # Calculate stats
            total_c = len(candidates)
            completed_c = 0
            pending_c = 0
            
            if st_type == "assessment":
                completed_c = sum(1 for c in candidates if c.assessment.status == "completed")
                pending_c = sum(1 for c in candidates if c.assessment.status != "completed")
            elif st_type == "ai_interview":
                completed_c = sum(1 for c in candidates if c.ai_interview.status == "completed")
                pending_c = sum(1 for c in candidates if c.ai_interview.status != "completed")
            # TODO: Add logic for other stages if present in candidates model
            
            pipeline_stages.append(PipelineStage(
                id=stage_conf.stage.replace("_", "-"), # Normalize to frontend format (ai-interview)
                name=st_name,
                completed=completed_c,
                total=total_c,
                pending=pending_c,
                state=stage_conf.status or "not-started"
            ))

        # Fetch created assessments for this group
        assessments_res = await self.session.execute(
            select(Assessment).where(
                Assessment.group_id == group_id,
                Assessment.is_deleted == False
            ).order_by(Assessment.created_at.desc())
        )
        assessments_db = assessments_res.scalars().all()
        
        assessments_data = []
        if assessments_db:
            for a in assessments_db:
                sections_res = await self.session.execute(
                    select(func.count(AssessmentSection.id)).where(AssessmentSection.assessment_id == a.id)
                )
                sec_count = sections_res.scalar() or 0
                assessments_data.append(
                    GroupAssessmentItem(
                        id=a.id,
                        status=a.status,
                        config=AssessmentConfig(
                            title=a.title,
                            duration=a.duration_minutes,
                            difficulty="Medium" # Hardcoded since it is not saved on Assessment model
                        ),
                        sections=[{}] * sec_count # dummy list for frontend .length
                    )
                )

        interviews_res = await self.session.execute(
            select(AIInterviewConfig).where(
                AIInterviewConfig.position_id == group.position_id,
                AIInterviewConfig.is_deleted == False
            ).order_by(AIInterviewConfig.created_at.desc())
        )
        interviews_db = interviews_res.scalars().all()

        interviews_data = []
        if interviews_db:
            if not interview_config_id:
                interview_config_id = interviews_db[0].config_id

            for ic_db in interviews_db:
                q_count = len(ic_db.questions.get("items", [])) if isinstance(ic_db.questions, dict) else 0
                interviews_data.append(
                    GroupInterviewItem(
                        id=ic_db.config_id,
                        title=ic_db.title,
                        interview_type=ic_db.interview_type,
                        max_retakes=ic_db.max_retakes,
                        questions_count=q_count,
                        instructions=ic_db.instructions,
                        questions=ic_db.questions,
                        think_time_seconds=ic_db.think_time_seconds,
                        answer_time_seconds=ic_db.answer_time_seconds,
                        live_interview_context=ic_db.live_interview_context
                    )
                )
        return GroupDetailResponse(
            id=group.id,
            name=group.group_name,
            position_id=group.position_id,
            project_id=position.project_id,
            organization_id=group.organization_id,
            assigned_hr=assigned_hr,
            created_date=group.created_at,
            status=group.status,
            filtration_flow=flow,
            assessment_config_id=assessment_config_id,
            interview_config_id=interview_config_id,
            acceptance_criteria=criteria,
            candidates=candidates,
            pipeline_stages=pipeline_stages,
            assessments=assessments_data,
            interviews=interviews_data
        )

    # ── 2. GET /recruiter/groups/{groupId}/stats ──────────────────────────────

    async def get_group_stats(self, group_id: UUID) -> GroupStatsResponse:
        await self._get_group(group_id)

        # Application IDs in this group
        app_ids_res = await self.session.execute(
            select(CandidateApplication.id).where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.is_deleted == False,
            )
        )
        app_ids = app_ids_res.scalars().all()
        total = len(app_ids)

        if not app_ids:
            return GroupStatsResponse()

        # Assessment stats
        q_assess = select(
            func.count().label("completed"),
            func.avg(CandidateStageProgress.score).label("avg"),
        ).join(GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id).where(
            GroupStageConfig.group_id == group_id,
            GroupStageConfig.stage_type == "assessment",
            CandidateStageProgress.status == "completed",
        )

        # AI interview stats
        q_ai = select(
            func.count().label("completed"),
            func.avg(CandidateStageProgress.score).label("avg"),
        ).join(GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id).where(
            GroupStageConfig.group_id == group_id,
            GroupStageConfig.stage_type == "ai_interview",
            CandidateStageProgress.status == "completed",
        )

        # Offers
        q_offers = select(func.count()).where(Offer.application_id.in_(app_ids))

        # Flags
        q_flags = select(func.count()).where(ProctoringFlag.application_id.in_(app_ids))

        # Review count — candidates who finished all stages but no offer yet
        q_review = select(func.count()).where(
            CandidateApplication.id.in_(app_ids),
            CandidateApplication.status.in_(["in_pipeline", "screening"]),
        )

        res_assess, res_ai, res_offers, res_flags, res_review = await asyncio.gather(
            self.session.execute(q_assess),
            self.session.execute(q_ai),
            self.session.execute(q_offers),
            self.session.execute(q_flags),
            self.session.execute(q_review),
        )

        assess_row = res_assess.first()
        ai_row = res_ai.first()

        return GroupStatsResponse(
            technical_assessment=StageStatsResponse(
                completed=assess_row.completed if assess_row else 0,
                total=total,
                avg_score=round(float(assess_row.avg or 0), 1) if assess_row else 0.0,
            ),
            ai_interview=StageStatsResponse(
                completed=ai_row.completed if ai_row else 0,
                total=total,
                avg_score=round(float(ai_row.avg or 0), 1) if ai_row else 0.0,
            ),
            review={"count": res_review.scalar() or 0},
            offer={"count": res_offers.scalar() or 0},
            flagged={"count": res_flags.scalar() or 0},
        )

    # ── 3. GET /recruiter/groups/{groupId}/candidates/progress ───────────────

    async def get_candidate_progress(
        self, group_id: UUID, filter: str | None = None, sort: str | None = None
    ) -> CandidateProgressResponse:
        await self._get_group(group_id)
        items = await self._get_candidates_progress_data(group_id, filter, sort)
        return CandidateProgressResponse(candidates=items)

    # ── 4. POST /recruiter/groups/{groupId}/stages/start ─────────────────────

    async def start_stage(self, group_id: UUID, stage: str) -> dict:
        group = await self._get_group(group_id)

        # Get stage config
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == stage,
            )
        )
        stage_config = sc_res.scalars().first()

        # Update stage state
        if stage_config:
            stage_config.state = "active"
            stage_config.started_at = datetime.now(timezone.utc)
            self.session.add(stage_config)

        # Fetch eligible candidates (applications in this group)
        apps_res = await self.session.execute(
            select(CandidateApplication).where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.is_deleted == False,
            )
        )
        apps = apps_res.scalars().all()

        invitations_sent = 0
        for app in apps:
            # Create or unlock the stage progress entry
            prog_res = await self.session.execute(
                select(CandidateStageProgress).where(
                    CandidateStageProgress.application_id == app.id,
                    CandidateStageProgress.stage_id == stage_config.stage_id,
                )
            )
            prog = prog_res.scalars().first()
            if prog:
                if prog.status in ("locked", "not_started"):
                    prog.status = "unlocked"
                    prog.started_at = datetime.now(timezone.utc)
                    self.session.add(prog)
                    invitations_sent += 1
            else:
                new_prog = CandidateStageProgress(
                    application_id=app.id,
                    stage_id=stage_config.stage_id,
                    status="unlocked",
                    started_at=datetime.now(timezone.utc),
                )
                self.session.add(new_prog)
                invitations_sent += 1

            # Update application status
            if app.status in ("applied", "screening"):
                app.status = "in_pipeline"
                self.session.add(app)

        # Log the action in system_logs
        log = SystemLog(
            organization_id=self.org_id,
            user_id=self.user.id,
            action=f"stage_started:{stage}",
            entity_type="group",
            entity_id=group_id,
            details={"stage": stage, "invitations_sent": invitations_sent},
        )
        self.session.add(log)

        await self.session.commit()

        # Determine next stage
        next_stage = None
        if stage_config:
            next_res = await self.session.execute(
                select(GroupStageConfig.stage_type).where(
                    GroupStageConfig.group_id == group_id,
                    GroupStageConfig.stage_order > stage_config.stage_order,
                ).order_by(GroupStageConfig.stage_order).limit(1)
            )
            next_stage = next_res.scalars().first()

        return {
            "status": 1,
            "invitations_sent": invitations_sent,
            "stage": stage,
            "next_stage": next_stage,
        }

    # ── 5. GET /recruiter/groups/{groupId}/activity ──────────────────────────

    async def get_activity_log(
        self, group_id: UUID, limit: int = 50, offset: int = 0
    ) -> ActivityLogResponse:
        await self._get_group(group_id)

        # App IDs in this group for scoping
        app_ids_res = await self.session.execute(
            select(CandidateApplication.id).where(
                CandidateApplication.group_id == group_id,
            )
        )
        app_ids = app_ids_res.scalars().all()

        activities: list[ActivityItem] = []

        # 1. SystemLogs for this group
        sys_res = await self.session.execute(
            select(SystemLog, OrganizationUser)
            .outerjoin(OrganizationUser, SystemLog.user_id == OrganizationUser.id)
            .where(
                SystemLog.entity_type == "group",
                SystemLog.entity_id == group_id,
            )
            .order_by(SystemLog.created_at.desc())
        )
        for log, user in sys_res.all():
            activities.append(ActivityItem(
                id=log.id,
                timestamp=log.created_at,
                action_type=log.action.split(":")[0] if ":" in log.action else log.action,
                action=log.action.replace("_", " ").replace(":", " — ").title(),
                user=ActivityUser(id=user.id, name=f"{user.first_name} {user.last_name}") if user else None,
                details=str(log.details) if log.details else None,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
            ))

        # 2. Pipeline transitions for apps in this group
        if app_ids:
            pt_res = await self.session.execute(
                select(PipelineTransition, OrganizationUser)
                .outerjoin(OrganizationUser, PipelineTransition.triggered_by_user_id == OrganizationUser.id)
                .where(PipelineTransition.application_id.in_(app_ids))
                .order_by(PipelineTransition.created_at.desc())
            )
            for pt, user in pt_res.all():
                activities.append(ActivityItem(
                    id=pt.id,
                    timestamp=pt.created_at,
                    action_type="status_changed",
                    action=f"Status changed: {pt.from_status or 'N/A'} → {pt.to_status}",
                    user=ActivityUser(id=user.id, name=f"{user.first_name} {user.last_name}") if user else None,
                    details=pt.reason,
                    entity_type="candidate",
                    entity_id=pt.application_id,
                ))

        # 3. Recruiter assignment logs for this group
        ral_res = await self.session.execute(
            select(RecruiterAssignmentLog, OrganizationUser)
            .outerjoin(OrganizationUser, RecruiterAssignmentLog.user_id == OrganizationUser.id)
            .where(RecruiterAssignmentLog.group_id == group_id)
            .order_by(RecruiterAssignmentLog.created_at.desc())
        )
        for ral, user in ral_res.all():
            activities.append(ActivityItem(
                id=ral.id,
                timestamp=ral.created_at,
                action_type="recruiter_assigned",
                action=f"Recruiter {ral.action}",
                user=ActivityUser(id=user.id, name=f"{user.first_name} {user.last_name}") if user else None,
                details=None,
                entity_type="group",
                entity_id=group_id,
            ))

        # Sort all by timestamp desc
        activities.sort(key=lambda a: a.timestamp, reverse=True)
        total = len(activities)
        paginated = activities[offset : offset + limit]

        return ActivityLogResponse(activities=paginated, total_count=total)

    # ── 6. GET /recruiter/groups/export ───────────────────────────────────────

    async def export_group_csv(self, group_id: UUID) -> str:
        """Return CSV string with candidate progress data."""
        progress = await self.get_candidate_progress(group_id)

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Candidate Name", "Email", "Assessment Score", "Assessment Status",
            "Interview Score", "Interview Status", "Meets Criteria", "Verdict",
            "Flags", "Status",
        ])
        for c in progress.candidates:
            flag_str = "; ".join(
                f"{f.severity} — {f.description}" for f in c.flags
            ) if c.flags else ""
            writer.writerow([
                c.name,
                c.email,
                c.assessment.score if c.assessment.score is not None else "",
                c.assessment.status,
                c.ai_interview.score if c.ai_interview.score is not None else "",
                c.ai_interview.status,
                "Yes" if c.meets_criteria else "No",
                c.verdict,
                flag_str,
                c.status,
            ])
        return buf.getvalue()

    async def delete_group(self, group_id: UUID) -> None:
        """Soft delete a group and release all candidates."""
        try:
            # Check if group exists
            await self._get_group(group_id)

            gid_str = str(group_id)

            # 1. Release candidates (unlink from group)
            await self.session.execute(
                text(f"UPDATE candidate_applications SET group_id = NULL WHERE group_id = '{gid_str}'")
            )

            # 2. Soft delete group
            await self.session.execute(
                text(f"UPDATE candidate_groups SET status = 'archived' WHERE group_id = '{gid_str}'")
            )
            
            await self.session.commit()
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

    async def rename_group(self, group_id: UUID, new_name: str) -> GroupDetailResponse:
        """Rename a group."""
        group = await self._get_group(group_id)
        group.group_name = new_name
        self.session.add(group)
        await self.session.commit()
        return await self.get_group_details(group_id)

    # ── 7. GET /recruiter/groups/{groupId}/assessments/monitoring ─────────────

    async def get_assessment_monitoring(self, group_id: UUID) -> AssessmentMonitoringResponse:
        group = await self._get_group(group_id)

        # Get pass threshold from stage config
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == "assessment",
            )
        )
        sc = sc_res.scalars().first()
        pass_threshold = 70.0
        if sc and sc.acceptance_criteria and isinstance(sc.acceptance_criteria, dict):
            pass_threshold = sc.acceptance_criteria.get("min_technical_score", 70.0)

        # Pre-fetch the assessment stage_id for this group (authoritative source)
        assess_stage_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == "assessment",
            )
        )
        assess_stage = assess_stage_res.scalars().first()

        # Candidates + their assessment progress (join via stage_id, not legacy fields)
        q = (
            select(CandidateApplication, CandidateProfile, CandidateStageProgress)
            .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
            .outerjoin(
                CandidateStageProgress,
                (CandidateStageProgress.application_id == CandidateApplication.id)
                & (CandidateStageProgress.stage_id == assess_stage.stage_id if assess_stage else False),
            )
            .where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.is_deleted == False,
            )
        )
        res = await self.session.execute(q)
        rows = res.all()

        total = len(rows)
        completed = 0
        pending = 0
        scores: list[float] = []
        candidates: list[AssessmentMonitoringCandidate] = []

        app_ids = [app.id for app, _, _ in rows]

        # Flags in bulk
        flag_res = await self.session.execute(
            select(ProctoringFlag).where(
                ProctoringFlag.application_id.in_(app_ids),
                ProctoringFlag.session_type == "assessment",
            )
        ) if app_ids else None
        flag_map: dict[UUID, list[ProctoringFlag]] = {}
        if flag_res:
            for f in flag_res.scalars().all():
                flag_map.setdefault(f.application_id, []).append(f)

        for app, cand, prog in rows:
            status = prog.status if prog else "pending"
            score = float(prog.score) if prog and prog.score is not None else None
            is_completed = status == "completed"
            if is_completed:
                completed += 1
                if score is not None:
                    scores.append(score)
            else:
                pending += 1

            meets = score is not None and score >= pass_threshold if score is not None else False
            verdict = "pass" if meets else ("fail" if is_completed else "pending")

            app_flags = flag_map.get(app.id, [])
            mon_flags = [
                MonitoringFlag(type=f.event_type, severity=f.severity)
                for f in app_flags
            ]

            candidates.append(AssessmentMonitoringCandidate(
                application_id=app.id,
                candidate_id=cand.id,
                name=cand.full_name,
                status=status,
                score=score,
                meets_criteria=meets,
                verdict=verdict,
                flags=mon_flags,
                completion_time=prog.completed_at if prog else None,
            ))

        flagged = sum(1 for c in candidates if c.flags)
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

        return AssessmentMonitoringResponse(
            total_candidates=total,
            completed=completed,
            pending=pending,
            flagged=flagged,
            avg_score=avg_score,
            pass_threshold=pass_threshold,
            candidates=candidates,
        )

    # ── 8. POST /recruiter/groups/{groupId}/interviews/assign ─────────────────

    async def assign_interview(
        self, group_id: UUID, data: AssignInterviewRequest
    ) -> AssignInterviewResponse:
        group = await self._get_group(group_id)

        config_id: UUID | None = None

        if data.interview_config_id:
            # Validate existence
            res = await self.session.execute(
                select(AIInterviewConfig).where(
                    AIInterviewConfig.config_id == data.interview_config_id,
                    AIInterviewConfig.organization_id == self.org_id,
                )
            )
            cfg = res.scalars().first()
            if not cfg:
                return AssignInterviewResponse(status=-1, message="Interview configuration not found")
            
            # If config data is provided, update existing
            if data.interview_config:
                ic = data.interview_config
                cfg.title = ic.get("title", cfg.title)
                cfg.instructions = ic.get("instructions", cfg.instructions)
                cfg.max_retakes = ic.get("max_retakes", cfg.max_retakes)
                cfg.questions = ic.get("questions", cfg.questions)
                cfg.live_interview_context = ic.get("live_interview_context", cfg.live_interview_context)
                cfg.updated_at = datetime.utcnow()
                self.session.add(cfg)
            
            config_id = cfg.config_id
            ic_type = cfg.interview_type

        elif data.create_new and data.interview_config:
            # Create new AI interview config
            ic = data.interview_config
            ic_type = ic.get("interview_type", "recorded")
            new_cfg = AIInterviewConfig(
                organization_id=self.org_id,
                position_id=group.position_id,
                title=ic.get("title", "Untitled Interview"),
                interview_type=ic_type,
                instructions=ic.get("instructions"),
                max_retakes=ic.get("max_retakes", 1),
                questions=ic.get("questions", []),
                created_by_user_id=self.user.id,
            )
            self.session.add(new_cfg)
            await self.session.flush()
            config_id = new_cfg.config_id
        else:
            return AssignInterviewResponse(status=-1, message="Provide interview_config_id or create_new with config")

        stage_type_to_update = "live_interview" if ic_type == "live" else "ai_interview"

        # Update the group's AI interview stage config
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == stage_type_to_update,
            )
        )
        sc = sc_res.scalars().first()
        if sc:
            criteria = sc.acceptance_criteria or {}
            criteria["interview_config_id"] = str(config_id)
            sc.acceptance_criteria = criteria
            self.session.add(sc)

        # Log
        log = RecruiterAssignmentLog(
            organization_id=self.org_id,
            group_id=group_id,
            user_id=self.user.id,
            action="assigned",
        )
        self.session.add(log)
        await self.session.commit()

        return AssignInterviewResponse(
            status=1,
            interview_config_id=config_id,
            message="Interview configuration successfully assigned to group",
        )

    async def delete_interview(self, group_id: UUID, interview_id: UUID) -> dict:
        """Removes interview ID from stage config and soft-deletes the config itself."""
        # 1. Soft delete the config itself
        res = await self.session.execute(
            select(AIInterviewConfig).where(
                AIInterviewConfig.config_id == interview_id,
                AIInterviewConfig.organization_id == self.org_id
            )
        )
        cfg = res.scalars().first()
        if cfg:
            cfg.is_deleted = True
            self.session.add(cfg)

        # 2. Cleanup GroupStageConfig referencing this interview
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id
            )
        )
        stage_configs = sc_res.scalars().all()
        for sc in stage_configs:
            if sc.acceptance_criteria and isinstance(sc.acceptance_criteria, dict):
                if str(sc.acceptance_criteria.get("interview_config_id")) == str(interview_id):
                    criteria = sc.acceptance_criteria.copy()
                    del criteria["interview_config_id"]
                    sc.acceptance_criteria = criteria
                    self.session.add(sc)

        await self.session.commit()
        return {"status": 1, "message": "Interview deleted successfully"}

    # ── 9. PUT /recruiter/groups/{groupId}/acceptance-criteria ────────────────

    async def update_acceptance_criteria(
        self, group_id: UUID, data: AcceptanceCriteriaUpdate
    ) -> AcceptanceCriteriaUpdateResponse:
        await self._get_group(group_id)

        # Update criteria on ALL stage configs for this group
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(GroupStageConfig.group_id == group_id)
        )
        stages = sc_res.scalars().all()

        criteria_dict = {
            "min_technical_score": data.minimum_technical_score,
            "allowed_integrity_risk": data.allowed_integrity_risk,
            "required_verdict": data.required_verdict,
        }

        for sc in stages:
            existing = sc.acceptance_criteria or {}
            existing.update(criteria_dict)
            sc.acceptance_criteria = existing
            self.session.add(sc)

        # Log
        log = SystemLog(
            organization_id=self.org_id,
            user_id=self.user.id,
            action="acceptance_criteria_updated",
            entity_type="group",
            entity_id=group_id,
            details=criteria_dict,
        )
        self.session.add(log)

        await self.session.commit()

        return AcceptanceCriteriaUpdateResponse(
            status=1,
            criteria=AcceptanceCriteriaResponse(
                min_technical_score=data.minimum_technical_score,
                allowed_integrity_risk=data.allowed_integrity_risk,
                required_verdict=data.required_verdict,
            ),
        )

    # ── 10. POST /recruiter/candidate_note ───────────────────────────────────

    async def add_candidate_note(self, data: CandidateNoteCreate) -> CandidateNoteResponse:
        # Validate application exists and belongs to this org
        app_res = await self.session.execute(
            select(CandidateApplication).where(
                CandidateApplication.id == data.application_id,
                CandidateApplication.organization_id == self.org_id,
            )
        )
        app = app_res.scalars().first()
        if not app:
            raise NotFoundException("Application not found")

        # Append tags into content as a prefix if provided
        content = data.content
        if data.tags:
            tag_prefix = " ".join(f"[{t}]" for t in data.tags)
            content = f"{tag_prefix} {content}"

        note = RecruiterNote(
            application_id=data.application_id,
            author_id=self.user.id,
            content=content,
        )
        self.session.add(note)
        await self.session.commit()
        await self.session.refresh(note)

        return CandidateNoteResponse(status=1, note_id=note.id)

    # ── 11. GET /candidate/details ───────────────────────────────────────────

    async def get_candidate_details(self, candidate_id: UUID) -> CandidateDetailResponse:
        # Profile
        res = await self.session.execute(
            select(CandidateProfile).where(
                CandidateProfile.id == candidate_id,
                CandidateProfile.organization_id == self.org_id,
            )
        )
        cand = res.scalars().first()
        if not cand:
            raise NotFoundException("Candidate not found")

        # Get latest application for position title and scores
        app_res = await self.session.execute(
            select(CandidateApplication, Position)
            .outerjoin(Position, CandidateApplication.position_id == Position.id)
            .where(
                CandidateApplication.candidate_id == candidate_id,
                CandidateApplication.organization_id == self.org_id,
                CandidateApplication.is_deleted == False,
            )
            .order_by(CandidateApplication.applied_at.desc())
            .limit(1)
        )
        app_row = app_res.first()
        position_title: str | None = None
        resume_link: str | None = None
        if app_row:
            app_obj, pos_obj = app_row
            position_title = pos_obj.job_title if pos_obj else None
            resume_link = app_obj.resume_url

        # Scores — aggregate from stage progress
        assess_score = 0
        interview_score = 0
        github_score = 0

        if app_row:
            app_obj = app_row[0]
            # Join GroupStageConfig to resolve stage_type (CandidateStageProgress has no stage_type column)
            prog_res = await self.session.execute(
                select(CandidateStageProgress, GroupStageConfig.stage_type)
                .join(GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id)
                .where(
                    CandidateStageProgress.application_id == app_obj.id,
                )
            )
            for p, s_type in prog_res.all():
                if s_type == "assessment" and p.score is not None:
                    assess_score = int(p.score)
                elif s_type in ("ai_interview", "interview") and p.score is not None:
                    interview_score = int(p.score)

        # GitHub score from GitHubAnalysis
        from app.models import GitHubAnalysis
        gh_res = await self.session.execute(
            select(GitHubAnalysis).where(
                GitHubAnalysis.candidate_id == candidate_id,
            )
        )
        gh = gh_res.scalars().first()
        if gh and gh.contribution_score is not None:
            github_score = int(gh.contribution_score)

        overall = 0
        parts = []
        if assess_score:
            parts.append(assess_score)
        if interview_score:
            parts.append(interview_score)
        if github_score:
            parts.append(github_score)
        if parts:
            overall = int(sum(parts) / len(parts))

        return CandidateDetailResponse(
            Name=cand.full_name,
            Position=position_title,
            Email=cand.email,
            Phone=cand.phone,
            Location=cand.location,
            Scores=CandidateScores(
                Overall=overall,
                Assessment=assess_score,
                Interview=interview_score,
                Github=github_score,
            ),
            **{"Resume Link": resume_link},
        )

    # ── 12. GET /candidate/integrity-flags ───────────────────────────────────

    async def get_integrity_flags(self, application_id: UUID) -> IntegrityFlagsResponse:
        # Validate
        app_res = await self.session.execute(
            select(CandidateApplication).where(
                CandidateApplication.id == application_id,
                CandidateApplication.organization_id == self.org_id,
            )
        )
        if not app_res.scalars().first():
            raise NotFoundException("Application not found")

        res = await self.session.execute(
            select(ProctoringFlag)
            .where(ProctoringFlag.application_id == application_id)
            .order_by(ProctoringFlag.created_at.desc())
        )
        flags = res.scalars().all()

        return IntegrityFlagsResponse(
            flags=[
                IntegrityFlagDetail(
                    record_id=f.id,
                    stage=f.session_type,
                    severity=f.severity, 
                    description=f.event_type,
                    evidence_url=f.evidence,
                    timestamp=f.created_at,
                )
                for f in flags
            ]
        )

    async def create_group(self, data: GroupCreateRequest) -> CandidateGroup:
        """Create a new candidate group."""
        if self.user.role == "technical":
            from app.core.exceptions import UnauthorizedException
            raise UnauthorizedException("Technical recruiters cannot create groups")

        # 1. Validate Position
        from app.models import Position
        query_pos = select(Position).where(
            Position.id == data.position_id,
            Position.organization_id == self.org_id
        )
        res_pos = await self.session.execute(query_pos)
        position = res_pos.scalars().first()
        if not position:
            raise NotFoundException("Position not found")

        # 2. Create Group
        group = CandidateGroup(
            position_id=data.position_id,
            organization_id=self.org_id,
            group_name=data.name,
            assigned_hr_id=position.assigned_hr_id,
            assigned_tech_id=position.assigned_tech_id,
            status="On Hold",
            created_by_user_id=self.user.id
        )
        self.session.add(group)
        await self.session.flush()

        # 3. GroupStageConfig rows are created when HR sets the pipeline via update_group.
        #    No stages to create at group-creation time — pipeline starts empty.
        await self.session.flush()
        
        # 4. Associate Candidates
        # candidate_ids in request are actually Application IDs (app.id) 
        # returned by get_position_details API.
        for app_id in data.candidate_ids:
            # Fetch application
            q_app = select(CandidateApplication).where(
                CandidateApplication.id == app_id,
                CandidateApplication.position_id == data.position_id
            )
            res_app = await self.session.execute(q_app)
            app = res_app.scalars().first()
            
            if app:
                app.group_id = group.id
                self.session.add(app)

                # Create Stage Progress for the first active stage (if any exist)
                first_stage_res = await self.session.execute(
                    select(GroupStageConfig)
                    .where(
                        GroupStageConfig.group_id == group.id,
                        GroupStageConfig.state != "inactive",
                    )
                    .order_by(GroupStageConfig.stage_order)
                    .limit(1)
                )
                first_stage = first_stage_res.scalars().first()
                if first_stage:
                     q_prog = select(CandidateStageProgress).where(
                         CandidateStageProgress.application_id == app.id,
                         CandidateStageProgress.stage_id == first_stage.stage_id
                     )
                     formatted_res_prog = await self.session.execute(q_prog)
                     existing_prog = formatted_res_prog.scalars().first()
                     if not existing_prog:
                         progress = CandidateStageProgress(
                             application_id=app.id,
                             stage_id=first_stage.stage_id,
                             status="in_progress",
                             started_at=datetime.utcnow()
                         )
                         self.session.add(progress)

        await self.session.commit()
        await self.session.refresh(group)

        # 5. Send Notification to Technical Recruiter
        if group.assigned_tech_id:
            from app.services.notification import NotificationService
            notif_service = NotificationService(self.session)
            await notif_service.create_notification(
                organization_id=self.org_id,
                recipient_user_id=group.assigned_tech_id,
                title="New Candidate Group Created",
                message=f"A new group '{group.group_name}' requires flow configuration.",
                notification_type="group_assignment",
                data={"group_id": str(group.id), "position_id": str(group.position_id)}
            )

        return group

    async def delete_group(self, group_id: UUID) -> None:
        """Soft delete a group and release all candidates."""
        try:
            # Check if group exists
            await self._get_group(group_id)

            gid_str = str(group_id)

            # 1. Release candidates (unlink from group)
            await self.session.execute(
                text(f"UPDATE candidate_applications SET group_id = NULL WHERE group_id = '{gid_str}'")
            )

            # 2. Soft delete group
            await self.session.execute(
                text(f"UPDATE candidate_groups SET status = 'archived' WHERE group_id = '{gid_str}'")
            )
            
            await self.session.commit()
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

    async def update_group(self, group_id: UUID, data: GroupUpdateRequest) -> GroupDetailResponse:
        """Update a group."""
        group = await self._get_group(group_id)
        if data.name:
            group.group_name = data.name
        if data.status:
            group.status = data.status
        if data.filtration_flow is not None:
            # GroupStageConfig is the sole source of truth — sync rows directly
            await self._sync_stage_configs(group, data.filtration_flow)

        self.session.add(group)
        await self.session.commit()
        return await self.get_group_details(group_id)

    async def _sync_stage_configs(self, group: CandidateGroup, stage_names: list[str]) -> None:
        """Synchronise GroupStageConfig rows with a list of stage names."""
        group_id = group.id
        
        # Fetch existing configs
        current_configs_res = await self.session.execute(
            select(GroupStageConfig).where(GroupStageConfig.group_id == group_id)
        )
        current_configs = {c.stage_type: c for c in current_configs_res.scalars().all()}
        
        # Process new flow
        new_flow_types = []
        for idx, stage_str in enumerate(stage_names):
            # Normalize: frontend uses dashes, backend uses underscores
            stage_type = stage_str.lower().replace("-", "_")
            new_flow_types.append(stage_type)
            
            # Pretty name
            stage_name = stage_str.replace("-", " ").title()
            if stage_type == "ai_interview": stage_name = "AI Interview"
            elif stage_type == "assessment": stage_name = "Technical Assessment"
            elif stage_type == "live_interview": stage_name = "Live Interview"
            
            if stage_type in current_configs:
                # Update existing
                conf = current_configs[stage_type]
                conf.stage_order = idx
                if conf.state == 'inactive':
                    conf.state = 'not_started' # Reactivate
                # Keep existing state if active/completed
                self.session.add(conf)
            else:
                # Create new
                new_conf = GroupStageConfig(
                    group_id=group_id,
                    organization_id=group.organization_id,
                    stage_type=stage_type,
                    stage_order=idx,
                    stage_name=stage_name,
                    state="not_started"
                )
                self.session.add(new_conf)
        
        # Mark removed stages as inactive
        for st_type, conf in current_configs.items():
            if st_type not in new_flow_types:
                conf.state = 'inactive'
                conf.stage_order = 999
                self.session.add(conf)
        
        await self.session.commit()
        self.session.add(group)
        await self.session.commit()

