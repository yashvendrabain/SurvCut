"""Smoke test: import cutter_engine and roundtrip a tiny datamap."""
from __future__ import annotations

import pandas as pd


def test_public_api_imports():
    """All the documented public names should be importable."""
    from cutter_engine import (
        parse_datamap_from_rows, classify, detect_type,
        compute_single_cut, compute_cross_cut,
        validate, suggest_themes, export, ExportInputs,
        ParsedBlock, QuestionSpec, QuestionType, SurveySchema,
        FilterSlot, ThemeGroup,
        SingleCutResult, CrossCutResult, CutRow,
        ValidationReport, ValidationLevel, ValidationIssue,
        METADATA_ALLOWLIST,
    )
    assert callable(parse_datamap_from_rows)
    assert callable(classify)
    assert callable(detect_type)


def test_parse_classify_end_to_end():
    """A minimal 2-question datamap should parse and classify without errors."""
    from cutter_engine import (
        parse_datamap_from_rows, classify, QuestionType,
    )
    rows = [
        ("[Q1]: Employment status", None, None),
        ("Values: 1-3", None, None),
        (None, "1", "Full-time"),
        (None, "2", "Part-time"),
        (None, "3", "Other"),
        (None, None, None),
        ("[Q2]: Which apply", None, None),
        ("Values: 0-1", None, None),
        (None, "[Q2r1c1]", "A"),
        (None, "[Q2r1c2]", "B"),
        (None, None, None),
    ]
    blocks = parse_datamap_from_rows(rows)
    assert len(blocks) == 2
    schema = classify(blocks, pd.DataFrame({"Q1": [1, 2, 1], "Q2r1c1": [1, 0, 1], "Q2r1c2": [0, 1, 1]}))
    assert schema.total_respondents == 3
    q1 = schema.by_column_id("Q1")
    q2 = schema.by_column_id("Q2")
    assert q1 is not None and q1.question_type == QuestionType.SINGLE_SELECT
    assert q2 is not None and q2.question_type == QuestionType.MULTI_SELECT_BINARY


def test_ranking_detection_via_rank_label():
    """A block with 'Rank 1..N' option labels should classify as RANKING."""
    from cutter_engine import parse_datamap_from_rows, QuestionType
    from cutter_engine import detect_type
    rows = [
        ("[Q3]: Order these", None, None),
        ("Values: 1-3", None, None),
        (None, "1", "Rank 1"),
        (None, "2", "Rank 2"),
        (None, "3", "Rank 3"),
        (None, "[Q3r1c1]", "A"),
        (None, "[Q3r1c2]", "B"),
        (None, "[Q3r1c3]", "C"),
        (None, None, None),
    ]
    blocks = parse_datamap_from_rows(rows)
    qtype, scale = detect_type(blocks[0])
    assert qtype == QuestionType.RANKING
    assert scale == (1, 3)


def test_frankly_not_ranking():
    """Word-boundary regex should NOT match 'rank' inside 'frankly'."""
    from cutter_engine import parse_datamap_from_rows, detect_type, QuestionType
    rows = [
        ("[Q4]: Frankly, how do you feel?", None, None),
        ("Values: 1-5", None, None),
        (None, "[Q4r1c1]", "A"),
        (None, "[Q4r1c2]", "B"),
        (None, None, None),
    ]
    blocks = parse_datamap_from_rows(rows)
    qtype, _ = detect_type(blocks[0])
    assert qtype == QuestionType.GRID_RATED
