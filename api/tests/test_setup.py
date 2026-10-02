"""Sprint 2: profile setup, fleet sync, place lookup, photo upload."""
import uuid

from conftest import make_token

UID = "11111111-1111-1111-1111-111111111111"
H = {"Authorization": f"Bearer {make_token()}"}


def prow(role="driver", **kw):
    return {"id": UID, "tenant_id": "vahanza", "role": role, "name": None, "business_name": None, "phone": "919876543210",
            "photo_url": None, "lang": "hi", "city": None, "district": None, "state": None, "pincode": None,
            "verified": False, "blocked": False, "setup_done": False, "created_at": None, **kw}


PLACE = {"district": "Rewa", "state": "Madhya Pradesh", "pincode": "486001", "lat": 24.53, "lng": 81.3}
DRIVER = {"vehicles": ["truck", "trailer"], "max_wheels": 14, "licence_type": "HMV", "licence_number": "MP17 2019 0012345",
          "experience_years": 8, "savings_wanted": 22000, "savings_negotiable": True, "pay_prefs": ["trip", "bhatta"],
          "work_type": "full", "area": "india", "languages": ["hi", "bg"], "available_from": "now"}


def test_driver_setup_finish(client, db):
    db.respond("from public.profiles where id", prow())
    db.respond("update public.profiles set", prow(name="Ramesh Singh", district="Rewa", state="Madhya Pradesh", setup_done=True))
    db.respond("from public.driver_details where", {**{k: v for k, v in DRIVER.items() if k != "licence_number"}, "licence_last4": "2345", "is_available": True})
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "  Ramesh   Singh ", "place": PLACE, "driver": DRIVER, "finish": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["profile"]["setup_done"] is True
    assert body["driver"]["licence_last4"] == "2345"
    upd = next(c for c in db.calls if "update public.profiles set" in c[0])
    assert upd[1][0] == "Ramesh Singh"                       # name cleaned
    ins = next(c for c in db.calls if "insert into public.driver_details" in c[0])
    assert "2345" in ins[1] and "MP17 2019 0012345" not in str(ins[1])   # full licence number never stored


def test_driver_quick_start_only_name_and_place(client, db):
    """First login asks only name + place; driver details come later from home."""
    db.respond("from public.profiles where id", prow())
    db.respond("update public.profiles set", prow(name="Ramesh", setup_done=True))
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Ramesh", "place": PLACE, "finish": True})
    assert r.status_code == 200, r.text
    assert r.json()["profile"]["setup_done"] is True
    assert not any("insert into public.driver_details" in c[0] for c in db.calls)


def test_driver_partial_details_saved(client, db):
    db.respond("from public.profiles where id", prow(setup_done=True))
    db.respond("update public.profiles set", prow(setup_done=True))
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Ramesh", "place": PLACE, "driver": {"vehicles": ["car"]}, "finish": True})
    assert r.status_code == 200, r.text
    ins = next(c for c in db.calls if "insert into public.driver_details" in c[0])
    cols = ins[0].split("(")[1].split(")")[0].split(", ")
    assert ins[1][cols.index("licence_type")] is None


def test_name_with_phone_rejected(client, db):
    db.respond("from public.profiles where id", prow())
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Ramesh 9876543210", "place": PLACE, "driver": DRIVER})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "name_has_number"


def test_wheels_dropped_for_car_only(client, db):
    db.respond("from public.profiles where id", prow())
    db.respond("update public.profiles set", prow())
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Raju", "place": PLACE, "driver": {**DRIVER, "vehicles": ["car"], "max_wheels": 14}})
    assert r.status_code == 200
    ins = next(c for c in db.calls if "insert into public.driver_details" in c[0])
    cols = ins[0].split("(")[1].split(")")[0].split(", ")
    assert ins[1][cols.index("max_wheels")] is None


def test_unusual_savings_flagged(client, db):
    db.respond("from public.profiles where id", prow())
    db.respond("update public.profiles set", prow())
    client.put("/api/v1/me/profile", headers=H, json={"name": "Raju", "place": PLACE, "driver": {**DRIVER, "savings_wanted": 400000}})
    upd = next(c for c in db.calls if "update public.profiles set" in c[0])
    assert "savings_unusual" in upd[1][9].obj


def test_owner_setup_with_fleet(client, db):
    db.respond("from public.profiles where id", prow("owner"))
    db.respond("update public.profiles set", prow("owner", setup_done=True))
    fleet = [{"vehicle_type": "truck", "wheels": 14, "vehicle_count": 5, "base_cities": ["Raipur, Chhattisgarh", "Raipur, Chhattisgarh"]},
             {"vehicle_type": "jcb", "wheels": 10, "vehicle_count": 1, "base_cities": []}]
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Vikram Singh", "business_name": "Singh Roadways", "place": PLACE, "fleet": fleet, "finish": True})
    assert r.status_code == 200, r.text
    inserts = [c for c in db.calls if "insert into public.fleet_groups" in c[0]]
    assert len(inserts) == 2
    assert inserts[0][1][5] == ["Raipur, Chhattisgarh"]      # duplicate city removed
    assert inserts[1][1][3] is None                           # JCB has no wheel count


def test_owner_quick_start_without_fleet(client, db):
    db.respond("from public.profiles where id", prow("owner"))
    db.respond("update public.profiles set", prow("owner", setup_done=True))
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Vikram", "place": PLACE, "finish": True})
    assert r.status_code == 200, r.text
    assert not any("fleet_groups" in c[0] and "insert" in c[0] for c in db.calls)


def test_fleet_group_in_use_cannot_be_removed(client, db):
    gid = str(uuid.uuid4())
    db.respond("from public.profiles where id", prow("owner", setup_done=True))
    db.respond("update public.profiles set", prow("owner", setup_done=True))
    db.respond("select id from public.fleet_groups", [{"id": gid}])
    db.respond("from public.post_groups", {"?column?": 1})
    r = client.put("/api/v1/me/profile", headers=H, json={"name": "Vikram", "place": PLACE, "fleet": [
        {"vehicle_type": "bus", "wheels": 6, "vehicle_count": 2, "base_cities": []}]})
    assert r.status_code == 409


def test_places_curated_hindi(client, db):
    r = client.get("/api/v1/geo/places", params={"q": "री"})
    assert r.status_code == 200
    assert r.json()[0]["value"] == "Rewa, Madhya Pradesh" and r.json()[0]["hi"] == "रीवा"


def test_places_falls_back_to_pincode_directory(client, db):
    db.respond("from public.pincodes", [{"district": "Rewari", "state": "Haryana"}, {"district": "Rewa", "state": "Madhya Pradesh"}])
    r = client.get("/api/v1/geo/places", params={"q": "rew"})
    values = [p["value"] for p in r.json()]
    assert values == ["Rewa, Madhya Pradesh", "Rewari, Haryana"]


def test_pincode_lookup(client, db):
    db.respond("from public.pincodes where pincode", {"pincode": "486001", "office": "Rewa", "district": "Rewa", "state": "Madhya Pradesh", "lat": 24.5, "lng": 81.3})
    r = client.get("/api/v1/geo/pincode/486001")
    assert r.status_code == 200 and r.json()["hi"] == "रीवा"
    assert client.get("/api/v1/geo/pincode/012345").status_code == 422
    assert client.get("/api/v1/geo/pincode/999999").status_code == 404


def test_photo_upload_dev(client, db, tmp_path, monkeypatch):
    from vz.config import get_settings
    monkeypatch.setattr(get_settings(), "dev_upload_dir", str(tmp_path))
    db.respond("select photo_url, tenant_id", {"photo_url": None, "tenant_id": "vahanza"})
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 100
    r = client.post("/api/v1/me/photo", headers={**H, "Content-Type": "image/jpeg"}, content=jpeg)
    assert r.status_code == 200, r.text
    url = r.json()["photo_url"]
    assert url.startswith("/api/v1/dev-files/")
    assert client.get(url).content == jpeg


def test_photo_rejects_non_image(client, db):
    r = client.post("/api/v1/me/photo", headers=H, content=b"<html>not an image</html>")
    assert r.status_code == 415
