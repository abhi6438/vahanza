from conftest import make_token

H = {"Authorization": f"Bearer {make_token()}"}
ME = lambda role, tenant="vahanza": {"id": "11111111-1111-1111-1111-111111111111", "tenant_id": tenant, "role": role, "blocked": False}


def test_non_admin_forbidden(client, db):
    db.respond("from public.profiles where id", ME("owner"))
    assert client.get("/api/v1/admin/queue", headers=H).status_code == 403


def test_admin_limited_to_own_brand(client, db):
    db.respond("from public.profiles where id", ME("admin", "otherbrand"))
    assert client.get("/api/v1/admin/queue", headers=H).status_code == 403


def test_super_admin_any_brand_and_audit(client, db):
    db.respond("from public.profiles where id", ME("super_admin", "otherbrand"))
    db.respond("update public.posts", {"id": "p1"})
    r = client.post("/api/v1/admin/posts/22222222-2222-2222-2222-222222222222/review", headers=H, json={"action": "approve"})
    assert r.status_code == 200 and r.json()["status"] == "live"
    audit = next(c for c in db.calls if "insert into public.admin_actions" in c[0])
    assert audit[1][2] == "approve_post"


def test_patch_user_needs_a_change(client, db):
    db.respond("from public.profiles where id", ME("admin"))
    assert client.patch("/api/v1/admin/users/22222222-2222-2222-2222-222222222222", headers=H, json={}).status_code == 422
