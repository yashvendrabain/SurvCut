# SurvCut Input Format — Conversion Guide

> **Purpose of this file.** Give this document to Claude (Desktop, or any chat)
> along with a *new* datamap + raw survey export, and ask it to convert them
> into the **SurvCut input format** described below. This file is the complete,
> self-contained specification — you do **not** need the SurvCut codebase to use it.

---

## 0 · The task, in one paragraph

SurvCut ingests **one `.xlsx` workbook with exactly two sheets**: a **`Datamap`**
sheet (a machine-readable codebook that declares every column, its type, and its
value labels) and a **`Raw data`** sheet (one row per respondent, one column per
survey field). Real survey exports almost never arrive in this shape — labels and
codes are split across files, sub-questions are laid out inconsistently, junk
columns are mixed in. Your job when given a new export is to **produce a clean
`Datamap` + `Raw data` pair that obeys this spec exactly**, so SurvCut can parse
every question, match every column, and generate the cut workbook.

The single hard rule that everything else serves: **the bracketed ID in each
datamap header must match a raw-data column header character-for-character.**
That match is the join key between the two sheets.

---

## 1 · The target workbook

```
your_output.xlsx
├── Datamap      ← codebook: what columns exist, their type, their labels  (cols A–C only)
└── Raw data     ← responses: header row + one row per respondent
```

**Sheet names matter.** SurvCut auto-detects sheets by name:

| Sheet | Auto-detected if the sheet name contains… | Safest name to use |
|---|---|---|
| Datamap | `datamap`, `data map`, `codebook`, `questions`, or `metadata` | **`Datamap`** |
| Raw data | `raw data`, `rawdata`, `raw`, `responses`, or `data sheet` | **`Raw data`** |

Just name them **`Datamap`** and **`Raw data`** and you never have to think about it.
(If you prefer two separate files — a raw file and a datamap file — that also works;
the datamap file's first/qualifying sheet is used. But the single combined workbook
is the default and simplest.)

Rules that apply to the whole workbook:

- No merged cells, no hidden rows, no formulas in either sheet — plain values only.
- The `Datamap` sheet uses **only columns A, B, C**. Anything in D+ is ignored.
- The `Raw data` sheet's **row 1 is the header**; respondents start on row 2.

---

## 2 · The `Datamap` sheet — grammar

The datamap is a sequence of **question blocks**. Each block is a contiguous run of
rows, and blocks are separated by **at least one fully-blank row**. Data starts on
**row 1** — there is no header row.

A block has three parts, in order:

```
Row 1 of block   HEADER       Col A = "[ColumnID]: Question text"      (B, C blank)
Row 2 of block   TYPE HINT    Col A = "Values: M-N" | "Open numeric response" | "Open text response"
Rows 3…          OPTION ROWS  Col A blank | Col B = code or [SubColID] | Col C = label
(blank row)      SEPARATOR    ends the block
```

### 2.1 The header row

```
[ColumnID]: Question text shown to the respondent
```

- `[ColumnID]` **must equal the raw-data column header exactly** — case-sensitive,
  no extra spaces. Letters, digits, and underscore only; no spaces inside the brackets.
- Then a colon, a space, then the question text (any length; ≤300 chars reads best).
- Nothing before the `[` — no numbering (`1.`), no bullets.

✅ `[Q1_EmploymentStatus]: What is your current employment status?`
❌ `Q1_EmploymentStatus: …` (no brackets) · `[ Q1 ]: …` (spaces in brackets) · `1. [Q1]: …` (leading number)

### 2.2 The type-hint row

Pick **exactly one** line. This is the primary signal for the question type:

| Type-hint line | Data it describes |
|---|---|
| `Values: M-N` (e.g. `Values: 1-7`, `Values: 0-1`, `Values: 0-100`, `Values: 0-10`) | Integer-coded values in range M..N |
| `Open numeric response` | A free-form number |
| `Open text response` | Free-form text (verbatims) |

### 2.3 Option rows (Col B + Col C)

Column A is blank. Two kinds of option row:

- **Coded option:** `B = integer code`, `C = label`. Describes what each numeric value means.
  ```
              1     Full-time
              2     Part-time
  ```
- **Sub-column declaration:** `B = [SubColID]`, `C = label`. Declares that this question
  spans **multiple raw columns** — one per sub-row (multi-select, grid, ranking, allocation).
  ```
              [Q3_CustomerTypesr1]   We sell to other businesses (B2B)
              [Q3_CustomerTypesr2]   We sell to consumers (B2C)
  ```

A `[SubColID]` is *also* a join key: each one must be an exact raw-data column header.

### 2.4 Optional niceties (ignored by the parser, useful for humans)

- A Col-A row starting with `>>` or `Section:` is a visual divider.
- A Col-A row starting with `#` is a comment.

---

## 3 · How the type-hint + shape decide the question type

When you build a datamap, choose the type-hint and option-row shape so the block
lands on the type you intend. SurvCut classifies each block with this decision order
(top wins). `has_subs` = "the block has one or more `[SubColID]` rows".

```
1.  hint == "Open numeric response"                          → DIRECT_NUMERIC
2.  hint == "Open text response"                             → OPEN_TEXT   (excluded from cuts)
3.  hint not "Values: M-N"                                   → UNKNOWN     (excluded — avoid this)
4.  range == 0-10  AND text has "recommend" or "NPS"  AND no subs → NPS
5.  range == 0-100 AND has_subs                              → NUMERIC_ALLOCATION
6.  range == 0-1   AND has_subs                              → MULTI_SELECT_BINARY
7.  range == 0-1   AND no subs                               → BINARY_TWO_OPTIONS
8a. has_subs AND text says "rank"/"ranked"/"ranking"
        (or ≥2 option labels look like "Rank 1", "Rank 2")   → RANKING
8b. has_subs AND range starts at 1                           → GRID_RATED
8c. has_subs (any other range)                               → GRID_RATED
9.  no subs                                                  → SINGLE_SELECT
```

Two things to internalise from this:

- **NPS needs the keyword.** A `Values: 0-10` single column *without* "recommend"/"NPS"
  in the text is treated as an ordinary single-select — still valid, just no
  Promoter/Passive/Detractor split. Include the keyword when you mean NPS.
- **Ranking vs grid is decided by the question text**, not by the numbers. If it's a
  ranking question, the word "rank" must appear in the question text (or the option
  labels must literally read "Rank 1", "Rank 2", …). Otherwise a sub-column block
  defaults to a grid.

---

## 4 · The 10 question types — canonical block + matching raw columns

Each example below shows the **datamap block** and the **raw-data column(s)** it must
line up with. These are the exact patterns from the reference dataset.

### 4.1 Single-select — one column, N coded options
```
[Q1_EmploymentStatus]: What is your current employment status?
Values: 1-7
            1    Full-time
            2    Part-time
            3    Contract, freelance or gig-worker
            4    Retired
            5    Unemployed
            6    Student
            7    Other
```
**Raw:** one column `Q1_EmploymentStatus`, each cell an integer 1–7.

### 4.2 Binary two-options — one column, 0/1, no sub-columns
```
[Q99_HasBudget]: Do you own a budget?
Values: 0-1
            0    No
            1    Yes
```
**Raw:** one column `Q99_HasBudget`, each cell 0 or 1.

### 4.3 Multi-select (select-all) — one raw column per option, each 0/1
```
[Q3_CustomerTypes]: What type of customers does your organization serve? Select all that apply.
Values: 0-1
            0    Not selected
            1    Selected
            [Q3_CustomerTypesr1]   We sell directly to other businesses (B2B)
            [Q3_CustomerTypesr2]   We sell directly to consumers (B2C)
            [Q3_CustomerTypesr3]   We sell to governmental organizations
            [Q3_CustomerTypesr4]   Other
```
**Raw:** four columns `Q3_CustomerTypesr1 … r4`, each 0/1.
Note the shape: the two coded rows (`0 Not selected`, `1 Selected`) explain the cell
values; the `[…r#]` rows name the actual flag columns.

### 4.4 Grid / rated (Likert; several rows share one scale)
```
[Q31_Differentiation]: For each touchpoint, how clearly does your value proposition differentiate?
Values: 1-5
            1    Not at all clear
            2    Slightly clear
            3    Moderately clear
            4    Very clear
            5    Extremely clear
            [Q31_Differentiationr1]   Website
            [Q31_Differentiationr2]   Sales calls
            [Q31_Differentiationr3]   Marketing collateral
            [Q31_Differentiationr4]   Trade shows / events
```
**Raw:** four columns `Q31_Differentiationr1 … r4`, each an integer on the 1–5 scale.
(A grid where each row uses a different scale takes the same shape — SurvCut treats it
as a rated grid.)

### 4.5 Numeric allocation (components sum to ~100)
```
[Q13_RevSplit]: Allocate 100% across these revenue sources for 2026.
Values: 0-100
            [Q13_RevSplitr1c1]   Existing customers — same products
            [Q13_RevSplitr2c1]   Existing customers — new products
            [Q13_RevSplitr3c1]   New customers — same products
            [Q13_RevSplitr4c1]   New customers — new products
```
**Raw:** four numeric columns, each a percentage; the four sum to ≈100 per respondent.
`Values: 0-100` + sub-columns is what distinguishes this from a 1–100 categorical scale,
so **do not** add coded 1..100 option rows here — declare only the `[SubColID]` rows.

### 4.6 NPS (0–10 recommend scale)
```
[Q15_Recommend]: How likely are you to recommend us to a colleague? (NPS)
Values: 0-10
            0     Not at all likely
            10    Extremely likely
```
**Raw:** one column `Q15_Recommend`, integer 0–10.
Only the two anchor labels (0 and 10) are declared — you don't list all 11 values.
The word "recommend" (or "NPS") in the text is what triggers NPS handling.

### 4.7 Ranking (respondent ranks a subset; each item is a column)
```
[Q17_Challenges]: Rank your top 5 challenges for 2026.
Values: 1-8
            [Q17_Challengesr1]   Cost pressure
            [Q17_Challengesr2]   Talent shortage
            [Q17_Challengesr3]   Regulatory complexity
            [Q17_Challengesr4]   Tech disruption
            [Q17_Challengesr5]   Supply chain
            [Q17_Challengesr6]   Customer churn
            [Q17_Challengesr7]   Pricing pressure
            [Q17_Challengesr8]   Other
```
**Raw:** one column per item (`Q17_Challengesr1 … r8`). Each cell holds the **rank the
respondent gave that item** (1 = top), and is **blank** for items they didn't rank.
The word "Rank" in the question text is what selects RANKING over GRID.

### 4.8 Direct numeric (single open number)
```
[Q70_BudgetChange]: What percentage is your sales budget changing in 2026 vs 2025?
Open numeric response
```
**Raw:** one numeric column `Q70_BudgetChange`. No option rows.

### 4.9 Open text (verbatim — excluded from cuts, but keep the column)
```
[Q18_OpenComments]: Anything else you'd like to share?
Open text response
```
**Raw:** one text column `Q18_OpenComments`. No option rows. SurvCut keeps the column
but produces no cut for it.

### 4.10 Metadata / system columns
```
[record]: Record number
Open numeric response

[uuid]: Participant identifier
Open text response

[hSample]: Hidden sample variable
Values: 1-2
            1    Bain respondent
            2    Other respondent
```
Columns whose **ID is in the metadata allowlist** are kept for audit but never cut:

> `record`, `uuid`, `date`, `start_date`, `status`, `termReason`, `nx`, `hSample`, `markers`

These may appear in the raw data **without** a datamap entry and won't raise a warning.
Any *other* undeclared raw column **will** raise a warning — declare everything else.

---

## 5 · The `Raw data` sheet — layout

- **Row 1 = header**, holding the exact column IDs. Respondents start on **row 2**,
  one row each.
- Every datamap `[ColumnID]` (for single-column questions) and every `[SubColID]`
  (for multi-column questions) is its **own column** here.
- Cell value conventions by type:

| Question type | Raw cell contents |
|---|---|
| Single-select | integer code (1..N) |
| Binary two-options | 0 or 1 |
| Multi-select | 0 or 1 in each sub-column |
| Grid / rated | integer on the scale, per sub-column |
| Numeric allocation | number per sub-column; the set sums to ≈100 |
| NPS | integer 0–10 |
| Ranking | the rank integer where ranked, **blank** otherwise (sparse) |
| Direct numeric | free number |
| Open text | free text |
| Metadata | passthrough (id string, timestamp, flag, …) |

**Header order does not matter** — the join is by name, not position — but keeping the
raw columns in the same order the questions appear in the datamap makes both sheets far
easier to eyeball.

---

## 6 · The join key (the one rule that breaks everything if wrong)

For every block, SurvCut takes the bracketed ID(s) and looks for a raw column with that
**exact** header:

- Match found → the question is built and cut.
- Datamap declares an ID with **no** raw column → **hard error**, export refuses.
- Raw column with **no** datamap entry (and not in the metadata allowlist) → **warning**;
  the column is preserved but produces no cut.

So: brackets in the datamap ⇔ headers in the raw data, one-to-one, character-for-character.
The `r1`/`r2`/`r1c1` suffixes are just the convention the reference data uses; the only
real requirement is that whatever you name a sub-column, the datamap `[SubColID]` and the
raw header are identical.

---

## 7 · Conversion procedure — what to do with a messy new export

When given a fresh datamap + raw file that doesn't match this spec, work through:

1. **Locate the two inputs.** One source of respondent rows; one source of
   codes/labels/question text (may be a codebook, a second sheet, a Word doc, or
   embedded in the raw file's header comments). If labels and codes live only in the
   raw file, reconstruct the codebook from the distinct values you observe — and say so.

2. **Inventory the raw columns.** List every raw header exactly as written. This set is
   the source of truth for what must be declared.

3. **Classify each raw column / group.** For each survey field decide its type using
   §3. Group sibling columns that belong to one question (multi-select flags, grid rows,
   ranking items, allocation components) under a single parent block. A reliable tell is
   a shared stem with an `r1/r2/…` or similar suffix, or N columns sharing one scale.

4. **Choose IDs.** Keep the raw headers as the IDs wherever possible (least chance of a
   mismatch). If you *rename* for cleanliness, you must rename **both** the raw header
   and the datamap bracket, together, identically.

5. **Write each datamap block:** header → type-hint → option rows, using the §4 pattern
   for that type. Separate blocks with a blank row. Put metadata blocks (record/uuid/…)
   first by convention.

6. **Normalise the raw sheet:** header in row 1, one respondent per row, cell values in
   the conventions of §5 (especially: ranking cells sparse/blank; allocation sums ~100;
   multi-select 0/1). Strip formulas, merges, and stray columns.

7. **Reconcile.** Every raw column is either declared in the datamap or in the metadata
   allowlist; every datamap bracket has a matching raw column. Resolve every mismatch.

8. **Run the checklist in §8.** Then hand back the two sheets (or the combined workbook).

**When you're unsure, ask rather than guess.** Good questions to raise with the user:
"Is Q_ a ranking or a rating grid?"; "These 5 columns look like a select-all — should
they be one multi-select block?"; "Column X in the raw data has no labels anywhere —
what is it, and should it be cut or treated as metadata?"; "Should IDs stay as the
original messy headers or be cleaned up?"

---

## 8 · Validation checklist (run before returning output)

- [ ] Workbook has a `Datamap` sheet and a `Raw data` sheet, named so they auto-detect.
- [ ] Datamap content is only in cols A–C; data starts row 1; blocks separated by blank rows.
- [ ] Every block = header `[ID]: text` → one type-hint line → option rows (if any).
- [ ] Every `[ColumnID]` and every `[SubColID]` matches a raw header **exactly** (case-sensitive).
- [ ] Multi-column blocks (multi-select / grid / ranking / allocation) declare their
      scale/anchor rows *then* their `[SubColID]` rows.
- [ ] No two blocks share a `ColumnID`; no two sub-rows share a `SubColID`.
- [ ] NPS blocks have `Values: 0-10` **and** "recommend"/"NPS" in the question text.
- [ ] Ranking blocks have "rank" in the question text (or `Rank 1/2/…` option labels).
- [ ] Allocation blocks use `Values: 0-100` with only `[SubColID]` rows (no 1..100 codes).
- [ ] Raw sheet: header in row 1, one respondent per row; ranking cells blank where unranked.
- [ ] Every raw column is declared, or is in the allowlist
      (`record, uuid, date, start_date, status, termReason, nx, hSample, markers`).
- [ ] No merged cells, hidden rows, or formulas in either sheet.

---

## 9 · A complete miniature example

**`Datamap` sheet** (cols A | B | C; blank line = blank separator row):

```
[record]: Record number
Open numeric response

[uuid]: Participant identifier
Open text response

[hSample]: Hidden sample variable
Values: 1-2
        1   Bain respondent
        2   Other respondent

[Q1_EmploymentStatus]: What is your current employment status?
Values: 1-7
        1   Full-time
        2   Part-time
        3   Contract, freelance or gig-worker
        4   Retired
        5   Unemployed
        6   Student
        7   Other

[Q3_CustomerTypes]: What type of customers do you serve? Select all that apply.
Values: 0-1
        0   Not selected
        1   Selected
        [Q3_CustomerTypesr1]   B2B
        [Q3_CustomerTypesr2]   B2C
        [Q3_CustomerTypesr3]   Government
        [Q3_CustomerTypesr4]   Other

[Q15_Recommend]: How likely are you to recommend us? (NPS)
Values: 0-10
        0    Not at all likely
        10   Extremely likely

[Q70_BudgetChange]: What % is your sales budget changing in 2026 vs 2025?
Open numeric response
```

**`Raw data` sheet** — row 1 headers, then respondents:

```
record | uuid           | hSample | Q1_EmploymentStatus | Q3_CustomerTypesr1 | Q3_CustomerTypesr2 | Q3_CustomerTypesr3 | Q3_CustomerTypesr4 | Q15_Recommend | Q70_BudgetChange
1      | uuid-0001-2824 | 1       | 6                   | 1                  | 0                  | 0                  | 0                  | 3             | 20
2      | uuid-0002-8359 | 1       | 7                   | 0                  | 1                  | 0                  | 1                  | 5             | 0
3      | uuid-0003-7201 | 1       | 3                   | 0                  | 1                  | 1                  | 1                  | 5             | 10
```

Every raw header is either in the allowlist (`record`, `uuid`, `hSample`) or declared
in the datamap; every datamap bracket has a matching raw column. This pair converts
cleanly: one metadata + one ID + one hidden flag, one single-select cut, one
multi-select cut (4 options), one NPS cut, and one numeric distribution.

---

## 10 · Suggested prompt to give Claude Desktop

> *"Attached is `SURVCUT_FORMAT_GUIDE.md` (the target format spec) plus my raw survey
> export and its datamap/codebook. Convert my files into the SurvCut input format:
> a single `.xlsx` workbook with a `Datamap` sheet and a `Raw data` sheet, following
> the spec exactly. Classify each question per §3, group multi-column questions, keep
> the bracketed IDs matching the raw headers one-to-one, and run the §8 checklist before
> giving me the result. Flag anything ambiguous instead of guessing."*

---

*Derived from SurvCut Datamap Spec v1.0 and the reference dataset. Self-contained —
no codebase access required.*
