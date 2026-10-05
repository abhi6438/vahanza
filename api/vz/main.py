import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import admin, drivers, events, geo, growth, hooks, imports, me, notifications, photo, pin, posts, public, share, theme, trust, verify, work

logging.basicConfig(level=logging.INFO)
API_VERSION = "1.0.0"
# Oldest Android app version allowed to keep working; raise it to force an update.
MIN_APP_VERSION = "1.0.0"

app = FastAPI(title="Vahanza API", version=API_VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Brand", "X-App-Version"],
)

v1 = APIRouter(prefix="/api/v1")


@v1.get("/health", tags=["system"])
def health():
    return {"ok": True, "version": API_VERSION, "min_app_version": MIN_APP_VERSION}


v1.include_router(me.router)
v1.include_router(events.router)
v1.include_router(hooks.router)
v1.include_router(geo.router)
v1.include_router(photo.router)
v1.include_router(drivers.router)
v1.include_router(posts.router)
v1.include_router(admin.router)
v1.include_router(trust.router)
v1.include_router(notifications.router)
v1.include_router(imports.router)
v1.include_router(public.router)
v1.include_router(growth.router)
v1.include_router(work.router)
v1.include_router(verify.router)
v1.include_router(pin.router)
v1.include_router(theme.router)
app.include_router(v1)
app.include_router(share.router)   # /j, /r, /q short links (WhatsApp previews, posters)
