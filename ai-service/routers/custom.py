"""
Custom models router - endpoints for HuggingFace or custom downloaded models.

Placeholder for future custom model integrations.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.huggingface import run_inference

router = APIRouter()


class InferenceRequest(BaseModel):
    """Request for custom model inference."""
    model_id: str  # e.g., "my-fine-tuned-model"
    inputs: str | dict
    parameters: dict | None = None


class InferenceResponse(BaseModel):
    """Inference result."""
    outputs: str | dict | list
    model_id: str


@router.post("/inference", response_model=InferenceResponse)
async def inference(request: InferenceRequest):
    """
    Run inference with a custom/HuggingFace model.
    
    Placeholder for future implementations:
    - Downloaded HuggingFace models
    - Fine-tuned custom models
    - Specialized NLP models
    """
    try:
        result = await run_inference(
            model_id=request.model_id,
            inputs=request.inputs,
            parameters=request.parameters,
        )
        return InferenceResponse(
            outputs=result["outputs"],
            model_id=request.model_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """List available custom models."""
    # Placeholder - return configured models
    return {
        "models": [
            {
                "id": "placeholder",
                "name": "Placeholder Model",
                "status": "not_loaded",
                "description": "Custom models will be listed here",
            }
        ]
    }
