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
    """Each sub-column is 0/1. Matches the Excel multi-select block exactly:
    base = respondents whose sub-columns SUM to > 0 (COUNTIFS(_q_sum, ">0")),
    each row = count where the sub-column == 1 (COUNTIFS(sub, 1))."""
    rows: list[CutRow] = []
    n_respondents = int(len(df))
    cols_present = [c for c in question.raw_columns if c in df.columns]
    if not cols_present:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, n_respondents, (), warnings=("no sub-columns present in raw data",))
    sub_num = df[cols_present].apply(pd.to_numeric, errors="coerce")
    # Excel _q_sum = SUM(subs) treating blanks as 0; base = COUNTIFS(_q_sum, ">0").
    row_sums = sub_num.fillna(0).sum(axis=1)
    valid_n = int((row_sums > 0).sum())
    missing_n = n_respondents - valid_n
    if valid_n == 0:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, missing_n, (), warnings=("no respondents selected any sub-column",))

    for col in cols_present:
        n_selected = int((sub_num[col] == 1).sum())
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
        series = _coerce_numeric(df[col])
        # Excel: Valid n = COUNTIFS(sub, ">0"); Mean = SUMIFS(sub, sub, ">0")/that.
        positive = series[series > 0]
        n = int(len(positive))
        valid_ns.append(n)
        if n == 0:
            rows.append(CutRow(label=str(label), count=0, pct=0.0))
            continue
        m = float(positive.mean())
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
        series = _coerce_numeric(df[col])
        # Excel: Valid n = COUNTIFS(sub, "<>") (non-blank); Mean = AVERAGEIFS(sub, sub, ">=0").
        nonblank = int(series.notna().sum())
        nonneg = series[series >= 0]
        m = float(nonneg.mean()) if len(nonneg) else 0.0
        rows.append(CutRow(label=str(label), count=nonblank, pct=m))
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


def _numeric_grid(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    """Free numeric entry per column. Mean per column over all non-blank values —
    unlike allocation (>=0) or rated grids (>0), this includes negatives, matching
    an Excel AVERAGEIFS(range, range, "<>"). Valid n = non-blank count."""
    cols_present = [c for c in question.raw_columns if c in df.columns]
    rows: list[CutRow] = []
    for col in cols_present:
        label = question.sub_column_labels.get(col, col)
        series = _coerce_numeric(df[col]).dropna()   # non-blank numeric values
        n = len(series)
        m = float(series.mean()) if n else 0.0
        rows.append(CutRow(label=str(label), count=n, pct=m))
    n_valid = int(df[cols_present[0]].notna().sum()) if cols_present else 0
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=n_valid,
        missing_n=int(len(df)) - n_valid,
        rows=tuple(rows),
        headline_metric="Mean per column",
    )


def _nps(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    col = question.raw_columns[0]
    if col not in df.columns:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, 0, (), warnings=(f"column {col!r} missing",))
    series = _coerce_numeric(df[col])
    # Match the Excel NPS block's COUNTIFS criteria exactly (NaN compares as False):
    #   base = COUNTIFS(">=0");  Promoters = ">=9";  Passives = ">=7" & "<=8";  Detractors = "<=6"
    base = int((series >= 0).sum())
    if base == 0:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, int(len(df)), (), warnings=("no numeric values",))
    promoters = int((series >= 9).sum())
    passives = int(((series >= 7) & (series <= 8)).sum())
    detractors = int((series <= 6).sum())
    pct_p = promoters / base * 100.0
    pct_d = detractors / base * 100.0
    pct_pa = passives / base * 100.0
    nps_score = pct_p - pct_d
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=base,
        missing_n=int(len(df)) - base,
        rows=(
            CutRow(label="Promoters (9-10)", count=promoters, pct=pct_p),
            CutRow(label="Passives (7-8)", count=passives, pct=pct_pa),
            CutRow(label="Detractors (0-6)", count=detractors, pct=pct_d),
        ),
        headline_metric=f"NPS: {nps_score:+.0f}",
    )


def _ranking(question: QuestionSpec, df: pd.DataFrame) -> SingleCutResult:
    """Each sub-column carries a rank value (1=top). Matches the Excel ranking
    block's first-choice column: count of respondents who ranked each item #1
    (COUNTIFS(sub, 1)). Base = respondents who ranked anything (COUNTIFS(_q_sum, ">0")).

    (The workbook shows the full ranks × options matrix; a single-series preview
    can only show one rank column, so it mirrors the Rank 1 / first-choice column.)
    """
    cols_present = [c for c in question.raw_columns if c in df.columns]
    if not cols_present:
        return SingleCutResult(question.column_id, question.question_text, question.question_type,
                               0, 0, (), warnings=("no sub-columns present",))
    sub_num = df[cols_present].apply(pd.to_numeric, errors="coerce")
    base = int((sub_num.fillna(0).sum(axis=1) > 0).sum())
    rows: list[CutRow] = []
    for col in cols_present:
        label = question.sub_column_labels.get(col, col)
        rank1 = int((sub_num[col] == 1).sum())
        pct = (rank1 / base * 100.0) if base else 0.0
        rows.append(CutRow(label=str(label), count=rank1, pct=pct))
    return SingleCutResult(
        column_id=question.column_id,
        question_text=question.question_text,
        question_type=question.question_type,
        valid_n=base,
        missing_n=int(len(df)) - base,
        rows=tuple(rows),
        headline_metric="Rank distribution",
    )


def compute_ranking_matrix(
    question: QuestionSpec, df: pd.DataFrame
) -> tuple[list[str], list[str], list[list[int]]]:
    """Ranks × options count matrix, matching the Excel ranking block exactly.

    Returns (row_labels, col_labels, counts) where rows are the options and
    columns are Rank 1..K. Cell = COUNTIFS(sub_col, rank) — how many respondents
    gave that option that rank. Rank range comes from scale_range (else 1..#subs),
    same as the exporter's _write_ranking_block.
    """
    cols_present = [c for c in question.raw_columns if c in df.columns]
    if not cols_present:
        return [], [], []
    if question.scale_range and question.scale_range[0] is not None:
        lo, hi = int(question.scale_range[0]), int(question.scale_range[1])
    else:
        lo, hi = 1, len(cols_present)
    rank_values = list(range(lo, hi + 1))
    col_labels = [f"Rank {r}" for r in rank_values]
    row_labels: list[str] = []
    counts: list[list[int]] = []
    for col in cols_present:
        series = _coerce_numeric(df[col])
        row_labels.append(str(question.sub_column_labels.get(col, col)))
        counts.append([int((series == r).sum()) for r in rank_values])
    return row_labels, col_labels, counts


def compute_grid_matrix(
    question: QuestionSpec, df: pd.DataFrame
) -> tuple[list[str], list[str], list[list[int]]]:
    """Scale × option count matrix for a (non-numerical) grid — matches the Excel
    grid block's # of respondents.

    Returns (row_labels, col_labels, counts) with **rows = options** and
    **cols = scale values** (natural chart orientation: one 100%-stacked column
    per option). Cell = COUNTIFS(option_column, scale_code). Empty if the block
    has no legend/options.
    """
    scale = list(question.option_map.items())     # (code, label) in declared order
    opt_cols = [c for c in question.raw_columns if c in df.columns]
    if not scale or not opt_cols:
        return [], [], []
    col_labels = [str(lbl) for _code, lbl in scale]
    row_labels: list[str] = []
    counts: list[list[int]] = []
    for col in opt_cols:
        series = _coerce_numeric(df[col])
        row_labels.append(str(question.sub_column_labels.get(col, col)))
        row: list[int] = []
        for code, _lbl in scale:
            try:
                cv: Any = float(code)
            except (TypeError, ValueError):
                cv = code
            row.append(int((series == cv).sum()))
        counts.append(row)
    return row_labels, col_labels, counts


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
    QuestionType.NUMERIC_GRID: _numeric_grid,
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
