"""Who am I: profile, first-time role choice, profile setup (driver details / owner fleet), heartbeat."""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, field_validator

from ..auth import AuthUser, current_user
from ..checks import clean_name, fleet_flags, name_error, profile_flags
from .. import growth, prospects
from ..deps import get_db, tenant_id

router = APIRouter(prefix="/me", tags=["me"])

PROFILE_COLS = (
    "id, tenant_id, role, name, business_name, phone, photo_url, lang, city, district, state, pincode, "
    "verified, blocked, setup_done, is_test, created_at"
)
DRIVER_COLS = (
    "vehicles, max_wheels, licence_type, licence_last4, experience_years, savings_wanted, savings_negotiable, "
    "pay_prefs, work_type, area, languages, available_from, is_available, licence_expiry"
)
VEHICLES = Literal["truck", "trailer", "bus", "car", "jcb", "tractor", "auto", "pickup"]
WHEELED = {"truck", "trailer", "bus"}
WHEELS = {6, 10, 12, 14, 16, 18, 22}


class Profile(BaseModel):
    id: str
    tenant_id: str
    role: Optional[str] = None
    name: Optional[str] = None
    business_name: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    lang: str = "hi"
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    verified: bool = False
    setup_done: bool = False
    is_test: bool = False


class DriverDetails(BaseModel):
    vehicles: list[VEHICLES] = Field(default_factory=list, max_length=8)
    max_wheels: Optional[int] = None
    licence_type: Optional[Literal["LMV", "HMV", "Transport"]] = None
    licence_last4: Optional[str] = None
    experience_years: Optional[int] = Field(default=None, ge=0, le=60)
    savings_wanted: Optional[int] = Field(default=None, ge=0, le=500000)
    savings_negotiable: bool = True
    pay_prefs: list[Literal["fix", "trip", "km", "bhatta", "comm"]] = Field(default_factory=list, max_length=5)
    work_type: Optional[Literal["full", "day", "trip"]] = None
    area: Optional[Literal["local", "dist", "state", "india"]] = None
    languages: list[str] = Field(default_factory=list, max_length=10)
    available_from: Optional[Literal["now", "w1", "d15", "m1"]] = None
    is_available: bool = True
    licence_expiry: Optional[date] = None          # for the renewal reminder

    @field_validator("licence_expiry")
    @classmethod
    def _expiry(cls, v):
        if v is not None and not date(2000, 1, 1) <= v <= date(2080, 12, 31):
            raise ValueError("licence expiry out of range")
        return v

    @field_validator("max_wheels")
    @classmethod
    def _wheels(cls, v):
        if v is not None and v not in WHEELS:
            raise ValueError("wheels must be one of 6,10,12,14,16,18,22")
        return v

    @field_validator("languages")
    @classmethod
    def _langs(cls, v):
        if any(len(x) > 10 or not x.isalpha() for x in v):
            raise ValueError("bad language code")
        return v


class FleetGroup(BaseModel):
    id: Optional[str] = None
    vehicle_type: VEHICLES
    wheels: Optional[int] = None
    vehicle_count: int = Field(ge=1, le=10000)
    base_cities: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("base_cities")
    @classmethod
    def _cities(cls, v):
        out = []
        for c in v:
            c = c.strip()
            if not c or len(c) > 80:
                raise ValueError("bad city")
            if c not in out:
                out.append(c)
        return out


class MeResponse(BaseModel):
    exists: bool
    suggested_role: Optional[Literal["driver", "owner"]] = None
    profile: Optional[Profile] = None
    driver: Optional[DriverDetails] = None
    fleet: Optional[list[FleetGroup]] = None


class Source(BaseModel):
    """The first link this phone opened: job share, referral, QR poster or import invite."""
    via: Literal["direct", "share", "ref", "poster", "invite"] = "direct"
    code: Optional[str] = Field(default=None, max_length=16)


class StartBody(BaseModel):
    role: Literal["driver", "owner"]
    lang: Literal["hi", "en"] = "hi"
    name: Optional[str] = Field(default=None, max_length=80)
    source: Optional[Source] = None


class Place(BaseModel):
    district: str = Field(min_length=1, max_length=60)
    state: str = Field(min_length=1, max_length=60)
    pincode: Optional[str] = Field(default=None, pattern=r"^[1-9][0-9]{5}$")
    lat: Optional[float] = Field(default=None, ge=6, le=38)
    lng: Optional[float] = Field(default=None, ge=68, le=98)


class DriverIn(DriverDetails):
    licence_number: Optional[str] = Field(default=None, max_length=24)   # only the last 4 characters are kept


class ProfileBody(BaseModel):
    name: str = Field(max_length=80)
    business_name: Optional[str] = Field(default=None, max_length=80)
    place: Place
    driver: Optional[DriverIn] = None
    fleet: Optional[list[FleetGroup]] = Field(default=None, max_length=30)
    # true once name + place are given (the only required part). Everything else is filled
    # later, step by step, from the "complete your profile" card on home.
    finish: bool = False


def _to_profile(row: dict) -> Profile:
    return Profile(**{k: (str(v) if k == "id" else v) for k, v in row.items() if k in Profile.model_fields})


def _load(db, user_id: str, profile_row: dict) -> MeResponse:
    driver = fleet = None
    if profile_row["role"] == "driver":
        d = db.execute(f"select {DRIVER_COLS} from public.driver_details where profile_id = %s", (user_id,)).fetchone()
        driver = DriverDetails(**d) if d else DriverDetails()
    elif profile_row["role"] == "owner":
        rows = db.execute(
            "select id, vehicle_type, wheels, vehicle_count, base_cities from public.fleet_groups "
            "where owner_id = %s order by created_at",
            (user_id,),
        ).fetchall() or []
        fleet = [FleetGroup(**{**r, "id": str(r["id"])}) for r in rows]
    return MeResponse(exists=True, profile=_to_profile(profile_row), driver=driver, fleet=fleet)


def _my_row(db, user: AuthUser, tenant: str) -> dict:
    row = db.execute(f"select {PROFILE_COLS} from public.profiles where id = %s", (user.id,)).fetchone()
    if not row:
        raise HTTPException(404, "Profile not found")
    if row["blocked"]:
        raise HTTPException(403, "Account blocked")
    if row["tenant_id"] != tenant:
        raise HTTPException(403, "This number is registered with another brand")
    return row


@router.get("", response_model=MeResponse)
def get_me(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    row = db.execute(f"select {PROFILE_COLS} from public.profiles where id = %s", (user.id,)).fetchone()
    if not row:
        # a new number that was imported earlier: suggest its role ("for you" on the role screen)
        hit = db.execute(
            "select role from public.prospects where tenant_id = %s and phone = %s and joined_at is null",
            (tenant, user.phone),
        ).fetchone() if user.phone else None
        return MeResponse(exists=False, suggested_role=hit["role"] if hit else None)
    if row["blocked"]:
        raise HTTPException(403, "Account blocked")
    if row["tenant_id"] != tenant:
        raise HTTPException(403, "This number is registered with another brand")
    return _load(db, user.id, row)


@router.post("", response_model=MeResponse)
def start(body: StartBody, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Creates the profile after the first OTP login. The role can be set once; changing it later goes through support."""
    exists = db.execute("select 1 from public.tenants where id = %s", (tenant,)).fetchone()
    if not exists:
        raise HTTPException(400, "Unknown brand")
    row = db.execute(
        f"""
        insert into public.profiles (id, tenant_id, role, lang, name, phone)
        values (%s, %s, %s, %s, %s, %s)
        on conflict (id) do update
          set role = coalesce(public.profiles.role, excluded.role),
              lang = excluded.lang,
              name = coalesce(excluded.name, public.profiles.name),
              last_seen_at = now()
          where public.profiles.tenant_id = excluded.tenant_id
        returning {PROFILE_COLS}
        """,
        (user.id, tenant, body.role, body.lang, body.name, user.phone),
    ).fetchone()
    if not row:
        raise HTTPException(403, "This number is registered with another brand")
    if row["role"] in ("driver", "owner") and row["role"] != body.role:
        raise HTTPException(409, f"Already registered as {row['role']}")
    if row["role"] == "driver":
        db.execute(
            "insert into public.driver_details (profile_id, tenant_id) values (%s, %s) on conflict do nothing",
            (user.id, tenant),
        )
    # where they came from (first time only)
    src = body.source or Source()
    growth.attribute(db, tenant, user.id, src.via, src.code)
    # imported earlier (bulk import)? link it and pre-fill name / place / vehicles
    if not row.get("setup_done") and prospects.claim(db, tenant, user.id, row.get("phone") or user.phone, row["role"]):
        row = db.execute(f"select {PROFILE_COLS} from public.profiles where id = %s", (user.id,)).fetchone() or row
    return _load(db, user.id, row)


def _validate_driver(d: DriverIn) -> dict:
    """Driver details may be partly filled; unfilled answers are stored as null."""
    data = d.model_dump(exclude={"licence_number", "licence_last4"})
    if not any(v in WHEELED for v in d.vehicles):
        data["max_wheels"] = None
    raw = "".join(ch for ch in (d.licence_number or "") if ch.isalnum()).upper()
    data["licence_last4"] = raw[-4:] if len(raw) >= 4 else None
    return data


def _validate_fleet(fleet: list[FleetGroup]) -> list[FleetGroup]:
    for g in fleet:
        if g.vehicle_type in WHEELED:
            if g.wheels is not None and g.wheels not in WHEELS:
                raise HTTPException(422, {"code": "bad_wheels"})
        else:
            g.wheels = None
    return fleet


def _sync_fleet(db, user_id: str, tenant: str, fleet: list[FleetGroup]) -> None:
    """Makes the owner's fleet groups match the list: update by id, insert new, delete the rest.
    A group used by an open post cannot be removed (the post would lose its vehicles)."""
    existing = {str(r["id"]) for r in (db.execute(
        "select id from public.fleet_groups where owner_id = %s", (user_id,)).fetchall() or [])}
    keep = {g.id for g in fleet if g.id}
    unknown = keep - existing
    if unknown:
        raise HTTPException(422, {"code": "unknown_fleet_group"})
    remove = list(existing - keep)
    if remove:
        used = db.execute(
            """
            select 1 from public.post_groups pg join public.posts p on p.id = pg.post_id
            where pg.fleet_group_id = any(%s::uuid[]) and p.status in ('live', 'under_check', 'paused')
            limit 1
            """,
            (remove,),
        ).fetchone()
        if used:
            raise HTTPException(409, {"code": "fleet_in_use"})
        db.execute("delete from public.fleet_groups where owner_id = %s and id = any(%s::uuid[])", (user_id, remove))
    for g in fleet:
        if g.id:
            db.execute(
                "update public.fleet_groups set vehicle_type = %s, wheels = %s, vehicle_count = %s, base_cities = %s "
                "where id = %s and owner_id = %s",
                (g.vehicle_type, g.wheels, g.vehicle_count, g.base_cities, g.id, user_id),
            )
        else:
            db.execute(
                "insert into public.fleet_groups (tenant_id, owner_id, vehicle_type, wheels, vehicle_count, base_cities) "
                "values (%s, %s, %s, %s, %s, %s)",
                (tenant, user_id, g.vehicle_type, g.wheels, g.vehicle_count, g.base_cities),
            )


@router.put("/profile", response_model=MeResponse)
def save_profile(body: ProfileBody, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Saves the setup screens (also used later for "edit profile")."""
    row = _my_row(db, user, tenant)
    role = row["role"]
    first_finish = body.finish and not row["setup_done"]
    err = name_error(body.name)
    if err:
        raise HTTPException(422, {"code": err})
    name = clean_name(body.name)
    business = clean_name(body.business_name or "") or None
    if role != "owner":
        business = None

    driver = None
    if role == "driver" and body.driver is not None:
        driver = _validate_driver(body.driver)
    fleet = None
    if role == "owner" and body.fleet is not None:
        fleet = _validate_fleet(body.fleet)

    flags = profile_flags(name, business, driver) + (fleet_flags([g.model_dump() for g in fleet]) if fleet else [])
    p = body.place
    point = (p.lng, p.lat) if p.lat is not None and p.lng is not None else (None, None)
    row = db.execute(
        f"""
        update public.profiles set
          name = %s, business_name = %s,
          city = %s, district = %s, state = %s, pincode = %s,
          location = case when %s::float8 is null then location
                          else extensions.st_setsrid(extensions.st_makepoint(%s::float8, %s::float8), 4326)::extensions.geography end,
          check_flags = %s,
          setup_done = setup_done or %s
        where id = %s
        returning {PROFILE_COLS}
        """,
        (name, business, p.district, p.district, p.state, p.pincode,
         point[0], point[0], point[1], Jsonb(flags), body.finish, user.id),
    ).fetchone()

    if driver is not None:
        cols = list(driver.keys())
        db.execute(
            f"""
            insert into public.driver_details (profile_id, tenant_id, {", ".join(cols)})
            values (%s, %s, {", ".join(["%s"] * len(cols))})
            on conflict (profile_id) do update set {", ".join(f"{c} = excluded.{c}" for c in cols)}
            """,
            (user.id, tenant, *[driver[c] for c in cols]),
        )
    if fleet is not None:
        _sync_fleet(db, user.id, tenant, fleet)
    if first_finish:
        growth.reward_referrer(db, tenant, user.id)   # whoever invited them gets the "Top" boost
    return _load(db, user.id, row)


@router.post("/seen", status_code=204)
def seen(user: AuthUser = Depends(current_user), db=Depends(get_db)):
    """Heartbeat sent every few minutes while the app is open; powers 'online now'."""
    db.execute("update public.profiles set last_seen_at = now() where id = %s", (user.id,))
