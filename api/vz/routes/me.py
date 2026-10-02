"""Who am I: the logged-in user's profile, first-time role choice, and last-seen heartbeat."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id

router = APIRouter(prefix="/me", tags=["me"])

PROFILE_COLS = "id, tenant_id, role, name, phone, photo_url, lang, city, pincode, verified, blocked, created_at"


class Profile(BaseModel):
    id: str
    tenant_id: str
    role: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    lang: str = "hi"
    city: Optional[str] = None
    pincode: Optional[str] = None
    verified: bool = False


class MeResponse(BaseModel):
    exists: bool
    profile: Optional[Profile] = None


class StartBody(BaseModel):
    role: Literal["driver", "owner"]
    lang: Literal["hi", "en"] = "hi"
    name: Optional[str] = Field(default=None, max_length=80)


def _to_profile(row: dict) -> Profile:
    return Profile(**{k: (str(v) if k == "id" else v) for k, v in row.items() if k in Profile.model_fields})


@router.get("", response_model=MeResponse)
def get_me(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    row = db.execute(f"select {PROFILE_COLS} from public.profiles where id = %s", (user.id,)).fetchone()
    if not row:
        return MeResponse(exists=False)
    if row["blocked"]:
        raise HTTPException(403, "Account blocked")
    if row["tenant_id"] != tenant:
        raise HTTPException(403, "This number is registered with another brand")
    return MeResponse(exists=True, profile=_to_profile(row))


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
    return MeResponse(exists=True, profile=_to_profile(row))


@router.post("/seen", status_code=204)
def seen(user: AuthUser = Depends(current_user), db=Depends(get_db)):
    """Heartbeat sent every few minutes while the app is open; powers 'online now'."""
    db.execute("update public.profiles set last_seen_at = now() where id = %s", (user.id,))
