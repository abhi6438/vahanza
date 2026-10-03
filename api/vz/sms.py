"""Sends the login OTP through MSG91 (Flow API with a DLT-approved template)."""
import logging

import httpx

from .config import Settings

log = logging.getLogger("vahanza.sms")
MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow"


class SmsError(Exception):
    pass


def normalise_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 10:
        digits = "91" + digits
    return digits


def send_otp(settings: Settings, phone: str, otp: str) -> None:
    mobile = normalise_phone(phone)
    if settings.sms_dry_run:
        log.warning("SMS_DRY_RUN: OTP for %s is %s", mobile, otp)
        return
    if not (settings.msg91_auth_key and settings.msg91_otp_template_id):
        raise SmsError("MSG91 is not configured")
    payload = {
        "template_id": settings.msg91_otp_template_id,
        "short_url": "0",
        "recipients": [{"mobiles": mobile, "otp": otp}],
    }
    try:
        resp = httpx.post(
            MSG91_FLOW_URL,
            json=payload,
            headers={"authkey": settings.msg91_auth_key, "accept": "application/json"},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise SmsError(f"MSG91 request failed: {exc}") from exc
    if resp.status_code >= 300:
        raise SmsError(f"MSG91 error {resp.status_code}: {resp.text[:200]}")


def send_flow(settings: Settings, template_id: str, recipients: list[dict]) -> None:
    """One MSG91 Flow call for many people. recipients: [{"mobiles": "91...", "<var>": "..."}]."""
    if settings.sms_dry_run:
        for r in recipients:
            log.warning("SMS_DRY_RUN: flow %s to %s %s", template_id or "-", r.get("mobiles"), {k: v for k, v in r.items() if k != "mobiles"})
        return
    if not (settings.msg91_auth_key and template_id):
        raise SmsError("MSG91 is not configured")
    try:
        resp = httpx.post(
            MSG91_FLOW_URL,
            json={"template_id": template_id, "short_url": "0", "recipients": recipients},
            headers={"authkey": settings.msg91_auth_key, "accept": "application/json"},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise SmsError(f"MSG91 request failed: {exc}") from exc
    if resp.status_code >= 300:
        raise SmsError(f"MSG91 error {resp.status_code}: {resp.text[:200]}")
