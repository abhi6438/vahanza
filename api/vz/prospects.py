"""People from bulk imports who have not joined yet: invite text, who may be invited, and
"claim your profile" when they sign up with the same number."""
import logging
from urllib.parse import quote

from .config import get_settings

log = logging.getLogger("vz.prospects")
MAX_INVITES = 3          # never more than this per person
INVITE_GAP_DAYS = 7      # and at least this many days apart
VALID_VEHICLES = {"truck", "trailer", "bus", "car", "jcb", "tractor", "auto", "pickup"}

# Who can be invited right now (used as SQL so lists, counts and sending agree).
ELIGIBLE_SQL = (
    f"p.joined_at is null and not p.opted_out and p.invites < {MAX_INVITES} "
    f"and (p.last_invited_at is null or p.last_invited_at < now() - interval '{INVITE_GAP_DAYS} days')"
)


def invite_link(role: str, base: str | None = None, code: str | None = None) -> str:
    """Personal link: opens "your profile is ready" with the number filled in (code = prospects.code)."""
    base = (base or get_settings().public_app_url or "").rstrip("/")
    if not base:
        return ""
    return f"{base}/?inv={role}&p={code}" if code else f"{base}/?inv={role}"


def invite_text(role: str, name: str | None, brand: str, link: str) -> str:
    hello = f"नमस्ते {name.split()[0]} जी" if name else "नमस्ते"
    if role == "driver":
        body = f"{brand} पर अपने पास के गाड़ी मालिकों का काम देखें और सीधे कॉल करें। बिल्कुल मुफ़्त।"
    else:
        body = f"{brand} पर अपने पास के ड्राइवर देखें और सीधे कॉल करें। बिल्कुल मुफ़्त।"
    return f"{hello}, {body} इसी नंबर से जुड़ें: {link}"


def whatsapp_url(phone: str, text: str) -> str:
    return f"https://wa.me/{phone}?text={quote(text)}"


def claim(db, tenant: str, user_id: str, phone: str | None, role: str) -> bool:
    """On first login: link the imported record and copy its details into the empty profile.
    The person still confirms everything on the first setup screen."""
    if not phone:
        return False
    p = db.execute(
        "update public.prospects set joined_at = now(), profile_id = %s "
        "where tenant_id = %s and phone = %s and joined_at is null "
        "returning role, name, business_name, district, state, vehicles",
        (user_id, tenant, phone),
    ).fetchone()
    if not p:
        return False
    if p["role"] != role:
        return True   # signed up in the other role: keep their own choice, copy nothing
    db.execute(
        """
        update public.profiles set
          name = coalesce(name, %s),
          business_name = case when role = 'owner' then coalesce(business_name, %s) else business_name end,
          district = coalesce(district, %s), city = coalesce(city, %s), state = coalesce(state, %s)
        where id = %s and not setup_done
        """,
        (p["name"], p["business_name"], p["district"], p["district"], p["state"], user_id),
    )
    vehicles = [v for v in (p["vehicles"] or []) if v in VALID_VEHICLES]
    if role == "driver" and vehicles:
        db.execute(
            "update public.driver_details set vehicles = %s where profile_id = %s and coalesce(cardinality(vehicles), 0) = 0",
            (vehicles, user_id),
        )
    return True
