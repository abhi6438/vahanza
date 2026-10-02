"""Signature check for Supabase Auth hooks (Standard Webhooks format).

Headers: webhook-id, webhook-timestamp, webhook-signature ("v1,<base64 sig> ...")
Signed content: f"{id}.{timestamp}.{raw_body}", HMAC-SHA256 with the base64 secret
that follows "v1,whsec_" in the hook secret.
"""
import base64
import hashlib
import hmac
import time

TOLERANCE_SECONDS = 5 * 60


class WebhookError(Exception):
    pass


def _secret_bytes(secret: str) -> bytes:
    s = secret.strip()
    if s.startswith("v1,"):
        s = s[3:]
    if s.startswith("whsec_"):
        s = s[6:]
    return base64.b64decode(s)


def sign(secret: str, msg_id: str, timestamp: str, body: bytes) -> str:
    to_sign = f"{msg_id}.{timestamp}.".encode() + body
    digest = hmac.new(_secret_bytes(secret), to_sign, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def verify(secret: str, headers: dict, body: bytes, now: float | None = None) -> None:
    if not secret:
        raise WebhookError("hook secret not configured")
    msg_id = headers.get("webhook-id")
    ts = headers.get("webhook-timestamp")
    sig_header = headers.get("webhook-signature")
    if not (msg_id and ts and sig_header):
        raise WebhookError("missing webhook headers")
    try:
        ts_int = int(ts)
    except ValueError as exc:
        raise WebhookError("bad timestamp") from exc
    if abs((now or time.time()) - ts_int) > TOLERANCE_SECONDS:
        raise WebhookError("timestamp outside tolerance")
    expected = sign(secret, msg_id, ts, body)
    for part in sig_header.split():
        version, _, sig = part.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return
    raise WebhookError("signature mismatch")
