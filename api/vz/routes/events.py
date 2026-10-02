"""Analytics: the app sends events in batches (every 30-60 s) to keep function calls low."""
import json
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..auth import AuthUser, optional_user
from ..deps import get_db, tenant_id

router = APIRouter(prefix="/events", tags=["analytics"])

PLATFORMS = {"android_app", "web_mobile", "web_desktop", "ios_web", "ios_app"}


class Event(BaseModel):
    name: str = Field(max_length=60)
    screen: Optional[str] = Field(default=None, max_length=60)
    props: dict[str, Any] = Field(default_factory=dict)
    ts: datetime


class Context(BaseModel):
    platform: str = Field(max_length=20)
    os: Optional[str] = Field(default=None, max_length=40)
    browser: Optional[str] = Field(default=None, max_length=40)
    device: Optional[str] = Field(default=None, max_length=60)
    app_version: Optional[str] = Field(default=None, max_length=20)
    standalone: Optional[bool] = None


class Batch(BaseModel):
    anon_id: str = Field(max_length=64)
    session_id: str = Field(max_length=64)
    context: Context
    events: list[Event] = Field(max_length=100)


@router.post("", status_code=202)
def ingest(
    batch: Batch,
    request: Request,
    user: Optional[AuthUser] = Depends(optional_user),
    db=Depends(get_db),
    tenant: str = Depends(tenant_id),
):
    if not batch.events:
        return {"stored": 0}
    ctx = batch.context
    platform = ctx.platform if ctx.platform in PLATFORMS else "web_mobile"
    # Vercel adds approximate location headers; never store the IP itself.
    city = unquote(request.headers.get("x-vercel-ip-city", "")) or None
    region = request.headers.get("x-vercel-ip-country-region") or None
    now = datetime.now(timezone.utc)
    # Test accounts (public.test_phones) are kept out of real analytics.
    is_test = False
    if user and user.phone:
        hit = db.execute("select 1 from public.test_phones where phone = %s", (user.phone,)).fetchone()
        is_test = bool(hit)
    rows = []
    for e in batch.events:
        ts = e.ts if e.ts.tzinfo else e.ts.replace(tzinfo=timezone.utc)
        if abs((now - ts).total_seconds()) > 7 * 24 * 3600:
            ts = now  # device clock far off
        props = {k: v for k, v in e.props.items() if k not in ("phone", "name", "otp")}
        rows.append((
            tenant, user.id if user else None, batch.anon_id, batch.session_id, e.name, e.screen,
            json.dumps(props)[:4000], platform, ctx.os, ctx.browser, ctx.device, ctx.app_version,
            ctx.standalone, city, region, ts, is_test,
        ))
    with db.cursor() as cur:
        cur.executemany(
            """insert into public.events
               (tenant_id, user_id, anon_id, session_id, name, screen, props, platform, os, browser,
                device, app_version, standalone, city, region, ts, is_test)
               values (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            rows,
        )
    return {"stored": len(rows)}
