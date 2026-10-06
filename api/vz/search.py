"""One search + filter for the four lists: drivers (for owners), jobs (for drivers) and their no-login versions.

The search box takes a city (Hindi or English), a pincode, a name / firm, or a vehicle ("truck rewa").
Phone numbers are never searchable: long digit runs are dropped before anything is matched.
Filters come in as plain query parameters; every list answers with `total` (all matches, not just this page).
"""
import re
from dataclasses import dataclass, field
from typing import Literal, Optional

from fastapi import HTTPException, Query

from .places import _data

VEHICLES = ("truck", "trailer", "bus", "car", "jcb", "tractor", "auto", "pickup")
# words people type for each vehicle (English, Hindi, common spellings)
VEHICLE_WORDS = {
    "truck": ("truck", "trucks", "lorry", "ट्रक", "लॉरी", "लारी"),
    "trailer": ("trailer", "ट्रेलर", "ट्रेलेर"),
    "bus": ("bus", "बस"),
    "pickup": ("pickup", "pick-up", "पिकअप", "पिक-अप"),
    "jcb": ("jcb", "जेसीबी", "जे.सी.बी."),
    "tractor": ("tractor", "ट्रैक्टर", "ट्रेक्टर", "टैक्टर"),
    "car": ("car", "taxi", "कार", "टैक्सी"),
    "auto": ("auto", "ऑटो", "आटो", "ओटो"),
}
_WORD_TO_VEHICLE = {w: k for k, words in VEHICLE_WORDS.items() for w in words}
LICENCE_OK = {"LMV": ["LMV", "HMV", "Transport"], "HMV": ["HMV", "Transport"], "Transport": ["Transport"]}
AVAILABLE_ORDER = ["now", "w1", "d15", "m1"]
LANGS = {"hi", "bg", "bho", "cg", "en", "ur", "pa", "mr", "gu", "bn", "or", "te"}
WORK = {"full", "day", "trip"}
COVERAGE = {"local", "state", "near", "india"}
FACILITIES = {"stay", "food", "off", "bhatta", "ot", "rech", "ins", "pf", "bonus", "uni", "adv"}
RADII = (0, 25, 50, 100)            # 0 = any distance (nearest first)
DEFAULT_RADIUS = 50
Sort = Literal["near", "new", "pay", "rating"]


def _list(raw: Optional[str], allowed: set, what: str) -> list[str]:
    if not raw:
        return []
    out = [x.strip() for x in raw.split(",") if x.strip()]
    bad = [x for x in out if x not in allowed]
    if bad or len(out) > 12:
        raise HTTPException(422, f"Unknown {what}")
    return out


def _like(text: str) -> str:
    return "%" + re.sub(r"([\\%_])", r"\\\1", text) + "%"


# ---------------------------------------------------------------- the search box
@dataclass
class Parsed:
    vehicle: Optional[str] = None
    district: Optional[str] = None      # a place: filter around it, nearest first
    state: Optional[str] = None
    pincode: Optional[str] = None
    text: Optional[str] = None          # anything else: name / firm / place words
    nothing: bool = False               # a pincode we don't know: no results


def parse_q(db, q: Optional[str]) -> Parsed:
    out = Parsed()
    s = re.sub(r"\s+", " ", (q or "").strip())[:60]
    if not s:
        return out
    digits = re.sub(r"[\s-]", "", s)
    if digits.isdigit():
        if len(digits) == 6 and digits[0] != "0":
            row = db.execute("select district, state from public.pincodes where pincode = %s", (digits,)).fetchone()
            if row:
                out.district, out.state, out.pincode = row["district"], row["state"], digits
            else:
                out.nothing = True
        return out                       # any other number (a phone number) is ignored
    s = re.sub(r"\+?\d[\d\s-]{6,}\d", " ", s).strip()      # drop phone-like runs inside text
    words = []
    for w in s.split(" "):
        v = _WORD_TO_VEHICLE.get(w.lower().strip(".,"))
        if v and not out.vehicle:
            out.vehicle = v
        elif w:
            words.append(w)
    rest = " ".join(words).strip()
    if not rest:
        return out
    place = _curated_place(rest)
    if not place and len(rest) >= 3:
        row = db.execute(
            "select district, state from public.pincodes where lower(district) = lower(%s) limit 1", (rest,)
        ).fetchone()
        if row:
            place = (row["district"], row["state"])
    if place:
        out.district, out.state = place
    else:
        out.text = rest[:40]
    return out


def _curated_place(text: str) -> Optional[tuple[str, str]]:
    t = text.lower()
    cities = _data()["cities"]
    for c in cities:
        if t == c["en"].lower() or text == c["hi"]:
            return c["en"], c["state"]
    if len(text) >= 3:
        for c in cities:
            if c["en"].lower().startswith(t) or c["hi"].startswith(text):
                return c["en"], c["state"]
    return None


def place_point(db, district: str, state: Optional[str]):
    """Middle of a district (from its pincodes) — the point "within 50 km" is measured from."""
    row = db.execute(
        """select extensions.st_centroid(extensions.st_collect(location::extensions.geometry))::extensions.geography as g
           from public.pincodes where lower(district) = lower(%s) and (%s::text is null or state = %s) and location is not null""",
        (district, state, state),
    ).fetchone()
    return row["g"] if row else None


# ---------------------------------------------------------------- shared filter parameters
@dataclass
class Common:
    q: Optional[str]
    place: Optional[str]
    radius: Optional[int]
    sort: str
    vehicle: Optional[str]
    wheels: Optional[int]
    verified: bool
    parsed: Parsed = field(default_factory=Parsed)
    district: Optional[str] = None
    state: Optional[str] = None
    loc: object = None
    chosen: bool = False               # a place was chosen / typed (not just "near me")

    def resolve(self, db, viewer_district: Optional[str] = None, viewer_loc=None):
        """Work out the place (chosen city, or a city / pincode typed in the box) and its point."""
        self.parsed = parse_q(db, self.q)
        if self.parsed.vehicle and not self.vehicle:
            self.vehicle = self.parsed.vehicle
        if self.place:
            d, _, st = self.place.partition(",")
            self.district, self.state = d.strip() or None, st.strip() or None
        elif self.parsed.district:
            self.district, self.state = self.parsed.district, self.parsed.state
        if self.district:
            self.chosen = True
            self.loc = place_point(db, self.district, self.state)
            if self.radius is None:
                self.radius = DEFAULT_RADIUS
        else:
            self.district, self.loc = viewer_district or "", viewer_loc
            self.radius = None             # no place chosen: no distance limit, just nearest to me first
        return self

    def params(self) -> dict:
        return {
            "district": self.district or "", "loc": self.loc, "radius_m": (self.radius or 0) * 1000,
            "place_filter": self.chosen and bool(self.radius),
            "vehicle": self.vehicle, "wheels": self.wheels, "verified": self.verified,
            "text": self.parsed.text, "like": _like(self.parsed.text or ""), "prefix": re.sub(r"([\\%_])", r"\\\1", self.parsed.text or "") + "%",
            "nothing": self.parsed.nothing,
        }


def common(
    q: Optional[str] = Query(None, max_length=60),
    place: Optional[str] = Query(None, max_length=80),
    district: Optional[str] = Query(None, max_length=60),     # older name for `place` (public pages)
    radius: Optional[int] = Query(None),
    sort: Sort = Query("near"),
    vehicle: Optional[str] = Query(None),
    wheels: Optional[int] = Query(None, ge=4, le=30),
    verified: bool = Query(False),
) -> Common:
    if vehicle is not None and vehicle not in VEHICLES:
        raise HTTPException(422, "Unknown vehicle")
    if radius is not None and radius not in RADII:
        raise HTTPException(422, "Unknown radius")
    if district and not place and radius is None:
        radius = 0                         # old public city chip: that city first, nothing hidden
    return Common(q=q, place=place or (district or "").strip() or None, radius=radius, sort=sort,
                  vehicle=vehicle, wheels=wheels, verified=verified)


# ---------------------------------------------------------------- drivers
@dataclass
class DriverFilters:
    licence: Optional[str]
    exp_min: Optional[int]
    savings_max: Optional[int]
    available: Optional[str]
    rating_min: Optional[float]
    langs: list[str]
    tick: Optional[str] = None         # Premium: only blue-or-better / gold-or-better

    def params(self) -> dict:
        return {
            "ticks": {"blue": ["blue", "gold", "black"], "gold": ["gold", "black"]}.get(self.tick or ""),
            "lic_ok": LICENCE_OK[self.licence] if self.licence else None,
            "exp_min": self.exp_min, "savings_max": self.savings_max,
            "avail": AVAILABLE_ORDER[: AVAILABLE_ORDER.index(self.available) + 1] if self.available else None,
            "rating_min": self.rating_min, "langs": self.langs or None,
        }


def driver_filters(
    licence: Optional[Literal["LMV", "HMV", "Transport"]] = Query(None),
    exp_min: Optional[int] = Query(None, ge=0, le=40),
    savings_max: Optional[int] = Query(None, ge=1000, le=500000),
    available: Optional[Literal["now", "w1", "d15", "m1"]] = Query(None),
    rating_min: Optional[float] = Query(None, ge=1, le=5),
    langs: Optional[str] = Query(None, max_length=80),
    tick: Optional[Literal["blue", "gold"]] = Query(None),
) -> DriverFilters:
    return DriverFilters(licence, exp_min, savings_max, available, rating_min, _list(langs, LANGS, "language"), tick)


def driver_where(public: bool = False) -> str:
    """Extra conditions for the driver lists (p = profile, d = driver_details)."""
    text = ("split_part(p.name, ' ', 1) ilike %(prefix)s" if public else "p.name ilike %(like)s") + " or p.district ilike %(like)s"
    return f"""
          and not %(nothing)s
          and (%(vehicle)s::text is null or %(vehicle)s = any(d.vehicles))
          and (%(wheels)s::int is null or d.max_wheels >= %(wheels)s)
          and (not %(verified)s or p.verified)
          and (%(lic_ok)s::text[] is null or d.licence_type = any(%(lic_ok)s::text[]))
          and (%(exp_min)s::int is null or coalesce(d.experience_years, 0) >= %(exp_min)s)
          and (%(savings_max)s::int is null or coalesce(d.savings_wanted, 0) <= %(savings_max)s)
          and (%(avail)s::text[] is null or d.available_from = any(%(avail)s::text[]))
          and (%(rating_min)s::numeric is null or coalesce(p.rating_avg, 0) >= %(rating_min)s)
          and (%(langs)s::text[] is null or d.languages && %(langs)s::text[])
          and (%(ticks)s::text[] is null or p.tick = any(%(ticks)s::text[]))
          and (not %(place_filter)s or lower(p.district) = lower(%(district)s)
               or (p.location is not null and %(loc)s::extensions.geography is not null
                   and extensions.st_dwithin(p.location, %(loc)s::extensions.geography, %(radius_m)s)))
          and (%(text)s::text is null or {text})
    """


def driver_order(sort: str, near: str) -> str:
    if sort == "new":
        return "coalesce(d.looking_checked_at, d.updated_at, p.created_at) desc, p.last_seen_at desc nulls last"
    if sort == "pay":
        return "d.savings_wanted asc nulls last, p.last_seen_at desc nulls last"
    if sort == "rating":
        return "p.rating_avg desc nulls last, p.rating_count desc, p.last_seen_at desc nulls last"
    return near


# ---------------------------------------------------------------- jobs
@dataclass
class JobFilters:
    savings_min: Optional[int]
    work: list[str]
    coverage: list[str]
    facilities: list[str]
    new_days: Optional[int]

    def params(self) -> dict:
        return {"savings_min": self.savings_min, "work": self.work or None, "coverage": self.coverage or None,
                "facilities": self.facilities or None, "new_days": self.new_days}


def job_filters(
    savings_min: Optional[int] = Query(None, ge=1000, le=500000),
    work: Optional[str] = Query(None, max_length=40),
    coverage: Optional[str] = Query(None, max_length=40),
    facilities: Optional[str] = Query(None, max_length=120),
    new_days: Optional[int] = Query(None, ge=1, le=30),
) -> JobFilters:
    return JobFilters(savings_min, _list(work, WORK, "work type"), _list(coverage, COVERAGE, "coverage"),
                      _list(facilities, FACILITIES, "facility"), new_days)


def job_where(public: bool = False) -> str:
    """Extra conditions for the job lists (p = post, o = owner profile)."""
    firm = "" if public else "o.business_name ilike %(like)s or "
    return f"""
          and not %(nothing)s
          and ((%(vehicle)s::text is null and %(wheels)s::int is null) or exists (
                select 1 from public.post_groups pg join public.fleet_groups fg on fg.id = pg.fleet_group_id
                where pg.post_id = p.id and (%(vehicle)s::text is null or fg.vehicle_type = %(vehicle)s)
                  and (%(wheels)s::int is null or fg.wheels is null or fg.wheels <= %(wheels)s)))
          and (not %(verified)s or o.verified)
          and (%(savings_min)s::int is null or p.savings_monthly >= %(savings_min)s)
          and (%(work)s::text[] is null or p.work_type = any(%(work)s::text[]))
          and (%(coverage)s::text[] is null or p.coverage = any(%(coverage)s::text[]))
          and (%(facilities)s::text[] is null or p.facilities @> %(facilities)s::text[])
          and (%(new_days)s::int is null or p.created_at > now() - make_interval(days => %(new_days)s))
          and (not %(place_filter)s
               or exists (select 1 from unnest(p.base_cities) c where lower(split_part(c, ',', 1)) = lower(%(district)s))
               or lower(o.district) = lower(%(district)s)
               or (o.location is not null and %(loc)s::extensions.geography is not null
                   and extensions.st_dwithin(o.location, %(loc)s::extensions.geography, %(radius_m)s)))
          and (%(text)s::text is null or {firm}o.district ilike %(like)s
               or array_to_string(p.base_cities || p.often_cities, ' ') ilike %(like)s)
    """


def job_order(sort: str, near: str) -> str:
    if sort == "new":
        return "p.created_at desc"
    if sort == "pay":
        return "p.savings_monthly desc, p.created_at desc"
    if sort == "rating":
        return "o.rating_avg desc nulls last, o.rating_count desc, p.created_at desc"
    return near


def page(rows: list, limit: int, offset: int) -> tuple[list[dict], int, bool]:
    """Rows carry `total` (count(*) over ()): take it off each row."""
    items, total = [], None
    for r in rows:
        r = dict(r)
        t = r.pop("total", None)
        if total is None and t is not None:
            total = int(t)
        items.append(r)
    if total is None:                    # empty page (or an old row shape): fall back to the page itself
        return items, offset + len(items), len(items) == limit
    return items, total, offset + len(items) < total
