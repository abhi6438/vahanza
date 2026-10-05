"""Sprint 8: public jobs, share links, referral boost, profile views, posters, daily job."""
from datetime import date

from conftest import make_token

UID = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
H = {"Authorization": f"Bearer {make_token()}"}


def prof(role="driver", **kw):
    return {"id": UID, "tenant_id": "vahanza", "role": role, "name": "Ramesh Singh", "business_name": None, "phone": "919876543210",
            "photo_url": None, "lang": "hi", "city": None, "district": "Rewa", "state": "Madhya Pradesh", "pincode": None,
            "verified": False, "blocked": False, "setup_done": False, "is_test": False, "created_at": None, **kw}


JOB = {"id": "33333333-3333-3333-3333-333333333333", "status": "live", "savings_monthly": 18000, "savings_negotiable": True,
       "pay_mix": {}, "base_cities": ["Rewa, Madhya Pradesh"], "coverage": None, "often_cities": [], "licence_type": None,
       "min_experience": 0, "work_type": "full", "facilities": [], "check_flags": ["x"], "created_at": None, "expires_at": None,
       "share_code": "ab12cd34", "groups": [], "owner_district": "Rewa", "owner_state": "Madhya Pradesh",
       "owner_verified": True, "owner_rating_avg": None, "owner_rating_count": 0}


# ---------------- public jobs (no login)
def test_public_jobs_need_no_login_and_hide_private_fields(client, db):
    db.respond("from public.posts p join public.profiles o", [dict(JOB)])
    r = client.get("/api/v1/public/jobs?district=Rewa")
    assert r.status_code == 200, r.text
    item = r.json()["items"][0]
    assert "check_flags" not in item and "owner_id" not in item and "phone" not in item and "owner_name" not in item
    sql, params = next(c for c in db.calls if "from public.posts p" in c[0])
    assert "not o.is_test" in sql and "not o.blocked" in sql and params["district"] == "Rewa"
    assert params["place_filter"] is False          # the old city chip only puts that city first


def test_public_jobs_unknown_vehicle(client):
    assert client.get("/api/v1/public/jobs?vehicle=rocket").status_code == 422


def test_public_stats(client, db):
    db.respond("count(*) as posts", {"posts": 4, "drivers": 9, "posts_here": 2, "drivers_here": 5})
    r = client.get("/api/v1/public/stats?district=Rewa")
    assert r.json() == {"posts": 4, "drivers": 9, "posts_here": 2, "drivers_here": 5, "hired": 0, "hired_here": 0, "district": "Rewa"}


def test_public_job_by_code(client, db):
    db.respond("p.share_code = %(code)s", dict(JOB, open=True))
    r = client.get("/api/v1/public/jobs/ab12cd34")
    assert r.status_code == 200 and r.json()["open"] is True
    assert client.get("/api/v1/public/jobs/zzzz").status_code == 404


def test_invite_lookup_returns_10_digit_number(client, db):
    db.respond("from public.prospects where", {"role": "driver", "name": "Suresh Kumar", "phone": "919812345678"})
    assert client.get("/api/v1/public/invite/abc123").json() == {"role": "driver", "name": "Suresh", "phone": "9812345678"}


# ---------------- share pages
def test_job_share_page_has_preview_and_no_owner(client, db):
    db.respond("from public.tenants", {"name": "Vahanza"})
    db.respond("p.share_code = %s", {"savings_monthly": 18000, "base_cities": ["Rewa, Madhya Pradesh"], "district": "Rewa",
                                     "open": True, "vehicles": ["truck", "truck"], "need": 3})
    r = client.get("/j/ab12cd34", follow_redirects=False)
    assert r.status_code == 200
    assert 'property="og:title" content="Rewa में ट्रक के लिए 3 ड्राइवर चाहिए"' in r.text
    assert "₹18,000" in r.text and "/jobs/ab12cd34?s=share" in r.text


def test_poster_qr_redirects(client):
    r = client.get("/q/K7P2QX", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "/?poster=K7P2QX"


# ---------------- attribution + referral boost
def test_start_saves_referral_source(client, db):
    db.respond("from public.tenants where id", {"?column?": 1})
    db.respond("insert into public.profiles", prof())
    db.respond("where ref_code = %s and tenant_id", {"id": OTHER})
    r = client.post("/api/v1/me", headers=H, json={"role": "driver", "source": {"via": "ref", "code": "k7p2qx"}})
    assert r.status_code == 200, r.text
    upd = next(c for c in db.calls if "set joined_via" in c[0])
    assert upd[1][:3] == ("ref", "k7p2qx", OTHER) and "joined_via is null" in upd[0]


def test_unknown_referral_code_counts_as_direct(client, db):
    db.respond("from public.tenants where id", {"?column?": 1})
    db.respond("insert into public.profiles", prof())
    client.post("/api/v1/me", headers=H, json={"role": "driver", "source": {"via": "ref", "code": "NOPE"}})
    upd = next(c for c in db.calls if "set joined_via" in c[0])
    assert upd[1][:3] == ("direct", None, None)


def test_first_finish_rewards_referrer_once(client, db):
    db.respond("from public.profiles where id", prof())
    db.respond("update public.profiles set\n          name", prof(setup_done=True))
    db.respond("set ref_rewarded = true", {"referred_by": OTHER, "name": "Ramesh Singh"})
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Ramesh Singh", "place": {"district": "Rewa", "state": "Madhya Pradesh"}, "finish": True})
    assert r.status_code == 200, r.text
    boost = next(c for c in db.calls if "set boost_until" in c[0])
    assert boost[1] == (7, OTHER)
    note = next(c for c in db.calls if "insert into public.notifications" in c[0])
    assert note[1][1] == "referral_joined"


def test_later_saves_do_not_reward(client, db):
    db.respond("from public.profiles where id", prof(setup_done=True))
    db.respond("update public.profiles set", prof(setup_done=True))
    client.put("/api/v1/me/profile", headers=H, json={"name": "Ramesh Singh", "place": {"district": "Rewa", "state": "Madhya Pradesh"}, "finish": True})
    assert not any("ref_rewarded" in c[0] for c in db.calls)


def test_new_number_from_import_gets_suggested_role(client, db):
    db.respond("from public.prospects where tenant_id", {"role": "owner"})
    assert client.get("/api/v1/me", headers=H).json()["suggested_role"] == "owner"


def test_licence_expiry_validated(client, db):
    db.respond("from public.profiles where id", prof())
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Ramesh", "place": {"district": "Rewa", "state": "MP"}, "driver": {"licence_expiry": "1990-01-01"}})
    assert r.status_code == 422


# ---------------- profile views
def test_only_owners_count_views(client, db):
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "driver", "blocked": False, "is_test": False})
    assert client.post(f"/api/v1/drivers/{OTHER}/view", headers=H).status_code == 204
    assert not any("profile_views" in c[0] for c in db.calls)


def test_owner_view_recorded_once_a_day(client, db):
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "owner", "blocked": False, "is_test": False})
    client.post(f"/api/v1/drivers/{OTHER}/view", headers=H)
    ins = next(c for c in db.calls if "insert into public.profile_views" in c[0])
    assert "on conflict do nothing" in ins[0] and ins[1][4] is False


# ---------------- posters + growth numbers
def test_posters_admin_only(client, db):
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "driver", "blocked": False})
    assert client.post("/api/v1/admin/posters", headers=H, json={"place": "Rewa transport nagar"}).status_code == 403


def test_admin_creates_poster(client, db):
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "admin", "blocked": False})
    db.respond("insert into public.posters", {"id": 1, "code": "K7P2QX", "place": "Rewa transport nagar", "district": None, "state": None,
                                              "created_at": date(2026, 10, 5)})
    r = client.post("/api/v1/admin/posters", headers=H, json={"place": "Rewa transport nagar"})
    assert r.status_code == 201 and r.json()["code"] == "K7P2QX" and r.json()["joined"] == 0


def test_my_growth_makes_code_once(client, db):
    db.respond("from public.profiles where id", {"id": UID, "tenant_id": "vahanza", "role": "driver", "blocked": False, "is_test": False})
    db.respond("select ref_code from public.profiles", {"ref_code": "K7P2QX"})
    db.respond("select p.boost_until", {"boost_until": None, "joined": 2, "completed": 1, "views_week": 3, "views_total": 9})
    r = client.get("/api/v1/me/growth", headers=H)
    assert r.json() == {"ref_code": "K7P2QX", "joined": 2, "completed": 1, "boost_until": None, "boost_days": 7, "views_week": 3, "views_total": 9, "looking_due": False}


# ---------------- daily job
def test_cron_needs_secret(client, monkeypatch):
    from vz.config import get_settings
    assert client.get("/api/v1/cron/daily").status_code == 503
    monkeypatch.setattr(get_settings(), "cron_secret", "s3cret")
    assert client.get("/api/v1/cron/daily", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/v1/cron/daily", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_daily_sends_views_only_on_monday(db):
    from vz import growth
    assert "views" not in growth.daily(db, date(2026, 10, 6))       # Tuesday
    assert "views" in growth.daily(db, date(2026, 10, 5))           # Monday


def test_codes_are_easy_to_read():
    from vz import growth
    c = growth.new_code()
    assert len(c) == 6 and not set(c) & set("01OI")


def test_public_drivers_hide_full_name_photo_and_id(client, db):
    db.respond("from public.profiles p join public.driver_details d on", [{
        "name": "Ramesh Kumar Singh", "district": "Rewa", "state": "Madhya Pradesh", "verified": True, "rating_avg": None,
        "rating_count": 0, "jobs_done": 2, "top": False, "vehicles": ["truck"], "max_wheels": 14, "licence_type": "HMV",
        "experience_years": 8, "savings_wanted": 18000, "savings_negotiable": True, "pay_prefs": None, "work_type": None,
        "area": None, "languages": None, "available_from": "now"}])
    r = client.get("/api/v1/public/drivers?district=Rewa")
    item = r.json()["items"][0]
    assert item["name"] == "Ramesh K." and "id" not in item and "photo_url" not in item and "phone" not in item
    sql = next(c for c in db.calls if "driver_details d on" in c[0])[0]
    assert "not p.is_test" in sql and "d.is_available" in sql
