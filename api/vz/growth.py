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

from . import notify

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
          (select count(*) from public.profile_views v where v.driver_id = p.id) as views_total
        from public.profiles p where p.id = %s
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


def daily(db, today: date) -> dict:
    out = {"licence": notify.safe(db, licence_reminders, today) or 0}
    if today.weekday() == 0:   # Monday
        out["views"] = notify.safe(db, weekly_views) or 0
    return out
