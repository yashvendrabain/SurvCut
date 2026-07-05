"""Apply on-screen filter + segment selections to the raw DataFrame.

Pure pandas row-masking used by the dashboard preview so cuts / cross-cuts can
be recomputed under the filters and segments configured in the wizard. It
mirrors the AND/OR segment logic and the code/sub-option matching used by the
Excel exporter, with one deliberate difference: here **"All" means "no
constraint on this dimension"** (the dashboard is a decoupled preview, so an
un-picked filter simply doesn't restrict anything).

Nothing here touches the workbook — the exporter still emits its own live
COUNTIFS formulas independently.
"""
from __future__ import annotations

from typing import Any, Iterable

import pandas as pd

from .models import QuestionSpec, QuestionType, Segment, SurveySchema

_EMPTY = (None, "", "All")


def _match_code(series: pd.Series, code: Any) -> pd.Series:
    """Boolean mask of rows whose value equals `code` (numeric- or text-tolerant)."""
    try:
        cv = float(code)
        return pd.to_numeric(series, errors="coerce") == cv
    except (TypeError, ValueError):
        return series.astype(str).str.strip() == str(code).strip()


def _pred_mask(series: pd.Series, op: str, val: Any) -> pd.Series:
    """One predicate: `series <op> val`. Numeric where the value parses as a number."""
    op = (op or "=").strip()
    try:
        v = float(val)
        numeric = True
    except (TypeError, ValueError):
        numeric = False
    if numeric:
        s = pd.to_numeric(series, errors="coerce")
        if op == ">=":
            return s >= v
        if op == ">":
            return s > v
        if op == "<=":
            return s <= v
        if op == "<":
            return s < v
        if op == "<>":
            return s != v
        return s == v
    ss = series.astype(str).str.strip()
    vv = str(val).strip()
    return ss != vv if op == "<>" else ss == vv


def _resolve_column(df: pd.DataFrame, schema: SurveySchema, name: str) -> str | None:
    """A segment condition's `column` may be a raw header or a question id."""
    if name in df.columns:
        return name
    q = schema.by_column_id(name)
    if q is not None and q.raw_columns and q.raw_columns[0] in df.columns:
        return q.raw_columns[0]
    return None


def _cond_mask(df: pd.DataFrame, schema: SurveySchema, cond) -> pd.Series | None:
    col = _resolve_column(df, schema, cond.column)
    if col is None:
        return None
    preds = [(p.op or "=", p.value) for p in cond.predicates if p.value not in (None, "")]
    if not preds:
        return None
    masks = [_pred_mask(df[col], op, val) for op, val in preds]
    combine = str(getattr(cond, "predicates_op", "OR")).upper()
    m = masks[0]
    for pm in masks[1:]:
        m = (m & pm) if combine == "AND" else (m | pm)
    return m


def _group_mask(df: pd.DataFrame, schema: SurveySchema, group) -> pd.Series:
    cond_masks = []
    for cond in group.conditions:
        cm = _cond_mask(df, schema, cond)
        if cm is not None:
            cond_masks.append(cm.fillna(False))
    if not cond_masks:
        return pd.Series(False, index=df.index)
    combine = str(getattr(group, "conditions_op", "AND")).upper()
    m = cond_masks[0]
    for cm in cond_masks[1:]:
        m = (m | cm) if combine == "OR" else (m & cm)
    return m


def segment_labels(df: pd.DataFrame, schema: SurveySchema, segment: Segment) -> pd.Series:
    """Per-respondent group label for a segment (first matching group wins).

    Unmatched respondents get the Others label (or "" when include_others is off).
    Mirrors the exporter's nested-IF priority assignment.
    """
    default = segment.others_label if getattr(segment, "include_others", True) else ""
    result = pd.Series([default] * len(df), index=df.index, dtype=object)
    assigned = pd.Series(False, index=df.index)
    for group in segment.groups:
        gmask = _group_mask(df, schema, group).fillna(False)
        newly = gmask & (~assigned)
        result[newly] = group.name
        assigned = assigned | newly
    return result


def _reverse_option_map(q: QuestionSpec) -> dict[str, Any]:
    return {str(lbl): code for code, lbl in q.option_map.items()}


def _sublabel_to_col(q: QuestionSpec) -> dict[str, str]:
    return {str(lbl): sub for sub, lbl in q.sub_column_labels.items()}


def apply_selections(
    df: pd.DataFrame,
    schema: SurveySchema,
    filters: Iterable[tuple[str, Any]] = (),
    segments: Iterable[Segment] = (),
    segment_picks: dict[str, str] | None = None,
) -> pd.DataFrame:
    """Return `df` subset by the given filter values + segment group picks,
    matching the workbook's Global Filters semantics **exactly**.

    Args:
      filters: (column_id, value) pairs — pass EVERY configured filter, not just
               the changed ones. `value` is an option/sub-option LABEL, or "All".
               "All" is Excel's `"<>"` (single: non-blank; multi: selected ≥1),
               NOT "no constraint" — so a filter left on "All" still restricts to
               respondents who answered that question, just like the workbook.
      segments: Segment definitions for the picked/configured segments.
      segment_picks: {segment_name -> picked group label or "All"}.

    Passing NO filters/segments (e.g. the Generate quick-previews) is an identity
    and returns the full df.
    """
    if df is None or len(df) == 0:
        return df
    mask = pd.Series(True, index=df.index)

    # Filters — every configured filter constrains every cut, exactly as the
    # workbook's Global Filters block does (each COUNTIFS carries all filter
    # clauses). "All" is NOT "no constraint": it is Excel's `"<>"` / ">=1".
    for column_id, value in (filters or ()):
        q = schema.by_column_id(column_id)
        if q is None:
            continue
        if q.question_type == QuestionType.MULTI_SELECT_BINARY:
            subs = [c for c in q.raw_columns if c in df.columns]
            if not subs:
                continue
            if value in _EMPTY:
                # Excel: CHOOSE→_q_sum, ">=1"  (respondents who selected ≥1 option).
                sub_num = df[subs].apply(pd.to_numeric, errors="coerce").fillna(0)
                mask &= (sub_num.sum(axis=1) >= 1)
            else:
                sub = _sublabel_to_col(q).get(str(value))
                if sub and sub in df.columns:
                    mask &= (pd.to_numeric(df[sub], errors="coerce") >= 1)
        elif q.raw_columns and q.raw_columns[0] in df.columns:
            col = q.raw_columns[0]
            if value in _EMPTY:
                mask &= df[col].notna()                      # Excel "<>" = non-blank
            else:
                code = _reverse_option_map(q).get(str(value), value)
                mask &= _match_code(df[col], code)

    # Segments — each configured segment is also a Global Filter. At "All" the
    # workbook's `"<>"` on the helper keeps everyone when include_others is on
    # (Others label is non-blank) and drops the unmatched ("") when it is off.
    seg_by_name = {s.name: s for s in (segments or ())}
    for name, value in (segment_picks or {}).items():
        seg = seg_by_name.get(name)
        if seg is None:
            continue
        labels = segment_labels(df, schema, seg)
        if value in _EMPTY:
            if not getattr(seg, "include_others", True):
                mask &= (labels.astype(str) != "")           # drop unmatched
        else:
            mask &= (labels == value)

    return df[mask.fillna(False)]
