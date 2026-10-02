from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    database_url: str = ""
    supabase_jwt_secret: str = ""          # only for legacy HS256 projects
    default_tenant: str = "vahanza"

    send_sms_hook_secret: str = ""         # "v1,whsec_..."
    msg91_auth_key: str = ""
    msg91_otp_template_id: str = ""
    sms_dry_run: bool = True
    otp_max_per_hour: int = 5              # per phone number

    cors_origins: str = (
        "http://localhost:5173,http://localhost:4173,"
        "capacitor://localhost,http://localhost,https://localhost"
    )

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
