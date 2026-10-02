from typing import Iterator

from fastapi import Header, HTTPException

from .config import get_settings
from .db import connect


def get_db() -> Iterator:
    with connect() as conn:
        yield conn


def tenant_id(x_brand: str | None = Header(default=None)) -> str:
    """Brand the request belongs to. Each white-label app sends its brand id in X-Brand."""
    brand = (x_brand or get_settings().default_tenant).strip().lower()
    if not brand.replace("-", "").isalnum() or len(brand) > 40:
        raise HTTPException(400, "Bad brand")
    return brand
