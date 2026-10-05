"""MPIN helpers (Sprint 11): hashing, simple-PIN rules, and turning a correct MPIN into a Supabase session.

The MPIN never goes to Supabase. The API checks it against its own slow hash (with a 5-tries lock), then
sets a fresh random password on the Supabase user and signs in with it once, server to server. The app
gets an ordinary Supabase session (access + refresh token), exactly like after an OTP login.
"""
import base64
import hashlib
import hmac
import secrets
import time
import uuid

import httpx
import jwt
from fastapi import HTTPException

from .config import Settings

MAX_FAILS = 5
LOCK_MINUTES = 30
_N, _R, _P = 2 ** 14, 8, 1


def hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pin.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def check_pin(pin: str, stored: str) -> bool:
    try:
        algo, salt, dk = stored.split("$")
        if algo != "scrypt":
            return False
        got = hashlib.scrypt(pin.encode(), salt=base64.b64decode(salt), n=_N, r=_R, p=_P, dklen=32)
        return hmac.compare_digest(got, base64.b64decode(dk))
    except (ValueError, TypeError):
        return False


def too_simple(pin: str) -> bool:
    """111111, 123456, 654321, 121212... are the first numbers anyone tries."""
    if len(set(pin)) <= 2:
        return True
    d = [int(c) for c in pin]
    steps = {d[i + 1] - d[i] for i in range(len(d) - 1)}
    return steps in ({1}, {-1})


def valid_pin(pin: str) -> bool:
    return len(pin) == 6 and pin.isdigit()


def mint_session(settings: Settings, user_id: str, phone: str) -> dict:
    """A normal Supabase login session for this user (same shape as supabase.auth.verifyOtp's session)."""
    if settings.supabase_service_role_key and settings.supabase_url:
        base = settings.supabase_url.rstrip("/") + "/auth/v1"
        key = settings.supabase_service_role_key
        pw = secrets.token_urlsafe(32)          # used once, never stored, never shown
        try:
            r = httpx.put(f"{base}/admin/users/{user_id}", json={"password": pw},
                          headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=10)
            r.raise_for_status()
            r = httpx.post(f"{base}/token?grant_type=password", json={"phone": phone, "password": pw},
                           headers={"apikey": key}, timeout=10)
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, {"code": "session_failed"}) from exc
        return {k: data.get(k) for k in ("access_token", "refresh_token", "expires_in", "expires_at", "token_type", "user")}
    if settings.dev_mint_sessions and settings.supabase_jwt_secret:
        now = int(time.time())
        claims = {"sub": user_id, "phone": phone, "aud": "authenticated", "role": "authenticated",
                  "iat": now, "exp": now + 3600, "amr": [{"method": "mpin", "timestamp": now}]}
        token = jwt.encode(claims, settings.supabase_jwt_secret, algorithm="HS256")
        return {"access_token": token, "refresh_token": "dev-" + uuid.uuid4().hex, "expires_in": 3600,
                "expires_at": now + 3600, "token_type": "bearer",
                "user": {"id": user_id, "phone": phone, "aud": "authenticated", "role": "authenticated"}}
    raise HTTPException(503, {"code": "pin_login_unavailable"})


def recent_otp(claims: dict, minutes: int = 15) -> bool:
    """Logged in with an OTP in the last few minutes (lets "forgot MPIN" set a new one without the old)."""
    now = time.time()
    for a in claims.get("amr") or []:
        if isinstance(a, dict) and a.get("method") in ("otp", "sms") and now - float(a.get("timestamp") or 0) < minutes * 60:
            return True
    return False
