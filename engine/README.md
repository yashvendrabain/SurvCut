# cutter-engine

The spec-driven survey cutter engine — pure Python, framework-agnostic, no UI. Parses a bracketed datamap + a raw survey DataFrame and produces classified questions, computed cuts, and an Excel workbook.

## Install (editable, from monorepo root)

`ash
pip install -e ./engine
`

Or as a wheel:

`ash
cd engine
pip install .
`

## Quick start

`python
import pandas as pd
from cutter_engine import (
    parse_datamap, classify,
    compute_single_cut, compute_cross_cut,
    export, ExportInputs, suggest_themes, validate,
    FilterSlot,
)

# 1. Parse the datamap (bracketed format required)
blocks = parse_datamap("survey.xlsx", sheet_name="Datamap")

# 2. Classify: parsed blocks + raw DataFrame -> typed SurveySchema
raw_df = pd.read_excel("survey.xlsx", sheet_name="Raw data")
schema = classify(blocks, raw_df)

# 3. Validate the datamap <-> raw data alignment
report = validate(blocks, raw_df)
if report.has_errors:
    raise RuntimeError(report.issues)

# 4. Compute a single cut (Python-side preview)
q = schema.by_column_id("Q4_Employees")
cut = compute_single_cut(q, raw_df)
for row in cut.rows:
    print(row.label, row.count, row.pct)

# 5. Compute a cross-cut matrix
xcut = compute_cross_cut(
    schema.by_column_id("Q22"),   # row (multi-select works)
    schema.by_column_id("Q23"),   # col (single-select works)
    raw_df,
)

# 6. Build the Excel workbook
themes = suggest_themes(schema)
filters = [FilterSlot(name="Q7_Sector", column_id="Q7_Sector")]
inputs = ExportInputs(
    schema=schema, raw_df=raw_df,
    datamap_rows=[...],  # the parsed rows again
    themes=themes, filters=filters, cross_cuts=[xcut],
)
export(inputs, "output.xlsx")
`

## Architecture

Every layer is a leaf module with a stable contract in `models.py`:

- `question_type_detector` — the SWAP-POINT for how types are identified.
  Replace this module (same `detect_type(block)` signature) to move from
  heuristic to explicit-format detection.
- `datamap_parser` — strict bracketed-header state machine.
- `classifier` — orchestrates parse -> detect -> eligibility -> `QuestionSpec`.
- `single_cut` — per-type Python computers (previews).
- `exporter` — Excel writer with live COUNTIFS / SUMIFS formulas.
- `cross_cut` — dynamic matrix engine (row and col support for every type).
- `validator` — datamap <-> raw data mutual cross-check.

The engine has no HTTP, no filesystem writes beyond `export()`, no
GUI dependencies. Suitable for embedding in an API, a job worker, a
Jupyter notebook, or a CLI.

## Testing

`ash
cd engine
pip install -e ".[dev]"
pytest -q
`

## Docs

For the full cut-shape catalog, ranking detection rules, filter machinery, and
adding-a-new-type checklist, see the top-level [`docs/`](../docs) directory:

- `CUTS_FRAMEWORK.md`
- `QUESTION_TYPES_REFERENCE.md`
- `DATAMAP_SPEC.md`
