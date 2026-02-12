"""
Huggingface models service

Placeholder for custom model integrations.
Can be extended to support:
- Downloaded HuggingFace models
- Fine-tuned custom models
- Local inference with transformers
"""
from config import settings


async def run_inference(
    model_id: str,
    inputs: str | dict,
    parameters: dict | None = None,
):


   pass


async def load_model(model_id: str) -> bool:
    #  load a custom model we made 

    return False


def list_available_models():
    return []
