"""Sprint 10: "काम मिल गया" (hires), job views, "still looking for work?".

Hire flow: the owner marks a post filled and picks whom they hired (from drivers who showed interest
or whose number they opened). Each picked driver confirms or says no. A confirmed hire counts on both
cards ("✓ N jobs"), turns the driver's availability off, and makes the rating "worked together".
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import notify
from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id

router = APIRouter(tags=["work"])
MAX_HIRES = 20

# Drivers an owner may say they hired for a post: showed interest in it, or the owner opened their number (60 days).
CANDIDATES_SQL = """
    select p.id, p.name, p.photo_url, p.district, p.state, bool_or(c.interested) as interested
    from (
      select i.driver_id as id, true as interested from public.interests i where i.post_id = %(post)s
      union all
      select (e.props->>'driver_id')::uuid, false from public.events e
       where e.user_id = %(me)s::uuid and e.name = 'contact_reveal' and e.props ? 'driver_id'
         and e.ts > now() - interval '60 days'
    ) c
    join public.profiles p on p.id = c.id
    where p.role = 'driver' and not p.blocked and p.tenant_id = %(t)s
    group by p.id
"""


def _me(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute("select id, tenant_id, role, blocked, name, business_name, is_test from public.profiles where id = %s", (user.id,)).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    return me


def _own_post(db, post_id: str, user_id: str) -> dict:
    row = db.execute("select id, status from public.posts where id = %s and owner_id = %s", (post_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "Post not found")
    return row


@router.get("/posts/{post_id}/hire-candidates")
def hire_candidates(post_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    if me["role"] != "owner":
        raise HTTPException(403, "Owners only")
    _own_post(db, post_id, user.id)
    rows = db.execute(CANDIDATES_SQL + " order by bool_or(c.interested) desc, p.name limit 60",
                      {"post": post_id, "me": user.id, "t": tenant}).fetchall() or []
    hired = {str(r["driver_id"]): r["status"] for r in (db.execute(
        "select driver_id, status from public.hires where post_id = %s", (post_id,)).fetchall() or [])}
    return {"items": [{**dict(r), "id": str(r["id"]), "hire_status": hired.get(str(r["id"]))} for r in rows]}


class HiresIn(BaseModel):
    driver_ids: list[str] = Field(default_factory=list, max_length=MAX_HIRES)


@router.post("/posts/{post_id}/hires")
def mark_hired(post_id: str, body: HiresIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Marks the post filled and asks each picked driver to confirm. An empty list = "hired someone not from the app"."""
    me = _me(db, user, tenant)
    if me["role"] != "owner":
        raise HTTPException(403, "Owners only")
    post = _own_post(db, post_id, user.id)
    if post["status"] == "under_check":
        raise HTTPException(409, {"code": "under_check"})
    ids = list(dict.fromkeys(body.driver_ids))
    if ids:
        ok = {str(r["id"]) for r in (db.execute(CANDIDATES_SQL, {"post": post_id, "me": user.id, "t": tenant}).fetchall() or [])}
        if not set(ids) <= ok:
            raise HTTPException(422, {"code": "not_a_candidate"})
    db.execute("update public.posts set status = 'filled' where id = %s and owner_id = %s and status <> 'closed'", (post_id, user.id))
    owner = me.get("business_name") or me.get("name") or ""
    asked = 0
    for d in ids:
        row = db.execute(
            "insert into public.hires (tenant_id, post_id, owner_id, driver_id) values (%s, %s, %s, %s) "
            "on conflict do nothing returning id",
            (tenant, post_id, user.id, d),
        ).fetchone()
        if row:
            asked += 1
            notify.safe(db, notify.to_user, tenant, d, "hire_confirm", {"owner": owner, "hire_id": row["id"], "post_id": post_id})
    return {"post_id": post_id, "status": "filled", "asked": asked}


@router.get("/me/hires")
def my_hires(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Driver: jobs waiting for "yes, I got it". Both: confirmed jobs (latest 20)."""
    me = _me(db, user, tenant)
    col = "h.driver_id" if me["role"] == "driver" else "h.owner_id"
    other = "h.owner_id" if me["role"] == "driver" else "h.driver_id"
    rows = db.execute(
        f"""
        select h.id, h.status, h.created_at, h.post_id, o.id as other_id, o.name as other_name, o.business_name as other_business,
               o.photo_url as other_photo
        from public.hires h join public.profiles o on o.id = {other}
        where {col} = %s and (h.status = 'pending' or (h.status = 'confirmed' and h.answered_at > now() - interval '180 days'))
        order by h.created_at desc limit 20
        """,
        (user.id,),
    ).fetchall() or []
    out = []
    for r in rows:
        r = dict(r)
        r["created_at"] = r["created_at"].isoformat()
        for k in ("post_id", "other_id"):
            r[k] = str(r[k]) if r[k] else None
        out.append(r)
    return {"items": out}


class Answer(BaseModel):
    confirm: bool


@router.post("/hires/{hire_id}/answer")
def answer(hire_id: int, body: Answer, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """The driver says yes (got the job) or no. Yes: counted on both cards, availability off."""
    me = _me(db, user, tenant)
    row = db.execute(
        "update public.hires set status = %s, answered_at = now() where id = %s and driver_id = %s and status = 'pending' "
        "returning owner_id",
        ("confirmed" if body.confirm else "declined", hire_id, user.id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Nothing to answer")
    if body.confirm:
        db.execute("update public.profiles set jobs_done = jobs_done + 1 where id = any(%s::uuid[])", ([user.id, str(row["owner_id"])],))
        db.execute("update public.driver_details set is_available = false, looking_checked_at = now() where profile_id = %s", (user.id,))
        notify.safe(db, notify.to_user, tenant, str(row["owner_id"]), "hire_done", {"driver": (me.get("name") or "").split(" ")[0]})
    return {"id": hire_id, "status": "confirmed" if body.confirm else "declined", "available": not body.confirm}


@router.post("/jobs/{post_id}/view", status_code=204)
def job_viewed(post_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """A driver opened a job's full details (once per driver per day)."""
    me = _me(db, user, tenant)
    if me["role"] != "driver":
        return
    db.execute(
        """insert into public.post_views (tenant_id, post_id, viewer_id)
           select %s, p.id, %s from public.posts p where p.id = %s and p.tenant_id = %s and p.owner_id <> %s
           on conflict do nothing""",
        (tenant, user.id, post_id, tenant, user.id),
    )


class Looking(BaseModel):
    still: bool
    found_here: Optional[bool] = None   # "got work through the app" (only counted, no hire record)


@router.post("/me/looking")
def still_looking(body: Looking, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Answer to "still looking for work?": yes keeps the driver high in lists; no turns availability off."""
    me = _me(db, user, tenant)
    if me["role"] != "driver":
        raise HTTPException(403, "Drivers only")
    db.execute(
        "insert into public.driver_details (profile_id, tenant_id, is_available, looking_checked_at) values (%s, %s, %s, now()) "
        "on conflict (profile_id) do update set is_available = excluded.is_available, looking_checked_at = now()",
        (user.id, tenant, body.still),
    )
    return {"is_available": body.still}
