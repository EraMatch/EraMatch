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
    OLLAMA_MODEL: str = "llama3.2"
    
    # Whisper settings (faster-whisper)
    WHISPER_MODEL: str = "small"  # tiny, base, small, medium, large-v2
    WHISPER_DEVICE: str = "cpu"  # cpu or cuda
    WHISPER_COMPUTE_TYPE: str = "int8"  # float16, int8, etc.
    
    # HuggingFace settings
    HUGGINGFACE_TOKEN: str = ""
    MODELS_DIR: str = "./models"
    
    # Mock mode for development (when no API key)
    USE_MOCK: bool = True
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
