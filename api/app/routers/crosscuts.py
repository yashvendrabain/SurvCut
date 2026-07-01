"""POST /api/crosscuts/compute — compute a cross-cut matrix on demand."""
from __future__ import annotations

from typing import Any

from cutter_engine import compute_cross_cut
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_sessions
from ..schemas.responses import CrossCutRequest, CrossCutResponse

router = APIRouter()


@router.post("/compute", response_model=CrossCutResponse)
async def compute_xcut(
    req: CrossCutRequest,
    sessions: dict[str, dict[str, Any]] = Depends(get_sessions),
) -> CrossCutResponse:
    sess = sessions.get(req.session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")
    if req.row_qid == req.col_qid:
        raise HTTPException(status_code=400, detail="row and column must differ")

    schema = sess["schema"]
    row_q = schema.by_column_id(req.row_qid)
    col_q = schema.by_column_id(req.col_qid)
    if row_q is None or col_q is None:
        raise HTTPException(status_code=404, detail="row or column question not in schema")

    result = compute_cross_cut(row_q, col_q, sess["raw_df"])
    return CrossCutResponse(
        row_labels=list(result.row_labels),
        col_labels=list(result.col_labels),
        counts=[list(row) for row in result.counts],
        warnings=list(result.warnings),
    )