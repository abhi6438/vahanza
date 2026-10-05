"""No login needed: live jobs (so a driver sees real work before giving a number), one shared job,
and the small lookups behind invite / referral links.

Never returned here: anyone's phone number or the owner's name. Test accounts are never shown.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_db, tenant_id
from ..growth import clean_code
from .posts import POST_SELECT, VEHICLES, _clean

router = APIRouter(prefix="/public", tags=["public"])

_PUBLIC_DROP = ("check_flags", "owner_id")
_OWNER_COLS = """
    p.share_code, o.district as owner_district, o.state as owner_state, o.verified as owner_verified,
    o.rating_avg as owner_rating_avg, o.rating_count as owner_rating_count,
    o.jobs_done as owner_jobs_done, o.fast_reply as owner_fast_reply
"""
_VISIBLE = "p.tenant_id = %(tenant)s and not o.blocked and not o.is_test"
# a job "is in" a district when one of its base cities is there, or the owner lives there
_IN_DISTRICT = """(exists (select 1 from unnest(p.base_cities) c where lower(split_part(c, ',', 1)) = lower(%(district)s))
                   or lower(o.district) = lower(%(district)s))"""


def _public(row: dict) -> dict:
    r = _clean(row)
    for k in _PUBLIC_DROP:
        r.pop(k, None)
    return r


@router.get("/jobs")
def public_jobs(
    district: Optional[str] = Query(None, max_length=60),
    vehicle: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=30),
    offset: int = Query(0, ge=0, le=300),
    db=Depends(get_db),
    tenant: str = Depends(tenant_id),
):
    """Live jobs, the chosen district first, then the newest. Owners who brought friends come first."""
    if vehicle is not None and vehicle not in VEHICLES:
        raise HTTPException(422, "Unknown vehicle")
    d = (district or "").strip()
    rows = db.execute(
        f"""
        select {POST_SELECT}, {_OWNER_COLS}
        from public.posts p join public.profiles o on o.id = p.owner_id
        where {_VISIBLE} and p.status = 'live' and p.expires_at > now()
          and (%(vehicle)s::text is null or exists (
                select 1 from public.post_groups pg join public.fleet_groups fg on fg.id = pg.fleet_group_id
                where pg.post_id = p.id and fg.vehicle_type = %(vehicle)s))
        order by (%(district)s <> '' and {_IN_DISTRICT}) desc,
                 (coalesce(o.boost_until, now()) > now()) desc,
                 p.created_at desc
        limit %(limit)s offset %(offset)s
        """,
        {"tenant": tenant, "district": d, "vehicle": vehicle, "limit": limit, "offset": offset},
    ).fetchall() or []
    items = [_public(r) for r in rows]
    return {"items": items, "has_more": len(items) == limit}


@router.get("/stats")
def public_stats(district: Optional[str] = Query(None, max_length=60), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """"Today in Rewa 12 drivers are wanted": live posts and drivers wanted, in the district and everywhere."""
    d = (district or "").strip()
    row = db.execute(
        f"""
        select count(*) as posts,
               coalesce(sum((select sum(drivers_needed) from public.post_groups where post_id = p.id)), 0) as drivers,
               count(*) filter (where %(district)s <> '' and {_IN_DISTRICT}) as posts_here,
               coalesce(sum((select sum(drivers_needed) from public.post_groups where post_id = p.id))
                        filter (where %(district)s <> '' and {_IN_DISTRICT}), 0) as drivers_here
        from public.posts p join public.profiles o on o.id = p.owner_id
        where {_VISIBLE} and p.status = 'live' and p.expires_at > now()
        """,
        {"tenant": tenant, "district": d},
    ).fetchone() or {}
    # "this month 23 drivers got work through the app" (confirmed by the driver)
    hired = db.execute(
        """select count(*) as hired,
                  count(*) filter (where %(district)s <> '' and lower(o.district) = lower(%(district)s)) as hired_here
           from public.hires h join public.profiles o on o.id = h.owner_id
           where h.tenant_id = %(tenant)s and h.status = 'confirmed' and h.answered_at > now() - interval '30 days' and not o.is_test""",
        {"tenant": tenant, "district": d},
    ).fetchone() or {}
    keys = ("posts", "drivers", "posts_here", "drivers_here")
    return {k: int(row.get(k) or 0) for k in keys} | {k: int(hired.get(k) or 0) for k in ("hired", "hired_here")} | {"district": d or None}


@router.get("/jobs/{code}")
def public_job(code: str, db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """One job by its share code. A closed / filled job still answers (the page says it is no longer open)."""
    code = clean_code(code)
    row = db.execute(
        f"""
        select {POST_SELECT}, {_OWNER_COLS},
               (p.status = 'live' and p.expires_at > now()) as open
        from public.posts p join public.profiles o on o.id = p.owner_id
        where {_VISIBLE} and p.share_code = %(code)s and p.status <> 'under_check'
        """,
        {"tenant": tenant, "code": code},
    ).fetchone()
    if not row:
        raise HTTPException(404, "Job not found")
    return _public(row)


@router.get("/invite/{code}")
def invite(code: str, db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Personal link sent to an imported person: their first name, role and number (to fill the login box).
    The link goes only to that number; nothing is returned once they have joined."""
    row = db.execute(
        "select role, name, phone from public.prospects where tenant_id = %s and code = %s and joined_at is null and not opted_out",
        (tenant, clean_code(code)),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Invite not found")
    return {"role": row["role"], "name": (row["name"] or "").split(" ")[0] or None, "phone": row["phone"][2:]}


@router.get("/ref/{code}")
def referral(code: str, db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Who invited me: first name + photo for the welcome line. Nothing else."""
    row = db.execute(
        "select name, photo_url, role from public.profiles where tenant_id = %s and ref_code = %s and not blocked",
        (tenant, clean_code(code).upper()),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Code not found")
    return {"name": (row["name"] or "").split(" ")[0] or None, "photo_url": row["photo_url"], "role": row["role"]}
