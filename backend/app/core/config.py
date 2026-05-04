"""
Application settings loaded from environment variables
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    PROJECT_NAME: str = "EraMatch"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = True
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

    # Database
    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Security
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Email (SMTP)
    SMTP_TLS: bool = True
    SMTP_PORT: int | None = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: str | None = "admin@eramatch.com"
    EMAILS_FROM_NAME: str = "EraMatch"

    # AI/LLM Providers
    # Ollama Cloud - https://ollama.com/blog/cloud-models
    OLLAMA_BASE_URL: str = "https://api.ollama.com"
    OLLAMA_API_KEY: str = ""

    # Google Gemini
    GOOGLE_API_KEY: str = ""

    # Groq
    GROQ_API_KEY: str = ""

    # Default LLM provider: "ollama", "gemini", "groq", "openai"
    DEFAULT_LLM_PROVIDER: str = "gemini"
    DEFAULT_EMBEDDING_PROVIDER: str = "gemini"

    # PreScore HD Eval + QAG runtime controls
    PRESCORE_USE_AI_SERVICE: bool = True
    PRESCORE_LLM_PROVIDER: str = "ollama"
    PRESCORE_LLM_MODEL: str | None = None
    PRESCORE_AI_SERVICE_TIMEOUT_SECONDS: float = 90.0
    PRESCORE_ALLOW_FALLBACK: bool = False

    # Internal Services
    AI_SERVICE_URL: str = "http://127.0.0.1:8001"
    BACKEND_URL: str = "http://127.0.0.1:8000"
    WEBHOOK_SECRET: str = "shared-secret-change-me"
    GITHUB_TOKEN: str = ""

    # Google Drive Integration
    GOOGLE_SERVICE_ACCOUNT_FILE: str = "credentials.json"

    # =========================================================================
    # LIVE INTERVIEW V2 — LiveKit
    # =========================================================================
    LIVEKIT_URL: str = ""  # wss://your-project.livekit.cloud
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    # =========================================================================
    # LIVE INTERVIEW V2 — Role-based LLM Providers
    # Each role can use a different provider/model with fallback chain
    # =========================================================================
    # Interviewer (live conversation — needs fast model)
    INTERVIEWER_PRIMARY_PROVIDER: str = "gemini"
    INTERVIEWER_PRIMARY_MODEL: str = "gemini-2.5-flash-lite"
    INTERVIEWER_SECONDARY_PROVIDER: str = ""
    INTERVIEWER_SECONDARY_MODEL: str = ""
    INTERVIEWER_TERTIARY_PROVIDER: str = ""
    INTERVIEWER_TERTIARY_MODEL: str = ""

    # Judge (async scoring — needs strong reasoning)
    JUDGE_PRIMARY_PROVIDER: str = "gemini"
    JUDGE_PRIMARY_MODEL: str = "gemini-2.5-pro"
    JUDGE_SECONDARY_PROVIDER: str = ""
    JUDGE_SECONDARY_MODEL: str = ""
    # Fallback model when primary judge model (e.g. gemini-2.5-flash-lite) is quota-exhausted
    FALLBACK_JUDGE_MODEL: str = "gemma3:4b-cloud"

    # Helper (classification, tags — needs fast model)
    HELPER_PRIMARY_PROVIDER: str = "gemini"
    HELPER_PRIMARY_MODEL: str = "gemini-2.5-flash-lite"
    HELPER_SECONDARY_PROVIDER: str = ""
    HELPER_SECONDARY_MODEL: str = ""

    # Rubric builder (one-time generation — needs strong model)
    RUBRIC_BUILDER_PRIMARY_PROVIDER: str = "gemini"
    RUBRIC_BUILDER_PRIMARY_MODEL: str = "gemini-2.5-pro"
    RUBRIC_BUILDER_SECONDARY_PROVIDER: str = ""
    RUBRIC_BUILDER_SECONDARY_MODEL: str = ""

    # Portal Tunnels
    recruiter_url: str = "http://localhost:5173"
    candidate_url: str = "http://localhost:5174"

    # =========================================================================
    # LIVE INTERVIEW V2 — TTS Providers
    # =========================================================================
    TTS_PRIMARY_PROVIDER: str = "google_tts"
    TTS_PRIMARY_VOICE: str = "en-US-Wavenet-D"
    TTS_SECONDARY_PROVIDER: str = "elevenlabs"
    TTS_SECONDARY_VOICE: str = "Rachel"
    TTS_TERTIARY_PROVIDER: str = "edge_tts"

    # =========================================================================
    # LIVE INTERVIEW V2 — STT Providers
    # =========================================================================
    STT_PRIMARY_PROVIDER: str = "google_stt"
    STT_PRIMARY_MODEL: str = "chirp_2"
    STT_SECONDARY_PROVIDER: str = "faster_whisper_local"
    STT_SECONDARY_MODEL: str = "distil-large-v3"

    # =========================================================================
    # LIVE INTERVIEW V2 — External API Keys
    # =========================================================================
    GOOGLE_APPLICATION_CREDENTIALS: str = ""  # Path to service account JSON for STT/TTS
    ELEVEN_API_KEY: str = ""  # ElevenLabs TTS
    OPENAI_API_KEY: str = ""  # OpenAI (if used as provider)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
