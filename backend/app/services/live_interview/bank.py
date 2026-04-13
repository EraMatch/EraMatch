import json
from uuid import UUID, uuid4
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlmodel import select
from fastapi import HTTPException, status

from app.api.deps import DbSession
from app.models import LiV2Bank, LiV2Rubric, CandidateGroup, Position
from app.schemas.live_interview_v2 import (
    BankItem, SubCriterion, BankCreate, BankUpdate, LiV2State
)
from app.services.live_interview.providers import call_with_fallback

async def generate_bank_service(
    db: DbSession,
    rubric_id: UUID
) -> BankCreate:
    """M_BANK: Generate a question bank based on a frozen rubric."""
    # Fetch rubric
    result = await db.execute(select(LiV2Rubric).where(LiV2Rubric.rubric_id == rubric_id))
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    
    if rubric.state != LiV2State.FROZEN:
        raise HTTPException(status_code=400, detail="Rubric must be frozen before generating bank")
        
    # Fetch job context
    query = (
        select(CandidateGroup, Position)
        .join(Position, CandidateGroup.position_id == Position.id)
        .where(CandidateGroup.id == rubric.group_id)
    )
    ctx_result = await db.execute(query)
    ctx_row = ctx_result.first()
    if not ctx_row:
        raise HTTPException(status_code=404, detail="Group/Position context lost")
    group, position = ctx_row

    prompt = f"""
    Generate a question bank for a live video interview based on this frozen rubric.
    Job Title: {position.job_title}
    Job Description: {position.job_description}
    
    Rubric Dimensions:
    {json.dumps(rubric.dimensions, indent=2)}
    
    Instructions:
    1. For EACH dimension, generate 2-3 targeted interview questions.
    2. Each question must include:
       - text: The actual question to ask.
       - intent: The technical or behavioral nuance this question targets.
       - sub_criteria: A list of 3-5 specific "look-for" items (sub-criteria with name and description) for the judge to use later.
    
    Return the response as a JSON array of objects fitting this structure:
    [
      {{
        "question_id": "unique-id-1",
        "dimension_name": "Dimension Name",
        "text": "...",
        "intent": "...",
        "sub_criteria": [
          {{"name": "...", "description": "..."}},
          ...
        ]
      }}
    ]
    
    Return ONLY the JSON.
    """
    
    response_text = await call_with_fallback(
        role="interviewer", # Using interviewer role for bank generation as well
        messages=[{"role": "user", "content": prompt}]
    )
    
    try:
        cleaned = response_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:].strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        
        items_data = json.loads(cleaned)
        # Ensure unique IDs if LLM failed
        for item in items_data:
            if not item.get("question_id") or item["question_id"] == "unique-id-1":
                item["question_id"] = str(uuid4())
                
        return BankCreate(
            group_id=rubric.group_id,
            organization_id=rubric.organization_id,
            items=[BankItem(**item) for item in items_data]
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to parse AI bank generation: {str(e)}"
        )

async def create_bank_service(
    db: DbSession,
    bank_in: BankCreate
) -> LiV2Bank:
    """Create or overwrite a draft question bank."""
    query = select(LiV2Bank).where(LiV2Bank.group_id == bank_in.group_id)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()
    
    if existing:
        if existing.state == LiV2State.FROZEN:
            raise HTTPException(status_code=400, detail="Cannot update a frozen bank")
        
        # Update existing
        existing.items = [item.model_dump() for item in bank_in.items]
        existing.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return existing
    
    # Create new
    new_bank = LiV2Bank(
        group_id=bank_in.group_id,
        organization_id=bank_in.organization_id,
        items=[item.model_dump() for item in bank_in.items],
        state=LiV2State.DRAFT
    )
    db.add(new_bank)
    await db.commit()
    await db.refresh(new_bank)
    return new_bank

async def get_bank_service(db: DbSession, group_id: UUID) -> LiV2Bank:
    query = select(LiV2Bank).where(LiV2Bank.group_id == group_id)
    result = await db.execute(query)
    bank = result.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank not found for this group")
    return bank

async def freeze_bank_service(db: DbSession, bank_id: UUID) -> LiV2Bank:
    query = select(LiV2Bank).where(LiV2Bank.bank_id == bank_id)
    result = await db.execute(query)
    bank = result.scalar_one_or_none()
    
    if not bank:
        raise HTTPException(status_code=404, detail="Bank not found")
    
    if bank.state == LiV2State.FROZEN:
        return bank
        
    # Validation: Ensure at least one question per dimension in the rubric
    # Fetch frozen rubric first
    rub_q = select(LiV2Rubric).where(LiV2Rubric.group_id == bank.group_id)
    rub_res = await db.execute(rub_q)
    rubric = rub_res.scalar_one_or_none()
    
    if not rubric or rubric.state != LiV2State.FROZEN:
         raise HTTPException(status_code=400, detail="Must have a frozen rubric before freezing a bank")
    
    bank_dimension_names = {item['dimension_name'] for item in bank.items}
    rubric_dimension_names = {d['name'] for d in rubric.dimensions}
    
    missing = rubric_dimension_names - bank_dimension_names
    if missing:
        raise HTTPException(
            status_code=400, 
            detail=f"Bank is missing questions for dimensions: {', '.join(missing)}"
        )
        
    bank.state = LiV2State.FROZEN
    bank.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(bank)
    return bank
