"""Profile photo (optional). The app shrinks the photo to ~512 px JPEG before sending it."""
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from .. import blob
from ..auth import AuthUser, current_user
from ..config import get_settings
from ..deps import get_db, tenant_id

router = APIRouter(tags=["photo"])
MAX_BYTES = 2 * 1024 * 1024
SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
}


def _sniff(data: bytes) -> str | None:
    for sig, ctype in SIGNATURES.items():
        if data.startswith(sig):
            return ctype
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


@router.post("/me/photo")
async def upload_photo(request: Request, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id)):
    data = await request.body()
    if not data:
        raise HTTPException(422, {"code": "empty"})
    if len(data) > MAX_BYTES:
        raise HTTPException(413, {"code": "too_large"})
    ctype = _sniff(data)
    if not ctype:
        raise HTTPException(415, {"code": "not_an_image"})
    row = db.execute("select photo_url, tenant_id from public.profiles where id = %s", (user.id,)).fetchone()
    if not row or row["tenant_id"] != tenant:
        raise HTTPException(404, "Profile not found")
    try:
        url = blob.put(f"{tenant}/profiles/{user.id}", data, ctype)
    except blob.BlobError:
        raise HTTPException(502, {"code": "upload_failed"})
    db.execute("update public.profiles set photo_url = %s, photo_added_at = now() where id = %s", (url, user.id))
    blob.delete(row["photo_url"])
    return {"photo_url": url}


@router.delete("/me/photo", status_code=204)
def remove_photo(user: AuthUser = Depends(current_user), db=Depends(get_db)):
    row = db.execute("select photo_url from public.profiles where id = %s", (user.id,)).fetchone()
    db.execute("update public.profiles set photo_url = null, photo_added_at = null where id = %s", (user.id,))
    if row:
        blob.delete(row["photo_url"])


@router.get("/dev-files/{name}", include_in_schema=False)
def dev_file(name: str):
    """Local development only (no Blob token)."""
    s = get_settings()
    if s.blob_read_write_token or "/" in name or ".." in name:
        raise HTTPException(404)
    path = os.path.join(s.dev_upload_dir, name)
    if not os.path.exists(path):
        raise HTTPException(404)
    return FileResponse(path)
