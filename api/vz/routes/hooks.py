"""Supabase Auth 'Send SMS' hook: Supabase calls this to deliver the OTP through MSG91."""
import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..config import Settings, get_settings
from ..deps import get_db
from ..sms import SmsError, normalise_phone, send_otp
from ..webhook import WebhookError, verify

router = APIRouter(prefix="/hooks", tags=["hooks"])
log = logging.getLogger("vahanza.hooks")


def _hook_error(code: int, message: str) -> JSONResponse:
    # Supabase shows `message` to the app when the hook fails.
    return JSONResponse(status_code=code, content={"error": {"http_code": code, "message": message}})


@router.post("/send-sms")
async def send_sms(request: Request, settings: Settings = Depends(get_settings), db=Depends(get_db)):
    body = await request.body()
    try:
        verify(settings.send_sms_hook_secret, {k.lower(): v for k, v in request.headers.items()}, body)
    except WebhookError as exc:
        log.warning("send-sms hook rejected: %s", exc)
        return _hook_error(401, "Invalid hook signature")

    payload = json.loads(body)
    phone = normalise_phone((payload.get("user") or {}).get("phone", ""))
    otp = (payload.get("sms") or {}).get("otp", "")
    if len(phone) != 12 or not phone.startswith("91") or not otp:
        return _hook_error(400, "Only Indian mobile numbers are supported")

    recent = db.execute(
        "select count(*) as n from public.sms_log where phone = %s and sent_at > now() - interval '1 hour'",
        (phone,),
    ).fetchone()["n"]
    if recent >= settings.otp_max_per_hour:
        return _hook_error(429, "Too many OTP requests. Please try again after some time.")

    try:
        send_otp(settings, phone, otp)
    except SmsError as exc:
        log.error("OTP send failed: %s", exc)
        return _hook_error(502, "Could not send OTP right now. Please try again.")

    db.execute("insert into public.sms_log (phone) values (%s)", (phone,))
    return {}
