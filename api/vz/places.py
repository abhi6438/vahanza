"""Place names used for "where do you live" and "where do the vehicles run from".

Values are stored as "<District>, <State>" in English (stable, searchable). The app shows
the Hindi name when we know it. A curated list of ~130 transport cities works even before
the full India Post pincode directory is imported (see scripts/import_pincodes.py).
"""
import json
import os
from functools import lru_cache

_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), "..", "..", "shared", "places.json"),  # repo layout / Vercel includeFiles
    os.path.join(os.getcwd(), "shared", "places.json"),
]


@lru_cache
def _data() -> dict:
    for path in _CANDIDATES:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    return {"states": {}, "cities": []}


def value_of(district: str, state: str) -> str:
    return f"{district.strip()}, {state.strip()}"


def place(district: str, state: str, **extra) -> dict:
    d = _data()
    hi = next((c["hi"] for c in d["cities"] if c["en"].lower() == district.lower() and c["state"] == state), None)
    return {
        "value": value_of(district, state),
        "en": district,
        "hi": hi,
        "state": state,
        "state_hi": d["states"].get(state),
        **extra,
    }


def search_curated(q: str, limit: int = 10) -> list[dict]:
    q = q.strip().lower()
    cities = _data()["cities"]
    if not q:
        return [place(c["en"], c["state"]) for c in cities[:limit]]
    starts = [c for c in cities if c["en"].lower().startswith(q) or c["hi"].startswith(q)]
    contains = [c for c in cities if c not in starts and (q in c["en"].lower() or q in c["hi"])]
    return [place(c["en"], c["state"]) for c in (starts + contains)[:limit]]


def is_known_value(value: str) -> bool:
    return any(value_of(c["en"], c["state"]) == value for c in _data()["cities"])
