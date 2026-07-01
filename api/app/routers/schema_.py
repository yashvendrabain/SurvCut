"""GET /api/schema/{session_id} — return the full classified schema."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_sessions
from ..schemas.responses import QuestionSummary, SchemaResponse

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
        )
        for q in schema.questions
    ]
    return SchemaResponse(
        total_questions=len(schema.questions),
        analysis_eligible=len(schema.analysis_questions()),
        total_respondents=schema.total_respondents,
        questions=questions,
    )