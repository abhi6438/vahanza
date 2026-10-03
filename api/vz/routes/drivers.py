"""Driver list for owners ("drivers near you"), contact reveal, and the driver's own availability switch."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id
from .trust import is_blocked

router = APIRouter(tags=["drivers"])
VEHICLES = {"truck", "trailer", "bus", "car", "jcb", "tractor", "auto", "pickup"}
MAX_REVEALS_PER_DAY = 60          # stops scraping of phone numbers


def _viewer(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute(
        "select id, tenant_id, role, is_test, blocked, district, location from public.profiles where id = %s",
        (user.id,),
    ).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    return me


@router.get("/drivers")
def list_drivers(
    vehicle: Optional[str] = Query(None),
    verified: bool = Query(False),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0, le=1000),
    user: AuthUser = Depends(current_user),
    db=Depends(get_db),
    tenant: str = Depends(tenant_id),
):
    """Drivers an owner can contact, nearest first.
    Only drivers who are available and have filled vehicles + start date are listed.
    Test accounts see only test accounts, real users see only real ones."""
    me = _viewer(db, user, tenant)
    if me["role"] not in ("owner", "admin", "super_admin"):
        raise HTTPException(403, "Only vehicle owners can see the driver list")
    if vehicle is not None and vehicle not in VEHICLES:
        raise HTTPException(422, "Unknown vehicle")
    rows = db.execute(
        """
        select p.id, p.name, p.photo_url, p.district, p.state, p.verified, p.last_seen_at, p.rating_avg, p.rating_count,
               case when p.location is not null and %(loc)s::extensions.geography is not null
                    then round((extensions.st_distance(p.location, %(loc)s::extensions.geography) / 1000)::numeric)::int end
                 as distance_km,
               d.vehicles, d.max_wheels, d.licence_type, d.experience_years, d.savings_wanted,
               d.savings_negotiable, d.pay_prefs, d.work_type, d.area, d.languages, d.available_from
        from public.profiles p
        join public.driver_details d on d.profile_id = p.id
        where p.tenant_id = %(tenant)s and p.role = 'driver' and p.setup_done and not p.blocked
          and p.is_test = %(test)s and p.id <> %(me)s
          and d.is_available and cardinality(d.vehicles) > 0 and d.available_from is not null
          and (%(vehicle)s::text is null or %(vehicle)s = any(d.vehicles))
          and (not %(verified)s or p.verified)
          and not exists (select 1 from public.blocks bl
                  where (bl.blocker_id = %(me)s::uuid and bl.blocked_id = p.id) or (bl.blocker_id = p.id and bl.blocked_id = %(me)s::uuid))
        order by
          case when %(loc)s::extensions.geography is null then
            case when lower(p.district) = lower(%(district)s) then 0 else 1 end end,
          p.location operator(extensions.<->) %(loc)s::extensions.geography nulls last,
          (d.available_from = 'now') desc, p.last_seen_at desc nulls last
        limit %(limit)s offset %(offset)s
        """,
        {"loc": me["location"], "district": me["district"] or "", "tenant": tenant, "test": me["is_test"],
         "me": user.id, "vehicle": vehicle, "verified": verified, "limit": limit, "offset": offset},
    ).fetchall() or []
    items = []
    for r in rows:
        r = dict(r)
        r["id"] = str(r["id"])
        r["last_seen_at"] = r["last_seen_at"].isoformat() if r.get("last_seen_at") else None
        r["rating_avg"] = float(r["rating_avg"]) if r.get("rating_avg") is not None else None
        items.append(r)
    return {"items": items, "has_more": len(items) == limit}


class ContactBody(BaseModel):
    via: Literal["call", "whatsapp"] = "call"


@router.post("/drivers/{driver_id}/contact")
def contact_driver(driver_id: str, body: ContactBody, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Returns the driver's number only when the owner taps Call / WhatsApp, and records it."""
    me = _viewer(db, user, tenant)
    if me["role"] not in ("owner", "admin", "super_admin"):
        raise HTTPException(403, "Only vehicle owners can contact drivers")
    used = db.execute(
        "select count(*) as n from public.events where user_id = %s and name = 'contact_reveal' and ts > now() - interval '1 day'",
        (user.id,),
    ).fetchone()
    if used and used["n"] >= MAX_REVEALS_PER_DAY:
        raise HTTPException(429, {"code": "too_many_contacts"})
    if is_blocked(db, user.id, driver_id):
        raise HTTPException(404, "Driver not available")
    row = db.execute(
        """
        select p.phone from public.profiles p join public.driver_details d on d.profile_id = p.id
        where p.id = %s and p.tenant_id = %s and p.role = 'driver' and not p.blocked and p.is_test = %s
          and (d.is_available or exists (           -- drivers who applied to this owner's post stay reachable
                select 1 from public.interests i join public.posts po on po.id = i.post_id
                where i.driver_id = p.id and po.owner_id = %s))
        """,
        (driver_id, tenant, me["is_test"], user.id),
    ).fetchone()
    if not row or not row["phone"]:
        raise HTTPException(404, "Driver not available")
    db.execute(
        "insert into public.events (tenant_id, user_id, anon_id, session_id, name, screen, props, ts, is_test) "
        "values (%s, %s, 'server', 'server', 'contact_reveal', 'driver_list', %s, now(), %s)",
        (tenant, user.id, Jsonb({"driver_id": driver_id, "via": body.via}), me["is_test"]),
    )
    return {"phone": row["phone"]}


class AvailabilityBody(BaseModel):
    is_available: bool


@router.patch("/me/availability")
def set_availability(body: AvailabilityBody, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Driver's "available for work" switch. Off = hidden from owners."""
    me = _viewer(db, user, tenant)
    if me["role"] != "driver":
        raise HTTPException(403, "Only drivers have availability")
    db.execute(
        "insert into public.driver_details (profile_id, tenant_id, is_available) values (%s, %s, %s) "
        "on conflict (profile_id) do update set is_available = excluded.is_available",
        (user.id, tenant, body.is_available),
    )
    return {"is_available": body.is_available}
