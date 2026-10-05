"""Owner posts ("I need drivers"), the driver's job list, interests and contact.

Rules
* A post needs at least one of the owner's fleet groups, drivers needed per group, and monthly savings.
* Automatic checks decide: no flags -> live straight away, flags -> under_check (admin looks only at these).
* Posts expire after 30 days. Test accounts only see test accounts (and real users only real ones).
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, field_validator

from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id
from .. import notify
from .trust import is_blocked

router = APIRouter(tags=["posts"])

VEHICLES = {"truck", "trailer", "bus", "car", "jcb", "tractor", "auto", "pickup"}
FACILITIES = {"stay", "food", "off", "ot", "bhatta", "rech", "ins", "pf", "bonus", "uni", "adv"}
# pay type -> (min, max) accepted value; anything outside is refused as a typo
PAY_LIMITS = {"fix": (500, 200000), "trip": (50, 50000), "km": (0.5, 50), "bhatta": (50, 5000), "comm": (1, 50)}
SAVINGS_NORMAL = (6000, 80000)
MAX_LIVE_POSTS = 10
MAX_REVEALS_PER_DAY = 60


class GroupNeed(BaseModel):
    fleet_group_id: str
    drivers_needed: int = Field(ge=1, le=500)


class PostIn(BaseModel):
    groups: list[GroupNeed] = Field(min_length=1, max_length=30)
    work_type: Literal["full", "day", "trip"] = "full"
    savings_monthly: int = Field(ge=1000, le=500000)
    savings_negotiable: bool = True
    pay_mix: dict[str, float] = Field(default_factory=dict)
    base_cities: list[str] = Field(default_factory=list, max_length=20)
    coverage: Optional[Literal["local", "state", "near", "india"]] = None
    often_cities: list[str] = Field(default_factory=list, max_length=20)
    licence_type: Optional[Literal["LMV", "HMV", "Transport"]] = None
    min_experience: int = Field(default=0, ge=0, le=40)
    facilities: list[str] = Field(default_factory=list, max_length=11)

    @field_validator("pay_mix")
    @classmethod
    def _pay(cls, v):
        for k, val in v.items():
            if k not in PAY_LIMITS:
                raise ValueError(f"unknown pay type {k}")
            lo, hi = PAY_LIMITS[k]
            if not lo <= val <= hi:
                raise ValueError(f"{k} out of range")
        return v

    @field_validator("facilities")
    @classmethod
    def _fac(cls, v):
        if not set(v) <= FACILITIES:
            raise ValueError("unknown facility")
        return list(dict.fromkeys(v))

    @field_validator("base_cities", "often_cities")
    @classmethod
    def _cities(cls, v):
        out = []
        for c in v:
            c = c.strip()
            if not c or len(c) > 80:
                raise ValueError("bad city")
            if c not in out:
                out.append(c)
        return out


def post_flags(p: PostIn) -> list[str]:
    flags = []
    if not SAVINGS_NORMAL[0] <= p.savings_monthly <= SAVINGS_NORMAL[1]:
        flags.append("savings_unusual")
    if sum(g.drivers_needed for g in p.groups) > 100:
        flags.append("many_drivers")
    return flags


def _me(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute(
        "select id, tenant_id, role, is_test, blocked, setup_done, district, location, name, business_name, phone "
        "from public.profiles where id = %s",
        (user.id,),
    ).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    return me


def _require(me: dict, *roles: str) -> None:
    if me["role"] not in roles + ("admin", "super_admin"):
        raise HTTPException(403, "Not allowed for this role")


# Columns shared by "my posts" and the job list. Vehicle groups come back as JSON.
POST_SELECT = """
    p.id, p.status, p.savings_monthly, p.savings_negotiable, p.pay_mix, p.base_cities, p.coverage,
    p.often_cities, p.licence_type, p.min_experience, p.work_type, p.facilities, p.check_flags,
    p.created_at, p.expires_at, p.share_code,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'fleet_group_id', fg.id, 'vehicle_type', fg.vehicle_type, 'wheels', fg.wheels,
        'drivers_needed', pg.drivers_needed) order by fg.created_at), '[]'::jsonb)
       from public.post_groups pg join public.fleet_groups fg on fg.id = pg.fleet_group_id
      where pg.post_id = p.id) as groups
"""


def _clean(row: dict) -> dict:
    r = dict(row)
    for k in ("id", "owner_id"):
        if k in r and r[k] is not None:
            r[k] = str(r[k])
    for k in ("created_at", "expires_at"):
        if r.get(k) is not None:
            r[k] = r[k].isoformat()
    if r.get("owner_rating_avg") is not None:
        r["owner_rating_avg"] = float(r["owner_rating_avg"])
    return r


# ---------------------------------------------------------------- owner side
@router.post("/posts", status_code=201)
def create_post(body: PostIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    _require(me, "owner")
    if not me["setup_done"]:
        raise HTTPException(422, {"code": "profile_needed"})
    ids = [g.fleet_group_id for g in body.groups]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, {"code": "duplicate_group"})
    owned = db.execute(
        "select count(*) as n from public.fleet_groups where owner_id = %s and id = any(%s::uuid[])",
        (user.id, ids),
    ).fetchone()
    if not owned or owned["n"] != len(ids):
        raise HTTPException(422, {"code": "unknown_fleet_group"})
    live = db.execute(
        "select count(*) as n from public.posts where owner_id = %s and status in ('live', 'under_check', 'paused') and expires_at > now()",
        (user.id,),
    ).fetchone()
    if live and live["n"] >= MAX_LIVE_POSTS:
        raise HTTPException(409, {"code": "too_many_posts"})

    flags = post_flags(body)
    status = "under_check" if flags else "live"
    row = db.execute(
        """
        insert into public.posts (tenant_id, owner_id, status, savings_monthly, savings_negotiable, pay_mix,
          base_cities, coverage, often_cities, licence_type, min_experience, work_type, facilities, check_flags)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id, status
        """,
        (tenant, user.id, status, body.savings_monthly, body.savings_negotiable, Jsonb(body.pay_mix),
         body.base_cities, body.coverage, body.often_cities, body.licence_type, body.min_experience,
         body.work_type, body.facilities, Jsonb(flags)),
    ).fetchone()
    with db.cursor() as cur:
        cur.executemany(
            "insert into public.post_groups (post_id, fleet_group_id, drivers_needed) values (%s, %s, %s)",
            [(row["id"], g.fleet_group_id, g.drivers_needed) for g in body.groups],
        )
    if row["status"] == "live":
        notify.safe(db, notify.new_post, str(row["id"]))
    return {"id": str(row["id"]), "status": row["status"], "check_flags": flags}


@router.get("/posts/mine")
def my_posts(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    _require(me, "owner")
    rows = db.execute(
        f"""
        select {POST_SELECT},
          (select count(*) from public.interests i where i.post_id = p.id) as interested,
          (select count(*) from public.interests i where i.post_id = p.id and i.status = 'sent') as new_interested
        from public.posts p
        where p.owner_id = %s and p.status <> 'closed'
        order by p.created_at desc
        limit 50
        """,
        (user.id,),
    ).fetchall() or []
    return {"items": [_clean(r) for r in rows]}


class PostStatus(BaseModel):
    status: Literal["live", "paused", "filled", "closed"]


@router.patch("/posts/{post_id}")
def set_post_status(post_id: str, body: PostStatus, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Owner pauses, resumes, marks filled or closes a post. A post under check cannot be made live by the owner."""
    me = _me(db, user, tenant)
    _require(me, "owner")
    row = db.execute("select status from public.posts where id = %s and owner_id = %s", (post_id, user.id)).fetchone()
    if not row:
        raise HTTPException(404, "Post not found")
    if body.status == "live" and row["status"] == "under_check":
        raise HTTPException(409, {"code": "under_check"})
    extend = body.status == "live" and row["status"] in ("paused", "filled")
    db.execute(
        "update public.posts set status = %s, expires_at = case when %s then now() + interval '30 days' else expires_at end "
        "where id = %s and owner_id = %s",
        (body.status, extend, post_id, user.id),
    )
    return {"id": post_id, "status": body.status}


@router.get("/posts/{post_id}/interests")
def post_interests(post_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Drivers who tapped "interested" on this post. Opening the list marks them as seen."""
    me = _me(db, user, tenant)
    _require(me, "owner")
    if not db.execute("select 1 from public.posts where id = %s and owner_id = %s", (post_id, user.id)).fetchone():
        raise HTTPException(404, "Post not found")
    rows = db.execute(
        """
        select i.id as interest_id, i.status as interest_status, i.created_at as interested_at,
               p.id, p.name, p.photo_url, p.district, p.state, p.verified, p.rating_avg, p.rating_count,
               d.vehicles, d.max_wheels, d.licence_type, d.experience_years, d.savings_wanted,
               d.savings_negotiable, d.pay_prefs, d.work_type, d.area, d.languages, d.available_from
        from public.interests i
        join public.profiles p on p.id = i.driver_id
        left join public.driver_details d on d.profile_id = p.id
        where i.post_id = %s and not p.blocked
          and not exists (select 1 from public.blocks bl
                  where (bl.blocker_id = %s::uuid and bl.blocked_id = p.id) or (bl.blocker_id = p.id and bl.blocked_id = %s::uuid))
        order by i.created_at desc
        """,
        (post_id, user.id, user.id),
    ).fetchall() or []
    seen = db.execute(
        "update public.interests set status = 'seen' where post_id = %s and status = 'sent' returning driver_id", (post_id,)
    ).fetchall() or []
    owner = me.get("business_name") or me.get("name") or ""
    for r in seen:
        notify.safe(db, notify.to_user, tenant, str(r["driver_id"]), "interest_seen", {"owner": owner, "post_id": post_id})
    out = []
    for r in rows:
        r = dict(r)
        r["id"], r["interest_id"] = str(r["id"]), str(r["interest_id"])
        r["interested_at"] = r["interested_at"].isoformat()
        r["rating_avg"] = float(r["rating_avg"]) if r["rating_avg"] is not None else None
        r["vehicles"] = r["vehicles"] or []
        r["pay_prefs"] = r["pay_prefs"] or []
        r["languages"] = r["languages"] or []
        out.append(r)
    return {"items": out}


# ---------------------------------------------------------------- driver side
@router.get("/jobs")
def list_jobs(
    vehicle: Optional[str] = Query(None),
    verified: bool = Query(False),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0, le=1000),
    user: AuthUser = Depends(current_user),
    db=Depends(get_db),
    tenant: str = Depends(tenant_id),
):
    """Live posts for drivers: same district first, then nearest owner, then newest."""
    me = _me(db, user, tenant)
    _require(me, "driver")
    if vehicle is not None and vehicle not in VEHICLES:
        raise HTTPException(422, "Unknown vehicle")
    rows = db.execute(
        f"""
        select {POST_SELECT},
          o.id as owner_id, o.name as owner_name, o.business_name, o.photo_url as owner_photo,
          o.district as owner_district, o.state as owner_state, o.verified as owner_verified,
          o.rating_avg as owner_rating_avg, o.rating_count as owner_rating_count,
          case when o.location is not null and %(loc)s::extensions.geography is not null
               then round((extensions.st_distance(o.location, %(loc)s::extensions.geography) / 1000)::numeric)::int end
            as distance_km,
          exists (select 1 from public.interests i where i.post_id = p.id and i.driver_id = %(me)s) as interested
        from public.posts p
        join public.profiles o on o.id = p.owner_id
        where p.tenant_id = %(tenant)s and p.status = 'live' and p.expires_at > now()
          and not o.blocked and o.is_test = %(test)s
          and (%(vehicle)s::text is null or exists (
                select 1 from public.post_groups pg join public.fleet_groups fg on fg.id = pg.fleet_group_id
                where pg.post_id = p.id and fg.vehicle_type = %(vehicle)s))
          and (not %(verified)s or o.verified)
          and not exists (select 1 from public.blocks bl
                  where (bl.blocker_id = %(me)s::uuid and bl.blocked_id = o.id) or (bl.blocker_id = o.id and bl.blocked_id = %(me)s::uuid))
        order by
          (exists (select 1 from unnest(p.base_cities) c where lower(split_part(c, ',', 1)) = lower(%(district)s))) desc,
          -- owners who brought friends ("Top" boost) first, but only nearby ones
          (coalesce(o.boost_until, now()) > now() and (lower(o.district) = lower(%(district)s)
             or (o.location is not null and %(loc)s::extensions.geography is not null
                 and extensions.st_dwithin(o.location, %(loc)s::extensions.geography, 150000)))) desc,
          o.location operator(extensions.<->) %(loc)s::extensions.geography nulls last,
          p.created_at desc
        limit %(limit)s offset %(offset)s
        """,
        {"loc": me["location"], "district": me["district"] or "", "tenant": tenant, "test": me["is_test"],
         "me": user.id, "vehicle": vehicle, "verified": verified, "limit": limit, "offset": offset},
    ).fetchall() or []
    items = [_clean(r) for r in rows]
    return {"items": items, "has_more": len(items) == limit}


def _live_post(db, post_id: str, tenant: str, is_test: bool) -> dict:
    row = db.execute(
        """
        select p.id, p.owner_id, o.phone from public.posts p join public.profiles o on o.id = p.owner_id
        where p.id = %s and p.tenant_id = %s and p.status = 'live' and p.expires_at > now()
          and not o.blocked and o.is_test = %s
        """,
        (post_id, tenant, is_test),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Job not available")
    return row


@router.post("/jobs/{post_id}/interest", status_code=201)
def show_interest(post_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Driver taps "I'm interested": the owner sees the driver's profile under the post."""
    me = _me(db, user, tenant)
    _require(me, "driver")
    post = _live_post(db, post_id, tenant, me["is_test"])
    if is_blocked(db, user.id, str(post["owner_id"])):
        raise HTTPException(404, "Job not available")
    added = db.execute(
        "insert into public.interests (tenant_id, post_id, driver_id) values (%s, %s, %s) "
        "on conflict (post_id, driver_id) do nothing returning id",
        (tenant, post_id, user.id),
    ).fetchone()
    if added:
        notify.safe(db, notify.to_user, tenant, str(post["owner_id"]), "new_interest",
                    {"driver": me.get("name") or "", "post_id": post_id, "driver_id": str(user.id)})
    return {"post_id": post_id, "interested": True}


@router.delete("/jobs/{post_id}/interest", status_code=204)
def remove_interest(post_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    db.execute("delete from public.interests where post_id = %s and driver_id = %s", (post_id, user.id))


class ContactBody(BaseModel):
    via: Literal["call", "whatsapp"] = "call"


@router.post("/jobs/{post_id}/contact")
def contact_owner(post_id: str, body: ContactBody, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Owner's number, only when the driver taps Call / WhatsApp on a job; recorded."""
    me = _me(db, user, tenant)
    _require(me, "driver")
    used = db.execute(
        "select count(*) as n from public.events where user_id = %s and name = 'contact_reveal' and ts > now() - interval '1 day'",
        (user.id,),
    ).fetchone()
    if used and used["n"] >= MAX_REVEALS_PER_DAY:
        raise HTTPException(429, {"code": "too_many_contacts"})
    row = _live_post(db, post_id, tenant, me["is_test"])
    if is_blocked(db, user.id, str(row["owner_id"])):
        raise HTTPException(404, "Job not available")
    if not row["phone"]:
        raise HTTPException(404, "Owner not reachable")
    db.execute(
        "insert into public.events (tenant_id, user_id, anon_id, session_id, name, screen, props, ts, is_test) "
        "values (%s, %s, 'server', 'server', 'contact_reveal', 'job_list', %s, now(), %s)",
        (tenant, user.id, Jsonb({"post_id": post_id, "via": body.via}), me["is_test"]),
    )
    return {"phone": row["phone"]}


@router.get("/me/interests")
def my_interests(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Jobs the driver showed interest in, with whether the owner has seen it."""
    me = _me(db, user, tenant)
    _require(me, "driver")
    rows = db.execute(
        f"""
        select {POST_SELECT},
          i.status as interest_status, i.created_at as interested_at,
          o.id as owner_id, o.name as owner_name, o.photo_url as owner_photo, o.rating_avg as owner_rating_avg, o.rating_count as owner_rating_count, o.business_name, o.district as owner_district, o.state as owner_state,
          o.verified as owner_verified, null::int as distance_km, true as interested
        from public.interests i
        join public.posts p on p.id = i.post_id
        join public.profiles o on o.id = p.owner_id
        where i.driver_id = %s
        order by i.created_at desc
        limit 50
        """,
        (user.id,),
    ).fetchall() or []
    out = []
    for r in rows:
        r = _clean(r)
        r["interested_at"] = r["interested_at"].isoformat() if hasattr(r["interested_at"], "isoformat") else r["interested_at"]
        out.append(r)
    return {"items": out}
