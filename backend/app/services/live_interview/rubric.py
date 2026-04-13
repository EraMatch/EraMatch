import json
from uuid import UUID
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlmodel import select
from fastapi import HTTPException, status

from app.api.deps import DbSession
from app.models import LiV2Rubric, CandidateGroup, Position
from app.schemas.live_interview_v2 import (
    RubricDimension, RubricCreate, RubricUpdate, 
    DimensionSuggestionResponse, LiV2State
)
from app.services.live_interview.providers import call_with_fallback

async def get_group_context(db: DbSession, group_id: UUID) -> Dict[str, Any]:
    """Fetch group and position context (job title, description) for AI prompts."""
    query = (
        select(CandidateGroup, Position)
        .join(Position, CandidateGroup.position_id == Position.id)
        .where(CandidateGroup.id == group_id)
    )
    result = await db.execute(query)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Group or Position not found")
    
    group, position = row
    return {
        "group_name": group.group_name,
        "job_title": position.job_title,
        "job_description": position.job_description,
        "required_skills": position.required_skills
    }

async def suggest_dimensions_service(
    db: DbSession, 
    group_id: UUID
) -> DimensionSuggestionResponse:
    """M0: Analyze job description to suggest scoring dimensions."""
    ctx = await get_group_context(db, group_id)
    
    prompt = f"""
    Analyze the following job description and suggest 4-6 competency dimensions for a live video interview.
    Dimensions should cover both technical and soft skills relevant to the role.
    
    Job Title: {ctx['job_title']}
    Job Description: {ctx['job_description']}
    Required Skills: {ctx['required_skills']}
    
    Return the response as a JSON array of objects, each with:
    - name: str (short title, e.g. "Problem Solving")
    - reason: str (why this dimension is important for this specific role)
    - weight: int (suggested weight percentage, total must be 100)
    
    Return ONLY the JSON.
    """
    
    response_text = await call_with_fallback(
        role="interviewer", 
        messages=[{"role": "user", "content": prompt}]
    )
    
    try:
        # Clean potential markdown from response
        cleaned = response_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:].strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        
        suggestions = json.loads(cleaned)
        return DimensionSuggestionResponse(suggestions=suggestions)
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to parse AI dimension suggestions: {str(e)}"
        )

async def generate_anchors_service(
    dimensions: List[str], 
    job_description: str
) -> List[RubricDimension]:
    """M_RUBRIC: Generate behavioral anchors for selected dimensions."""
    prompt = f"""
    For a live video interview for the Following position, generate behavioral anchors for these dimensions:
    Dimensions: {", ".join(dimensions)}
    
    Job Description: {job_description}
    
    For each dimension, provide:
    1. A description of what is measured.
    2. Behavioral anchors for 3 levels: "substandard", "proficient", and "excellent".
    
    Return the response as a JSON array of objects:
    [
      {{
        "name": "Dimension Name",
        "description": "...",
        "weight": 0, (leave at 0, recruiter will set)
        "anchors": {{
          "substandard": "...",
          "proficient": "...",
          "excellent": "..."
        }}
      }}
    ]
    
    Return ONLY the JSON.
    """
    
    response_text = await call_with_fallback(
        role="rubric_builder", 
        messages=[{"role": "user", "content": prompt}]
    )
    
    try:
        cleaned = response_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:].strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        
        parsed = json.loads(cleaned)
        return [RubricDimension(**d) for d in parsed]
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to parse AI rubric anchors: {str(e)}"
        )

async def create_rubric_service(
    db: DbSession,
    rubric_in: RubricCreate
) -> LiV2Rubric:
    """Create or overwrite a draft rubric."""
    # Check if a rubric already exists for this group
    query = select(LiV2Rubric).where(LiV2Rubric.group_id == rubric_in.group_id)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()
    
    if existing:
        if existing.state == LiV2State.FROZEN:
            raise HTTPException(status_code=400, detail="Cannot update a frozen rubric")
        
        # Update existing — preserve config fields if not provided
        existing.dimensions = [d.model_dump() for d in rubric_in.dimensions]
        if rubric_in.time_budget_minutes is not None:
            existing.time_budget_minutes = rubric_in.time_budget_minutes
        if rubric_in.language is not None:
            existing.language = rubric_in.language
        if rubric_in.include_weak_topics is not None:
            existing.include_weak_topics = rubric_in.include_weak_topics
        existing.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return existing
    
    # Create new
    new_rubric = LiV2Rubric(
        group_id=rubric_in.group_id,
        organization_id=rubric_in.organization_id,
        dimensions=[d.model_dump() for d in rubric_in.dimensions],
        time_budget_minutes=rubric_in.time_budget_minutes or 30,
        language=rubric_in.language or "en",
        include_weak_topics=rubric_in.include_weak_topics or False,
        state=LiV2State.DRAFT
    )
    db.add(new_rubric)
    await db.commit()
    await db.refresh(new_rubric)
    return new_rubric

async def get_rubric_service(db: DbSession, group_id: UUID) -> LiV2Rubric:
    query = select(LiV2Rubric).where(LiV2Rubric.group_id == group_id)
    result = await db.execute(query)
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found for this group")
    return rubric

async def freeze_rubric_service(db: DbSession, rubric_id: UUID) -> LiV2Rubric:
    query = select(LiV2Rubric).where(LiV2Rubric.rubric_id == rubric_id)
    result = await db.execute(query)
    rubric = result.scalar_one_or_none()
    
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    
    if rubric.state == LiV2State.FROZEN:
        return rubric
        
    # Validation: Weights must sum to 100
    total_weight = sum(d.get('weight', 0) for d in rubric.dimensions)
    if total_weight != 100:
        raise HTTPException(
            status_code=400, 
            detail=f"Total weight must be 100% (currently {total_weight}%)"
        )
    
    # Validation: Minimum 3 dimensions
    if len(rubric.dimensions) < 3:
        raise HTTPException(
            status_code=400, 
            detail="Minimum of 3 dimensions required"
        )
        
    rubric.state = LiV2State.FROZEN
    rubric.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rubric)
    return rubric
