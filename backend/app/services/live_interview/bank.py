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
    result = await db.execute(select(LiV2Rubric).where(LiV2Rubric.id == rubric_id))
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
    
    response = await call_with_fallback(
        role="interviewer", # Using interviewer role for bank generation as well
        messages=[{"role": "user", "content": prompt}]
    )
    
    try:
        cleaned = response.content.strip()
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
            items=[BankItem(**_normalize_bank_item(item, rubric.dimensions, idx)) for idx, item in enumerate(items_data)]
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
    rubric_res = await db.execute(
        select(LiV2Rubric).where(
            LiV2Rubric.group_id == bank_in.group_id,
            LiV2Rubric.organization_id == bank_in.organization_id,
        )
    )
    rubric = rubric_res.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=400, detail="Create a rubric before saving a bank")

    normalized_items = [
        _normalize_bank_item(item.model_dump(), rubric.dimensions, idx)
        for idx, item in enumerate(bank_in.items)
    ]

    query = select(LiV2Bank).where(
        LiV2Bank.group_id == bank_in.group_id,
        LiV2Bank.organization_id == bank_in.organization_id,
    )
    result = await db.execute(query)
    existing = result.scalar_one_or_none()
    
    if existing:
        if existing.state == LiV2State.FROZEN:
            raise HTTPException(status_code=400, detail="Cannot update a frozen bank")
        
        # Update existing
        existing.rubric_id = rubric.id
        existing.items = normalized_items
        await db.commit()
        await db.refresh(existing)
        return existing
    
    # Create new
    new_bank = LiV2Bank(
        rubric_id=rubric.id,
        group_id=bank_in.group_id,
        organization_id=bank_in.organization_id,
        items=normalized_items,
        state=LiV2State.DRAFT
    )
    db.add(new_bank)
    await db.commit()
    await db.refresh(new_bank)
    return new_bank

async def get_bank_service(
    db: DbSession, group_id: UUID, organization_id: UUID | None = None
) -> LiV2Bank:
    filters = [LiV2Bank.group_id == group_id]
    if organization_id:
        filters.append(LiV2Bank.organization_id == organization_id)
    query = select(LiV2Bank).where(*filters)
    result = await db.execute(query)
    bank = result.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank not found for this group")
    return bank

async def freeze_bank_service(
    db: DbSession, bank_id: UUID, organization_id: UUID | None = None
) -> LiV2Bank:
    filters = [LiV2Bank.id == bank_id]
    if organization_id:
        filters.append(LiV2Bank.organization_id == organization_id)
    query = select(LiV2Bank).where(*filters)
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
    
    bank_dimension_names = {
        item.get("primary_dimension_id") or item.get("dimension_name")
        for item in bank.items
    }
    rubric_dimension_names = {
        d.get("dimension_id") or d.get("name")
        for d in rubric.dimensions
    }
    
    missing = rubric_dimension_names - bank_dimension_names
    if missing:
        raise HTTPException(
            status_code=400, 
            detail=f"Bank is missing questions for dimensions: {', '.join(missing)}"
        )
        
    bank.state = LiV2State.FROZEN
    bank.frozen_at = datetime.utcnow()
    await db.commit()
    await db.refresh(bank)
    return bank


def _normalize_bank_item(item: dict, dimensions: list[dict], idx: int) -> dict:
    """Keep the frontend-friendly payload while adding canonical agent/judge fields."""
    question_id = str(item.get("question_id") or item.get("bank_item_id") or uuid4())
    dimension_name = item.get("dimension_name") or item.get("dimension") or ""
    primary_dimension_id = item.get("primary_dimension_id") or item.get("dimension_id")

    if not primary_dimension_id and dimension_name:
        dim = next((d for d in dimensions if d.get("name") == dimension_name), None)
        primary_dimension_id = (dim or {}).get("dimension_id") or dimension_name
    if not dimension_name and primary_dimension_id:
        dim = next(
            (
                d
                for d in dimensions
                if (d.get("dimension_id") or d.get("name")) == primary_dimension_id
            ),
            None,
        )
        dimension_name = (dim or {}).get("name") or primary_dimension_id

    raw_sub = item.get("sub_criteria") or item.get("question_rubric", {}).get("sub_criteria") or []
    sub_criteria = []
    canonical_sub = []
    for sub_idx, sub in enumerate(raw_sub):
        if isinstance(sub, dict):
            name = str(sub.get("name") or sub.get("text") or f"Criterion {sub_idx + 1}")
            description = str(sub.get("description") or sub.get("text") or name)
        else:
            name = str(sub)
            description = str(sub)
        sub_criteria.append({"name": name, "description": description})
        canonical_sub.append({"text": name, "description": description})

    if not sub_criteria:
        sub_criteria = [
            {
                "name": "Demonstrate knowledge of the topic",
                "description": "Candidate provides relevant, specific evidence.",
            }
        ]
        canonical_sub = [{"text": sub_criteria[0]["name"], "description": sub_criteria[0]["description"]}]

    return {
        **item,
        "question_id": question_id,
        "bank_item_id": item.get("bank_item_id") or question_id,
        "dimension_name": dimension_name or "General",
        "primary_dimension_id": primary_dimension_id or dimension_name or "General",
        "text": item.get("text") or "",
        "intent": item.get("intent") or "",
        "sub_criteria": sub_criteria,
        "question_rubric": {"sub_criteria": canonical_sub},
        "is_mandatory": bool(item.get("is_mandatory", True)),
        "difficulty": item.get("difficulty") or "medium",
        "estimated_duration_seconds": item.get("estimated_duration_seconds") or 180,
        "display_order": item.get("display_order", idx),
    }
