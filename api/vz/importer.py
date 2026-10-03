"""Bulk import: reads a CSV / Excel list of drivers or transporters and cleans it.

Column names may be in English or Hindi and in any order ("Mobile", "मोबाइल नंबर", "Naam", "शहर" ...).
Only the phone column is required. Every row gets a status:
  new     -> will be added
  update  -> already imported earlier; empty details get filled in
  on_app  -> this number already uses the app (nothing to do)
  bad     -> skipped (wrong number, repeated in the file)
and optional warnings (place not found, unknown vehicle, number in the name ...).
"""
import csv
import io
import re
import unicodedata

from .checks import clean_name, name_error
from .places import _data as _places

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000
FIELDS = ("phone", "name", "business_name", "district", "state", "pincode", "vehicles", "vehicle_count", "note")

# Checked in this order; a header is matched by the first field whose alias it equals or starts with.
_ALIASES: list[tuple[str, tuple[str, ...]]] = [
    ("vehicle_count", ("vehiclecount", "noofvehicles", "numberofvehicles", "vehiclesno", "totalvehicles", "fleetsize", "fleet",
                       "count", "qty", "quantity", "गाड़ियोंकीसंख्या", "गाडियोंकीसंख्या", "संख्या", "कितनीगाड़ियाँ", "कुलगाड़ियाँ", "कुलगाड़ी", "कुलगाडियां", "गिनती")),
    ("phone", ("phone", "mobile", "mob", "contact", "number", "cell", "whatsapp", "मोबाइल", "फ़ोन", "फोन", "नंबर", "संपर्क")),
    ("business_name", ("business", "company", "firm", "transport", "agency", "फर्म", "फ़र्म", "कंपनी", "ट्रांसपोर्ट", "व्यवसाय")),
    ("name", ("name", "naam", "drivername", "ownername", "fullname", "नाम")),
    ("pincode", ("pincode", "pin", "zip", "पिनकोड", "पिन")),
    ("district", ("district", "city", "town", "place", "location", "area", "jila", "zila", "shahar", "जिला", "ज़िला", "शहर", "जगह", "स्थान")),
    ("state", ("state", "rajya", "राज्य", "प्रदेश")),
    ("vehicles", ("vehicle", "gaadi", "gadi", "type", "गाड़ी", "गाडी", "वाहन")),
    ("note", ("note", "remark", "comment", "टिप्पणी", "नोट")),
]

_VEHICLE_WORDS: dict[str, tuple[str, ...]] = {
    "trailer": ("trailer", "ट्रेलर", "container", "कंटेनर"),
    "pickup": ("pickup", "pick up", "पिकअप", "tata ace", "chhota hathi", "छोटा हाथी", "bolero", "mini truck", "dost", "407"),
    "truck": ("truck", "ट्रक", "lorry", "लॉरी", "dumper", "डंपर", "tipper", "टिपर", "hywa", "हाइवा", "tanker", "टैंकर", "taurus"),
    "bus": ("bus", "बस"),
    "jcb": ("jcb", "जेसीबी", "excavator", "poclain", "पोकलेन", "backhoe"),
    "tractor": ("tractor", "ट्रैक्टर", "ट्रेक्टर"),
    "car": ("car", "कार", "taxi", "टैक्सी", "cab", "suv", "innova", "ertiga"),
    "auto": ("auto", "ऑटो", "ऑटो रिक्शा", "e-rickshaw", "ई-रिक्शा", "tempo", "टेम्पो"),
}


class ImportError_(Exception):
    def __init__(self, code: str, **extra):
        super().__init__(code)
        self.code, self.extra = code, extra


def _norm_header(h) -> str:
    s = unicodedata.normalize("NFC", str(h or "")).strip().lower()
    return re.sub(r"[\s_\-./():#*]+", "", s)


_EXACT = {"contactperson": "name", "contactname": "name", "personname": "name", "mobilenumber": "phone", "mobileno": "phone"}
_SKIP = re.compile(r"^(vehicle|gaadi|gadi|गाड़ी|गाडी|वाहन)(no|number|regno|registration|नंबर|संख्याप्लेट)")


# one-column-per-vehicle files (our Excel template): header is the vehicle name, cell says yes
_FLAG_HEADERS = {
    "ट्रक": "truck", "truck": "truck", "ट्रेलर": "trailer", "trailer": "trailer", "बस": "bus", "bus": "bus",
    "पिकअप": "pickup", "pickup": "pickup", "जेसीबी": "jcb", "jcb": "jcb", "ट्रैक्टर": "tractor", "tractor": "tractor",
    "कार": "car", "car": "car", "ऑटो": "auto", "auto": "auto",
}
_YES = {"हाँ", "हां", "हा", "haan", "han", "ha", "yes", "y", "1", "✓", "✔", "true", "x", "हाँजी", "ji"}


def flag_columns(headers: list) -> dict[int, str]:
    return {i: _FLAG_HEADERS[_norm_header(h)] for i, h in enumerate(headers) if _norm_header(h) in _FLAG_HEADERS}


def is_yes(v) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v == 1
    return _norm_header(v) in _YES


def map_columns(headers: list) -> dict[int, str]:
    out: dict[int, str] = {}
    taken: set[str] = set()
    for i, h in enumerate(headers):
        n = _norm_header(h)
        if not n or _SKIP.match(n) or n in _FLAG_HEADERS:   # registration numbers are not needed; vehicle columns handled separately
            continue
        if _EXACT.get(n) and _EXACT[n] not in taken:
            out[i] = _EXACT[n]
            taken.add(_EXACT[n])
            continue
        for field, aliases in _ALIASES:
            if field in taken:
                continue
            if any(n == a or n.startswith(a) for a in aliases):
                out[i] = field
                taken.add(field)
                break
    return out


def read_table(data: bytes, filename: str = "") -> list[list]:
    """Rows (first row = headers) from .xlsx or .csv / .txt (comma, semicolon or tab)."""
    if len(data) > MAX_BYTES:
        raise ImportError_("too_big", max_mb=2)
    if data[:2] == b"PK":  # xlsx is a zip
        from openpyxl import load_workbook
        try:
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as e:  # noqa: BLE001
            raise ImportError_("bad_file") from e
        ws = wb.worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
    elif data[:4] == b"\xd0\xcf\x11\xe0":  # old .xls
        raise ImportError_("old_excel")
    else:
        text = None
        for enc in (("utf-16",) if data[:2] in (b"\xff\xfe", b"\xfe\xff") else ()) + ("utf-8-sig", "cp1252"):
            try:
                text = data.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            raise ImportError_("bad_file")
        sample = text[:4000]
        delim = max([",", ";", "\t"], key=sample.count)
        rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    rows = [r for r in rows if any(str(c).strip() for c in r if c is not None)]
    if not rows:
        raise ImportError_("empty")
    if len(rows) - 1 > MAX_ROWS:
        raise ImportError_("too_many_rows", max_rows=MAX_ROWS)
    return rows


def clean_phone(v) -> tuple[str | None, bool]:
    """91XXXXXXXXXX or None. Second value: the cell had more than one number (first one is used)."""
    if v is None:
        return None, False
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v)
    parts = [p for p in re.split(r"[,/;|]|\s{2,}", s) if re.sub(r"\D", "", p)]
    if not parts:
        return None, False
    d = re.sub(r"\D", "", parts[0])
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    elif len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if len(d) != 10 or d[0] not in "6789" or len(set(d)) == 1:
        return None, len(parts) > 1
    return "91" + d, len(parts) > 1


def clean_vehicles(v) -> tuple[list[str], bool]:
    """Our vehicle keys found in the cell, and whether some word was not understood."""
    if v is None or not str(v).strip():
        return [], False
    found: list[str] = []
    unknown = False
    for part in re.split(r"[,/|+&;]| and | और ", str(v).lower()):
        part = part.strip()
        if not part:
            continue
        hit = next((k for k, words in _VEHICLE_WORDS.items() if any(w in part for w in words)), None)
        if hit and hit not in found:
            found.append(hit)
        elif not hit:
            unknown = True
    return found, unknown


def clean_count(v) -> int | None:
    if v is None or str(v).strip() == "":
        return None
    m = re.search(r"\d+", str(int(v)) if isinstance(v, float) and v.is_integer() else str(v))
    n = int(m.group()) if m else 0
    return n if 1 <= n <= 10000 else None


_STATE_ALIASES = {"mp": "Madhya Pradesh", "up": "Uttar Pradesh", "cg": "Chhattisgarh", "mh": "Maharashtra", "rj": "Rajasthan",
                  "gj": "Gujarat", "br": "Bihar", "jh": "Jharkhand", "od": "Odisha", "or": "Odisha", "wb": "West Bengal",
                  "hr": "Haryana", "pb": "Punjab", "dl": "Delhi", "ka": "Karnataka", "tn": "Tamil Nadu", "ap": "Andhra Pradesh",
                  "ts": "Telangana", "tg": "Telangana", "uk": "Uttarakhand", "hp": "Himachal Pradesh"}


def _state(v) -> str | None:
    s = clean_name(str(v or "")).strip()
    if not s:
        return None
    states = _places()["states"]
    low = s.lower().replace(".", "")
    if low in _STATE_ALIASES:
        return _STATE_ALIASES[low]
    for en, hi in states.items():
        if low == en.lower() or s == hi:
            return en
    return s.title()


class PlaceFinder:
    """District text / pincode -> (district, state). Curated city list first, then the pincode directory."""

    def __init__(self, db):
        self.db = db
        self.cache: dict = {}

    def find(self, district, state, pincode) -> tuple[str | None, str | None]:
        st = _state(state)
        pin = re.sub(r"\D", "", str(int(pincode)) if isinstance(pincode, float) else str(pincode or ""))
        key = (str(district or "").strip().lower(), st, pin)
        if key in self.cache:
            return self.cache[key]
        self.cache[key] = res = self._find(district, st, pin)
        return res

    def _find(self, district, st, pin):
        if re.fullmatch(r"[1-9]\d{5}", pin or ""):
            r = self.db.execute("select district, state from public.pincodes where pincode = %s limit 1", (pin,)).fetchone()
            if r:
                return r["district"], r["state"]
        raw = clean_name(re.sub(r"\(.*?\)", "", str(district or ""))).strip(" ,")
        if not raw:
            return None, None
        name = raw.split(",")[0].strip()
        if not st and "," in raw:   # "रीवा (Rewa), Madhya Pradesh" from the template's city list
            st = _state(raw.split(",", 1)[1])
        low = name.lower()
        cities = _places()["cities"]
        hits = [c for c in cities if c["en"].lower() == low or c["hi"] == name]
        if st:
            hits = [c for c in hits if c["state"] == st] or hits
        if hits:
            return hits[0]["en"], hits[0]["state"]
        rows = self.db.execute(
            "select distinct district, state from public.pincodes where lower(district) = %s limit 5", (low,)
        ).fetchall() or []
        if st:
            rows = [r for r in rows if r["state"] == st] or rows
        if rows:
            return rows[0]["district"], rows[0]["state"]
        # a town / tehsil that is not a district ("Mauganj"): find it by its post office name
        rows = self.db.execute(
            "select district, state from public.pincodes where lower(office) = %s or lower(office) like %s limit 5",
            (low, low + " %"),
        ).fetchall() or []
        if st:
            rows = [r for r in rows if r["state"] == st] or rows
        if rows:
            return rows[0]["district"], rows[0]["state"]
        return None, None


def parse(db, rows: list[list], role: str) -> tuple[dict, list[dict]]:
    """Cleans every row. Returns (column map info, row results). Statuses are set later by analyse()."""
    headers = rows[0]
    cols = map_columns(headers)
    flags = flag_columns(headers)
    if "phone" not in cols.values():
        raise ImportError_("no_phone_column", headers=[str(h) for h in headers if h is not None][:30])
    places = PlaceFinder(db)
    out = []
    for n, r in enumerate(rows[1:], start=2):
        cell = {f: (r[i] if i < len(r) else None) for i, f in cols.items()}
        warn: list[str] = []
        phone, many = clean_phone(cell.get("phone"))
        if many:
            warn.append("many_numbers")
        name = clean_name(str(cell.get("name") or ""))
        if name and name_error(name):
            warn.append("bad_name")
            name = ""
        business = clean_name(str(cell.get("business_name") or "")) if role == "owner" else ""
        if business and name_error(business):
            business = ""
        if not name and not business:
            warn.append("no_name")
        district, state = places.find(cell.get("district"), cell.get("state"), cell.get("pincode"))
        if not district and (cell.get("district") or cell.get("pincode")):
            warn.append("place_unknown")
        elif not district:
            warn.append("no_place")
        vehicles, unknown_v = clean_vehicles(cell.get("vehicles"))
        for i, v in flags.items():
            if i < len(r) and is_yes(r[i]) and v not in vehicles:
                vehicles.append(v)
        if unknown_v:
            warn.append("vehicle_unknown")
        note = clean_name(str(cell.get("note") or ""))[:200]
        out.append({
            "row": n, "phone": phone, "raw_phone": "" if cell.get("phone") is None else str(cell.get("phone"))[:30],
            "name": name[:60] or None, "business_name": business[:80] or None,
            "district": district, "state": state, "vehicles": vehicles,
            "vehicle_count": clean_count(cell.get("vehicle_count")) if role == "owner" else None,
            "note": note or None, "warnings": warn,
        })
    info = {"columns": {str(headers[i]): f for i, f in cols.items()},
            "ignored": [str(h) for i, h in enumerate(headers) if i not in cols and i not in flags and h not in (None, "")]}
    if flags:
        info["columns"].update({str(headers[i]): "vehicles" for i in flags})
    return info, out


def analyse(db, tenant: str, items: list[dict]) -> dict:
    """Sets each row's status against the file itself, app users and earlier imports."""
    phones = list({i["phone"] for i in items if i["phone"]})
    on_app = {r["phone"] for r in (db.execute(
        "select phone from public.profiles where tenant_id = %s and phone = any(%s)", (tenant, phones)).fetchall() or [])}
    known = {r["phone"]: r for r in (db.execute(
        "select phone, joined_at from public.prospects where tenant_id = %s and phone = any(%s)", (tenant, phones)).fetchall() or [])}
    seen: set[str] = set()
    counts = {"new": 0, "update": 0, "on_app": 0, "bad": 0, "warnings": 0}
    for i in items:
        if not i["phone"]:
            i["status"], i["reason"] = "bad", "wrong_number"
        elif i["phone"] in seen:
            i["status"], i["reason"] = "bad", "repeated"
        elif i["phone"] in on_app or (known.get(i["phone"]) or {}).get("joined_at"):
            i["status"] = "on_app"
        elif i["phone"] in known:
            i["status"] = "update"
        else:
            i["status"] = "new"
        if i["phone"]:
            seen.add(i["phone"])
        counts[i["status"]] += 1
        if i["warnings"] and i["status"] in ("new", "update"):
            counts["warnings"] += 1
    return counts
