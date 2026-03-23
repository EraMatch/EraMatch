"""
AI Inference Service - Main FastAPI Application

Generic AI service supporting multiple providers:
- Ollama Cloud for LLM (https://ollama.com)
- Whisper for transcription (faster-whisper)
- HuggingFace models (custom)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import llm, custom, transcribe, evaluate, question_import, anomaly_detection, github_analysis

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
app.include_router(evaluate.router, prefix="/evaluate", tags=["Evaluation"])
app.include_router(question_import.router, prefix="/question-import", tags=["Question Import"])
app.include_router(anomaly_detection.router, prefix="/anomaly", tags=["Anomaly Detection & HITL"])
app.include_router(github_analysis.router, prefix="/github-analysis", tags=["GitHub Analysis"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "ai-inference"}
