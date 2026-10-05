"""Runtime brand theme (Admin → Settings → Appearance).

Only the inputs are stored — primary / secondary / accent colours, default light-dark mode, corner style
and density. The app derives every shade itself (web/src/lib/brand-theme.ts), so there is never a
per-component colour setting. Draft = being edited by an admin; published = what every user sees.

  GET    /theme                    published theme, no login (the app checks it on start)
  GET    /admin/theme              draft + published
  PUT    /admin/theme/draft        save a draft
  POST   /admin/theme/publish      publish (also becomes the draft)
  DELETE /admin/theme/published    back to the brand's own colours (brands/<id>.json)
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from ..deps import get_db, tenant_id
from .admin import _audit, admin_ctx

router = APIRouter(tags=["theme"])
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

    def clean(self) -> dict:
        d = self.model_dump()
        for k in ("primaryColor", "secondaryColor", "accentColor"):
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
