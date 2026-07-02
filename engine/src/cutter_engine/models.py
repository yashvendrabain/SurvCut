"""Domain model for Cutter v2.

Every cross-module contract lives here as a frozen dataclass.
No business logic — just typed shapes.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Question types — exactly the patterns the datamap spec describes.
# Names are intentionally short for cut titles and dropdowns.
# ─────────────────────────────────────────────────────────────────────────────
class QuestionType(str, Enum):
    SINGLE_SELECT = "single_select"
    MULTI_SELECT_BINARY = "multi_select_binary"   # Values: 0-1 + sub-cols
    GRID_RATED = "grid_rated"                     # Values: 1-N + sub-cols
    GRID_SINGLE_SELECT = "grid_single_select"     # same shape as grid_rated; classifier may collapse
    NUMERIC_ALLOCATION = "numeric_allocation"     # Values: 0-100 + sub-cols
    NPS = "nps"                                   # Values: 0-10 with recommend/NPS keyword
    DIRECT_NUMERIC = "direct_numeric"             # Open numeric response
    RANKING = "ranking"                           # Values: 1-K + sub-cols (each is a rank)
    BINARY_TWO_OPTIONS = "binary_two_options"     # Values: 0-1 with NO sub-cols (rare)
    OPEN_TEXT = "open_text"                       # Open text response — excluded from cuts
    METADATA = "metadata"                         # record / uuid / hSample / etc.
    UNKNOWN = "unknown"                           # classifier could not decide


# The standard metadata allowlist — undeclared but kept as-is.
METADATA_ALLOWLIST: frozenset[str] = frozenset({
    "record", "uuid", "date", "start_date", "status",
    "termReason", "nx", "hSample", "markers",
})


# ─────────────────────────────────────────────────────────────────────────────
# Datamap parsed shape (post-parser, pre-classifier)
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class ParsedBlock:
    """One question block as the parser saw it. Not yet classified."""
    column_id: str                                # the bracket id from the header row
    question_text: str
    type_hint: str                                # raw text after the header row
    scale_options: tuple[tuple[Any, str], ...]    # (code, label) pairs
    sub_columns: tuple[tuple[str, str], ...]      # ([SubColID], label) pairs
    source_row_in_datamap: int                    # 1-indexed, for error messages
    warnings: tuple[str, ...] = ()
    # Piping references — populated when a sub-column's label is `[pipe: helper]`.
    # Tuple of (sub_id, helper_col_name) pairs. Used by downstream code to look
    # up dynamic labels and build the (sub_row × branch) inverse index for S5.
    pipe_sources: tuple[tuple[str, str], ...] = ()


# ─────────────────────────────────────────────────────────────────────────────
# Classified shape (post-classifier — what the cut engines consume)
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class QuestionSpec:
    """One classified question. Stable contract for cut engines."""
    column_id: str                                # logical id (e.g. "Q4_Employees")
    question_text: str
    question_type: QuestionType
    raw_columns: tuple[str, ...]                  # actual DataFrame columns for this question
    option_map: dict[Any, str] = field(default_factory=dict)   # code → label (scale options)
    sub_column_labels: dict[str, str] = field(default_factory=dict)  # raw_col_id → label (grids/multi/ranking/alloc)
    scale_range: tuple[int, int] | None = None    # for value-range questions
    is_metadata: bool = False                     # True for hSample / record / uuid
    is_demographic: bool = False                  # populated by classifier from question_text
    analysis_eligible: bool = True
    exclusion_reason: str = ""
    source_row_in_datamap: int = 0


@dataclass(frozen=True, slots=True)
class SurveySchema:
    """The full classified survey."""
    questions: tuple[QuestionSpec, ...]
    respondent_id_column: str
    total_respondents: int

    def by_column_id(self, column_id: str) -> QuestionSpec | None:
        for q in self.questions:
            if q.column_id == column_id:
                return q
        return None

    def analysis_questions(self) -> tuple[QuestionSpec, ...]:
        return tuple(q for q in self.questions if q.analysis_eligible)

    def by_type(self, question_type: QuestionType) -> tuple[QuestionSpec, ...]:
        return tuple(q for q in self.questions if q.question_type == question_type)


# ─────────────────────────────────────────────────────────────────────────────
# Validation result (post-validator)
# ─────────────────────────────────────────────────────────────────────────────
class ValidationLevel(str, Enum):
    OK = "ok"
    WARN = "warning"
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    level: ValidationLevel
    code: str                                     # short id e.g. "RAW_COL_UNDECLARED"
    message: str
    detail: str = ""


@dataclass(frozen=True, slots=True)
class ValidationReport:
    """Result of comparing parsed datamap against raw data."""
    raw_columns_count: int
    declared_columns_count: int
    metadata_columns_count: int
    raw_columns_undeclared: tuple[str, ...]       # in raw but not in datamap (and not metadata)
    datamap_columns_missing_in_raw: tuple[str, ...]  # declared but not in raw
    issues: tuple[ValidationIssue, ...]

    @property
    def has_errors(self) -> bool:
        return any(i.level == ValidationLevel.ERROR for i in self.issues)

    @property
    def has_warnings(self) -> bool:
        return any(i.level == ValidationLevel.WARN for i in self.issues)


# ─────────────────────────────────────────────────────────────────────────────
# Cut results (Phase 2 will populate these)
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class CutRow:
    label: str
    count: int
    pct: float


@dataclass(frozen=True, slots=True)
class SingleCutResult:
    column_id: str
    question_text: str
    question_type: QuestionType
    valid_n: int
    missing_n: int
    rows: tuple[CutRow, ...]
    headline_metric: str = ""                     # e.g. "NPS: +42", "Mean: 3.7"
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class CrossCutResult:
    row_column_id: str
    col_column_id: str
    row_question_text: str
    col_question_text: str
    row_labels: tuple[str, ...]                   # dynamic — sized from row question's options
    col_labels: tuple[str, ...]                   # dynamic — sized from col question's options
    counts: tuple[tuple[int, ...], ...]           # len(row_labels) × len(col_labels)
    row_totals: tuple[int, ...]
    col_totals: tuple[int, ...]
    grand_total: int
    warnings: tuple[str, ...] = ()


# ─────────────────────────────────────────────────────────────────────────────
# Run-time configuration (what the UI binds to)
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(slots=True)
class FilterSlot:
    """A filter that lives in the Global Filters block of every theme sheet."""
    name: str                                     # human-readable, e.g. "Region"
    column_id: str                                # what raw column to filter on
    default_value: str = "All"


@dataclass(slots=True)
class ThemeGroup:
    """One theme = one output sheet."""
    name: str                                     # sheet name (≤31 chars)
    question_column_ids: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Segmentation — a custom categorical filter (e.g. WLO = Winners/Laggards/Others)
# built from AND-across-questions, OR-within-options conditions. Materialised as
# a live helper column that labels each respondent with their group name, then
# exposed as a Global Filter tagged to every cut and cross-cut.
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(slots=True)
class SegmentPredicate:
    """One OR-clause of a condition: ``<column> <op> <value>``.
    `op` is one of ``= <> > >= < <=``. For discrete option ticks it is ``=``."""
    op: str
    value: Any


@dataclass(slots=True)
class SegmentCondition:
    """A condition on one raw-data column. The respondent's value in `column`
    must satisfy ANY of `predicates` (OR within). Conditions are AND-ed inside a
    group. `column` is a raw-data column header (options or free numeric)."""
    column: str
    predicates: list[SegmentPredicate] = field(default_factory=list)


@dataclass(slots=True)
class SegmentGroup:
    """One named option of a segment. Conditions are combined with AND."""
    name: str
    conditions: list[SegmentCondition] = field(default_factory=list)


@dataclass(slots=True)
class Segment:
    """A named custom filter. `groups` are evaluated in priority order (first
    match wins); when `include_others` is set, unmatched respondents fall into a
    final "Others" group."""
    name: str
    groups: list[SegmentGroup] = field(default_factory=list)
    include_others: bool = True
    others_label: str = "Others"
