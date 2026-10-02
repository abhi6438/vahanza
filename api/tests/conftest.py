import base64
import os
import sys
import time

import jwt
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

HS_SECRET = "test-secret-at-least-32-characters-long!!"
HOOK_SECRET = "v1,whsec_" + base64.b64encode(b"hook-secret-bytes-1234567890").decode()

os.environ.update({
    "SUPABASE_URL": "https://example.supabase.co",
    "DATABASE_URL": "postgresql://unused",
    "SUPABASE_JWT_SECRET": HS_SECRET,
    "SEND_SMS_HOOK_SECRET": HOOK_SECRET,
    "SMS_DRY_RUN": "1",
})


class FakeResult:
    def __init__(self, row=None):
        self._row = row

    def fetchone(self):
        return self._row[0] if isinstance(self._row, list) else self._row

    def fetchall(self):
        if self._row is None:
            return []
        return self._row if isinstance(self._row, list) else [self._row]


class FakeCursor:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def executemany(self, sql, rows):
        self.db.calls.append((sql, list(rows)))


class FakeDB:
    """Records SQL; returns rows from a queue keyed by a substring of the SQL."""

    def __init__(self):
        self.calls = []
        self.responses = []  # list of (substring, row)

    def respond(self, contains, row):
        self.responses.append((contains, row))

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        for i, (needle, row) in enumerate(self.responses):
            if needle in sql:
                self.responses.pop(i)
                return FakeResult(row)
        return FakeResult(None)

    def cursor(self):
        return FakeCursor(self)


@pytest.fixture
def db():
    return FakeDB()


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient
    from vz.deps import get_db
    from vz.main import app

    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_token(sub="11111111-1111-1111-1111-111111111111", phone="919876543210", exp_in=3600, aud="authenticated", role="authenticated"):
    now = int(time.time())
    return jwt.encode({"sub": sub, "phone": phone, "aud": aud, "role": role, "iat": now, "exp": now + exp_in}, HS_SECRET, algorithm="HS256")
