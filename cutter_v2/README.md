# Cutter v2 — Survey Cutter Automation

A focused Python tool that turns a **clean raw-data file** plus a
**spec-compliant datamap** into a Bain-style cuts workbook.

Built to match the reference output:
`Survey cutter automation/Survey insight engine runnable/260223_CE_Growth Agenda 2026_cutter_v11 (1).xlsx`

## Design principles (the things that fix v1's chaos)

1. **Datamap is the single source of truth.** Every raw column must be
   declared in the datamap (or be in the standard metadata allowlist).
   Undeclared columns produce a hard warning — they are not auto-classified.
2. **Helpers are out of scope.** Helper columns are a post-cutter analyst
   activity. The tool never sees them, classifies them, or surfaces them.
3. **Single cuts are automatic.** Every analysis-eligible question gets a
   single cut. No selection step needed.
4. **Cross cuts are dynamic.** Picked in the UI per run by selecting any
   two questions. Table dimensions adjust to the actual option counts of
   the two picked questions — no fixed rows or columns.
5. **No AI dependencies.** Pure pandas + openpyxl. No Portkey, no LLM calls,
   no `.env` required.
6. **Output mirrors the reference file format:**
   - `Output>>` divider
   - Theme sheets (Global Filters block at top + question-by-question cuts)
   - `Mapping>>` divider + `Datamap` + `Validation`
   - `Data>>` divider + `Raw data`

## Datamap format

See [`../Survey cutter automation/Survey insight engine runnable/docs/DATAMAP_SPEC.md`](../Survey%20cutter%20automation/Survey%20insight%20engine%20runnable/docs/DATAMAP_SPEC.md).

Reference sample workbook:
[`../Survey cutter automation/Survey insight engine runnable/docs/sample_datamap_and_rawdata.xlsx`](../Survey%20cutter%20automation/Survey%20insight%20engine%20runnable/docs/sample_datamap_and_rawdata.xlsx)

## Folder layout

```
cutter_v2/
├── README.md                 (this file)
├── requirements.txt
├── app.py                    Streamlit entry — port 8503
├── .streamlit/config.toml
└── core/
    ├── __init__.py
    ├── models.py             Frozen dataclasses: QuestionSpec, SurveySchema, Cut...
    ├── datamap_parser.py     Reads the spec format → list of question blocks
    ├── classifier.py         Maps each block → QuestionType per spec rules
    ├── validator.py          Checks raw ↔ datamap, produces hard warnings
    ├── single_cut.py         Per-question single cuts
    ├── cross_cut.py          Dynamic cross-cuts (table sized from option counts)
    ├── theme_grouper.py      Group questions into theme sheets
    └── exporter.py           Builds the Bain-style output workbook
```

## How to run (when complete)

```powershell
cd cutter_v2
..\.venv\Scripts\streamlit.exe run app.py
# opens at http://localhost:8503
```

## Status

**Phase 1 (in progress):** parser + validator + classifier proven on sample.
Phase 2 (next): UI + exporter.
