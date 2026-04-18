"""
Group management service — real DB queries for the EnhancedGroupOverviewV2 page.
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import asyncio
from sqlalchemy import select, func, or_, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BadRequestException, NotFoundException
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
    EmailLog,
    LiveInterviewConfig,
    LiveInterviewSession,
    CVAnalysis,
    GitHubAnalysisJob,
)
from worker.tasks.github_analysis import run_github_analysis
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
    GroupIntegrityDecisionsResponse,
    GroupIntegrityDecisionCandidate,
    GroupIntegrityStageAggregate,
    MonitoringFlag,
    StageStatsResponse,
    ScheduleInterviewRequest,
    GroupDeleteRequest,
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

    async def _resolve_stage_config_id(self, group: CandidateGroup, stage: str, stage_config: GroupStageConfig | None) -> UUID | None:
        """Resolve config_id for stages that require backing configs."""
        # 1) Existing direct config on the stage row
        if stage_config and stage_config.config_id:
            return stage_config.config_id

        # 2) Legacy config in acceptance_criteria payload
        criteria = stage_config.acceptance_criteria if stage_config and isinstance(stage_config.acceptance_criteria, dict) else {}
        if stage == "assessment":
            raw_id = criteria.get("assessment_id")
        else:
            raw_id = criteria.get("interview_config_id")
        if raw_id:
            try:
                return raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id))
            except (TypeError, ValueError):
                pass

        # 3) Fallback lookup from persisted configs
        if stage == "assessment":
            cfg_res = await self.session.execute(
                select(Assessment.id)
                .where(
                    Assessment.organization_id == self.org_id,
                    Assessment.group_id == group.id,
                    Assessment.is_deleted == False,
                )
                .order_by(Assessment.updated_at.desc(), Assessment.created_at.desc())
                .limit(1)
            )
            cfg_id = cfg_res.scalars().first()
            if cfg_id:
                return cfg_id

            cfg_res = await self.session.execute(
                select(Assessment.id)
                .where(
                    Assessment.organization_id == self.org_id,
                    Assessment.position_id == group.position_id,
                    Assessment.is_deleted == False,
                )
                .order_by(Assessment.updated_at.desc(), Assessment.created_at.desc())
                .limit(1)
            )
            return cfg_res.scalars().first()

        if stage == "ai_interview":
            interview_type = "recorded"
            cfg_res = await self.session.execute(
                select(AIInterviewConfig.config_id)
                .where(
                    AIInterviewConfig.organization_id == self.org_id,
                    AIInterviewConfig.position_id == group.position_id,
                    AIInterviewConfig.interview_type == interview_type,
                    AIInterviewConfig.is_deleted == False,
                )
                .order_by(AIInterviewConfig.updated_at.desc(), AIInterviewConfig.created_at.desc())
                .limit(1)
            )
            existing_cfg_id = cfg_res.scalars().first()
            if existing_cfg_id:
                return existing_cfg_id

            # Auto-provision a minimal default config so stage start can proceed.
            default_cfg = AIInterviewConfig(
                organization_id=self.org_id,
                position_id=group.position_id,
                title="AI Interview",
                interview_type=interview_type,
                questions={"questions": []},
                created_by_user_id=self.user.id,
            )
            self.session.add(default_cfg)
            await self.session.flush()
            return default_cfg.config_id

        if stage == "live_interview":
            cfg_res = await self.session.execute(
                select(LiveInterviewConfig.id)
                .where(
                    LiveInterviewConfig.organization_id == self.org_id,
                    LiveInterviewConfig.position_id == group.position_id,
                )
                .order_by(LiveInterviewConfig.created_at.desc())
                .limit(1)
            )
            existing_cfg_id = cfg_res.scalars().first()
            if existing_cfg_id:
                return existing_cfg_id

            default_live_cfg = LiveInterviewConfig(
                organization_id=self.org_id,
                position_id=group.position_id,
                title="Live Interview",
                duration_minutes=60,
            )
            self.session.add(default_live_cfg)
            await self.session.flush()
            return default_live_cfg.id

        return None


    async def _get_candidates_progress_data(
        self, group_id: UUID, filter_str: str | None = None, sort_str: str | None = None, stage_type_filter: str | None = None
    ) -> list[CandidateProgressItem]:
        # Acceptance criteria for meets_criteria calculation
        sc_res = await self.session.execute(
            select(GroupStageConfig)
            .where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.state != "inactive",
            )
            .order_by(GroupStageConfig.stage_order.asc())
        )
        stage_configs = sc_res.scalars().all()
        ordered_flow_types: list[str] = []
        for sc in stage_configs:
            if sc.stage_type not in ordered_flow_types:
                ordered_flow_types.append(sc.stage_type)
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

        # Fetch live interview sessions
        live_res = await self.session.execute(
            select(LiveInterviewSession).where(LiveInterviewSession.application_id.in_(app_ids))
        )
        all_live_sessions = live_res.scalars().all()
        live_map = {ls.application_id: ls for ls in all_live_sessions}

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
            # Build dynamic stage statuses and scores for ALL stages in the flow
            stage_statuses: dict[str, str] = {}
            stage_scores: dict[str, float | None] = {}
            stage_passed: dict[str, bool | None] = {}
            
            for st_type in ordered_flow_types:
                prog = prog_map.get((app.id, st_type))
                stage_statuses[st_type] = prog.status if prog else "locked"
                stage_scores[st_type] = float(prog.score) if (prog and prog.score is not None) else None
                stage_passed[st_type] = prog.passed if prog else None

            # Hard gate downstream stages by previous-stage completion to prevent
            # stale progress rows from exposing candidates in later-stage views.
            for idx, stage_type in enumerate(ordered_flow_types):
                if idx == 0:
                    continue
                prev_stage_type = ordered_flow_types[idx - 1]
                if stage_statuses.get(prev_stage_type) != "completed":
                    stage_statuses[stage_type] = "locked"
                    stage_scores[stage_type] = None
                    stage_passed[stage_type] = None

            assess_status = stage_statuses.get("assessment", "locked")
            ai_status = stage_statuses.get("ai_interview", "locked")
            live_status = stage_statuses.get("live_interview", "locked")
            assess_score = stage_scores.get("assessment")
            ai_score = stage_scores.get("ai_interview")
            live_score = stage_scores.get("live_interview")
            assess_passed = stage_passed.get("assessment")
            ai_passed = stage_passed.get("ai_interview")
            live_passed = stage_passed.get("live_interview")

            ls_data = live_map.get(app.id)
            scheduled_at = ls_data.scheduled_at if ls_data else None
            meeting_link = ls_data.meeting_link if ls_data else None

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
            # Respect explicit passed/failed status from bulk_progress if set
            if assess_status == "failed" or ai_status == "failed":
                verdict = "fail"
            elif assess_status == "completed" and ai_status == "completed":
                # Check for explicit 'passed' boolean if available, otherwise use meets_criteria
                # Note: In this context, we are looking at the status strings.
                verdict = "pass" if meets else "fail"
            elif assess_status == "completed" or ai_status == "completed":
                verdict = "conditional"
            else:
                verdict = "pending"

            # Construct dynamic stages dict
            dynamic_stages = {}
            for st_type in ordered_flow_types:
                s_at = scheduled_at if st_type == "live_interview" else None
                m_l = meeting_link if st_type == "live_interview" else None
                dynamic_stages[st_type] = CandidateStageStatus(
                    score=stage_scores.get(st_type),
                    status=stage_statuses.get(st_type, "locked"),
                    passed=stage_passed.get(st_type),
                    scheduled_at=s_at,
                    meeting_link=m_l
                )

            items.append(CandidateProgressItem(
                application_id=app.id,
                candidate_id=cand.id,
                name=cand.full_name,
                email=cand.email,
                assessment=CandidateStageStatus(score=assess_score, status=assess_status, passed=assess_passed),
                ai_interview=CandidateStageStatus(score=ai_score, status=ai_status, passed=ai_passed),
                live_interview=CandidateStageStatus(
                    score=live_score,
                    status=live_status,
                    passed=live_passed,
                    scheduled_at=scheduled_at,
                    meeting_link=meeting_link
                ),
                stages=dynamic_stages,
                meets_criteria=meets,
                verdict=verdict,
                flags=integrity_flags,
                status=app.status if app.status else "active",
                has_notes=app.id in apps_with_notes,
            ))

        # Filter by stage_type_filter if provided
        if stage_type_filter:
            # Normalize stage_type_filter (e.g. "ai-interview" -> "ai_interview")
            st_filter = stage_type_filter.lower().replace("-", "_")
            # Only include candidates who are NOT "locked" for the filtered stage.
            # This ensures only candidates who passed the previous stage are shown.
            items = [
                i for i in items 
                if st_filter in i.stages and i.stages[st_filter].status != "locked"
            ]
        
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
            FiltrationFlowStage(
                order=sc.stage_order, 
                stage=sc.stage_type.replace("_", "-"), 
                status=(sc.state.replace("_", "-") if sc.state else "not-started")
            )
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
        github_questions_count = 10
        for sc in stage_configs:
            if sc.acceptance_criteria and isinstance(sc.acceptance_criteria, dict):
                if "min_technical_score" in sc.acceptance_criteria:
                    criteria.min_technical_score = sc.acceptance_criteria["min_technical_score"]
                if "allowed_integrity_risk" in sc.acceptance_criteria:
                    criteria.allowed_integrity_risk = sc.acceptance_criteria["allowed_integrity_risk"]
                if "required_verdict" in sc.acceptance_criteria:
                    criteria.required_verdict = sc.acceptance_criteria["required_verdict"]
                if sc.stage_type == "assessment" and "github_questions_count" in sc.acceptance_criteria:
                    try:
                        github_questions_count = int(sc.acceptance_criteria.get("github_questions_count") or 10)
                    except Exception:
                        github_questions_count = 10

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
        for idx, stage_conf in enumerate(flow):
            st_type = stage_conf.stage.lower().replace("-", "_") # normalize
            st_name = stage_names.get(st_type, stage_conf.stage.title())
            
            # Initialize stats
            completed_c = 0
            pending_c = 0
            total_c = 0
            
            # Calculate stats
            active_candidates = []
            is_first_stage = (idx == 0)

            # All stages now use the dynamic 'stages' map for statistics
            active_candidates = [
                c for c in candidates 
                if is_first_stage or (st_type in c.stages and c.stages[st_type].status != "locked")
            ]
            completed_statuses = ("completed", "failed")
            completed_c = sum(
                1 for c in active_candidates 
                if st_type in c.stages and c.stages[st_type].status in completed_statuses
            )
            pending_c = len(active_candidates) - completed_c
            
            total_c = len(active_candidates)
            
            pipeline_stages.append(PipelineStage(
                id=st_type.replace("_", "-"),
                name=st_name,
                completed=completed_c,
                total=total_c,
                pending=pending_c,
                state=(stage_conf.status.replace("_", "-") if stage_conf.status else "not-started")
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
                        live_interview_context=ic_db.live_interview_context,
                        difficulty=ic_db.difficulty,
                        show_ai_feedback=ic_db.show_ai_feedback,
                        recording_required=ic_db.recording_required,
                        total_duration_minutes=ic_db.total_duration_minutes,
                        live_flow_config=ic_db.live_flow_config
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
            interviews=interviews_data,
            github_questions_count=github_questions_count,
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

        # Live interview stats
        q_live = select(
            func.count().label("completed"),
            func.avg(CandidateStageProgress.score).label("avg"),
        ).join(GroupStageConfig, CandidateStageProgress.stage_id == GroupStageConfig.stage_id).where(
            GroupStageConfig.group_id == group_id,
            GroupStageConfig.stage_type == "live_interview",
            CandidateStageProgress.status == "completed",
        )

        # Offers
        q_offers = select(func.count()).where(Offer.application_id.in_(app_ids))

        # Flags
        q_flags = select(func.count()).where(ProctoringFlag.application_id.in_(app_ids))

        # Review count — candidates who finished all stages but no offer yet
        q_review = select(func.count()).where(
            CandidateApplication.id.in_(app_ids),
            CandidateApplication.status.in_(["screening"]),
        )

        res_assess = await self.session.execute(q_assess)
        res_ai = await self.session.execute(q_ai)
        res_live = await self.session.execute(q_live)
        res_offers = await self.session.execute(q_offers)
        res_flags = await self.session.execute(q_flags)
        res_review = await self.session.execute(q_review)

        assess_row = res_assess.first()
        ai_row = res_ai.first()
        live_row = res_live.first()

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
            live_interview=StageStatsResponse(
                completed=live_row.completed if live_row else 0,
                total=total,
                avg_score=round(float(live_row.avg or 0), 1) if live_row else 0.0,
            ),
            review={"count": res_review.scalar() or 0},
            offer={"count": res_offers.scalar() or 0},
            flagged={"count": res_flags.scalar() or 0},
        )

    # ── 3. GET /recruiter/groups/{groupId}/candidates/progress ───────────────

    async def get_candidate_progress(
        self, group_id: UUID, filter: str | None = None, sort: str | None = None, stage: str | None = None
    ) -> CandidateProgressResponse:
        """Retrieve all candidates in the group with their complete progress through
        all stages. Optionally filter for a specific stage view."""
        await self._get_group(group_id)
        items = await self._get_candidates_progress_data(group_id, filter, sort, stage_type_filter=stage)
        return CandidateProgressResponse(candidates=items)

    # ── 4. POST /recruiter/groups/{groupId}/stages/start ─────────────────────

    async def start_stage(self, group_id: UUID, stage: str) -> dict:
        group = await self._get_group(group_id)

        # Normalize stage type: DB uses underscores but frontend can send mixed formatting.
        stage = stage.strip().lower().replace(" ", "_").replace("-", "_")

        # Get stage config
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == stage,
            )
        )
        stage_config = sc_res.scalars().first()

        required_config_stages = {"assessment", "ai_interview", "live_interview"}
        resolved_config_id = await self._resolve_stage_config_id(group, stage, stage_config)
        if stage in required_config_stages and not resolved_config_id:
            raise BadRequestException(
                f"Cannot start '{stage}'. Configure and assign its settings first."
            )

        # Auto-create stage config if it doesn't exist yet
        if stage_config is None:
            # Determine current max stage_order for this group so we don't conflict
            order_res = await self.session.execute(
                select(func.coalesce(func.max(GroupStageConfig.stage_order), 0)).where(
                    GroupStageConfig.group_id == group_id
                )
            )
            max_order = order_res.scalars().first() or 0
            stage_config = GroupStageConfig(
                group_id=group_id,
                organization_id=self.org_id,
                stage_type=stage,
                stage_order=max_order + 1,
                stage_name=stage.replace("_", " ").title(),
                config_id=resolved_config_id,
                state="active",
                started_at=datetime.now(timezone.utc).replace(tzinfo=None),
                started_by_user_id=self.user.id,
            )
            self.session.add(stage_config)
            # Flush so stage_config.stage_id is populated before we use it below
            await self.session.flush()
        else:
            # Update existing stage state
            if resolved_config_id and not stage_config.config_id:
                stage_config.config_id = resolved_config_id
            stage_config.state = "active"
            stage_config.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
            stage_config.started_by_user_id = self.user.id
            self.session.add(stage_config)
            await self.session.flush()

        # Fetch eligible candidates (applications in this group)
        apps_res = await self.session.execute(
            select(CandidateApplication).where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.is_deleted == False,
            )
        )
        apps = apps_res.scalars().all()

        # Determine stage position in the pipeline so we only advance eligible candidates.
        flow_res = await self.session.execute(
            select(GroupStageConfig)
            .where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.state != "inactive",
            )
            .order_by(GroupStageConfig.stage_order.asc())
        )
        flow = flow_res.scalars().all()
        stage_index = next((i for i, s in enumerate(flow) if s.stage_id == stage_config.stage_id), -1)
        prev_stage_id = flow[stage_index - 1].stage_id if stage_index > 0 else None

        # First stage: include all non-rejected applications.
        if prev_stage_id is None:
            eligible_app_ids = {app.id for app in apps if app.status != "rejected"}
            progressed_from_prev: set[UUID] = set()
        else:
            # Candidates that passed/completed the previous stage.
            prev_passed_res = await self.session.execute(
                select(CandidateStageProgress.application_id).where(
                    CandidateStageProgress.stage_id == prev_stage_id,
                    CandidateStageProgress.status == "completed",
                )
            )
            progressed_from_prev = set(prev_passed_res.scalars().all())
            eligible_app_ids = progressed_from_prev

        invitations_sent = 0
        for app in apps:
            if app.id not in eligible_app_ids:
                continue

            # Create or unlock the stage progress entry
            prog_res = await self.session.execute(
                select(CandidateStageProgress).where(
                    CandidateStageProgress.application_id == app.id,
                    CandidateStageProgress.stage_id == stage_config.stage_id,
                )
            )
            prog = prog_res.scalars().first()
            if prog:
                # If it's locked, not started, or 'unlocked' (was pre-created by bulk_progress),
                # we count it as a "new invitation sent" for this stage launch.
                if prog.status in ("locked", "not_started", "unlocked"):
                    prog.status = "in_progress" # Actually move to in_progress when stage starts
                    prog.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    self.session.add(prog)
                    invitations_sent += 1
            else:
                # For non-first stages, never auto-create progress for candidates that didn't
                # progress from the previous stage.
                if prev_stage_id is not None and app.id not in progressed_from_prev:
                    continue

                new_prog = CandidateStageProgress(
                    application_id=app.id,
                    stage_id=stage_config.stage_id,
                    status="in_progress",
                    started_at=datetime.now(timezone.utc).replace(tzinfo=None),
                )
                self.session.add(new_prog)
                invitations_sent += 1

            # ── Pre-create Ongoing records
            if stage_config.config_id:
                if stage == "assessment":
                    existing = await self.session.execute(select(OngoingAssessment).where(
                        OngoingAssessment.application_id == app.id,
                        OngoingAssessment.assessment_id == stage_config.config_id
                    ))
                    if not existing.scalars().first():
                        new_assessment = OngoingAssessment(
                            assessment_id=stage_config.config_id,
                            application_id=app.id,
                            organization_id=self.org_id,
                            assigned_questions={},
                            status="not_started"
                        )
                        self.session.add(new_assessment)
                
                elif stage == "ai_interview":
                    existing = await self.session.execute(select(OngoingInterview).where(
                        OngoingInterview.application_id == app.id,
                        OngoingInterview.config_id == stage_config.config_id
                    ))
                    if not existing.scalars().first():
                        new_interview = OngoingInterview(
                            config_id=stage_config.config_id,
                            application_id=app.id,
                            organization_id=self.org_id,
                            interview_type="recorded",
                            status="not_started"
                        )
                        self.session.add(new_interview)

            # ── Candidate Emails and Notifications
            profile = await self.session.get(CandidateProfile, app.candidate_id)
            if profile:
                stage_name_title = stage.replace("_", " ").title()
                if stage == "ai_interview": stage_name_title = "AI Interview"
                elif stage == "live_interview": stage_name_title = "Live Interview"
                
                # Check if notification already sent to avoid duplicate spam on re-start
                existing_notif = await self.session.execute(select(Notification).where(
                    Notification.recipient_candidate_id == profile.id,
                    Notification.type == f"{stage}_invitation"
                ))
                
                if not existing_notif.scalars().first():
                    self.session.add(Notification(
                        organization_id=self.org_id,
                        recipient_candidate_id=profile.id,
                        type=f"{stage}_invitation",
                        title=f"Invitation: {stage_name_title}",
                        message=f"You have been invited to complete the {stage_name_title} stage for your application. Please log in to your candidate portal to begin.",
                        data={"stage": stage, "group_id": str(group_id), "application_id": str(app.id)}
                    ))
                    
                    self.session.add(EmailLog(
                        organization_id=self.org_id,
                        recipient_email=profile.email,
                        subject=f"Action Required: EraMatch {stage_name_title} Invitation",
                        template_type="stage_invitation",
                        status="sent",
                        sent_at=datetime.now(timezone.utc).replace(tzinfo=None)
                    ))
                    
                    # Send Real Email
                    try:
                        from app.services.email import EmailService
                        await EmailService.send_stage_invitation_email(
                            email=profile.email,
                            name=profile.full_name,
                            stage_title=stage_name_title
                        )
                    except Exception as e:
                        print(f"Failed to send real stage invitation email to {profile.email}: {e}")

            # Update application status
            if app.status == "applied":
                app.status = "screening"
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

    # ── 4b. POST /recruiter/groups/{groupId}/stages/close ─────────────────────

    async def close_stage(self, group_id: UUID, stage: str) -> dict:
        """Closes the current stage and automatically rejects candidates who didn't progress."""
        await self._get_group(group_id)

        # Normalize frontend stage names to underscore DB format
        stage_type = stage.strip().lower().replace(" ", "_").replace("-", "_")

        # 1. Find the target stage config
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == stage_type,
            )
        )
        stage_config = sc_res.scalars().first()

        if not stage_config:
             raise NotFoundException(f"Stage '{stage_type}' not found for this group")

        # 2. Update stage state
        stage_config.state = "closed"
        stage_config.closed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.session.add(stage_config)

        # 3. Identify and reject candidates who did not pass this stage
        # We look for all applications in this group that are NOT already rejected
        apps_res = await self.session.execute(
            select(CandidateApplication).where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.status != "rejected"
            )
        )
        group_apps = apps_res.scalars().all()

        rejected_count = 0
        # Candidates will remain in their current status (usually 'screening')
        # until the recruiter explicitly progresses or holds them in the next step.
        # This prevents everyone from turning 'holded' before the review is even started.


        # 4. Count evaluated candidates for the summary log
        count_res = await self.session.execute(
            select(func.count(CandidateStageProgress.progress_id)).where(
                CandidateStageProgress.stage_id == stage_config.stage_id,
                CandidateStageProgress.status == "completed",
            )
        )
        candidates_evaluated = count_res.scalars().first() or 0

        # 5. Log the overall stage close action
        log = SystemLog(
            organization_id=self.org_id,
            user_id=self.user.id,
            action=f"stage_closed:{stage_type}",
            entity_type="group",
            entity_id=group_id,
            details={
                "stage": stage_type, 
                "candidates_evaluated": candidates_evaluated,
                "automatic_rejections": rejected_count
            },
        )
        self.session.add(log)
        
        await self.session.commit()

        return {
            "status": 1,
            "stage": stage_type,
            "candidates_evaluated": candidates_evaluated,
            "automatic_rejections": rejected_count
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

    # ── BULK PROGRESSION ──────────────────────────────────────────────────────


    # ── FINAL OFFERS ────────────────────────────────────────────────────────
    
    async def send_offers(self, group_id: UUID, application_ids: list[str], subject: str, body: str) -> None:
        """Sends offer emails sequentially using the provided body and subject."""
        from app.services.email import EmailService
        if not application_ids:
            return

        # Fetch applications and candidates to get email/name
        query = (
            select(CandidateApplication, CandidateProfile)
            .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
            .where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.id.in_(application_ids)
            )
        )
        res = await self.session.execute(query)
        rows = res.all()

        for app, profile in rows:
            # 1. Update application status
            app.status = "Offered"
            self.session.add(app)
            
            # 2. Add an Offer record so it's tracked explicitly
            new_offer = Offer(
                application_id=app.id,
                organization_id=self.current_user.organization_id,
                position_id=app.position_id,
                status="sent"
            )
            self.session.add(new_offer)

            # 3. Create a system log / activity log
            log = SystemLog(
                event_type="offer_sent",
                user_id=self.current_user.id,
                organization_id=self.current_user.organization_id,
                entity_type="candidate_application",
                entity_id=app.id,
                details={"candidate_name": profile.full_name, "subject": subject}
            )
            self.session.add(log)

            # 4. Dispatch the actual email
            try:
                await EmailService.send_custom_offer_email(
                    email=profile.email,
                    name=profile.full_name,
                    subject=subject,
                    raw_body=body
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to send offer email: {e}")

        await self.session.commit()

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

    async def delete_group(self, group_id: UUID, request: GroupDeleteRequest) -> None:
        """Improved group deletion with configurable candidate actions."""
        group = await self._get_group(group_id)
        gid_str = str(group_id)

        # 1. Handle candidates
        if request.action == "reject":
            # Reject and unlink
            await self.session.execute(
                update(CandidateApplication)
                .where(CandidateApplication.group_id == group_id)
                .values(status="rejected", group_id=None)
            )
        elif request.action == "transfer" and request.transfer_group_id:
            # Move to another group
            await self.session.execute(
                update(CandidateApplication)
                .where(CandidateApplication.group_id == group_id)
                .values(group_id=request.transfer_group_id)
            )
        else: # "release" or default
            # Just unassign
            await self.session.execute(
                update(CandidateApplication)
                .where(CandidateApplication.group_id == group_id)
                .values(group_id=None)
            )

        # 2. Mark group as archived
        group.status = "archived"
        self.session.add(group)

        # 3. Log the deletion action
        log = SystemLog(
            organization_id=self.org_id,
            user_id=self.user.id,
            action=f"group_deleted:{request.action}",
            entity_type="group",
            entity_id=group_id,
            details={
                "action": request.action,
                "transfer_group_id": str(request.transfer_group_id) if request.transfer_group_id else None
            }
        )
        self.session.add(log)
        
        await self.session.commit()
    async def rename_group(self, group_id: UUID, new_name: str) -> GroupDetailResponse:
        """Rename a group."""
        group = await self._get_group(group_id)
        group.group_name = new_name
        self.session.add(group)
        await self.session.commit()
        return await self.get_group_details(group_id)

    # ── 7. GET /recruiter/groups/{groupId}/assessments/monitoring ─────────────

    async def get_assessment_monitoring(self, group_id: UUID) -> AssessmentMonitoringResponse:
        """Legacy wrapper for assessment monitoring."""
        return await self.get_stage_monitoring(group_id, "assessment")

    async def get_stage_monitoring(self, group_id: UUID, stage_type: str) -> AssessmentMonitoringResponse:
        """Generic monitoring data for any pipeline stage (assessment, ai-interview, etc.).
        Only include candidates who have joined/reached this specific stage."""
        group = await self._get_group(group_id)
        stage_type = stage_type.lower().replace("-", "_")

        # 1. Get stage config & pass threshold
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == stage_type,
            )
        )
        sc = sc_res.scalars().first()
        if not sc:
             raise NotFoundException(f"Stage '{stage_type}' not found for group")

        pass_threshold = 70.0
        if sc.acceptance_criteria and isinstance(sc.acceptance_criteria, dict):
            pass_threshold = sc.acceptance_criteria.get("min_technical_score", 70.0)

        # 2. Fetch candidates who have formally reached this stage.
        # Use inner join on CandidateStageProgress to enforce eligibility.
        q = (
            select(CandidateApplication, CandidateProfile, CandidateStageProgress)
            .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
            .join(
                CandidateStageProgress,
                (CandidateStageProgress.application_id == CandidateApplication.id)
                & (CandidateStageProgress.stage_id == sc.stage_id),
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

        # 3. Proctoring flags in bulk
        flag_res = await self.session.execute(
            select(ProctoringFlag).where(
                ProctoringFlag.application_id.in_(app_ids),
                ProctoringFlag.session_type == stage_type,
            )
        ) if app_ids else None
        flag_map: dict[UUID, list[ProctoringFlag]] = {}
        if flag_res:
            for f in flag_res.scalars().all():
                flag_map.setdefault(f.application_id, []).append(f)

        for app, cand, prog in rows:
            status = prog.status
            score = float(prog.score) if prog and prog.score is not None else None
            is_completed = status == "completed" or status == "failed"
            if is_completed:
                completed += 1
                if score is not None:
                    scores.append(score)
            else:
                pending += 1

            meets = score is not None and score >= pass_threshold if score is not None else False
            
            # Verdict logic
            if prog and prog.passed is True:
                verdict = "pass"
            elif prog and prog.passed is False:
                verdict = "fail"
            else:
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
                completion_time=prog.completed_at,
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
                cfg.difficulty = ic.get("difficulty", cfg.difficulty)
                cfg.total_duration_minutes = ic.get("duration", cfg.total_duration_minutes)
                cfg.show_ai_feedback = ic.get("showAIFeedback", cfg.show_ai_feedback)
                cfg.recording_required = ic.get("recordingRequired", cfg.recording_required)
                cfg.live_flow_config = ic.get("live_flow_config", cfg.live_flow_config)
                cfg.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
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
                live_interview_context=ic.get("live_interview_context"),
                difficulty=ic.get("difficulty", "Mid Level"),
                total_duration_minutes=ic.get("duration", 30),
                show_ai_feedback=ic.get("showAIFeedback", True),
                recording_required=ic.get("recordingRequired", True),
                live_flow_config=ic.get("live_flow_config"),
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
            sc.config_id = config_id
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

    async def get_group_integrity_alerts(
        self,
        group_id: UUID,
        since: datetime | None = None,
        limit: int = 25,
    ) -> list[dict]:
        await self._get_group(group_id)

        where_since = ""
        params: dict[str, object] = {
            "group_id": group_id,
            "org_id": self.org_id,
            "limit": limit,
        }
        if since is not None:
            where_since = " AND pf.created_at > :since "
            params["since"] = since

        query = text(
            f"""
            SELECT
                pf.flag_id,
                pf.application_id,
                ca.candidate_id,
                cp.full_name AS candidate_name,
                pf.session_id,
                pf.session_type,
                pf.event_type,
                pf.severity,
                pf.status,
                pf.evidence,
                pf.created_at
            FROM proctoring_flags pf
            JOIN candidate_applications ca
              ON ca.application_id = pf.application_id
            JOIN candidate_profiles cp
              ON cp.candidate_id = ca.candidate_id
            WHERE ca.group_id = :group_id
              AND ca.organization_id = :org_id
              AND pf.severity IN ('high', 'medium')
              {where_since}
            ORDER BY pf.created_at ASC
            LIMIT :limit
            """
        )

        res = await self.session.execute(query, params)
        rows = res.mappings().all()
        return [
            {
                "flag_id": str(r["flag_id"]),
                "application_id": str(r["application_id"]),
                "candidate_id": str(r["candidate_id"]),
                "candidate_name": r["candidate_name"],
                "session_id": str(r["session_id"]),
                "session_type": r["session_type"],
                "event_type": r["event_type"],
                "severity": r["severity"],
                "status": r["status"],
                "evidence": r["evidence"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    async def get_group_integrity_metrics(
        self,
        group_id: UUID,
        window_minutes: int = 60,
    ) -> dict:
        await self._get_group(group_id)

        summary_res = await self.session.execute(
            text(
                """
                SELECT
                    COUNT(*) AS total_flags,
                    COUNT(*) FILTER (WHERE pf.severity = 'high') AS high_flags,
                    COUNT(*) FILTER (WHERE pf.severity = 'medium') AS medium_flags,
                    COUNT(*) FILTER (WHERE pf.severity = 'low') AS low_flags,
                    COUNT(*) FILTER (WHERE pf.session_type = 'assessment') AS assessment_flags,
                    COUNT(*) FILTER (WHERE pf.session_type = 'ai_interview') AS interview_flags
                FROM proctoring_flags pf
                JOIN candidate_applications ca
                  ON ca.application_id = pf.application_id
                WHERE ca.group_id = :group_id
                  AND ca.organization_id = :org_id
                  AND pf.created_at >= NOW() - (:window_minutes || ' minutes')::INTERVAL
                """
            ),
            {
                "group_id": group_id,
                "org_id": self.org_id,
                "window_minutes": str(window_minutes),
            },
        )
        summary = summary_res.mappings().first() or {}

        top_events_res = await self.session.execute(
            text(
                """
                SELECT pf.event_type, COUNT(*) AS count
                FROM proctoring_flags pf
                JOIN candidate_applications ca
                  ON ca.application_id = pf.application_id
                WHERE ca.group_id = :group_id
                  AND ca.organization_id = :org_id
                  AND pf.created_at >= NOW() - (:window_minutes || ' minutes')::INTERVAL
                GROUP BY pf.event_type
                ORDER BY count DESC
                LIMIT 5
                """
            ),
            {
                "group_id": group_id,
                "org_id": self.org_id,
                "window_minutes": str(window_minutes),
            },
        )
        top_events = [
            {
                "event_type": row["event_type"],
                "count": int(row["count"]),
            }
            for row in top_events_res.mappings().all()
        ]

        return {
            "window_minutes": window_minutes,
            "summary": {
                "total_flags": int(summary.get("total_flags") or 0),
                "high_flags": int(summary.get("high_flags") or 0),
                "medium_flags": int(summary.get("medium_flags") or 0),
                "low_flags": int(summary.get("low_flags") or 0),
                "assessment_flags": int(summary.get("assessment_flags") or 0),
                "interview_flags": int(summary.get("interview_flags") or 0),
            },
            "top_events": top_events,
        }

    def _normalize_stage_type(self, stage: str | None) -> str | None:
        if stage is None:
            return None
        normalized = stage.strip().lower().replace("-", "_")
        stage_aliases = {
            "assessment": "assessment",
            "ai_interview": "ai_interview",
            "interview": "ai_interview",
            "live_interview": "live_interview",
        }
        return stage_aliases.get(normalized)

    def _decision_from_counts(
        self,
        total_flags: int,
        high_cnt: int,
        medium_cnt: int,
        critical_cnt: int,
        fusion_cnt: int,
    ) -> tuple[str, bool]:
        if critical_cnt > 0 or fusion_cnt > 0 or high_cnt >= 2 or medium_cnt >= 4:
            return "confirmed_cheating", True
        if high_cnt >= 1 or medium_cnt >= 2 or total_flags >= 3:
            return "suspicious_review", False
        if total_flags == 0:
            return "clean", False
        return "monitoring", False

    def _session_types_for_stage(self, stage: str) -> list[str]:
        # Keep live interview compatible with either explicit live_interview or ai_interview session labels.
        if stage == "assessment":
            return ["assessment"]
        if stage == "live_interview":
            return ["live_interview", "ai_interview"]
        return ["ai_interview"]

    async def get_group_integrity_decisions(
        self,
        group_id: UUID,
        stage: str | None = None,
    ) -> GroupIntegrityDecisionsResponse:
        await self._get_group(group_id)

        normalized_stage = self._normalize_stage_type(stage)
        if stage and normalized_stage is None:
            raise BadRequestException("Invalid stage. Use assessment, ai_interview, or live_interview")

        stages_to_query = [normalized_stage] if normalized_stage else ["assessment", "ai_interview", "live_interview"]
        candidates_payload: list[GroupIntegrityDecisionCandidate] = []
        stage_aggregates: list[GroupIntegrityStageAggregate] = []

        for stage_key in stages_to_query:
            session_types = self._session_types_for_stage(stage_key)
            if session_types == ["assessment"]:
                session_type_filter_sql = "pf.session_type = 'assessment'"
            elif session_types == ["ai_interview"]:
                session_type_filter_sql = "pf.session_type = 'ai_interview'"
            else:
                session_type_filter_sql = "pf.session_type IN ('ai_interview', 'live_interview')"

            rows = await self.session.execute(
                text(
                    f"""
                    SELECT
                        ca.application_id,
                        ca.candidate_id,
                        cp.full_name AS candidate_name,
                        csp.status AS stage_status,
                        csp.score AS stage_score,
                        COUNT(pf.flag_id) AS total_flags,
                        COUNT(*) FILTER (WHERE pf.severity = 'high') AS high_cnt,
                        COUNT(*) FILTER (WHERE pf.severity = 'medium') AS medium_cnt,
                        COUNT(*) FILTER (WHERE pf.severity = 'low') AS low_cnt,
                        COUNT(*) FILTER (
                            WHERE pf.event_type IN (
                                'paste_attempt',
                                'paste_shortcut',
                                'multi_face_detected',
                                'voice_mismatch',
                                'speaker_mismatch',
                                'fusion_high_confidence_risk'
                            )
                        ) AS critical_cnt,
                        COUNT(*) FILTER (WHERE pf.event_type = 'fusion_high_confidence_risk') AS fusion_cnt,
                        (ARRAY_AGG(pf.event_type ORDER BY pf.created_at DESC) FILTER (WHERE pf.flag_id IS NOT NULL))[1] AS latest_event_type,
                        MAX(pf.created_at) AS latest_flag_at
                    FROM candidate_applications ca
                    JOIN candidate_profiles cp
                      ON cp.candidate_id = ca.candidate_id
                    JOIN group_pipeline_stages gps
                      ON gps.group_id = ca.group_id
                     AND gps.organization_id = ca.organization_id
                     AND gps.stage_type = :stage_type
                    JOIN candidate_pipeline_progress csp
                      ON csp.application_id = ca.application_id
                     AND csp.stage_id = gps.stage_id
                    LEFT JOIN proctoring_flags pf
                      ON pf.application_id = ca.application_id
                     AND pf.organization_id = ca.organization_id
                                         AND {session_type_filter_sql}
                    WHERE ca.group_id = :group_id
                      AND ca.organization_id = :org_id
                    GROUP BY
                        ca.application_id,
                        ca.candidate_id,
                        cp.full_name,
                        csp.status,
                        csp.score
                    ORDER BY cp.full_name ASC
                    """
                ),
                {
                    "group_id": group_id,
                    "org_id": self.org_id,
                    "stage_type": stage_key,
                },
            )

            stage_rows = rows.mappings().all()
            stage_decisions: list[GroupIntegrityDecisionCandidate] = []

            for row in stage_rows:
                total_flags = int(row.get("total_flags") or 0)
                high_cnt = int(row.get("high_cnt") or 0)
                medium_cnt = int(row.get("medium_cnt") or 0)
                low_cnt = int(row.get("low_cnt") or 0)
                critical_cnt = int(row.get("critical_cnt") or 0)
                fusion_cnt = int(row.get("fusion_cnt") or 0)

                decision, cheating_detected = self._decision_from_counts(
                    total_flags=total_flags,
                    high_cnt=high_cnt,
                    medium_cnt=medium_cnt,
                    critical_cnt=critical_cnt,
                    fusion_cnt=fusion_cnt,
                )

                stage_score = row.get("stage_score")
                if isinstance(stage_score, Decimal):
                    stage_score = float(stage_score)

                stage_decisions.append(
                    GroupIntegrityDecisionCandidate(
                        application_id=str(row["application_id"]),
                        candidate_id=str(row["candidate_id"]),
                        candidate_name=row["candidate_name"],
                        stage=stage_key,
                        stage_status=row.get("stage_status") or "unknown",
                        stage_score=stage_score,
                        decision=decision,
                        cheating_detected=cheating_detected,
                        total_flags=total_flags,
                        high_flags=high_cnt,
                        medium_flags=medium_cnt,
                        low_flags=low_cnt,
                        critical_flags=critical_cnt,
                        latest_event_type=row.get("latest_event_type"),
                        latest_flag_at=(row.get("latest_flag_at").isoformat() if row.get("latest_flag_at") else None),
                    )
                )

            confirmed_count = len([d for d in stage_decisions if d.decision == "confirmed_cheating"])
            suspicious_count = len([d for d in stage_decisions if d.decision == "suspicious_review"])
            monitoring_count = len([d for d in stage_decisions if d.decision == "monitoring"])
            clean_count = len([d for d in stage_decisions if d.decision == "clean"])

            stage_aggregates.append(
                GroupIntegrityStageAggregate(
                    stage=stage_key,
                    total_candidates=len(stage_decisions),
                    confirmed_cheating=confirmed_count,
                    suspicious_review=suspicious_count,
                    monitoring=monitoring_count,
                    clean=clean_count,
                )
            )

            candidates_payload.extend(stage_decisions)

        if normalized_stage:
            summary = next((s for s in stage_aggregates if s.stage == normalized_stage), None)
            if summary is None:
                summary = GroupIntegrityStageAggregate(
                    stage=normalized_stage,
                    total_candidates=0,
                    confirmed_cheating=0,
                    suspicious_review=0,
                    monitoring=0,
                    clean=0,
                )
        else:
            summary = GroupIntegrityStageAggregate(
                stage="all",
                total_candidates=sum(s.total_candidates for s in stage_aggregates),
                confirmed_cheating=sum(s.confirmed_cheating for s in stage_aggregates),
                suspicious_review=sum(s.suspicious_review for s in stage_aggregates),
                monitoring=sum(s.monitoring for s in stage_aggregates),
                clean=sum(s.clean for s in stage_aggregates),
            )

        return GroupIntegrityDecisionsResponse(
            group_id=str(group_id),
            stage=normalized_stage,
            candidates=candidates_payload,
            summary=summary,
            stage_aggregates=stage_aggregates,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

    async def get_org_suspicious_activity(
        self,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[dict]:
        where_since = ""
        params: dict[str, object] = {
            "org_id": self.org_id,
            "limit": limit,
        }
        if since is not None:
            where_since = " AND pf.created_at > :since "
            params["since"] = since

        query = text(
            f"""
            SELECT
                pf.flag_id,
                pf.application_id,
                ca.candidate_id,
                ca.group_id,
                cp.full_name AS candidate_name,
                COALESCE(pr.name, 'Unknown Project') AS project_title,
                COALESCE(p.job_title, 'Unknown Position') AS position_title,
                COALESCE(cg.group_name, 'Unknown Group') AS group_name,
                pf.event_type,
                pf.severity,
                pf.status,
                pf.evidence,
                pf.created_at
            FROM proctoring_flags pf
            JOIN candidate_applications ca
              ON ca.application_id = pf.application_id
            JOIN candidate_profiles cp
              ON cp.candidate_id = ca.candidate_id
            LEFT JOIN candidate_groups cg
              ON cg.group_id = ca.group_id
            LEFT JOIN positions p
              ON p.position_id = ca.position_id
                        LEFT JOIN projects pr
                            ON pr.project_id = p.project_id
            WHERE ca.organization_id = :org_id
              AND pf.severity IN ('high', 'medium', 'low')
              {where_since}
            ORDER BY pf.created_at DESC
            LIMIT :limit
            """
        )

        res = await self.session.execute(query, params)
        rows = res.mappings().all()
        feed: list[dict] = []
        for r in rows:
            evidence = r["evidence"]
            if isinstance(evidence, str):
                try:
                    evidence = json.loads(evidence)
                except json.JSONDecodeError:
                    evidence = {"raw": evidence}

            feed.append(
                {
                    "flag_id": str(r["flag_id"]),
                    "application_id": str(r["application_id"]),
                    "candidate_id": str(r["candidate_id"]),
                    "group_id": str(r["group_id"]) if r["group_id"] else None,
                    "candidate_name": r["candidate_name"],
                    "project_title": r["project_title"],
                    "position_title": r["position_title"],
                    "group_name": r["group_name"],
                    "event_type": r["event_type"],
                    "severity": r["severity"],
                    "status": r["status"],
                    "evidence": evidence,
                    "created_at": r["created_at"],
                }
            )
        return feed

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

        # 3. Associate Candidates
        if data.candidate_ids:
            # candidate_ids are indeed candidate_id from CandidateProfile
            # Bulk update instead of loop
            await self.session.execute(
                update(CandidateApplication)
                .where(
                    CandidateApplication.candidate_id.in_(data.candidate_ids),
                    CandidateApplication.position_id == data.position_id,
                    CandidateApplication.organization_id == self.org_id
                )
                .values(group_id=group.id, status="screening")
            )

        # 4. Audit Log
        log = SystemLog(
            organization_id=self.org_id,
            user_id=self.user.id,
            action="group_created",
            entity_type="group",
            entity_id=group.id,
            details={
                "name": data.name,
                "position_id": str(data.position_id),
                "candidate_count": len(data.candidate_ids)
            }
        )
        self.session.add(log)

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


    async def update_group(self, group_id: UUID, data: GroupUpdateRequest) -> GroupDetailResponse:
        """Update a group."""
        group = await self._get_group(group_id)
        if data.name:
            group.group_name = data.name
        if data.status:
            group.status = data.status
        if data.filtration_flow is not None:
            # GroupStageConfig is the sole source of truth — sync rows directly
            github_questions_count = data.github_questions_count if data.github_questions_count is not None else 10
            await self._sync_stage_configs(group, data.filtration_flow, github_questions_count)

        self.session.add(group)
        await self.session.commit()

        if data.filtration_flow is not None and self.user.role == "technical":
            github_questions_count = data.github_questions_count if data.github_questions_count is not None else 10
            await self._queue_group_github_analysis_jobs(group, github_questions_count)

        return await self.get_group_details(group_id)

    async def _sync_stage_configs(self, group: CandidateGroup, stage_names: list[str], github_questions_count: int = 10) -> None:
        """Synchronise GroupStageConfig rows with a list of stage names."""
        group_id = group.id
        
        # 2. To avoid UniqueViolationError on stage_order during reordering, 
        #    atomically shift ALL existing orders in the DB for this group to a high range.
        #    We use raw SQL to ensure every single row is moved simultaneously.
        await self.session.execute(
            text("UPDATE group_pipeline_stages SET stage_order = stage_order + 1000 WHERE group_id = :group_id"),
            {"group_id": group_id}
        )
        await self.session.commit()
        
        # 3. Re-fetch all fresh objects in a new transaction
        self.session.add(group)
        res = await self.session.execute(
            select(GroupStageConfig).where(GroupStageConfig.group_id == group_id)
        )
        all_configs = res.scalars().all()

        # Map by type (handle potential duplicates)
        by_type: dict[str, list[GroupStageConfig]] = {}
        for c in all_configs:
            by_type.setdefault(c.stage_type, []).append(c)
        
        # 3. Process new flow
        used_stage_ids = set()
        new_flow_types = []
        for idx, stage_str in enumerate(stage_names):
            stage_type = stage_str.lower().replace("-", "_")
            new_flow_types.append(stage_type)
            
            # Pretty name
            stage_name = stage_str.replace("-", " ").title()
            if stage_type == "ai_interview": stage_name = "AI Interview"
            elif stage_type == "assessment": stage_name = "Technical Assessment"
            elif stage_type == "live_interview": stage_name = "Live Interview"
            
            rows = by_type.get(stage_type, [])
            if rows:
                # Use the first one available
                conf = rows[0]
                conf.stage_order = idx
                conf.stage_name = stage_name
                if conf.state == 'inactive':
                    conf.state = 'not_started'
                if conf.stage_type == "assessment":
                    criteria = conf.acceptance_criteria or {}
                    criteria["github_questions_count"] = int(github_questions_count)
                    conf.acceptance_criteria = criteria
                self.session.add(conf)
                used_stage_ids.add(conf.stage_id)
                # Remove from by_type so it's not reused (in case of duplicate stage_names in input)
                rows.pop(0)
            else:
                # Create new
                new_conf = GroupStageConfig(
                    group_id=group_id,
                    organization_id=group.organization_id,
                    stage_type=stage_type,
                    stage_order=idx,
                    stage_name=stage_name,
                    state="not_started",
                    acceptance_criteria={"github_questions_count": int(github_questions_count)} if stage_type == "assessment" else None,
                )
                self.session.add(new_conf)
        
        # 4. Mark all other rows as inactive with unique high orders
        # This handles both "removed" stages and "duplicate" stages of the same type.
        for conf in all_configs:
            if conf.stage_id not in used_stage_ids:
                conf.state = 'inactive'
                # Use stage_id hex hash or similar to ensure uniqueness in the 1000+ range
                # Or just keep the current high order (+1000) which is already unique.
                # Let's just ensure it's > 500 to stay away from the flow.
                if conf.stage_order < 500:
                     conf.stage_order += 500
                self.session.add(conf)
        
        await self.session.commit()
        self.session.add(group)
        await self.session.commit()

    async def _queue_group_github_analysis_jobs(self, group: CandidateGroup, github_questions_count: int) -> int:
        """Queue GitHub analysis jobs for all candidates in a group after technical flow configuration."""
        app_res = await self.session.execute(
            select(CandidateApplication, CandidateProfile, Position)
            .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
            .join(Position, CandidateApplication.position_id == Position.id)
            .where(
                CandidateApplication.group_id == group.id,
                CandidateApplication.organization_id == self.org_id,
                CandidateApplication.is_deleted == False,
            )
            .order_by(CandidateApplication.applied_at.desc())
        )
        rows = app_res.all()
        if not rows:
            return 0

        queued_jobs: list[tuple[UUID, UUID, str, str]] = []

        for app, profile, position in rows:
            github_url = profile.github_url
            if not github_url:
                cv_res = await self.session.execute(select(CVAnalysis).where(CVAnalysis.application_id == app.id))
                cv = cv_res.scalars().first()
                if cv and isinstance(cv.github_profile, dict):
                    profile_obj = cv.github_profile.get("profile")
                    if isinstance(profile_obj, dict):
                        github_url = profile_obj.get("html_url")
            if not github_url:
                continue

            existing_res = await self.session.execute(
                select(GitHubAnalysisJob).where(
                    GitHubAnalysisJob.organization_id == self.org_id,
                    GitHubAnalysisJob.candidate_id == profile.id,
                    GitHubAnalysisJob.status.in_(["pending", "processing"]),
                )
            )
            existing_job = existing_res.scalars().first()
            if existing_job:
                continue

            job = GitHubAnalysisJob(
                organization_id=self.org_id,
                candidate_id=profile.id,
                created_by_user_id=self.user.id,
                status="pending",
                github_url=github_url,
            )
            self.session.add(job)
            await self.session.flush()
            jd_text = str(position.job_description or position.description or "")
            queued_jobs.append((job.id, profile.id, github_url, jd_text))

        await self.session.commit()

        for job_id, candidate_id, github_url, jd_text in queued_jobs:
            run_github_analysis.delay(
                str(job_id),
                str(candidate_id),
                str(self.org_id),
                github_url,
                jd_text,
                "",
                int(github_questions_count),
            )

        return len(queued_jobs)

    async def bulk_progress(self, group_id: UUID, application_ids: list[UUID], action: str, current_stage_type: str | None = None, reason: str | None = None) -> None:
        """Progress, reject, or hold candidates in bulk."""
        if not application_ids:
            return

        status_map = {
            "progress": "screening",
            "passed": "screening",
            "reject": "rejected",
            "hold": "holded"
        }
        new_status = status_map.get(action, "screening")
        
        # 1. Identify the source stage
        source_stage = None
        if current_stage_type:
            # Frontend uses dashes, backend uses underscores
            normalized_type = current_stage_type.lower().replace("-", "_")
            res = await self.session.execute(
                select(GroupStageConfig).where(
                    GroupStageConfig.group_id == group_id,
                    GroupStageConfig.stage_type == normalized_type
                )
            )
            source_stage = res.scalars().first()
        
        if not source_stage:
            # Fallback to current global active stage
            active_stage_res = await self.session.execute(
                select(GroupStageConfig).where(
                    GroupStageConfig.group_id == group_id,
                    GroupStageConfig.state == "active"
                )
            )
            source_stage = active_stage_res.scalars().first()

        # 2. Identify the next stage in flow (if progressing)
        next_stage = None
        if action in ["progress", "passed"] and source_stage:
            next_stage_res = await self.session.execute(
                select(GroupStageConfig).where(
                    GroupStageConfig.group_id == group_id,
                    GroupStageConfig.stage_order > source_stage.stage_order,
                    GroupStageConfig.state != "inactive"
                ).order_by(GroupStageConfig.stage_order.asc()).limit(1)
            )
            next_stage = next_stage_res.scalars().first()

        # 3. Process each application
        for app_id in application_ids:
            app = await self.session.get(CandidateApplication, app_id)
            if app and app.group_id == group_id:
                old_status = app.status
                app.status = new_status
                self.session.add(app)

                # Update status in the source stage
                if source_stage:
                    prog_res = await self.session.execute(
                        select(CandidateStageProgress).where(
                            CandidateStageProgress.application_id == app.id,
                            CandidateStageProgress.stage_id == source_stage.stage_id
                        )
                    )
                    prog = prog_res.scalars().first()
                    if prog:
                        if action in ["progress", "passed"]:
                            prog.status = "completed"
                            prog.passed = True
                        elif action == "reject":
                            prog.status = "completed"
                            prog.passed = False
                        self.session.add(prog)
                    elif action in ["progress", "passed"]:
                        # If no record exists but we're progressing, create a completed record
                        prog = CandidateStageProgress(
                            application_id=app.id,
                            stage_id=source_stage.stage_id,
                            status="completed",
                            passed=True
                        )
                        self.session.add(prog)

                # Initialize record for the NEXT stage so counts reflect correctly
                if next_stage:
                    # Check if already initialized
                    n_prog_res = await self.session.execute(
                        select(CandidateStageProgress).where(
                            CandidateStageProgress.application_id == app.id,
                            CandidateStageProgress.stage_id == next_stage.stage_id
                        )
                    )
                    n_prog = n_prog_res.scalars().first()
                    if not n_prog:
                        n_prog = CandidateStageProgress(
                            application_id=app.id,
                            stage_id=next_stage.stage_id,
                            status="unlocked" # Awaiting start
                        )
                        self.session.add(n_prog)

                # Log transition
                transition = PipelineTransition(
                    application_id=app.id,
                    organization_id=self.org_id,
                    from_status=old_status,
                    to_status=new_status,
                    triggered_by_user_id=self.user.id,
                    reason=reason
                )
                self.session.add(transition)

                # System log
                log = SystemLog(
                    action=f"bulk_{action}",
                    user_id=self.user.id,
                    organization_id=self.org_id,
                    entity_type="candidate_application",
                    entity_id=app.id,
                    details={"reason": reason, "stage": source_stage.stage_type if source_stage else "unknown"}
                )
                self.session.add(log)

        # 4. Auto-hold for unselected candidates (if progressing)
        if action == "progress" and source_stage:
            # Find all candidates in this group who have reached this stage or were assigned to it but were not selected
            # Use a slightly broader query to catch anyone "pending" or "completed" but not chosen.
            unselected_query = (
                select(CandidateApplication)
                .join(CandidateStageProgress, (CandidateStageProgress.application_id == CandidateApplication.id) & (CandidateStageProgress.stage_id == source_stage.stage_id))
                .where(
                    CandidateApplication.group_id == group_id,
                    CandidateApplication.id.not_in(application_ids),
                    CandidateApplication.status != "rejected"
                )
            )
            unselected_res = await self.session.execute(unselected_query)
            unselected_apps = unselected_res.scalars().all()
            
            for u_app in unselected_apps:
                old_u_status = u_app.status
                u_app.status = "holded"
                self.session.add(u_app)
                
                # Update progress in source stage to 'failed'
                u_prog_res = await self.session.execute(
                    select(CandidateStageProgress).where(
                        CandidateStageProgress.application_id == u_app.id,
                        CandidateStageProgress.stage_id == source_stage.stage_id
                    )
                )
                u_prog = u_prog_res.scalars().first()
                if u_prog:
                    u_prog.status = "completed"
                    u_prog.passed = False
                    self.session.add(u_prog)
                
                # Log transition
                u_transition = PipelineTransition(
                    application_id=u_app.id,
                    organization_id=self.org_id,
                    from_status=old_u_status,
                    to_status="holded",
                    triggered_by_user_id=self.user.id,
                    reason=f"Moved to Holded: Not selected for progression from stage: {source_stage.stage_name}"
                )
                self.session.add(u_transition)
                
                # System log
                u_log = SystemLog(
                    action="automatic_hold",
                    user_id=self.user.id,
                    organization_id=self.org_id,
                    entity_type="candidate_application",
                    entity_id=u_app.id,
                    details={"reason": "Not selected for progression", "stage": source_stage.stage_type}
                )
                self.session.add(u_log)

        await self.session.commit()

    async def schedule_live_interview(self, group_id: UUID, data: ScheduleInterviewRequest) -> dict:
        """Schedules a live interview session for a candidate."""
        group = await self._get_group(group_id)
        
        # Get live interview config for this group
        sc_res = await self.session.execute(
            select(GroupStageConfig).where(
                GroupStageConfig.group_id == group_id,
                GroupStageConfig.stage_type == "live_interview"
            )
        )
        sc = sc_res.scalars().first()
        if not sc or not sc.config_id:
            # Fallback to finding ANY live interview config for the position if none assigned to group
            lic_res = await self.session.execute(
                select(LiveInterviewConfig).where(
                    LiveInterviewConfig.position_id == group.position_id,
                    LiveInterviewConfig.organization_id == self.org_id
                )
            )
            lic = lic_res.scalars().first()
            if not lic:
                 # Create a default one if none exists
                 lic = LiveInterviewConfig(
                     organization_id=self.org_id,
                     position_id=group.position_id,
                     title=f"Live Interview for {group.group_name}",
                     duration_minutes=data.duration_minutes
                 )
                 self.session.add(lic)
                 await self.session.flush()
            config_id = lic.id
        else:
            config_id = sc.config_id

        # Create session
        new_session = LiveInterviewSession(
            config_id=config_id,
            application_id=data.application_id,
            organization_id=self.org_id,
            interviewer_id=data.interviewer_id or self.user.id,
            scheduled_at=data.scheduled_at,
            meeting_link=data.meeting_link,
            status="scheduled"
        )
        self.session.add(new_session)
        
        # Update stage progress status
        if sc:
            prog_res = await self.session.execute(
                select(CandidateStageProgress).where(
                    CandidateStageProgress.application_id == data.application_id,
                    CandidateStageProgress.stage_id == sc.stage_id
                )
            )
            prog = prog_res.scalars().first()
            if prog:
                prog.status = "scheduled"
                self.session.add(prog)
        
        # Log activity
        log = SystemLog(
            action="interview_scheduled",
            user_id=self.user.id,
            organization_id=self.org_id,
            entity_type="candidate_application",
            entity_id=data.application_id,
            details={"scheduled_at": data.scheduled_at.isoformat(), "interviewer_id": str(data.interviewer_id)}
        )
        self.session.add(log)
        
        await self.session.commit()
        return {"status": "success", "session_id": str(new_session.id)}

    # ── Activity Log ──────────────────────────────────────────────────────────

    async def get_activity_log(
        self, group_id: UUID, limit: int = 50, offset: int = 0
    ) -> ActivityLogResponse:
        """Return chronological activity log for the group by merging system_logs,
        recruiter_assignment_logs and pipeline_transitions."""

        gid_str = str(group_id)

        # Collect all raw entries as dicts with a unified shape
        entries: list[dict] = []

        # 1. system_logs  — entity_id = group_id
        sl_res = await self.session.execute(
            select(SystemLog).where(
                SystemLog.entity_id == group_id,
                SystemLog.organization_id == self.org_id,
            ).order_by(SystemLog.created_at.desc()).limit(100)
        )
        for log in sl_res.scalars().all():
            details_txt = None
            if log.details:
                details_txt = ", ".join(
                    f"{k}: {v}" for k, v in log.details.items()
                    if k not in ("group_id", "organization_id")
                )
            entries.append({
                "id": log.id,
                "timestamp": log.created_at,
                "action_type": _map_action_type(log.action),
                "action": _prettify_action(log.action),
                "user_id": log.user_id,
                "details": details_txt,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
            })

        # 2. recruiter_assignment_logs — group_id filter
        ral_res = await self.session.execute(
            select(RecruiterAssignmentLog).where(
                RecruiterAssignmentLog.group_id == group_id,
                RecruiterAssignmentLog.organization_id == self.org_id,
            ).order_by(RecruiterAssignmentLog.created_at.desc()).limit(50)
        )
        for log in ral_res.scalars().all():
            entries.append({
                "id": log.id,
                "timestamp": log.created_at,
                "action_type": "assignment",
                "action": f"Recruiter {log.action}",
                "user_id": log.user_id,
                "details": None,
                "entity_type": "group",
                "entity_id": log.group_id,
            })

        # 3. pipeline_transitions — via candidate applications in this group
        app_res = await self.session.execute(
            select(CandidateApplication.id).where(
                CandidateApplication.group_id == group_id,
                CandidateApplication.is_deleted == False,
            )
        )
        app_ids = [row[0] for row in app_res.all()]

        if app_ids:
            pt_res = await self.session.execute(
                select(PipelineTransition).where(
                    PipelineTransition.application_id.in_(app_ids),
                    PipelineTransition.organization_id == self.org_id,
                ).order_by(PipelineTransition.created_at.desc()).limit(100)
            )
            for pt in pt_res.scalars().all():
                reason_txt = pt.reason or f"{pt.from_status or '?'} → {pt.to_status}"
                entries.append({
                    "id": pt.id,
                    "timestamp": pt.created_at,
                    "action_type": "candidate_decision",
                    "action": f"Candidate status changed to {pt.to_status.replace('_', ' ').title()}",
                    "user_id": pt.triggered_by_user_id,
                    "details": reason_txt,
                    "entity_type": "candidate_application",
                    "entity_id": pt.application_id,
                })

        # Sort combined entries by timestamp desc, apply offset/limit
        entries.sort(key=lambda e: e["timestamp"], reverse=True)
        total = len(entries)
        entries = entries[offset: offset + limit]

        # Resolve user names in bulk
        user_ids = {e["user_id"] for e in entries if e["user_id"]}
        user_map: dict[UUID, str] = {}
        if user_ids:
            u_res = await self.session.execute(
                select(OrganizationUser).where(OrganizationUser.id.in_(user_ids))
            )
            for u in u_res.scalars().all():
                user_map[u.id] = f"{u.first_name} {u.last_name}".strip()

        activities = []
        for e in entries:
            activity_user = None
            if e["user_id"] and e["user_id"] in user_map:
                activity_user = ActivityUser(id=e["user_id"], name=user_map[e["user_id"]])
            activities.append(ActivityItem(
                id=e["id"],
                timestamp=e["timestamp"],
                action_type=e["action_type"],
                action=e["action"],
                user=activity_user,
                details=e["details"],
                entity_type=e["entity_type"],
                entity_id=e["entity_id"],
            ))

        return ActivityLogResponse(activities=activities, total_count=total)


def _map_action_type(action: str) -> str:
    """Map a raw action string to a frontend-friendly category."""
    action_lower = action.lower()
    if "stage" in action_lower:
        return "stage_event"
    if "interview" in action_lower:
        return "interview_config"
    if "assessment" in action_lower:
        return "assessment_config"
    if "candidate" in action_lower:
        return "candidate_decision"
    if "offer" in action_lower:
        return "offer"
    return "system"


def _prettify_action(action: str) -> str:
    """Convert snake_case action names into readable sentences."""
    parts = action.split(":", 1)
    base = parts[0].replace("_", " ").strip().title()
    if len(parts) > 1:
        stage = parts[1].replace("_", " ").title()
        return f"{base}: {stage}"
    return base

