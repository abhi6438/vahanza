"""Runtime brand theme (Admin → Settings → Appearance).

Only the inputs are stored — primary / secondary / accent colours, default light-dark mode, corner style
and density. The app derives every shade itself (web/src/lib/brand-theme.ts), so there is never a
per-component colour setting. Draft = being edited by an admin; published = what every user sees.

  GET    /theme                    published theme, no login (the app checks it on start)
  GET    /admin/theme              draft + published
  PUT    /admin/theme/draft        save a draft
  POST   /admin/theme/publish      publish (also becomes the draft)
  DELETE /admin/theme/published    back to the brand's own colours (brands/<id>.json)
  GET    /manifest.webmanifest     web app manifest with the live colours ("Add to home screen")
"""
import json
import os
from functools import lru_cache

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from ..deps import get_db, tenant_id
from .admin import _audit, admin_ctx

router = APIRouter(tags=["theme"])
# served at the site root too (/app.webmanifest, see vercel.json): a manifest must be on the same origin
root = APIRouter(tags=["theme"])
HEX = r"^#[0-9a-fA-F]{6}$"


class Theme(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primaryColor: str = Field(pattern=HEX)
    secondaryColor: Optional[str] = Field(None, pattern=HEX)
    accentColor: str = Field(pattern=HEX)
    mode: Literal["light", "dark", "system"] = "system"
    radius: Literal["sharp", "medium", "rounded"] = "medium"
    density: Literal["compact", "comfortable", "spacious"] = "comfortable"
    preset: Optional[str] = Field(None, max_length=20, pattern=r"^[a-z0-9-]*$")
    # made by the app from the colours above (not an admin setting): the install splash / browser bar
    # colour in the web app manifest, which the server builds without the colour maths
    headerColor: Optional[str] = Field(None, pattern=HEX)

    def clean(self) -> dict:
        d = self.model_dump()
        for k in ("primaryColor", "secondaryColor", "accentColor", "headerColor"):
            if d[k]:
                d[k] = d[k].upper()
        return d


def _state(db, tenant: str) -> dict:
    row = db.execute(
        "select theme_draft, theme_draft_at, theme_published, theme_published_at, theme_version from public.tenants where id = %s",
        (tenant,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Brand not found")
    iso = lambda v: v.isoformat() if v else None  # noqa: E731
    return {"draft": row["theme_draft"], "draft_at": iso(row["theme_draft_at"]), "published": row["theme_published"],
            "published_at": iso(row["theme_published_at"]), "version": row["theme_version"] or 0}


@router.get("/theme")
def published_theme(response: Response, db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """What every user sees. null = the brand's own colours. Cached for a minute."""
    row = db.execute("select theme_published, theme_version from public.tenants where id = %s", (tenant,)).fetchone()
    response.headers["Cache-Control"] = "public, max-age=60"
    if not row:
        return {"theme": None, "version": 0}
    return {"theme": row["theme_published"], "version": row["theme_version"] or 0}


@router.get("/admin/theme")
def get_theme(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    return _state(db, ctx["tenant"])


@router.put("/admin/theme/draft")
def save_draft(body: Theme, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    db.execute("update public.tenants set theme_draft = %s, theme_draft_at = now() where id = %s", (Jsonb(body.clean()), ctx["tenant"]))
    _audit(db, ctx, "theme_draft", "theme", ctx["id"], body.primaryColor)
    return _state(db, ctx["tenant"])


@router.post("/admin/theme/publish")
def publish(body: Theme, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    t = body.clean()
    db.execute(
        """update public.tenants set theme_draft = %s, theme_draft_at = now(), theme_published = %s,
                  theme_published_at = now(), theme_version = coalesce(theme_version, 0) + 1 where id = %s""",
        (Jsonb(t), Jsonb(t), ctx["tenant"]),
    )
    _audit(db, ctx, "theme_publish", "theme", ctx["id"], f"{t['primaryColor']} {t['mode']} {t['radius']} {t['density']}")
    return _state(db, ctx["tenant"])


@router.delete("/admin/theme/published")
def reset(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    db.execute(
        """update public.tenants set theme_published = null, theme_draft = null, theme_published_at = now(),
                  theme_version = coalesce(theme_version, 0) + 1 where id = %s""",
        (ctx["tenant"],),
    )
    _audit(db, ctx, "theme_reset", "theme", ctx["id"], None)
    return _state(db, ctx["tenant"])


# ---------------------------------------------------------------- web app manifest
@lru_cache
def _brand(tenant: str) -> dict:
    for base in (os.path.join(os.path.dirname(__file__), "..", "..", ".."), os.getcwd()):
        path = os.path.join(base, "brands", f"{tenant}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    return {}


@router.get("/manifest.webmanifest")
@root.get("/app.webmanifest")
def manifest(db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """The install manifest, built per request so "Add to home screen" (splash + title bar colour) follows
    the published theme. Phones re-read it now and then; no new build needed."""
    b = _brand(tenant)
    light = (b.get("colors") or {}).get("light") or {}
    row = db.execute("select name, theme_published from public.tenants where id = %s", (tenant,)).fetchone() or {}
    t = row.get("theme_published") or {}
    header = t.get("headerColor") or t.get("secondaryColor") or light.get("header") or "#0A4D5A"
    name = b.get("name") or row.get("name") or "App"
    body = {
        "name": name, "short_name": name, "description": b.get("taglineEn") or "", "lang": "hi",
        "start_url": "/", "scope": "/", "display": "standalone",
        "theme_color": header, "background_color": header,
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    return JSONResponse(body, media_type="application/manifest+json", headers={"Cache-Control": "public, max-age=300"})
