# Cuts Framework — Survey Cutter Output Layout Spec

This is the layout-and-shape spec for the cuts that the cutter is expected to produce.
Source of truth for the shapes catalogued here: `260223_CE_Growth Agenda 2026_cutter_v11 (1).xlsx`.

Scope: **what** every cut block looks like (rows, columns, headers, totals,
formula patterns) and **when** to use each shape (decision tree by question
type, segment presence, and data-mapping complexity).

Out of scope: analyst-added helper columns (`hQ7`, `Q8_Subcategory_Helper`,
`Q3 Helper`, `Q8_Department_Helper`) and post-cutter artifacts (themed text
categorization, manual cross-tabs). Per [`DATAMAP_SPEC.md`](DATAMAP_SPEC.md),
helper columns are an analyst deliverable, not cutter output.

---

## 0. Universal primitives

Every theme/output sheet shares these primitives. They are written ONCE per
sheet at the top.

### 0.1 Global Filters block (rows 1–16)

Cells:

| Row | A (group) | B (label) | C (selected value) | D (filter-column ref) |
|---|---|---|---|---|
| 1 | `Global Filters` | – | – | – |
| 3 | (blank) | `Region` | `All` | `<>x` (or specific helper) |
| 4 | (blank) | `Country` | `All` | `<>x` |
| 5 | (blank) | `Industry` | `All` | `<>x` |
| 6 | (blank) | `Sector` | `All` | `<>x` |
| 7 | (blank) | `Sub-sectors` | `All` | `Q8_Subcategory_Helper` |
| 8 | (blank) | `Current employer` | `All` | `<>x` |
| 9 | (blank) | `Number of employees` | `All` | `<>x` |
| 10 | (blank) | `Primarily serve/sell` | `All` | `Q3 Helper` |
| 11 | (blank) | `Revenue bucket` | `All` | `<>x` |
| 12 | (blank) | `Function` | `All` | `Q8_Department_Helper` |
| 13 | (blank) | `Job title` | `All` | `<>x` |
| 14 | (blank) | `Custom filter 1` | `All` | `<>x` |
| 15 | `WLO` | `WLO` | `All` | `<>x` |
| 16 | `Vendor-Robust` | `Panel` | `All` | `<>x` |

Notes:
- Column D holds the **raw-data column name** (or helper column name) that the
  filter clause should query. `<>x` means "use any non-blank from this column"
  i.e. a placeholder that the filter pass-through will resolve to `"<>"`.
- When a filter has a curated helper column (e.g. `Q8_Subcategory_Helper`),
  column D points to that helper, NOT a raw datamap column.
- The cutter today does NOT have a Region/Industry dimension because those
  require analyst-built helper columns. **Action: add 14 filter slots, leave
  unmapped ones as "Custom filter N" with `<>x` column-D so analysts can wire
  them after.**

### 0.2 Filter pass-through formula

For every count/sum formula in a cut block:

```
IF($C${row}="All","<>",$C${row})
```

Resolves to `"<>"` (any non-blank) when the dropdown is on `All`, or the literal
selected value otherwise.

⚠️ Never `"*"` — `"*"` only matches text values; `"<>"` matches text + number.

### 0.3 Validation row

Every cut block ends with a `True/False` boolean cell. This is the
`base == sum(option_counts)` check, displayed as a single boolean in column C
(or in each segment column for cross-tabs). Used by analysts to spot
mis-coded options or mis-pointed columns.

---

## 1. Shape catalog

### S1. Single-select demographic cut
**Signature:** Question has one column, ≤30 options, curated label list,
appears in `Demographics` or similar curated section.

**Layout:**
```
r:  A           B                       C                   D
1   Industry    (blank)                 (blank)             (blank)         <- section header
3   (blank)     hQ7 / Q-code            # of respondents    % of respondents <- header row
4   1           AMS                     <count formula>     <pct formula>
5   2           ENR                     <count formula>     <pct formula>
…
N   (blank)     Total respondents       <base formula>      1
N+1 (blank)     (blank)                 True                (blank)         <- validation
```

**Count formula:** `=IFERROR(COUNTIFS('Raw data'!$<col>$2:$<col>$<lastrow>, <option_code>, <filter pass-throughs…>), 0)`
**% formula:** `=IFERROR(C{this_row}/$C${total_row}, 0)`
**Base formula:** `=IFERROR(COUNTIFS('Raw data'!$<col>$2:$<col>$<lastrow>, "<>", <filter pass-throughs…>), 0)`
**Validation:** `=$C${total_row}=SUM($C${first_opt}:$C${last_opt})`

### S2. Single-select × WLO segment cross-tab
**Signature:** Single-select question on theme sheet, primary view, alongside
the WLO segmentation (Winners / Laggards / Others).

**Layout:**
```
r:  A           B               C                   D           E           F                       G           H               I
1   Q21: How…   …                                                                                                                  <- question text
3   Slide up>>  Q21             # of respondents    % of respondents                                                                <- overall sub-block (S1 shape)
4   1           Slower          26                  0.0231
…
8               Total resp.     1125                1                                                                              <- overall total
9                               True                                                                                                <- overall validation
11  (blank)     WLO                # of respondents (3 cols)              % of respondents (3 cols)
12              Q21             Winners             Laggards    Others    Winners                  Laggards    Others
13  1           Slower          0                   14          12        0                        0.0639      0.0172
…
17              Total resp.     207                 219         699
18                              True                True        True
```

**Count formula (per segment):**
`=IFERROR(COUNTIFS('Raw data'!$<col>, <option_code>, 'Raw data'!$<WLO_col>, <seg_code>, <filter pass-throughs…>), 0)`

**% formula:** `=IFERROR(<count_cell>/<seg_total_cell>, 0)`

### S3. Multi-select stack
**Signature:** Multi-select binary question (one column per option, 0/1 values).

**Layout:**
```
r:  A                       B                       C
1   Q12: Which of the…
3   Option                  # of responses          % of respondents
4   Option label 1          <countif formula>       <pct formula>
…
N   Base (any answered)     <base formula>          (blank)
N+1 (blank)                 True                    (blank)
```

**Count formula:** `=IFERROR(COUNTIFS('Raw data'!$<sub_col>$2:$<sub_col>$<lastrow>, 1, <filters…>), 0)`
**% formula:** `=IFERROR(B{this_row}/$B${base_row}, 0)`  — % of base (respondents who answered any sub)
**Base formula:**
`=IFERROR(SUMPRODUCT((--('Raw data'!$<first_sub>$2:$<first_sub>$<lastrow>=1)+--('Raw data'!$<second_sub>$2:$<second_sub>$<lastrow>=1)+…)>0), 0)`
(approximated; reference uses an analyst-defined helper)

### S4. Grid-rated (1–5 scale) × Sub-row
**Signature:** Grid question with rows × Likert columns. Each row is its own
sub-question scored 1–5 (or NPS 0–10).

**Layout:**
```
r:  A           B                       C           D           E           F                   G
1   Q44: Rate…
3   Sub-row     Mean                    Top-2 box   Bottom-2 box                                                <- column headers
4   Row label 1 <avg formula>           <top2 %>    <bot2 %>
…
```

**Mean formula:** `=IFERROR(AVERAGEIFS('Raw data'!$<col>, 'Raw data'!$<col>, ">=1", <filters…>), 0)`
**Top-2 %:** `=IFERROR((COUNTIFS('Raw data'!$<col>, 4, …) + COUNTIFS('Raw data'!$<col>, 5, …)) / COUNTIFS('Raw data'!$<col>, ">=1", …), 0)`

### S5. Piped-grid × Segment cross-tab  ⚠ HARDEST CASE
**Signature:** Grid question where each sub-row's LABEL is sourced from a
piping helper column (`[pipe: hQ13_piping1]` in datamap). The raw data has
**many columns per logical sub-row** because the question forked by branch
condition.

**Worked example (Q13):**
- Datamap declares Q13 with 3 sub-rows: `[Q13r1c1]`, `[Q13r2c1]`, `[Q13r3c1]`
- Each row label is piped: `[Q13r1c1] [pipe: hQ13_piping1]` → label varies per
  respondent based on `hQ13_piping1` (values 1, 2, 3)
- Raw data has 9 columns for Q13: `Q13r{1,2,3}c1`, `Q13_2r{1,2,3}c3`, `Q13_3r{1,2,3}c5`
  - `c1` = condition 1 branch (the 3 normal sub-rows)
  - `c3` / `c5` = "2024 / 2026" branches that asked the same 3 sub-rows in a
    different time period

**Layout used in reference (one of three repeated blocks: Overall, Winners,
Laggards):**
```
r:  A   B               C           D           E           F           G           H           I           J           K
22                                  (Q13r1c1)   (Q13r2c1)   (Q13r3c1)   (Q13_2r1c3) (Q13_2r2c3) (Q13_2r3c3) (Q13_3r1c5) (Q13_3r2c5) (Q13_3r3c5)
23  Q13: Could…
25                                  Q13r1c1     Q13r2c1     Q13r3c1     Q13_2r1c3   Q13_2r2c3   Q13_2r3c3   Q13_3r1c5   Q13_3r2c5   Q13_3r3c5    <- raw col codes
26      Q7_Sector       2025 Plan…  2025 Plan…  2025 Plan…  2025 Actual 2025 Actual 2025 Actual 2026 Expect 2026 Expect 2026 Expect              <- human labels
27  2   Aerospace…      12.2        24.7        11.1        12          24.3        10.8        16          28.6        14.2
28  6   Automotive…     14.7        24.9        18.9        14.4        25.4        18.4        17.9        29          22.8
…
45  <>  Overall         14.5        23.8        13.8        14.4        24.2        14          17.3        26.9        16.8                        <- "<>" code = aggregate
```

**Mean formula:** `=IFERROR(AVERAGEIFS('Raw data'!$<col>, 'Raw data'!$<sector_col>, $A{row}, <filters…>), 0)`

**Key generation rule for the cutter:**
1. Detect Q13-class by looking at datamap rows containing `[pipe: …]` markers
2. Parse sub-row codes `[Qxx_r{i}c{j}]` to extract **sub-row index** `i` and
   **branch index** `j`
3. Group all branch-variants `c{j1}, c{j2}, …` by their human label
   (`hQ13_piping1` may map to "2025 Planned" etc. — this mapping comes from
   the piping helper's value labels in the datamap)
4. Emit ONE block per segment (Overall, Winners, Laggards, …) where:
   - Row dim = Q7_Sector (or whichever curated demographic the analyst chose)
   - Column dim = sub-row × branch (9 columns in Q13's case)
5. Add an `Overall` row with `<>` code = mean across all sectors

**Without piping helper resolved, cutter MUST still emit the block** with
column headers as raw column codes (`Q13r1c1` etc.) and let the analyst fill
in human labels. Do NOT silently drop or fail on unresolved pipes.

### S6. Longitudinal cut (year × region cross-tab)
**Signature:** Same question asked in two survey waves; reference compares
2025 vs 2024 results side-by-side.

**Layout:**
```
r:  A   B               C           D           E           F           G           H               (gap)   J               K           L           M           N
1                       2025                                                                                                2024
2   Q15                 OVERALL                 AMERS                   EMEA                                # of respondents OVERALL    AMERS       EMEA
3   N=63 # of resp.     # of resp.  % of resp.  # of resp.  % of resp.  # of resp.  % of resp.                              # of resp.  …           …           …
4       Not confident   0           0           0           0           0           0                                       40          7           18          0.784
…
```

Two sub-blocks side-by-side, separated by a blank column. Each follows S2
structure. The N=63 cell is the wave's total responses for sanity.

### S7. Quota tracker
**Signature:** Multi-dim cross-tab showing achieved-vs-target counts. NOT a
cuts output — this is a survey-design tracking sheet. Out of scope for cutter.

### S8. Benchmarking (compact 2-period mean grid)
**Signature:** Few rows × 2 columns (period A, period B), means only. Often
post-cutter analyst artifact for executive summary.

**Layout:**
```
r:  A   B                       C               D
22  Q69A. What percentage…
24                              Q69Ar1c1        Q69A_2r1c3       <- raw col codes period 1, period 2
25                              Q69Ar2c1        Q69A_2r2c3       <- companion sub-rows (or N=)
26                              2025            2026             <- human labels
27      Sales Budget/c…         16.4            18.5
28      Marketing Budget…       13.7            15.7
```

### S9. Open-text by theme
**Signature:** Free-text responses categorized into themes by analyst.
**Status:** Out of scope for cutter. Cutter SHOULD emit per-question text dump
in datamap order; theming is post-cutter analyst work.

### S10. Question × Question cross-tab
**Signature:** Found via section headers like "Q16 x Q13", "Q23 x Q13",
"SPS best practices (Q43-48) X Q13". One question on rows, another on columns.

**Status:** Custom analyst-built cuts. Cutter MAY emit these if the user
declares cross-cut intent via the Crosscuts tab; otherwise out of scope.

---

## 2. Decision tree — question type → cut shape

Given a parsed question from the datamap, choose the cut shape:

```
IF question has [pipe: …] markers:
    → S5 Piped-grid × Segment cross-tab     (one block per WLO segment + Overall)
ELIF question is multi-select binary (multiple sub-cols, 0/1 values):
    → S3 Multi-select stack                 (in theme sheet)
ELIF question is grid_rated / grid_single_select (rows × Likert):
    → S4 Grid-rated × Sub-row               (in theme sheet)
ELIF question is single_select / binary_two_options:
    IF question is tagged "Demographics" (per §3.1 rule):
        → S1 Single-select demographic     (in Demographics sheet)
    ELSE:
        → S2 Single-select × WLO segment    (in theme sheet)
ELIF question is NPS / direct_numeric:
    → S4 Grid-rated × Sub-row (one-row degenerate)   OR  S2 if banded
ELIF question is ranking:
    → S3 Multi-select stack (one row per rank position)
ELIF question is numeric_allocation:
    → S4 Grid-rated × Sub-row (means only, no top-2)
ELIF question is open_text:
    → S9 Open-text by theme    (raw dump only; theming = analyst)
```

---

## 3. Sheet-level organization

Refresh the v3 router to match the reference's logic:

1. **Demographics** = whichever questions the analyst tags as demographic for
   THIS survey. There is no fixed list. Membership is determined by one of
   (in priority order):
     a. Explicit user tagging in the wizard (UI checkbox per question)
     b. Datamap section headers (e.g. a section literally titled
        "Demographics" or "Screener" in the source datamap)
     c. If neither (a) nor (b) is present: no Demographics sheet at all —
        every question goes to its theme sheet
   The cutter MUST NOT classify a question as demographic based on its Q-ID
   or its type. Every survey designs its demographic block differently.
2. **Theme sheets** = grouped by Q-ID **AND business theme name from datamap
   section headers** (e.g. "Theme 1 — Build growth muscle"). Every question
   gets at least one block — S2/S3/S4/S5 by classification.
3. **Cross-cuts (optional)** = S10 if user declares a row-Q × column-Q.
4. **Open text** = S9 per question, one sheet per question.
5. **`Output>>`, `Mapping>>`, `Data>>`** = divider sheets (single cell each).
6. **`Datamap`** = single-column datamap export per `DATAMAP_SPEC.md`.
7. **`Validation`** = per-question, per-block, per-segment expected base counts
   from the parsed datamap; cutter emits `Validation` rows that the
   block's `True/False` cell compares against.
8. **`Raw data`** = unmodified CSV passthrough, headers in row 1.

---

## 4. Sub-row / piping handling — first-class

When the datamap parser sees:

```
[Q13]: Could you provide…
Values: -50-100
    [Q13r1c1]   [pipe: hQ13_piping1]
    [Q13r2c1]   [pipe: hQ13_piping2]
    [Q13r3c1]   $ {hovers.Financials_1.text} (relative % change)
```

It MUST:
1. Record `Q13` as a single logical question with a `sub_rows: [r1c1, r2c1, r3c1]` field.
2. For each sub-row, record `pipe_source: hQ13_piping{N}` (or `static_label:
   <text>` for non-piped rows).
3. Look up `hQ13_piping{N}` in the datamap. If found, record its declared
   values as the **label dictionary** for that sub-row's branch.
4. In raw data, identify **all columns** matching pattern `Q13r{i}c{j}` and
   group by `(i, j)`. Each `j` is a separate branch; same `i` across branches
   maps to the same human label (or different ones, depending on pipe values).
5. **Emit one S5 block per segment** with columns enumerated as
   `(sub_row_i, branch_j)` pairs in deterministic order. Header row 1 = raw
   col code; header row 2 = resolved human label or fall-back placeholder.

**Edge case:** A piped sub-row may have NO data because no respondent took
that branch. Emit the column anyway with blank values so the analyst sees the
intended shape.

**Edge case:** A `[Q13_NA_N]` companion question (the "not-applicable"
companion to a piped question) is its own SEPARATE block of shape S3
(multi-select binary, 0=unchecked / 1=checked). Don't merge it into Q13.

---

## 5. Datamap remapping for sub-categorized columns

When a raw-data column header doesn't match a single datamap row 1:1 (because
the datamap groups it under a piped/grid parent), the cutter must:

1. Build an **inverse index**: for each raw-data column header, find the
   datamap row that "owns" it (parent row + sub-row position).
2. Look up labels from the parent row's `pipe_source` and the
   sub-row's branch index.
3. If a raw column has NO datamap row claiming it, log it as an
   **orphan column** in the validation report (don't silently drop).

Example inverse-index entries for the Q13 area:

| Raw col | Owner datamap row | Sub-row idx | Branch idx | Label source |
|---|---|---|---|---|
| `Q13r1c1` | `[Q13]` | 1 | 1 | `hQ13_piping1` value 1 |
| `Q13r2c1` | `[Q13]` | 2 | 1 | `hQ13_piping2` value 1 |
| `Q13r3c1` | `[Q13]` | 3 | 1 | static (`hovers.Financials_1.text`) |
| `Q13_NA_1r1c2` | `[Q13_NA_1]` | 1 | 2 | NA companion |
| `Q13_2r1c3` | `[Q13]` (branch 3) | 1 | 3 | `hQ13_piping1` value 3 (or 2025-Actual) |
| `hQ13_piping1` | `[hQ13_piping1]` | – | – | helper col itself |

---

## 6. Validation rules at output time

For every cut block the cutter writes:
- `True/False` row computes: `sum(option counts) == base count`
- Sum should equal base count (S1, S2, S3 — for multi-select, S3's sum may
  exceed base because respondents pick multiple options; in that case the
  validation cell compares against `respondent_count` not `selection_count`).
- Cross-tab cells (S2, S5): one validation cell PER segment column.

Cutter writes the `Validation` sheet with: `(question_id, block_row,
expected_base, actual_base_formula_ref)` so the analyst can drill in.

---

## 7. Survey-to-survey variability — DO NOT hardcode

This framework was bootstrapped from one survey (`260223_CE_Growth Agenda 2026`).
Every assumption that depends on specific Q-IDs, specific theme names, or a
specific demographic dimension list is a survey-fitting bug.

Things that CHANGE every survey:
- Which questions are demographic (varies by survey design)
- Theme names + theme-to-Q-ID mapping (analyst-defined in datamap section headers)
- Which filter dimensions are useful (Region/Industry might not exist next year;
  could be replaced with Function/Tenure/etc.)
- Whether a piping helper exists for any given question
- Whether the survey has WLO (Winners/Laggards/Others) segmentation at all
- The set of helper columns (`hQ7`, `Q8_Subcategory_Helper`, etc.)
- Whether a longitudinal cut applies (depends on whether prior wave was run)

Things that are stable across surveys:
- The 10 cut shapes catalogued in §1 (S1–S10)
- The filter pass-through formula pattern
- The validation row convention
- The piping detection algorithm (§4) — the markers are universal
- The inverse-index for raw column → datamap owner (§5)

**Implementation rule:** anything in §1 that names specific Q-IDs is
illustrative only. The cutter's runtime must derive theme/demographic
membership from the parsed datamap + user wizard input, never from a
built-in list.

## 8. Known gaps to close (v3 follow-ups)

- [ ] Add Region / Industry / Sector / Sub-sectors / Function as named filter
      slots in the Global Filters block (with helper-column references the
      analyst will fill).
- [ ] Demographics sheet = wizard-tagged questions only. Never auto-pick.
- [ ] Route every question to its datamap-declared theme sheet by default.
      No catch-all/Demographics dumping ground.
- [ ] Theme grouping reads datamap section headers (e.g. "Theme 1 — …"),
      NOT a built-in Q-ID range list.
- [ ] Treat `[pipe: …]` markers as first-class; build sub-row + branch index.
- [ ] Emit S5 piped-grid blocks for Q13-class questions.
- [ ] Cross-cuts (S10) only when explicitly declared in the wizard.
- [ ] Validation sheet auto-generation per cut block + segment.



---

## 9. Cross-survey validation (multi-year)

This section captures what's invariant vs survey-specific based on inspecting
**three** real workbooks:
1. `260223_CE_Growth Agenda 2026_cutter_v11.xlsx` (the original reference)
2. `250307_CE Growth Agenda Survey 2025_vFinal.xlsm`
3. `CE Longitudinal Survey cut_vShare.xlsx`

### 9.1 What's invariant (cutter can hardcode these)

- **`MasterCheck = True`** cell at A1 of every theme/output sheet (sanity flag
  that drops to FALSE if any block-level validation fails)
- **Filter block at top of every theme sheet** (rows ~1–17), with these columns:
  - col A: group label (mostly blank; sometimes shows "WLO", "Vendor-Robust")
  - col B: filter dimension name (analyst-defined, survey-specific)
  - col C: selected value (defaults to `All`)
  - col D: filter-column ref (`<>x` placeholder OR helper-column name)
- **Filter pass-through formula**: `IF($C${row}="All","<>",$C${row})`
- **`Total respondents` row + `True/False` validation row** at the end of every
  block
- **Aggregate row** uses `<>` as the option code (means "any non-blank")
- **The 10 cut shapes catalogued in §1** — S1–S6 confirmed across multiple
  surveys. S7/S8/S9/S10 vary in presence but shape is stable when used.
- **Piping pattern** `[Qxx_r{i}c{j}]` + `[pipe: hQxx_pipingN]` (S5) — confirmed
  in 2025 Growth Ambition sheet using same Q-IDs (Q14) with same structure
- **WLO segmentation is a recurring concept** (Winners / Laggards / Others)
  with a config-defined definition

### 9.2 What's survey-specific (must be wizard/config-driven)

| Concept | 2026 | 2025 | Implication |
|---|---|---|---|
| Filter slot names | "Region", "Country", "Sub-sectors"… | "Region by operating", "Sectors", "Sub- sectors", "Public vs Private", "Company size" | Names come from wizard input, not built-in |
| Helper column names | `Q8_Subcategory_Helper`, `Q3 Helper`, `Q8_Department_Helper` | `Q10_Helper`, `Q11_Helper` | Helper cols are survey-specific; ref by name only |
| Theme sheet names | Theme 1–5, "Growth & key challenges", "Benchmarking"… | "Growth Ambition", "GTM Priorities", "Sales plays", "Sustainability", "Pricing", "Budget Allocation", "Productivity", "Tech Stack", "AI", "Market Acc & Launch (Pharma)" | Themes come from datamap section headers OR wizard |
| Demographics sheet shape | S1 only (Overall counts + %) | S1+WLO inline (Overall AND Winners/Laggards counts + % per dim) | Pick at sheet-build time based on survey design |
| Industry/sector dimension presence | All present | All present BUT label "Sectors" (plural) | Don't hardcode "Sector" — read from wizard |
| WLO definition | Implicit (assumed pre-tagged) | Explicit on "Winners vs Laggards" sheet (top quartile of rev growth + GM>0) | Cutter MUST accept WLO criteria as config, then derive a WLO column |
| Datamap header style | `[Q1]: text` (bracketed) | `Q1` + text in col B (plain) | Parser must handle BOTH styles |

### 9.3 Datamap parser — bracketed format is the contract

Bracketed format is the **required** input contract for the cutter. Surveys
arrive in many shapes (the 2025 vFinal file used plain `Q1` headers); the
analyst is responsible for cleaning the datamap into the bracketed canonical
form during pre-upload data prep.

**Required format:**
```
[Q1]: What is your current employment?
Values: 1-7
    1     Full-time
    2     Part-time
    ...
```
- Row pattern: column A = `[<col_id>]:` followed by question text
  - `<col_id>` is whatever the raw data column header is — `Q1`, `hQ7`,
    `Q13r1c1`, `Qlang`, `WLO_Fresh`, etc. The bracket wrapping is what makes
    the parser deterministic.
- Sub-rows: column A = option code (integer), column B = option label
- `Values: M-N` declares value range/type hint (`-50-100`, `0-1`, `1-7`)
- Sub-rows of a grid: column A = `[<sub_col_id>]`, column B = label OR
  `[pipe: <helper_col>]` for piping (see §4)

**The brackets serve as a raw-data ↔ datamap validator.** Every bracketed
`<col_id>` MUST match a raw data column header exactly. After parsing, the
cutter cross-checks:
- Every `[col_id]` in the datamap has a corresponding raw data column → no
  dangling datamap entries
- Every raw data column header has a corresponding `[col_id]` in the datamap
  → no orphan raw columns (logged in validation, not silently dropped)

This mutual-mapping check is the single best test that the datamap is
correctly aligned with the raw data — it catches typos, missed sub-rows, and
column-order drift in one pass.

**Non-bracketed input handling:** the parser MUST reject plain-format
datamaps with a clear error pointing the user at the cleaning step:
> "Row N: expected bracketed col_id like `[Q1]: …` — got plain `Q1`. Please
> clean the datamap to the bracketed format before upload (see
> [`DATAMAP_SPEC.md`](DATAMAP_SPEC.md))."

This keeps the parser tiny and the input contract one-way — no format
detection, no fallback path, no silent guessing.

### 9.4 WLO (Winners / Laggards / Others) — data-driven definition

The cutter MUST NOT assume a fixed WLO mapping. Where WLO comes from:

**Source A — explicit config sheet** (2025 model): A "Winners vs Laggards"
sheet declares the criteria, e.g.:
- Winners: `Revenue growth > top_pct AND GM > 0`
- Laggards: `Revenue growth < bottom_pct`
- Others: everything else
With percentile inputs (`top_pct=0.75`, `bottom_pct=0.25`).

**Source B — wizard input:** user specifies the WLO criteria when running the
cutter, including:
- Which Q-column carries the growth/criterion measure
- Top/bottom percentile cutoffs (or explicit thresholds)
- Additional AND/OR conditions

**Source C — pre-tagged column:** raw data already has a WLO column populated
(e.g. `WLO`, `WLO_4`). Cutter detects this and uses it directly.

**Implementation:**
1. At parse time, look for sources in priority A → B → C
2. If A or B: compute a derived `WLO` column in raw data with values
   `1=Winner / 2=Laggard / 3=Other` (or analyst-defined labels)
3. If no WLO source declared, skip S2 segment cross-tabs entirely; emit S1/S3/S4 only

### 9.5 Theme sheet derivation — three options

Picking a strategy per survey:

**Option A — Datamap section headers:** the datamap source file has headers
like "Theme 1 — Build growth muscle", "Theme 2 — …". Parser collects these as
sheet names + assigns the questions between them. This is the cleanest path
when the source datamap is well-structured.

**Option B — Wizard tagging:** user manually buckets questions into named
themes in the wizard. Most flexible, most labor.

**Option C — Q-ID range guessing:** the cutter today does `"Q1-Q7 · Current
Employment"`. **This is a last-resort fallback** and produces the meaningless
names we saw in the v3 audit. Only useful when no section headers exist
AND no wizard input is provided.

**Recommendation:** implement A and B; expose C as an emergency fallback only.

### 9.6 Demographics layout — pick per survey

If WLO is configured AND demographics-inline-WLO is desired:
→ **S1+WLO fused** layout (2025 style): each demographic dim shows Overall N
  + % AND Winners N + % AND Laggards N + % AND Others N + % side-by-side

Otherwise:
→ **Pure S1** layout (2026 style): each demographic dim shows Overall N + %
  only

Wizard exposes a single toggle: "Show WLO splits in Demographics?"


---

## 10. Additional findings from longitudinal file

The longitudinal cuts file (`CE Longitudinal Survey cut_vShare.xlsx`)
adds these conventions and primitives to the framework.

### 10.1 Column A as "filter origin / group" label

The longitudinal file uses column A of the filter block to record the
**origin** of each filter row, not just leave it blank. Pattern:

| col A | meaning |
|---|---|
| `All respondents` | Filter is "All" — no narrowing applied |
| `QIndustry`, `Q6IndustryFinal` | Filter is active, driven by this Q-column |
| `Not blacklisted` | Standard blacklist filter |
| `MPPM` | Category-level segment filter |
| `Survey demographics` | Cross-survey demographic filter group |

This serves as an **audit trail** for the analyst — at a glance, the filter
state is human-readable without reading formulas. Cutter SHOULD populate col A
with the origin label for every active filter; "All respondents" for any
filter on `All`.

### 10.2 Universal Master Check cell

Every theme/output sheet has at A1: `Master check` / `Master Check` / `MasterCheck`
(naming varies) and B1 = `True` (or `#VALUE!` when underlying validations
fail).

The formula sums every block's True/False validation cell on the sheet:
`=AND(Block1_Validation, Block2_Validation, …)`

When ANY block fails (count mismatch, base mismatch, NA handling), B1 turns
`FALSE` or `#VALUE!`. Single cell, instant sanity check across the whole sheet.

Cutter MUST emit this on every theme sheet.

### 10.3 Blacklist filter (first-class)

Row 17 of every longitudinal filter block:
```
A: Not blacklisted | B: Final Blacklist | C: Not blacklisted | D: No
```

A **Blacklist criteria** sheet declares the quality-control rules. The 2025 longitudinal
file uses statistical-bound criteria per (Region × Sector) — any respondent
whose answer falls outside [`R1`, `R2`] is blacklisted:

| col A | col B (Region) | col C (Concat helper) | col D (Q1) | col E (Q3) | col F (IQR) | col G (R1=lower bound) | col H (R2=upper bound) |
|---|---|---|---|---|---|---|---|
| (blank) | AMERS | Aerospace+Defense | 7.5 | 12 | 4.5 | 0.75 | 18.75 |
| (blank) | EMEA | Aerospace+Defense | 4 | 12 | 8 | -8 | 24 |
| … | | | | | | | |

R1 = Q1 - 1.5*IQR, R2 = Q3 + 1.5*IQR (standard outlier bounds).

Cutter must support:
1. Reading a `Blacklist criteria` sheet (or accepting equivalent wizard input).
2. Computing a derived `Final Blacklist` column in raw data (`Yes` / `No`).
3. Adding `Final Blacklist` as the LAST filter slot in every theme sheet's
   filter block, defaulted to `Not blacklisted = No`.
4. Including the blacklist clause in every count formula:
   `'Raw data'!$<blacklist_col>$2:$<blacklist_col>$<lastrow>, IF($C${row}="Not blacklisted","No",$C${row})`

### 10.4 Category-level segment filters

Longitudinal sheets show category dimensions beyond Industry/Sector that filter
specific segments. Example: "MPPM" (Manufacturing / Pharma / Process / Materials)
appears as both a filter slot AND as one axis of a cross-tab.

Pattern:
```
A: MPPM | B: MPPM/Others | C: MPPM | D: MPPM
```

Cutter MUST support N analyst-defined category filters as additional filter
rows. They use the same `IF($C${row}="All","<>",$C${row})` pass-through pattern
as standard filters — no new formula machinery needed.

### 10.5 Cut shape **S11 — Category × WLO × Q triple cross-tab**

**Signature:** A category dimension (e.g. MPPM/Others) crossed with WLO
segmentation crossed with the question's options.

**Layout (excerpt from `Industry-specific cuts_MPPM` r25–r30):**
```
r:  A           B               C           D           E           F           G                   H               I
25                              WLO_Fresh                                       Winners             Laggards        Others       <-- WLO header
26                                                                              # of respondents…                                  <-- metric type
27  Q42                         Winners     Laggards    Others      Total       % Winners           % Laggards
28  1           Yes             22          23          115         160         1                   0.958
29  2           No              0           1           2           3           0                   0.0417
```

This is essentially **S2 doubled**: one S2 block per category-axis value
(MPPM | Others). Each S2 block has the WLO 3-segment cross-tab AS BEFORE.

**Implementation:** when category dimension is active for a sheet, emit one
S2 block per category value (including "Others") side-by-side. Total columns:
`(category_values + 1) × (3 + 3) = up to 12 value columns` for 2 categories.

### 10.6 Cut shape **S9b — Word Cloud / Verbatims split by segment**

**Signature:** Open-text responses categorized into a 2-column side-by-side
layout: left = Winners verbatims, right = Laggards verbatims (or any 2-seg
split).

**Layout:**
```
r:  A           B (Winners)             D (Laggards)
1   "Final blacklist"  No               "Final blacklist"  No
2   WLO_Fresh          Winners          WLO_Fresh          Laggards
4   Row Labels                          Row Labels
5   A comprehensive…                    A strong brand…
6   A deep understanding…               Ability to res…
…
```

This is a **side-by-side verbatim split** (S9 with N=2 segments instead of N
themes). Cutter can emit when:
- Question is open-text AND
- WLO segmentation is active AND
- Analyst opted into split-verbatims view (wizard checkbox)

Otherwise emit S9 (raw dump, one column).

### 10.7 Theme sheet **duplication / preset pattern**

Longitudinal file has pairs like `Pricing` / `Pricing_Omnibus` and
`Productivity` / `Productivity ` (typo with trailing space). Both pairs:
- Have IDENTICAL structure (same filter block, same Q-cuts inside)
- Differ only in DEFAULT filter values (e.g. Pricing has `Industry=FS`,
  Pricing_Omnibus has `Industry=HLS`)

This is an **analyst convention** for locking in specific cuts for
distribution. The cutter MAY support this via a wizard option:
- "Generate N copies of this theme sheet with these filter presets"
- Each copy emitted with its own preset values in C-column of filter block

Not a new cut shape — same templates, different default values.

### 10.8 Updated filter block expanded slot count

Across the three surveys, the universal filter block has **15–17 slots**:

| Slot # | Common label | Notes |
|---|---|---|
| 1 | Region | Universal |
| 2 | Country | Universal |
| 3 | Industry | Universal |
| 4 | Sector(s) | "Sectors" plural in 2025/longitudinal |
| 5 | Sub-sectors | Universal (helper-driven) |
| 6 | Product category | Longitudinal only |
| 7 | Current employer / Public vs Private | Naming varies |
| 8 | Function | Universal (helper-driven) |
| 9 | Job title | Universal |
| 10 | Revenue bucket | Universal |
| 11 | Number of employees / Company size | Naming varies |
| 12 | Winners vs Laggards | Universal (when WLO is configured) |
| 13 | Custom Filter 1 | Universal |
| 14 | Custom Filter 2 (optional) | Sometimes present |
| 15 | Panel | Universal |
| 16 | Final Blacklist | Longitudinal universal; emerging convention |
| 17 | Category dimension (MPPM, etc.) | Longitudinal optional |

Cutter SHOULD reserve up to 17 filter rows. Slots that don't apply to a
survey are left as "Custom Filter N" with `<>x` ref-column, ready for the
analyst to wire up post-cut.

### 10.9 Real-world formula errors

The longitudinal `Pricing` sheet has `Master check = #VALUE!` — the workbook
has formula errors in the wild. Cutter implications:

1. Master check formula must use `IFERROR` to convert error states into a
   readable `FALSE` (not `#VALUE!`).
2. Individual block validation cells must use `IFERROR` so one bad cell
   doesn't poison the whole sheet's validation.
3. Cutter SHOULD include a "Validation" sheet enumeration where every block's
   expected counts are listed; bad cells highlighted there.

---

## 11. Summary — survey-driven inputs the cutter must accept

To remain truly survey-agnostic, the cutter wizard must accept (or auto-detect
from the source datamap) the following:

**Required:**
- Datamap (parsed in either bracketed or plain format per §9.3)
- Raw data (CSV passthrough)

**Optional (with sensible defaults):**
- Filter slot names + helper-column references (defaults: standard 15-slot
  block from §10.8 with `<>x` placeholders)
- Theme grouping rule (datamap section headers / wizard tagging / Q-ID
  fallback per §9.5)
- Demographics question list (wizard-tagged per §3.1; empty by default)
- WLO definition (config sheet / wizard / pre-tagged column per §9.4; absent
  by default → no S2 blocks emitted)
- Blacklist criteria sheet (per §10.3; absent by default → no blacklist filter)
- Category dimension definitions (per §10.4; absent by default)
- Cross-cut declarations for S10 (absent by default)
- Preset duplication (per §10.7; absent by default)

When all optional inputs are absent, the cutter emits the MINIMAL safe output:
S1 / S3 / S4 cut blocks per question grouped onto theme sheets by best-guess
section headers or Q-ID ranges, with the standard 15-slot filter block
defaulted to `All`.



---

## 12. Implementation phasing — Phase 1 scope

The framework above documents the FULL set of cuts and conventions seen
across three real surveys. For initial implementation, scope is intentionally
narrower.

### Phase 1 — IN scope (build now)

**Cut shapes:**
- S1 — Single-select with curated label list (Demographics + theme sheets)
- S3 — Multi-select stack
- S4 — Grid-rated × Sub-row
- S5 — Piped-grid (Overall view only, no segment splits)
- S6 — Longitudinal cut (year × region) — only if survey clearly contains
       prior-wave data; skip if not detected
- S9 — Open-text raw dump (one column per question)

**Primitives:**
- Standard filter block (~13 slots, per §10.8 minus WLO and Blacklist)
- Filter pass-through formula `IF($C${row}="All","<>",$C${row})`
- Master Check cell at A1 of every theme sheet
- Total / Base + True/False validation row per block
- Aggregate row with `<>` option code
- Bracketed datamap parser (§9.3) + raw-data ↔ datamap mutual cross-check

**Piping:**
- Detect `[pipe: <helper_col>]` markers per §4
- Build sub-row × branch inverse index per §5
- Emit S5 blocks with raw column codes as headers; human labels filled from
  the piping helper's value declarations when resolvable, else placeholders

**Routing (Phase 1 — temporary):**
- No theme splitting. Use the existing Q-ID range grouping ("Q1-Q7 · …",
  "Q13-Q14 · …") as the only router. Section-header parsing and wizard
  tagging are Phase 2 features.
- Every question goes to its Q-ID range bucket — no Demographics rerouting
  by classifier type. This kills Bug 1 from the audit (the
  Demographics-dumping-ground) without needing theme work.
- Demographics sheet stays empty in Phase 1 unless explicitly tagged later.

### Phase 1 — OUT of scope (defer)

These remain documented above for design completeness but are NOT built now:

- **WLO segmentation** (S2 single-select × WLO, S5 segment splits, S11 triple
  cross-tab, S9b verbatims split, WLO criteria parsing/wizard) — entire WLO
  axis deferred
- **Blacklist filter + criteria sheet** (§10.3) — entire blacklist axis
  deferred
- **Category dimension filters** (§10.4 MPPM-style) — deferred
- **S10 Q × Q cross-cuts** — deferred (wizard exposure later)
- **Theme sheet duplication / presets** (§10.7) — deferred
- **S7 Quota tracker** — permanently out (survey-design artifact, not a cut)

### Phase 1 filter block (13 slots)

| Slot | Label | Type | Notes |
|---|---|---|---|
| 1 | Region | helper or `<>x` | Universal |
| 2 | Country | `<>x` | Universal |
| 3 | Industry | helper or `<>x` | Universal |
| 4 | Sector | `<>x` | Naming varies; cutter uses singular by default |
| 5 | Sub-sectors | helper | Universal |
| 6 | Public vs Private / Current employer | `<>x` | Survey-named |
| 7 | Function | helper | Universal |
| 8 | Job title | `<>x` | Universal |
| 9 | Revenue bucket | `<>x` | Universal |
| 10 | Company size / Number of employees | `<>x` | Survey-named |
| 11 | Custom Filter 1 | `<>x` | Wizard-named |
| 12 | Custom Filter 2 | `<>x` | Wizard-named |
| 13 | Panel | `<>x` | Universal |

WLO row and Blacklist row are NOT written in Phase 1.

### Phase 1 master check

```
=IFERROR(AND(<every block's true/false cell on this sheet>), FALSE)
```

If no blocks exist, defaults to `TRUE`.

### Phase 1 datamap cross-check (the bracket validator)

After parsing the datamap, before any cut is built, the parser runs:

```
datamap_ids   = { every [col_id] declared in the datamap }
raw_headers   = { every column header in the Raw data sheet }

dangling = datamap_ids - raw_headers   # in datamap but not in raw
orphans  = raw_headers - datamap_ids   # in raw but not in datamap
```

Both lists are written to the Validation sheet AND surfaced in the wizard's
"Validate" step. The cutter refuses to generate output if `|dangling| > 0`
(datamap has a column the raw data doesn't); `|orphans| > 0` is allowed
(common for analyst-added helper columns) but logged.

