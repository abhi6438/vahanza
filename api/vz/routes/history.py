"""Driver work history ("काम का अनुभव") and the owner's confirmation.

Driver:  GET/POST /me/history · PATCH/DELETE /me/history/{id} · POST /me/history/{id}/remind
         GET /history/owners?q=   (find an owner on the app by firm / name — never their number)
Owner:   GET /me/history-requests · POST /history/{id}/answer   (yes / no / dates + stars + "hire again?")
No login: GET/POST /public/history/{token}   (owner not on the app: one-tap link from WhatsApp / SMS)
Viewers: GET /drivers/{id}/history (owners) — visible entries only; the owner's phone is never returned.
Admin:   GET /admin/history · POST /admin/history/{id}/check

Status: pending → confirmed (owner said yes / job from the app) · owner_fixed (owner: dates differ and
picked the right months himself — Vahanza approves, the driver does nothing) · needs_fix (old rows only) · disputed (owner: not true — hidden, admin looks) · admin_ok / admin_rejected.
"""
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from .. import notify
from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id
from ..importer import clean_phone
from .admin import _audit, admin_ctx
from .trust import DRIVER_TAGS

router = APIRouter(tags=["history"])

VEHICLES = ("truck", "trailer", "bus", "car", "jcb", "tractor", "auto", "pickup")
MAX_ENTRIES = 15
MAX_INVITES_PER_ENTRY = 3
REMIND_GAP = timedelta(days=3)
PHONE_WEEKLY_CAP = 3            # messages to one owner number per week, from all drivers together
TOKEN_DAYS = 30
VISIBLE = ("pending", "confirmed", "needs_fix", "owner_fixed", "admin_ok")
CONFIRMED = ("confirmed", "admin_ok")

ENTRY_COLS = """
  h.id, h.owner_id, h.owner_name, h.firm_name, h.owner_district, h.owner_state, h.vehicle, h.wheels,
  h.start_month, h.end_month, h.work_type, h.area, h.note, h.source, h.status, h.owner_answer, h.owner_stars,
  h.owner_tags, h.rehire, h.owner_start_month, h.owner_end_month, h.invite_count, h.invited_at, h.answered_at, h.hidden, h.created_at, h.owner_phone,
  o.name as app_owner_name, o.business_name as app_firm, o.district as app_district, o.state as app_state,
  o.verified as owner_verified
"""


def _iso(v):
    return v.isoformat() if v is not None else None


def _entry(r: dict, *, mine: bool = False) -> dict:
    """One entry for the app. The owner's phone never leaves the server."""
    on_app = r.get("owner_id") is not None
    out = {
        "id": str(r["id"]),
        "owner_on_app": on_app,
        "owner_name": (r.get("app_owner_name") if on_app else r.get("owner_name")) or None,
        "firm_name": (r.get("app_firm") if on_app else r.get("firm_name")) or None,
        "district": (r.get("app_district") if on_app else r.get("owner_district")) or None,
        "state": (r.get("app_state") if on_app else r.get("owner_state")) or None,
        "owner_verified": bool(r.get("owner_verified")) if on_app else False,
        "vehicle": r["vehicle"], "wheels": r.get("wheels"),
        "start_month": _iso(r["start_month"]), "end_month": _iso(r.get("end_month")),
        "work_type": r.get("work_type"), "area": r.get("area"),
        "source": r.get("source") or "driver",
        "status": r["status"],
        "owner_stars": r.get("owner_stars"), "owner_tags": r.get("owner_tags") or [], "rehire": r.get("rehire"),
    }
    if r["status"] == "owner_fixed" or r.get("owner_answer") == "dates":
        out |= {"owner_start_month": _iso(r.get("owner_start_month")), "owner_end_month": _iso(r.get("owner_end_month"))}
    if mine:
        out |= {"note": r.get("note"), "hidden": bool(r.get("hidden")), "invite_count": r.get("invite_count") or 0,
                "invited_at": _iso(r.get("invited_at")), "answered_at": _iso(r.get("answered_at")),
                "owner_answer": r.get("owner_answer"),
                # the driver's own entry: what they typed, to edit it (still never shown to anyone else)
                "owner_id": str(r["owner_id"]) if r.get("owner_id") else None,
                "owner_phone": (r.get("owner_phone") or "")[2:] or None,
                "typed_owner_name": r.get("owner_name"), "typed_firm_name": r.get("firm_name")}
    return out


def months(start: date, end: Optional[date]) -> int:
    e = end or date.today().replace(day=1)
    return max(1, (e.year - start.year) * 12 + (e.month - start.month) + 1)


def summary(entries: list[dict]) -> dict:
    """Counts shown on cards: entries, confirmed by owners, confirmed years, 'would hire again'."""
    conf = [e for e in entries if e["status"] in CONFIRMED]
    # months worked, counting overlapping jobs once (two jobs at the same time are not double experience)
    today = date.today().replace(day=1)
    seen: set[tuple[int, int]] = set()
    for e in conf:
        a = date.fromisoformat(e["start_month"])
        b = date.fromisoformat(e["end_month"]) if e["end_month"] else today
        y, mo = a.year, a.month
        while (y, mo) <= (b.year, b.month) and len(seen) < 1200:
            seen.add((y, mo))
            y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    m = len(seen)
    return {"count": len(entries), "confirmed": len(conf), "confirmed_years": round(m / 12, 1),
            "rehire": sum(1 for e in conf if e.get("rehire"))}


def _me(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute(
        "select id, tenant_id, role, blocked, name, business_name, phone, is_test from public.profiles where id = %s", (user.id,)
    ).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    return me


def _month(s: str) -> date:
    try:
        y, m = s[:7].split("-")
        d = date(int(y), int(m), 1)
    except (ValueError, AttributeError):
        raise HTTPException(422, {"code": "bad_month"})
    if d.year < 1970 or d > date.today().replace(day=1):
        raise HTTPException(422, {"code": "bad_month"})
    return d


# ---------------------------------------------------------------- driver: own history
class EntryIn(BaseModel):
    owner_id: Optional[str] = None                     # picked from the app's owners
    owner_name: Optional[str] = Field(None, max_length=60)
    firm_name: Optional[str] = Field(None, max_length=80)
    owner_place: Optional[str] = Field(None, max_length=90)     # "Rewa, Madhya Pradesh"
    owner_phone: Optional[str] = Field(None, max_length=20)
    vehicle: Literal["truck", "trailer", "bus", "car", "jcb", "tractor", "auto", "pickup"]
    wheels: Optional[int] = Field(None, ge=4, le=30)
    start_month: str = Field(max_length=10)            # YYYY-MM
    end_month: Optional[str] = Field(None, max_length=10)       # null = still there
    work_type: Optional[Literal["full", "day", "trip"]] = None
    area: Optional[Literal["local", "dist", "state", "india"]] = None
    note: Optional[str] = Field(None, max_length=200)

    @model_validator(mode="after")
    def _who(self):
        if not self.owner_id and not ((self.owner_name or "").strip() or (self.firm_name or "").strip()):
            raise ValueError("owner")
        return self


def _clean_entry(db, body: EntryIn, me: dict, tenant: str) -> dict:
    start = _month(body.start_month)
    end = _month(body.end_month) if body.end_month else None
    if end and end < start:
        raise HTTPException(422, {"code": "bad_dates"})
    v = {"vehicle": body.vehicle, "wheels": body.wheels, "start_month": start, "end_month": end,
         "work_type": body.work_type, "area": body.area, "note": (body.note or "").strip() or None,
         "owner_id": None, "owner_name": None, "firm_name": None, "owner_district": None, "owner_state": None, "owner_phone": None}
    if body.owner_id:
        o = db.execute(
            "select id from public.profiles where id = %s and tenant_id = %s and role = 'owner' and not blocked and is_test = %s",
            (body.owner_id, tenant, me["is_test"]),
        ).fetchone()
        if not o:
            raise HTTPException(422, {"code": "owner_not_found"})
        v["owner_id"] = str(o["id"])
        return v
    phone, _ = clean_phone(body.owner_phone) if body.owner_phone else (None, False)
    if body.owner_phone and not phone:
        raise HTTPException(422, {"code": "bad_phone"})
    if phone:
        if phone == me["phone"]:
            raise HTTPException(422, {"code": "own_phone"})
        other = db.execute("select role, id from public.profiles where phone = %s and tenant_id = %s", (phone, tenant)).fetchone()
        if other and other["role"] == "driver":
            raise HTTPException(422, {"code": "driver_phone"})       # a friend's number is not an owner
        if other and other["role"] == "owner":
            v["owner_id"] = str(other["id"])                        # that owner is on the app: ask them there
    place = (body.owner_place or "").strip()
    d, _, st = place.partition(",")
    v |= {"owner_name": (body.owner_name or "").strip() or None, "firm_name": (body.firm_name or "").strip() or None,
          "owner_district": d.strip() or None, "owner_state": st.strip() or None, "owner_phone": phone}
    return v


@router.get("/me/history")
def my_history(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    if me["role"] != "driver":
        raise HTTPException(403, "Drivers only")
    rows = db.execute(
        f"select {ENTRY_COLS} from public.work_history h left join public.profiles o on o.id = h.owner_id "
        "where h.driver_id = %s order by coalesce(h.end_month, current_date) desc, h.start_month desc",
        (user.id,),
    ).fetchall() or []
    items = [_entry(dict(r), mine=True) for r in rows]
    shown = [e for e in items if not e["hidden"] and e["status"] in VISIBLE]
    return {"items": items, "summary": summary(shown), "max": MAX_ENTRIES}


def _phone_capped(db, phone: Optional[str]) -> bool:
    if not phone:
        return False
    n = db.execute(
        "select coalesce(sum(invite_count), 0) as n from public.work_history where owner_phone = %s and invited_at > now() - interval '7 days'",
        (phone,),
    ).fetchone()
    return bool(n and n["n"] >= PHONE_WEEKLY_CAP)


def _ask_owner(db, tenant: str, me: dict, entry_id: str, owner_id: Optional[str], phone: Optional[str]) -> dict:
    """Ask the owner to confirm. On the app: bell + push. Not on the app: a link the driver sends on
    WhatsApp (SMS once DLT is live). Returns what the app shows the driver next."""
    token = secrets.token_urlsafe(12)
    capped = _phone_capped(db, phone) if not owner_id else False
    db.execute(
        """update public.work_history set answer_token = %s, token_expires_at = now() + make_interval(days => %s),
                  invite_count = invite_count + %s, invited_at = case when %s then now() else invited_at end
           where id = %s""",
        (token, TOKEN_DAYS, 0 if capped else 1, not capped, entry_id),
    )
    first = (me.get("name") or "").split(" ")[0]
    if owner_id:
        notify.safe(db, notify.to_user, tenant, owner_id, "history_request", {"driver": first, "id": entry_id})
        return {"sent": "app"}
    return {"sent": "link" if not capped else "capped", "token": token, "phone": phone}


@router.post("/me/history", status_code=201)
def add_entry(body: EntryIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    if me["role"] != "driver":
        raise HTTPException(403, "Drivers only")
    n = db.execute("select count(*) as n from public.work_history where driver_id = %s", (user.id,)).fetchone()
    if n and n["n"] >= MAX_ENTRIES:
        raise HTTPException(422, {"code": "too_many"})
    v = _clean_entry(db, body, me, tenant)
    row = db.execute(
        """insert into public.work_history (tenant_id, driver_id, owner_id, owner_name, firm_name, owner_district, owner_state,
                  owner_phone, vehicle, wheels, start_month, end_month, work_type, area, note)
           values (%(t)s, %(d)s, %(owner_id)s, %(owner_name)s, %(firm_name)s, %(owner_district)s, %(owner_state)s,
                  %(owner_phone)s, %(vehicle)s, %(wheels)s, %(start_month)s, %(end_month)s, %(work_type)s, %(area)s, %(note)s)
           returning id""",
        v | {"t": tenant, "d": user.id},
    ).fetchone()
    eid = str(row["id"])
    ask = _ask_owner(db, tenant, me, eid, v["owner_id"], v["owner_phone"]) if (v["owner_id"] or v["owner_phone"]) else {"sent": "none"}
    return {"id": eid, "status": "pending"} | ask


@router.patch("/me/history/{entry_id}")
def edit_entry(entry_id: str, body: EntryIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Fix an entry (e.g. the owner said the dates differ). Confirmed entries can't be changed — only hidden."""
    me = _me(db, user, tenant)
    cur = db.execute("select id, status from public.work_history where id = %s and driver_id = %s", (entry_id, user.id)).fetchone()
    if not cur:
        raise HTTPException(404, "Not found")
    if cur["status"] in ("confirmed", "admin_ok", "admin_rejected", "owner_fixed"):
        raise HTTPException(409, {"code": "locked"})
    v = _clean_entry(db, body, me, tenant)
    db.execute(
        """update public.work_history set owner_id = %(owner_id)s, owner_name = %(owner_name)s, firm_name = %(firm_name)s,
                  owner_district = %(owner_district)s, owner_state = %(owner_state)s, owner_phone = %(owner_phone)s,
                  vehicle = %(vehicle)s, wheels = %(wheels)s, start_month = %(start_month)s, end_month = %(end_month)s,
                  work_type = %(work_type)s, area = %(area)s, note = %(note)s, status = 'pending', owner_answer = null
           where id = %(id)s""",
        v | {"id": entry_id},
    )
    ask = _ask_owner(db, tenant, me, entry_id, v["owner_id"], v["owner_phone"]) if (v["owner_id"] or v["owner_phone"]) else {"sent": "none"}
    return {"id": entry_id, "status": "pending"} | ask


class HideIn(BaseModel):
    hidden: bool


@router.post("/me/history/{entry_id}/hide")
def hide_entry(entry_id: str, body: HideIn, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    row = db.execute("update public.work_history set hidden = %s where id = %s and driver_id = %s returning id",
                     (body.hidden, entry_id, user.id)).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return {"id": entry_id, "hidden": body.hidden}


@router.delete("/me/history/{entry_id}", status_code=204)
def delete_entry(entry_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    db.execute("delete from public.work_history where id = %s and driver_id = %s and source = 'driver'", (entry_id, user.id))


@router.post("/me/history/{entry_id}/remind")
def remind(entry_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Ask the owner again (at most 3 times, 3 days apart)."""
    me = _me(db, user, tenant)
    row = db.execute(
        "select id, owner_id, owner_phone, invite_count, invited_at, status from public.work_history where id = %s and driver_id = %s",
        (entry_id, user.id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    if row["status"] not in ("pending",) or not (row["owner_id"] or row["owner_phone"]):
        raise HTTPException(409, {"code": "nothing_to_remind"})
    if row["invite_count"] >= MAX_INVITES_PER_ENTRY:
        raise HTTPException(429, {"code": "remind_limit"})
    if row["invited_at"] and datetime.now(timezone.utc) - row["invited_at"] < REMIND_GAP:
        raise HTTPException(429, {"code": "remind_soon", "next": _iso(row["invited_at"] + REMIND_GAP)})
    return {"id": entry_id} | _ask_owner(db, tenant, me, entry_id, str(row["owner_id"]) if row["owner_id"] else None, row["owner_phone"])


@router.get("/history/owners")
def find_owners(q: str = Query("", max_length=40), user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Owners on the app, for the driver's picker. Empty search: owners this driver was in touch with.
    Firm / name + place only — never a phone number."""
    me = _me(db, user, tenant)
    s = q.strip().lower()
    if not s:
        rows = db.execute(
            """select distinct o.id, o.name, o.business_name, o.district, o.state, o.verified from public.profiles o
               where o.tenant_id = %(t)s and o.role = 'owner' and not o.blocked and o.is_test = %(test)s and (
                 exists (select 1 from public.hires h where h.owner_id = o.id and h.driver_id = %(me)s::uuid)
                 or exists (select 1 from public.interests i join public.posts p on p.id = i.post_id where p.owner_id = o.id and i.driver_id = %(me)s::uuid)
                 or exists (select 1 from public.events e join public.posts p on p.id::text = e.props->>'post_id'
                            where e.user_id = %(me)s::uuid and e.name = 'contact_reveal' and p.owner_id = o.id))
               limit 8""",
            {"t": tenant, "test": me["is_test"], "me": user.id},
        ).fetchall() or []
    elif len(s) < 2 or s.isdigit():
        rows = []                                       # no number search: owners can't be found by phone
    else:
        rows = db.execute(
            """select o.id, o.name, o.business_name, o.district, o.state, o.verified from public.profiles o
               where o.tenant_id = %(t)s and o.role = 'owner' and not o.blocked and o.is_test = %(test)s and o.setup_done
                 and (lower(o.business_name) like %(p)s or lower(o.name) like %(p)s or lower(o.business_name) like %(w)s or lower(o.name) like %(w)s)
               order by (lower(coalesce(o.business_name, o.name)) like %(p)s) desc, o.verified desc, o.business_name nulls last
               limit 8""",
            {"t": tenant, "test": me["is_test"], "p": s + "%", "w": "% " + s + "%"},
        ).fetchall() or []
    return {"items": [{"id": str(r["id"]), "name": r["name"], "firm_name": r["business_name"], "district": r["district"],
                       "state": r["state"], "verified": r["verified"]} for r in rows]}


# ---------------------------------------------------------------- owner: confirm
class AnswerIn(BaseModel):
    answer: Literal["yes", "no", "dates"]
    stars: Optional[int] = Field(None, ge=1, le=5)
    tags: list[str] = Field(default_factory=list, max_length=5)
    rehire: Optional[bool] = None
    # answer = "dates": the owner's own months (YYYY-MM); end_month null = still working with him
    start_month: Optional[str] = Field(None, max_length=10)
    end_month: Optional[str] = Field(None, max_length=10)


def _apply_answer(db, tenant: str, entry: dict, body: AnswerIn, rater_id: Optional[str]) -> dict:
    """yes → confirmed · no → disputed (admin looks) · dates → the owner's months go to Vahanza for approval.
    If the owner's months turn out the same as the driver's, it simply counts as yes."""
    answer, fix_start, fix_end = body.answer, None, None
    if answer == "dates":
        if not body.start_month:
            raise HTTPException(422, {"code": "bad_month"})
        fix_start = _month(body.start_month)
        fix_end = _month(body.end_month) if body.end_month else None
        if fix_end and fix_end < fix_start:
            raise HTTPException(422, {"code": "bad_dates"})
        if fix_start == entry.get("start_month") and fix_end == entry.get("end_month"):
            answer, fix_start, fix_end = "yes", None, None
    worked = answer in ("yes", "dates")              # the owner says the driver did work for him
    tags = [t for t in dict.fromkeys(body.tags) if t in DRIVER_TAGS] if worked else []
    status = {"yes": "confirmed", "no": "disputed", "dates": "owner_fixed"}[answer]
    db.execute(
        """update public.work_history set status = %s, owner_answer = %s, owner_stars = %s, owner_tags = %s, rehire = %s,
                  owner_start_month = %s, owner_end_month = %s, answered_at = now(), answer_token = null where id = %s""",
        (status, answer, body.stars if worked else None, tags, body.rehire if worked else None, fix_start, fix_end, entry["id"]),
    )
    # an owner on the app: the stars also count in the driver's rating ("✓ worked together")
    if rater_id and worked and body.stars:
        db.execute(
            """insert into public.ratings (rater_id, ratee_id, tenant_id, stars, tags, worked) values (%s, %s, %s, %s, %s, true)
               on conflict (rater_id, ratee_id) do update set stars = excluded.stars, tags = excluded.tags, worked = true""",
            (rater_id, str(entry["driver_id"]), tenant, body.stars, tags),
        )
    notify.safe(db, notify.to_user, tenant, str(entry["driver_id"]), "history_answered", {"answer": answer, "id": str(entry["id"])})
    return {"id": str(entry["id"]), "status": status}


@router.get("/me/history-requests")
def requests(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Drivers who say they worked for me, waiting for my answer."""
    _me(db, user, tenant)
    rows = db.execute(
        f"""select {ENTRY_COLS}, h.driver_id, d.name as driver_name, d.photo_url as driver_photo, d.district as driver_district
            from public.work_history h join public.profiles d on d.id = h.driver_id
            left join public.profiles o on o.id = h.owner_id
            where h.owner_id = %s and h.status = 'pending' and not d.blocked order by h.created_at desc limit 50""",
        (user.id,),
    ).fetchall() or []
    return {"items": [_entry(dict(r)) | {"driver_id": str(r["driver_id"]), "driver_name": r["driver_name"],
                                         "driver_photo": r["driver_photo"], "driver_district": r["driver_district"]} for r in rows]}


@router.post("/history/{entry_id}/answer")
def answer(entry_id: str, body: AnswerIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    _me(db, user, tenant)
    entry = db.execute("select id, driver_id, status, start_month, end_month from public.work_history where id = %s and owner_id = %s", (entry_id, user.id)).fetchone()
    if not entry:
        raise HTTPException(404, "Not found")
    if entry["status"] != "pending":
        raise HTTPException(409, {"code": "answered"})
    return _apply_answer(db, tenant, dict(entry), body, user.id)


# ---------------------------------------------------------------- owner without the app: one-tap link
def _by_token(db, token: str, tenant: str) -> dict:
    if not token or len(token) > 40:
        raise HTTPException(404, "Link not found")
    row = db.execute(
        f"""select {ENTRY_COLS}, h.driver_id, h.token_expires_at, d.name as driver_name, d.photo_url as driver_photo
            from public.work_history h join public.profiles d on d.id = h.driver_id
            left join public.profiles o on o.id = h.owner_id
            where h.answer_token = %s and h.tenant_id = %s""",
        (token, tenant),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Link not found")
    if row["token_expires_at"] and row["token_expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(410, {"code": "expired"})
    return dict(row)


@router.get("/public/history/{token}")
def public_request(token: str, db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """What the owner sees from the link: driver's first name + photo, vehicle, months, the firm as typed."""
    r = _by_token(db, token, tenant)
    e = _entry(r)
    first = (r.get("driver_name") or "").split(" ")[0] or None
    return {k: e[k] for k in ("vehicle", "wheels", "start_month", "end_month", "work_type", "firm_name", "owner_name", "district", "status")} | {
        "driver": first, "driver_photo": r.get("driver_photo")}


@router.post("/public/history/{token}/answer")
def public_answer(token: str, body: AnswerIn, db=Depends(get_db), tenant: str = Depends(tenant_id)):
    r = _by_token(db, token, tenant)
    if r["status"] != "pending":
        raise HTTPException(409, {"code": "answered"})
    return _apply_answer(db, tenant, r, body, None)


# ---------------------------------------------------------------- shown to owners looking at a driver
@router.get("/drivers/{driver_id}/history")
def driver_history(driver_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    if me["role"] == "driver" and str(me["id"]) != driver_id:
        raise HTTPException(403, "Owners only")
    rows = db.execute(
        f"""select {ENTRY_COLS} from public.work_history h join public.profiles d on d.id = h.driver_id
            left join public.profiles o on o.id = h.owner_id
            where h.driver_id = %s and d.tenant_id = %s and not h.hidden and h.status = any(%s)
            order by coalesce(h.end_month, current_date) desc, h.start_month desc""",
        (driver_id, tenant, list(VISIBLE)),
    ).fetchall() or []
    items = [_entry(dict(r)) for r in rows]
    return {"items": items, "summary": summary(items)}


# summary columns for driver lists (p = driver profile)
LIST_SUMMARY_SQL = """
  (select count(*) from public.work_history wh where wh.driver_id = p.id and not wh.hidden and wh.status in ('confirmed', 'admin_ok'))::int as history_confirmed,
  (select count(*) from public.work_history wh where wh.driver_id = p.id and not wh.hidden and wh.status in ('pending', 'confirmed', 'needs_fix', 'owner_fixed', 'admin_ok'))::int as history_count,
  (select count(*) from public.work_history wh where wh.driver_id = p.id and not wh.hidden and wh.status in ('confirmed', 'admin_ok') and wh.rehire)::int as history_rehire
"""
# last job for the no-login list: firm (or "an owner") + place, nothing else
LAST_WORK_SQL = """
  (select jsonb_build_object('firm', coalesce(o2.business_name, wh.firm_name), 'district', coalesce(o2.district, wh.owner_district),
                             'vehicle', wh.vehicle, 'confirmed', wh.status in ('confirmed', 'admin_ok'))
     from public.work_history wh left join public.profiles o2 on o2.id = wh.owner_id
    where wh.driver_id = p.id and not wh.hidden and wh.status in ('pending', 'confirmed', 'needs_fix', 'owner_fixed', 'admin_ok')
    order by coalesce(wh.end_month, current_date) desc, wh.start_month desc limit 1) as last_work
"""


# ---------------------------------------------------------------- admin
@router.get("/admin/history")
def admin_list(status: Literal["todo", "disputed", "all"] = "todo", ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    """todo = owner corrected the months + no answer for 7 days (owner not on the app, or ignored) + disputed.
    Phone shown to admins only."""
    cond = {"todo": "(h.status = 'pending' and h.created_at < now() - interval '7 days') or h.status in ('disputed', 'owner_fixed')",
            "disputed": "h.status = 'disputed'", "all": "true"}[status]
    rows = db.execute(
        f"""select {ENTRY_COLS}, h.driver_id, h.owner_phone, o.phone as app_owner_phone, d.name as driver_name, d.phone as driver_phone
            from public.work_history h join public.profiles d on d.id = h.driver_id
            left join public.profiles o on o.id = h.owner_id
            where h.tenant_id = %s and h.source = 'driver' and ({cond}) order by h.created_at limit 100""",
        (ctx["tenant"],),
    ).fetchall() or []
    out = []
    for r in rows:
        e = _entry(dict(r), mine=True)
        e |= {"driver_id": str(r["driver_id"]), "driver_name": r["driver_name"], "driver_phone": r["driver_phone"],
              "owner_phone": r["app_owner_phone"] or r["owner_phone"]}
        out.append(e)
    return {"items": out}


class CheckIn(BaseModel):
    # ok = right (for owner_fixed: use the owner's months) · keep = right, keep the driver's months · reject = not true
    action: Literal["ok", "keep", "reject"]
    note: Optional[str] = Field(None, max_length=300)


@router.post("/admin/history/{entry_id}/check")
def admin_check(entry_id: str, body: CheckIn, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    status = "admin_rejected" if body.action == "reject" else "admin_ok"
    use_owner = body.action == "ok"
    row = db.execute(
        """update public.work_history set status = %s, admin_note = %s, checked_by = %s, checked_at = now(), answer_token = null,
                  start_month = case when %s and status = 'owner_fixed' and owner_start_month is not null then owner_start_month else start_month end,
                  end_month = case when %s and status = 'owner_fixed' and owner_start_month is not null then owner_end_month else end_month end
           where id = %s and tenant_id = %s returning driver_id""",
        (status, body.note, ctx["id"], use_owner, use_owner, entry_id, ctx["tenant"]),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    _audit(db, ctx, f"history_{body.action}", "history", entry_id, body.note)
    notify.safe(db, notify.to_user, ctx["tenant"], str(row["driver_id"]), "history_answered",
                {"answer": status, "id": entry_id})
    return {"id": entry_id, "status": status}


def add_from_hire(db, tenant: str, hire_id: int, driver_id: str, owner_id: str) -> None:
    """A job confirmed in the app ("काम मिल गया") becomes a confirmed history entry by itself."""
    db.execute(
        """insert into public.work_history (tenant_id, driver_id, owner_id, vehicle, start_month, source, hire_id, status, owner_answer, answered_at)
           select %s, %s, %s, coalesce((select vehicles[1] from public.driver_details where profile_id = %s), 'truck'),
                  date_trunc('month', now())::date, 'hire', %s, 'confirmed', 'yes', now()
           on conflict do nothing""",
        (tenant, driver_id, owner_id, driver_id, hire_id),
    )
