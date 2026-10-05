"""Sprint 8 routes: my invite code + numbers, "an owner opened my profile", QR posters (admin), daily job."""
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .. import growth
from ..auth import AuthUser, current_user
from ..config import get_settings
from ..deps import get_db, tenant_id
from .admin import _audit, admin_ctx
from .trust import is_blocked

router = APIRouter(tags=["growth"])
IST = timezone(timedelta(hours=5, minutes=30))


def _me(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute("select id, tenant_id, role, blocked, is_test from public.profiles where id = %s", (user.id,)).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    return me


@router.get("/me/growth")
def my_growth(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Invite code, friends who joined, the "Top" boost, and (drivers) how many owners opened my profile."""
    me = _me(db, user, tenant)
    if me["role"] not in ("driver", "owner"):
        raise HTTPException(403, "Only drivers and owners")
    return growth.my_growth(db, user.id)


@router.post("/drivers/{driver_id}/view", status_code=204)
def viewed(driver_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """An owner opened a driver's full profile. Counted once per owner per day; test and real never mix."""
    me = _me(db, user, tenant)
    if me["role"] != "owner" or str(driver_id) == str(user.id):
        return
    if is_blocked(db, user.id, driver_id):
        return
    db.execute(
        """
        insert into public.profile_views (tenant_id, driver_id, viewer_id)
        select %s, p.id, %s from public.profiles p
        where p.id = %s and p.role = 'driver' and p.tenant_id = %s and p.is_test = %s
        on conflict do nothing
        """,
        (tenant, user.id, driver_id, tenant, me["is_test"]),
    )


# ---------------------------------------------------------------- posters (admin)
class PosterIn(BaseModel):
    place: str = Field(min_length=2, max_length=80)
    district: Optional[str] = Field(default=None, max_length=60)
    state: Optional[str] = Field(default=None, max_length=60)


@router.get("/admin/posters")
def posters(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    """Posters with how many phones opened the QR and how many people joined from it."""
    rows = db.execute(
        """
        select po.id, po.code, po.place, po.district, po.state, po.created_at,
          (select count(distinct e.anon_id) from public.events e
            where e.tenant_id = po.tenant_id and e.name = 'attributed' and e.props->>'via' = 'poster'
              and e.props->>'code' = po.code) as opened,
          (select count(*) from public.profiles p
            where p.tenant_id = po.tenant_id and p.joined_via = 'poster' and p.joined_code = po.code) as joined
        from public.posters po where po.tenant_id = %s order by po.created_at desc limit 200
        """,
        (ctx["tenant"],),
    ).fetchall() or []
    out = []
    for r in rows:
        r = dict(r)
        r["created_at"] = r["created_at"].isoformat()
        r["opened"], r["joined"] = int(r["opened"] or 0), int(r["joined"] or 0)
        out.append(r)
    return {"items": out}


@router.post("/admin/posters", status_code=201)
def new_poster(body: PosterIn, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    for _ in range(5):
        code = growth.new_code(6)
        row = db.execute(
            "insert into public.posters (tenant_id, code, place, district, state, admin_id) values (%s, %s, %s, %s, %s, %s) "
            "on conflict (code) do nothing returning id, code, place, district, state, created_at",
            (ctx["tenant"], code, body.place.strip(), body.district, body.state, ctx["id"]),
        ).fetchone()
        if row:
            _audit(db, ctx, "poster_create", "poster", None, f"poster {row['code']}: {row['place']}")
            r = dict(row)
            r["created_at"] = r["created_at"].isoformat()
            return r | {"opened": 0, "joined": 0}
    raise HTTPException(500, "Could not make a poster code")


# ---------------------------------------------------------------- daily job (Vercel cron)
@router.get("/cron/daily")
def cron_daily(authorization: Optional[str] = Header(default=None), db=Depends(get_db)):
    """Vercel calls this once a day with "Authorization: Bearer <CRON_SECRET>"."""
    secret = get_settings().cron_secret
    if not secret:
        raise HTTPException(503, "CRON_SECRET not set")
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(401, "Bad cron secret")
    today = datetime.now(IST).date()
    return {"date": today.isoformat(), **growth.daily(db, today)}
