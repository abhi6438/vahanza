import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from conftest import HOOK_SECRET, make_token
from vz import webhook
from vz.auth import verify_token
from vz.config import get_settings

UID = "11111111-1111-1111-1111-111111111111"


def auth(token=None):
    return {"Authorization": f"Bearer {token or make_token()}"}


# ---------------- health ----------------
def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["ok"] is True


# ---------------- tokens ----------------
def test_hs256_token_ok():
    u = verify_token(make_token(), get_settings())
    assert u.id == UID and u.phone == "919876543210"


@pytest.mark.parametrize("kw", [{"exp_in": -10}, {"aud": "other"}, {"role": "anon"}])
def test_bad_tokens_rejected(kw):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        verify_token(make_token(**kw), get_settings())
    assert e.value.status_code == 401


def test_es256_token_via_jwks(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    settings = get_settings()
    now = int(time.time())
    token = jwt.encode(
        {"sub": UID, "aud": "authenticated", "role": "authenticated", "iss": settings.jwt_issuer, "exp": now + 60},
        key, algorithm="ES256", headers={"kid": "k1"},
    )

    class FakeKey:
        def __init__(self, k):
            self.key = k

    class FakeJwks:
        def get_signing_key_from_jwt(self, _t):
            return FakeKey(key.public_key())

    monkeypatch.setattr("vz.auth._jwks_client", lambda url: FakeJwks())
    assert verify_token(token, settings).id == UID


# ---------------- /me ----------------
def test_me_requires_login(client):
    assert client.get("/api/v1/me").status_code == 401


def test_me_new_user(client, db):
    r = client.get("/api/v1/me", headers=auth())
    assert r.status_code == 200 and r.json() == {"exists": False, "suggested_role": None, "profile": None, "driver": None, "fleet": None}


def test_me_start_driver(client, db):
    db.respond("from public.tenants", {"?column?": 1})
    db.respond("insert into public.profiles", {
        "id": UID, "tenant_id": "vahanza", "role": "driver", "name": None, "phone": "919876543210",
        "photo_url": None, "lang": "hi", "city": None, "pincode": None, "verified": False, "blocked": False,
        "created_at": None,
    })
    r = client.post("/api/v1/me", json={"role": "driver", "lang": "hi"}, headers=auth())
    assert r.status_code == 200, r.text
    assert r.json()["profile"]["role"] == "driver"
    assert any("driver_details" in sql for sql, _ in db.calls)


def test_me_role_cannot_change(client, db):
    db.respond("from public.tenants", {"?column?": 1})
    db.respond("insert into public.profiles", {
        "id": UID, "tenant_id": "vahanza", "role": "owner", "name": None, "phone": None, "photo_url": None,
        "lang": "hi", "city": None, "pincode": None, "verified": False, "blocked": False, "created_at": None,
    })
    r = client.post("/api/v1/me", json={"role": "driver"}, headers=auth())
    assert r.status_code == 409


def test_me_other_brand_blocked(client, db):
    db.respond("from public.profiles", {
        "id": UID, "tenant_id": "otherbrand", "role": "owner", "name": None, "phone": None, "photo_url": None,
        "lang": "hi", "city": None, "pincode": None, "verified": False, "blocked": False, "created_at": None,
    })
    assert client.get("/api/v1/me", headers=auth()).status_code == 403


# ---------------- send-sms hook ----------------
def _signed(body: dict, secret=HOOK_SECRET, ts=None):
    raw = json.dumps(body).encode()
    ts = str(ts or int(time.time()))
    sig = webhook.sign(secret, "msg_1", ts, raw)
    return raw, {"webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": f"v1,{sig}", "content-type": "application/json"}


def test_send_sms_ok(client, db):
    db.respond("from public.sms_log", {"n": 0})
    raw, headers = _signed({"user": {"phone": "919876543210"}, "sms": {"otp": "123456"}})
    r = client.post("/api/v1/hooks/send-sms", content=raw, headers=headers)
    assert r.status_code == 200, r.text
    assert any("insert into public.sms_log" in sql for sql, _ in db.calls)


def test_send_sms_bad_signature(client, db):
    raw, headers = _signed({"user": {"phone": "919876543210"}, "sms": {"otp": "123456"}})
    headers["webhook-signature"] = "v1,AAAA"
    assert client.post("/api/v1/hooks/send-sms", content=raw, headers=headers).status_code == 401


def test_send_sms_rate_limited(client, db):
    db.respond("from public.sms_log", {"n": 5})
    raw, headers = _signed({"user": {"phone": "+91 98765 43210"}, "sms": {"otp": "123456"}})
    r = client.post("/api/v1/hooks/send-sms", content=raw, headers=headers)
    assert r.status_code == 429 and r.json()["error"]["http_code"] == 429


def test_webhook_old_timestamp():
    raw, headers = _signed({"x": 1}, ts=int(time.time()) - 3600)
    with pytest.raises(webhook.WebhookError):
        webhook.verify(HOOK_SECRET, headers, raw)


# ---------------- events ----------------
def test_events_ingest_anonymous(client, db):
    body = {
        "anon_id": "a1", "session_id": "s1",
        "context": {"platform": "web_mobile", "os": "Android 13", "browser": "Chrome", "standalone": True},
        "events": [
            {"name": "screen_view", "screen": "phone", "props": {"phone": "9876543210", "x": 1}, "ts": "2026-10-01T10:00:00Z"},
            {"name": "otp_requested", "ts": "2026-10-01T10:00:05Z"},
        ],
    }
    r = client.post("/api/v1/events", json=body, headers={"x-vercel-ip-city": "Rewa"})
    assert r.status_code == 202 and r.json()["stored"] == 2
    sql, rows = db.calls[-1]
    assert "insert into public.events" in sql
    assert '"phone"' not in rows[0][6]  # personal data dropped
    assert rows[0][13] == "Rewa"
