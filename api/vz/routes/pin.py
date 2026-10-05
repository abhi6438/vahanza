"""Sprint 11: MPIN — log in with a 4-digit number instead of an OTP every time.

No login needed:  POST /auth/pin/check  (does this number have an MPIN?)   POST /auth/pin/login
Logged in:        GET/PUT /me/pin  (set or change)   POST /me/pin/verify  (APK lock screen, online check)
Admin:            DELETE /admin/users/{id}/pin  (phone lost: next login is by OTP, then a new MPIN)

5 wrong tries in a row lock the MPIN for 30 minutes (OTP still works). Each network address also gets a
limited number of checks and wrong tries per hour, so numbers can't be guessed or listed in bulk.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import pin as P
from ..auth import AuthUser, current_user
from ..config import Settings, get_settings
from ..deps import get_db, tenant_id
from ..sms import normalise_phone
from .admin import _audit, admin_ctx

router = APIRouter(tags=["pin"])

CHECKS_PER_HOUR = 30      # per network address
FAILS_PER_HOUR = 20       # per network address, across all numbers


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")) or "?"


def _event(db, tenant: str, profile_id: Optional[str], kind: str, ip: Optional[str]) -> None:
    db.execute("insert into public.pin_events (tenant_id, profile_id, kind, ip) values (%s, %s, %s, %s)", (tenant, profile_id, kind, ip))


def _ip_count(db, ip: str, kinds: tuple) -> int:
    row = db.execute(
        "select count(*) as n from public.pin_events where ip = %s and kind = any(%s) and at > now() - interval '1 hour'",
        (ip, list(kinds)),
    ).fetchone() or {}
    return int(row.get("n") or 0)


def _iso(v):
    return v.isoformat() if v else None


def _phone(raw: str) -> str:
    p = normalise_phone(raw or "")
    if len(p) != 12 or not p.startswith("91") or p[2] not in "6789":
        raise HTTPException(422, {"code": "invalid_phone"})
    return p


def _wrong(db, tenant: str, row: dict, ip: Optional[str], kind: str = "login_fail") -> dict:
    """Counts a wrong MPIN; the 5th in a row locks it for 30 minutes."""
    r = db.execute(
        f"""update public.user_pins set failed = failed + 1,
               locked_until = case when failed + 1 >= {P.MAX_FAILS} then now() + interval '{P.LOCK_MINUTES} minutes' else locked_until end
            where profile_id = %s returning failed, locked_until""",
        (row["profile_id"],),
    ).fetchone() or {}
    _event(db, tenant, row["profile_id"], kind, ip)
    if r.get("locked_until"):
        _event(db, tenant, row["profile_id"], "locked", ip)
    # the request ends with an error (401), which rolls the transaction back: keep the count anyway
    if hasattr(db, "commit"):
        db.commit()
    return {"left": max(0, P.MAX_FAILS - int(r.get("failed") or 0)), "locked_until": _iso(r.get("locked_until"))}


def _locked(row: dict) -> bool:
    from datetime import datetime, timezone
    lu = row.get("locked_until")
    return bool(lu and lu > datetime.now(timezone.utc))


# ---------------------------------------------------------------- no login
class PhoneIn(BaseModel):
    phone: str


@router.post("/auth/pin/check")
def check(body: PhoneIn, request: Request, db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Login screen: after the number is typed, show the MPIN box (has_pin) or send an OTP."""
    phone, ip = _phone(body.phone), _ip(request)
    if _ip_count(db, ip, ("check",)) >= CHECKS_PER_HOUR:
        raise HTTPException(429, {"code": "too_many_tries"})
    _event(db, tenant, None, "check", ip)
    row = db.execute(
        """select up.locked_until from public.profiles p join public.user_pins up on up.profile_id = p.id
           where p.tenant_id = %s and p.phone = %s and not p.blocked""",
        (tenant, phone),
    ).fetchone()
    if not row:
        return {"has_pin": False, "locked_until": None}
    return {"has_pin": True, "locked_until": _iso(row["locked_until"]) if _locked(row) else None}


class PinLogin(BaseModel):
    phone: str
    pin: str


@router.post("/auth/pin/login")
def login(body: PinLogin, request: Request, db=Depends(get_db), tenant: str = Depends(tenant_id), settings: Settings = Depends(get_settings)):
    phone, ip = _phone(body.phone), _ip(request)
    if _ip_count(db, ip, ("login_fail",)) >= FAILS_PER_HOUR:
        raise HTTPException(429, {"code": "too_many_tries"})
    row = db.execute(
        """select up.profile_id, up.pin_hash, up.failed, up.locked_until, p.blocked
           from public.profiles p join public.user_pins up on up.profile_id = p.id
           where p.tenant_id = %s and p.phone = %s""",
        (tenant, phone),
    ).fetchone()
    if not row:
        raise HTTPException(404, {"code": "no_pin"})
    if row["blocked"]:
        raise HTTPException(403, "Account blocked")
    if _locked(row):
        raise HTTPException(423, {"code": "pin_locked", "locked_until": _iso(row["locked_until"])})
    if not P.valid_pin(body.pin) or not P.check_pin(body.pin, row["pin_hash"]):
        raise HTTPException(401, {"code": "wrong_pin", **_wrong(db, tenant, row, ip)})
    session = P.mint_session(settings, str(row["profile_id"]), phone)
    db.execute("update public.user_pins set failed = 0, locked_until = null, last_used_at = now() where profile_id = %s", (row["profile_id"],))
    _event(db, tenant, row["profile_id"], "login_ok", ip)
    return session


# ---------------------------------------------------------------- logged in
def _profile(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute("select id, tenant_id, role, blocked from public.profiles where id = %s", (user.id,)).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    return me


@router.get("/me/pin")
def my_pin(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _profile(db, user, tenant)
    row = db.execute("select set_at, locked_until from public.user_pins where profile_id = %s", (user.id,)).fetchone()
    return {
        "has_pin": bool(row),
        "set_at": _iso(row["set_at"]) if row else None,
        "locked_until": _iso(row["locked_until"]) if row and _locked(row) else None,
        # "forgot MPIN": just logged in with an OTP, so a new one can be set without the old one
        "can_reset": P.recent_otp(user.claims),
        "required": me["role"] in ("admin", "super_admin"),
    }


class PinSet(BaseModel):
    pin: str
    old_pin: Optional[str] = None


@router.put("/me/pin")
def set_pin(body: PinSet, request: Request, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    _profile(db, user, tenant)
    if not P.valid_pin(body.pin):
        raise HTTPException(422, {"code": "pin_format"})
    ip = _ip(request)
    row = db.execute("select profile_id, pin_hash, failed, locked_until from public.user_pins where profile_id = %s", (user.id,)).fetchone()
    if row and not P.recent_otp(user.claims):
        # changing: the old MPIN is needed (or log in again with an OTP: "forgot MPIN")
        if _locked(row):
            raise HTTPException(423, {"code": "pin_locked", "locked_until": _iso(row["locked_until"])})
        if not body.old_pin or not P.check_pin(body.old_pin, row["pin_hash"]):
            raise HTTPException(401, {"code": "wrong_pin", **_wrong(db, tenant, row, ip, "unlock_fail")})
    db.execute(
        """insert into public.user_pins (profile_id, tenant_id, pin_hash) values (%s, %s, %s)
           on conflict (profile_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null, set_at = now()""",
        (user.id, tenant, P.hash_pin(body.pin)),
    )
    _event(db, tenant, user.id, "change" if row else "set", ip)
    return {"ok": True, "has_pin": True}


class PinIn(BaseModel):
    pin: str


@router.post("/me/pin/verify")
def verify(body: PinIn, request: Request, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """APK lock screen when this phone has no copy of the MPIN yet (it was set on another phone)."""
    _profile(db, user, tenant)
    row = db.execute("select profile_id, pin_hash, failed, locked_until from public.user_pins where profile_id = %s", (user.id,)).fetchone()
    if not row:
        raise HTTPException(404, {"code": "no_pin"})
    if _locked(row):
        raise HTTPException(423, {"code": "pin_locked", "locked_until": _iso(row["locked_until"])})
    if not P.valid_pin(body.pin) or not P.check_pin(body.pin, row["pin_hash"]):
        raise HTTPException(401, {"code": "wrong_pin", **_wrong(db, tenant, row, _ip(request), "unlock_fail")})
    db.execute("update public.user_pins set failed = 0, last_used_at = now() where profile_id = %s", (user.id,))
    return {"ok": True}


# ---------------------------------------------------------------- admin
@router.delete("/admin/users/{user_id}/pin")
def admin_reset(user_id: str, request: Request, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    """Phone lost / MPIN forgotten and no OTP access: removes the MPIN; the next login is by OTP."""
    target = db.execute("select id, tenant_id from public.profiles where id = %s", (user_id,)).fetchone()
    if not target or (ctx["role"] == "admin" and target["tenant_id"] != ctx["tenant"]):
        raise HTTPException(404, "User not found")
    db.execute("delete from public.user_pins where profile_id = %s", (user_id,))
    _event(db, target["tenant_id"], user_id, "reset_admin", _ip(request))
    _audit(db, ctx, "pin_reset", "profile", user_id)
    return {"ok": True}
