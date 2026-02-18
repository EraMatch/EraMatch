from uuid import UUID
import zipfile
import io
import os
from datetime import datetime, timezone
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.models import CandidateProfile, CandidateApplication, User
from app.schemas import CandidateCreate, CandidateUpdate, ApplicationCreate, CandidateResponse, CandidateUploadResponse

class CandidateService:
    def __init__(self, session: AsyncSession, organization_id: UUID):
        self.session = session
        self.organization_id = organization_id

    # Profile operations
    async def create_profile(self, data: CandidateCreate) -> CandidateProfile:
        # Check if email exists in this org
        query = select(CandidateProfile).where(
            CandidateProfile.organization_id == self.organization_id,
            CandidateProfile.email == data.email
        )
        result = await self.session.execute(query)
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing? Or just return it? For now, let's return it.
            return existing

        candidate = CandidateProfile(
            organization_id=self.organization_id,
            **data.model_dump()
        )
        self.session.add(candidate)
        await self.session.commit()
        await self.session.refresh(candidate)
        return candidate

    async def list_profiles(self, skip: int = 0, limit: int = 50) -> list[CandidateProfile]:
        query = select(CandidateProfile).where(
            CandidateProfile.organization_id == self.organization_id
        ).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_profile(self, candidate_id: UUID) -> CandidateResponse:
        from app.models import CVAnalysis, CandidateStageProgress, Position, Project, Assessment, AIInterviewConfig
        from sqlalchemy import func

        # 1. Fetch base profile
        query = select(CandidateProfile).where(CandidateProfile.id == candidate_id)
        result = await self.session.execute(query)
        profile = result.scalar_one_or_none()
        if not profile:
            return None

        # 2. Fetch latest application for this organization
        app_query = (
            select(CandidateApplication, Position, Project)
            .join(Position, CandidateApplication.position_id == Position.id)
            .join(Project, Position.project_id == Project.id)
            .where(
                CandidateApplication.candidate_id == candidate_id,
                CandidateApplication.organization_id == self.organization_id,
                CandidateApplication.is_deleted == False
            )
            .order_by(CandidateApplication.applied_at.desc())
            .limit(1)
        )
        app_result = await self.session.execute(app_query)
        app_row = app_result.first()

        cv_data = None
        pipeline_status = {
            "groupAssignment": {"status": "completed" if app_row and app_row[0].group_id else "not-started"},
            "assessment": {"status": "not-started"},
            "aiInterview": {"status": "not-started"},
            "liveInterview": {"status": "not-started"},
            "finalDecision": {"status": "completed" if app_row and app_row[0].status in ["hired", "rejected"] else "not-started"}
        }
        assessment_data = None
        interview_data = None
        
        # New: Detailed scores
        scores = {
            "overall": 0.0,
            "assessment": 0.0,
            "aiInterview": 0.0,
            "github": 0.0
        }
        candidate_title = "Software Engineer" # Default fallback

        work_history = []
        education_history = []

        if app_row:
            app, pos, proj = app_row
            
            # Fetch CV Analysis
            cv_query = select(CVAnalysis).where(CVAnalysis.application_id == app.id)
            cv_res = await self.session.execute(cv_query)
            cv = cv_res.scalar_one_or_none()
            if cv:
                cv_data = cv
                scores["github"] = float(cv.match_score or 0.0) # Using match score as proxy for GH for now
                parsed = cv.parsed_data or {}
                
                # Extract Title
                exp_list = parsed.get("work_experience", [])
                if exp_list and len(exp_list) > 0 and isinstance(exp_list[0], dict):
                    candidate_title = exp_list[0].get("job_title") or exp_list[0].get("title") or candidate_title

                # Populate workHistory
                from app.schemas.candidate import JobExperience
                for job in exp_list:
                    if isinstance(job, dict):
                        work_history.append(JobExperience(
                            title=str(job.get("job_title") or job.get("title") or "Unknown Title"),
                            company=str(job.get("company") or job.get("organization") or "Unknown Company"),
                            duration=str(job.get("duration") or job.get("dates") or "N/A"),
                            description=str(job.get("description") or job.get("responsibilities") or "No description provided")
                        ))
                
                # Populate education
                from app.schemas.candidate import Education
                edu_list = parsed.get("education", [])
                for edu in edu_list:
                    if isinstance(edu, dict):
                        education_history.append(Education(
                            degree=str(edu.get("degree") or edu.get("qualification") or "Unknown Degree"),
                            school=str(edu.get("institution") or edu.get("university") or edu.get("school") or "Unknown School"),
                            year=str(edu.get("year") or edu.get("dates") or "N/A")
                        ))

            # Fetch Progress
            progress_query = select(CandidateStageProgress).where(CandidateStageProgress.application_id == app.id)
            progress_res = await self.session.execute(progress_query)
            progresses = progress_res.scalars().all()

            for p in progresses:
                # Map to pipelineStatus (simplified mapping)
                if p.session_type == "assessment":
                    pipeline_status["assessment"]["status"] = p.status
                    if p.status == "completed":
                        score_val = float(p.score or 0.0)
                        max_val = float(p.max_score or 100.0)
                        perc = (score_val / max_val) * 100 if max_val > 0 else 0.0
                        scores["assessment"] = round(perc, 1)
                        assessment_data = {
                            "questionsCorrect": int(p.score or 0),
                            "questionsTotal": int(p.max_score or 10),
                            "completedAt": p.completed_at.isoformat() if p.completed_at else "N/A",
                            "duration": "45 mins",
                            "topicScores": []
                        }
                elif p.session_type == "ai_interview":
                    pipeline_status["aiInterview"]["status"] = p.status
                    if p.status == "completed":
                        score_val = float(p.score or 0.0)
                        max_val = float(p.max_score or 100.0)
                        perc = (score_val / max_val) * 100 if max_val > 0 else 0.0
                        scores["aiInterview"] = round(perc, 1)
                        interview_data = {
                            "completedAt": p.completed_at.isoformat() if p.completed_at else "N/A",
                            "duration": "30 mins",
                            "overallFeedback": "Good communication skills and technical knowledge."
                        }

        # Calculate Overall
        active_scores = [v for k, v in scores.items() if v > 0]
        scores["overall"] = round(sum(active_scores) / len(active_scores), 1) if active_scores else 0.0

        # Create Response
        from app.schemas.candidate import CandidateScores
        response = CandidateResponse.model_validate(profile)
        response.name = profile.full_name
        response.avatar_url = profile.avatar_url
        response.title = candidate_title
        response.scores = CandidateScores(**scores)
        response.workHistory = work_history
        response.education = education_history
        
        if cv_data:
            response.skills = cv_data.skills or []
            response.experience = float(cv_data.experience_years or 0.0)
            
        response.pipelineStatus = pipeline_status
        response.assessmentData = assessment_data
        response.interviewData = interview_data
        
        return response

    async def update_profile(self, candidate_id: UUID, data: CandidateUpdate) -> CandidateProfile:
        candidate = await self.get_profile(candidate_id)
        if not candidate:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(candidate, key, value)
            
        await self.session.commit()
        await self.session.refresh(candidate)
        return candidate

    # Application operations
    async def create_application(self, candidate_id: UUID, data: ApplicationCreate) -> CandidateApplication:
        # Check if already applied
        query = select(CandidateApplication).where(
            CandidateApplication.candidate_id == candidate_id,
            CandidateApplication.position_id == data.position_id,
            CandidateApplication.is_deleted == False
        )
        result = await self.session.execute(query)
        existing = result.scalar_one_or_none()
        
        if existing:
            return existing

        # Create application
        application = CandidateApplication(
            organization_id=self.organization_id,
            candidate_id=candidate_id,
            position_id=data.position_id,
            status="applied",
            resume_url=data.resume_url,
            cover_letter=data.cover_letter,
            source=data.source or "manual_upload",
            applied_at=datetime.now(timezone.utc)
        )
        self.session.add(application)
        await self.session.commit()
        await self.session.refresh(application)
        return application

    async def list_applications_by_candidate(self, candidate_id: UUID) -> list[CandidateApplication]:
        query = select(CandidateApplication).where(
            CandidateApplication.candidate_id == candidate_id,
            CandidateApplication.is_deleted == False
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_knowledge_graph(self, candidate_id: UUID) -> dict:
        """Get knowledge graph data for a candidate."""
        return {
            "nodes": [
                {"id": "1", "label": "Python", "type": "skill", "value": 90},
                {"id": "2", "label": "FastAPI", "type": "skill", "value": 85},
                {"id": "3", "label": "React", "type": "skill", "value": 70},
                {"id": "4", "label": "5 Years Exp", "type": "experience", "value": 100},
            ],
            "edges": [
                {"source": "1", "target": "2", "label": "used in"},
                {"source": "3", "target": "2", "label": "connects to"},
            ]
        }

    async def get_suspect_review(self, candidate_id: UUID) -> list[dict]:
        """Get suspect review activities (for anti-cheating)."""
        # Normally fetches from CandidateStageProgress acceptance_result or audit logs
        return [
            {
                "id": "1",
                "type": "tab-switch",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "severity": "medium",
                "description": "Candidate switched tabs during assessment"
            }
        ]

    # Bulk Upload
    async def process_zip_upload(self, file_content: bytes, position_id: UUID) -> CandidateUploadResponse:
        """
        Process a zip file containing CVs.
        Creates candidates (if new) and applications for the given position.
        """
        success_count = 0
        failed_count = 0
        errors = []
        created_candidates = []

        try:
            with zipfile.ZipFile(io.BytesIO(file_content)) as z:
                for filename in z.namelist():
                    # Skip directories and hidden files
                    if filename.endswith('/') or filename.startswith('__MACOSX') or filename.startswith('.'):
                        continue
                        
                    try:
                        # Simple extraction of name from filename (remove extension)
                        name_part = os.path.basename(filename)
                        full_name = os.path.splitext(name_part)[0].replace('_', ' ').replace('-', ' ').title()
                        
                        # Generate a placeholder email since we can't extract it easily yet
                        # In a real system, we'd use a resume parser here.
                        # We'll use a deterministic email based on name+position to avoid duplicates if re-uploaded
                        safe_name = "".join(c for c in full_name if c.isalnum()).lower()
                        email = f"{safe_name}_{str(position_id)[:8]}@imported.candidate"
                        
                        # Create Profile
                        profile_data = CandidateCreate(
                            full_name=full_name,
                            email=email,
                            linkedin_url=None,
                            github_url=None,
                            portfolio_url=None
                        )
                        
                        candidate = await self.create_profile(profile_data)
                        
                        # Create Application
                        # We might want to store the file content somewhere (S3/Blob).
                        # For now, we'll just mark it as uploaded. 
                        # In a real implementation, we would upload `z.read(filename)` to S3 and get a URL.
                        fake_resume_url = f"s3://bucket/{filename}" 
                        
                        app_data = ApplicationCreate(
                            position_id=position_id,
                            resume_url=fake_resume_url,
                            source="zip_import"
                        )
                        await self.create_application(candidate.id, app_data)
                        
                        created_candidates.append(CandidateResponse.model_validate(candidate))
                        success_count += 1
                        
                    except Exception as e:
                        failed_count += 1
                        errors.append(f"Failed to process {filename}: {str(e)}")
                        print(f"Error processing {filename}: {e}")

        except zipfile.BadZipFile:
            return CandidateUploadResponse(
                total_processed=0,
                success_count=0,
                failed_count=0,
                errors=["Invalid zip file"],
                created_candidates=[]
            )
        except Exception as e:
            return CandidateUploadResponse(
                total_processed=0,
                success_count=0,
                failed_count=0,
                errors=[f"Unexpected error: {str(e)}"],
                created_candidates=[]
            )

        return CandidateUploadResponse(
            total_processed=success_count + failed_count,
            success_count=success_count,
            failed_count=failed_count,
            errors=errors,
            created_candidates=created_candidates
        )
