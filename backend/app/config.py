"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # NASA
    nasa_api_key: str = "DEMO_KEY"
    donki_base_url: str = "https://api.nasa.gov/DONKI"

    # Database
    database_url: str = "postgresql+asyncpg://helios:helios@localhost:5432/helios"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Scheduling
    donki_poll_minutes: int = 30
    model_retrain_hours: int = 6

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
