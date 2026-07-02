"""POST /api/export/build — build the Excel workbook.

Phase 1: synchronous build. When the build takes long enough to hurt UX,
this endpoint will move behind a Celery job queue and return a job_id
instead. That's Phase 2 (`app/jobs/`).
"""
from __future__ import annotations

import os
import tempfile
from typing import Any

from cutter_engine import (
    ExportInputs,
    FilterSlot,
    Segment,
    SegmentCondition,
    SegmentGroup,
    SegmentPredicate,
    ThemeGroup,
    compute_cross_cut,
    export,
)
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from ..deps import get_sessions
from ..schemas.responses import BuildRequest, BuildResponse

router = APIRouter()


@router.post("/build", response_model=BuildResponse)
async def build_workbook(
    req: BuildRequest,
    sessions: dict[str, dict[str, Any]] = Depends(get_sessions),
) -> BuildResponse:
    sess = sessions.get(req.session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")

    schema = sess["schema"]
    raw_df = sess["raw_df"]
    datamap_rows = sess["datamap_rows"]

    themes = [
        ThemeGroup(name=name, question_column_ids=list(qids))
        for name, qids in zip(req.theme_names, req.theme_question_ids, strict=False)
    ]
    filters = [FilterSlot(name=qid, column_id=qid, default_value="All")
               for qid in req.filter_column_ids]

    # Re-compute every queued cross-cut against the cached raw_df
    cross_cuts = []
    for qcc in req.queued_cross_cuts:
        row_q = schema.by_column_id(qcc.row_qid)
        col_q = schema.by_column_id(qcc.col_qid)
        if row_q is None or col_q is None:
            continue
        cc = compute_cross_cut(row_q, col_q, raw_df)
        if cc.row_labels and cc.col_labels:
            cross_cuts.append(cc)

    # Build segment domain objects (custom filters materialised as helper columns)
    segments = [
        Segment(
            name=s.name,
            include_others=s.include_others,
            others_label=s.others_label,
            groups=[
                SegmentGroup(
                    name=g.name,
                    conditions=[
                        SegmentCondition(
                            column=c.column,
                            predicates=[SegmentPredicate(op=p.op, value=p.value)
                                        for p in c.predicates],
                        )
                        for c in g.conditions
                    ],
                )
                for g in s.groups
            ],
        )
        for s in req.segments
    ]

    out_path = os.path.join(tempfile.gettempdir(),
                            f"cutter_api_{req.session_id[:8]}.xlsx")
    inputs = ExportInputs(
        schema=schema, raw_df=raw_df, datamap_rows=datamap_rows,
        themes=themes, filters=filters, cross_cuts=tuple(cross_cuts),
        segments=segments,
    )
    path = export(inputs, out_path)
    size = os.path.getsize(path)
    return BuildResponse(workbook_path=str(path), size_bytes=size)


@router.get("/download/{session_id}")
async def download_workbook(
    session_id: str,
    sessions: dict[str, dict[str, Any]] = Depends(get_sessions),
) -> FileResponse:
    """Stream the previously-built .xlsx back to the client."""
    path = os.path.join(tempfile.gettempdir(), f"cutter_api_{session_id[:8]}.xlsx")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="workbook not built yet")
    return FileResponse(path, filename="survey_cuts.xlsx",
                         media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")