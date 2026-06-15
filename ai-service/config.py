"""
Configuration for AI Service.

Environment variables and settings.
"""

from pathlib import Path

from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).parent / ".env"
print(_ENV_FILE)


class Settings(BaseSettings):
    """AI Service configuration."""

    # Service settings
    SERVICE_NAME: str = "eramatch-ai-service"
    DEBUG: bool = True

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Webhook
    BACKEND_WEBHOOK_URL: str = "http://127.0.0.1:8000/api/v1/webhooks/cv-parsed"
    WEBHOOK_SECRET: str = (
        "shared-secret-change-me"  # Same as AI_SERVICE_WEBHOOK_SECRET in backend
    )

    # Ollama Cloud settings
    OLLAMA_HOST: str = "https://ollama.com"
    OLLAMA_LOCAL_HOST: str = "http://localhost:11434"
    OLLAMA_API_KEY: str = ""
    OLLAMA_MODEL: str = "gemma3:4b-cloud"
    OLLAMA_QUESTION_IMPORT_MODEL: str = "gemma3:12b-cloud"
    OLLAMA_CV_PARSING_MODEL: str = "gemma3:12b-cloud"
    OLLAMA_GH_FILTER_MODEL: str = "gemma3:12b-cloud"
    OLLAMA_GH_MAP_MODEL: str = "gemma3:12b-cloud"
    OLLAMA_GH_AUDIT_MODEL: str = "gemma3:12b-cloud"
    OLLAMA_GH_SYNTH_MODEL: str = "gemma3:12b-cloud"
    OLLAMA_GH_STAGE_TIMEOUT_SECONDS: int = 180
    OLLAMA_MAX_CONCURRENT_CALLS: int = 4
    OLLAMA_CV_PARSE_TIMEOUT_SECONDS: int = 300

    # GitHub analysis runtime controls
    GH_ANALYSIS_HTTP_TIMEOUT_SECONDS: int = 30
    GH_ANALYSIS_REPO_SCOUT_LIMIT: int = 4
    GH_ANALYSIS_MAX_TREE_FILES: int = 3000
    GH_ANALYSIS_FILE_LIST_FOR_RELEVANCE: int = 150
    GH_ANALYSIS_FILE_LIST_FOR_KEYFILES: int = 250
    GITHUB_TOKEN: str = ""

    # whisper moded setting
    WHISPER_MODEL: str = "small"
    WHISPER_DEVICE: str = "cpu"  # cpu for now till we deplooy
    WHISPER_COMPUTE_TYPE: str = "int8"

    # HuggingFace settings
    HUGGINGFACE_TOKEN: str = ""
    MODELS_DIR: str = "./models"
    PROCTORING_DRAFTS_DIR: str = "ai-service/gp-assessment-env-drafts"
    PROCTORING_MODELS_S3_BUCKET: str = ""
    PROCTORING_MODELS_S3_REGION: str = "us-east-1"
    # Dev-safe default: allow fallback adapter output unless explicitly forced by env.
    PROCTORING_REQUIRE_MODEL: bool = False

    # Jina AI — embeddings for semantic candidate search
    JINA_API_KEY: str = ""

    # Mock mode is opt-in for local testing only.
    USE_MOCK: bool = False

    # Async CV parsing dispatch mode:
    # - inline: run in ai-service process via asyncio task (dev-friendly)
    # - celery: dispatch to ai-service celery worker queue
    CV_PARSE_ASYNC_MODE: str = "inline"

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        # Prioritize .env over inherited process environment for predictable local dev.
        return (
            init_settings,
            dotenv_settings,
            env_settings,
            file_secret_settings,
        )


settings = Settings()
