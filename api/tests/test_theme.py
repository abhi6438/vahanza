"""Runtime brand theme: only the inputs are stored, admins only, published one is public."""
from conftest import make_token

H = {"Authorization": f"Bearer {make_token()}"}
ADMIN = {"id": "11111111-1111-1111-1111-111111111111", "tenant_id": "vahanza", "role": "admin", "blocked": False}
STATE = {"theme_draft": None, "theme_draft_at": None, "theme_published": None, "theme_published_at": None, "theme_version": 0}
GOOD = {"primaryColor": "#1d4ed8", "secondaryColor": None, "accentColor": "#F59E0B", "mode": "light", "radius": "rounded", "density": "compact", "preset": "blue"}


def test_public_theme_default_is_null(client, db):
    db.respond("select theme_published, theme_version", {"theme_published": None, "theme_version": 0})
    r = client.get("/api/v1/theme")
    assert r.status_code == 200 and r.json() == {"theme": None, "version": 0}
    assert "max-age=60" in r.headers["cache-control"]


def test_public_theme_published(client, db):
    db.respond("select theme_published, theme_version", {"theme_published": GOOD, "theme_version": 3})
    assert client.get("/api/v1/theme").json()["theme"]["primaryColor"] == "#1d4ed8"


def test_only_admins(client, db):
    db.respond("from public.profiles where id", dict(ADMIN, role="owner"))
    assert client.put("/api/v1/admin/theme/draft", headers=H, json=GOOD).status_code == 403


def test_publish_stores_clean_inputs_and_audits(client, db):
    db.respond("from public.profiles where id", ADMIN)
    db.respond("select theme_draft", dict(STATE, theme_version=1))
    r = client.post("/api/v1/admin/theme/publish", headers=H, json=GOOD)
    assert r.status_code == 200, r.text
    sql, params = next(c for c in db.calls if "theme_published = %s" in c[0])
    stored = params[1].obj
    assert stored["primaryColor"] == "#1D4ED8" and stored["radius"] == "rounded" and "buttonColor" not in stored
    assert "theme_version = coalesce(theme_version, 0) + 1" in sql
    assert any("theme_publish" in str(c[1]) for c in db.calls)


def test_draft(client, db):
    db.respond("from public.profiles where id", ADMIN)
    db.respond("select theme_draft", STATE)
    assert client.put("/api/v1/admin/theme/draft", headers=H, json=GOOD).status_code == 200
    assert any("theme_draft = %s" in c[0] for c in db.calls)


def test_rejects_per_component_colours_and_bad_values(client, db):
    for bad in (dict(GOOD, buttonColor="#000000"), dict(GOOD, primaryColor="red"), dict(GOOD, mode="neon"),
                dict(GOOD, primaryColor="#12345"), dict(GOOD, density="huge")):
        db.respond("from public.profiles where id", ADMIN)
        assert client.put("/api/v1/admin/theme/draft", headers=H, json=bad).status_code == 422, bad


def test_reset(client, db):
    db.respond("from public.profiles where id", ADMIN)
    db.respond("select theme_draft", STATE)
    assert client.delete("/api/v1/admin/theme/published", headers=H).status_code == 200
    assert any("theme_published = null" in c[0] for c in db.calls)


def test_manifest_follows_published_theme(client, db):
    db.respond("select name, theme_published", {"name": "Vahanza", "theme_published": dict(GOOD, headerColor="#2C457D")})
    r = client.get("/app.webmanifest")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/manifest+json")
    m = r.json()
    assert m["theme_color"] == "#2C457D" and m["background_color"] == "#2C457D" and m["name"] == "Vahanza"
    assert m["icons"][0]["src"] == "/icons/icon-192.png"


def test_manifest_default_brand_colours(client, db):
    db.respond("select name, theme_published", {"name": "Vahanza", "theme_published": None})
    m = client.get("/api/v1/manifest.webmanifest").json()
    assert m["theme_color"] == "#0A4D5A"          # brands/vahanza.json header
