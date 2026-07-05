"""Pydantic response models for the API."""
from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class UploadResponse(BaseModel):
    session_id: str
    n_respondents: int
    n_raw_columns: int
    n_datamap_blocks: int
    n_eligible_questions: int
    validation_errors: list[str]
    validation_warnings: list[str]


class OptionItem(BaseModel):
    code: str
    label: str


class QuestionSummary(BaseModel):
    column_id: str
    question_text: str
    question_type: str
    n_options: int
    n_sub_columns: int
    is_demographic: bool
    analysis_eligible: bool
    options: list[OptionItem] = []
    sub_options: list[OptionItem] = []   # sub-column id → label (multi/grid/ranking)


class RawColumn(BaseModel):
    name: str
    numeric: bool = False
    options: list[OptionItem] = []   # populated when a single-select maps to this column


class SchemaResponse(BaseModel):
    total_questions: int
    analysis_eligible: int
    total_respondents: int
    questions: list[QuestionSummary]
    raw_columns: list[RawColumn] = []


# ── Segment definitions (also used to evaluate segment masks in previews) ──
class SegmentPredicateIn(BaseModel):
    op: str = "="                  # = <> > >= < <=
    value: str = ""


class SegmentConditionIn(BaseModel):
    column: str                    # raw-data column header
    predicates: list[SegmentPredicateIn] = []   # combined by predicates_op
    predicates_op: str = "OR"      # how predicates combine: "OR" | "AND"


class SegmentGroupIn(BaseModel):
    name: str
    conditions: list[SegmentConditionIn] = []   # combined by conditions_op
    conditions_op: str = "AND"     # how conditions combine: "AND" | "OR"


class SegmentIn(BaseModel):
    name: str
    groups: list[SegmentGroupIn] = []           # priority order (first match wins)
    include_others: bool = True
    others_label: str = "Others"


# ── Dashboard preview selections (applied as a pandas row-mask before compute) ──
class FilterSelectionIn(BaseModel):
    column_id: str
    value: str = "All"             # option / sub-option LABEL, or "All" (no constraint)


class SegmentSelectionIn(BaseModel):
    name: str
    value: str = "All"             # picked group label, or "All" (no constraint)


class CrossCutRequest(BaseModel):
    session_id: str
    row_qid: str
    col_qid: str
    # Optional preview selections — applied before computing (dashboard).
    filter_selections: list[FilterSelectionIn] = []
    segments: list[SegmentIn] = []
    segment_selections: list[SegmentSelectionIn] = []


class CrossCutResponse(BaseModel):
    row_labels: list[str]
    col_labels: list[str]
    counts: list[list[float]]
    warnings: list[str]


class QueuedCrossCut(BaseModel):
    row_qid: str
    col_qid: str


class BuildRequest(BaseModel):
    session_id: str
    theme_names: list[str]
    theme_question_ids: list[list[str]]
    filter_column_ids: list[str]
    queued_cross_cuts: list[QueuedCrossCut] = []
    segments: list[SegmentIn] = []


class BuildResponse(BaseModel):
    workbook_path: str
    size_bytes: int


# ── Cut data for on-screen chart visualisation ──
class CutsRequest(BaseModel):
    session_id: str
    column_ids: list[str] = []      # empty → every analysis-eligible question
    # Optional preview selections — applied before computing (dashboard).
    filter_selections: list[FilterSelectionIn] = []
    segments: list[SegmentIn] = []
    segment_selections: list[SegmentSelectionIn] = []


class CutRowOut(BaseModel):
    label: str
    count: float
    pct: float                      # % of base, OR the mean when value_is_mean


class CutMatrixOut(BaseModel):
    """A ranks × options matrix (ranking cuts) — rows are options, columns Rank 1..K."""
    row_labels: list[str] = []
    col_labels: list[str] = []
    counts: list[list[float]] = []


class CutDataOut(BaseModel):
    column_id: str
    question_text: str
    question_type: str
    valid_n: int
    headline_metric: str = ""
    value_is_mean: bool = False     # grids/numeric report a mean in `pct`, not a share
    rows: list[CutRowOut] = []
    matrix: CutMatrixOut | None = None   # populated for ranking (full rank matrix)


class CutsResponse(BaseModel):
    cuts: list[CutDataOut] = []
