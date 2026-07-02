"""POST /api/cuts/compute — Python-computed cut data for on-screen charts."""
from __future__ import annotations

from typing import Any

from cutter_engine import compute_single_cut
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_sessions
from ..schemas.responses import CutDataOut, CutRowOut, CutsRequest, CutsResponse

router = APIRouter()

# Question types whose per-row `pct` carries a MEAN (not a % of base).
_MEAN_TYPES = {"grid_rated", "grid_single_select", "numeric_allocation", "direct_numeric"}


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

    ids = req.column_ids or [q.column_id for q in schema.questions if q.analysis_eligible]
    cuts: list[CutDataOut] = []
    for qid in ids:
        q = schema.by_column_id(qid)
        if q is None or not q.analysis_eligible:
            continue
        res = compute_single_cut(q, raw_df)
        if res is None or not res.rows:
            continue
        cuts.append(CutDataOut(
            column_id=res.column_id,
            question_text=res.question_text,
            question_type=res.question_type.value,
            valid_n=res.valid_n,
            headline_metric=res.headline_metric,
            value_is_mean=res.question_type.value in _MEAN_TYPES,
            rows=[CutRowOut(label=r.label, count=float(r.count), pct=float(r.pct)) for r in res.rows],
        ))
    return CutsResponse(cuts=cuts)
