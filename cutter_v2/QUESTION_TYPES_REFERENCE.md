# Question Types & Cuts — Internal Reference

How the cutter detects question shapes, picks the right cut, lays them out in
Excel, and computes cross-cuts. Every decision point and dispatch table is
documented here so adding a new question type or fixing a bad classification
has a known starting point.

This document maps **what's in the code right now** (not the future spec —
that lives in [`CUTS_FRAMEWORK.md`](CUTS_FRAMEWORK.md)).

---

## 0. End-to-end data flow

```
                    cutter_v3 wizard
                    (Reflex frontend)
                            │
                            ▼
   user uploads .xlsx ──► io_layer.load_combined()
                            │
                            ▼
                     ┌─────────────────┐
                     │   Datamap rows  │  list[(col_a, col_b, col_c)]
                     └────────┬────────┘
                              │
                              ▼
                  datamap_parser.parse_datamap*()
                       state machine
                              │
                              ▼
                     ┌─────────────────┐
                     │  ParsedBlock[]  │  raw shape per question
                     └────────┬────────┘
                              │
                              ▼
                  classifier.classify()                     ◄── decision tree
                       per-block rules
                              │
                              ▼
                     ┌─────────────────┐
                     │  SurveySchema   │  classified QuestionSpec[]
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      validator.validate  single_cut    cross_cut
      (cross-check)       .compute_*   .compute_cross_cut
              │               │               │
              ▼               ▼               ▼
       ValidationReport  SingleCutResult  CrossCutResult
                              │               │
                              └──────┬────────┘
                                     ▼
                            exporter.export()
                            theme sheet writers
                                     │
                                     ▼
                                cuts.xlsx
```

Every named module above lives in `cutter_v2/core/`. Reflex (`cutter_v3/`)
imports them as `from core.* import …` after path-bootstrapping `cutter_v2/`
onto `sys.path`.

---

## 1. The 10 question types

Defined in [`core/models.py:QuestionType`](core/models.py).

| Type | Enum value | Sub-cols? | Shape | Cell semantics |
|---|---|---|---|---|
| `SINGLE_SELECT` | `single_select` | no | 1 column, N options | one option code per respondent |
| `BINARY_TWO_OPTIONS` | `binary_two_options` | no | 1 column, 2 options (0/1) | 0 or 1 |
| `MULTI_SELECT_BINARY` | `multi_select_binary` | yes | N sub-cols, each 0/1 | one binary per sub-col |
| `GRID_RATED` | `grid_rated` | yes | N sub-cols × scale `[lo, hi]` | numeric per sub-col |
| `GRID_SINGLE_SELECT` | `grid_single_select` | yes | same shape as GRID_RATED — classifier collapses to GRID_RATED today | numeric per sub-col |
| `NUMERIC_ALLOCATION` | `numeric_allocation` | yes | N sub-cols summing ~100 | percent allocation per sub-col |
| `NPS` | `nps` | no | 1 column, 0-10 scale | integer 0-10 |
| `DIRECT_NUMERIC` | `direct_numeric` | no | 1 column, open numeric | free number |
| `RANKING` | `ranking` | yes | N sub-cols, each a rank 1..K | integer rank |
| `OPEN_TEXT` | `open_text` | no | 1 column, free text | string |
| `METADATA` | `metadata` | no | metadata allowlist | passthrough |
| `UNKNOWN` | `unknown` | – | unclassifiable | excluded from analysis |

`OPEN_TEXT`, `METADATA`, `UNKNOWN` are **not analysis-eligible** —
they're skipped by every cut and exporter.

---

## 2. Parser → ParsedBlock

[`core/datamap_parser.py`](core/datamap_parser.py) reads cols A/B/C of the
Datamap sheet and emits one `ParsedBlock` per question. State machine has
three states:

```
        ┌──────────────────┐
        │ BETWEEN_BLOCKS   │  ◄── start; waiting for "[col_id]: text" in col A
        └────────┬─────────┘
                 │  header row seen
                 ▼
        ┌──────────────────┐
        │ EXPECT_TYPE_HINT │  ◄── waiting for "Values: M-N" / "Open …" in col A
        └────────┬─────────┘
                 │  type hint seen
                 ▼
        ┌──────────────────┐
        │ IN_OPTIONS       │  ◄── consuming option rows (col B = code or [SubColID])
        └────────┬─────────┘
                 │  blank row → flush + reset
                 ▼
        BETWEEN_BLOCKS
```

### 2.1 Recognised row patterns

| Col A | Col B | Col C | Meaning |
|---|---|---|---|
| `[id]: text` | – | – | Header row, starts new block |
| `[id]:` | – | – | Header row with empty text (allowed) |
| `Values: M-N` | – | – | Type hint: numeric range |
| `Open numeric response` | – | – | Type hint: open numeric |
| `Open text response` | – | – | Type hint: open text |
| `>>…` or `# …` or `Section: …` | – | – | Section divider / comment (skipped) |
| (blank) | integer code | label | Option row (scale_options) |
| (blank) | `[sub_id]` | label | Sub-column declaration |
| (blank) | `[sub_id]` | `[pipe: helper_col]` | Piped sub-row (see §10) |
| (all blank) | | | Block separator |

### 2.2 ParsedBlock fields

```python
ParsedBlock(
    column_id: str,                            # bracket id from header row
    question_text: str,                        # text after the colon
    type_hint: str,                            # raw "Values: …" line
    scale_options: tuple[(code, label), …],    # option rows
    sub_columns: tuple[(sub_id, label), …],    # [sub_id] rows
    pipe_sources: tuple[(sub_id, helper), …],  # parsed [pipe: helper] markers
    source_row_in_datamap: int,                # for error messages
    warnings: tuple[str, …],
)
```

---

## 3. Classifier → QuestionSpec  (and the type-detection swap-point)

> **Swap-point** — all type identification lives in [core/question_type_detector.py](core/question_type_detector.py).
> The classifier itself does not contain regex constants or heuristics anymore — it
> imports detect_type(block) -> (QuestionType, scale_range) and calls it once per
> parsed block. To replace heuristic detection with an explicit-format scheme
> (e.g. a Type: ranking line in the datamap), you only need to swap that one module.


[`core/classifier.py:classify()`](core/classifier.py) takes the
`list[ParsedBlock]` plus the raw `DataFrame` and emits a `SurveySchema`. Per
block, `_decide_type()` runs an 8-rule decision tree on the `type_hint` and
sub-column presence.

### 3.1 Decision tree (current code)

```
INPUT: type_hint string, has_subs (bool), question_text

Rule 1 — Open numeric
  if hint matches "^Open numeric response$"  ───► DIRECT_NUMERIC

Rule 2 — Open text
  if hint matches "^Open text response$"     ───► OPEN_TEXT

Rule 3 — Parse "Values: M-N"
  match = VALUES_RANGE_RE.match(hint)
  if no match                                 ───► UNKNOWN
  lo, hi = int(match.group(1)), int(match.group(2))

Rule 4 — NPS  (PROMOTE — not a hard requirement)
  if (lo, hi) == (0, 10)
     AND question_text contains "nps" or "recommend"
     AND not has_subs                         ───► NPS (gets 3-bucket layout)
  # If keyword is absent, the 0-10 single-column question simply falls
  # through to Rule 9 (SINGLE_SELECT) — that's the safe fallback. Both
  # outputs are valid; NPS just adds Promoter/Passive/Detractor bucketing.

Rule 5 — Numeric allocation
  if (lo, hi) == (0, 100) AND has_subs        ───► NUMERIC_ALLOCATION

Rule 6 — Multi-select binary
  if (lo, hi) == (0, 1) AND has_subs          ───► MULTI_SELECT_BINARY

Rule 7 — Binary two-options
  if (lo, hi) == (0, 1) AND not has_subs      ───► BINARY_TWO_OPTIONS

Rule 8 — Ranking vs Grid (datamap-driven signals only)

  Rule 8a — Ranking detection via _is_ranking_question(block)
    Returns True if EITHER:
      Signal A: RANKING_TEXT_RE  =  \branke?\w*\b  (case-insensitive)
                matches the question_text — i.e. "rank" / "ranks" /
                "ranked" / "ranking" appears as a whole word. Word-boundary
                regex avoids false positives like "frankly" / "outranking".
      Signal B: RANK_LABEL_RE  =  ^\s*rank\s+\d+\s*$  (case-insensitive)
                matches AT LEAST 2 of the option_map labels. Real surveys
                that use this pattern declare options like:
                    1  Rank 1
                    2  Rank 2
                    3  Rank 3
                ... which is a definitive structural signal of rank
                positions (not a Likert scale).

    if has_subs AND _is_ranking_question(block)  ───► RANKING

  Rule 8b — Grid rated (Likert)
    if has_subs AND lo == 1                    ───► GRID_RATED

  Rule 8c — Generic grid (any other signed/positive range with sub-cols)
    if has_subs                                ───► GRID_RATED
    # Catches Q13-class (Values: -50-100 etc.)

  REMOVED — the old numeric heuristic
    Previous logic: if hi >= 6 AND hi >= n_subs - 1 → RANKING.
    Dropped because it false-positived on Likert-7 grids with few rows
    (hi=7, n_subs=5 matched the criteria) and silently missed all
    "rank top K of N" patterns where K < 6.

Rule 9 — Single-select default
  if not has_subs                             ───► SINGLE_SELECT

Fallback — should never trigger after rule 8c
                                              ───► UNKNOWN
```

### 3.2 Post-classification rules

After `_decide_type()` returns:

```
if column_id ∈ METADATA_ALLOWLIST           → type = METADATA, ineligible
elif type == OPEN_TEXT                       → ineligible (no cuts on free text)
elif type == UNKNOWN                         → ineligible (reason captured)
else                                          → eligible (analysis_eligible=True)
```

`METADATA_ALLOWLIST` (in `models.py`):
```python
{"record", "uuid", "date", "start_date", "status",
 "termReason", "nx", "hSample", "markers"}
```

### 3.3 `is_demographic` flag

Set by keyword matching on `question_text` (case-insensitive):
```python
DEMOGRAPHIC_KEYWORDS = (
    "industry", "sector", "region", "country", "geography", "size",
    "employees", "headcount", "revenue", "function", "department",
    "role", "seniority", "tier", "company", "organisation",
    "organization", "vertical", "segment", "market", "age", "gender",
    "title",
)
```

**Phase 1 IMPORTANT**: This flag is **informational only**. It used to drive
auto-routing of questions to a Demographics sheet — that behaviour was
removed (see `theme_grouper.py` change). Demographics is now wizard-driven
(Phase 2).

### 3.4 QuestionSpec contract

```python
QuestionSpec(
    column_id: str,                            # parent id (e.g. "Q4_Employees")
    question_text: str,
    question_type: QuestionType,
    raw_columns: tuple[str, …],                # the actual columns in raw data
                                                # = (column_id,) for non-grid,
                                                # = (sub_id_1, sub_id_2, …) for grid/multi/ranking
    option_map: dict[code → label],            # scale_options as dict
    sub_column_labels: dict[raw_col_id → label],
    scale_range: tuple[lo, hi] | None,
    is_metadata: bool,
    is_demographic: bool,
    analysis_eligible: bool,
    exclusion_reason: str,
    source_row_in_datamap: int,
)
```

`raw_columns` is the single most important field — every downstream
consumer (cuts, exporter, cross-cut) reads it to know which DataFrame
column(s) to operate on.

---

## 4. Single-cut computation per type

[`core/single_cut.py`](core/single_cut.py) dispatches by `question_type` to
one of 8 computer functions:

```python
_DISPATCH = {
    QuestionType.SINGLE_SELECT:        _single_select,
    QuestionType.BINARY_TWO_OPTIONS:   _binary_two_options,    # delegates to _single_select
    QuestionType.MULTI_SELECT_BINARY:  _multi_select_binary,
    QuestionType.GRID_RATED:           _grid_rated,
    QuestionType.GRID_SINGLE_SELECT:   _grid_rated,            # same handler
    QuestionType.NUMERIC_ALLOCATION:   _numeric_allocation,
    QuestionType.NPS:                  _nps,
    QuestionType.RANKING:              _ranking,
    QuestionType.DIRECT_NUMERIC:       _direct_numeric,
}
```

Every handler takes `(QuestionSpec, df) -> SingleCutResult` with `rows`
holding `CutRow(label, count, pct)` tuples.

### 4.1 Per-type semantics

| Handler | raw cols used | rows shape | CutRow.count | CutRow.pct |
|---|---|---|---|---|
| `_single_select` | `raw_columns[0]` | one row per option in declared order; undeclared codes appended with "(undeclared)" tag | # respondents with this code | % of valid_n |
| `_binary_two_options` | (delegates to single_select) | – | – | – |
| `_multi_select_binary` | all sub-cols | one row per sub-col | # respondents who picked this option (sub-col == 1) | % of respondents who answered any sub-col |
| `_grid_rated` | all sub-cols | one row per sub-col | per-row valid_n | **mean** rating (semantics: pct is overloaded to hold mean) |
| `_numeric_allocation` | all sub-cols | one row per sub-col | per-row valid_n | mean of the numeric allocation |
| `_nps` | `raw_columns[0]` | 3 fixed rows: Promoters / Passives / Detractors | bucket count | bucket % |
| `_ranking` (Python preview) | all sub-cols | one row per sub-col | # respondents ranking item in top-3 | % top-3 |
| `_write_ranking_block` (Excel output) | all sub-cols | ranks × options matrix (1..K columns) | count of respondents giving that option that rank | base via `_q_sum_<col_id>` helper |
| `_direct_numeric` (Python preview) | `raw_columns[0]` | 5 fixed rows: Mean/Median/StdDev/Min/Max | n | statistic value |
| `_write_direct_numeric_block` (Excel output) | `raw_columns[0]` | 1 row: Mean only | — | mean value |

**Headline metric** populated for NPS (`NPS: +42`), grid (`Avg mean: 3.7`),
direct numeric (`Mean: 23.4`), multi-select (`6 options`), ranking
(`% ranked top-3`).

### 4.2 Error handling

Every handler is wrapped in `try / except`:
```python
try:
    return fn(question, df)
except Exception as exc:
    return SingleCutResult(... warnings=(f"{type(exc).__name__}: {exc}",))
```

A failed cut never crashes the run — it produces an empty result with the
exception text as a warning.

---

## 5. Excel block writers (exporter)

[`core/exporter.py`](core/exporter.py) per-theme-sheet layout:

```
Row 1:   Master Check / TRUE                          ◄── universal sanity flag
Row 2:   Global Filters (section title)
Row 3:   filter 1 label / value-cell / (formula ref)  ◄── DataValidation list dropdown
Row 4:   filter 2
…
Row 14:  filter 12 (max 12 in Phase 1)
Row 17:  first question's header                       ◄── _write_question_cut
…
```

`_write_question_cut` dispatches on `question_type`:

```python
if qt == SINGLE_SELECT:           → _write_single_select_block
elif qt == BINARY_TWO_OPTIONS:    → _write_single_select_block   (same shape)
elif qt == MULTI_SELECT_BINARY:   → _write_multi_select_block
elif qt == GRID_RATED:            → _write_grid_rated_block
elif qt == NUMERIC_ALLOCATION:    → _write_numeric_alloc_block
elif qt == NPS:                   → _write_nps_block
elif qt == RANKING:               → _write_ranking_block
elif qt == DIRECT_NUMERIC:        → _write_direct_numeric_block
else:                              → "(question type X not yet implemented)" warning
```

**No exporter for `OPEN_TEXT` / `METADATA` / `GRID_SINGLE_SELECT` /
`UNKNOWN`** — they're routed to the warning fallback. (`GRID_SINGLE_SELECT`
in practice is collapsed to `GRID_RATED` by the classifier so never reaches
here.)

### 5.1 Block writer signatures

All seven take the same arguments:

```python
def _write_X_block(ws, q, start_row, filter_refs,
                   raw_col_to_letter, raw_sheet_name, n_raw_rows) -> int:
    ...
    return next_free_row
```

`filter_refs` is the `(FilterSlot, "$C${row}", lookup_range_or_None)`
3-tuple list built by `_write_theme_sheet` (Phase 1.9). Each writer calls
`_filter_clause(filter_refs, …)` to produce the COUNTIFS filter-tail string
that gets appended to every count formula on that sheet.

### 5.2 Per-block layout summary

**`_write_single_select_block`** (also serves BINARY_TWO_OPTIONS):

```
A                            B                     C
Option                       Count                 %                ← header
<option_label_1>             =IFERROR(COUNTIFS…)   =IFERROR(B/total)
<option_label_2>             =IFERROR(COUNTIFS…)   =IFERROR(B/total)
…
Total                        =COUNTIFS("<>" filter) =SUM(percents)
```

`%` formula in the total row is `=IFERROR(SUM(C{first}:C{last}), 0)`. If
there are zero options declared, the % cell is left blank (avoids the
reversed-range circular-reference bug fixed earlier).

**`_write_multi_select_block`**:

```
A                            B                     C
Option                       # Selected            % of Base        ← header
<sub_col_label_1>            =COUNTIFS(sub1=1)     =B/base
<sub_col_label_2>            =COUNTIFS(sub2=1)     =B/base
…
Base (any answered)          =SUMPRODUCT-ish        (blank)
```

**`_write_grid_rated_block`**:

```
A                            B                     C
Item                         Mean                  (blank)          ← header
<sub_col_label_1>            =AVERAGEIFS(sub1)     (blank)
<sub_col_label_2>            =AVERAGEIFS(sub2)     (blank)
```

**`_write_nps_block`**: 3 rows (Promoters/Passives/Detractors) + a derived
NPS score row using `pct_promoter*100 - pct_detractor*100`.

**`_write_ranking_block`**: ranks × options matrix.
- Header: `Item` in col A, then `Rank 1`, `Rank 2`, …, `Rank K` across columns B..(B+K-1).
- One body row per sub-col (option). Cell at (option row, rank col) = `COUNTIFS(sub_col, rank_value, filters)`.
- Final row: `Base (any rank)` with `COUNTIFS(_q_sum_<col_id>, ">0", filters)`.

**`_write_numeric_alloc_block`**: 1 row per sub-col, AVERAGEIFS on values >0.

**`_write_direct_numeric_block`**: 1 row, `Mean` only. Median/StdDev/Min/Max dropped per spec.

---

## 6. Filter machinery

### 6.1 Filter pass-through formula

Every COUNTIFS / SUMIFS / AVERAGEIFS appends a filter tail built by
`_filter_clause()`:

```
'Raw data'!$<col>$2:$<col>$N, IF($C${row}="All","<>",
    IFERROR(VLOOKUP($C${row}, Validation!$B$X:$C$Y, 2, FALSE), $C${row}))
```

Components:

| Piece | Why |
|---|---|
| `IF($C${row}="All", "<>", …)` | When dropdown is "All", criterion becomes `"<>"` (any non-blank). Works for text AND numeric columns (the `"*"` wildcard only matched text). |
| `VLOOKUP($C${row}, lookup_range, 2, FALSE)` | When dropdown is a specific label, translate that label back to the underlying numeric code so COUNTIFS can match the raw data. |
| `IFERROR(…, $C${row})` | If VLOOKUP fails (label not in lookup), fall back to comparing the cell value directly. Defensive — won't break the whole formula. |

### 6.2 Validation sheet (the lookup source)

`_write_validation_sheet` (exporter.py) writes one 2-column block per
single-select question:

```
Col A                       Col B (label)              Col C (code)
[Q-id] — question text…     (section header)
                            All                        (blank)
                            <option label 1>           <code 1>
                            <option label 2>           <code 2>
                            …
(blank row separator)
```

Returns `dict[column_id → (label_range, lookup_range)]`:
- `label_range` = `"Validation!$B$X:$B$Y"` — points to label-only column,
  used as the DataValidation dropdown source
- `lookup_range` = `"Validation!$B$X:$C$Y"` — 2-column block, used inside
  the VLOOKUP

### 6.3 Theme-sheet filter rows wiring

`_write_theme_sheet` for each filter slot:
1. Writes `f.name` in col B (e.g. "Q4_Employees")
2. Writes `f.default_value` ("All") in col C — this cell is what the
   COUNTIFS formulas reference
3. If `filter_validation_ranges.get(f.column_id)` exists:
   - Attaches a `DataValidation(type="list", formula1=label_range)` to the
     C-column cell → dropdown
   - Stores `lookup_range` in the 3-tuple of `filter_cell_refs`
4. The 3-tuple `filter_cell_refs` is passed to every block writer, which
   passes it to `_filter_clause`.

---

## 7. Cross-cut engine

[`core/cross_cut.py`](core/cross_cut.py) has a deliberately asymmetric
architecture:

```
compute_cross_cut(row_q, col_q, df)
    │
    ├─► row dimension via "_categorise(row_q)"
    │     - Single-select / Binary / NPS / Multi-select  ⇒ supported as ROW
    │     - Grid / Numeric / Ranking                     ⇒ NOT supported as row
    │       (return _empty_result with warning)
    │
    └─► cell value via "_CELL_FN_BY_COL_TYPE[col_q.type]"
          - Single-select / Binary  ⇒  _cell_counts_single   (counts)
          - Multi-select binary     ⇒  _cell_counts_multi    (counts of selections)
          - NPS                     ⇒  _cell_counts_nps      (counts in NPS buckets)
          - Direct numeric          ⇒  _cell_means_numeric   (mean per row category)
          - Numeric allocation      ⇒  _cell_means_grid      (mean per (row, sub-col))
          - Grid rated              ⇒  _cell_means_grid      (mean per (row, sub-col))
          - Ranking                 ⇒  _cell_pct_ranking     (% top-3 per (row, sub-col))
```

### 7.1 Compatibility matrix

| ROW \\ COL | SINGLE_SELECT | BINARY_TWO_OPT | MULTI_SELECT | NPS | DIRECT_NUMERIC | NUMERIC_ALLOC | GRID_RATED | RANKING | OPEN_TEXT | METADATA |
|---|---|---|---|---|---|---|---|---|---|---|
| **SINGLE_SELECT** | counts | counts | counts | counts | mean | grid means | grid means | %top-3 | ✗ | ✗ |
| **BINARY_TWO_OPTIONS** | counts | counts | counts | counts | mean | grid means | grid means | %top-3 | ✗ | ✗ |
| **MULTI_SELECT** | counts | counts | counts | counts | mean | grid means | grid means | %top-3 | ✗ | ✗ |
| **NPS** | counts | counts | counts | counts | mean | grid means | grid means | %top-3 | ✗ | ✗ |
| **DIRECT_NUMERIC** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

| **GRID_RATED** | counts | counts | counts | counts | mean | grid means | grid means | %top-3 | ✗ | ✗ |
| **RANKING** | counts | counts | counts | counts | mean | grid means | grid means | %top-3 | ✗ | ✗ |
| **NUMERIC_ALLOC** | counts | counts | counts | counts | mean | grid means | grid means | %top-3 | ✗ | ✗ |
| **OPEN_TEXT** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **METADATA** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

`✗` means `_categorise` returns `None` and the engine emits an empty result
with `"cannot categorise row question of type X"`.

**Multi-column rows (GRID_RATED / RANKING / NUMERIC_ALLOCATION):** the row
dimension expands into one row per sub-column. A respondent contributes to
every sub-column they engaged with — engagement is defined per type:

- GRID_RATED row → engaged when the sub-col value is non-null (any rating).
- RANKING row → engaged when the sub-col value is `>= 1` (rank assigned).
- NUMERIC_ALLOCATION row → engaged when the sub-col value is `> 0`.

Same respondent can appear in many row categories simultaneously. Cell
semantics still come from the COLUMN type (counts / mean / grid mean / %top-3).

### 7.2 Phase 2 sub-row granularity

When the dropdown picks a sub-row of a grid (e.g. `Q13|Q13r1c1`),
`AppState._resolve_xcut_qid()` (in `cutter_v3/state.py`) **synthesises a
single-column QuestionSpec** for that sub-col:

```python
QuestionSpec(
    column_id      = sub_col,             # "Q13r1c1"
    question_text  = f"{parent.column_id}/{sub_col}: {sub_label}",
    question_type  = DIRECT_NUMERIC  if parent was GRID_RATED
                      | NUMERIC_ALLOCATION
                     BINARY_TWO_OPTIONS if parent was MULTI_SELECT_BINARY
                      | RANKING
                     DIRECT_NUMERIC otherwise,
    raw_columns    = (sub_col,),
    option_map     = {},
    scale_range    = parent.scale_range,
    analysis_eligible = True,
    …
)
```

That synthetic spec is then fed to `compute_cross_cut` like any other
question. Effect: a grid sub-row crosses against another question as a
DIRECT_NUMERIC (computes mean per row category), and a multi-select
sub-col crosses as BINARY_TWO_OPTIONS (counts per row category).

### 7.3 Categoriser details (the `_categorise` function)

| Question type as ROW | What `_categorise` returns | Row labels (ordered) |
|---|---|---|
| `SINGLE_SELECT`, `BINARY_TWO_OPTIONS` | `[option_label]` per respondent (length 1 or 0 if missing) | datamap-declared option labels |
| `MULTI_SELECT_BINARY` | `[label_1, label_2, …]` per respondent (length = # selected sub-cols) | sub-column labels in declared order |
| `NPS` | `["Promoters (9-10)"]` / `["Passives (7-8)"]` / `["Detractors (0-6)"]` | fixed 3 buckets |
| anything else | `None` → empty result | – |

A respondent can land in **multiple** row categories simultaneously (the
multi-select case). Counts are incremented for every matching row category.

### 7.4 Cell function details

`_cell_counts_single` and `_cell_counts_multi`: dictionary of dictionaries
`{row_label: {col_label: count}}` accumulated by iterating respondents.

`_cell_means_grid`: per (row_category, sub_col_label), maintain `sum` and
`n` separately, divide at the end. NaN values are skipped.

`_cell_means_numeric`: returns a single-column "Mean" matrix (the
4-row "Mean / Median / Min / Max" header in `_ordered_categories` is
collapsed to just Mean — the function explicitly ignores the others).

`_cell_pct_ranking`: two-pass. First pass counts respondents per row
category as the BASE. Second pass counts top-3 picks per sub-col. The
final percent is `count / base * 100`.

---

## 8. Validator — raw ↔ datamap cross-check

[`core/validator.py:validate()`](core/validator.py) is the bracket-validator
contract enforcer:

```
raw_columns          = set of raw data sheet headers
declared_columns     = set of every column the datamap claims
                       (sub-col ids for multi-col blocks, column_id otherwise)

raw_undeclared       = raw_columns - declared_columns - METADATA_ALLOWLIST
datamap_missing      = declared_columns - raw_columns
```

Output:

| Code | Level | Meaning |
|---|---|---|
| `PARSER_WARNING` | WARN | Parser noticed something (missing blank-row separator, unrecognised type hint, etc.) |
| `RAW_COL_UNDECLARED` | WARN | A column in raw data has no datamap declaration — analyst helper column or data-prep miss |
| `DATAMAP_COL_MISSING_IN_RAW` | ERROR | Datamap claims a column the raw data doesn't have — hard error, refuses to export |

`format_report(report)` returns a human-readable text block surfaced in the
Validate page of the wizard.

---

## 9. Theme routing — current behaviour

[`core/theme_grouper.py:suggest_themes()`](core/theme_grouper.py):

```
1. Drop everything ineligible (metadata, open text, unknown)
2. Group remaining questions by floor((q_num - 1) / block_size)
   where block_size defaults to 10
   so Q1..Q10 → group 0, Q11..Q20 → group 1, …
3. For each group, mine a 2-word topic from the question texts (keyword
   counter with stopword filter)
4. Sheet name: f"Q{first}-Q{last} · {topic}"  truncated to 31 chars
5. Anything without a numeric prefix goes to a single "Other" sheet
```

No `is_demographic` short-circuit. **Demographics sheet is not auto-created.**

---

## 10. Piping detection

[`core/datamap_parser.py:PIPE_PATTERN`](core/datamap_parser.py) recognises
the `[pipe: helper_col]` marker in col C of a sub-row:

```python
PIPE_PATTERN = re.compile(r"^\[\s*pipe\s*:\s*(?P<helper>[^\]]+?)\s*\]\s*$",
                          re.IGNORECASE)
```

When matched, the parser stores `(sub_id, helper_col)` in
`ParsedBlock.pipe_sources`. Today this metadata is captured but **not yet
consumed** by any cut handler — it's the foundation for Phase 2 S5 layouts
(see `CUTS_FRAMEWORK.md` §4).

The `[pipe: …]` literal IS preserved in `sub_column_labels` so the cut
output shows the marker rather than silently swallowing it. The Phase 2
sub-row dropdown in `cutter_v3` rewrites it on the fly to
`"(piped from helper_col)"` for readability.

---

## 11. Where to look when something's wrong

| Symptom | First place to look |
|---|---|
| A question doesn't appear in any cut | `question_type_detector.detect_type()` — likely returning UNKNOWN. Add the type-hint rule there (classifier just delegates). |
| A question is in the wrong theme sheet | `theme_grouper.suggest_themes()` — block_size or naming heuristic |
| Cross-cut row dropdown missing a question | `eligible_options` in `cutter_v3/state.py` |
| Cross-cut returns empty / "cannot categorise" | `cross_cut._categorise()` — type not supported as row dimension |
| Cross-cut value column is wrong shape | `cross_cut._CELL_FN_BY_COL_TYPE[col_type]` |
| Filter shows only "All" / numbers go to 0 | `_filter_clause` in exporter.py — VLOOKUP wiring (Phase 1.9 fix) |
| Numbers in Excel all read as 0 despite formulas being present | `forceFullCalcOnLoad` set? Filter wildcard pattern `"<>"`? |
| Circular reference warning when opening output | `_write_single_select_block`'s SUM range when no options — should skip the % cell if `last_option_row < first_option_row` |
| Master Check is wrong | A1/B1 hardcoded to TRUE for now (Phase 1.4); per-block validation cells + AND() formula are Phase 1.8 |
| Datamap row not picked up | check bracketed format `[id]: text` — non-bracketed is rejected with row-N error message |
| Sub-rows of a grid not selectable individually in cross-cut | `_resolve_xcut_qid` in `cutter_v3/state.py` — synthetic spec creation |

---

## 12. Data structures cheatsheet

```python
# models.py — every public contract

CutRow(label, count, pct)
    # The fundamental row of any cut.
    # For numeric/grid types, `pct` is overloaded to carry the metric
    # (mean, median, etc.) — same field, different semantics by question type.

SingleCutResult(column_id, question_text, question_type, valid_n, missing_n,
                rows, headline_metric, warnings)
    # One question's single-dimension cut.

CrossCutResult(row_column_id, col_column_id, row_question_text,
               col_question_text, row_labels, col_labels, counts,
               row_totals, col_totals, grand_total, warnings)
    # Dynamic matrix sized by each axis's actual option count.
    # `counts` is tuple[tuple[float, …], …] regardless of value semantics;
    # `warnings` carries `"value_kind=mean"` etc. when cells aren't raw counts.

ValidationReport(raw_columns_count, declared_columns_count,
                 metadata_columns_count, raw_columns_undeclared,
                 datamap_columns_missing_in_raw, issues)

FilterSlot(name, column_id, default_value="All")
    # name = human-readable label shown in the filter block
    # column_id = which raw data column to filter on
    # default_value = the literal text in the cell (drives the IF passthrough)

ThemeGroup(name, question_column_ids)
    # name = sheet name (≤31 chars)
    # question_column_ids = list[str] of which questions land on this sheet
```

---

## 13. Adding a new question type — checklist

If a future survey introduces a new shape:

1. **`models.py`** — add the enum value to `QuestionType`.
2. **`question_type_detector.py`** — add a detection rule to `detect_type()` BEFORE
   the fallback. Decide what `scale_range` should look like for it.
   (`classifier.py` just calls `detect_type` and shouldn't need changes for new types.)
3. **`single_cut.py`** — write `_my_new_type(question, df) -> SingleCutResult`
   and register in `_DISPATCH`.
4. **`exporter.py`** — write `_write_my_new_type_block(ws, q, start_row,
   filter_refs, …) -> next_row` and wire into `_write_question_cut`'s
   dispatch. Use `_filter_clause()` for the COUNTIFS tail.
5. **`cross_cut.py`** — if the new type should work as a ROW dimension:
   extend `_categorise()` and `_ordered_categories()`. If as a COL
   dimension: add a `_cell_fn` and register in `_CELL_FN_BY_COL_TYPE`.
6. **`validator.py`** — usually no change; the validator checks columns,
   not types.
7. **`cutter_v3/state.py`** — usually no change; `eligible_options` reads
   from `schema.analysis_questions()` automatically. If sub-row
   granularity should be exposed for the new type, extend
   `_resolve_xcut_qid()` to handle its sub-row synthesis.
8. Update **`CUTS_FRAMEWORK.md`** with the shape rule and **this document**
   with the new entry.
