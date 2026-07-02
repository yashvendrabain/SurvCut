"""GET /api/schema/{session_id} — return the full classified schema."""
from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_sessions
from ..schemas.responses import OptionItem, QuestionSummary, RawColumn, SchemaResponse

router = APIRouter()


@router.get("/{session_id}", response_model=SchemaResponse)
async def get_schema(
    session_id: str,
    sessions: dict[str, dict[str, Any]] = Depends(get_sessions),
) -> SchemaResponse:
    sess = sessions.get(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")
    schema = sess["schema"]

    questions = [
        QuestionSummary(
            column_id=q.column_id,
            question_text=q.question_text,
            question_type=q.question_type.value,
            n_options=len(q.option_map),
            n_sub_columns=len(q.raw_columns) if q.raw_columns else 0,
            is_demographic=q.is_demographic,
            analysis_eligible=q.analysis_eligible,
            options=[OptionItem(code=str(code), label=str(label))
                     for code, label in q.option_map.items()],
        )
        for q in schema.questions
    ]
    # Raw-data columns (every column, so segment conditions can target any of
    # them — numeric measures, hidden vars, etc.). Attach option lists where a
    # single-select question maps to that raw column.
    raw_df = sess.get("raw_df")
    col_opts: dict[str, list[OptionItem]] = {}
    for q in schema.questions:
        if q.question_type.value in ("single_select", "binary_two_options") and q.option_map and q.raw_columns:
            col_opts[str(q.raw_columns[0])] = [
                OptionItem(code=str(code), label=str(label))
                for code, label in q.option_map.items()
            ]
    raw_columns: list[RawColumn] = []
    if raw_df is not None:
        for col in raw_df.columns:
            name = str(col)
            try:
                numeric = bool(pd.api.types.is_numeric_dtype(raw_df[col]))
            except Exception:
                numeric = False
            raw_columns.append(RawColumn(name=name, numeric=numeric,
                                         options=col_opts.get(name, [])))

    return SchemaResponse(
        total_questions=len(schema.questions),
        analysis_eligible=len(schema.analysis_questions()),
        total_respondents=schema.total_respondents,
        questions=questions,
        raw_columns=raw_columns,
    )