"""Verifies the Supabase login token sent by the app on every API call.

Supports both Supabase JWT setups:
* new asymmetric signing keys (RS256 / ES256) -> verified with the project's JWKS
* legacy shared secret (HS256)              -> verified with SUPABASE_JWT_SECRET
"""
import logging
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


@dataclass
class AuthUser:
    id: str
    phone: Optional[str]
    claims: dict


log = logging.getLogger("vz.auth")


class _Jwks:
    """Fetches the project's public signing keys with httpx (bundled certificates, so it also
    works on macOS python.org installs where urllib has no CA certificates) and caches them."""

    def __init__(self, url: str, lifespan: int = 3600):
        self.url, self.lifespan = url, lifespan
        self._keys: dict[str, jwt.PyJWK] = {}
        self._at = 0.0

    def _refresh(self) -> None:
        try:
            r = httpx.get(self.url, timeout=10)
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.error("could not fetch JWKS from %s: %s", self.url, exc)
            raise jwt.PyJWKClientError(f"JWKS fetch failed: {exc}") from exc
        self._keys = {k.get("kid", ""): jwt.PyJWK(k) for k in data.get("keys", [])}
        self._at = time.time()

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        kid = jwt.get_unverified_header(token).get("kid", "")
        if not self._keys or time.time() - self._at > self.lifespan or kid not in self._keys:
            self._refresh()          # also picks up rotated keys
        if kid in self._keys:
            return self._keys[kid]
        if not kid and len(self._keys) == 1:
            return next(iter(self._keys.values()))
        raise jwt.PyJWKClientError("signing key not found")


@lru_cache
def _jwks_client(url: str) -> _Jwks:
    return _Jwks(url)


def verify_token(token: str, settings: Settings) -> AuthUser:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    alg = header.get("alg", "")
    options = {"require": ["exp", "sub"]}
    try:
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "HS256 token but no secret configured")
            claims = jwt.decode(
                token, settings.supabase_jwt_secret, algorithms=["HS256"],
                audience="authenticated", options=options,
            )
        elif alg in ("RS256", "ES256"):
            key = _jwks_client(settings.jwks_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token, key.key, algorithms=[alg], audience="authenticated",
                issuer=settings.jwt_issuer, options=options,
            )
        else:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unsupported token")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired") from exc
    except jwt.PyJWTError as exc:
        log.warning("token rejected (%s): %s", alg, exc)   # shows the real reason in the API log
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    if claims.get("role") != "authenticated":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not a logged-in user")
    return AuthUser(id=claims["sub"], phone=claims.get("phone"), claims=claims)


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def current_user(
    authorization: Optional[str] = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    return verify_token(token, settings)


def optional_user(
    authorization: Optional[str] = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> Optional[AuthUser]:
    token = _bearer(authorization)
    if not token:
        return None
    try:
        return verify_token(token, settings)
    except HTTPException:
        return None
