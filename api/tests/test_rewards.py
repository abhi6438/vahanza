"""Rewards: points, ticks, Premium (points + paid), Premium gates."""
from datetime import datetime, timedelta, timezone

from conftest import make_token
from vz import rewards as R

H = {"Authorization": f"Bearer {make_token()}"}
ME = {"id": "11111111-1111-1111-1111-111111111111", "tenant_id": "vahanza", "role": "driver", "blocked": False, "name": "Sunil Verma",
      "phone": "919811177003", "points": 600, "tick": "blue", "premium_until": None, "is_test": False}
LATER = datetime.now(timezone.utc) + timedelta(days=10)


def test_award_once_and_cap(db):
    db.respond("insert into public.reward_ledger", {"points": 100})
    assert R.award(db, "vahanza", "u1", "history_confirmed", "e1") == 100
    assert any("set points = points + %s" in c[0] for c in db.calls)
    # already given (insert returns nothing) → 0, no balance change
    db.calls.clear()
    assert R.award(db, "vahanza", "u1", "history_confirmed", "e1") == 0
    assert not any("points = points +" in c[0] for c in db.calls)
    # capped kind
    db.respond("count(*) as n from public.reward_ledger", {"n": 5})
    assert R.award(db, "vahanza", "u1", "history_add", "e9") == 0
    # wrong role
    assert R.award(db, "vahanza", "u1", "post_live", "p1", role="driver") == 0


def test_once_kinds_use_empty_ref(db):
    db.respond("insert into public.reward_ledger", {"points": 50})
    R.award(db, "vahanza", "u1", "profile_done", "anything")
    ins = next(c for c in db.calls if "insert into public.reward_ledger" in c[0])[1]
    assert ins[4] == ""


def test_premium_with_points(client, db):
    db.respond("from public.profiles where id", ME)
    db.respond("set points = points - %s", {"points": 100})
    db.respond("set premium_until = greatest", {"premium_until": LATER})
    r = client.post("/api/v1/me/premium/points", headers=H, json={"plan": "m1"})
    assert r.status_code == 200 and r.json()["premium"] is True
    spent = next(c for c in db.calls if "insert into public.reward_ledger" in c[0])[1]
    assert spent[2] == "premium" and spent[3] == -500


def test_premium_not_enough_points(client, db):
    db.respond("from public.profiles where id", dict(ME, points=20))
    r = client.post("/api/v1/me/premium/points", headers=H, json={"plan": "m3"})
    assert r.status_code == 409 and r.json()["detail"]["need"] == 1300
    assert not any("premium_until" in c[0] and "update" in c[0] for c in db.calls)


def test_no_money_anywhere(client, db):
    # paid routes are gone; plans carry points only
    assert client.post("/api/v1/me/premium/order", headers=H, json={"plan": "m1"}).status_code in (404, 405)
    assert client.post("/api/v1/hooks/razorpay", content=b"{}").status_code in (404, 405)
    assert all(set(p) == {"days", "points"} for role in R.PLANS.values() for p in role.values())


def test_referral_gives_both_sides_and_milestone(db):
    db.respond("from public.driver_details where profile_id", {"ok": 1})
    db.respond("insert into public.reward_ledger", {"points": 50})                  # profile_done (friend)
    db.respond("select f.referred_by", {"referred_by": "inviter", "inviter_role": "driver"})
    db.respond("insert into public.reward_ledger", {"points": 50})                  # joined_invite (friend)
    db.respond("insert into public.reward_ledger", {"points": 100})                 # referral (inviter)
    db.respond("count(*) as n from public.reward_ledger where user_id = %s and kind = 'referral'", {"n": 3})
    db.respond("insert into public.reward_ledger", {"points": 100})                 # 3 friends bonus
    R.check_profile(db, "vahanza", "friend", "driver")
    ins = [c[1] for c in db.calls if "insert into public.reward_ledger" in c[0]]
    kinds = [(p[1], p[2]) for p in ins]
    assert ("friend", "joined_invite") in kinds and ("inviter", "referral") in kinds
    assert ("inviter", "referral_bonus") in kinds and any(p[2] == "referral_bonus" and p[4] == "3" for p in ins)


def test_invite_status_next_mark(db):
    db.respond("kind = 'referral'", {"n": 4})
    s = R.invite_status(db, "vahanza", "u1")
    assert s["friends"] == 4 and s["next"] == {"at": 10, "points": 300} and s["per_friend"] == 100
    assert [m["done"] for m in s["milestones"]] == [True, False, False]


def test_full_history_is_premium_for_owners(client, db):
    owner = dict(ME, role="owner")
    rows = [{"id": f"e{i}", "owner_id": None, "owner_name": "Shyam", "firm_name": "Shyam Roadways", "owner_district": "Satna",
             "owner_state": "MP", "vehicle": "bus", "wheels": None, "start_month": datetime(2021, 5, 1).date(), "end_month": None,
             "work_type": None, "area": None, "note": None, "source": "driver", "status": "confirmed", "owner_answer": "yes",
             "owner_stars": 5, "owner_tags": ["safe"], "rehire": True, "invite_count": 0, "invited_at": None, "answered_at": None,
             "hidden": False, "created_at": None} for i in range(3)]
    db.respond("from public.profiles where id", owner)
    db.respond("select premium_until from public.profiles", {"premium_until": None})
    db.respond("from public.work_history h join public.profiles d", rows)
    r = client.get("/api/v1/drivers/22222222-2222-2222-2222-222222222222/history", headers=H).json()
    assert r["locked"] is True and r["more"] == 2 and len(r["items"]) == 1
    assert r["items"][0]["owner_stars"] is None and r["summary"]["confirmed"] == 3
    db.respond("from public.profiles where id", owner)
    db.respond("select premium_until from public.profiles", {"premium_until": LATER})
    db.respond("from public.work_history h join public.profiles d", rows)
    r = client.get("/api/v1/drivers/22222222-2222-2222-2222-222222222222/history", headers=H).json()
    assert r["locked"] is False and len(r["items"]) == 3 and r["items"][0]["owner_stars"] == 5


def test_tick_filter_needs_premium(client, db):
    db.respond("from public.profiles where id", {"id": ME["id"], "tenant_id": "vahanza", "role": "owner", "is_test": False,
                                                  "blocked": False, "district": "Rewa", "location": None})
    db.respond("select premium_until from public.profiles", {"premium_until": None})
    assert client.get("/api/v1/drivers?tick=gold", headers=H).status_code == 402


def test_profile_viewers_names_only_for_premium(client, db):
    db.respond("from public.profiles where id", ME)
    db.respond("from public.profile_views where driver_id", {"week": 3, "month": 7})
    r = client.get("/api/v1/me/profile-viewers", headers=H).json()
    assert r == {"week": 3, "month": 7, "premium": False, "items": []}


def test_admin_black_tick_and_premium(client, db):
    db.respond("from public.profiles where id", {"id": ME["id"], "tenant_id": "vahanza", "role": "admin", "blocked": False})
    db.respond("role in ('driver', 'owner')", {"id": "x", "role": "driver"})
    db.respond("set premium_until = greatest", {"premium_until": LATER})
    db.respond("select tick, tick_black, points, premium_until", {"tick": "black", "tick_black": True, "points": 10, "premium_until": LATER})
    r = client.post("/api/v1/admin/users/x/rewards", headers=H, json={"black": True, "premium_days": 30})
    assert r.status_code == 200 and r.json()["tick"] == "black" and r.json()["premium"] is True
    assert any("set tick_black = %s" in c[0] for c in db.calls)
    assert any("insert into public.admin_actions" in c[0] for c in db.calls)


def test_tick_step_up_rings_and_gold_gives_premium(db):
    db.respond("update public.profiles p set tick = public.vz_tick", {"tick": "gold", "old": "blue"})
    db.respond("set premium_until = greatest", {"premium_until": LATER})
    assert R.refresh_tick(db, "vahanza", "u1") == "gold"
    assert any("insert into public.notifications" in c[0] for c in db.calls)
    assert any("insert into public.premium_passes" in c[0] and c[1][3] == "gold" for c in db.calls)


def test_cross_role_friend_gets_more(db):
    R.clear_cache()
    db.respond("from public.fleet_groups where owner_id", {"ok": 1})
    db.respond("insert into public.reward_ledger", {"points": 50})                  # profile_done
    db.respond("select f.referred_by", {"referred_by": "drv", "inviter_role": "driver"})  # a driver brought an owner
    R.check_profile(db, "vahanza", "own1", "owner")
    ref = [c[1] for c in db.calls if "insert into public.reward_ledger" in c[0] and c[1][2] == "referral"]
    assert ref and ref[0][3] == 150


def test_admin_config_overrides_points(db):
    R.clear_cache()
    db.respond("select rewards_config from public.tenants", {"rewards_config": {"earn": {"history_add": {"points": 25, "cap": None, "on": True}},
                                                                             "free": {"trial_days": 0}}})
    cfg = R.config(db, "brandx")
    assert cfg["earn"]["history_add"]["points"] == 25 and cfg["earn"]["referral"]["points"] == 100
    assert cfg["free"]["trial_days"] == 0 and cfg["free"]["gold_days"] == 30
    db.respond("insert into public.reward_ledger", {"points": 25})
    assert R.award(db, "brandx", "u1", "history_add", "e1") == 25
    assert R.grant_trial(db, "brandx", "u1") is False          # trial switched off by the admin
    R.clear_cache()


def test_streak_bonus_every_n_days(db):
    R.clear_cache()
    db.respond("update public.profiles set\n             streak_days", {"streak_days": 7, "role": "driver"})
    db.respond("'streak'", {"points": 50})
    assert R.checkin(db, "vahanza", "u1") == 7
    assert any("insert into public.reward_ledger" in c[0] and c[1][2] == "streak" and c[1][3] == 50 for c in db.calls)


def test_challenge_done_gives_points_once(db, monkeypatch):
    from datetime import date
    today = date.today().isoformat()
    ch = {"id": "oct", "title_hi": "2 दोस्त", "kind": "referral", "target": 2, "points": 200, "roles": ["driver"], "start": today, "end": today, "on": True}
    monkeypatch.setitem(R._CACHE, "vahanza", (10**12, R._merge(R.DEFAULTS, {"challenges": [ch]})))
    db.respond("select role from public.profiles", {"role": "driver"})
    db.respond("count(*) as n from public.reward_ledger where user_id = %s and kind = %s\n             and created_at", {"n": 2})
    db.respond("'challenge'", {"points": 200})
    db.respond("insert into public.reward_ledger", {"points": 200})
    assert R.check_challenges(db, "vahanza", "u1", "referral") == 200
    R.clear_cache()


def test_admin_saves_config_with_bounds(client, db):
    admin = dict(ME, role="admin")
    db.respond("from public.profiles where id", admin)
    body = R._merge(R.DEFAULTS, {})
    body["earn"]["referral"]["points"] = 250
    body["challenges"] = [{"id": "c1", "title_hi": "पोस्ट डालो", "kind": "post_live", "target": 2, "points": 100,
                           "roles": ["owner"], "start": "2026-10-01", "end": "2026-10-31", "on": True}]
    r = client.put("/api/v1/admin/rewards/config", headers=H, json=body)
    assert r.status_code == 200, r.text
    saved = next(c for c in db.calls if "set rewards_config" in c[0])[1][0].obj
    assert saved["earn"]["referral"]["points"] == 250 and saved["challenges"][0]["id"] == "c1"
    # a challenge on an unknown action is refused
    db.respond("from public.profiles where id", admin)
    body["challenges"][0]["kind"] = "nonsense"
    assert client.put("/api/v1/admin/rewards/config", headers=H, json=body).status_code == 422
    R.clear_cache()


def test_admin_can_end_premium(client, db):
    db.respond("from public.profiles where id", dict(ME, role="admin"))
    db.respond("role in ('driver', 'owner')", {"id": "x", "role": "driver"})
    db.respond("select tick, tick_black, points, premium_until", {"tick": None, "tick_black": False, "points": 0, "premium_until": None})
    r = client.post("/api/v1/admin/users/x/rewards", headers=H, json={"premium_off": True})
    assert r.status_code == 200 and r.json()["premium"] is False
    assert any("premium_until = now()" in c[0] for c in db.calls)
