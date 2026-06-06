from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "master-portal-change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    DATABASE_URL: str = ""
    SQLITE_URL: str = "sqlite:///./master_users.db"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
