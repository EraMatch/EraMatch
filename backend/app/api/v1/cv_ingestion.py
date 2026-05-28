from datetime import datetime, timezone
from uuid import UUID
import re

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models import OrganizationUser
from app.services.cv_ingestion import CVIngestionService
import base64

router = APIRouter()

@router.post("/zip")
async def upload_zip_ingestion(
    position_id: UUID = Form(...),
    file: UploadFile = File(...),
    current_user: OrganizationUser = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ingest CVs via ZIP or PDF file upload.
    Dispatches a Celery task to process the uploaded file(s).
    """
    filename_lower = file.filename.lower()
    is_zip = filename_lower.endswith(".zip")
    is_pdf = filename_lower.endswith(".pdf")

    if not (is_zip or is_pdf):
        raise HTTPException(
            status_code=400, 
            detail="Unsupported file format. Only ZIP and PDF files are supported."
        )

    file_bytes = await file.read()
    if len(file_bytes) > 200 * 1024 * 1024:  # 200MB limit
        raise HTTPException(status_code=400, detail="File too large.")

    service = CVIngestionService(db)
    
    # Create Tracking Job
    job = await service.create_zip_ingestion_job(
        organization_id=current_user.organization_id,
        position_id=position_id,
        user_id=current_user.id,
        filename=file.filename
    )

    if is_pdf:
        # Update source_type to pdf_upload
        job.source_type = "pdf_upload"
        db.add(job)
        await db.commit()

        # Encode bytes for Celery
        encoded_pdf = base64.b64encode(file_bytes).decode("utf-8")
        
        # Dispatch PDF Ingestion Task
        from worker.tasks.cv_ingestion import process_pdf_ingestion
        process_pdf_ingestion.delay(
            str(job.id), 
            str(current_user.organization_id), 
            str(position_id), 
            file.filename, 
            encoded_pdf
        )

        return {"message": "PDF upload accepted.", "job_id": job.id}
    else:
        # ZIP upload
        # Encode bytes for Celery
        encoded_zip = base64.b64encode(file_bytes).decode("utf-8")
        
        # Dispatch ZIP Ingestion Task
        from worker.tasks.cv_ingestion import process_zip_ingestion
        process_zip_ingestion.delay(
            str(job.id), 
            str(current_user.organization_id), 
            str(position_id), 
            encoded_zip
        )

        return {"message": "ZIP upload accepted.", "job_id": job.id}


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
    """
    Set up a Google Drive folder scheduled ingestion.
    Dispatches an ETA Celery task.
    """
    # Ensure start_date is naive UTC for comparison with utcnow()
    if start_date.tzinfo is not None:
        start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)

    if start_date < datetime.utcnow():
        start_date = datetime.utcnow()

    # Extract actual ID if a full URL was provided in drive_folder_id or drive_folder_url
    extracted_id = drive_folder_id
    if "drive.google.com" in drive_folder_id:
        match = re.search(r"folders/([a-zA-Z0-9-_]+)", drive_folder_id)
        if match:
            extracted_id = match.group(1)
            if not drive_folder_url:
                drive_folder_url = drive_folder_id
    
    # Also check drive_folder_url if provided
    if drive_folder_url and "drive.google.com" in drive_folder_url:
        match = re.search(r"folders/([a-zA-Z0-9-_]+)", drive_folder_url)
        if match and extracted_id == drive_folder_id: # Only update if ID still looks like the URL
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
    """Cancels a scheduled drive sync."""
    service = CVIngestionService(db)
    try:
        await service.cancel_drive_schedule(schedule_id, current_user.organization_id)
        return {"message": "Schedule canceled"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
