"""Rewards page, Premium (only with points — nobody pays money), "who saw me" (Premium), admin tools.

GET  /me/rewards                    balance, tick ladder, friends, streak, challenges, top inviters, plans, hisaab
POST /me/premium/points {plan}      buy Premium with points
GET  /me/profile-viewers            driver: owners who opened my profile (names = Premium, count = everyone)
GET  /posts/{id}/viewers            owner: drivers who opened my post (names = Premium, count = everyone)
POST /admin/users/{id}/rewards      admin: black tick on/off, give / end Premium, add / take points
GET  /admin/rewards/config          admin: reward settings (+ defaults)
PUT  /admin/rewards/config          admin: save settings (points per action, plans, free Premium, streak, top, challenges)
GET  /admin/rewards/stats           admin: points given / spent, Premium by source, top inviters this month
"""
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from .. import rewards as R
from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id
from .admin import _audit, admin_ctx

router = APIRouter(tags=["rewards"])


def _me(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute(
        "select id, tenant_id, role, blocked, name, phone, points, tick, premium_until, is_test from public.profiles where id = %s",
        (user.id,),
    ).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    if me["role"] not in ("driver", "owner"):
        raise HTTPException(403, {"code": "role"})
    return me


def _iso(v):
    return v.isoformat() if v is not None else None


@router.get("/me/rewards/summary")
def my_rewards_summary(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Small, for the Home screen: points, days in a row, Premium, the cheapest plan."""
    me = _me(db, user, tenant)
    st = R.streak_status(db, tenant, user.id)
    plans = R.plans(db, tenant, me["role"])
    inv = R.config(db, tenant)["earn"].get("referral") or {}
    return {"points": me["points"] or 0, "streak": st["days"], "streak_today": st["today"], "streak_on": st["on"],
            "streak_every": st["every"], "premium": R.is_premium(me["premium_until"]), "premium_until": _iso(me["premium_until"]),
            "plan_points": min((p["points"] for p in plans), default=0), "plan_days": next((p["days"] for p in plans if p["points"] == min(x["points"] for x in plans)), 0) if plans else 0,
            "per_friend": int(inv.get("points") or 0) if inv.get("on", True) else 0}


@router.get("/me/rewards")
def my_rewards(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    role = me["role"]
    ledger = db.execute(
        "select kind, points, ref, note, created_at from public.reward_ledger where user_id = %s order by created_at desc, id desc limit 30",
        (user.id,),
    ).fetchall() or []
    gold_month = db.execute(
        "select 1 as x from public.premium_passes where user_id = %s and source = 'gold' and created_at >= date_trunc('month', now())",
        (user.id,),
    ).fetchone()
    last_pass = db.execute(
        "select source, days from public.premium_passes where user_id = %s and ends_at > now() order by created_at desc limit 1",
        (user.id,),
    ).fetchone()
    cfg = R.config(db, tenant)
    return {
        "role": role,
        "points": me["points"] or 0,
        "tick": me["tick"],
        "premium": R.is_premium(me["premium_until"]),
        "premium_until": _iso(me["premium_until"]),
        "premium_source": (last_pass or {}).get("source") if R.is_premium(me["premium_until"]) else None,
        "gold_free_used": bool(gold_month),
        "gold_days": int(cfg["free"].get("gold_days") or 0),
        "limits": cfg["limits"],
        "ladder": R.ladder(db, user.id, role),
        "earn": R.earn_list(db, tenant, user.id, role),
        "plans": R.plans(db, tenant, role),
        "invite": R.invite_status(db, tenant, user.id),
        "streak": R.streak_status(db, tenant, user.id),
        "challenges": R.challenges_status(db, tenant, user.id, role),
        "leaderboard": R.leaderboard(db, tenant, user.id),
        "ledger": [{"kind": r["kind"], "points": r["points"], "note": r["note"], "at": _iso(r["created_at"])} for r in ledger],
    }


class PlanIn(BaseModel):
    plan: Literal["m1", "m3"]


@router.post("/me/premium/points")
def premium_with_points(body: PlanIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    plan = next((p for p in R.plans(db, tenant, me["role"]) if p["id"] == body.plan), None)
    if not plan:
        raise HTTPException(404, {"code": "no_plan"})
    ref = secrets.token_hex(6)
    if not R.spend(db, tenant, user.id, plan["points"], "premium", ref, f"{body.plan}:{plan['days']}d"):
        raise HTTPException(409, {"code": "not_enough", "need": plan["points"], "have": me["points"] or 0})
    until = R.grant_premium(db, tenant, user.id, plan["days"], "points", body.plan, points=plan["points"])
    return {"premium": True, "premium_until": _iso(until)}


# ---------------------------------------------------------------- who saw me (names = Premium)
@router.get("/me/profile-viewers")
def profile_viewers(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    if me["role"] != "driver":
        raise HTTPException(403, {"code": "role"})
    n = db.execute(
        """select count(distinct viewer_id) filter (where day > current_date - 7) as week,
                  count(distinct viewer_id) filter (where day > current_date - 30) as month
           from public.profile_views where driver_id = %s""",
        (user.id,),
    ).fetchone() or {}
    premium = R.is_premium(me["premium_until"])
    items = []
    if premium:
        rows = db.execute(
            """select o.id, o.name, o.business_name, o.district, o.state, o.photo_url, o.tick, max(v.day) as day
               from public.profile_views v join public.profiles o on o.id = v.viewer_id
               where v.driver_id = %s and v.day > current_date - 30 and not o.blocked
               group by o.id order by max(v.day) desc limit 50""",
            (user.id,),
        ).fetchall() or []
        items = [{"id": str(r["id"]), "name": (r["name"] or "").split(" ")[0] or None, "firm": r["business_name"],
                  "district": r["district"], "state": r["state"], "photo_url": r["photo_url"], "tick": r["tick"],
                  "day": _iso(r["day"])} for r in rows]
    return {"week": n.get("week") or 0, "month": n.get("month") or 0, "premium": premium, "items": items}


@router.get("/posts/{post_id}/viewers")
def post_viewers(post_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    if me["role"] != "owner":
        raise HTTPException(403, {"code": "role"})
    own = db.execute("select 1 as x from public.posts where id = %s and owner_id = %s", (post_id, user.id)).fetchone()
    if not own:
        raise HTTPException(404, "Not found")
    n = db.execute("select count(distinct viewer_id) as n from public.post_views where post_id = %s", (post_id,)).fetchone() or {}
    premium = R.is_premium(me["premium_until"])
    items = []
    if premium:
        rows = db.execute(
            """select d.id, d.name, d.district, d.state, d.photo_url, d.tick, max(v.day) as day,
                      dd.vehicles, dd.experience_years
               from public.post_views v join public.profiles d on d.id = v.viewer_id
               left join public.driver_details dd on dd.profile_id = d.id
               where v.post_id = %s and not d.blocked group by d.id, dd.vehicles, dd.experience_years
               order by max(v.day) desc limit 100""",
            (post_id,),
        ).fetchall() or []
        items = [{"id": str(r["id"]), "name": r["name"], "district": r["district"], "state": r["state"],
                  "photo_url": r["photo_url"], "tick": r["tick"], "day": _iso(r["day"]),
                  "vehicles": r["vehicles"] or [], "experience_years": r["experience_years"]} for r in rows]
    return {"count": n.get("n") or 0, "premium": premium, "items": items}


# ---------------------------------------------------------------- admin
class AdminRewardIn(BaseModel):
    black: Optional[bool] = None
    premium_days: Optional[int] = Field(None, ge=1, le=3650)
    premium_off: Optional[bool] = None
    points: Optional[int] = Field(None, ge=-100000, le=100000)
    note: Optional[str] = Field(None, max_length=200)


@router.post("/admin/users/{profile_id}/rewards")
def admin_rewards(profile_id: str, body: AdminRewardIn, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    who = db.execute(
        "select id, role from public.profiles where id = %s and tenant_id = %s and role in ('driver', 'owner')",
        (profile_id, ctx["tenant"]),
    ).fetchone()
    if not who:
        raise HTTPException(404, "Not found")
    if body.black is not None:
        db.execute("update public.profiles set tick_black = %s where id = %s", (body.black, profile_id))
        _audit(db, ctx, "tick_black_on" if body.black else "tick_black_off", "reward", profile_id, body.note)
        R.refresh_tick(db, ctx["tenant"], profile_id)
    if body.premium_off:
        R.end_premium(db, profile_id)
        _audit(db, ctx, "premium_end", "reward", profile_id, body.note)
    if body.premium_days:
        R.grant_premium(db, ctx["tenant"], profile_id, body.premium_days, "admin", "admin")
        _audit(db, ctx, "premium_give", "reward", profile_id, f"{body.premium_days}d" + (f": {body.note}" if body.note else ""))
    if body.points:
        R.admin_adjust(db, ctx["tenant"], profile_id, body.points, ctx["id"], body.note)
        _audit(db, ctx, "points_adjust", "reward", profile_id, f"{body.points:+d}" + (f": {body.note}" if body.note else ""))
    row = db.execute("select tick, tick_black, points, premium_until from public.profiles where id = %s", (profile_id,)).fetchone()
    return {"tick": row["tick"], "tick_black": row["tick_black"], "points": row["points"],
            "premium": R.is_premium(row["premium_until"]), "premium_until": _iso(row["premium_until"])}


# ---- settings
class EarnRule(BaseModel):
    points: int = Field(ge=0, le=100000)
    cap: Optional[int] = Field(None, ge=1, le=1000)
    on: bool = True


class PlanCfg(BaseModel):
    days: int = Field(ge=0, le=3650)
    points: int = Field(ge=0, le=1000000)


class Challenge(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    title_hi: str = Field(min_length=1, max_length=80)
    title_en: Optional[str] = Field(None, max_length=80)
    kind: str
    target: int = Field(ge=1, le=1000)
    points: int = Field(ge=1, le=100000)
    roles: list[Literal["driver", "owner"]] = Field(default_factory=lambda: ["driver", "owner"])
    start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    on: bool = True


class RewardsConfig(BaseModel):
    earn: dict[str, EarnRule]
    friends: dict
    plans: dict[Literal["driver", "owner"], dict[Literal["m1", "m3"], PlanCfg]]
    free: dict
    limits: dict
    streak: dict
    leaderboard: dict
    challenges: list[Challenge] = Field(default_factory=list, max_length=20)


def _int(v, lo, hi, name):
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise HTTPException(422, {"code": "bad_value", "field": name})
    if not lo <= n <= hi:
        raise HTTPException(422, {"code": "bad_value", "field": name})
    return n


def _clean(c: RewardsConfig) -> dict:
    """Bounds every number; unknown actions are dropped."""
    earn = {k: v.model_dump() for k, v in c.earn.items() if k in R.KINDS}
    ms = []
    for pair in (c.friends.get("milestones") or [])[:6]:
        if isinstance(pair, (list, tuple)) and len(pair) == 2:
            ms.append([_int(pair[0], 1, 10000, "milestone"), _int(pair[1], 1, 100000, "milestone")])
    hist, posts = c.limits.get("history") or [15, 30], c.limits.get("posts") or [10, 25]
    for ch in c.challenges:
        if ch.kind not in R.CHALLENGE_KINDS:
            raise HTTPException(422, {"code": "bad_kind", "field": ch.id})
        if ch.end < ch.start:
            raise HTTPException(422, {"code": "bad_dates", "field": ch.id})
    if len({ch.id for ch in c.challenges}) != len(c.challenges):
        raise HTTPException(422, {"code": "dup_id"})
    return {
        "earn": earn,
        "friends": {"cross_role": _int(c.friends.get("cross_role", 0), 0, 100000, "cross_role"), "milestones": sorted(ms)},
        "plans": {r: {k: v.model_dump() for k, v in p.items()} for r, p in c.plans.items()},
        "free": {"trial_days": _int(c.free.get("trial_days", 0), 0, 365, "trial_days"),
                 "gold_days": _int(c.free.get("gold_days", 0), 0, 365, "gold_days")},
        "limits": {"history": [_int(hist[0], 1, 200, "history"), _int(hist[1], 1, 200, "history")],
                   "posts": [_int(posts[0], 1, 200, "posts"), _int(posts[1], 1, 200, "posts")]},
        "streak": {"on": bool(c.streak.get("on")), "days": _int(c.streak.get("days", 7), 2, 60, "streak_days"),
                   "points": _int(c.streak.get("points", 0), 0, 100000, "streak_points")},
        "leaderboard": {"on": bool(c.leaderboard.get("on")), "top": _int(c.leaderboard.get("top", 3), 1, 20, "top"),
                        "points": _int(c.leaderboard.get("points", 0), 0, 100000, "lb_points"),
                        "premium_days": _int(c.leaderboard.get("premium_days", 0), 0, 365, "lb_days")},
        "challenges": [ch.model_dump() for ch in c.challenges],
    }


@router.get("/admin/rewards/config")
def get_config(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    R.clear_cache(ctx["tenant"])
    return {"config": R.config(db, ctx["tenant"]), "defaults": R.DEFAULTS, "kinds": list(R.KINDS),
            "roles": {k: list(v["roles"]) for k, v in R.KINDS.items()}, "challenge_kinds": R.CHALLENGE_KINDS}


@router.put("/admin/rewards/config")
def put_config(body: RewardsConfig, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    clean = _clean(body)
    db.execute("update public.tenants set rewards_config = %s where id = %s", (Jsonb(clean), ctx["tenant"]))
    _audit(db, ctx, "rewards_config", "reward", None, None)
    R.clear_cache(ctx["tenant"])
    return {"config": R.config(db, ctx["tenant"])}


@router.get("/admin/rewards/stats")
def stats(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    t = ctx["tenant"]
    pts = db.execute(
        """select coalesce(sum(points) filter (where points > 0), 0) as given, coalesce(-sum(points) filter (where points < 0), 0) as spent,
                  count(distinct user_id) filter (where points > 0) as earners
           from public.reward_ledger where tenant_id = %s and created_at > now() - interval '30 days'""",
        (t,),
    ).fetchone() or {}
    prem = db.execute(
        """select x.source, count(*) as n from public.profiles p
             join lateral (select source from public.premium_passes pp where pp.user_id = p.id and pp.ends_at > now()
                           order by pp.created_at desc limit 1) x on true
           where p.tenant_id = %s and p.premium_until > now() group by x.source""",
        (t,),
    ).fetchall() or []
    top = db.execute(
        """select p.id, p.name, p.business_name, p.role, p.district, count(*) as n
           from public.reward_ledger l join public.profiles p on p.id = l.user_id
           where l.tenant_id = %s and l.kind = 'referral' and l.created_at >= date_trunc('month', now())
           group by p.id order by n desc limit 10""",
        (t,),
    ).fetchall() or []
    return {"given_30d": pts.get("given") or 0, "spent_30d": pts.get("spent") or 0, "earners_30d": pts.get("earners") or 0,
            "premium": {r["source"]: r["n"] for r in prem},
            "top_inviters": [{"id": str(r["id"]), "name": r["name"], "business_name": r["business_name"], "role": r["role"],
                              "district": r["district"], "friends": r["n"]} for r in top]}
