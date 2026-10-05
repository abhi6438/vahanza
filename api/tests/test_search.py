"""Search box + filters shared by the four lists (vz/search.py)."""
from conftest import make_token
from vz import search as S

H = {"Authorization": f"Bearer {make_token()}"}
OWNER = {"id": "11111111-1111-1111-1111-111111111111", "tenant_id": "vahanza", "role": "owner", "is_test": False,
         "blocked": False, "district": "Satna", "location": None}
DRIVER = dict(OWNER, role="driver")


def _list_call(db, needle):
    return next(c for c in db.calls if needle in c[0])


def test_parse_city_hindi_and_english(db):
    p = S.parse_q(db, "रीवा")
    assert (p.district, p.text) == ("Rewa", None)
    p = S.parse_q(db, "truck rewa")
    assert p.vehicle == "truck" and p.district == "Rewa"
    p = S.parse_q(db, "ट्रक")
    assert p.vehicle == "truck" and p.district is None and p.text is None


def test_parse_pincode(db):
    db.respond("where pincode = %s", {"district": "Rewa", "state": "Madhya Pradesh"})
    p = S.parse_q(db, "486 001")
    assert p.pincode == "486001" and p.district == "Rewa"
    assert S.parse_q(db, "999999").nothing           # unknown pincode: nothing found, not "everything"


def test_phone_numbers_are_never_searched(db):
    p = S.parse_q(db, "9876543210")
    assert p.text is None and p.district is None and not p.nothing and not db.calls
    p = S.parse_q(db, "ramesh 98765 43210")
    assert p.text == "ramesh"


def test_free_text_and_like_escaping(db):
    p = S.parse_q(db, "Shree_Ram%")
    assert p.text == "Shree_Ram%"
    assert S._like(p.text) == "%Shree\\_Ram\\%%"


def test_owner_driver_list_filters(client, db):
    db.respond("from public.profiles where id", OWNER)
    db.respond("join public.driver_details d on", [{"id": "a", "name": "Ramu", "last_seen_at": None, "rating_avg": 4.5, "total": 7}])
    r = client.get("/api/v1/drivers", headers=H, params={
        "q": "Rewa", "radius": 25, "licence": "LMV", "exp_min": 3, "savings_max": 15000, "available": "w1",
        "rating_min": 4, "langs": "hi,bg", "wheels": 10, "sort": "rating", "limit": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 7 and body["has_more"] is True and body["place"] == "Rewa" and "total" not in body["items"][0]
    sql, p = _list_call(db, "join public.driver_details d on")
    assert p["place_filter"] is True and p["radius_m"] == 25000 and p["district"] == "Rewa"
    assert p["lic_ok"] == ["LMV", "HMV", "Transport"] and p["avail"] == ["now", "w1"] and p["langs"] == ["hi", "bg"]
    assert p["exp_min"] == 3 and p["savings_max"] == 15000 and p["wheels"] == 10 and p["rating_min"] == 4
    assert "p.rating_avg desc nulls last" in sql and "count(*) over ()" in sql
    assert "phone" not in sql.split("from public.profiles p")[1].split("order by")[0]   # number is never searched


def test_driver_list_city_default_radius(client, db):
    db.respond("from public.profiles where id", OWNER)
    client.get("/api/v1/drivers", headers=H, params={"place": "Rewa, Madhya Pradesh"})
    p = _list_call(db, "join public.driver_details d on")[1]
    assert p["place_filter"] is True and p["radius_m"] == S.DEFAULT_RADIUS * 1000


def test_driver_list_any_distance_only_sorts(client, db):
    db.respond("from public.profiles where id", OWNER)
    client.get("/api/v1/drivers", headers=H, params={"place": "Rewa, Madhya Pradesh", "radius": 0})
    p = _list_call(db, "join public.driver_details d on")[1]
    assert p["place_filter"] is False and p["district"] == "Rewa"


def test_bad_filter_values(client, db):
    for params in ({"radius": 30}, {"langs": "xx"}, {"licence": "ABC"}, {"sort": "cheap"}, {"available": "soon"}):
        db.respond("from public.profiles where id", OWNER)
        assert client.get("/api/v1/drivers", headers=H, params=params).status_code == 422, params


def test_job_list_filters(client, db):
    db.respond("from public.profiles where id", DRIVER)
    client.get("/api/v1/jobs", headers=H, params={
        "savings_min": 12000, "work": "full", "coverage": "state,india", "facilities": "stay,food",
        "new_days": 3, "vehicle": "bus", "wheels": 12, "verified": True, "sort": "pay", "q": "Shree Transport"})
    sql, p = _list_call(db, "from public.posts p")
    assert p["savings_min"] == 12000 and p["work"] == ["full"] and p["coverage"] == ["state", "india"]
    assert p["facilities"] == ["stay", "food"] and p["new_days"] == 3 and p["vehicle"] == "bus" and p["wheels"] == 12
    assert p["text"] == "Shree Transport" and "o.business_name ilike" in sql and "p.savings_monthly desc" in sql


def test_public_jobs_never_search_owner_firm(client, db):
    r = client.get("/api/v1/public/jobs", params={"q": "Shree", "facilities": "stay"})
    assert r.status_code == 200
    sql, p = _list_call(db, "from public.posts p")
    assert "business_name" not in sql and p["facilities"] == ["stay"] and r.json()["total"] == 0


def test_public_drivers_first_name_only(client, db):
    client.get("/api/v1/public/drivers", params={"q": "Ramesh", "sort": "new"})
    sql, p = _list_call(db, "join public.driver_details d on")
    assert "split_part(p.name, ' ', 1) ilike %(prefix)s" in sql and p["prefix"] == "Ramesh%"
    assert "p.name ilike %(like)s" not in sql
