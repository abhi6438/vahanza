"""Trust & safety: report someone, block someone, rate someone you were in touch with."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .. import notify, rewards
from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id

router = APIRouter(tags=["trust"])

REPORTS_TO_FLAG = 2          # distinct people reporting the same profile/post -> admin check queue
DRIVER_TAGS = {"time", "safe", "care", "sober", "manner"}     # owner rates a driver
OWNER_TAGS = {"pay", "manner", "stay", "leave", "vehicle"}    # driver rates an owner

# "In touch" = one revealed the other's number (call / WhatsApp), or a driver showed interest in the owner's post.
IN_TOUCH_SQL = """
    exists (select 1 from public.events e
             where e.name = 'contact_reveal'
               and ((e.user_id = %(a)s::uuid and (e.props->>'driver_id' = %(b)s::text
                        or e.props->>'post_id' in (select id::text from public.posts where owner_id = %(b)s::uuid)))
                 or (e.user_id = %(b)s::uuid and (e.props->>'driver_id' = %(a)s::text
                        or e.props->>'post_id' in (select id::text from public.posts where owner_id = %(a)s::uuid)))))
    or exists (select 1 from public.interests i join public.posts p on p.id = i.post_id
                where (i.driver_id = %(a)s::uuid and p.owner_id = %(b)s::uuid) or (i.driver_id = %(b)s::uuid and p.owner_id = %(a)s::uuid))
    or exists (select 1 from public.hires h where h.status = 'confirmed'
                and ((h.driver_id = %(a)s::uuid and h.owner_id = %(b)s::uuid) or (h.driver_id = %(b)s::uuid and h.owner_id = %(a)s::uuid)))
"""
WORKED_SQL = """(exists (select 1 from public.hires h where h.status = 'confirmed'
                and ((h.driver_id = %(a)s::uuid and h.owner_id = %(b)s::uuid) or (h.driver_id = %(b)s::uuid and h.owner_id = %(a)s::uuid)))
              or exists (select 1 from public.work_history wh where wh.status in ('confirmed', 'admin_ok')
                and ((wh.driver_id = %(a)s::uuid and wh.owner_id = %(b)s::uuid) or (wh.driver_id = %(b)s::uuid and wh.owner_id = %(a)s::uuid))))"""

# Used by list queries elsewhere: hide people blocked in either direction.
NOT_BLOCKED = """not exists (select 1 from public.blocks bl
                  where (bl.blocker_id = {me}::uuid and bl.blocked_id = {other}) or (bl.blocker_id = {other} and bl.blocked_id = {me}::uuid))"""


def _me(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute("select id, tenant_id, role, blocked, is_test from public.profiles where id = %s", (user.id,)).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    return me


def _person(db, pid: str, tenant: str) -> dict:
    row = db.execute("select id, role, name from public.profiles where id = %s and tenant_id = %s and role in ('driver','owner')", (pid, tenant)).fetchone()
    if not row:
        raise HTTPException(404, "Person not found")
    return row


def is_blocked(db, a: str, b: str) -> bool:
    return bool(db.execute(
        "select 1 from public.blocks where (blocker_id = %s and blocked_id = %s) or (blocker_id = %s and blocked_id = %s)",
        (a, b, b, a),
    ).fetchone())


# ---------------------------------------------------------------- reports
class ReportIn(BaseModel):
    target_type: Literal["profile", "post"]
    target_id: str
    reason: Literal["fake", "wrong_number", "asked_money", "behaviour", "other"]
    note: Optional[str] = Field(default=None, max_length=300)


@router.post("/reports", status_code=201)
def report(body: ReportIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    _me(db, user, tenant)
    if body.target_type == "post":
        row = db.execute("select owner_id from public.posts where id = %s and tenant_id = %s", (body.target_id, tenant)).fetchone()
        if not row:
            raise HTTPException(404, "Post not found")
        owner = str(row["owner_id"])
    else:
        owner = str(_person(db, body.target_id, tenant)["id"])
    if owner == user.id:
        raise HTTPException(422, {"code": "self"})
    db.execute(
        "insert into public.reports (tenant_id, reporter_id, target_type, target_id, reason, note) values (%s, %s, %s, %s, %s, %s) "
        "on conflict do nothing",
        (tenant, user.id, body.target_type, body.target_id, body.reason, (body.note or "").strip() or None),
    )
    n = db.execute(
        "select count(distinct reporter_id) as n from public.reports where target_type = %s and target_id = %s and status = 'open'",
        (body.target_type, body.target_id),
    ).fetchone()
    if n and n["n"] >= REPORTS_TO_FLAG:
        if body.target_type == "post":
            db.execute(
                "update public.posts set status = 'under_check', check_flags = check_flags || '[\"reported\"]'::jsonb "
                "where id = %s and status = 'live' and not check_flags ? 'reported'",
                (body.target_id,),
            )
        else:
            db.execute(
                "update public.profiles set check_flags = check_flags || '[\"reported\"]'::jsonb where id = %s and not check_flags ? 'reported'",
                (body.target_id,),
            )
    return {"reported": True}


# ---------------------------------------------------------------- blocks
@router.post("/blocks/{profile_id}", status_code=201)
def block(profile_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    _me(db, user, tenant)
    if profile_id == user.id:
        raise HTTPException(422, {"code": "self"})
    _person(db, profile_id, tenant)
    db.execute("insert into public.blocks (blocker_id, blocked_id, tenant_id) values (%s, %s, %s) on conflict do nothing", (user.id, profile_id, tenant))
    return {"blocked": True}


@router.delete("/blocks/{profile_id}", status_code=204)
def unblock(profile_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db)):
    db.execute("delete from public.blocks where blocker_id = %s and blocked_id = %s", (user.id, profile_id))


@router.get("/me/blocks")
def my_blocks(user: AuthUser = Depends(current_user), db=Depends(get_db)):
    rows = db.execute(
        """select p.id, p.name, p.business_name, p.role, p.photo_url, b.created_at
           from public.blocks b join public.profiles p on p.id = b.blocked_id
           where b.blocker_id = %s order by b.created_at desc""",
        (user.id,),
    ).fetchall() or []
    return {"items": [{**dict(r), "id": str(r["id"]), "created_at": r["created_at"].isoformat()} for r in rows]}


# ---------------------------------------------------------------- ratings
class RatingIn(BaseModel):
    ratee_id: str
    stars: int = Field(ge=1, le=5)
    tags: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v):
        return list(dict.fromkeys(v))


@router.post("/ratings", status_code=201)
def rate(body: RatingIn, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    if body.ratee_id == user.id:
        raise HTTPException(422, {"code": "self"})
    other = _person(db, body.ratee_id, tenant)
    if other["role"] == me["role"]:
        raise HTTPException(422, {"code": "same_role"})
    allowed = DRIVER_TAGS if other["role"] == "driver" else OWNER_TAGS
    if not set(body.tags) <= allowed:
        raise HTTPException(422, {"code": "bad_tag"})
    touch = db.execute(f"select ({IN_TOUCH_SQL}) as ok, ({WORKED_SQL}) as worked", {"a": user.id, "b": body.ratee_id}).fetchone()
    if not touch or not (touch["ok"] or touch.get("worked")):
        raise HTTPException(403, {"code": "not_in_touch"})
    db.execute(
        """insert into public.ratings (rater_id, ratee_id, tenant_id, stars, tags, worked) values (%s, %s, %s, %s, %s, %s)
           on conflict (rater_id, ratee_id) do update set stars = excluded.stars, tags = excluded.tags, worked = excluded.worked""",
        (user.id, body.ratee_id, tenant, body.stars, body.tags, bool(touch.get("worked"))),
    )
    notify.safe(db, rewards.award, tenant, user.id, "rating_given", body.ratee_id)
    notify.safe(db, rewards.refresh_tick, tenant, body.ratee_id)     # the rating can lift them to gold
    return {"rated": True}


@router.get("/me/to-rate")
def to_rate(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Up to 3 people the user was in touch with (30 days, at least 3 hours ago) and has not rated yet."""
    me = _me(db, user, tenant)
    rows = db.execute(
        f"""
        with touched as (
          select (e.props->>'driver_id')::uuid as other, e.ts from public.events e
           where e.user_id = %(me)s::uuid and e.name = 'contact_reveal' and e.props ? 'driver_id'
          union all
          select p.owner_id, e.ts from public.events e join public.posts p on p.id::text = e.props->>'post_id'
           where e.user_id = %(me)s::uuid and e.name = 'contact_reveal'
          union all
          select i.driver_id, i.created_at from public.interests i join public.posts p on p.id = i.post_id
           where p.owner_id = %(me)s::uuid and i.status = 'seen'
          union all
          select p.owner_id, i.created_at from public.interests i join public.posts p on p.id = i.post_id
           where i.driver_id = %(me)s::uuid and i.status = 'seen'
          union all
          select case when h.driver_id = %(me)s::uuid then h.owner_id else h.driver_id end, h.answered_at - interval '3 hours'
            from public.hires h where h.status = 'confirmed' and (h.driver_id = %(me)s::uuid or h.owner_id = %(me)s::uuid)
        )
        select o.id, o.name, o.business_name, o.role, o.photo_url, max(t.ts) as last_contact,
               exists (select 1 from public.hires h where h.status = 'confirmed'
                       and ((h.driver_id = %(me)s::uuid and h.owner_id = o.id) or (h.owner_id = %(me)s::uuid and h.driver_id = o.id))) as worked
        from touched t join public.profiles o on o.id = t.other
        where t.ts between now() - interval '30 days' and now() - interval '3 hours'
          and o.tenant_id = %(t)s and not o.blocked and o.role <> %(role)s
          and not exists (select 1 from public.ratings r where r.rater_id = %(me)s::uuid and r.ratee_id = o.id)
          and {NOT_BLOCKED.format(me='%(me)s', other='o.id')}
        group by o.id order by 7 desc, max(t.ts) desc limit 3
        """,
        {"me": user.id, "t": tenant, "role": me["role"]},
    ).fetchall() or []
    return {"items": [{**dict(r), "id": str(r["id"]), "last_contact": r["last_contact"].isoformat()} for r in rows]}
