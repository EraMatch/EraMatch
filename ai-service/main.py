"""
AI Inference Service - Main FastAPI Application

Generic AI service supporting multiple providers:
- Ollama Cloud for LLM (https://ollama.com)
- Whisper for transcription (faster-whisper)
- HuggingFace models (custom)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import llm, custom, transcribe

app = FastAPI(
    title="EraMatch AI Service",
    description="AI inference service for LLM, transcription, and custom model operations",
    version="0.1.0",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(llm.router, prefix="/llm", tags=["LLM"])
app.include_router(transcribe.router, prefix="/transcribe", tags=["Transcription"])
app.include_router(custom.router, prefix="/custom", tags=["Custom Models"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "ai-inference"}
