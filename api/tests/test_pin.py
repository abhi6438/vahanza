import time
from datetime import datetime, timedelta, timezone

import jwt

from conftest import HS_SECRET, make_token
from vz import pin as P

UID = "11111111-1111-1111-1111-111111111111"
H = {"Authorization": f"Bearer {make_token()}"}
ME = lambda role="driver": {"id": UID, "tenant_id": "vahanza", "role": role, "blocked": False}
HASH = P.hash_pin("482916")


def otp_token(age=60):
    now = int(time.time())
    return jwt.encode({"sub": UID, "phone": "919876543210", "aud": "authenticated", "role": "authenticated", "iat": now, "exp": now + 3600,
                       "amr": [{"method": "otp", "timestamp": now - age}]}, HS_SECRET, algorithm="HS256")


def test_hash_and_rules():
    assert P.check_pin("482916", HASH) and not P.check_pin("482917", HASH)
    assert not P.check_pin("482916", "garbage")
    for simple in ("111111", "123456", "654321", "121212", "345678"):
        assert P.too_simple(simple), simple
    for ok in ("482916", "102938", "112233"):
        assert not P.too_simple(ok), ok
    assert not P.valid_pin("12345") and not P.valid_pin("12a456") and P.valid_pin("482916")


def test_check_says_has_pin(client, db):
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"locked_until": None})
    r = client.post("/api/v1/auth/pin/check", json={"phone": "9876543210"})
    assert r.json() == {"has_pin": True, "locked_until": None}


def test_check_rejects_bad_phone(client, db):
    assert client.post("/api/v1/auth/pin/check", json={"phone": "12345"}).status_code == 422


def test_check_limited_per_address(client, db):
    db.respond("count(*) as n", {"n": 30})
    assert client.post("/api/v1/auth/pin/check", json={"phone": "9876543210"}).status_code == 429


def test_login_wrong_pin_counts(client, db):
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 1, "locked_until": None, "blocked": False})
    db.respond("returning failed", {"failed": 2, "locked_until": None})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "111222"})
    assert r.status_code == 401
    assert r.json()["detail"] == {"code": "wrong_pin", "left": 3, "locked_until": None}
    assert any("login_fail" in str(c[1]) for c in db.calls)


def test_login_fifth_wrong_locks(client, db):
    later = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 4, "locked_until": None, "blocked": False})
    db.respond("returning failed", {"failed": 5, "locked_until": later})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "111222"})
    assert r.json()["detail"]["left"] == 0 and r.json()["detail"]["locked_until"]
    assert any("locked" in str(c[1]) for c in db.calls)


def test_login_locked(client, db):
    later = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 5, "locked_until": later, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "482916"})
    assert r.status_code == 423 and r.json()["detail"]["code"] == "pin_locked"


def test_login_ok_without_supabase_key_is_unavailable(client, db):
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "482916"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "pin_login_unavailable"


def test_login_ok_dev_session(client, db, monkeypatch):
    from vz.config import get_settings
    monkeypatch.setattr(get_settings(), "dev_mint_sessions", True)
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 2, "locked_until": None, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "482916"})
    assert r.status_code == 200
    claims = jwt.decode(r.json()["access_token"], HS_SECRET, algorithms=["HS256"], audience="authenticated")
    assert claims["sub"] == UID and claims["phone"] == "919876543210"
    assert any("failed = 0" in c[0] for c in db.calls)


def test_login_supabase_session(client, db, monkeypatch):
    from vz.config import get_settings
    import httpx
    monkeypatch.setattr(get_settings(), "supabase_service_role_key", "svc")
    sent = []

    class R:
        def __init__(self, data):
            self.data = data

        def raise_for_status(self):
            pass

        def json(self):
            return self.data

    monkeypatch.setattr(httpx, "put", lambda url, **k: sent.append(("put", url, k["json"])) or R({}))
    monkeypatch.setattr(httpx, "post", lambda url, **k: sent.append(("post", url, k["json"])) or R({"access_token": "a", "refresh_token": "r", "expires_in": 3600}))
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "482916"})
    assert r.json()["access_token"] == "a" and r.json()["refresh_token"] == "r"
    assert sent[0][1].endswith(f"/admin/users/{UID}") and sent[1][2]["password"] == sent[0][2]["password"]
    assert "482916" not in str(sent)          # the MPIN never goes to Supabase


def test_set_rejects_simple(client, db):
    db.respond("from public.profiles where id", ME())
    r = client.put("/api/v1/me/pin", headers=H, json={"pin": "123456"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "pin_simple"


def test_set_first_time(client, db):
    db.respond("from public.profiles where id", ME())
    r = client.put("/api/v1/me/pin", headers=H, json={"pin": "482916"})
    assert r.status_code == 200
    ins = [c for c in db.calls if "insert into public.user_pins" in c[0]][0]
    assert ins[1][2].startswith("scrypt$") and "482916" not in str(ins[1])


def test_change_needs_old_pin(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    db.respond("returning failed", {"failed": 1, "locked_until": None})
    r = client.put("/api/v1/me/pin", headers=H, json={"pin": "702918", "old_pin": "000111"})
    assert r.status_code == 401


def test_change_with_old_pin(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    assert client.put("/api/v1/me/pin", headers=H, json={"pin": "702918", "old_pin": "482916"}).status_code == 200


def test_forgot_pin_after_fresh_otp(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 5, "locked_until": None})
    r = client.put("/api/v1/me/pin", headers={"Authorization": f"Bearer {otp_token()}"}, json={"pin": "702918"})
    assert r.status_code == 200


def test_old_otp_is_not_enough(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    db.respond("returning failed", {"failed": 1, "locked_until": None})
    r = client.put("/api/v1/me/pin", headers={"Authorization": f"Bearer {otp_token(age=3600)}"}, json={"pin": "702918"})
    assert r.status_code == 401


def test_me_pin_admin_required(client, db):
    db.respond("from public.profiles where id", ME("admin"))
    r = client.get("/api/v1/me/pin", headers=H)
    assert r.json()["required"] is True and r.json()["has_pin"] is False


def test_verify(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    assert client.post("/api/v1/me/pin/verify", headers=H, json={"pin": "482916"}).json() == {"ok": True}


def test_admin_reset(client, db):
    db.respond("from public.profiles where id", ME("super_admin"))
    db.respond("from public.profiles where id", {"id": "22222222-2222-2222-2222-222222222222", "tenant_id": "vahanza"})
    r = client.delete("/api/v1/admin/users/22222222-2222-2222-2222-222222222222/pin", headers=H)
    assert r.status_code == 200
    assert any("delete from public.user_pins" in c[0] for c in db.calls)
    assert any("pin_reset" in str(c[1]) for c in db.calls)
