# Survey Cutter Tool

A spec-driven survey cutter that turns a bracketed datamap + raw survey data into a Bain-style cuts workbook.

## Repository layout

`
cutter_v2/                     # the engine (pure Python, no UI)
  core/
    question_type_detector.py  # SWAP-POINT for type identification
    datamap_parser.py          # strict bracketed-format parser + state machine
    classifier.py              # ParsedBlock -> QuestionSpec orchestration
    single_cut.py              # per-type cut computers
    cross_cut.py               # dynamic row x col matrix engine
    exporter.py                # Excel workbook writer (formulas + helpers)
    theme_grouper.py           # Q-ID-range routing
    validator.py               # datamap <-> raw data cross-check
    models.py                  # frozen dataclasses (public contracts)
  CUTS_FRAMEWORK.md            # cut shapes catalog (S1..S11) + Phase 1/2 scope
  QUESTION_TYPES_REFERENCE.md  # engine internals reference
  DATAMAP_SPEC.md              # required datamap format

cutter_v3/                     # Reflex frontend (wizard UI on top of cutter_v2)
  cutter_v3/
    state.py                   # global reactive state, event handlers
    components/
      shell.py                 # navbar + busy banner
    pages/
      upload.py                # drop-a-file + parse
      validate.py              # schema + validation view
      themes.py                # theme + filter picker
      crosscuts.py             # cross-cut builder
      generate.py              # build + download
    cutter_v3.py               # app entry (routes)
  rxconfig.py                  # Reflex config (ports 3003 / 8003)
`

## The engine is a clean module

`cutter_v2/core/` is intentionally UI-free. It can be:
- Imported directly by `cutter_v3` (current setup)
- Wrapped in a FastAPI service (future architecture)
- Called from a notebook / CI job
- Packaged and pip-installed independently

The public contract lives in `models.py` (`ParsedBlock`, `QuestionSpec`, `SurveySchema`, `CrossCutResult`…). Everything else in `core/` implements against those types.

## Datamap format contract

The parser only accepts bracketed headers: `[Q1]: text`. See `cutter_v2/DATAMAP_SPEC.md` for the full contract. Non-bracketed input is rejected with a clean error pointing at the cleaning step.

## Running Cutter v3 (Reflex) locally

Requires Python 3.12+ and Node.js 22+.

`powershell
cd cutter_v3
python -m venv .venv
.venv\Scripts\activate
pip install reflex openpyxl pandas
reflex run
`

Open http://localhost:3003.

## What's in scope (Phase 1)

- 10 question types detected + cut per type (single, multi, grid, NPS, ranking, direct-numeric, etc.)
- Global-filter block with VLOOKUP label -> code translation
- Cross-cut engine with row-and-column support for grid/ranking/numeric-allocation
- Ranking blocks laid out as ranks x options matrix
- Multi-select and ranking use a per-question `_q_sum_<col_id>` helper column for correct base counts
- Cross-cut sheets show `# of respondents` grouped, then `% of respondents` grouped (base = column total)
- Master Check cell + IFERROR wrapping throughout

## What's out of scope (Phase 2 — deferred)

- WLO segmentation (Winners / Laggards / Others)
- Blacklist criteria filter
- MPPM-style category filters
- Explicit-format datamap (declared `Type: ranking` lines) — will replace heuristic detection when introduced
- Theme sheet preset duplicates
- Word Cloud / verbatim analysis

## Docs

- [`cutter_v2/CUTS_FRAMEWORK.md`](cutter_v2/CUTS_FRAMEWORK.md) — cut shape catalog + Phase 1 scope
- [`cutter_v2/QUESTION_TYPES_REFERENCE.md`](cutter_v2/QUESTION_TYPES_REFERENCE.md) — engine internals (dispatch tables, function signatures)
- [`cutter_v2/DATAMAP_SPEC.md`](cutter_v2/DATAMAP_SPEC.md) — datamap format contract
