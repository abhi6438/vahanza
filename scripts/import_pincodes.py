"""Imports the India Post "All India Pincode Directory" into public.pincodes.

Download the CSV from data.gov.in (search "All India Pincode Directory"), then:

    DATABASE_URL=postgresql://... python scripts/import_pincodes.py pincodes.csv

Columns used (case-insensitive): officename, pincode, officetype, delivery, district, statename,
latitude, longitude. One row is kept per pincode (a delivery head/sub office first) and the
coordinates of valid offices are averaged. Safe to re-run: existing pincodes are updated.
"""
import csv
import os
import sys
from collections import defaultdict

import psycopg


def num(v):
    try:
        f = float(str(v).strip())
        return f
    except ValueError:
        return None


def title(s: str) -> str:
    return " ".join(w.capitalize() if w.isalpha() else w for w in s.strip().split()) if s else s


def main(path: str) -> None:
    groups = defaultdict(list)
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        rows = csv.DictReader(f)
        rows.fieldnames = [h.strip().lower() for h in rows.fieldnames]
        for r in rows:
            pin = (r.get("pincode") or "").strip()
            if len(pin) == 6 and pin.isdigit() and pin[0] != "0":
                groups[pin].append(r)

    out = []
    for pin, offices in groups.items():
        def rank(o):
            t = (o.get("officetype") or "").upper()
            return (0 if (o.get("delivery") or "").lower().startswith("deliv") else 1, {"HO": 0, "SO": 1}.get(t, 2))
        best = sorted(offices, key=rank)[0]
        pts = [(num(o.get("latitude")), num(o.get("longitude"))) for o in offices]
        pts = [(la, lo) for la, lo in pts if la and lo and 6 <= la <= 38 and 68 <= lo <= 98]
        lat = sum(p[0] for p in pts) / len(pts) if pts else None
        lng = sum(p[1] for p in pts) / len(pts) if pts else None
        out.append((pin, title(best.get("officename", "")), title(best.get("district", "")), title(best.get("statename", "")), lat, lng))

    with psycopg.connect(os.environ["DATABASE_URL"], prepare_threshold=None) as conn, conn.cursor() as cur:
        cur.execute("create temp table _pin (pincode text, office text, district text, state text, lat float8, lng float8)")
        with cur.copy("copy _pin from stdin") as cp:
            for row in out:
                cp.write_row(row)
        cur.execute(
            """
            insert into public.pincodes (pincode, office, district, state, location)
            select pincode, office, district, state,
                   case when lat is null then null
                        else extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography end
            from _pin where district <> '' and state <> ''
            on conflict (pincode) do update
              set office = excluded.office, district = excluded.district,
                  state = excluded.state, location = coalesce(excluded.location, public.pincodes.location)
            """
        )
        print(f"imported {cur.rowcount} pincodes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
