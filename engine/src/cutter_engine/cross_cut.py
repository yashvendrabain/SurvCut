"""Dynamic cross-cut engine.

Builds a row-question × col-question matrix where the **dimensions are sized
from the actual option counts** of the two picked questions — never fixed.

Handles every type pair sensibly:
  - SINGLE_SELECT × SINGLE_SELECT       → counts crosstab
  - SINGLE_SELECT × MULTI_SELECT_BINARY → counts of selections per cell
  - SINGLE_SELECT × NPS                 → counts in NPS buckets
  - SINGLE_SELECT × DIRECT_NUMERIC      → mean of numeric by category
  - SINGLE_SELECT × NUMERIC_ALLOCATION  → mean allocation per component
  - SINGLE_SELECT × GRID_RATED          → mean rating per grid row
  - SINGLE_SELECT × RANKING             → % ranked top-3 per item
  - …and any of the above with multi-select / grid as the row question too.
"""
from __future__ import annotations

from collections import OrderedDict
from typing import Any

import numpy as np
import pandas as pd

from .models import (
    CrossCutResult,
    CutRow,
    QuestionSpec,
    QuestionType,
)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────


def compute_cross_cut(
    row_question: QuestionSpec,
    col_question: QuestionSpec,
    df: pd.DataFrame,
) -> CrossCutResult:
    """Return a dynamically-sized cross matrix of row_question × col_question.

    Cell semantics depend on the type pair (see module docstring). All cells
    are floats in the result; `counts` carries values that are either raw
    counts, percentages, or means, depending on the pair.
    """
    if not row_question.analysis_eligible or not col_question.analysis_eligible:
        return _empty_result(row_question, col_question,
                             warning="one or both questions not analysis-eligible")

    # ── Special path: row question has sub-columns (grid_rated / numeric_alloc / ranking)
    # Each sub-col becomes its own row category. Cell aggregation depends on
    # the row TYPE — means for grids, counts of top-3 picks for ranking.
    ROW_SUBCOL_TYPES = (QuestionType.GRID_RATED, QuestionType.NUMERIC_ALLOCATION,
                        QuestionType.NUMERIC_GRID, QuestionType.RANKING)
    if row_question.question_type in ROW_SUBCOL_TYPES:
        return _cross_with_subcol_row(row_question, col_question, df)

    # ── Standard path: row categorisation per respondent
    row_labels_per_resp = _categorise(row_question, df)
    if row_labels_per_resp is None:
        return _empty_result(row_question, col_question,
                             warning=f"cannot categorise row question of type {row_question.question_type.value}")

    row_categories = _ordered_categories(row_question)
    col_categories = _ordered_categories(col_question)

    cell_fn = _CELL_FN_BY_COL_TYPE.get(col_question.question_type)
    if cell_fn is None:
        return _empty_result(row_question, col_question,
                             warning=f"no cross-cut handler for col type {col_question.question_type.value}")

    return cell_fn(row_question, col_question, df, row_labels_per_resp,
                   row_categories, col_categories)


# ─────────────────────────────────────────────────────────────────────────────
# Categorisers — turn each respondent into a row label
# ─────────────────────────────────────────────────────────────────────────────


def _categorise(question: QuestionSpec, df: pd.DataFrame) -> list[list[str]] | None:
    """Return per-respondent labels for the row dimension.

    Returns a list-of-lists because some respondents fall into multiple
    categories simultaneously. Examples:
      - Single-select: each respondent gets 0 or 1 labels.
      - Multi-select: each respondent gets one label per selected sub-col.
      - Grid / Ranking / Numeric allocation: each respondent gets one label
        per sub-col they engaged with (non-null / valid rank / non-zero
        allocation respectively). Conceptually: "this respondent
        participated in these grid rows."

    Returning None means "this question type is not supported as a row
    dimension" — the engine emits an empty matrix with a warning.
    """
    qt = question.question_type
    if qt in (QuestionType.SINGLE_SELECT, QuestionType.BINARY_TWO_OPTIONS):
        col = question.raw_columns[0]
        if col not in df.columns:
            return None
        return [_to_labels_single(v, question) for v in df[col]]
    if qt == QuestionType.MULTI_SELECT_BINARY:
        return _to_labels_multi(question, df)
    if qt == QuestionType.NPS:
        col = question.raw_columns[0]
        if col not in df.columns:
            return None
        return [_to_labels_nps(v) for v in df[col]]

    # ── Multi-column types as ROW (Phase 2 row-support) ──
    # For each respondent, return the list of sub-col labels they engaged
    # with. The downstream cell function then accumulates per (row_label,
    # col_label) the same way it already does for multi-select.
    if qt in (QuestionType.GRID_RATED, QuestionType.NUMERIC_GRID):
        # Engaged = any non-null value (respondent answered this row).
        return _to_labels_subcol(question, df, lambda v: pd.notna(v))
    if qt == QuestionType.RANKING:
        # Engaged = a real rank was assigned (numeric, >= 1).
        def _ranked(v: Any) -> bool:
            try:
                return pd.notna(v) and float(v) >= 1
            except (TypeError, ValueError):
                return False
        return _to_labels_subcol(question, df, _ranked)
    if qt == QuestionType.NUMERIC_ALLOCATION:
        # Engaged = an actual allocation (non-null, > 0).
        def _allocated(v: Any) -> bool:
            try:
                return pd.notna(v) and float(v) > 0
            except (TypeError, ValueError):
                return False
        return _to_labels_subcol(question, df, _allocated)

    # Direct numeric / open text / metadata / unknown remain unsupported as row.
    return None


def _to_labels_subcol(
    question: QuestionSpec,
    df: pd.DataFrame,
    is_engaged,
) -> list[list[str]]:
    """Generic sub-col engagement categoriser.

    For each respondent, returns the list of sub-col labels where
    `is_engaged(value)` is True. Used by grid / ranking / numeric_allocation
    when they sit on the ROW axis of a cross-cut.
    """
    cols_present = [c for c in question.raw_columns if c in df.columns]
    sub_to_label = question.sub_column_labels
    out: list[list[str]] = []
    for _, row in df[cols_present].iterrows():
        engaged: list[str] = []
        for col in cols_present:
            if is_engaged(row[col]):
                engaged.append(sub_to_label.get(col, col))
        out.append(engaged)
    return out


def _to_labels_single(value: Any, question: QuestionSpec) -> list[str]:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return []
    label = question.option_map.get(value)
    if label is None:
        try:
            label = question.option_map.get(int(value))
        except (TypeError, ValueError):
            pass
    return [str(label) if label else str(value)]


def _to_labels_multi(question: QuestionSpec, df: pd.DataFrame) -> list[list[str]]:
    """Each respondent gets the list of selected sub-column labels."""
    out: list[list[str]] = []
    cols_present = [c for c in question.raw_columns if c in df.columns]
    for _, row in df[cols_present].iterrows():
        selected: list[str] = []
        for col in cols_present:
            v = row[col]
            try:
                if int(v) == 1:
                    selected.append(question.sub_column_labels.get(col, col))
            except (TypeError, ValueError):
                continue
        out.append(selected)
    return out


def _to_labels_nps(value: Any) -> list[str]:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return []
    if 0 <= v <= 6:
        return ["Detractors (0-6)"]
    if 7 <= v <= 8:
        return ["Passives (7-8)"]
    if 9 <= v <= 10:
        return ["Promoters (9-10)"]
    return []


def _ordered_categories(question: QuestionSpec) -> list[str]:
    """Render categories in the order declared by the datamap."""
    qt = question.question_type
    if qt in (QuestionType.SINGLE_SELECT, QuestionType.BINARY_TWO_OPTIONS):
        if question.option_map:
            return [str(v) for v in question.option_map.values()]
        return []
    if qt == QuestionType.MULTI_SELECT_BINARY:
        return [question.sub_column_labels.get(c, c) for c in question.raw_columns]
    if qt == QuestionType.NPS:
        return ["Promoters (9-10)", "Passives (7-8)", "Detractors (0-6)"]
    if qt == QuestionType.RANKING:
        return [question.sub_column_labels.get(c, c) for c in question.raw_columns]
    if qt in (QuestionType.GRID_RATED, QuestionType.NUMERIC_ALLOCATION, QuestionType.NUMERIC_GRID):
        return [question.sub_column_labels.get(c, c) for c in question.raw_columns]
    if qt == QuestionType.DIRECT_NUMERIC:
        return ["Mean", "Median", "Min", "Max"]
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Cell functions — one per column-question type
# ─────────────────────────────────────────────────────────────────────────────


def _cross_with_subcol_row(
    row_q: QuestionSpec, col_q: QuestionSpec, df: pd.DataFrame,
) -> CrossCutResult:
    """Handle grid_rated / numeric_allocation / ranking on the ROW axis.

    Layout:
        row categories = row_q's sub-column LABELS (one row per item)
        col categories = col_q's natural categories (options / sub-cols / NPS buckets)

    Cell value depends on the row type:
      - GRID_RATED / NUMERIC_ALLOCATION → mean of that sub-col within respondents
                                          who fall in the col category
      - RANKING                          → count of respondents who put the item
                                          in top-3 AND fall in the col category

    Col type support: single_select / binary / multi_select_binary / NPS. Other
    col types fall back to a single "All respondents" column.
    """
    # Row categories = sub-col labels
    row_categories = [row_q.sub_column_labels.get(c, c) for c in row_q.raw_columns]
    sub_cols_present = [c for c in row_q.raw_columns if c in df.columns]
    if not sub_cols_present:
        return _empty_result(row_q, col_q, warning="row question's sub-cols missing in raw data")

    # Col categorisation — each respondent gets a list of col labels
    col_labels_per_resp = _col_labels_per_resp(col_q, df)
    if col_labels_per_resp is None:
        # Fallback: one column "All respondents"
        col_categories = ["All respondents"]
        col_labels_per_resp = [["All respondents"] for _ in range(len(df))]
    else:
        col_categories = _ordered_categories(col_q)

    n = len(df)
    is_ranking = row_q.question_type == QuestionType.RANKING
    # value_kind drives label-only result formatting at assembly time
    value_kind = "count" if is_ranking else "mean"

    # Build the cell matrix
    matrix: dict[str, dict[str, float]] = {}
    for sub_col, row_label in zip(row_q.raw_columns, row_categories):
        if sub_col not in df.columns:
            matrix[row_label] = {c: 0.0 for c in col_categories}
            continue
        series = pd.to_numeric(df[sub_col], errors="coerce")
        # Per col category: collect values from respondents who belong to it
        sums = {c: 0.0 for c in col_categories}
        ns = {c: 0 for c in col_categories}
        for i in range(n):
            v = series.iloc[i]
            if pd.isna(v):
                continue
            if is_ranking and not (1 <= v <= 3):
                # For ranking, only count respondents who put this item top-3
                continue
            for cl in col_labels_per_resp[i]:
                if cl in sums:
                    if is_ranking:
                        sums[cl] += 1.0  # count, not value
                    else:
                        sums[cl] += float(v)
                    ns[cl] += 1
        if is_ranking:
            matrix[row_label] = {c: sums[c] for c in col_categories}
        else:
            matrix[row_label] = {c: (sums[c] / ns[c] if ns[c] else 0.0) for c in col_categories}

    return _assemble(row_q, col_q, row_categories, col_categories, matrix,
                     value_kind=value_kind)


def _col_labels_per_resp(col_q: QuestionSpec, df: pd.DataFrame) -> list[list[str]] | None:
    """Per-respondent list of column categories. Returns None for unsupported types."""
    qt = col_q.question_type
    if qt in (QuestionType.SINGLE_SELECT, QuestionType.BINARY_TWO_OPTIONS):
        col = col_q.raw_columns[0]
        if col not in df.columns:
            return None
        return [_to_labels_single(v, col_q) for v in df[col]]
    if qt == QuestionType.MULTI_SELECT_BINARY:
        return _to_labels_multi(col_q, df)
    if qt == QuestionType.NPS:
        col = col_q.raw_columns[0]
        if col not in df.columns:
            return None
        return [_to_labels_nps(v) for v in df[col]]
    return None


def _empty_result(row_q: QuestionSpec, col_q: QuestionSpec, warning: str) -> CrossCutResult:
    return CrossCutResult(
        row_column_id=row_q.column_id, col_column_id=col_q.column_id,
        row_question_text=row_q.question_text, col_question_text=col_q.question_text,
        row_labels=(), col_labels=(), counts=(),
        row_totals=(), col_totals=(), grand_total=0,
        warnings=(warning,),
    )


def _cell_counts_single(
    row_question: QuestionSpec, col_question: QuestionSpec, df: pd.DataFrame,
    row_labels_per_resp: list[list[str]],
    row_categories: list[str], col_categories: list[str],
) -> CrossCutResult:
    """row × single-select col → counts crosstab."""
    col_col = col_question.raw_columns[0]
    if col_col not in df.columns:
        return _empty_result(row_question, col_question, warning=f"column {col_col!r} missing")

    # Build counts[row_label][col_label]
    counts = {r: {c: 0 for c in col_categories} for r in row_categories}
    for i in range(len(df)):
        row_labels = row_labels_per_resp[i]
        if not row_labels:
            continue
        c_val = df[col_col].iloc[i]
        c_labels = _to_labels_single(c_val, col_question)
        if not c_labels:
            continue
        c_label = c_labels[0]
        if c_label not in counts.get(row_labels[0], {}):
            continue
        for rl in row_labels:
            if rl in counts and c_label in counts[rl]:
                counts[rl][c_label] += 1

    return _assemble(row_question, col_question, row_categories, col_categories, counts)


def _cell_counts_multi(
    row_question: QuestionSpec, col_question: QuestionSpec, df: pd.DataFrame,
    row_labels_per_resp: list[list[str]],
    row_categories: list[str], col_categories: list[str],
) -> CrossCutResult:
    """row × multi-select col → counts of respondents who selected col-item in row-category."""
    col_labels_per_resp = _to_labels_multi(col_question, df)
    counts = {r: {c: 0 for c in col_categories} for r in row_categories}
    for i in range(len(df)):
        for rl in row_labels_per_resp[i]:
            if rl not in counts:
                continue
            for cl in col_labels_per_resp[i]:
                if cl in counts[rl]:
                    counts[rl][cl] += 1
    return _assemble(row_question, col_question, row_categories, col_categories, counts)


def _cell_counts_nps(
    row_question: QuestionSpec, col_question: QuestionSpec, df: pd.DataFrame,
    row_labels_per_resp: list[list[str]],
    row_categories: list[str], col_categories: list[str],
) -> CrossCutResult:
    col_labels_per_resp = [_to_labels_nps(v) for v in df[col_question.raw_columns[0]]]
    counts = {r: {c: 0 for c in col_categories} for r in row_categories}
    for i in range(len(df)):
        for rl in row_labels_per_resp[i]:
            if rl not in counts:
                continue
            for cl in col_labels_per_resp[i]:
                if cl in counts[rl]:
                    counts[rl][cl] += 1
    return _assemble(row_question, col_question, row_categories, col_categories, counts)


def _cell_means_numeric(
    row_question: QuestionSpec, col_question: QuestionSpec, df: pd.DataFrame,
    row_labels_per_resp: list[list[str]],
    row_categories: list[str], col_categories: list[str],
) -> CrossCutResult:
    """row × direct numeric → mean of numeric value per row category."""
    col_col = col_question.raw_columns[0]
    if col_col not in df.columns:
        return _empty_result(row_question, col_question, warning=f"column {col_col!r} missing")
    series = pd.to_numeric(df[col_col], errors="coerce")
    counts: dict[str, dict[str, float]] = {r: {c: 0.0 for c in col_categories} for r in row_categories}
    # Accumulate sum + count per row category
    sums = {r: 0.0 for r in row_categories}
    ns = {r: 0 for r in row_categories}
    for i in range(len(df)):
        v = series.iloc[i]
        if pd.isna(v):
            continue
        for rl in row_labels_per_resp[i]:
            if rl in sums:
                sums[rl] += float(v)
                ns[rl] += 1
    for r in row_categories:
        mean = sums[r] / ns[r] if ns[r] else 0.0
        if "Mean" in counts[r]:
            counts[r]["Mean"] = mean
        if "Median" in counts[r]:
            pass  # would need full sample retained; skip
        if "Min" in counts[r]:
            pass
        if "Max" in counts[r]:
            pass
        if ns[r] > 0:
            # Provide a 1-column "Mean" view; col_categories was [Mean,Median,Min,Max]
            pass
    return _assemble(row_question, col_question, row_categories, ["Mean"],
                     {r: {"Mean": sums[r] / ns[r] if ns[r] else 0.0} for r in row_categories},
                     value_kind="mean")


def _cell_means_grid(
    row_question: QuestionSpec, col_question: QuestionSpec, df: pd.DataFrame,
    row_labels_per_resp: list[list[str]],
    row_categories: list[str], col_categories: list[str],
) -> CrossCutResult:
    """row × grid_rated → mean rating per (row category, grid row)."""
    sums: dict[str, dict[str, float]] = {r: {c: 0.0 for c in col_categories} for r in row_categories}
    ns: dict[str, dict[str, int]] = {r: {c: 0 for c in col_categories} for r in row_categories}
    sub_to_label = col_question.sub_column_labels
    for sub_col in col_question.raw_columns:
        if sub_col not in df.columns:
            continue
        label = sub_to_label.get(sub_col, sub_col)
        series = pd.to_numeric(df[sub_col], errors="coerce")
        for i in range(len(df)):
            v = series.iloc[i]
            if pd.isna(v):
                continue
            for rl in row_labels_per_resp[i]:
                if rl in sums and label in sums[rl]:
                    sums[rl][label] += float(v)
                    ns[rl][label] += 1
    means: dict[str, dict[str, float]] = {}
    for r in row_categories:
        means[r] = {}
        for c in col_categories:
            n = ns[r][c]
            means[r][c] = (sums[r][c] / n) if n else 0.0
    return _assemble(row_question, col_question, row_categories, col_categories, means,
                     value_kind="mean")


def _cell_pct_ranking(
    row_question: QuestionSpec, col_question: QuestionSpec, df: pd.DataFrame,
    row_labels_per_resp: list[list[str]],
    row_categories: list[str], col_categories: list[str],
) -> CrossCutResult:
    """row × ranking → % of row-category who ranked each item top-3."""
    counts: dict[str, dict[str, int]] = {r: {c: 0 for c in col_categories} for r in row_categories}
    bases: dict[str, int] = {r: 0 for r in row_categories}
    sub_to_label = col_question.sub_column_labels
    # First pass: count how many respondents fall in each row category
    for i in range(len(df)):
        for rl in row_labels_per_resp[i]:
            if rl in bases:
                bases[rl] += 1
    # Second pass: per sub-column, count top-3 picks
    for sub_col in col_question.raw_columns:
        if sub_col not in df.columns:
            continue
        label = sub_to_label.get(sub_col, sub_col)
        series = pd.to_numeric(df[sub_col], errors="coerce")
        for i in range(len(df)):
            v = series.iloc[i]
            if pd.isna(v) or not (1 <= v <= 3):
                continue
            for rl in row_labels_per_resp[i]:
                if rl in counts and label in counts[rl]:
                    counts[rl][label] += 1
    pct: dict[str, dict[str, float]] = {}
    for r in row_categories:
        b = bases[r]
        pct[r] = {c: (counts[r][c] / b * 100.0 if b else 0.0) for c in col_categories}
    return _assemble(row_question, col_question, row_categories, col_categories, pct,
                     value_kind="pct")


# ─────────────────────────────────────────────────────────────────────────────
# Assembly helpers
# ─────────────────────────────────────────────────────────────────────────────


def _assemble(
    row_q: QuestionSpec, col_q: QuestionSpec,
    row_categories: list[str], col_categories: list[str],
    values: dict[str, dict[str, float | int]],
    value_kind: str = "count",
) -> CrossCutResult:
    """Convert the dict-of-dicts into a CrossCutResult."""
    counts: list[tuple] = []
    row_totals: list[float] = []
    col_totals = {c: 0.0 for c in col_categories}
    grand = 0.0
    for r in row_categories:
        row_vals = tuple(values[r][c] for c in col_categories)
        counts.append(row_vals)
        row_total = sum(row_vals)
        row_totals.append(row_total)
        grand += row_total
        for c, v in zip(col_categories, row_vals):
            col_totals[c] += v
    return CrossCutResult(
        row_column_id=row_q.column_id, col_column_id=col_q.column_id,
        row_question_text=row_q.question_text, col_question_text=col_q.question_text,
        row_labels=tuple(row_categories),
        col_labels=tuple(col_categories),
        counts=tuple(counts),
        row_totals=tuple(int(round(v)) if value_kind == "count" else v for v in row_totals),
        col_totals=tuple(int(round(col_totals[c])) if value_kind == "count" else col_totals[c]
                          for c in col_categories),
        grand_total=int(round(grand)) if value_kind == "count" else grand,
        warnings=(f"value_kind={value_kind}",) if value_kind != "count" else (),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch by COL question type
# ─────────────────────────────────────────────────────────────────────────────


_CELL_FN_BY_COL_TYPE = {
    QuestionType.SINGLE_SELECT: _cell_counts_single,
    QuestionType.BINARY_TWO_OPTIONS: _cell_counts_single,
    QuestionType.MULTI_SELECT_BINARY: _cell_counts_multi,
    QuestionType.NPS: _cell_counts_nps,
    QuestionType.DIRECT_NUMERIC: _cell_means_numeric,
    QuestionType.NUMERIC_ALLOCATION: _cell_means_grid,
    QuestionType.NUMERIC_GRID: _cell_means_grid,
    QuestionType.GRID_RATED: _cell_means_grid,
    QuestionType.GRID_SINGLE_SELECT: _cell_means_grid,
    QuestionType.RANKING: _cell_pct_ranking,
}
