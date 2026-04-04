"""
AI Inference Service - Main FastAPI Application

Generic AI service supporting multiple providers:
- Ollama Cloud for LLM (https://ollama.com)
- Whisper for transcription (faster-whisper)
- HuggingFace models (custom)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import llm, custom, transcribe, evaluate

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


@app.on_event("startup")
async def startup_event():
    """Pre-load Whisper model at startup so first request doesn't crash."""
    from config import settings
    if not settings.USE_MOCK:
        try:
            from services.whisper import get_model
            import threading
            # Load model in a background thread to avoid blocking startup
            def load_model():
                try:
                    model = get_model()
                    if model != "mock":
                        print("[Startup] Whisper model pre-loaded successfully")
                    else:
                        print("[Startup] Whisper model failed, using mock")
                except Exception as e:
                    print(f"[Startup] Whisper pre-load error: {e}")
            t = threading.Thread(target=load_model, daemon=True)
            t.start()
            t.join(timeout=120)  # Wait up to 2 minutes for model download
        except Exception as e:
            print(f"[Startup] Failed to pre-load Whisper: {e}")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "ai-inference"}
