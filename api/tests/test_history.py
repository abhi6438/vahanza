"""Driver work history + owner confirmation."""
from datetime import date, datetime, timedelta, timezone

from conftest import make_token
from vz.routes import history as Hh

H = {"Authorization": f"Bearer {make_token()}"}
DRIVER = {"id": "11111111-1111-1111-1111-111111111111", "tenant_id": "vahanza", "role": "driver", "blocked": False,
          "name": "Sunil Verma", "business_name": None, "phone": "919811177003", "is_test": False}
OWNER = dict(DRIVER, role="owner", name="Real Owner", phone="919822200001")
GOOD = {"owner_name": "Shyam", "firm_name": "Shyam Roadways", "owner_place": "Satna, Madhya Pradesh", "owner_phone": "98765 00011",
        "vehicle": "bus", "start_month": "2021-05", "end_month": "2022-11"}


def test_add_other_owner_gives_link_and_never_returns_phone_to_others(client, db):
    db.respond("from public.profiles where id", DRIVER)
    db.respond("count(*) as n from public.work_history", {"n": 0})
    db.respond("returning id", {"id": "aaaaaaaa-0000-0000-0000-000000000001"})
    r = client.post("/api/v1/me/history", headers=H, json=GOOD)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sent"] == "link" and body["token"] and body["phone"] == "919876500011"
    ins = next(c for c in db.calls if "insert into public.work_history" in c[0])[1]
    assert ins["owner_phone"] == "919876500011" and ins["owner_district"] == "Satna" and ins["start_month"] == date(2021, 5, 1)


def test_rules(client, db):
    for patch, code in ((dict(owner_phone="9811177003"), "own_phone"), (dict(start_month="2099-01"), "bad_month"),
                        (dict(start_month="2023-05", end_month="2022-01"), "bad_dates"), (dict(owner_phone="12345"), "bad_phone")):
        db.respond("from public.profiles where id", DRIVER)
        db.respond("count(*) as n from public.work_history", {"n": 0})
        r = client.post("/api/v1/me/history", headers=H, json=GOOD | patch)
        assert r.status_code == 422 and r.json()["detail"]["code"] == code, (patch, r.text)


def test_friend_driver_number_is_not_an_owner(client, db):
    db.respond("from public.profiles where id", DRIVER)
    db.respond("count(*) as n from public.work_history", {"n": 0})
    db.respond("where phone = %s and tenant_id", {"role": "driver", "id": "x"})
    r = client.post("/api/v1/me/history", headers=H, json=GOOD)
    assert r.json()["detail"]["code"] == "driver_phone"


def test_limit(client, db):
    db.respond("from public.profiles where id", DRIVER)
    db.respond("count(*) as n from public.work_history", {"n": Hh.MAX_ENTRIES})
    assert client.post("/api/v1/me/history", headers=H, json=GOOD).json()["detail"]["code"] == "too_many"


def test_owner_search_never_by_number(client, db):
    db.respond("from public.profiles where id", DRIVER)
    assert client.get("/api/v1/history/owners?q=98222", headers=H).json() == {"items": []}
    assert not any("lower(o.business_name) like" in c[0] for c in db.calls)


def test_owner_answer_yes_with_stars_becomes_rating(client, db):
    db.respond("from public.profiles where id", OWNER)
    db.respond("from public.work_history where id = %s and owner_id", {"id": "e1", "driver_id": "22222222-2222-2222-2222-222222222222", "status": "pending"})
    r = client.post("/api/v1/history/e1/answer", headers=H, json={"answer": "yes", "stars": 5, "tags": ["safe", "bogus"], "rehire": True})
    assert r.json() == {"id": "e1", "status": "confirmed"}
    upd = next(c for c in db.calls if "set status = %s, owner_answer" in c[0])[1]
    assert upd[0] == "confirmed" and upd[2] == 5 and upd[3] == ["safe"] and upd[4] is True
    assert any("insert into public.ratings" in c[0] and "worked" in c[0] for c in db.calls)


def test_owner_says_not_true(client, db):
    db.respond("from public.profiles where id", OWNER)
    db.respond("from public.work_history where id = %s and owner_id", {"id": "e1", "driver_id": "x", "status": "pending"})
    assert client.post("/api/v1/history/e1/answer", headers=H, json={"answer": "no", "stars": 5}).json()["status"] == "disputed"
    assert not any("insert into public.ratings" in c[0] for c in db.calls)


def test_public_link_and_expiry(client, db):
    row = {"id": "e2", "driver_id": "x", "status": "pending", "owner_id": None, "owner_name": "Shyam", "firm_name": "Shyam Roadways",
           "owner_district": "Satna", "owner_state": "MP", "vehicle": "bus", "wheels": None, "start_month": date(2021, 5, 1),
           "end_month": None, "work_type": None, "area": None, "note": None, "source": "driver", "owner_answer": None, "owner_stars": None,
           "owner_tags": [], "rehire": None, "invite_count": 1, "invited_at": None, "answered_at": None, "hidden": False,
           "created_at": None, "driver_name": "Sunil Verma", "driver_photo": None,
           "token_expires_at": datetime.now(timezone.utc) + timedelta(days=3)}
    db.respond("where h.answer_token = %s", row)
    r = client.get("/api/v1/public/history/tok123")
    assert r.status_code == 200 and r.json()["driver"] == "Sunil" and "owner_phone" not in r.text and "9198" not in r.text
    db.respond("where h.answer_token = %s", dict(row, token_expires_at=datetime.now(timezone.utc) - timedelta(days=1)))
    assert client.get("/api/v1/public/history/tok123").status_code == 410


def test_summary_counts_only_confirmed_years():
    items = [{"status": "confirmed", "start_month": "2023-01-01", "end_month": "2024-12-01", "rehire": True},
             {"status": "pending", "start_month": "2020-01-01", "end_month": "2022-12-01", "rehire": None}]
    s = Hh.summary(items)
    assert s == {"count": 2, "confirmed": 1, "confirmed_years": 2.0, "rehire": 1}


def test_admin_only(client, db):
    db.respond("from public.profiles where id", OWNER)
    assert client.get("/api/v1/admin/history", headers=H).status_code == 403


def test_summary_overlap_counted_once():
    items = [{"status": "confirmed", "start_month": "2023-01-01", "end_month": "2023-12-01", "rehire": None},
             {"status": "admin_ok", "start_month": "2023-07-01", "end_month": "2024-06-01", "rehire": None}]
    assert Hh.summary(items)["confirmed_years"] == 1.5


def test_owner_fixes_dates_goes_to_admin_not_driver(client, db):
    db.respond("from public.profiles where id", OWNER)
    db.respond("from public.work_history where id = %s and owner_id",
               {"id": "e1", "driver_id": "x", "status": "pending", "start_month": date(2021, 5, 1), "end_month": date(2022, 11, 1)})
    r = client.post("/api/v1/history/e1/answer", headers=H, json={"answer": "dates", "start_month": "2021-08", "end_month": None, "stars": 4, "rehire": True})
    assert r.json()["status"] == "owner_fixed"
    upd = next(c for c in db.calls if "set status = %s, owner_answer" in c[0])[1]
    assert upd[:3] == ("owner_fixed", "dates", 4) and upd[5] == date(2021, 8, 1) and upd[6] is None
    assert any("insert into public.ratings" in c[0] for c in db.calls)        # he did work there
    # no months → refused; till before from → refused
    pend = {"id": "e1", "driver_id": "x", "status": "pending", "start_month": date(2021, 5, 1), "end_month": None}
    for _ in range(2):
        db.respond("from public.profiles where id", OWNER); db.respond("from public.work_history where id = %s and owner_id", pend)
    assert client.post("/api/v1/history/e1/answer", headers=H, json={"answer": "dates"}).status_code == 422
    assert client.post("/api/v1/history/e1/answer", headers=H, json={"answer": "dates", "start_month": "2022-05", "end_month": "2021-01"}).status_code == 422


def test_owner_same_dates_counts_as_yes(client, db):
    db.respond("from public.profiles where id", OWNER)
    db.respond("from public.work_history where id = %s and owner_id",
               {"id": "e1", "driver_id": "x", "status": "pending", "start_month": date(2021, 5, 1), "end_month": None})
    assert client.post("/api/v1/history/e1/answer", headers=H, json={"answer": "dates", "start_month": "2021-05"}).json()["status"] == "confirmed"


def test_admin_approves_owner_months(client, db):
    admin = dict(DRIVER, role="admin")
    db.respond("from public.profiles where id", admin)
    db.respond("update public.work_history set status = %s, admin_note", {"driver_id": "x"})
    r = client.post("/api/v1/admin/history/e1/check", headers=H, json={"action": "ok"})
    assert r.json()["status"] == "admin_ok"
    q, p = next(c for c in db.calls if "admin_note" in c[0])
    assert "owner_start_month" in q and p[3] is True
    db.respond("from public.profiles where id", admin)
    db.respond("update public.work_history set status = %s, admin_note", {"driver_id": "x"})
    client.post("/api/v1/admin/history/e1/check", headers=H, json={"action": "keep"})
    assert [c for c in db.calls if "admin_note" in c[0]][-1][1][3] is False
