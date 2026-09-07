import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "Bengaluru Civic AI Platform"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = "bengaluru-civic-ai-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database
    DATABASE_URL: str = f"sqlite:///{BASE_DIR}/civic_platform.db"

    # Uploads & Storage
    MEDIA_DIR: str = str(BASE_DIR / "uploads")
    DATA_DIR: str = str(BASE_DIR / "data")

    # AI & Detection Thresholds (Configurable via Admin)
    DEFAULT_CONFIDENCE_THRESHOLD: float = 0.50
    DEFAULT_BLUR_THRESHOLD: float = 100.0  # Laplacian variance threshold
    DEFAULT_DUPLICATE_RADIUS_METERS: float = 25.0
    DEFAULT_DUPLICATE_SCORE_THRESHOLD: float = 0.70
    DEFAULT_TIME_WINDOW_DAYS: int = 14

    # Temporal Filtering for Dashcam
    TEMPORAL_WINDOW_SECONDS: float = 2.5
    TEMPORAL_SPATIAL_RADIUS_METERS: float = 15.0

    # Government Integration Settings
    GOVT_INTEGRATION_ENABLED: bool = False
    GOVT_API_ENDPOINT: str = "https://api.mock-bbmp-sahaya.gov.in/v1/grievance"
    GOVT_API_KEY: str = "mock-bbmp-api-key-secure"
    GOVT_MODE: str = "OFFICIAL_API_AND_HANDOFF"  # "OFFICIAL_API" or "CITIZEN_HANDOFF"

    # Bengaluru GIS
    BLR_CENTER_LAT: float = 12.9716
    BLR_CENTER_LNG: float = 77.5946

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()

# Ensure directories exist
os.makedirs(settings.MEDIA_DIR, exist_ok=True)
os.makedirs(settings.DATA_DIR, exist_ok=True)
