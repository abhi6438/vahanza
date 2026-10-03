"""Bell (in-app notifications), push subscriptions and notification settings."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from .. import push
from ..auth import AuthUser, current_user
from ..config import get_settings
from ..deps import get_db

router = APIRouter(tags=["notifications"])
KINDS = {"new_post", "new_interest", "interest_seen"}


@router.get("/notifications")
def list_notifications(before: Optional[int] = Query(None), user: AuthUser = Depends(current_user), db=Depends(get_db)):
    rows = db.execute(
        "select id, kind, data, read_at, created_at from public.notifications "
        "where user_id = %s and (%s::bigint is null or id < %s) order by id desc limit 30",
        (user.id, before, before),
    ).fetchall() or []
    unread = db.execute("select count(*) as n from public.notifications where user_id = %s and read_at is null", (user.id,)).fetchone()
    items = [{**dict(r), "read_at": r["read_at"].isoformat() if r["read_at"] else None, "created_at": r["created_at"].isoformat()} for r in rows]
    return {"items": items, "unread": (unread or {}).get("n", 0), "has_more": len(items) == 30}


@router.get("/notifications/unread")
def unread_count(user: AuthUser = Depends(current_user), db=Depends(get_db)):
    row = db.execute("select count(*) as n from public.notifications where user_id = %s and read_at is null", (user.id,)).fetchone()
    return {"unread": (row or {}).get("n", 0)}


class ReadBody(BaseModel):
    ids: Optional[list[int]] = Field(default=None, max_length=100)   # none = mark all read


@router.post("/notifications/read", status_code=204)
def mark_read(body: ReadBody, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    if body.ids:
        db.execute("update public.notifications set read_at = now() where user_id = %s and id = any(%s) and read_at is null", (user.id, body.ids))
    else:
        db.execute("update public.notifications set read_at = now() where user_id = %s and read_at is null", (user.id,))


@router.get("/push/config")
def push_config():
    """What the app needs to subscribe this device."""
    cfg = push.configured()
    return {"webpush": cfg["webpush"], "fcm": cfg["fcm"], "vapid_public_key": get_settings().vapid_public_key or None}


class Subscribe(BaseModel):
    kind: Literal["webpush", "fcm"]
    endpoint: str = Field(min_length=10, max_length=1000)
    keys: dict[str, str] = Field(default_factory=dict)


@router.post("/push/subscribe", status_code=201)
def subscribe(body: Subscribe, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    if body.kind == "webpush" and not body.endpoint.startswith("https://"):
        raise HTTPException(422, "Bad endpoint")
    if body.kind == "webpush" and not {"p256dh", "auth"} <= set(body.keys):
        raise HTTPException(422, "Missing keys")
    db.execute(
        """insert into public.push_subscriptions (user_id, kind, endpoint, keys) values (%s, %s, %s, %s)
           on conflict (endpoint) do update set user_id = excluded.user_id, keys = excluded.keys, created_at = now()""",
        (user.id, body.kind, body.endpoint, Jsonb(body.keys)),
    )
    # keep the list small: a person rarely has more than a few devices
    db.execute(
        "delete from public.push_subscriptions where user_id = %s and id not in "
        "(select id from public.push_subscriptions where user_id = %s order by created_at desc limit 5)",
        (user.id, user.id),
    )
    return {"subscribed": True}


class Unsubscribe(BaseModel):
    endpoint: str


@router.post("/push/unsubscribe", status_code=204)
def unsubscribe(body: Unsubscribe, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    db.execute("delete from public.push_subscriptions where user_id = %s and endpoint = %s", (user.id, body.endpoint))


class Prefs(BaseModel):
    new_post: Optional[bool] = None
    new_interest: Optional[bool] = None
    interest_seen: Optional[bool] = None


@router.get("/me/notify-prefs")
def get_prefs(user: AuthUser = Depends(current_user), db=Depends(get_db)):
    row = db.execute("select notify_prefs from public.profiles where id = %s", (user.id,)).fetchone()
    p = (row or {}).get("notify_prefs") or {}
    return {k: p.get(k, True) for k in KINDS}


@router.patch("/me/notify-prefs")
def set_prefs(body: Prefs, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    row = db.execute(
        "update public.profiles set notify_prefs = notify_prefs || %s where id = %s returning notify_prefs",
        (Jsonb(patch), user.id),
    ).fetchone()
    p = (row or {}).get("notify_prefs") or {}
    return {k: p.get(k, True) for k in KINDS}
