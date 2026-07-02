"""cutter_engine — spec-driven survey cutter engine.

Public API. Consumers should import from this module, not from submodules:

    from cutter_engine import (
        parse_datamap, parse_datamap_from_rows,
        classify, summarise,
        compute_single_cut, compute_all_single_cuts,
        compute_cross_cut,
        validate, format_report,
        suggest_themes, validate_theme_assignment,
        export, ExportInputs,
        detect_type,
        # Contracts
        ParsedBlock, QuestionSpec, QuestionType, SurveySchema,
        FilterSlot, ThemeGroup,
        SingleCutResult, CrossCutResult, CutRow,
        ValidationReport, ValidationIssue, ValidationLevel,
        METADATA_ALLOWLIST,
    )

The engine is framework-agnostic and free of UI code. It reads a datamap
(list of tuples) + a pandas DataFrame, and produces classified schemas,
cut results, and an Excel workbook. All heavy work is deterministic and
side-effect-free apart from writing the final .xlsx (see export).
"""
from __future__ import annotations

__version__ = "0.1.0"

from .classifier import classify, summarise
from .cross_cut import compute_cross_cut
from .datamap_parser import parse_datamap, parse_datamap_from_rows
from .exporter import export, ExportInputs
from .models import (
    METADATA_ALLOWLIST,
    CrossCutResult,
    CutRow,
    FilterSlot,
    ParsedBlock,
    QuestionSpec,
    QuestionType,
    Segment,
    SegmentCondition,
    SegmentGroup,
    SegmentPredicate,
    SingleCutResult,
    SurveySchema,
    ThemeGroup,
    ValidationIssue,
    ValidationLevel,
    ValidationReport,
)
from .question_type_detector import detect_type
from .single_cut import compute_all_single_cuts, compute_single_cut
from .theme_grouper import suggest_themes, validate_theme_assignment
from .validator import format_report, validate

__all__ = [
    "__version__",
    # Parser
    "parse_datamap", "parse_datamap_from_rows",
    # Classifier
    "classify", "summarise", "detect_type",
    # Cuts
    "compute_single_cut", "compute_all_single_cuts", "compute_cross_cut",
    # Validation
    "validate", "format_report",
    # Themes
    "suggest_themes", "validate_theme_assignment",
    # Export
    "export", "ExportInputs",
    # Contracts
    "ParsedBlock", "QuestionSpec", "QuestionType", "SurveySchema",
    "FilterSlot", "ThemeGroup",
    "Segment", "SegmentGroup", "SegmentCondition", "SegmentPredicate",
    "SingleCutResult", "CrossCutResult", "CutRow",
    "ValidationReport", "ValidationIssue", "ValidationLevel",
    "METADATA_ALLOWLIST",
]
