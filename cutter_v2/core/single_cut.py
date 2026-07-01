"""Single-cut computation engine.

One `compute_single_cut(question, df)` per question type. Returns a
`SingleCutResult` with the row labels, counts, percentages, and a headline
metric where applicable.

These are *Python-computed* values — used for previews in the UI and for the
fallback when Excel formulas aren't desired. The exporter writes the
equivalent values as cached Excel formula results.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Any

import numpy as np
import pandas as pd

from .models import (
    CutRow,
    QuestionSpec,
    QuestionType,
    SingleCutResult,
)


# ─────────────────────────────────────────────────────────────────────────────
# Public dispatcher
# ─────────────────────────────────────────────────────────────────────────────


def compute_single_cut(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult | None:
    """Compute a single cut for the given question against the raw DataFrame.

    Returns None if the question is not analysis-eligible.
    """
    if not question.analysis_eligible:
        return None

    fn = _DISPATCH.get(question.question_type)
    if fn is None:
        return SingleCutResult(
            column_id=question.column_id,
            question_text=question.question_text,
            question_type=question.question_type,
            valid_n=0,
            missing_n=0,
            rows=(),
            warnings=(f"no computer for question type {question.question_type.value}",),
        )
    try:
        return fn(question, df)
    except Exception as exc:  # noqa: BLE001
        return SingleCutResult(
            column_id=question.column_id,
            question_text=question.question_text,
            question_type=question.question_type,
            valid_n=0,
            missing_n=0,
            rows=(),
            warnings=(f"{type(exc).__name__}: {exc}",),
        )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _coerce_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _label_for(code: Any, option_map: dict[Any, str]) -> str:
    if code in option_map:
        return str(option_map[code])
    try:
        as_int = int(code)
        if as_int in option_map:
            return str(option_map[as_int])
    except (TypeError, ValueError):
        pass
    s = str(code) if code is not None else "(no answer)"
    return s if option_map.get(s) is None else str(option_map[s])


def _ordered_options(question: QuestionSpec) -> list[Any]:
    """Return option codes in the order declared by the datamap (Likert ordering)."""
    if question.option_map:
        return list(question.option_map.keys())
    if question.scale_range:
        lo, hi = question.scale_range
        return list(range(lo, hi + 1))
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Per-type computers
# ─────────────────────────────────────────────────────────────────────────────


def _single_select(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    col = question.raw_columns[0]
    if col not in df.columns:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, 0, (), warnings=(f"column {col!r} not in raw data",))
    series = df[col]
    valid_n = int(series.notna().sum())
    missing_n = int(series.isna().sum())
    rows: list[CutRow] = []
    if valid_n == 0:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, missing_n, (), warnings=("all values missing",))

    counts = series.dropna().value_counts(dropna=True)
    # Render in declared order if we have a known option map; else by count desc
    ordered_codes = _ordered_options(question)
    if ordered_codes:
        seen = set()
        for code in ordered_codes:
            n = int(counts.get(code, 0))
            if n == 0 and code not in counts.index:
                continue
            label = _label_for(code, question.option_map)
            rows.append(CutRow(label=label, count=n, pct=n / valid_n * 100.0))
            seen.add(code)
        # Append any straggler codes not declared in datamap (data quality flag)
        for code, n in counts.items():
            if code in seen:
                continue
            label = _label_for(code, question.option_map)
            rows.append(CutRow(label=f"{label} (undeclared)", count=int(n),
                               pct=int(n) / valid_n * 100.0))
    else:
        for code, n in counts.items():
            label = _label_for(code, question.option_map)
            rows.append(CutRow(label=label, count=int(n), pct=int(n) / valid_n * 100.0))

    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=valid_n, missing_n=missing_n,
        rows=tuple(rows),
    )


def _binary_two_options(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    return _single_select(question, df)


def _multi_select_binary(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    """Each sub-column is 0/1. Report % of respondents who selected each item."""
    valid_mask = None
    rows: list[CutRow] = []
    n_respondents = int(len(df))

    # Use # of respondents who answered ANY sub-column as the base
    cols_present = [c for c in question.raw_columns if c in df.columns]
    if not cols_present:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, n_respondents, (), warnings=("no sub-columns present in raw data",))
    sub_frame = df[cols_present]
    answered_mask = sub_frame.notna().any(axis=1)
    valid_n = int(answered_mask.sum())
    missing_n = n_respondents - valid_n
    if valid_n == 0:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, missing_n, (), warnings=("no respondents answered any sub-column",))

    # Each sub-column gets its own row
    for col in cols_present:
        series = pd.to_numeric(df[col], errors="coerce")
        n_selected = int((series == 1).sum())
        label = question.sub_column_labels.get(col, col)
        rows.append(CutRow(label=str(label), count=n_selected, pct=n_selected / valid_n * 100.0))

    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=valid_n, missing_n=missing_n,
        rows=tuple(rows),
        headline_metric=f"{len(cols_present)} options",
    )


def _grid_rated(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    """Each sub-column is rated on a shared scale. Report mean rating per row."""
    cols_present = [c for c in question.raw_columns if c in df.columns]
    if not cols_present:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, 0, (), warnings=("no sub-columns present in raw data",))

    rows: list[CutRow] = []
    valid_ns: list[int] = []
    means: list[float] = []
    for col in cols_present:
        label = question.sub_column_labels.get(col, col)
        series = _coerce_numeric(df[col]).dropna()
        n = len(series)
        valid_ns.append(n)
        if n == 0:
            rows.append(CutRow(label=str(label), count=0, pct=0.0))
            continue
        m = float(series.mean())
        means.append(m)
        # Re-use CutRow: count = valid_n for this row, pct = mean (semantics differ for grids)
        rows.append(CutRow(label=str(label), count=n, pct=m))

    avg_mean = float(np.mean(means)) if means else 0.0
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=max(valid_ns) if valid_ns else 0,
        missing_n=int(len(df)) - (max(valid_ns) if valid_ns else 0),
        rows=tuple(rows),
        headline_metric=f"Avg mean: {avg_mean:.2f}",
    )


def _numeric_allocation(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    """Sub-columns sum to ~100. Report the mean allocation per component."""
    cols_present = [c for c in question.raw_columns if c in df.columns]
    rows: list[CutRow] = []
    for col in cols_present:
        label = question.sub_column_labels.get(col, col)
        series = _coerce_numeric(df[col]).dropna()
        if len(series) == 0:
            rows.append(CutRow(label=str(label), count=0, pct=0.0))
            continue
        m = float(series.mean())
        rows.append(CutRow(label=str(label), count=len(series), pct=m))
    n_valid = int(df[cols_present[0]].notna().sum()) if cols_present else 0
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=n_valid,
        missing_n=int(len(df)) - n_valid,
        rows=tuple(rows),
        headline_metric="Mean allocation per component",
    )


def _nps(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    col = question.raw_columns[0]
    if col not in df.columns:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, 0, (), warnings=(f"column {col!r} missing",))
    series = _coerce_numeric(df[col]).dropna()
    n = len(series)
    if n == 0:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, int(len(df)), (), warnings=("no numeric values",))
    promoters = int(((series >= 9) & (series <= 10)).sum())
    detractors = int((series <= 6).sum())
    passives = n - promoters - detractors
    pct_p = promoters / n * 100.0
    pct_d = detractors / n * 100.0
    pct_pa = passives / n * 100.0
    nps_score = pct_p - pct_d
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=n,
        missing_n=int(len(df)) - n,
        rows=(
            CutRow(label="Promoters (9-10)", count=promoters, pct=pct_p),
            CutRow(label="Passives (7-8)", count=passives, pct=pct_pa),
            CutRow(label="Detractors (0-6)", count=detractors, pct=pct_d),
        ),
        headline_metric=f"NPS: {nps_score:+.0f}",
    )


def _ranking(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    """Each sub-column carries a rank value (1=top). Show how often each item is ranked top-3 or top-5."""
    cols_present = [c for c in question.raw_columns if c in df.columns]
    if not cols_present:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, 0, (), warnings=("no sub-columns present",))
    rows: list[CutRow] = []
    n_respondents = int(len(df))
    for col in cols_present:
        label = question.sub_column_labels.get(col, col)
        series = _coerce_numeric(df[col])
        top_3 = int(((series >= 1) & (series <= 3)).sum())
        rows.append(CutRow(label=str(label), count=top_3, pct=top_3 / n_respondents * 100.0))
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=n_respondents,
        missing_n=0,
        rows=tuple(rows),
        headline_metric="% of respondents ranking the item top-3",
    )


def _direct_numeric(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    col = question.raw_columns[0]
    if col not in df.columns:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, 0, (), warnings=(f"column {col!r} missing",))
    series = _coerce_numeric(df[col]).dropna()
    n = len(series)
    if n == 0:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, int(len(df)), (), warnings=("no numeric values",))
    # Just the mean — matches the simplified single-row Excel layout.
    rows = (
        CutRow(label="Mean", count=n, pct=float(series.mean())),
    )
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=n,
        missing_n=int(len(df)) - n,
        rows=rows,
        headline_metric=f"Mean: {float(series.mean()):.2f}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch table
# ─────────────────────────────────────────────────────────────────────────────


_DISPATCH: dict[QuestionType, Any] = {
    QuestionType.SINGLE_SELECT: _single_select,
    QuestionType.BINARY_TWO_OPTIONS: _binary_two_options,
    QuestionType.MULTI_SELECT_BINARY: _multi_select_binary,
    QuestionType.GRID_RATED: _grid_rated,
    QuestionType.GRID_SINGLE_SELECT: _grid_rated,
    QuestionType.NUMERIC_ALLOCATION: _numeric_allocation,
    QuestionType.NPS: _nps,
    QuestionType.RANKING: _ranking,
    QuestionType.DIRECT_NUMERIC: _direct_numeric,
}


def compute_all_single_cuts(
    schema, df: pd.DataFrame
) -> list[SingleCutResult]:
    """Compute single cuts for every analysis-eligible question in the schema."""
    out: list[SingleCutResult] = []
    for q in schema.questions:
        if not q.analysis_eligible:
            continue
        result = compute_single_cut(q, df)
        if result is not None:
            out.append(result)
    return out
