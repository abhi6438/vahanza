"""Rewards: अंक (points), ticks and Premium — every number set by the admin (Admin → इनाम सेटिंग).

* Points are earned for useful actions; every change is one row in public.reward_ledger, so a reward is given
  once per thing (unique user + kind + ref). They stay inside the app — nobody pays money, points never turn
  into money. Coupons / cashback from partners will be new ledger kinds later.
* Tick = trust, never bought: gray · blue · gold · black (rule in SQL: public.vz_tick()).
* Premium: only with points, or free (new-user trial, gold / black tick every month, monthly top inviters,
  given by Vahanza from admin).
* Friends: points per friend who completes the profile (more when a driver brings an owner or the other way),
  a welcome bonus for the friend, extra at 3 / 10 / 25 friends, and a monthly top-inviters list per district.
* Streak (open the app N days in a row) and monthly challenges set by the admin.

The settings live in tenants.rewards_config (per brand); DEFAULTS fill anything not set.
Every function here is called through notify.safe() from the routes, so a failure never undoes the user's action.
"""
from __future__ import annotations

import copy
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from . import notify

log = logging.getLogger("vz.rewards")

# Fixed facts about each kind of action (who can earn it, once ever or per thing). Points / caps are in the config.
KINDS: dict[str, dict] = {
    "profile_done":      {"roles": ("driver", "owner"), "once": True},
    "verified":          {"roles": ("driver", "owner"), "once": True},
    "history_add":       {"roles": ("driver",)},
    "history_confirmed": {"roles": ("driver",)},
    "history_answered":  {"roles": ("owner",)},
    "hire_confirmed":    {"roles": ("driver", "owner")},
    "post_live":         {"roles": ("owner",)},
    "rating_given":      {"roles": ("driver", "owner")},
    "referral":          {"roles": ("driver", "owner")},
    "joined_invite":     {"roles": ("driver", "owner"), "once": True},
    "weekly_active":     {"roles": ("driver", "owner")},
    "daily_open":        {"roles": ("driver", "owner")},
}
# Kinds a challenge can count (actions people do).
CHALLENGE_KINDS = ["referral", "history_add", "history_confirmed", "history_answered", "hire_confirmed", "post_live",
                   "rating_given", "daily_open", "verified", "profile_done"]
BIG = {"verified", "history_confirmed", "hire_confirmed", "referral", "referral_bonus", "streak", "challenge", "leaderboard"}
TICK_RANK = {None: 0, "gray": 1, "blue": 2, "gold": 3, "black": 4}

DEFAULTS: dict = {
    "earn": {
        "profile_done":      {"points": 50,  "cap": None, "on": True},
        "verified":          {"points": 100, "cap": None, "on": True},
        "history_add":       {"points": 10,  "cap": 5,    "on": True},
        "history_confirmed": {"points": 100, "cap": None, "on": True},
        "history_answered":  {"points": 30,  "cap": 20,   "on": True},
        "hire_confirmed":    {"points": 100, "cap": None, "on": True},
        "post_live":         {"points": 20,  "cap": 5,    "on": True},
        "rating_given":      {"points": 10,  "cap": 10,   "on": True},
        "referral":          {"points": 100, "cap": 30,   "on": True},     # the biggest earner
        "joined_invite":     {"points": 50,  "cap": None, "on": True},     # the friend who joined by a link
        "weekly_active":     {"points": 20,  "cap": None, "on": True},
        "daily_open":        {"points": 0,   "cap": None, "on": False},    # every day the app is opened (off by default)
    },
    "friends": {"cross_role": 150, "milestones": [[3, 100], [10, 300], [25, 1000]]},
    "plans": {"driver": {"m1": {"days": 30, "points": 500}, "m3": {"days": 90, "points": 1300}},
              "owner":  {"m1": {"days": 30, "points": 800}, "m3": {"days": 90, "points": 2000}}},
    "free": {"trial_days": 7, "gold_days": 30},
    "limits": {"history": [15, 30], "posts": [10, 25]},                      # [free, Premium]
    "streak": {"on": True, "days": 7, "points": 50},
    "leaderboard": {"on": True, "top": 3, "points": 200, "premium_days": 30},
    "challenges": [],   # [{id, title_hi, title_en, kind, target, points, roles, start, end, on}]
}
# kept for older imports / tests: the default plans
PLANS = DEFAULTS["plans"]

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL = 60.0


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        elif v is not None or k not in out:
            out[k] = copy.deepcopy(v)
    return out


def config(db, tenant: str) -> dict:
    """The brand's reward settings (DEFAULTS + what the admin changed). Cached for a minute."""
    hit = _CACHE.get(tenant)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    row = None
    try:
        row = db.execute("select rewards_config from public.tenants where id = %s", (tenant,)).fetchone()
    except Exception as e:  # noqa: BLE001
        log.warning("rewards config read failed: %s", e)
    cfg = _merge(DEFAULTS, (row or {}).get("rewards_config") or {})
    _CACHE[tenant] = (time.monotonic(), cfg)
    return cfg


def clear_cache(tenant: Optional[str] = None) -> None:
    if tenant:
        _CACHE.pop(tenant, None)
    else:
        _CACHE.clear()


def is_premium(until) -> bool:
    return bool(until) and until > datetime.now(timezone.utc)


def premium_of(db, user_id: str) -> bool:
    row = db.execute("select premium_until from public.profiles where id = %s", (user_id,)).fetchone()
    return bool(row) and is_premium(row.get("premium_until"))


def limit(db, tenant: str, what: str, premium: bool) -> int:
    """Free vs Premium limits: history entries, live posts."""
    free, prem = config(db, tenant)["limits"][what]
    return int(prem if premium else free)


def _add(db, tenant: str, user_id: str, kind: str, points: int, ref: str, note: str | None = None) -> int:
    """One ledger row, once per (user, kind, ref); keeps the balance in step. Returns the points given."""
    if points <= 0:
        return 0
    row = db.execute(
        """insert into public.reward_ledger (tenant_id, user_id, kind, points, ref, note) values (%s, %s, %s, %s, %s, %s)
           on conflict (user_id, kind, ref) do nothing returning points""",
        (tenant, user_id, kind, points, ref, note),
    ).fetchone()
    if not row:
        return 0
    db.execute("update public.profiles set points = points + %s where id = %s", (row["points"], user_id))
    if kind in BIG:
        notify.safe(db, notify.to_user, tenant, user_id, "reward", {"what": "points", "kind": kind, "points": row["points"]})
    return row["points"]


# ---------------------------------------------------------------- points
def award(db, tenant: str, user_id: str, kind: str, ref: str = "", *, role: Optional[str] = None, points: Optional[int] = None) -> int:
    """Give the points for `kind` once per (user, kind, ref). Returns the points given (0 = already / capped / off)."""
    meta = KINDS.get(kind)
    if not meta or not user_id:
        return 0
    if role and role not in meta["roles"]:
        return 0
    rule = config(db, tenant)["earn"].get(kind) or {}
    if not rule.get("on", True):
        return 0
    pts = int(points if points is not None else rule.get("points") or 0)
    if pts <= 0:
        return 0
    if rule.get("cap"):
        n = db.execute(
            "select count(*) as n from public.reward_ledger where user_id = %s and kind = %s and created_at > now() - interval '30 days'",
            (user_id, kind),
        ).fetchone()
        if n and n["n"] >= rule["cap"]:
            return 0
    given = _add(db, tenant, user_id, kind, pts, "" if meta.get("once") else str(ref))
    if given:
        check_challenges(db, tenant, user_id, kind)
    return given


def spend(db, tenant: str, user_id: str, points: int, kind: str, ref: str, note: str | None = None) -> bool:
    """Take points (e.g. Premium). False when the balance is too small."""
    row = db.execute(
        "update public.profiles set points = points - %s where id = %s and points >= %s returning points",
        (points, user_id, points),
    ).fetchone()
    if not row:
        return False
    db.execute(
        "insert into public.reward_ledger (tenant_id, user_id, kind, points, ref, note) values (%s, %s, %s, %s, %s, %s)",
        (tenant, user_id, kind, -points, ref, note),
    )
    return True


def admin_adjust(db, tenant: str, user_id: str, points: int, admin_id: str, note: str | None) -> None:
    db.execute(
        "insert into public.reward_ledger (tenant_id, user_id, kind, points, ref, note) values (%s, %s, 'admin', %s, %s, %s)",
        (tenant, user_id, points, f"{admin_id}:{datetime.now(timezone.utc).timestamp():.0f}", note),
    )
    db.execute("update public.profiles set points = greatest(0, points + %s) where id = %s", (points, user_id))


# ---------------------------------------------------------------- tick
def refresh_tick(db, tenant: str, user_id: str) -> Optional[str]:
    """Recompute one person's tick. A step up rings the bell; gold / black also switch on the monthly Premium."""
    if not user_id:
        return None
    row = db.execute(
        """with o as (select tick as old from public.profiles where id = %s)
           update public.profiles p set tick = public.vz_tick(p.id) from o where p.id = %s
           returning p.tick, o.old""",
        (user_id, user_id),
    ).fetchone()
    if not row:
        return None
    new, old = row.get("tick"), row.get("old")
    if TICK_RANK.get(new, 0) > TICK_RANK.get(old, 0):
        notify.safe(db, notify.to_user, tenant, user_id, "reward", {"what": "tick", "tick": new})
        if new in ("gold", "black"):
            grant_gold(db, tenant, user_id)
    return new


# ---------------------------------------------------------------- profile complete, friends
def check_profile(db, tenant: str, user_id: str, role: str) -> None:
    """After a profile save: profile complete → points, the free Premium trial, the friend who invited them + tick."""
    if role == "driver":
        ok = db.execute(
            "select 1 as ok from public.driver_details where profile_id = %s and cardinality(vehicles) > 0 and available_from is not null",
            (user_id,),
        ).fetchone()
    else:
        ok = db.execute("select 1 as ok from public.fleet_groups where owner_id = %s limit 1", (user_id,)).fetchone()
    if ok:
        first = award(db, tenant, user_id, "profile_done", role=role)
        if first:
            notify.safe(db, grant_trial, tenant, user_id)                 # a few days of Premium free
            ref = db.execute(
                "select f.referred_by, i.role as inviter_role from public.profiles f left join public.profiles i on i.id = f.referred_by where f.id = %s",
                (user_id,),
            ).fetchone()
            if ref and ref.get("referred_by"):
                inviter = str(ref["referred_by"])
                award(db, tenant, user_id, "joined_invite")                    # the new friend gets a welcome bonus
                cross = config(db, tenant)["friends"].get("cross_role") or 0
                other = ref.get("inviter_role") and ref.get("inviter_role") != role
                if award(db, tenant, inviter, "referral", user_id, points=cross if (other and cross) else None):
                    referral_milestones(db, tenant, inviter)
    refresh_tick(db, tenant, user_id)


def friends_count(db, user_id: str) -> int:
    row = db.execute("select count(*) as n from public.reward_ledger where user_id = %s and kind = 'referral'", (user_id,)).fetchone()
    return (row or {}).get("n") or 0


def _milestones(cfg: dict) -> list[tuple[int, int]]:
    return sorted((int(a), int(p)) for a, p in (cfg["friends"].get("milestones") or []) if int(a) > 0 and int(p) > 0)


def referral_milestones(db, tenant: str, user_id: str) -> int:
    """Friend marks (3 / 10 / 25 by default) → one-time extra bonus each."""
    n = friends_count(db, user_id)
    given = 0
    for at, pts in _milestones(config(db, tenant)):
        if n < at:
            break
        given += _add(db, tenant, user_id, "referral_bonus", pts, str(at))
    return given


def invite_status(db, tenant: str, user_id: str) -> dict:
    cfg = config(db, tenant)
    n = friends_count(db, user_id)
    ms = _milestones(cfg)
    nxt = next(({"at": at, "points": pts} for at, pts in ms if n < at), None)
    earn = cfg["earn"]
    return {"friends": n, "per_friend": earn["referral"]["points"] if earn["referral"].get("on", True) else 0,
            "cross_role": cfg["friends"].get("cross_role") or 0,
            "friend_gets": earn["joined_invite"]["points"] if earn["joined_invite"].get("on", True) else 0,
            "milestones": [{"at": at, "points": pts, "done": n >= at} for at, pts in ms], "next": nxt}


# ---------------------------------------------------------------- premium
def grant_premium(db, tenant: str, user_id: str, days: int, source: str, plan: str, points: int | None = None) -> Optional[datetime]:
    row = db.execute(
        """update public.profiles set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => %s)
           where id = %s returning premium_until""",
        (days, user_id),
    ).fetchone()
    if not row:
        return None
    db.execute(
        """insert into public.premium_passes (tenant_id, user_id, plan, source, days, points, ends_at)
           values (%s, %s, %s, %s, %s, %s, %s)""",
        (tenant, user_id, plan, source, days, points, row["premium_until"]),
    )
    notify.safe(db, notify.to_user, tenant, user_id, "reward", {"what": "premium", "days": days, "source": source})
    return row["premium_until"]


def end_premium(db, user_id: str) -> None:
    db.execute("update public.profiles set premium_until = now() where id = %s and premium_until > now()", (user_id,))


def grant_trial(db, tenant: str, user_id: str) -> bool:
    """New user: a few days of Premium free, once ever (so they see what points can unlock)."""
    days = int(config(db, tenant)["free"].get("trial_days") or 0)
    if days <= 0:
        return False
    if db.execute("select 1 as x from public.premium_passes where user_id = %s and source = 'trial'", (user_id,)).fetchone():
        return False
    grant_premium(db, tenant, user_id, days, "trial", "trial")
    return True


def grant_gold(db, tenant: str, user_id: str) -> bool:
    """Gold / black tick: Premium days, once per calendar month."""
    days = int(config(db, tenant)["free"].get("gold_days") or 0)
    if days <= 0:
        return False
    done = db.execute(
        "select 1 as x from public.premium_passes where user_id = %s and source = 'gold' and created_at >= date_trunc('month', now())",
        (user_id,),
    ).fetchone()
    if done:
        return False
    grant_premium(db, tenant, user_id, days, "gold", "gold")
    return True


# ---------------------------------------------------------------- streak (open the app N days in a row)
def checkin(db, tenant: str, user_id: str) -> Optional[int]:
    """Called when the app opens (GET /me). Once a day: streak +1 (or back to 1), daily points, bonus every N days."""
    row = db.execute(
        """update public.profiles set
             streak_days = case when streak_last = current_date - 1 then streak_days + 1 else 1 end,
             streak_last = current_date
           where id = %s and role in ('driver', 'owner') and streak_last is distinct from current_date
           returning streak_days, role""",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    today = date.today().isoformat()
    award(db, tenant, user_id, "daily_open", today, role=row["role"])
    s = config(db, tenant)["streak"]
    n, every = int(row["streak_days"] or 0), int(s.get("days") or 0)
    if s.get("on") and every > 0 and n > 0 and n % every == 0:
        _add(db, tenant, user_id, "streak", int(s.get("points") or 0), today)
    return n


def streak_status(db, tenant: str, user_id: str) -> dict:
    s = config(db, tenant)["streak"]
    row = db.execute("select streak_days, streak_last from public.profiles where id = %s", (user_id,)).fetchone() or {}
    last = row.get("streak_last")
    alive = bool(last) and last >= date.today() - timedelta(days=1)
    n = int(row.get("streak_days") or 0) if alive else 0
    every = max(1, int(s.get("days") or 7))
    return {"on": bool(s.get("on")), "days": n, "every": every, "points": int(s.get("points") or 0),
            "today": bool(last) and last == date.today(), "in_cycle": n % every if n % every else (every if n else 0)}


# ---------------------------------------------------------------- monthly challenges (set by the admin)
def _live_challenges(cfg: dict, role: Optional[str] = None) -> list[dict]:
    today = date.today().isoformat()
    out = []
    for c in cfg.get("challenges") or []:
        if not c.get("on", True) or not c.get("id"):
            continue
        if (c.get("start") or "0000") > today or (c.get("end") or "9999") < today:
            continue
        if role and c.get("roles") and role not in c["roles"]:
            continue
        out.append(c)
    return out


def _progress(db, user_id: str, c: dict) -> int:
    row = db.execute(
        """select count(*) as n from public.reward_ledger where user_id = %s and kind = %s
             and created_at >= %s::date and created_at < (%s::date + 1)""",
        (user_id, c.get("kind"), c.get("start") or "2000-01-01", c.get("end") or "2999-12-31"),
    ).fetchone()
    return (row or {}).get("n") or 0


def check_challenges(db, tenant: str, user_id: str, kind: str) -> int:
    cfg = config(db, tenant)
    live = [c for c in _live_challenges(cfg) if c.get("kind") == kind]
    if not live:
        return 0
    role = (db.execute("select role from public.profiles where id = %s", (user_id,)).fetchone() or {}).get("role")
    given = 0
    for c in live:
        if c.get("roles") and role not in c["roles"]:
            continue
        if _progress(db, user_id, c) >= int(c.get("target") or 1):
            given += _add(db, tenant, user_id, "challenge", int(c.get("points") or 0), str(c["id"]), (c.get("title_hi") or "")[:200])
    return given


def challenges_status(db, tenant: str, user_id: str, role: str) -> list[dict]:
    cfg = config(db, tenant)
    out = []
    for c in _live_challenges(cfg, role):
        done = db.execute("select 1 as x from public.reward_ledger where user_id = %s and kind = 'challenge' and ref = %s",
                          (user_id, str(c["id"]))).fetchone()
        out.append({"id": c["id"], "title_hi": c.get("title_hi"), "title_en": c.get("title_en"), "kind": c.get("kind"),
                    "target": int(c.get("target") or 1), "points": int(c.get("points") or 0), "end": c.get("end"),
                    "have": min(_progress(db, user_id, c), int(c.get("target") or 1)), "done": bool(done)})
    return out


# ---------------------------------------------------------------- monthly top inviters (per district)
def leaderboard(db, tenant: str, user_id: str) -> dict:
    cfg = config(db, tenant)["leaderboard"]
    me = db.execute("select district, state from public.profiles where id = %s", (user_id,)).fetchone() or {}
    if not cfg.get("on") or not me.get("district"):
        return {"on": bool(cfg.get("on")), "district": me.get("district"), "state": me.get("state"), "items": [], "me": None,
                "top": int(cfg.get("top") or 3), "points": int(cfg.get("points") or 0), "premium_days": int(cfg.get("premium_days") or 0)}
    rows = db.execute(
        """select p.id, p.name, p.photo_url, p.tick, count(*) as n, min(l.created_at) as first
           from public.reward_ledger l join public.profiles p on p.id = l.user_id
           where l.kind = 'referral' and l.created_at >= date_trunc('month', now()) and p.tenant_id = %s
             and lower(p.district) = lower(%s) and not p.blocked and not p.is_test
           group by p.id order by n desc, first asc limit 10""",
        (tenant, me["district"]),
    ).fetchall() or []

    def short(name: str | None) -> str:
        parts = (name or "").split()
        return (parts[0] + (f" {parts[1][0]}." if len(parts) > 1 else "")) if parts else "—"

    items = [{"rank": i + 1, "name": short(r["name"]), "photo_url": r["photo_url"], "tick": r["tick"], "friends": r["n"],
              "me": str(r["id"]) == str(user_id)} for i, r in enumerate(rows)]
    mine = next((x for x in items if x["me"]), None)
    if not mine:
        n = db.execute(
            "select count(*) as n from public.reward_ledger where user_id = %s and kind = 'referral' and created_at >= date_trunc('month', now())",
            (user_id,),
        ).fetchone()
        mine = {"rank": None, "friends": (n or {}).get("n") or 0}
    return {"on": True, "district": me["district"], "state": me.get("state"), "items": items[: max(3, int(cfg.get("top") or 3))],
            "me": mine, "top": int(cfg.get("top") or 3), "points": int(cfg.get("points") or 0),
            "premium_days": int(cfg.get("premium_days") or 0)}


def leaderboard_prizes(db, month_start: date) -> int:
    """Run on the 1st: last month's top inviters in every district get points + Premium (once per month)."""
    prev_end = month_start
    prev_start = (month_start - timedelta(days=1)).replace(day=1)
    tag = prev_start.strftime("%Y-%m")
    rows = db.execute(
        """select * from (
             select p.tenant_id, p.id, lower(p.district) as d, count(*) as n,
                    row_number() over (partition by p.tenant_id, lower(p.district) order by count(*) desc, min(l.created_at)) as rk
             from public.reward_ledger l join public.profiles p on p.id = l.user_id
             where l.kind = 'referral' and l.created_at >= %s and l.created_at < %s and p.district is not null
               and not p.blocked and not p.is_test
             group by p.tenant_id, p.id, lower(p.district)) x""",
        (prev_start, prev_end),
    ).fetchall() or []
    given = 0
    for r in rows:
        cfg = config(db, r["tenant_id"])["leaderboard"]
        if not cfg.get("on") or r["rk"] > int(cfg.get("top") or 3):
            continue
        uid = str(r["id"])
        if _add(db, r["tenant_id"], uid, "leaderboard", int(cfg.get("points") or 0), tag, f"#{r['rk']}"):
            given += 1
            if int(cfg.get("premium_days") or 0) > 0:
                grant_premium(db, r["tenant_id"], uid, int(cfg["premium_days"]), "prize", "leaderboard")
    return given


# ---------------------------------------------------------------- daily job
def daily(db, today) -> dict:
    """Ticks for everyone, the monthly gold Premium, Monday "active this week", on the 1st the top-inviter prizes."""
    changed = db.execute(
        """update public.profiles set tick = public.vz_tick(id)
           where role in ('driver', 'owner') and tick is distinct from public.vz_tick(id) returning id""",
    ).fetchall() or []
    gold = db.execute(
        """select id, tenant_id from public.profiles p where tick in ('gold', 'black') and not blocked
             and not exists (select 1 from public.premium_passes x where x.user_id = p.id and x.source = 'gold'
                              and x.created_at >= date_trunc('month', now()))""",
    ).fetchall() or []
    for r in gold:
        notify.safe(db, grant_gold, r["tenant_id"], str(r["id"]))
    weekly = 0
    if today.weekday() == 0:
        week = f"{today.isocalendar()[0]}-W{today.isocalendar()[1]:02d}"
        people = db.execute(
            """select id, tenant_id, role from public.profiles
               where role in ('driver', 'owner') and setup_done and not blocked and last_seen_at > now() - interval '7 days'""",
        ).fetchall() or []
        for p in people:
            if award(db, p["tenant_id"], str(p["id"]), "weekly_active", week, role=p["role"]):
                weekly += 1
    prizes = notify.safe(db, leaderboard_prizes, today.replace(day=1)) or 0 if today.day == 1 else 0
    return {"ticks": len(changed), "gold": len(gold), "weekly": weekly, "prizes": prizes}


# ---------------------------------------------------------------- the user's own page
def ladder(db, user_id: str, role: str) -> list[dict]:
    """The four ticks with what each needs and what is already done (the Rewards page shows the next step)."""
    p = db.execute(
        """select p.verified, p.setup_done, p.rating_avg, p.jobs_done, p.fast_reply, p.tick, p.tick_black,
                  (select count(*) from public.work_history wh where wh.driver_id = p.id and wh.status in ('confirmed', 'admin_ok')) as confirmed,
                  exists (select 1 from public.driver_details d where d.profile_id = p.id and cardinality(d.vehicles) > 0 and d.available_from is not null) as drv_ok,
                  exists (select 1 from public.fleet_groups f where f.owner_id = p.id) as own_ok
           from public.profiles p where p.id = %s""",
        (user_id,),
    ).fetchone() or {}
    rating = float(p.get("rating_avg") or 0)
    complete = bool(p.get("setup_done")) and bool(p.get("drv_ok") if role == "driver" else p.get("own_ok"))
    verified = bool(p.get("verified"))
    if role == "driver":
        gold = [{"key": "verified", "done": verified},
                {"key": "history2", "done": (p.get("confirmed") or 0) >= 2, "have": p.get("confirmed") or 0, "need": 2},
                {"key": "rating4", "done": rating >= 4, "have": round(rating, 1)}]
    else:
        gold = [{"key": "verified", "done": verified},
                {"key": "hires3", "done": (p.get("jobs_done") or 0) >= 3, "have": p.get("jobs_done") or 0, "need": 3},
                {"key": "fastOrRating", "done": bool(p.get("fast_reply")) or rating >= 4}]
    return [
        {"tick": "gray", "steps": [{"key": "profile", "done": complete}]},
        {"tick": "blue", "steps": [{"key": "verify", "done": verified}]},
        {"tick": "gold", "steps": gold},
        {"tick": "black", "steps": [{"key": "chosen", "done": bool(p.get("tick_black"))}]},
    ]


def earn_list(db, tenant: str, user_id: str, role: str) -> list[dict]:
    rows = db.execute(
        """select kind, count(*) filter (where created_at > now() - interval '30 days') as month, count(*) as total
           from public.reward_ledger where user_id = %s group by kind""",
        (user_id,),
    ).fetchall() or []
    got = {r["kind"]: r for r in rows}
    earn = config(db, tenant)["earn"]
    out = []
    for kind, meta in KINDS.items():
        rule = earn.get(kind) or {}
        if role not in meta["roles"] or kind == "joined_invite" or not rule.get("on", True) or not rule.get("points"):
            continue
        g = got.get(kind) or {}
        out.append({"kind": kind, "points": int(rule["points"]), "once": bool(meta.get("once")), "cap": rule.get("cap"),
                    "done": bool(g.get("total")) if meta.get("once") else False, "month": g.get("month") or 0})
    return out


def plans(db, tenant: str, role: str) -> list[dict]:
    return [{"id": k, "days": int(v["days"]), "points": int(v["points"])}
            for k, v in config(db, tenant)["plans"][role].items() if int(v.get("days") or 0) > 0 and int(v.get("points") or 0) > 0]
