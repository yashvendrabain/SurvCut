"""POST /api/crosscuts/compute — compute a cross-cut matrix on demand."""
from __future__ import annotations

from typing import Any

from cutter_engine import apply_selections, compute_cross_cut
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_sessions
from ..schemas.responses import CrossCutRequest, CrossCutResponse
from ..segment_convert import to_engine_segments

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

    # Apply any dashboard filter/segment selections before computing.
    df = apply_selections(
        sess["raw_df"], schema,
        filters=[(f.column_id, f.value) for f in req.filter_selections],
        segments=to_engine_segments(req.segments),
        segment_picks={s.name: s.value for s in req.segment_selections},
    )
    result = compute_cross_cut(row_q, col_q, df)
    return CrossCutResponse(
        row_labels=list(result.row_labels),
        col_labels=list(result.col_labels),
        counts=[list(row) for row in result.counts],
        warnings=list(result.warnings),
    )