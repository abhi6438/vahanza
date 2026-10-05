from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Reads .env from the repo root whether uvicorn is started in the root or in api/
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    supabase_url: str = ""
    database_url: str = ""
    supabase_jwt_secret: str = ""          # only for legacy HS256 projects
    default_tenant: str = "vahanza"

    send_sms_hook_secret: str = ""         # "v1,whsec_..."
    msg91_auth_key: str = ""
    msg91_otp_template_id: str = ""
    sms_dry_run: bool = True
    otp_max_per_hour: int = 5              # per phone number

    # Vercel Blob (profile photos). Empty locally: photos are kept in a temp folder instead.
    blob_read_write_token: str = ""
    dev_upload_dir: str = "/tmp/vahanza-uploads"

    # Phone push (optional). Web push for the PWA: scripts/make_vapid_keys.py. Android APK: Firebase service account JSON.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:support@example.in"
    fcm_service_account: str = ""

    # Bulk import invites (Sprint 7). The link people get in the SMS / WhatsApp invite.
    public_app_url: str = ""               # e.g. https://vahanza.in (empty: invites need it set)
    msg91_invite_template_id: str = ""     # DLT-approved template with ##name## and ##link##

    # Sprint 8: Vercel cron sends "Authorization: Bearer <CRON_SECRET>" to /api/v1/cron/daily
    cron_secret: str = ""

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
