"""Sprint 8: how new people find the app, and the small rewards that make users bring others.

* Attribution: the first link a person opened (job share, referral, QR poster, import invite) is sent
  with the first login and saved on the profile (joined_via + joined_code).
* Referral: when someone who joined through your link finishes their profile, you are shown first
  in lists for BOOST_DAYS (owners see you first / drivers see your posts first). No money involved.
* Daily job (Vercel cron): licence renewal reminders and the weekly "owners saw your profile".
"""
import logging
import secrets
from datetime import date

from . import notify, rewards

log = logging.getLogger("vz.growth")
BOOST_DAYS = 7
LICENCE_REMIND_DAYS = (30, 7)
VIAS = {"share", "ref", "poster", "invite"}
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I: easy to read out on the phone


def new_code(n: int = 6) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(n))


def ref_code(db, user_id: str) -> str:
    """The person's own invite code, made the first time it is asked for."""
    row = db.execute("select ref_code from public.profiles where id = %s", (user_id,)).fetchone()
    if row and row.get("ref_code"):
        return row["ref_code"]
    for _ in range(6):
        code = new_code()
        got = db.execute(
            "update public.profiles set ref_code = %s where id = %s and ref_code is null "
            "and not exists (select 1 from public.profiles where ref_code = %s) returning ref_code",
            (code, user_id, code),
        ).fetchone()
        if got:
            return got["ref_code"]
        again = db.execute("select ref_code from public.profiles where id = %s", (user_id,)).fetchone()
        if again and again.get("ref_code"):
            return again["ref_code"]
    raise RuntimeError("could not make a referral code")


def clean_code(code) -> str:
    """Codes are short letters/digits; anything else is ignored."""
    c = "".join(ch for ch in str(code or "") if ch.isalnum())[:16]
    return c


def attribute(db, tenant: str, user_id: str, via: str | None, code: str | None) -> None:
    """Saves where a new profile came from (only once, never overwritten)."""
    via = via if via in VIAS else "direct"
    code = clean_code(code) or None
    referrer = None
    if via == "ref" and code:
        r = db.execute(
            "select id from public.profiles where ref_code = %s and tenant_id = %s and id <> %s and not blocked",
            (code.upper(), tenant, user_id),
        ).fetchone()
        referrer = r["id"] if r else None
        if not referrer:
            via, code = "direct", None
    db.execute(
        "update public.profiles set joined_via = %s, joined_code = %s, referred_by = %s "
        "where id = %s and joined_via is null",
        (via, code, referrer, user_id),
    )


def reward_referrer(db, tenant: str, user_id: str) -> bool:
    """Called when a profile is finished for the first time. Gives the person who invited them the boost."""
    row = db.execute(
        "update public.profiles set ref_rewarded = true "
        "where id = %s and referred_by is not null and not ref_rewarded returning referred_by, name",
        (user_id,),
    ).fetchone()
    if not row:
        return False
    db.execute(
        "update public.profiles set boost_until = greatest(coalesce(boost_until, now()), now()) + make_interval(days => %s) "
        "where id = %s",
        (BOOST_DAYS, row["referred_by"]),
    )
    notify.safe(db, notify.to_user, tenant, str(row["referred_by"]), "referral_joined",
                {"name": (row["name"] or "").split(" ")[0], "days": BOOST_DAYS})
    return True


def my_growth(db, user_id: str) -> dict:
    code = ref_code(db, user_id)
    row = db.execute(
        """
        select p.boost_until,
          (select count(*) from public.profiles r where r.referred_by = p.id) as joined,
          (select count(*) from public.profiles r where r.referred_by = p.id and r.setup_done) as completed,
          (select count(*) from public.profile_views v where v.driver_id = p.id and v.day > current_date - 7) as views_week,
          (select count(*) from public.profile_views v where v.driver_id = p.id) as views_total,
          -- driver listed but has not said "still looking" for 14 days
          (p.role = 'driver' and coalesce(d.is_available, false)
             and coalesce(d.looking_checked_at, d.updated_at, p.created_at) < now() - interval '14 days') as looking_due
        from public.profiles p left join public.driver_details d on d.profile_id = p.id where p.id = %s
        """,
        (user_id,),
    ).fetchone() or {}
    boost = row.get("boost_until")
    return {
        "ref_code": code,
        "joined": int(row.get("joined") or 0),
        "completed": int(row.get("completed") or 0),
        "boost_until": boost.isoformat() if boost else None,
        "boost_days": BOOST_DAYS,
        "views_week": int(row.get("views_week") or 0),
        "views_total": int(row.get("views_total") or 0),
        "looking_due": bool(row.get("looking_due")),
    }


# ---------------------------------------------------------------- daily job
def licence_reminders(db, today: date) -> int:
    """30 and 7 days before the licence expires (once each)."""
    rows = db.execute(
        """
        insert into public.notifications (tenant_id, user_id, kind, data)
        select p.tenant_id, p.id, 'licence_expiry',
               jsonb_build_object('days', (d.licence_expiry - %(today)s::date), 'date', d.licence_expiry::text)
        from public.driver_details d join public.profiles p on p.id = d.profile_id
        where d.licence_expiry - %(today)s::date = any(%(days)s) and not p.blocked
          and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'licence_expiry'
                          and n.created_at > now() - interval '3 days')
        returning user_id, kind, data
        """,
        {"today": today, "days": list(LICENCE_REMIND_DAYS)},
    ).fetchall() or []
    notify._push_for(db, [dict(r) for r in rows])
    return len(rows)


def weekly_views(db) -> int:
    """'N owners saw your profile this week' (sent on Mondays, only if N > 0)."""
    rows = db.execute(
        """
        insert into public.notifications (tenant_id, user_id, kind, data)
        select p.tenant_id, p.id, 'profile_views', jsonb_build_object('n', v.n)
        from (select driver_id, count(distinct viewer_id) as n from public.profile_views
              where day > current_date - 7 group by driver_id) v
        join public.profiles p on p.id = v.driver_id
        where not p.blocked and coalesce((p.notify_prefs->>'interest_seen')::boolean, true)
          and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'profile_views'
                          and n.created_at > now() - interval '6 days')
        returning user_id, kind, data
        """
    ).fetchall() or []
    notify._push_for(db, [dict(r) for r in rows])
    return len(rows)


# ---------------------------------------------------------------- Sprint 10: trust + coming back
_NEAR_POST = """(exists (select 1 from unnest(p.base_cities) c where lower(split_part(c, ',', 1)) = lower(d.district))
                  or (d.location is not null and o.location is not null and extensions.st_dwithin(d.location, o.location, 150000)))"""


def weekly_jobs(db) -> int:
    """Mondays, drivers: 'N new jobs near you this week' (only when N > 0, respects the new-job switch)."""
    rows = db.execute(
        f"""
        insert into public.notifications (tenant_id, user_id, kind, data)
        select d.tenant_id, d.id, 'weekly_jobs', jsonb_build_object('n', count(*))
        from public.profiles d
        join public.posts p on p.tenant_id = d.tenant_id and p.status = 'live' and p.created_at > now() - interval '7 days'
        join public.profiles o on o.id = p.owner_id and not o.blocked and o.is_test = d.is_test
        where d.role = 'driver' and d.setup_done and not d.blocked
          and coalesce((d.notify_prefs->>'new_post')::boolean, true) and {_NEAR_POST}
          and not exists (select 1 from public.notifications n where n.user_id = d.id and n.kind = 'weekly_jobs'
                          and n.created_at > now() - interval '6 days')
        group by d.tenant_id, d.id
        returning user_id, kind, data
        """
    ).fetchall() or []
    notify._push_for(db, [dict(r) for r in rows])
    return len(rows)


def weekly_post_views(db) -> int:
    """Mondays, owners: 'N drivers looked at your post this week'."""
    rows = db.execute(
        """
        insert into public.notifications (tenant_id, user_id, kind, data)
        select o.tenant_id, o.id, 'post_views', jsonb_build_object('n', count(distinct v.viewer_id))
        from public.post_views v join public.posts p on p.id = v.post_id join public.profiles o on o.id = p.owner_id
        where v.day > current_date - 7 and not o.blocked
          and not exists (select 1 from public.notifications n where n.user_id = o.id and n.kind = 'post_views'
                          and n.created_at > now() - interval '6 days')
        group by o.tenant_id, o.id
        returning user_id, kind, data
        """
    ).fetchall() or []
    notify._push_for(db, [dict(r) for r in rows])
    return len(rows)


def come_back(db) -> int:
    """Not opened for 7–30 days: drivers hear about new jobs near them, owners about new drivers in their city
    (counted since their last visit). At most once a week."""
    rows = db.execute(
        f"""
        with quiet as (
          select d.* from public.profiles d
          where d.role in ('driver', 'owner') and d.setup_done and not d.blocked
            and d.last_seen_at between now() - interval '30 days' and now() - interval '7 days'
            and not exists (select 1 from public.notifications n where n.user_id = d.id and n.kind = 'come_back'
                            and n.created_at > now() - interval '7 days')
        ), counts as (
          select d.tenant_id, d.id, (
            case when d.role = 'driver' then
              (select count(*) from public.posts p join public.profiles o on o.id = p.owner_id
                where p.tenant_id = d.tenant_id and p.status = 'live' and p.created_at > d.last_seen_at
                  and not o.blocked and o.is_test = d.is_test and {_NEAR_POST})
            else
              (select count(*) from public.profiles x join public.driver_details xd on xd.profile_id = x.id
                where x.tenant_id = d.tenant_id and x.role = 'driver' and x.setup_done and not x.blocked
                  and x.is_test = d.is_test and xd.is_available and x.created_at > d.last_seen_at
                  and lower(x.district) = lower(d.district))
            end) as n
          from quiet d
        )
        insert into public.notifications (tenant_id, user_id, kind, data)
        select tenant_id, id, 'come_back', jsonb_build_object('n', n) from counts where n > 0
        returning user_id, kind, data
        """
    ).fetchall() or []
    notify._push_for(db, [dict(r) for r in rows])
    return len(rows)


def still_looking(db) -> int:
    """Listed drivers who have not confirmed for 14 days: 'still looking for work?' (every 14 days at most)."""
    rows = db.execute(
        """
        insert into public.notifications (tenant_id, user_id, kind, data)
        select p.tenant_id, p.id, 'still_looking', '{}'::jsonb
        from public.profiles p join public.driver_details d on d.profile_id = p.id
        where p.role = 'driver' and p.setup_done and not p.blocked and d.is_available
          and coalesce(d.looking_checked_at, d.updated_at, p.created_at) < now() - interval '14 days'
          and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'still_looking'
                          and n.created_at > now() - interval '14 days')
        returning user_id, kind, data
        """
    ).fetchall() or []
    notify._push_for(db, [dict(r) for r in rows])
    return len(rows)


def refresh_fast_reply(db) -> int:
    """'Replies fast' badge: in the last 30 days at least 3 interested drivers, and 80%+ of them opened within a day."""
    db.execute(
        """
        with s as (
          select p.owner_id, count(*) as n,
                 count(*) filter (where i.seen_at is not null and i.seen_at - i.created_at <= interval '24 hours') as fast
          from public.interests i join public.posts p on p.id = i.post_id
          where i.created_at between now() - interval '30 days' and now() - interval '1 day'
          group by p.owner_id
        )
        update public.profiles o set fast_reply = coalesce((select s.n >= 3 and s.fast >= 0.8 * s.n from s where s.owner_id = o.id), false)
        where o.role = 'owner' and o.fast_reply is distinct from coalesce((select s.n >= 3 and s.fast >= 0.8 * s.n from s where s.owner_id = o.id), false)
        """
    )
    return 1


def daily(db, today: date) -> dict:
    out = {"licence": notify.safe(db, licence_reminders, today) or 0}
    out["still_looking"] = notify.safe(db, still_looking) or 0
    out["come_back"] = notify.safe(db, come_back) or 0
    notify.safe(db, refresh_fast_reply)
    notify.safe(db, lambda d: d.execute("select public.prune_pin_events()") and 1)   # Sprint 11: old MPIN events
    out["rewards"] = notify.safe(db, rewards.daily, today) or {}
    if today.weekday() == 0:   # Monday
        out["views"] = notify.safe(db, weekly_views) or 0
        out["weekly_jobs"] = notify.safe(db, weekly_jobs) or 0
        out["post_views"] = notify.safe(db, weekly_post_views) or 0
    return out
