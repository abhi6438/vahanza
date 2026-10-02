from conftest import make_token

H = {"Authorization": f"Bearer {make_token()}"}
ME = lambda role="owner", test=False: {"id": "11111111-1111-1111-1111-111111111111", "tenant_id": "vahanza", "role": role,
                                       "is_test": test, "blocked": False, "district": "Rewa", "location": None}


def test_driver_cannot_see_driver_list(client, db):
    db.respond("from public.profiles where id", ME("driver"))
    assert client.get("/api/v1/drivers", headers=H).status_code == 403


def test_unknown_vehicle_rejected(client, db):
    db.respond("from public.profiles where id", ME())
    assert client.get("/api/v1/drivers", params={"vehicle": "rocket"}, headers=H).status_code == 422


def test_list_uses_viewer_test_flag(client, db):
    db.respond("from public.profiles where id", ME(test=True))
    db.respond("from public.profiles p", [])
    r = client.get("/api/v1/drivers", headers=H)
    assert r.status_code == 200 and r.json() == {"items": [], "has_more": False}
    sql, params = next(c for c in db.calls if "from public.profiles p" in c[0])
    assert params["test"] is True and "d.available_from is not null" in sql


def test_contact_rate_limited(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("contact_reveal", {"n": 60})
    r = client.post("/api/v1/drivers/22222222-2222-2222-2222-222222222222/contact", headers=H, json={"via": "call"})
    assert r.status_code == 429


def test_only_driver_sets_availability(client, db):
    db.respond("from public.profiles where id", ME("owner"))
    assert client.patch("/api/v1/me/availability", headers=H, json={"is_available": False}).status_code == 403
