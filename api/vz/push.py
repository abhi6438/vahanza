"""Phone push delivery.

* webpush: PWA / Chrome on Android (and iPhone when the PWA is on the home screen). Needs VAPID keys
  (scripts/make_vapid_keys.py). The browser subscription is stored in push_subscriptions.
* fcm: the Android APK (Capacitor). Needs a Firebase service-account JSON in FCM_SERVICE_ACCOUNT.
Without the keys, nothing is pushed; the in-app bell still works.
"""
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, wait

import httpx
import jwt

from .config import get_settings

log = logging.getLogger("vz.push")
MAX_PER_CALL = 300
_fcm_token: dict = {"value": None, "exp": 0.0}


def configured() -> dict:
    s = get_settings()
    return {"webpush": bool(s.vapid_public_key and s.vapid_private_key), "fcm": bool(s.fcm_service_account)}


def _webpush(sub: dict, payload: dict) -> str:
    """Returns 'ok', 'gone' (subscription expired: delete it) or 'error'."""
    from pywebpush import WebPushException, webpush
    s = get_settings()
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
            ttl=24 * 3600,
            timeout=5,
        )
        return "ok"
    except WebPushException as e:
        code = getattr(e.response, "status_code", None)
        if code in (404, 410):
            return "gone"
        log.warning("webpush failed (%s): %s", code, e)
        return "error"
    except Exception as e:  # network etc.
        log.warning("webpush error: %s", e)
        return "error"


def _fcm_access_token() -> tuple[str, str]:
    sa = json.loads(get_settings().fcm_service_account)
    if _fcm_token["value"] and time.time() < _fcm_token["exp"] - 60:
        return _fcm_token["value"], sa["project_id"]
    now = int(time.time())
    assertion = jwt.encode(
        {"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/firebase.messaging",
         "aud": sa.get("token_uri", "https://oauth2.googleapis.com/token"), "iat": now, "exp": now + 3600},
        sa["private_key"], algorithm="RS256",
    )
    r = httpx.post(sa.get("token_uri", "https://oauth2.googleapis.com/token"),
                   data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}, timeout=8)
    r.raise_for_status()
    _fcm_token.update(value=r.json()["access_token"], exp=now + int(r.json().get("expires_in", 3600)))
    return _fcm_token["value"], sa["project_id"]


def _fcm(sub: dict, payload: dict) -> str:
    try:
        token, project = _fcm_access_token()
        r = httpx.post(
            f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": {
                "token": sub["endpoint"],
                "notification": {"title": payload["title"], "body": payload["body"]},
                "data": {"url": payload.get("url", "/"), "kind": payload.get("kind", "")},
                "android": {"priority": "high", "notification": {"channel_id": "default"}},
            }},
            timeout=5,
        )
        if r.status_code == 404 or (r.status_code == 400 and "UNREGISTERED" in r.text):
            return "gone"
        r.raise_for_status()
        return "ok"
    except Exception as e:
        log.warning("fcm error: %s", e)
        return "error"


def send(db, messages: list[tuple[int, dict, dict]]) -> dict:
    """messages: (subscription_id, subscription_row, payload). Sends in parallel, cleans up dead subscriptions."""
    cfg = configured()
    jobs = [(sid, sub, p) for sid, sub, p in messages[:MAX_PER_CALL] if cfg.get(sub["kind"])]
    if not jobs:
        return {"sent": 0}
    results: dict[int, str] = {}
    pool = ThreadPoolExecutor(max_workers=8)
    futs = {pool.submit(_webpush if sub["kind"] == "webpush" else _fcm, sub, p): sid for sid, sub, p in jobs}
    done, _ = wait(futs, timeout=8)   # never hold the user's request longer than this
    pool.shutdown(wait=False, cancel_futures=True)
    for f in done:
        results[futs[f]] = f.result()
    gone = [sid for sid, r in results.items() if r == "gone"]
    ok = [sid for sid, r in results.items() if r == "ok"]
    if gone:
        db.execute("delete from public.push_subscriptions where id = any(%s)", (gone,))
    if ok:
        db.execute("update public.push_subscriptions set last_ok_at = now() where id = any(%s)", (ok,))
    return {"sent": len(ok), "gone": len(gone)}
