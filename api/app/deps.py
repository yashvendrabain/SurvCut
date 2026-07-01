"""Shared FastAPI dependencies.

Kept in its own module so both `main.py` and every router can import from
here without creating an import cycle.
"""
from __future__ import annotations

from typing import Any

# In-process session cache. Key: session_id (uuid string).
# Value: {"schema": SurveySchema, "raw_df": DataFrame, "datamap_rows": list}
_SESSIONS: dict[str, dict[str, Any]] = {}


def get_sessions() -> dict[str, dict[str, Any]]:
    """Dependency accessor for the in-process session dict.

    In Phase 2 this will be replaced with a Redis-backed store — same
    function signature, different implementation.
    """
    return _SESSIONS