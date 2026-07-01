"""POST /api/upload — receive a combined .xlsx, parse, classify, return summary."""
from __future__ import annotations

import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from cutter_engine import (
    classify,
    parse_datamap_from_rows,
    validate,
)
from cutter_engine.io_layer import load_combined

from ..deps import get_sessions
from ..schemas.responses import UploadResponse

router = APIRouter()


@router.post("", response_model=UploadResponse)
async def upload_combined(
    file: UploadFile,
    sessions: dict[str, dict[str, Any]] = Depends(get_sessions),
) -> UploadResponse:
    """Accept a combined .xlsx (Datamap sheet + Raw data sheet).

    Parses the datamap, classifies questions, cross-checks against raw data,
    and returns a summary. The full schema + raw DataFrame are cached under
    a session_id for subsequent calls to /schema, /crosscuts, /export.
    """
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="empty file")

    try:
        loaded = load_combined(raw_bytes)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"could not load: {exc}") from exc

    try:
        blocks = parse_datamap_from_rows(loaded.datamap_rows)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"datamap parse failed: {exc}") from exc

    schema = classify(blocks, loaded.raw_df)
    report = validate(blocks, loaded.raw_df)

    session_id = uuid.uuid4().hex
    sessions[session_id] = {
        "schema": schema,
        "raw_df": loaded.raw_df,
        "datamap_rows": loaded.datamap_rows,
    }

    return UploadResponse(
        session_id=session_id,
        n_respondents=schema.total_respondents,
        n_raw_columns=report.raw_columns_count,
        n_datamap_blocks=len(blocks),
        n_eligible_questions=len(schema.analysis_questions()),
        validation_errors=[i.message for i in report.issues if i.level.value == "error"],
        validation_warnings=[i.message for i in report.issues if i.level.value == "warning"][:20],
    )