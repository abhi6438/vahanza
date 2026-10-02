"""Admin panel API: dashboard numbers, the check queue (flagged posts/profiles), users, and an audit trail.

* admin        -> works on their own brand (tenant) only
* super_admin  -> any brand; the brand comes from the X-Brand header like everywhere else
Test accounts are always left out of the numbers.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id

router = APIRouter(prefix="/admin", tags=["admin"])


def admin_ctx(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)) -> dict:
    me = db.execute("select id, tenant_id, role, blocked from public.profiles where id = %s", (user.id,)).fetchone()
    if not me or me["blocked"] or me["role"] not in ("admin", "super_admin"):
        raise HTTPException(403, "Admins only")
    if me["role"] == "admin" and me["tenant_id"] != tenant:
        raise HTTPException(403, "Not your brand")
    return {"id": str(me["id"]), "role": me["role"], "tenant": tenant}


def _audit(db, ctx: dict, action: str, target_type: str, target_id: str, note: Optional[str] = None) -> None:
    db.execute(
        "insert into public.admin_actions (tenant_id, admin_id, action, target_type, target_id, note) values (%s, %s, %s, %s, %s, %s)",
        (ctx["tenant"], ctx["id"], action, target_type, target_id, note),
    )


def _rows(db, sql: str, params) -> list[dict]:
    return [dict(r) for r in (db.execute(sql, params).fetchall() or [])]


@router.get("/stats")
def stats(days: int = Query(30, ge=7, le=180), ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    t = ctx["tenant"]
    p = {"t": t, "days": days}
    totals = db.execute(
        """
        select
          count(*) filter (where role = 'driver')                                         as drivers,
          count(*) filter (where role = 'owner')                                          as owners,
          count(*) filter (where created_at > now() - interval '1 day')                   as new_today,
          count(*) filter (where created_at > now() - make_interval(days => %(days)s))    as new_period,
          count(*) filter (where last_seen_at > now() - interval '1 day')                 as active_today,
          count(*) filter (where last_seen_at > now() - interval '7 days')                as active_week,
          count(*) filter (where last_seen_at > now() - interval '10 minutes')            as online_now,
          count(*) filter (where verified)                                                as verified,
          count(*) filter (where blocked)                                                 as blocked
        from public.profiles
        where tenant_id = %(t)s and not is_test and role in ('driver', 'owner')
        """,
        p,
    ).fetchone() or {}
    listed = db.execute(
        """
        select count(*) as n from public.profiles pr join public.driver_details d on d.profile_id = pr.id
        where pr.tenant_id = %(t)s and not pr.is_test and pr.role = 'driver' and not pr.blocked
          and d.is_available and cardinality(d.vehicles) > 0 and d.available_from is not null
        """,
        p,
    ).fetchone() or {}
    posts = db.execute(
        """
        select count(*) filter (where p.status = 'live' and p.expires_at > now()) as live,
               count(*) filter (where p.status = 'under_check')                  as under_check,
               count(*) filter (where p.status = 'filled')                       as filled,
               coalesce(sum(pg.need) filter (where p.status = 'live' and p.expires_at > now()), 0) as drivers_wanted
        from public.posts p
        join public.profiles o on o.id = p.owner_id
        left join (select post_id, sum(drivers_needed) as need from public.post_groups group by post_id) pg on pg.post_id = p.id
        where p.tenant_id = %(t)s and not o.is_test
        """,
        p,
    ).fetchone() or {}
    interests = db.execute(
        """
        select count(*) as n from public.interests i join public.profiles d on d.id = i.driver_id
        where i.tenant_id = %(t)s and not d.is_test and i.created_at > now() - make_interval(days => %(days)s)
        """,
        p,
    ).fetchone() or {}
    calls = db.execute(
        """
        select count(*) filter (where props->>'via' = 'call')     as calls,
               count(*) filter (where props->>'via' = 'whatsapp') as whatsapp
        from public.events
        where tenant_id = %(t)s and not is_test and name = 'contact_reveal' and ts > now() - make_interval(days => %(days)s)
        """,
        p,
    ).fetchone() or {}
    signups = _rows(db, """
        select to_char(d, 'YYYY-MM-DD') as day,
               count(pr.id) filter (where pr.role = 'driver') as drivers,
               count(pr.id) filter (where pr.role = 'owner')  as owners
        from generate_series((now() at time zone 'Asia/Kolkata')::date - (%(days)s - 1), (now() at time zone 'Asia/Kolkata')::date, interval '1 day') d
        left join public.profiles pr
          on (pr.created_at at time zone 'Asia/Kolkata')::date = d::date
         and pr.tenant_id = %(t)s and not pr.is_test and pr.role in ('driver', 'owner')
        group by d order by d
        """, p)
    platforms = _rows(db, """
        select coalesce(platform, 'unknown') as platform, count(distinct anon_id) as devices
        from public.events
        where tenant_id = %(t)s and not is_test and ts > now() - make_interval(days => %(days)s)
        group by 1 order by 2 desc
        """, p)
    installs = db.execute(
        """
        select count(distinct anon_id) filter (where standalone) as pwa,
               count(distinct anon_id) filter (where platform = 'android_app') as apk,
               count(distinct anon_id) as devices
        from public.events where tenant_id = %(t)s and not is_test and ts > now() - make_interval(days => %(days)s)
        """,
        p,
    ).fetchone() or {}
    funnel = db.execute(
        """
        select count(distinct anon_id) filter (where name = 'app_open')             as opened,
               count(distinct anon_id) filter (where name = 'otp_requested')        as otp_requested,
               count(distinct anon_id) filter (where name = 'otp_verified')         as logged_in,
               count(distinct anon_id) filter (where name = 'signup_profile_basic') as profile_basic,
               count(distinct anon_id) filter (where name in ('tap_call', 'tap_whatsapp', 'interest_sent', 'post_created')) as took_action
        from public.events where tenant_id = %(t)s and not is_test and ts > now() - make_interval(days => %(days)s)
        """,
        p,
    ).fetchone() or {}
    time_spent = db.execute(
        """
        select coalesce(round(avg(secs) / 60.0, 1), 0) as avg_minutes, count(*) as sessions
        from (select session_id, extract(epoch from max(ts) - min(ts)) as secs
              from public.events where tenant_id = %(t)s and not is_test and ts > now() - make_interval(days => %(days)s)
              group by session_id having count(*) > 1) s
        where secs between 5 and 4 * 3600
        """,
        p,
    ).fetchone() or {}
    cities = _rows(db, """
        select district, state, count(*) filter (where role = 'driver') as drivers, count(*) filter (where role = 'owner') as owners
        from public.profiles
        where tenant_id = %(t)s and not is_test and role in ('driver', 'owner') and district is not null
        group by district, state order by count(*) desc limit 10
        """, p)
    queue = db.execute(
        """
        select (select count(*) from public.posts where tenant_id = %(t)s and status = 'under_check') +
               (select count(*) from public.profiles where tenant_id = %(t)s and check_flags <> '[]'::jsonb and not blocked) +
               (select count(*) from public.reports where tenant_id = %(t)s and status = 'open') as n
        """,
        p,
    ).fetchone() or {}
    num = lambda r: {k: (float(v) if hasattr(v, "is_integer") and not isinstance(v, int) else v) for k, v in dict(r).items()}
    return {
        "days": days,
        "users": num(totals) | {"drivers_listed": listed.get("n", 0)},
        "posts": num(posts),
        "interests": interests.get("n", 0),
        "contacts": num(calls),
        "signups": signups,
        "platforms": platforms,
        "installs": num(installs),
        "funnel": num(funnel),
        "time": num(time_spent),
        "cities": cities,
        "queue": queue.get("n", 0),
    }


@router.get("/queue")
def queue(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    """Only what needs a human: posts under check, profiles with automatic-check flags, open reports."""
    t = ctx["tenant"]
    posts = _rows(db, """
        select p.id, p.check_flags, p.savings_monthly, p.base_cities, p.created_at,
               o.id as owner_id, o.name as owner_name, o.business_name, o.phone as owner_phone, o.district, o.state,
               (select coalesce(sum(drivers_needed), 0) from public.post_groups where post_id = p.id) as drivers_needed
        from public.posts p join public.profiles o on o.id = p.owner_id
        where p.tenant_id = %s and p.status = 'under_check'
        order by p.created_at
        """, (t,))
    profiles = _rows(db, """
        select id, name, business_name, phone, role, district, state, check_flags, created_at
        from public.profiles
        where tenant_id = %s and check_flags <> '[]'::jsonb and not blocked
        order by created_at
        """, (t,))
    reports = _rows(db, """
        select r.id, r.target_type, r.target_id, r.reason, r.note, r.created_at, rp.name as reporter_name
        from public.reports r left join public.profiles rp on rp.id = r.reporter_id
        where r.tenant_id = %s and r.status = 'open' order by r.created_at
        """, (t,))
    for lst in (posts, profiles, reports):
        for r in lst:
            for k, v in list(r.items()):
                if k.endswith("id") and v is not None:
                    r[k] = str(v)
                elif k == "created_at":
                    r[k] = v.isoformat()
    return {"posts": posts, "profiles": profiles, "reports": reports}


class Review(BaseModel):
    action: Literal["approve", "reject"]
    note: Optional[str] = Field(default=None, max_length=300)


@router.post("/posts/{post_id}/review")
def review_post(post_id: str, body: Review, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    new = "live" if body.action == "approve" else "closed"
    row = db.execute(
        "update public.posts set status = %s, check_flags = case when %s = 'live' then '[]'::jsonb else check_flags end, "
        "expires_at = case when %s = 'live' then now() + interval '30 days' else expires_at end "
        "where id = %s and tenant_id = %s and status = 'under_check' returning id",
        (new, new, new, post_id, ctx["tenant"]),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Post not in the check queue")
    _audit(db, ctx, f"{body.action}_post", "post", post_id, body.note)
    return {"id": post_id, "status": new}


class ProfileReview(BaseModel):
    action: Literal["clear", "block"]
    note: Optional[str] = Field(default=None, max_length=300)


@router.post("/profiles/{profile_id}/review")
def review_profile(profile_id: str, body: ProfileReview, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    if body.action == "clear":
        sql = "update public.profiles set check_flags = '[]'::jsonb where id = %s and tenant_id = %s and role in ('driver','owner') returning id"
    else:
        sql = "update public.profiles set blocked = true where id = %s and tenant_id = %s and role in ('driver','owner') returning id"
    if not db.execute(sql, (profile_id, ctx["tenant"])).fetchone():
        raise HTTPException(404, "Profile not found")
    _audit(db, ctx, "clear_profile" if body.action == "clear" else "block", "profile", profile_id, body.note)
    return {"id": profile_id, "action": body.action}


@router.get("/users")
def users(
    q: str = Query("", max_length=60),
    role: Optional[Literal["driver", "owner"]] = None,
    flag: Optional[Literal["blocked", "verified", "test"]] = None,
    offset: int = Query(0, ge=0, le=100000),
    ctx: dict = Depends(admin_ctx),
    db=Depends(get_db),
):
    digits = "".join(ch for ch in q if ch.isdigit())
    rows = _rows(db, """
        select id, name, business_name, phone, role, district, state, verified, blocked, is_test, setup_done,
               created_at, last_seen_at,
               (select count(*) from public.posts p where p.owner_id = profiles.id) as posts,
               (select count(*) from public.interests i where i.driver_id = profiles.id) as interests
        from public.profiles
        where tenant_id = %(t)s and role in ('driver', 'owner')
          and (%(role)s::text is null or role::text = %(role)s)
          and (%(flag)s::text is null or (%(flag)s = 'blocked' and blocked) or (%(flag)s = 'verified' and verified) or (%(flag)s = 'test' and is_test))
          and (%(q)s = '' or name ilike '%%' || %(q)s || '%%' or business_name ilike '%%' || %(q)s || '%%'
               or (%(digits)s <> '' and phone like '%%' || %(digits)s || '%%'))
        order by created_at desc
        limit 50 offset %(offset)s
        """, {"t": ctx["tenant"], "role": role, "flag": flag, "q": q.strip(), "digits": digits, "offset": offset})
    for r in rows:
        r["id"] = str(r["id"])
        r["created_at"] = r["created_at"].isoformat()
        r["last_seen_at"] = r["last_seen_at"].isoformat() if r["last_seen_at"] else None
    return {"items": rows, "has_more": len(rows) == 50}


class UserPatch(BaseModel):
    verified: Optional[bool] = None
    blocked: Optional[bool] = None
    note: Optional[str] = Field(default=None, max_length=300)


@router.patch("/users/{profile_id}")
def patch_user(profile_id: str, body: UserPatch, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    if body.verified is None and body.blocked is None:
        raise HTTPException(422, "Nothing to change")
    row = db.execute(
        "update public.profiles set verified = coalesce(%s, verified), blocked = coalesce(%s, blocked) "
        "where id = %s and tenant_id = %s and role in ('driver','owner') returning verified, blocked",
        (body.verified, body.blocked, profile_id, ctx["tenant"]),
    ).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    if body.verified is not None:
        _audit(db, ctx, "verify" if body.verified else "unverify", "profile", profile_id, body.note)
    if body.blocked is not None:
        _audit(db, ctx, "block" if body.blocked else "unblock", "profile", profile_id, body.note)
    return dict(row)


@router.get("/actions")
def actions(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    """Recent admin actions (audit trail)."""
    rows = _rows(db, """
        select a.action, a.target_type, a.target_id, a.note, a.created_at, p.name as admin_name
        from public.admin_actions a join public.profiles p on p.id = a.admin_id
        where a.tenant_id = %s order by a.created_at desc limit 100
        """, (ctx["tenant"],))
    for r in rows:
        r["target_id"] = str(r["target_id"])
        r["created_at"] = r["created_at"].isoformat()
    return {"items": rows}
