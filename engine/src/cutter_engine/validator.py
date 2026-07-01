"""Validate parsed datamap against the raw data DataFrame.

Per the spec:
  - Every raw column must be declared in the datamap OR be in the metadata allowlist.
  - Every datamap column must exist in the raw data.
  - Sub-columns of multi-col questions are the only raw columns produced.
"""
from __future__ import annotations

import pandas as pd

from .models import (
    METADATA_ALLOWLIST,
    ParsedBlock,
    ValidationIssue,
    ValidationLevel,
    ValidationReport,
)


def _expected_raw_columns(block: ParsedBlock) -> tuple[str, ...]:
    """Return the raw-data columns this datamap block claims will exist.

    - If the block has sub-columns → each sub-column id is a raw column.
    - Else → the parent column_id itself is the raw column.
    """
    if block.sub_columns:
        return tuple(sub_id for sub_id, _label in block.sub_columns)
    return (block.column_id,)


def validate(parsed: list[ParsedBlock], raw_df: pd.DataFrame) -> ValidationReport:
    """Check that the parsed datamap and the raw DataFrame are mutually consistent."""
    raw_columns = [str(c) for c in raw_df.columns]
    raw_set = set(raw_columns)

    # Collect every column the datamap declares
    declared_columns: set[str] = set()
    block_warnings: list[ValidationIssue] = []
    for block in parsed:
        expected = _expected_raw_columns(block)
        declared_columns.update(expected)
        # Surface parser-emitted block warnings as soft issues
        for w in block.warnings:
            block_warnings.append(ValidationIssue(
                level=ValidationLevel.WARN,
                code="PARSER_WARNING",
                message=w,
                detail=f"block={block.column_id!r}",
            ))

    metadata_in_raw = raw_set.intersection(METADATA_ALLOWLIST)
    declared_in_raw = raw_set.intersection(declared_columns)

    # Hard issues
    raw_undeclared = sorted(c for c in raw_columns
                             if c not in declared_columns and c not in METADATA_ALLOWLIST)
    datamap_missing = sorted(c for c in declared_columns if c not in raw_set)

    issues: list[ValidationIssue] = list(block_warnings)
    for col in raw_undeclared:
        issues.append(ValidationIssue(
            level=ValidationLevel.WARN,
            code="RAW_COL_UNDECLARED",
            message=f"Raw column {col!r} is not declared in the datamap.",
            detail=("This is likely a data-prep issue: either add a block to the datamap "
                    "for this column or remove the column from raw data."),
        ))
    for col in datamap_missing:
        issues.append(ValidationIssue(
            level=ValidationLevel.ERROR,
            code="DATAMAP_COL_MISSING_IN_RAW",
            message=f"Datamap declares {col!r} but raw data has no such column.",
            detail=("Either remove the block from the datamap or add the column to raw data. "
                    "Match is case-sensitive."),
        ))

    return ValidationReport(
        raw_columns_count=len(raw_columns),
        declared_columns_count=len(declared_columns),
        metadata_columns_count=len(metadata_in_raw),
        raw_columns_undeclared=tuple(raw_undeclared),
        datamap_columns_missing_in_raw=tuple(datamap_missing),
        issues=tuple(issues),
    )


def format_report(report: ValidationReport) -> str:
    """Render a human-readable summary of the validation report."""
    lines = [
        f"Raw columns:            {report.raw_columns_count}",
        f"Datamap declared cols:  {report.declared_columns_count}",
        f"Metadata allowlist:     {report.metadata_columns_count}",
        f"Raw cols undeclared:    {len(report.raw_columns_undeclared)}",
        f"Datamap missing in raw: {len(report.datamap_columns_missing_in_raw)}",
        "",
    ]
    if report.has_errors:
        lines.append("ERRORS:")
        for issue in report.issues:
            if issue.level == ValidationLevel.ERROR:
                lines.append(f"  [{issue.code}] {issue.message}")
                if issue.detail:
                    lines.append(f"     ↳ {issue.detail}")
    if report.has_warnings:
        lines.append("WARNINGS:")
        for issue in report.issues:
            if issue.level == ValidationLevel.WARN:
                lines.append(f"  [{issue.code}] {issue.message}")
    if not report.has_errors and not report.has_warnings:
        lines.append("All clean — no errors, no warnings.")
    return "\n".join(lines)
