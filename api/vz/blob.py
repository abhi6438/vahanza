"""Profile photo storage.

Production: Vercel Blob (BLOB_READ_WRITE_TOKEN, created in Vercel > Storage > Blob).
Local dev without a token: files go to a temp folder and are served by /api/v1/dev-files.
"""
import logging
import os
import secrets

import httpx

from .config import get_settings

log = logging.getLogger("vz.blob")
BLOB_API = "https://blob.vercel-storage.com"
BLOB_API_VERSION = "7"


class BlobError(Exception):
    pass


def put(pathname: str, data: bytes, content_type: str) -> str:
    """Stores the file and returns its public URL."""
    s = get_settings()
    name = f"{pathname}-{secrets.token_hex(6)}"
    if not s.blob_read_write_token:
        os.makedirs(s.dev_upload_dir, exist_ok=True)
        local = name.replace("/", "_")
        with open(os.path.join(s.dev_upload_dir, local), "wb") as f:
            f.write(data)
        return f"/api/v1/dev-files/{local}"
    try:
        r = httpx.put(
            f"{BLOB_API}/{name}",
            content=data,
            headers={
                "authorization": f"Bearer {s.blob_read_write_token}",
                "x-api-version": BLOB_API_VERSION,
                "x-content-type": content_type,
                "x-cache-control-max-age": "31536000",
            },
            timeout=20,
        )
        r.raise_for_status()
        return r.json()["url"]
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.error("blob upload failed: %s", e)
        raise BlobError("upload failed") from e


def delete(url: str | None) -> None:
    """Best effort: an old photo left behind is not worth failing the request for."""
    if not url:
        return
    s = get_settings()
    if url.startswith("/api/v1/dev-files/"):
        try:
            os.remove(os.path.join(s.dev_upload_dir, os.path.basename(url)))
        except OSError:
            pass
        return
    if not s.blob_read_write_token:
        return
    try:
        httpx.post(
            f"{BLOB_API}/delete",
            json={"urls": [url]},
            headers={"authorization": f"Bearer {s.blob_read_write_token}", "x-api-version": BLOB_API_VERSION},
            timeout=10,
        )
    except httpx.HTTPError as e:
        log.warning("blob delete failed: %s", e)
