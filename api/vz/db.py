"""Database access.

Vercel functions are short-lived, so we open one connection per request through the
Supabase transaction pooler (port 6543). The pooler does not support prepared
statements, hence prepare_threshold=None.
"""
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import get_settings


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set")
    conn = psycopg.connect(
        settings.database_url,
        row_factory=dict_row,
        prepare_threshold=None,
        connect_timeout=10,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
