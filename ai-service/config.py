"""
Configuration for AI Service.

Environment variables and settings.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """AI Service configuration."""
    
    # Service settings
    SERVICE_NAME: str = "eramatch-ai-service"
    DEBUG: bool = True
    
    # Ollama Cloud settings
    OLLAMA_HOST: str = "https://ollama.com"
    OLLAMA_API_KEY: str = ""
    OLLAMA_MODEL: str = "deepseek-v3.1:671b-cloud"
    OLLAMA_QUESTION_IMPORT_MODEL: str = "deepseek-v3.1:671b-cloud"
    OLLAMA_GH_FILTER_MODEL: str = "kimi-k2.5:cloud"
    OLLAMA_GH_MAP_MODEL: str = "kimi-k2.5:cloud"
    OLLAMA_GH_AUDIT_MODEL: str = "deepseek-v3.1:671b-cloud"
    OLLAMA_GH_SYNTH_MODEL: str = "deepseek-v3.1:671b-cloud"
    OLLAMA_GH_STAGE_TIMEOUT_SECONDS: int = 90

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
    PROCTORING_DRAFTS_DIR: str = "gp-assessment-env-drafts"
    PROCTORING_REQUIRE_MODEL: bool = True
    
    # Mock mode is opt-in for local testing only.
    USE_MOCK: bool = False
    
    class Config:
        env_file = ".env"
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
