"""FastAPI application factory."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .deps import _SESSIONS
from .routers import crosscuts, export, schema_, upload


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks."""
    yield
    _SESSIONS.clear()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Cutter API",
        version="0.1.0",
        description="Survey cutter engine exposed as HTTP endpoints.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:3003"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
    app.include_router(schema_.router, prefix="/api/schema", tags=["schema"])
    app.include_router(crosscuts.router, prefix="/api/crosscuts", tags=["crosscuts"])
    app.include_router(export.router, prefix="/api/export", tags=["export"])

    @app.get("/ping", tags=["health"])
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()