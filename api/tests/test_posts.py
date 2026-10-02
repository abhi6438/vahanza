from conftest import make_token

H = {"Authorization": f"Bearer {make_token()}"}
G1, G2 = "aaaaaaaa-0000-0000-0000-000000000001", "aaaaaaaa-0000-0000-0000-000000000002"
ME = lambda role="owner", done=True: {"id": "11111111-1111-1111-1111-111111111111", "tenant_id": "vahanza", "role": role,
                                      "is_test": False, "blocked": False, "setup_done": done, "district": "Rewa",
                                      "location": None, "name": "X", "phone": "919800000000"}
BODY = {"groups": [{"fleet_group_id": G1, "drivers_needed": 2}], "savings_monthly": 20000}


def test_post_goes_live_when_checks_pass(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.fleet_groups where owner_id", {"n": 1})
    db.respond("from public.posts where owner_id", {"n": 0})
    db.respond("insert into public.posts", {"id": "p1", "status": "live"})
    r = client.post("/api/v1/posts", headers=H, json=BODY)
    assert r.status_code == 201 and r.json()["status"] == "live"
    ins = next(c for c in db.calls if "insert into public.posts" in c[0])
    assert ins[1][2] == "live"


def test_unusual_savings_goes_to_check(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.fleet_groups where owner_id", {"n": 1})
    db.respond("from public.posts where owner_id", {"n": 0})
    db.respond("insert into public.posts", {"id": "p1", "status": "under_check"})
    r = client.post("/api/v1/posts", headers=H, json={**BODY, "savings_monthly": 150000})
    ins = next(c for c in db.calls if "insert into public.posts" in c[0])
    assert ins[1][2] == "under_check" and r.json()["check_flags"] == ["savings_unusual"]


def test_duplicate_group_rejected(client, db):
    db.respond("from public.profiles where id", ME())
    r = client.post("/api/v1/posts", headers=H, json={**BODY, "groups": [{"fleet_group_id": G1, "drivers_needed": 1}] * 2})
    assert r.status_code == 422


def test_pay_out_of_range_rejected(client, db):
    r = client.post("/api/v1/posts", headers=H, json={**BODY, "pay_mix": {"comm": 90}})
    assert r.status_code == 422


def test_too_many_live_posts(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.fleet_groups where owner_id", {"n": 1})
    db.respond("from public.posts where owner_id", {"n": 10})
    assert client.post("/api/v1/posts", headers=H, json=BODY).status_code == 409


def test_driver_cannot_post_and_owner_cannot_list_jobs(client, db):
    db.respond("from public.profiles where id", ME("driver"))
    assert client.post("/api/v1/posts", headers=H, json=BODY).status_code == 403
    db.respond("from public.profiles where id", ME("owner"))
    assert client.get("/api/v1/jobs", headers=H).status_code == 403
