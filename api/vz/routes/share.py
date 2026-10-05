"""Short links that are shared on WhatsApp and printed on posters.

  /j/<code>   a job        → WhatsApp shows a preview (title + text), the app opens the job
  /r/<code>   a referral   → "Ramesh invited you", the app opens with the code remembered
  /q/<code>   a QR poster  → straight into the app, the poster code remembered

WhatsApp and other apps read the <meta property="og:..."> tags of the page; people are sent on with a
redirect. No login, no phone numbers, no owner names in these pages.
"""
import html

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from ..config import get_settings
from ..deps import get_db
from ..growth import clean_code

router = APIRouter(tags=["share"], include_in_schema=False)

VEHICLE_HI = {"truck": "ट्रक", "trailer": "ट्रेलर", "bus": "बस", "car": "कार", "jcb": "जेसीबी", "tractor": "ट्रैक्टर", "auto": "ऑटो", "pickup": "पिकअप"}


def _tenant(request: Request) -> str:
    return request.headers.get("x-brand") or get_settings().default_tenant


def _brand(db, tenant: str) -> str:
    row = db.execute("select name from public.tenants where id = %s", (tenant,)).fetchone()
    return (row or {}).get("name") or "Vahanza"


def _base(request: Request) -> str:
    """Public address for the preview image (a proxy in front may pass the real host on)."""
    host = request.headers.get("x-forwarded-host")
    if host:
        proto = request.headers.get("x-forwarded-proto", "https")
        return f"{proto}://{host.split(',')[0].strip()}"
    return str(request.base_url).rstrip("/")


def _page(request: Request, title: str, text: str, to: str, brand: str) -> HTMLResponse:
    base = _base(request)
    e = html.escape
    url = to   # same site: a relative redirect works behind any proxy
    body = f"""<!doctype html><html lang="hi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(text)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="{e(brand)}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(text)}">
<meta property="og:url" content="{e(base + request.url.path)}"><meta property="og:image" content="{e(base)}/icons/icon-512.png">
<meta property="og:image:width" content="512"><meta property="og:image:height" content="512">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url={e(url)}">
</head><body style="font-family:system-ui,sans-serif;padding:24px">
<p>{e(title)}</p><p><a href="{e(url)}">{e(brand)} खोलें / Open</a></p>
<script>location.replace({url!r})</script></body></html>"""
    return HTMLResponse(body, headers={"Cache-Control": "public, max-age=300"})


@router.get("/j/{code}")
def job_link(code: str, request: Request, db=Depends(get_db)):
    tenant = _tenant(request)
    code = clean_code(code)
    brand = _brand(db, tenant)
    row = db.execute(
        """
        select p.savings_monthly, p.base_cities, o.district, (p.status = 'live' and p.expires_at > now()) as open,
               array(select fg.vehicle_type from public.post_groups pg join public.fleet_groups fg on fg.id = pg.fleet_group_id
                     where pg.post_id = p.id order by fg.created_at) as vehicles,
               (select coalesce(sum(drivers_needed), 0) from public.post_groups where post_id = p.id) as need
        from public.posts p join public.profiles o on o.id = p.owner_id
        where p.tenant_id = %s and p.share_code = %s and not o.blocked and not o.is_test and p.status <> 'under_check'
        """,
        (tenant, code),
    ).fetchone()
    to = f"/jobs/{code}?s=share"
    if not row:
        return _page(request, f"{brand} पर ड्राइवर का काम", "पास के गाड़ी मालिकों का काम देखें और सीधे कॉल करें। बिल्कुल मुफ़्त।", "/jobs", brand)
    city = (row["base_cities"] or [None])[0] or row["district"] or ""
    city = city.split(",")[0].strip()
    vehicles = ", ".join(dict.fromkeys(VEHICLE_HI.get(v, v) for v in (row["vehicles"] or []))) or "गाड़ी"
    where = f"{city} में " if city else ""
    title = f"{where}{vehicles} के लिए {row['need']} ड्राइवर चाहिए"
    money = f"₹{row['savings_monthly']:,}"
    text = (f"बचत {money}/महीना। {brand} पर देखें और मालिक को सीधे कॉल करें। बिल्कुल मुफ़्त।" if row["open"]
            else f"यह काम भर गया है। {brand} पर और काम देखें।")
    return _page(request, title, text, to, brand)


@router.get("/r/{code}")
def referral_link(code: str, request: Request, db=Depends(get_db)):
    tenant = _tenant(request)
    code = clean_code(code).upper()
    brand = _brand(db, tenant)
    row = db.execute(
        "select name from public.profiles where tenant_id = %s and ref_code = %s and not blocked", (tenant, code)
    ).fetchone()
    first = ((row or {}).get("name") or "").split(" ")[0]
    title = f"{first} ने आपको {brand} पर बुलाया है" if first else f"{brand} से जुड़ें"
    text = "ड्राइवर के लिए पास का काम, मालिक के लिए अच्छे ड्राइवर। सीधे कॉल करें, कोई कमीशन नहीं।"
    return _page(request, title, text, f"/?ref={code}" if row else "/", brand)


@router.get("/q/{code}")
def poster_link(code: str):
    """QR on a poster: no preview needed, straight into the app."""
    return RedirectResponse(f"/?poster={clean_code(code)}", status_code=302)
