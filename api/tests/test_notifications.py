from conftest import make_token

H = {"Authorization": f"Bearer {make_token()}"}
UID = "11111111-1111-1111-1111-111111111111"
OWNER = "22222222-2222-2222-2222-222222222222"
POST = "33333333-3333-3333-3333-333333333333"


def me(role):
    return {"id": UID, "tenant_id": "vahanza", "role": role, "blocked": False, "is_test": False, "setup_done": True,
            "name": "Ramesh Kumar", "business_name": None}


def test_interest_notifies_owner(client, db):
    db.respond("from public.profiles where id", me("driver"))
    db.respond("p.status = 'live'", {"id": POST, "owner_id": OWNER, "phone": "919000000000"})
    db.respond("insert into public.interests", {"id": 1})
    db.respond("insert into public.notifications", {"user_id": OWNER, "kind": "new_interest", "data": {}})
    assert client.post(f"/api/v1/jobs/{POST}/interest", headers=H).status_code == 201
    sql, params = next(c for c in db.calls if "insert into public.notifications" in c[0])
    assert params[1] == "new_interest" and params[3] == OWNER and params[2].obj["driver"] == "Ramesh Kumar"


def test_repeat_interest_does_not_notify(client, db):
    db.respond("from public.profiles where id", me("driver"))
    db.respond("p.status = 'live'", {"id": POST, "owner_id": OWNER, "phone": "919000000000"})
    assert client.post(f"/api/v1/jobs/{POST}/interest", headers=H).status_code == 201
    assert not any("insert into public.notifications" in c[0] for c in db.calls)


def test_opening_interests_tells_drivers(client, db):
    db.respond("from public.profiles where id", {**me("owner"), "business_name": "Sharma Roadways"})
    db.respond("from public.posts where id", {"?column?": 1})
    db.respond("returning driver_id", [{"driver_id": "a"}, {"driver_id": "b"}])
    assert client.get(f"/api/v1/posts/{POST}/interests", headers=H).status_code == 200
    sent = [c for c in db.calls if "insert into public.notifications" in c[0]]
    assert len(sent) == 2 and sent[0][1][1] == "interest_seen" and sent[0][1][2].obj["owner"] == "Sharma Roadways"


def test_admin_approve_notifies_owner_and_drivers(client, db):
    db.respond("from public.profiles where id", {**me("admin"), "role": "admin"})
    db.respond("status = 'under_check' returning", {"id": POST, "owner_id": OWNER})
    assert client.post(f"/api/v1/admin/posts/{POST}/review", headers=H, json={"action": "approve"}).status_code == 200
    kinds = [c[1][1] for c in db.calls if "insert into public.notifications (tenant_id, user_id, kind, data)\n        select %s" in c[0]]
    assert kinds == ["post_live"]
    assert any("'new_post'" in c[0] and "with post as" in c[0] for c in db.calls)


def test_notify_failure_does_not_break_action(client, db, monkeypatch):
    from vz import notify

    def boom(*a, **k):
        raise RuntimeError("db down")
    monkeypatch.setattr(notify, "to_user", boom)
    db.respond("from public.profiles where id", me("driver"))
    db.respond("p.status = 'live'", {"id": POST, "owner_id": OWNER, "phone": "919000000000"})
    db.respond("insert into public.interests", {"id": 1})
    assert client.post(f"/api/v1/jobs/{POST}/interest", headers=H).status_code == 201


def test_unread_and_list(client, db):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    db.respond("order by id desc", [{"id": 5, "kind": "new_post", "data": {"n": 2}, "read_at": None, "created_at": now}])
    db.respond("count(*) as n", {"n": 1})
    r = client.get("/api/v1/notifications", headers=H).json()
    assert r["unread"] == 1 and r["items"][0]["kind"] == "new_post" and r["has_more"] is False


def test_webpush_subscribe_needs_keys(client, db):
    body = {"kind": "webpush", "endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "x"}}
    assert client.post("/api/v1/push/subscribe", headers=H, json=body).status_code == 422
    body["keys"]["auth"] = "y"
    assert client.post("/api/v1/push/subscribe", headers=H, json=body).status_code == 201
    assert client.post("/api/v1/push/subscribe", headers=H, json={**body, "endpoint": "http://evil.example/x"}).status_code == 422


def test_prefs_patch_only_given_keys(client, db):
    db.respond("returning notify_prefs", {"notify_prefs": {"new_post": False}})
    r = client.patch("/api/v1/me/notify-prefs", headers=H, json={"new_post": False})
    assert r.json() == {"new_post": False, "new_interest": True, "interest_seen": True}
    sql, params = db.calls[-1]
    assert params[0].obj == {"new_post": False}


def test_push_config_without_keys(client):
    r = client.get("/api/v1/push/config").json()
    assert r == {"webpush": False, "fcm": False, "vapid_public_key": None}


def _browser_keys():
    import base64
    import os
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    k = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    enc = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    return {"p256dh": enc(k), "auth": enc(os.urandom(16))}


def test_webpush_send_encrypts_and_drops_dead(db, monkeypatch):
    """Real pywebpush encryption + VAPID signing; only the HTTP call is faked."""
    import os
    import subprocess
    import sys
    from vz import push
    from vz.config import get_settings
    script = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "make_vapid_keys.py")
    out = subprocess.run([sys.executable, script], capture_output=True, text=True, check=True).stdout
    keys = dict(line.split("=", 1) for line in out.split())
    monkeypatch.setenv("VAPID_PUBLIC_KEY", keys["VAPID_PUBLIC_KEY"])
    monkeypatch.setenv("VAPID_PRIVATE_KEY", keys["VAPID_PRIVATE_KEY"])
    get_settings.cache_clear()
    seen = []

    class Resp:
        def __init__(self, code):
            self.status_code, self.text, self.content, self.headers, self.reason = code, "", b"", {}, "Gone"

    def fake_post(url, data=None, headers=None, timeout=None, **kw):
        seen.append((url, headers, len(data)))
        return Resp(410 if url.endswith("/dead") else 201)
    import requests
    monkeypatch.setattr(requests, "post", fake_post)
    sub = lambda ep: {"kind": "webpush", "endpoint": ep, "keys": _browser_keys()}
    payload = {"title": "नया काम", "body": "x", "url": "/home", "kind": "new_post"}
    r = push.send(db, [(1, sub("https://push.example/live"), payload), (2, sub("https://push.example/dead"), payload)])
    get_settings.cache_clear()
    assert r == {"sent": 1, "gone": 1}
    assert all(h["Content-Encoding"] == "aes128gcm" and h["Authorization"].startswith("vapid t=") for _, h, _ in seen)
    assert any("delete from public.push_subscriptions" in c[0] and c[1] == ([2],) for c in db.calls)
