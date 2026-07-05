"""POST /api/cuts/compute — Python-computed cut data for on-screen charts."""
from __future__ import annotations

from typing import Any

from cutter_engine import (
    apply_selections,
    compute_grid_matrix,
    compute_ranking_matrix,
    compute_single_cut,
)
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_sessions
from ..schemas.responses import CutDataOut, CutMatrixOut, CutRowOut, CutsRequest, CutsResponse
from ..segment_convert import to_engine_segments

router = APIRouter()

# Question types whose per-row `pct` carries a MEAN (not a % of base).
_MEAN_TYPES = {"grid_rated", "grid_single_select", "numeric_allocation", "numeric_grid", "direct_numeric"}


@router.post("/compute", response_model=CutsResponse)
async def compute_cuts(
    req: CutsRequest,
    sessions: dict[str, dict[str, Any]] = Depends(get_sessions),
) -> CutsResponse:
    sess = sessions.get(req.session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")
    schema = sess["schema"]
    raw_df = sess["raw_df"]

    # Apply any dashboard filter/segment selections before computing.
    raw_df = apply_selections(
        raw_df, schema,
        filters=[(f.column_id, f.value) for f in req.filter_selections],
        segments=to_engine_segments(req.segments),
        segment_picks={s.name: s.value for s in req.segment_selections},
    )

    ids = req.column_ids or [q.column_id for q in schema.questions if q.analysis_eligible]
    cuts: list[CutDataOut] = []
    for qid in ids:
        q = schema.by_column_id(qid)
        if q is None or not q.analysis_eligible:
            continue
        res = compute_single_cut(q, raw_df)
        if res is None or not res.rows:
            continue
        # Matrix cuts: ranking (ranks × options) and non-numerical grids
        # (options × scale) render exactly like their workbook blocks.
        matrix = None
        rlab: list[str] | None = None
        clab: list[str] | None = None
        cc: list[list[int]] = []
        if res.question_type.value == "ranking":
            rlab, clab, cc = compute_ranking_matrix(q, raw_df)
        elif res.question_type.value in ("grid_rated", "grid_single_select"):
            rlab, clab, cc = compute_grid_matrix(q, raw_df)
        if rlab and clab:
            matrix = CutMatrixOut(
                row_labels=rlab, col_labels=clab,
                counts=[[float(v) for v in row] for row in cc],
            )
        cuts.append(CutDataOut(
            column_id=res.column_id,
            question_text=res.question_text,
            question_type=res.question_type.value,
            valid_n=res.valid_n,
            headline_metric=res.headline_metric,
            value_is_mean=res.question_type.value in _MEAN_TYPES,
            rows=[CutRowOut(label=r.label, count=float(r.count), pct=float(r.pct)) for r in res.rows],
            matrix=matrix,
        ))
    return CutsResponse(cuts=cuts)
