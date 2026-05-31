import os
import uuid
from datetime import datetime, timezone
from uuid import UUID
import re

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models import OrganizationUser
from app.services.cv_ingestion import CVIngestionService
import base64

router = APIRouter()


@router.post("/zip")
async def upload_zip_ingestion(
    position_id: UUID = Form(...),
    files: list[UploadFile] = File(...),
    current_user: OrganizationUser = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ingest CVs via ZIP or PDF uploads.
    PDFs are staged to disk immediately, then dispatched directly to cv_parsing
    (skips the base64-through-Redis bottleneck and the redundant ingestion hop).
    ZIPs follow the original path.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    service = CVIngestionService(db)
    results = []

    for file in files:
        filename_lower = (file.filename or "").lower()
        is_zip = filename_lower.endswith(".zip")
        is_pdf = filename_lower.endswith(".pdf")

        if not (is_zip or is_pdf):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format for '{file.filename}'. Only ZIP and PDF are supported."
            )

        file_bytes = await file.read()
        if len(file_bytes) > 200 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"'{file.filename}' exceeds 200MB limit.")

        # Create tracking job
        job = await service.create_zip_ingestion_job(
            organization_id=current_user.organization_id,
            position_id=position_id,
            user_id=current_user.id,
            filename=file.filename or "file"
        )

        if is_pdf:
            job.source_type = "pdf_upload"

            # Stage to disk immediately — no base64 encoding through Redis
            staging_dir = os.path.join(
                os.getcwd(), "static", "cvs", "staging",
                str(current_user.organization_id), str(position_id)
            )
            os.makedirs(staging_dir, exist_ok=True)
            staging_id = str(uuid.uuid4())
            file_path = os.path.join(staging_dir, f"{staging_id}_{file.filename}")
            with open(file_path, "wb") as fh:
                fh.write(file_bytes)

            # Mark job staged — actual parse status tracked via cv_analysis.analyzed_at
            job.status = "completed"
            job.processed_files = 1
            job.total_files = 1
            job.completed_at = datetime.utcnow()
            db.add(job)

            # Dispatch directly to cv_parsing worker (path only, tiny payload)
            from worker.tasks.cv_parsing import extract_and_parse_cv
            extract_and_parse_cv.delay(
                file_path,
                str(current_user.organization_id),
                str(position_id),
                "pdf_upload"
            )
            results.append({"file": file.filename, "status": "staged", "job_id": str(job.id)})

        else:
            # ZIP: existing path — encode + dispatch to zip ingestion worker
            encoded_zip = base64.b64encode(file_bytes).decode("utf-8")
            db.add(job)

            from worker.tasks.cv_ingestion import process_zip_ingestion
            process_zip_ingestion.delay(
                str(job.id),
                str(current_user.organization_id),
                str(position_id),
                encoded_zip
            )
            results.append({"file": file.filename, "status": "queued", "job_id": str(job.id)})

    await db.commit()
    return {
        "message": f"{len(results)} file(s) accepted for processing.",
        "job_ids": [r["job_id"] for r in results],
        "results": results,
    }


@router.post("/drive-schedule")
async def create_drive_ingestion_schedule(
    position_id: UUID = Form(...),
    drive_folder_id: str = Form(...),
    drive_folder_url: str = Form(None),
    start_date: datetime = Form(...),
    frequency_days: int = Form(0),
    frequency_hours: int = Form(0),
    current_user: OrganizationUser = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Set up a Google Drive folder scheduled ingestion."""
    if start_date.tzinfo is not None:
        start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)
    if start_date < datetime.utcnow():
        start_date = datetime.utcnow()

    extracted_id = drive_folder_id
    if "drive.google.com" in drive_folder_id:
        match = re.search(r"folders/([a-zA-Z0-9-_]+)", drive_folder_id)
        if match:
            extracted_id = match.group(1)
            if not drive_folder_url:
                drive_folder_url = drive_folder_id

    if drive_folder_url and "drive.google.com" in drive_folder_url:
        match = re.search(r"folders/([a-zA-Z0-9-_]+)", drive_folder_url)
        if match and extracted_id == drive_folder_id:
            extracted_id = match.group(1)

    service = CVIngestionService(db)
    schedule = await service.create_drive_schedule(
        organization_id=current_user.organization_id,
        position_id=position_id,
        user_id=current_user.id,
        drive_folder_id=extracted_id,
        drive_folder_url=drive_folder_url,
        start_date=start_date,
        frequency_days=frequency_days,
        frequency_hours=frequency_hours
    )
    return {"message": "Google Drive schedule created.", "schedule_id": schedule.id, "next_run_at": start_date}


@router.delete("/drive-schedule/{schedule_id}")
async def cancel_drive_schedule(
    schedule_id: UUID,
    current_user: OrganizationUser = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel a scheduled drive sync."""
    service = CVIngestionService(db)
    try:
        await service.cancel_drive_schedule(schedule_id, current_user.organization_id)
        return {"message": "Schedule canceled"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
