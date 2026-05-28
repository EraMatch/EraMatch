import io
import logging
import os
import random
import re
import string
import tempfile
import zipfile
import base64
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from sqlalchemy import select, update, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import (
    CVIngestionJob,
    DriveIngestionSchedule,
    CandidateProfile,
    CandidateApplication,
    Position,
)
from app.services.prescore import PreScoreService
from worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# Google credentials path
GOOGLE_SERVICE_ACCOUNT_FILE = getattr(settings, "GOOGLE_SERVICE_ACCOUNT_FILE", "credentials.json")


class CVIngestionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def update_job_status(self, job_id: UUID, status: str, **extra_fields):
        """Update a CVIngestionJob row."""
        job = await self.session.get(CVIngestionJob, job_id)
        if not job:
            return

        job.status = status
        if status in ["completed", "failed"]:
            job.completed_at = datetime.utcnow()

        for key, value in extra_fields.items():
            if hasattr(job, key):
                setattr(job, key, value)
            elif key == "processing_log": # Handle JSONB column explicitly if not direct matching
                job.processing_log = value

        self.session.add(job)
        await self.session.commit()

    async def create_zip_ingestion_job(self, organization_id: UUID, position_id: UUID, user_id: UUID | None, filename: str) -> CVIngestionJob:
        job = CVIngestionJob(
            organization_id=organization_id,
            position_id=position_id,
            created_by_user_id=user_id if (user_id and user_id != organization_id) else None,
            status="pending",
            source_type="zip_upload",
            source_filename=filename
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        return job

    async def create_drive_schedule(self, organization_id: UUID, position_id: UUID, user_id: UUID | None, drive_folder_id: str, drive_folder_url: str, start_date: datetime, frequency_days: int, frequency_hours: int) -> DriveIngestionSchedule:
        schedule = DriveIngestionSchedule(
            organization_id=organization_id,
            position_id=position_id,
            created_by_user_id=user_id if (user_id and user_id != organization_id) else None,
            drive_folder_id=drive_folder_id,
            drive_folder_url=drive_folder_url,
            start_date=start_date,
            next_run_at=start_date,
            frequency_days=frequency_days,
            frequency_hours=frequency_hours,
            is_active=True
        )
        self.session.add(schedule)
        await self.session.commit()
        await self.session.refresh(schedule)

        # Dispatch ETA Task
        task = celery_app.send_task("cv_ingestion.run_drive_sync", args=[str(schedule.id)], eta=start_date)
        schedule.celery_task_id = task.id
        self.session.add(schedule)
        await self.session.commit()
        return schedule

    async def cancel_drive_schedule(self, schedule_id: UUID, organization_id: UUID):
        schedule = await self.session.get(DriveIngestionSchedule, schedule_id)
        if not schedule or schedule.organization_id != organization_id:
            raise ValueError("Schedule not found")

        schedule.is_active = False
        
        if schedule.celery_task_id:
            celery_app.control.revoke(schedule.celery_task_id, terminate=False)
            schedule.next_run_at = None

        self.session.add(schedule)
        await self.session.commit()

    async def get_or_create_candidate(self, organization_id: UUID, email: str, name: str, position_id: UUID | None = None) -> UUID:
        """Gets existing candidate ID or creates a new candidate profile.

        If `position_id` is provided we only consider an email a duplicate when
        there's already an application for the SAME position. This mirrors the
        position-scoped behavior in the main CandidateService.
        """
        # Position-aware duplicate check: if an application exists for this
        # email on the same position, return the existing profile ID.
        if position_id:
            # Join through the application to get the exact candidate tied to this position,
            # avoiding the wrong-profile risk when the same email exists across positions.
            dup_stmt = (
                select(CandidateProfile)
                .join(CandidateApplication, CandidateApplication.candidate_id == CandidateProfile.id)
                .where(
                    CandidateProfile.email == email,
                    CandidateProfile.organization_id == organization_id,
                    CandidateApplication.position_id == position_id,
                    CandidateApplication.is_deleted == False,
                )
            )
            dup_res = await self.session.execute(dup_stmt)
            existing = dup_res.scalars().first()
            if existing:
                return existing.id

        # Otherwise create a new candidate profile even if the email exists
        # elsewhere in the organization (i.e. duplicate allowed across positions).
        chars = string.ascii_lowercase + string.digits
        for _ in range(20):
            username = ''.join(random.choice(chars) for _ in range(10))
            check = await self.session.execute(
                select(CandidateProfile).where(CandidateProfile.username == username)
            )
            if not check.scalar_one_or_none():
                break

        new_candidate = CandidateProfile(
            organization_id=organization_id,
            full_name=name,
            email=email,
            username=username,
        )
        self.session.add(new_candidate)
        await self.session.commit()
        await self.session.refresh(new_candidate)
        return new_candidate.id

    async def apply_for_position(self, organization_id: UUID, position_id: UUID, candidate_id: UUID, source: str) -> Optional[UUID]:
        """Creates a job application if one doesn't exist for this role. Returns app_id or None if duplicate."""
        stmt = select(CandidateApplication).where(
            CandidateApplication.position_id == position_id,
            CandidateApplication.candidate_id == candidate_id
        )
        res = await self.session.execute(stmt)
        existing_app = res.scalars().first()

        if existing_app:
            return None  # Duplicate application

        new_app = CandidateApplication(
            organization_id=organization_id,
            position_id=position_id,
            candidate_id=candidate_id,
            source=source
        )
        self.session.add(new_app)
        await self.session.commit()
        await self.session.refresh(new_app)
        return new_app.id

    def save_cv_file(self, app_id: UUID, file_name: str, file_content: bytes) -> str:
        """Saves the CV into local storage organized by application_id."""
        base_dir = os.path.join(os.getcwd(), "static", "cvs", str(app_id))
        os.makedirs(base_dir, exist_ok=True)
        file_path = os.path.join(base_dir, file_name)
        with open(file_path, "wb") as f:
            f.write(file_content)
        return file_path

    async def handle_async_parse_result(self, tenant_id: str, job_id: str, file_path: str, status: str, parsed_data: dict | None, error: str | None, source: str = "upload"):
        """Called by webhook when parsing finishes"""
        parsed_ok = status == "success" and isinstance(parsed_data, dict)
        if not parsed_ok:
            logger.error(f"CV parsing failed per webhook for {file_path}: {error}")

        fallback_name = os.path.basename(file_path).split("_", 1)[-1]
        email = (parsed_data or {}).get("email") if parsed_ok else None
        name = (parsed_data or {}).get("full_name") if parsed_ok else None
        email = email or f"{str(uuid.uuid4())}@example.com"
        name = name or fallback_name

        logger.info(f"Webhook creating candidate {email} for {file_path}")

        candidate_id = await self.get_or_create_candidate(UUID(str(tenant_id)), email, name, UUID(str(job_id)))
        app_source = source if parsed_ok else f"{source}_parse_failed"
        app_id = await self.apply_for_position(UUID(str(tenant_id)), UUID(str(job_id)), candidate_id, app_source)

        if app_id:
            try:
                with open(file_path, "rb") as f:
                    file_content = f.read()
                self.save_cv_file(app_id, os.path.basename(file_path), file_content)
            except Exception as e:
                logger.error(f"Failed to move staged file {file_path}: {e}")

            if parsed_ok and parsed_data:
                # Trigger prescore computation at ingestion time when possible.
                # If approved QAG questions are unavailable, scorer falls back to heuristic mode.
                try:
                    position_stmt = select(Position).where(
                        Position.id == UUID(str(job_id)),
                        Position.organization_id == UUID(str(tenant_id)),
                        Position.is_deleted == False,
                    )
                    position = (await self.session.execute(position_stmt)).scalars().first()
                    if position:
                        artifact = position.jd_hdeval_qag if isinstance(position.jd_hdeval_qag, dict) else {}
                        has_approved_qag = isinstance(artifact.get("approved_questions"), list) and len(artifact.get("approved_questions")) > 0
                        jd_critic_result = artifact if has_approved_qag else {}

                        skills_items = parsed_data.get("skills", []) if isinstance(parsed_data, dict) else []
                        candidate_skills = [
                            str(s.get("skill_name") or s.get("name") or "").strip()
                            for s in skills_items
                            if isinstance(s, dict) and str(s.get("skill_name") or s.get("name") or "").strip()
                        ]

                        exp_val = parsed_data.get("years_of_experience") if isinstance(parsed_data, dict) else None
                        try:
                            candidate_experience_years = float(exp_val) if exp_val is not None else 0.0
                        except (TypeError, ValueError):
                            candidate_experience_years = 0.0

                        scorer = PreScoreService()
                        parsed_data["prescore_v2"] = await scorer.score_candidate_prescore(
                            job_title=position.job_title,
                            job_description=position.job_description,
                            required_skills=position.required_skills if isinstance(position.required_skills, list) else [],
                            years_of_experience=position.years_of_experience,
                            candidate_skills=candidate_skills,
                            candidate_experience_years=candidate_experience_years,
                            candidate_parsed_data=parsed_data,
                            github_analysis_data={},
                            jd_critic_result=jd_critic_result,
                        )
                except Exception as score_exc:
                    logger.warning(f"Prescore computation skipped for app {app_id}: {score_exc}")

                celery_app.send_task(
                    "cv_parsing.persist_parsed_data",
                    args=[str(app_id), str(tenant_id), file_path, parsed_data],
                )
            
    async def process_cv_file(self, organization_id: UUID, position_id: UUID, file_name: str, file_content: bytes, source: str) -> Dict[str, Any]:
        """Stages a CV file and dispatches async parsing."""
        staging_id = str(uuid.uuid4())
        base_dir = os.path.join(os.getcwd(), "static", "cvs", "staging", str(organization_id), str(position_id))
        os.makedirs(base_dir, exist_ok=True)
        
        file_path = os.path.join(base_dir, f"{staging_id}_{file_name}")
        with open(file_path, "wb") as f:
            f.write(file_content)
            
        if file_name.lower().endswith(".pdf"):
            celery_app.send_task(
                "cv_parsing.extract_and_parse_cv",
                args=[file_path, str(organization_id), str(position_id), source],
            )
            return {"status": "staged", "file": file_name}
        else:
            return {"status": "skipped", "file": file_name, "reason": "Not a PDF"}

    async def process_zip_ingestion(self, job_id: UUID, organization_id: UUID, position_id: UUID, zip_content: str):
        """Processes an uploaded ZIP file of CVs."""
        logger.info(f"Starting ZIP ingestion for Job {job_id}")
        file_bytes = base64.b64decode(zip_content)
        
        processed = 0
        skipped = 0
        processing_log = []

        try:
            await self.update_job_status(job_id, "processing")
            
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                # Filter standard files, ignore __MACOSX or hidden
                valid_files = [f for f in z.namelist() if not f.startswith("__MACOSX/") and not f.startswith(".") and not f.endswith("/")]
                
                for file_name in valid_files:
                    file_content = z.read(file_name)
                    # Ignore very small or empty files
                    if len(file_content) < 100:
                        continue
                        
                    basename = os.path.basename(file_name)
                    res = await self.process_cv_file(organization_id, position_id, basename, file_content, source="zip_upload")
                    
                    processing_log.append(res)
                    if res["status"] in {"processed", "staged"}:
                        processed += 1
                    else:
                        skipped += 1
                        
            await self.update_job_status(
                job_id, "completed", 
                processed_files=processed, 
                skipped_files=skipped, 
                total_files=processed + skipped,
                processing_log=processing_log
            )
            
        except Exception as e:
            logger.exception(f"ZIP Ingestion Failed: {job_id}")
            try:
                # The session's connection may be dirty — rollback before reuse
                await self.session.rollback()
                await self.update_job_status(job_id, "failed", error_message=str(e))
            except Exception as inner_e:
                logger.error(f"Failed to update job status to failed: {inner_e}")
                # Worker task has a fallback that uses a fresh session
                raise e  # Re-raise original so the worker-level handler can mark it failed

    def _connect_google_drive(self):
        creds = service_account.Credentials.from_service_account_file(
            GOOGLE_SERVICE_ACCOUNT_FILE, scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
        return build('drive', 'v3', credentials=creds)

    async def run_drive_ingestion(self, schedule_id: UUID):
        """Executes a Google Drive ingestion and schedules the next run if recurring."""
        logger.info(f"Starting Drive Ingestion for Schedule {schedule_id}")
        
        try:
            schedule = await self.session.get(DriveIngestionSchedule, schedule_id)
            
            if not schedule or not schedule.is_active:
                logger.info("Schedule inactive or deleted.")
                return

            # 1. Create a tracking job for this run
            job = CVIngestionJob(
                organization_id=schedule.organization_id,
                position_id=schedule.position_id,
                created_by_user_id=schedule.created_by_user_id,
                source_type="google_drive",
                status="processing"
            )
            self.session.add(job)
            await self.session.commit()
            await self.session.refresh(job)

            schedule.last_run_at = datetime.utcnow()
            schedule.last_job_id = job.id
            self.session.add(schedule)
            await self.session.commit()

            # 2. Fetch files from Drive
            service = self._connect_google_drive()
            folder_id = schedule.drive_folder_id
            
            # Only fetch pdf, docx etc. Example query:
            query = f"'{folder_id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
            results = service.files().list(q=query, fields="files(id, name)").execute()
            items = results.get('files', [])

            processed = 0
            skipped = 0
            processing_log = []

            for item in items:
                request = service.files().get_media(fileId=item['id'])
                fh = io.BytesIO()
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while done is False:
                    status, done = downloader.next_chunk()
                
                file_content = fh.getvalue()
                if len(file_content) > 0:
                    res = await self.process_cv_file(schedule.organization_id, schedule.position_id, item['name'], file_content, source="google_drive")
                    processing_log.append(res)
                    if res["status"] in {"processed", "staged"}:
                        processed += 1
                    else:
                        skipped += 1

            await self.update_job_status(
                job.id, "completed", 
                processed_files=processed, 
                skipped_files=skipped, 
                total_files=processed + skipped,
                processing_log=processing_log
            )

            # 3. Handle Recurrence Scheduling
            freq_days = schedule.frequency_days or 0
            freq_hours = schedule.frequency_hours or 0
            
            if freq_days > 0 or freq_hours > 0:
                next_run = datetime.utcnow() + timedelta(days=freq_days, hours=freq_hours)
                
                # Re-enqueue self using ETA
                task = celery_app.send_task("cv_ingestion.run_drive_sync", args=[str(schedule_id)], eta=next_run)
                
                schedule.next_run_at = next_run
                schedule.celery_task_id = task.id
                self.session.add(schedule)
                await self.session.commit()
                logger.info(f"Re-enqueued Drive Schedule {schedule_id} for {next_run}")
            else:
                schedule.is_active = False
                self.session.add(schedule)
                await self.session.commit()
                logger.info("One-time drive ingestion completed. Deactivated schedule.")

        except Exception as e:
            logger.exception(f"Drive Ingestion Failed: {schedule_id}")
            try:
                await self.session.rollback()
                if 'job' in locals() and job.id:
                    await self.update_job_status(job.id, "failed", error_message=str(e))
            except Exception as inner_e:
                logger.error(f"Failed to update job status to failed: {inner_e}")

    async def recover_missed_schedules(self):
        """
        Called on worker startup to re-enqueue any Drive schedules whose
        ETA passed while the Celery worker was down.
        """
        logger.info("Recovering missed Drive ingestion schedules...")
        try:
            stmt = select(DriveIngestionSchedule).where(
                DriveIngestionSchedule.is_active == True,
                DriveIngestionSchedule.next_run_at != None,
                DriveIngestionSchedule.next_run_at <= datetime.utcnow()
            )
            res = await self.session.execute(stmt)
            missed_schedules = res.scalars().all()
            
            for schedule in missed_schedules:
                logger.info(f"Recovering missed schedule {schedule.id}")
                # Immediately enqueue
                task = celery_app.send_task("cv_ingestion.run_drive_sync", args=[str(schedule.id)])
                
                # Note: We let the task itself calculate its NEXT next_run_at when it finishes.
                schedule.celery_task_id = task.id
                self.session.add(schedule)
            
            if missed_schedules:    
                await self.session.commit()
        except Exception as e:
            logger.exception("Failed to recover missed schedules")


class CVIngestionWorkerService:
    """Synchronous version of CVIngestionService for use in Celery workers."""
    
    def __init__(self, session: Session):
        self.session = session

    def update_job_status(self, job_id: UUID, status: str, **extra_fields):
        """Update a CVIngestionJob row (Synchronous)."""
        job = self.session.get(CVIngestionJob, job_id)
        if not job:
            return

        job.status = status
        if status in ["completed", "failed"]:
            job.completed_at = datetime.utcnow()

        for key, value in extra_fields.items():
            if hasattr(job, key):
                setattr(job, key, value)
            elif key == "processing_log":
                job.processing_log = value

        self.session.add(job)
        self.session.commit()

    def get_or_create_candidate(self, organization_id: UUID, email: str, name: str, position_id: UUID | None = None) -> UUID:
        """Gets existing candidate ID or creates a new candidate profile (Synchronous).

        Position-aware: if `position_id` provided only consider email a duplicate
        when there's already an application for the same position.
        """
        if position_id:
            dup_stmt = (
                select(CandidateApplication)
                .join(CandidateProfile, CandidateApplication.candidate_id == CandidateProfile.id)
                .where(
                    CandidateProfile.email == email,
                    CandidateProfile.organization_id == organization_id,
                    CandidateApplication.position_id == position_id,
                    CandidateApplication.is_deleted == False,
                )
            )
            dup_res = self.session.execute(dup_stmt)
            if dup_res.scalars().first():
                existing_stmt = select(CandidateProfile).where(
                    CandidateProfile.organization_id == organization_id,
                    CandidateProfile.email == email,
                )
                existing = self.session.execute(existing_stmt).scalars().first()
                if existing:
                    return existing.id

        chars = string.ascii_lowercase + string.digits
        for _ in range(20):
            username = ''.join(random.choice(chars) for _ in range(10))
            check = self.session.execute(
                select(CandidateProfile).where(CandidateProfile.username == username)
            )
            if not check.scalar_one_or_none():
                break

        new_candidate = CandidateProfile(
            organization_id=organization_id,
            full_name=name,
            email=email,
            username=username,
        )
        self.session.add(new_candidate)
        self.session.commit()
        self.session.refresh(new_candidate)
        return new_candidate.id

    def apply_for_position(self, organization_id: UUID, position_id: UUID, candidate_id: UUID, source: str) -> Optional[UUID]:
        """Creates a job application if one doesn't exist for this role (Synchronous)."""
        stmt = select(CandidateApplication).where(
            CandidateApplication.position_id == position_id,
            CandidateApplication.candidate_id == candidate_id
        )
        existing_app = self.session.execute(stmt).scalars().first()

        if existing_app:
            return None

        new_app = CandidateApplication(
            organization_id=organization_id,
            position_id=position_id,
            candidate_id=candidate_id,
            source=source
        )
        self.session.add(new_app)
        self.session.commit()
        self.session.refresh(new_app)
        return new_app.id

    def handle_async_parse_result(self, tenant_id: str, job_id: str, file_path: str, status: str, parsed_data: dict | None, error: str | None, source: str = "upload"):
        """Called by webhook when parsing finishes (Synchronous)"""
        parsed_ok = status == "success" and isinstance(parsed_data, dict)
        if not parsed_ok:
            logger.error(f"CV parsing failed per webhook for {file_path}: {error}")

        fallback_name = os.path.basename(file_path).split("_", 1)[-1]
        email = (parsed_data or {}).get("email") if parsed_ok else None
        name = (parsed_data or {}).get("full_name") if parsed_ok else None
        email = email or f"{str(uuid.uuid4())}@example.com"
        name = name or fallback_name

        logger.info(f"Webhook creating candidate {email} for {file_path} (Sync)")

        candidate_id = self.get_or_create_candidate(UUID(str(tenant_id)), email, name, UUID(str(job_id)))
        app_source = source if parsed_ok else f"{source}_parse_failed"
        app_id = self.apply_for_position(UUID(str(tenant_id)), UUID(str(job_id)), candidate_id, app_source)

        if app_id:
            try:
                with open(file_path, "rb") as f:
                    file_content = f.read()

                base_dir = os.path.join(os.getcwd(), "static", "cvs", str(app_id))
                os.makedirs(base_dir, exist_ok=True)
                new_file_path = os.path.join(base_dir, os.path.basename(file_path))
                with open(new_file_path, "wb") as new_f:
                    new_f.write(file_content)
            except Exception as e:
                logger.error(f"Failed to move staged file {file_path}: {e}")

            if parsed_ok and parsed_data:
                celery_app.send_task(
                    "cv_parsing.persist_parsed_data",
                    args=[str(app_id), str(tenant_id), file_path, parsed_data],
                )

    def process_cv_file(self, organization_id: UUID, position_id: UUID, file_name: str, file_content: bytes, source: str) -> Dict[str, Any]:
        """Stages a CV file and dispatches async parsing (Synchronous)."""
        staging_id = str(uuid.uuid4())
        base_dir = os.path.join(os.getcwd(), "static", "cvs", "staging", str(organization_id), str(position_id))
        os.makedirs(base_dir, exist_ok=True)
        
        file_path = os.path.join(base_dir, f"{staging_id}_{file_name}")
        with open(file_path, "wb") as f:
            f.write(file_content)
            
        if file_name.lower().endswith(".pdf"):
            celery_app.send_task(
                "cv_parsing.extract_and_parse_cv",
                args=[file_path, str(organization_id), str(position_id), source],
            )
            return {"status": "staged", "file": file_name}
        else:
            return {"status": "skipped", "file": file_name, "reason": "Not a PDF"}

    def process_zip_ingestion(self, job_id: UUID, organization_id: UUID, position_id: UUID, zip_content: str):
        """Processes an uploaded ZIP file of CVs (Synchronous)."""
        logger.info(f"Starting ZIP ingestion for Job {job_id} (Sync)")
        file_bytes = base64.b64decode(zip_content)
        
        processed = 0
        skipped = 0
        processing_log = []

        try:
            self.update_job_status(job_id, "processing")
            
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                valid_files = [f for f in z.namelist() if not f.startswith("__MACOSX/") and not f.startswith(".") and not f.endswith("/")]
                
                for file_name in valid_files:
                    file_content = z.read(file_name)
                    if len(file_content) < 100:
                        continue
                        
                    basename = os.path.basename(file_name)
                    res = self.process_cv_file(organization_id, position_id, basename, file_content, source="zip_upload")
                    
                    processing_log.append(res)
                    if res["status"] in {"processed", "staged"}:
                        processed += 1
                    else:
                        skipped += 1
                        
            self.update_job_status(
                job_id, "completed", 
                processed_files=processed, 
                skipped_files=skipped, 
                total_files=processed + skipped,
                processing_log=processing_log
            )
            
        except Exception as e:
            logger.exception(f"ZIP Ingestion Failed: {job_id}")
            try:
                self.session.rollback()
                self.update_job_status(job_id, "failed", error_message=str(e))
            except Exception as inner_e:
                logger.error(f"Failed to update job status to failed: {inner_e}")
                raise e

    def process_pdf_ingestion(self, job_id: UUID, organization_id: UUID, position_id: UUID, pdf_name: str, pdf_content: str):
        """Processes an uploaded single PDF file of a CV."""
        logger.info(f"Starting PDF ingestion for Job {job_id} (Sync)")
        file_bytes = base64.b64decode(pdf_content)
        try:
            self.update_job_status(job_id, "processing")
            res = self.process_cv_file(organization_id, position_id, pdf_name, file_bytes, source="pdf_upload")
            
            if res["status"] == "staged":
                processed = 1
                skipped = 0
            else:
                processed = 0
                skipped = 1
                
            self.update_job_status(
                job_id, "completed", 
                processed_files=processed, 
                skipped_files=skipped, 
                total_files=1,
                processing_log=[res]
            )
        except Exception as e:
            logger.exception(f"PDF Ingestion Failed: {job_id}")
            try:
                self.session.rollback()
                self.update_job_status(job_id, "failed", error_message=str(e))
            except Exception as inner_e:
                logger.error(f"Failed to update job status to failed: {inner_e}")
                raise e

    def _connect_google_drive(self):
        creds = service_account.Credentials.from_service_account_file(
            GOOGLE_SERVICE_ACCOUNT_FILE, scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
        return build('drive', 'v3', credentials=creds)

    def run_drive_ingestion(self, schedule_id: UUID):
        """Executes a Google Drive ingestion (Synchronous)."""
        logger.info(f"Starting Drive Ingestion for Schedule {schedule_id} (Sync)")
        
        try:
            schedule = self.session.get(DriveIngestionSchedule, schedule_id)
            if not schedule or not schedule.is_active:
                logger.info("Schedule inactive or deleted.")
                return

            job = CVIngestionJob(
                organization_id=schedule.organization_id,
                position_id=schedule.position_id,
                created_by_user_id=schedule.created_by_user_id,
                source_type="google_drive",
                status="processing"
            )
            self.session.add(job)
            self.session.commit()
            self.session.refresh(job)

            schedule.last_run_at = datetime.utcnow()
            schedule.last_job_id = job.id
            self.session.add(schedule)
            self.session.commit()

            service = self._connect_google_drive()
            folder_id = schedule.drive_folder_id
            
            # Robustness: Extract ID from URL if necessary
            if "drive.google.com" in folder_id:
                match = re.search(r"folders/([a-zA-Z0-9-_]+)", folder_id)
                if match:
                    folder_id = match.group(1)

            query = f"'{folder_id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
            results = service.files().list(q=query, fields="files(id, name, mimeType)").execute()
            items = results.get('files', [])
            
            logger.info(f"Drive Ingestion: Found {len(items)} files in folder {folder_id}")

            processed = 0
            skipped = 0
            processing_log = []

            for item in items:
                logger.info(f"Processing Drive file: {item['name']} (ID: {item['id']}, Mime: {item.get('mimeType')})")
                try:
                    request = service.files().get_media(fileId=item['id'])
                    fh = io.BytesIO()
                    downloader = MediaIoBaseDownload(fh, request)
                    done = False
                    while done is False:
                        status, done = downloader.next_chunk()
                    
                    file_content = fh.getvalue()
                    if len(file_content) > 0:
                        res = self.process_cv_file(schedule.organization_id, schedule.position_id, item['name'], file_content, source="google_drive")
                        logger.info(f"Process CV File result for {item['name']}: {res['status']}")
                        processing_log.append(res)
                        if res["status"] in {"processed", "staged"}:
                            processed += 1
                        else:
                            skipped += 1
                    else:
                        logger.warning(f"File {item['name']} is empty, skipping.")
                        skipped += 1
                except Exception as file_e:
                    logger.error(f"Failed to download/process Drive file {item['name']}: {file_e}")
                    processing_log.append({"status": "error", "file": item['name'], "error": str(file_e)})
                    skipped += 1

            self.update_job_status(
                job.id, "completed", 
                processed_files=processed, 
                skipped_files=skipped, 
                total_files=processed + skipped,
                processing_log=processing_log
            )

            freq_days = schedule.frequency_days or 0
            freq_hours = schedule.frequency_hours or 0
            
            if freq_days > 0 or freq_hours > 0:
                next_run = datetime.utcnow() + timedelta(days=freq_days, hours=freq_hours)
                task = celery_app.send_task("cv_ingestion.run_drive_sync", args=[str(schedule_id)], eta=next_run)
                schedule.next_run_at = next_run
                schedule.celery_task_id = task.id
                self.session.add(schedule)
                self.session.commit()
            else:
                schedule.is_active = False
                self.session.add(schedule)
                self.session.commit()

        except Exception as e:
            logger.exception(f"Drive Ingestion Failed: {schedule_id}")
            try:
                self.session.rollback()
                if 'job' in locals():
                    self.update_job_status(job.id, "failed", error_message=str(e))
            except Exception as inner_e:
                logger.error(f"Failed to update job status to failed: {inner_e}")

    def recover_missed_schedules(self):
        """Recover missed schedules (Synchronous)."""
        logger.info("Recovering missed Drive ingestion schedules (Sync)...")
        try:
            stmt = select(DriveIngestionSchedule).where(
                DriveIngestionSchedule.is_active == True,
                DriveIngestionSchedule.next_run_at != None,
                DriveIngestionSchedule.next_run_at <= datetime.utcnow()
            )
            missed_schedules = self.session.execute(stmt).scalars().all()
            
            for schedule in missed_schedules:
                logger.info(f"Recovering missed schedule {schedule.id}")
                task = celery_app.send_task("cv_ingestion.run_drive_sync", args=[str(schedule.id)])
                schedule.celery_task_id = task.id
                self.session.add(schedule)
            
            if missed_schedules:    
                self.session.commit()
        except Exception as e:
            logger.exception("Failed to recover missed schedules")
