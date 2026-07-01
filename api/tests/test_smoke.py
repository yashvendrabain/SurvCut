"""Smoke test for the FastAPI app.

Ensures the app boots and /ping returns 200 without needing a real upload.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_ping():
    r = client.get("/ping")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_openapi_docs_available():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    body = r.json()
    assert body["info"]["title"] == "Cutter API"


def test_upload_missing_file_400():
    r = client.post("/api/upload", files={"file": ("", b"", "application/octet-stream")})
    assert r.status_code in (400, 422)


def test_schema_unknown_session_404():
    r = client.get("/api/schema/does-not-exist")
    assert r.status_code == 404