from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', case_sensitive=False, extra='ignore')
    environment: str = 'production'
    cors_allowed_origins: str = 'https://anthetic-plus-studios.vercel.app'
    cors_dev_origins: str = ''
    cors_allow_credentials: bool = False
    fastapi_port: int = 8000
    db1_url: str
    db1_anon_key: str
    db1_service_key: str
    db2_url: str
    db2_service_key: str
    db3_url: str
    db3_service_key: str
    db4_url: str
    db4_service_key: str
    redis_url: str = 'redis://localhost:6379/0'
    allowed_widget_hosts: str = ''
    antheticplus_db3_master_key: str | None = None

settings = Settings()
