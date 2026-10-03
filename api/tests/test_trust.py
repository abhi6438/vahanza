from conftest import make_token

H = {"Authorization": f"Bearer {make_token()}"}
UID = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
ME = lambda role="driver": {"id": UID, "tenant_id": "vahanza", "role": role, "blocked": False, "is_test": False}


def test_cannot_block_self(client, db):
    db.respond("from public.profiles where id", ME())
    assert client.post(f"/api/v1/blocks/{UID}", headers=H).status_code == 422


def test_rating_needs_contact(client, db):
    db.respond("from public.profiles where id", ME("driver"))
    db.respond("from public.profiles where id = %s and tenant_id", {"id": OTHER, "role": "owner", "name": "X"})
    db.respond("as ok", {"ok": False})
    r = client.post("/api/v1/ratings", headers=H, json={"ratee_id": OTHER, "stars": 5})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "not_in_touch"


def test_rating_tags_follow_role(client, db):
    db.respond("from public.profiles where id", ME("driver"))
    db.respond("from public.profiles where id = %s and tenant_id", {"id": OTHER, "role": "owner", "name": "X"})
    r = client.post("/api/v1/ratings", headers=H, json={"ratee_id": OTHER, "stars": 5, "tags": ["sober"]})
    assert r.status_code == 422


def test_second_reporter_flags_profile(client, db):
    db.respond("from public.profiles where id", ME())
    db.respond("from public.profiles where id = %s and tenant_id", {"id": OTHER, "role": "owner", "name": "X"})
    db.respond("count(distinct reporter_id)", {"n": 2})
    r = client.post("/api/v1/reports", headers=H, json={"target_type": "profile", "target_id": OTHER, "reason": "asked_money"})
    assert r.status_code == 201
    assert any("'[\"reported\"]'" in c[0] for c in db.calls)
