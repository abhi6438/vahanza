import time
from datetime import datetime, timedelta, timezone

import jwt

from conftest import HS_SECRET, make_token
from vz import pin as P

UID = "11111111-1111-1111-1111-111111111111"
H = {"Authorization": f"Bearer {make_token()}"}
ME = lambda role="driver": {"id": UID, "tenant_id": "vahanza", "role": role, "blocked": False}
HASH = P.hash_pin("4829")


def otp_token(age=60):
    now = int(time.time())
    return jwt.encode({"sub": UID, "phone": "919876543210", "aud": "authenticated", "role": "authenticated", "iat": now, "exp": now + 3600,
                       "amr": [{"method": "otp", "timestamp": now - age}]}, HS_SECRET, algorithm="HS256")


def test_hash_and_rules():
    assert P.check_pin("4829", HASH) and not P.check_pin("4828", HASH)
    assert not P.check_pin("4829", "garbage")
    assert P.valid_pin("4829") and P.valid_pin("1111") and P.valid_pin("1234")
    assert not P.valid_pin("123") and not P.valid_pin("123456") and not P.valid_pin("12a4")


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
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "1112"})
    assert r.status_code == 401
    assert r.json()["detail"] == {"code": "wrong_pin", "left": 3, "locked_until": None}
    assert any("login_fail" in str(c[1]) for c in db.calls)


def test_login_fifth_wrong_locks(client, db):
    later = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 4, "locked_until": None, "blocked": False})
    db.respond("returning failed", {"failed": 5, "locked_until": later})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "1112"})
    assert r.json()["detail"]["left"] == 0 and r.json()["detail"]["locked_until"]
    assert any("locked" in str(c[1]) for c in db.calls)


def test_login_locked(client, db):
    later = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 5, "locked_until": later, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "4829"})
    assert r.status_code == 423 and r.json()["detail"]["code"] == "pin_locked"


def test_login_ok_without_supabase_key_is_unavailable(client, db):
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "4829"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "pin_login_unavailable"


def test_login_ok_dev_session(client, db, monkeypatch):
    from vz.config import get_settings
    monkeypatch.setattr(get_settings(), "dev_mint_sessions", True)
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 2, "locked_until": None, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "4829"})
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
        status_code = 200

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
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "4829"})
    assert r.json()["access_token"] == "a" and r.json()["refresh_token"] == "r"
    assert sent[0][1].endswith(f"/admin/users/{UID}") and sent[1][2]["password"] == sent[0][2]["password"]
    assert "4829" not in str(sent)          # the MPIN never goes to Supabase


def test_set_allows_easy_pin(client, db):
    db.respond("from public.profiles where id", ME())
    assert client.put("/api/v1/me/pin", headers=H, json={"pin": "1234"}).status_code == 200


def test_set_rejects_wrong_length(client, db):
    db.respond("from public.profiles where id", ME())
    r = client.put("/api/v1/me/pin", headers=H, json={"pin": "123456"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "pin_format"


def test_set_first_time(client, db):
    db.respond("from public.profiles where id", ME())
    r = client.put("/api/v1/me/pin", headers=H, json={"pin": "4829"})
    assert r.status_code == 200
    ins = [c for c in db.calls if "insert into public.user_pins" in c[0]][0]
    assert ins[1][2].startswith("scrypt$") and "4829" not in str(ins[1])


def test_change_needs_old_pin(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    db.respond("returning failed", {"failed": 1, "locked_until": None})
    r = client.put("/api/v1/me/pin", headers=H, json={"pin": "7029", "old_pin": "0001"})
    assert r.status_code == 401


def test_change_with_old_pin(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    assert client.put("/api/v1/me/pin", headers=H, json={"pin": "7029", "old_pin": "4829"}).status_code == 200


def test_forgot_pin_after_fresh_otp(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 5, "locked_until": None})
    r = client.put("/api/v1/me/pin", headers={"Authorization": f"Bearer {otp_token()}"}, json={"pin": "7029"})
    assert r.status_code == 200


def test_old_otp_is_not_enough(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    db.respond("returning failed", {"failed": 1, "locked_until": None})
    r = client.put("/api/v1/me/pin", headers={"Authorization": f"Bearer {otp_token(age=3600)}"}, json={"pin": "7029"})
    assert r.status_code == 401


def test_me_pin_admin_required(client, db):
    db.respond("from public.profiles where id", ME("admin"))
    r = client.get("/api/v1/me/pin", headers=H)
    assert r.json()["required"] is True and r.json()["has_pin"] is False


def test_verify(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.user_pins where profile_id", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None})
    assert client.post("/api/v1/me/pin/verify", headers=H, json={"pin": "4829"}).json() == {"ok": True}


def test_admin_reset(client, db):
    db.respond("from public.profiles where id", ME("super_admin"))
    db.respond("from public.profiles where id", {"id": "22222222-2222-2222-2222-222222222222", "tenant_id": "vahanza"})
    r = client.delete("/api/v1/admin/users/22222222-2222-2222-2222-222222222222/pin", headers=H)
    assert r.status_code == 200
    assert any("delete from public.user_pins" in c[0] for c in db.calls)
    assert any("pin_reset" in str(c[1]) for c in db.calls)


def test_session_failure_reason_and_new_key(client, db, monkeypatch):
    from vz.config import get_settings
    import httpx
    monkeypatch.setattr(get_settings(), "supabase_service_role_key", "sb_secret_abc")
    seen = {}

    class R:
        def __init__(self, code, data):
            self.status_code, self.data = code, data

        def json(self):
            return self.data

    def put(url, **k):
        seen["headers"] = k["headers"]
        return R(200, {})
    monkeypatch.setattr(httpx, "put", put)
    monkeypatch.setattr(httpx, "post", lambda url, **k: R(400, {"error_code": "invalid_credentials"}))
    db.respond("count(*) as n", {"n": 0})
    db.respond("join public.user_pins", {"profile_id": UID, "pin_hash": HASH, "failed": 0, "locked_until": None, "blocked": False})
    r = client.post("/api/v1/auth/pin/login", json={"phone": "9876543210", "pin": "4829"})
    assert r.status_code == 502
    assert r.json()["detail"] == {"code": "session_failed", "step": "sign_in", "status": 400, "reason": "invalid_credentials"}
    assert "Authorization" not in seen["headers"] and seen["headers"]["apikey"] == "sb_secret_abc"
    assert "sb_secret_abc" not in r.text
