"""
AI Inference Service - Main FastAPI App that work with all modls we need seperatley to call them as custom api 
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import llm, custom

app = FastAPI(
    title="EraMatch AI Service",
    description="AI inference service for LLM and custom model operations",
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
app.include_router(custom.router, prefix="/custom", tags=["Custom Models"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "ai-inference"}
