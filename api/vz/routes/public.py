"""No login needed: live jobs (so a driver sees real work before giving a number), one shared job,
and the small lookups behind invite / referral links.

Never returned here: anyone's phone number or the owner's name. Test accounts are never shown.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import search as S
from ..deps import get_db, tenant_id
from ..growth import clean_code
from .posts import POST_SELECT, _clean

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
    f: S.Common = Depends(S.common),
    jf: S.JobFilters = Depends(S.job_filters),
    limit: int = Query(20, ge=1, le=30),
    offset: int = Query(0, ge=0, le=300),
    db=Depends(get_db),
    tenant: str = Depends(tenant_id),
):
    """Live jobs, the chosen district first, then the newest. Owners who brought friends come first.
    Same search + filters as the logged-in list (no search on the owner's firm name here)."""
    f.resolve(db)
    near = f"""(%(district)s <> '' and {_IN_DISTRICT}) desc,
                 o.location operator(extensions.<->) %(loc)s::extensions.geography nulls last,
                 (coalesce(o.boost_until, now()) > now()) desc,
                 p.created_at desc"""
    rows = db.execute(
        f"""
        select {POST_SELECT}, {_OWNER_COLS}, count(*) over () as total
        from public.posts p join public.profiles o on o.id = p.owner_id
        where {_VISIBLE} and p.status = 'live' and p.expires_at > now()
          {S.job_where(public=True)}
        order by {S.job_order(f.sort, near)}
        limit %(limit)s offset %(offset)s
        """,
        f.params() | jf.params() | {"tenant": tenant, "limit": limit, "offset": offset},
    ).fetchall() or []
    items, total, more = S.page(rows, limit, offset)
    return {"items": [_public(r) for r in items], "has_more": more, "total": total, "place": f.district if f.chosen else None}


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


# ---------------------------------------------------------------- drivers (for owners, no login)
@router.get("/drivers")
def public_drivers(
    f: S.Common = Depends(S.common),
    df: S.DriverFilters = Depends(S.driver_filters),
    limit: int = Query(20, ge=1, le=30),
    offset: int = Query(0, ge=0, le=300),
    db=Depends(get_db),
    tenant: str = Depends(tenant_id),
):
    """Listed drivers for an owner who has not logged in yet: first name + initial, place, vehicles, licence,
    experience, badges. No photo, no number, no id: "Call" asks the owner to log in first.
    Same search + filters as the logged-in list (names: first name only)."""
    f.resolve(db)
    near = """(%(district)s <> '' and lower(p.district) = lower(%(district)s)) desc,
                 (coalesce(d.looking_checked_at, d.updated_at, p.created_at) > now() - interval '21 days') desc,
                 p.location operator(extensions.<->) %(loc)s::extensions.geography nulls last,
                 p.verified desc, (d.available_from = 'now') desc, p.last_seen_at desc nulls last"""
    rows = db.execute(
        f"""
        select p.name, p.district, p.state, p.verified, p.rating_avg, p.rating_count, p.jobs_done,
               (coalesce(p.boost_until, now()) > now()) as top,
               d.vehicles, d.max_wheels, d.licence_type, d.experience_years, d.savings_wanted, d.savings_negotiable,
               d.pay_prefs, d.work_type, d.area, d.languages, d.available_from,
               count(*) over () as total
        from public.profiles p join public.driver_details d on d.profile_id = p.id
        where p.tenant_id = %(tenant)s and p.role = 'driver' and p.setup_done and not p.blocked and not p.is_test
          and d.is_available and cardinality(d.vehicles) > 0 and d.available_from is not null
          {S.driver_where(public=True)}
        order by {S.driver_order(f.sort, near)}
        limit %(limit)s offset %(offset)s
        """,
        f.params() | df.params() | {"tenant": tenant, "limit": limit, "offset": offset},
    ).fetchall() or []
    items, total, more = S.page(rows, limit, offset)
    for r in items:
        parts = (r.pop("name") or "").split()
        r["name"] = (parts[0] + (f" {parts[1][0]}." if len(parts) > 1 else "")) if parts else None
        r["rating_avg"] = float(r["rating_avg"]) if r.get("rating_avg") is not None else None
        for k in ("vehicles", "pay_prefs", "languages"):
            r[k] = r[k] or []
    return {"items": items, "has_more": more, "total": total, "place": f.district if f.chosen else None}


@router.get("/driver-stats")
def public_driver_stats(district: Optional[str] = Query(None, max_length=60), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """"Rewa: 14 drivers ready for work" — listed drivers, in the district and everywhere."""
    d = (district or "").strip()
    row = db.execute(
        """
        select count(*) as drivers,
               count(*) filter (where %(district)s <> '' and lower(p.district) = lower(%(district)s)) as drivers_here,
               count(*) filter (where dd.available_from = 'now') as ready_now
        from public.profiles p join public.driver_details dd on dd.profile_id = p.id
        where p.tenant_id = %(tenant)s and p.role = 'driver' and p.setup_done and not p.blocked and not p.is_test
          and dd.is_available and cardinality(dd.vehicles) > 0 and dd.available_from is not null
        """,
        {"tenant": tenant, "district": d},
    ).fetchone() or {}
    return {k: int(row.get(k) or 0) for k in ("drivers", "drivers_here", "ready_now")} | {"district": d or None}
