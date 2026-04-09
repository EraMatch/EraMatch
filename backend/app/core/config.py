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
    
    # Internal Services
    AI_SERVICE_URL: str = "http://127.0.0.1:8001"
    GITHUB_TOKEN: str = ""

    # Google Drive Integration
    GOOGLE_SERVICE_ACCOUNT_FILE: str = "credentials.json"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
