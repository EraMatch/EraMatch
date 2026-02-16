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
    
    # whisper moded setting
    WHISPER_MODEL: str = "small"  
    WHISPER_DEVICE: str = "cpu"  # cpu for now till we deplooy 
    WHISPER_COMPUTE_TYPE: str = "int8"
    
    # HuggingFace settings
    HUGGINGFACE_TOKEN: str = ""
    MODELS_DIR: str = "./models"
    
    # Mock mode for development (when no API key)
    USE_MOCK: bool = True
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
