"""Sprint 10: "Verified" badge by photo.

Driver: licence photo + selfie. Owner: shop board / GST / RC photo + selfie. An admin compares them in
the check queue. Photos are stored under random names and deleted right after the check; only the
result (approved / rejected + reason) is kept. A Verified profile never needs this again.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from .. import blob, notify
from ..auth import AuthUser, current_user
from ..deps import get_db, tenant_id
from .admin import _audit, admin_ctx
from .photo import MAX_BYTES, _sniff

router = APIRouter(tags=["verify"])
COLS = "id, kind, status, reason, doc_url, selfie_url, submitted_at, reviewed_at"


def _me(db, user: AuthUser, tenant: str) -> dict:
    me = db.execute("select id, tenant_id, role, blocked, verified from public.profiles where id = %s", (user.id,)).fetchone()
    if not me or me["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    if me["blocked"]:
        raise HTTPException(403, "Account blocked")
    if me["role"] not in ("driver", "owner"):
        raise HTTPException(403, "Drivers and owners only")
    return me


def _out(row: Optional[dict], verified: bool) -> dict:
    if not row:
        return {"verified": verified, "status": "none"}
    r = dict(row)
    for k in ("submitted_at", "reviewed_at"):
        r[k] = r[k].isoformat() if r.get(k) else None
    return {"verified": verified, **r}


def _latest(db, user_id: str) -> Optional[dict]:
    return db.execute(f"select {COLS} from public.verifications where profile_id = %s order by created_at desc limit 1", (user_id,)).fetchone()


@router.get("/me/verification")
def my_verification(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    me = _me(db, user, tenant)
    return _out(_latest(db, user.id), me["verified"])


@router.put("/me/verification/{part}")
async def put_photo(part: Literal["doc", "selfie"], request: Request, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    """Adds the document photo or the selfie to the open (draft) request, starting one if needed."""
    me = _me(db, user, tenant)
    if me["verified"]:
        raise HTTPException(409, {"code": "already_verified"})
    data = await request.body()
    if not data:
        raise HTTPException(422, {"code": "empty"})
    if len(data) > MAX_BYTES:
        raise HTTPException(413, {"code": "too_large"})
    ctype = _sniff(data)
    if not ctype:
        raise HTTPException(415, {"code": "not_an_image"})
    last = _latest(db, user.id)
    if last and last["status"] == "pending":
        raise HTTPException(409, {"code": "pending"})
    draft = last if last and last["status"] == "draft" else db.execute(
        "insert into public.verifications (tenant_id, profile_id, kind) values (%s, %s, %s) returning " + COLS,
        (tenant, user.id, "driver_licence" if me["role"] == "driver" else "owner_business"),
    ).fetchone()
    try:
        url = blob.put(f"{tenant}/verify/{user.id}/{part}", data, ctype)
    except blob.BlobError:
        raise HTTPException(502, {"code": "upload_failed"})
    col = "doc_url" if part == "doc" else "selfie_url"
    db.execute(f"update public.verifications set {col} = %s where id = %s", (url, draft["id"]))
    blob.delete(draft[col])
    return _out({**dict(draft), col: url}, False)


@router.post("/me/verification/submit")
def submit(user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    _me(db, user, tenant)
    row = db.execute(
        "update public.verifications set status = 'pending', submitted_at = now() "
        "where id = (select id from public.verifications where profile_id = %s and status = 'draft' order by created_at desc limit 1) "
        "and doc_url is not null and selfie_url is not null returning " + COLS,
        (user.id,),
    ).fetchone()
    if not row:
        raise HTTPException(422, {"code": "photos_needed"})
    return _out(row, False)


# ---------------------------------------------------------------- admin
@router.get("/admin/verifications")
def queue(status: Literal["pending", "approved", "rejected"] = Query("pending"), ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    rows = db.execute(
        f"""
        select v.id, v.kind, v.status, v.reason, v.doc_url, v.selfie_url, v.submitted_at, v.reviewed_at,
               p.id as profile_id, p.name, p.business_name, p.role, p.phone, p.photo_url, p.district, p.state
        from public.verifications v join public.profiles p on p.id = v.profile_id
        where v.tenant_id = %s and v.status = %s
        order by v.submitted_at {'asc' if status == 'pending' else 'desc'} limit 100
        """,
        (ctx["tenant"], status),
    ).fetchall() or []
    out = []
    for r in rows:
        r = dict(r)
        r["profile_id"] = str(r["profile_id"])
        for k in ("submitted_at", "reviewed_at"):
            r[k] = r[k].isoformat() if r.get(k) else None
        out.append(r)
    return {"items": out}


class Review(BaseModel):
    action: Literal["approve", "reject"]
    reason: Optional[Literal["blurry", "mismatch", "wrong_doc", "expired", "other"]] = None


@router.post("/admin/verifications/{vid}/review")
def review(vid: int, body: Review, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    if body.action == "reject" and not body.reason:
        raise HTTPException(422, {"code": "reason_needed"})
    ok = body.action == "approve"
    old = db.execute(
        "select doc_url, selfie_url from public.verifications where id = %s and tenant_id = %s and status = 'pending'",
        (vid, ctx["tenant"]),
    ).fetchone()
    row = old and db.execute(
        "update public.verifications set status = %s, reason = %s, reviewed_at = now(), reviewed_by = %s, doc_url = null, selfie_url = null "
        "where id = %s and tenant_id = %s and status = 'pending' returning profile_id",
        ("approved" if ok else "rejected", None if ok else body.reason, ctx["id"], vid, ctx["tenant"]),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Not pending")
    if ok:
        db.execute("update public.profiles set verified = true where id = %s", (row["profile_id"],))
    # photos are not kept after the check
    blob.delete(old["doc_url"])
    blob.delete(old["selfie_url"])
    _audit(db, ctx, f"verify_{body.action}", "verification", None, f"verification {vid}" + (f": {body.reason}" if body.reason else ""))
    notify.safe(db, notify.to_user, ctx["tenant"], str(row["profile_id"]), "verify_result", {"ok": ok, "reason": body.reason or ""})
    return {"id": vid, "status": "approved" if ok else "rejected"}
