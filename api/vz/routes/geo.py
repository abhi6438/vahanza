"""Place lookup: pincode → district, GPS → nearest pincode, and city search."""
from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_db
from ..places import place, search_curated

router = APIRouter(prefix="/geo", tags=["geo"])


@router.get("/places")
def places(q: str = Query("", max_length=40), limit: int = Query(10, ge=1, le=20), db=Depends(get_db)):
    """City search for pickers. Curated transport cities first (with Hindi names), then districts from the pincode directory."""
    out = search_curated(q, limit)
    if len(q.strip()) >= 2 and len(out) < limit:
        rows = db.execute(
            """
            select distinct district, state from public.pincodes
            where lower(district) like %s
            order by district limit %s
            """,
            (q.strip().lower() + "%", limit),
        ).fetchall() or []
        seen = {p["value"] for p in out}
        for r in rows:
            p = place(r["district"], r["state"])
            if p["value"] not in seen:
                out.append(p)
                seen.add(p["value"])
    return out[:limit]


@router.get("/pincode/{pin}")
def by_pincode(pin: str, db=Depends(get_db)):
    if not (len(pin) == 6 and pin.isdigit() and pin[0] != "0"):
        raise HTTPException(422, "Bad pincode")
    row = db.execute(
        """
        select pincode, office, district, state,
               extensions.st_y(location::extensions.geometry) as lat,
               extensions.st_x(location::extensions.geometry) as lng
        from public.pincodes where pincode = %s
        """,
        (pin,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Pincode not found")
    return place(row["district"], row["state"], pincode=row["pincode"], office=row["office"], lat=row["lat"], lng=row["lng"])


@router.get("/reverse")
def reverse(lat: float = Query(..., ge=6, le=38), lng: float = Query(..., ge=68, le=98), db=Depends(get_db)):
    """Nearest pincode (within 30 km) to a GPS point inside India."""
    row = db.execute(
        """
        with p as (select extensions.st_setsrid(extensions.st_makepoint(%s, %s), 4326)::extensions.geography as g)
        select pincode, office, district, state
        from public.pincodes, p
        where location is not null and extensions.st_dwithin(location, p.g, 30000)
        order by location operator(extensions.<->) p.g
        limit 1
        """,
        (lng, lat),
    ).fetchone()
    if not row:
        raise HTTPException(404, "No place found near this point")
    return place(row["district"], row["state"], pincode=row["pincode"], office=row["office"], lat=lat, lng=lng)
