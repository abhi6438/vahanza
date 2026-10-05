"""Sprint 10: hires ("got the job"), job views, still looking, verification by photo, digests."""
from datetime import date

from conftest import make_token

UID = "11111111-1111-1111-1111-111111111111"
DRV = "22222222-2222-2222-2222-222222222222"
POST = "33333333-3333-3333-3333-333333333333"
H = {"Authorization": f"Bearer {make_token()}"}


def me(role, **kw):
    return {"id": UID, "tenant_id": "vahanza", "role": role, "blocked": False, "name": "Ramesh Singh", "business_name": "Singh Roadways",
            "is_test": False, "verified": False, **kw}


# ---------------- hires
def test_only_candidates_can_be_marked_hired(client, db):
    db.respond("from public.profiles where id", me("owner"))
    db.respond("from public.posts where id = %s and owner_id", {"id": POST, "status": "live"})
    db.respond("group by p.id", [])          # nobody showed interest / was contacted
    r = client.post(f"/api/v1/posts/{POST}/hires", headers=H, json={"driver_ids": [DRV]})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "not_a_candidate"


def test_mark_hired_fills_post_and_asks_driver(client, db):
    db.respond("from public.profiles where id", me("owner"))
    db.respond("from public.posts where id = %s and owner_id", {"id": POST, "status": "live"})
    db.respond("group by p.id", [{"id": DRV, "name": "Suresh", "photo_url": None, "district": None, "state": None, "interested": True}])
    db.respond("insert into public.hires", {"id": 7})
    r = client.post(f"/api/v1/posts/{POST}/hires", headers=H, json={"driver_ids": [DRV]})
    assert r.status_code == 200 and r.json() == {"post_id": POST, "status": "filled", "asked": 1}
    assert any("set status = 'filled'" in c[0] for c in db.calls)
    note = next(c for c in db.calls if "insert into public.notifications" in c[0])
    assert note[1][1] == "hire_confirm"


def test_hired_outside_app_just_fills(client, db):
    db.respond("from public.profiles where id", me("owner"))
    db.respond("from public.posts where id = %s and owner_id", {"id": POST, "status": "live"})
    r = client.post(f"/api/v1/posts/{POST}/hires", headers=H, json={"driver_ids": []})
    assert r.json()["asked"] == 0 and not any("insert into public.hires" in c[0] for c in db.calls)


def test_driver_cannot_mark_hires(client, db):
    db.respond("from public.profiles where id", me("driver"))
    assert client.post(f"/api/v1/posts/{POST}/hires", headers=H, json={"driver_ids": []}).status_code == 403


def test_confirm_counts_and_turns_availability_off(client, db):
    db.respond("from public.profiles where id", me("driver"))
    db.respond("update public.hires set status", {"owner_id": DRV})
    r = client.post("/api/v1/hires/7/answer", headers=H, json={"confirm": True})
    assert r.json() == {"id": 7, "status": "confirmed", "available": False}
    assert any("jobs_done = jobs_done + 1" in c[0] for c in db.calls)
    assert any("is_available = false" in c[0] for c in db.calls)
    assert next(c for c in db.calls if "insert into public.notifications" in c[0])[1][1] == "hire_done"


def test_decline_changes_nothing_else(client, db):
    db.respond("from public.profiles where id", me("driver"))
    db.respond("update public.hires set status", {"owner_id": DRV})
    client.post("/api/v1/hires/7/answer", headers=H, json={"confirm": False})
    assert not any("jobs_done" in c[0] for c in db.calls)


def test_answer_only_own_pending(client, db):
    db.respond("from public.profiles where id", me("driver"))
    assert client.post("/api/v1/hires/7/answer", headers=H, json={"confirm": True}).status_code == 404


# ---------------- views + still looking
def test_job_view_only_for_drivers(client, db):
    db.respond("from public.profiles where id", me("owner"))
    client.post(f"/api/v1/jobs/{POST}/view", headers=H)
    assert not any("post_views" in c[0] for c in db.calls)


def test_still_looking_no_turns_off(client, db):
    db.respond("from public.profiles where id", me("driver"))
    r = client.post("/api/v1/me/looking", headers=H, json={"still": False})
    assert r.json() == {"is_available": False}
    ins = next(c for c in db.calls if "looking_checked_at" in c[0])
    assert ins[1][2] is False


# ---------------- verification
def test_verification_photo_must_be_image(client, db):
    db.respond("from public.profiles where id", me("driver"))
    r = client.put("/api/v1/me/verification/doc", headers={**H, "Content-Type": "image/jpeg"}, content=b"not an image")
    assert r.status_code == 415


def test_submit_needs_both_photos(client, db):
    db.respond("from public.profiles where id", me("driver"))
    r = client.post("/api/v1/me/verification/submit", headers=H)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "photos_needed"


def test_verified_people_cannot_upload_again(client, db):
    db.respond("from public.profiles where id", me("driver", verified=True))
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 50
    assert client.put("/api/v1/me/verification/doc", headers={**H, "Content-Type": "image/jpeg"}, content=jpeg).status_code == 409


def test_reject_needs_reason_and_approve_sets_badge(client, db, monkeypatch):
    from vz import blob
    deleted = []
    monkeypatch.setattr(blob, "delete", lambda url: deleted.append(url))
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "admin", "blocked": False})
    assert client.post("/api/v1/admin/verifications/3/review", headers=H, json={"action": "reject"}).status_code == 422
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "admin", "blocked": False})
    db.respond("select doc_url, selfie_url from public.verifications", {"doc_url": "d.jpg", "selfie_url": "s.jpg"})
    db.respond("update public.verifications set status", {"profile_id": DRV})
    r = client.post("/api/v1/admin/verifications/3/review", headers=H, json={"action": "approve"})
    assert r.json() == {"id": 3, "status": "approved"}
    assert any("set verified = true" in c[0] for c in db.calls)
    assert deleted == ["d.jpg", "s.jpg"]                         # photos are not kept


def test_verification_queue_admin_only(client, db):
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "owner", "blocked": False})
    assert client.get("/api/v1/admin/verifications", headers=H).status_code == 403


# ---------------- daily
def test_daily_runs_trust_jobs(db):
    from vz import growth
    tue = growth.daily(db, date(2026, 10, 6))
    mon = growth.daily(db, date(2026, 10, 5))
    assert {"still_looking", "come_back"} <= set(tue) and "weekly_jobs" not in tue
    assert {"weekly_jobs", "post_views"} <= set(mon)
