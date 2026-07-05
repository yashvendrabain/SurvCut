"""Classify parsed datamap blocks into QuestionSpec objects.

The classifier applies the spec's type-hint rules deterministically.
No data inspection, no heuristics, no AI — only the type-hint + the block shape decides.
"""
from __future__ import annotations

import pandas as pd

from .models import (
    METADATA_ALLOWLIST,
    ParsedBlock,
    QuestionSpec,
    QuestionType,
    SurveySchema,
)


# Type identification is delegated to question_type_detector — see that
# module's docstring for the swap-point contract. The classifier is intentionally
# slim: it orchestrates parsing → detection → eligibility → QuestionSpec assembly.
from .question_type_detector import detect_type

DEMOGRAPHIC_KEYWORDS = (
    "industry", "sector", "region", "country", "geography", "size",
    "employees", "headcount", "revenue", "function", "department",
    "role", "seniority", "tier", "company", "organisation", "organization",
    "vertical", "segment", "market", "age", "gender", "title",
)


def _raw_columns_for(block: ParsedBlock) -> tuple[str, ...]:
    if block.sub_columns:
        return tuple(sub_id for sub_id, _ in block.sub_columns)
    return (block.column_id,)


def _option_map_for(block: ParsedBlock) -> dict:
    """Build code → label mapping from the scale options of the block."""
    return {code: label for code, label in block.scale_options if label}


def _sub_column_labels_for(block: ParsedBlock) -> dict[str, str]:
    """Build raw_col_id → label mapping from the sub-columns of the block."""
    return {sub_id: label for sub_id, label in block.sub_columns}


def _is_demographic(qtext: str) -> bool:
    low = qtext.lower()
    return any(kw in low for kw in DEMOGRAPHIC_KEYWORDS)


def _sums_to_100(block: ParsedBlock, df: pd.DataFrame) -> bool:
    """True iff a legend-less numeric multi-column block is a constant-sum
    ("likert") allocation: ≥2 sub-columns AND EVERY respondent who answered it
    has those columns summing to exactly 100.

    Blanks are counted as 0; the sum is rounded to 2 dp only to absorb
    floating-point noise (33.33+33.33+33.34) — this is NOT a tolerance band,
    so 99 or 101 still fails. A single non-100 answered row → not allocation.
    """
    subs = [sub_id for sub_id, _ in block.sub_columns]
    present = [c for c in subs if c in df.columns]
    if len(present) < 2:
        return False
    sub = df[present].apply(pd.to_numeric, errors="coerce")
    answered = sub.notna().any(axis=1)
    if not bool(answered.any()):
        return False
    rowsum = sub[answered].fillna(0).sum(axis=1)
    return bool((rowsum.round(2) == 100).all())


def classify(parsed: list[ParsedBlock],
             raw_df: pd.DataFrame,
             respondent_id_column: str | None = None) -> SurveySchema:
    """Turn parsed datamap blocks into a typed SurveySchema."""
    questions: list[QuestionSpec] = []

    for block in parsed:
        qtype, scale_range = detect_type(block)
        # Data-confirmed promotion: a legend-less numeric grid is a constant-sum
        # "likert" allocation only if every answered row sums to exactly 100.
        if qtype == QuestionType.NUMERIC_GRID and _sums_to_100(block, raw_df):
            qtype = QuestionType.NUMERIC_ALLOCATION
        raw_cols = _raw_columns_for(block)
        option_map = _option_map_for(block)

        # Standard metadata classification
        is_metadata = block.column_id in METADATA_ALLOWLIST
        if is_metadata:
            qtype = QuestionType.METADATA

        # Eligibility rules
        analysis_eligible = True
        exclusion_reason = ""
        if qtype == QuestionType.METADATA:
            analysis_eligible = False
            exclusion_reason = "metadata column"
        elif qtype == QuestionType.OPEN_TEXT:
            analysis_eligible = False
            exclusion_reason = "open text — no cuts"
        elif qtype == QuestionType.UNKNOWN:
            analysis_eligible = False
            exclusion_reason = (f"type-hint {block.type_hint!r} did not match any spec rule")

        # Demographic flag (informational — used by UI for filter slots)
        is_demographic = _is_demographic(block.question_text)

        questions.append(QuestionSpec(
            column_id=block.column_id,
            question_text=block.question_text,
            question_type=qtype,
            raw_columns=raw_cols,
            option_map=option_map,
            sub_column_labels=_sub_column_labels_for(block),
            scale_range=scale_range,
            is_metadata=is_metadata,
            is_demographic=is_demographic,
            analysis_eligible=analysis_eligible,
            exclusion_reason=exclusion_reason,
            source_row_in_datamap=block.source_row_in_datamap,
        ))

    # Decide respondent id column
    rid = respondent_id_column or _pick_respondent_id(raw_df)

    return SurveySchema(
        questions=tuple(questions),
        respondent_id_column=rid,
        total_respondents=int(len(raw_df)),
    )


def _pick_respondent_id(raw_df: pd.DataFrame) -> str:
    for candidate in ("record", "uuid", "respondent_id", "id", "RespondentID"):
        if candidate in raw_df.columns:
            return candidate
    return str(raw_df.columns[0]) if len(raw_df.columns) else ""


def summarise(schema: SurveySchema) -> str:
    """Human-readable summary of the classified schema."""
    from collections import Counter
    type_counts = Counter(q.question_type.value for q in schema.questions)
    lines = [
        f"Total questions:    {len(schema.questions)}",
        f"Total respondents:  {schema.total_respondents}",
        f"Respondent id col:  {schema.respondent_id_column!r}",
        "",
        "By question type:",
    ]
    for qtype, n in sorted(type_counts.items(), key=lambda x: -x[1]):
        lines.append(f"  {qtype:<25} {n}")
    eligible = sum(1 for q in schema.questions if q.analysis_eligible)
    demographic = sum(1 for q in schema.questions if q.is_demographic and q.analysis_eligible)
    lines += ["", f"Analysis-eligible:   {eligible}", f"Of those, demographic: {demographic}"]
    return "\n".join(lines)
