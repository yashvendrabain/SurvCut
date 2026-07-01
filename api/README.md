# cutter-api

FastAPI service exposing the `cutter-engine` as HTTP endpoints. Phase 1: synchronous calls with an in-process session cache. Phase 2 will move sessions to Redis and heavy builds to a Celery job queue.

## Install & run (local dev)

```bash
# from monorepo root
pip install -e ./engine
pip install -e ./api

uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the auto-generated Swagger UI.

## Endpoints (Phase 1)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/ping` | Health check |
| `POST` | `/api/upload` | Multipart file upload -> session_id + summary |
| `GET`  | `/api/schema/{session_id}` | Full classified schema |
| `POST` | `/api/crosscuts/compute` | On-demand cross-cut matrix |
| `POST` | `/api/export/build` | Build the .xlsx workbook |
| `GET`  | `/api/export/download/{session_id}` | Stream the built workbook |

## Session model

Uploads return a `session_id`. Subsequent calls (`/schema`, `/crosscuts`, `/export`) reference that id. The session dict is process-local for now; scaling to multiple workers requires wiring it to Redis (see `app/main.py:_SESSIONS`).

## Docker

```bash
docker build -f api/Dockerfile -t cutter-api .
docker run --rm -p 8000:8000 cutter-api
```

## Tests

```bash
pip install -e ".[dev]"
pytest -q
```