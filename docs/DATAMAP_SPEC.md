# Datamap Standard Specification

> The contract between your raw survey data and the cutter tool.
> Follow this format and the classifier will correctly identify every question type,
> match every raw column, and surface helpers for cross-cut analysis.

---

## 1 · Where the datamap lives

- **Single sheet** in a `.xlsx` workbook (separate file, OR an "Datamap" tab inside a combined workbook).
- **Sheet name**: `Datamap` (preferred). Any sheet whose name contains "datamap", "map", "codebook", "questions", or "metadata" is auto-detected.
- **Data starts in row 1**; no header row needed.
- **All content lives in columns A–C**. Other columns are ignored.

```
        ┌──── Col A ─────────────────────────┐ ┌── Col B ──┐ ┌── Col C ──┐
Row 1   │ [Q1_EmploymentStatus]: What is...  │ │           │ │           │
Row 2   │ Values: 1-7                        │ │           │ │           │
Row 3   │                                    │ │     1     │ │ Full-time │
Row 4   │                                    │ │     2     │ │ Part-time │
Row 5   │ (blank — separator)                │ │           │ │           │
Row 6   │ [Q2_EmployerType]: Which best...   │ │           │ │           │
        └────────────────────────────────────┘ └───────────┘ └───────────┘
```

---

## 2 · Anatomy of a question block

Every question is a contiguous block of rows:

| Row position | Column A | Column B | Column C |
|---|---|---|---|
| **Header row** *(required)* | `[ColumnID]: Question text` | (blank) | (blank) |
| **Type-hint row** *(required)* | `Values: 1-N` OR `Open numeric response` OR `Open text response` OR `Helper (type)` | (blank) | (blank) |
| **Option rows** *(0+ rows)* | (blank) | code (int or `[SubColID]`) | label |
| **Blank separator** *(required between blocks)* | (blank) | (blank) | (blank) |

### The header row — exact format

```
[ColumnID]: Question text shown to respondent
```

Rules:
- **`[ColumnID]`** must match the raw-data column header **exactly** (case-sensitive, no whitespace tolerance). This is the link.
- The bracket-id is followed by `:` then a space then the question text. No bullets, no numbering, no other punctuation in front.
- Question text can be any length but ≤300 chars is recommended for readable cuts.
- IDs may contain letters, digits, and underscore. No spaces inside brackets.

✅ Good:
```
[Q1_EmploymentStatus]: What is your current employment status?
[Q4_Employees]: How many employees does your company have?
[hSample]: Hidden sample variable (1=Bain respondent, 2=Other)
```

❌ Bad:
```
Q1_EmploymentStatus: What is your current employment status?   ← missing brackets
[ Q1 ]: What is...                                              ← spaces inside brackets
[Q1]: What is...                                                ← brackets don't match raw col header "Q1_EmploymentStatus"
1. [Q1]: What is...                                             ← leading numbering not allowed
```

---

## 3 · The type-hint row

Tells the classifier what kind of data to expect. Choose **exactly one** of these:

| Type-hint line | Meaning | Question type produced |
|---|---|---|
| `Values: 1-7` (any range `N-M`) | Categorical with integer codes 1..7 | `SINGLE_SELECT` *(or `GRID_*` if sub-columns present)* |
| `Values: 0-1` | Binary 0/1 flags | `MULTI_SELECT_BINARY` *(when sub-columns present)* or `BINARY_TWO_OPTIONS` |
| `Values: 0-10` + word `recommend` or `NPS` in question text | Net-promoter scale | `NPS` |
| `Open numeric response` | Free-form number | `DIRECT_NUMERIC` |
| `Open text response` | Free-form text | `OPEN_TEXT` *(excluded from cuts)* |

---

## 4 · Option rows (Col B + Col C)

For every value the question can take, one option row:

```
                  1     Full-time
                  2     Part-time
                  3     Contract, freelance or gig-worker
```

- **Column A**: always blank in an option row.
- **Column B**: the option code — either an integer (`1`, `2`, `3`...) or a sub-column ID `[Qxr1]`.
- **Column C**: the human-readable label.

Labels can include any characters except line breaks. Keep ≤120 chars for readable cuts.

---

## 5 · Question type patterns — one example each

### 5.1 Single-select

```
[Q1_EmploymentStatus]: What is your current employment status?
Values: 1-7
                  1     Full-time
                  2     Part-time
                  3     Contract, freelance or gig-worker
                  4     Retired
                  5     Unemployed
                  6     Student
                  7     Other
```

**Raw data**: ONE column named `Q1_EmploymentStatus`, values 1–7.

---

### 5.2 Multi-select binary (each option = its own raw column)

```
[Q3_CustomerTypes]: What type of customers does your organization serve? Select all that apply.
Values: 0-1
                  0     Not selected
                  1     Selected
                  [Q3_CustomerTypesr1]   We sell directly to other businesses (B2B)
                  [Q3_CustomerTypesr2]   We sell directly to consumers (B2C)
                  [Q3_CustomerTypesr3]   We sell to intermediaries
                  [Q3_CustomerTypesr4]   We sell to governmental organizations
                  [Q3_CustomerTypesr5]   Others
```

**Raw data**: FIVE columns — `Q3_CustomerTypesr1`, `Q3_CustomerTypesr2`, … `Q3_CustomerTypesr5` — each containing 0/1.

Note the structure: two integer-coded option rows (`0=Not selected`, `1=Selected`) describing what the values mean, followed by sub-column rows naming each flag column.

---

### 5.3 Grid rated (Likert / scale, multiple rows on same scale)

```
[Q31_Differentiation]: For each touchpoint, how clearly does your value proposition differentiate?
Values: 1-5
                  1     Not at all clear
                  2     Slightly clear
                  3     Moderately clear
                  4     Very clear
                  5     Extremely clear
                  [Q31_Differentiationr1]   Your website
                  [Q31_Differentiationr2]   Sales calls
                  [Q31_Differentiationr3]   Marketing collateral
                  [Q31_Differentiationr4]   Trade shows / events
```

**Raw data**: four columns — `Q31_Differentiationr1` … `Q31_Differentiationr4` — each containing 1–5.

---

### 5.4 Grid single-select (different scale per row)

```
[Q56_AIAdoption]: What is your adoption of AI in each of these capabilities?
Values: 1-5
                  1     No use case live
                  2     Exploring
                  3     Pilot
                  4     Scaling
                  5     Fully adopted
                  [Q56_AIAdoptionr1]   Lead generation
                  [Q56_AIAdoptionr2]   Sales forecasting
                  [Q56_AIAdoptionr3]   Customer success
                  [Q56_AIAdoptionr4]   Content generation
```

Same shape as 5.3 — the classifier infers grid-single-select vs grid-rated from row-count + scale.

---

### 5.5 Numeric allocation (each component is a numeric column, sums to 100)

```
[Q13_RevSplit]: Allocate 100% across these revenue sources for 2026.
Values: 0-100
                  [Q13_RevSplitr1c1]   Existing customers — same products
                  [Q13_RevSplitr2c1]   Existing customers — new products
                  [Q13_RevSplitr3c1]   New customers — same products
                  [Q13_RevSplitr4c1]   New customers — new products
```

**Raw data**: four columns each holding a percentage. The blocker line `Values: 0-100` tells the classifier this is a 0-100 allocation, NOT a 1-100 categorical scale.

---

### 5.6 Direct numeric (single open response)

```
[Q70_BudgetChange]: What percentage is your sales budget changing in 2026 vs. 2025?
Open numeric response
```

**Raw data**: one numeric column.

---

### 5.7 NPS (special — both keywords needed)

```
[Q15_Recommend]: How likely are you to recommend us to a colleague? (NPS)
Values: 0-10
                  0     Not at all likely
                  10    Extremely likely
```

The `recommend` and `NPS` keywords in the question text + `Values: 0-10` together trigger NPS classification (promoters/passives/detractors split).

---

### 5.8 Ranking

```
[Q17_Challenges]: Rank your top 5 challenges for 2026.
Values: 1-18
                  [Q17_Challengesr1]    Cost pressure
                  [Q17_Challengesr2]    Talent shortage
                  [Q17_Challengesr3]    Regulatory complexity
                  ...
                  [Q17_Challengesr18]   Other
```

**Raw data**: 18 columns — `Q17_Challengesr1` … `Q17_Challengesr18` — each containing the rank (1 = top choice, blank = not in top-N).

Detection rule: if a multi-column block's typical value pattern is sparse small integers (1-N where N ≪ row count), the classifier picks `RANK_ORDER` over `MULTI_SELECT_BINARY`.

---

### 5.9 Open text (excluded from cuts)

```
[Q18_OpenComments]: Anything else you'd like to share?
Open text response
```

**Raw data**: one text column. Classifier flags as `OPEN_TEXT`, skips it from all cuts. (You'd still see these strings in any open-text bucket sheets.)

---

### 5.10 Metadata / system columns

```
[record]: Record number
Open numeric response

[uuid]: Participant identifier
Open text response

[date]: Completion timestamp
Open text response

[hSample]: Hidden sample flag (1=Bain, 2=other)
Values: 1-2
                  1     Bain respondent
                  2     Other respondent
```

The classifier treats columns named in a small allowlist (`record`, `uuid`, `nx`, `status`, `termReason`, `date`, `start_date`, `markers`, `hSample`, …) as metadata: visible in audit but excluded from cuts.

---

## 6 · Helper columns are out of scope (and out of the input)

**Helpers do not appear in the raw data you give the cutter.**

In the analyst workflow, helpers are pre-computed columns a human adds to raw data **after** the cutter has produced its single cuts — when a follow-up cross-cut or filter is too complex to write as a single Excel formula. They are a post-processing scratch space, not an input to the automated pipeline.

Implication for this spec:

- The raw data file fed to the cutter is "clean": every column corresponds to a survey question.
- The datamap declares **every** column in that raw data.
- The cutter has no concept of helpers and no special handling for them.

If, after running the cutter, an analyst later adds a helper column to their working file, that is a manual downstream activity — the cutter never sees it.

---

## 7 · Optional sections at the bottom

### 7.1 Section markers (improve readability, don't affect parsing)

A row whose Column A starts with `>>` or `Section:` is a visual divider — the parser ignores it but it helps you organise the datamap:

```
>> Demographics

[Q1_EmploymentStatus]: ...
Values: 1-7
   1   Full-time
   ...

>> Growth questions

[Q13_2]: ...
```

### 7.2 Comments

A row whose Column A starts with `#` is ignored. Use for inline notes:

```
# These Q8 sub-cells are skip-pattern dependent on Q7 sector
[Q8_Subcategoryr2_1]: ...
```

---

## 8 · Validation checklist

Before you feed the datamap to the cutter, verify:

- [ ] Every block has a header row (`[ID]: text`), a type-hint row, then option rows, then a blank.
- [ ] Every `[ColumnID]` matches a column in raw data exactly (case-sensitive).
- [ ] Multi-column questions (multi-select, grid, ranking, allocation) declare the parent header, scale options, then `[SubColID]` rows.
- [ ] No two questions share the same `ColumnID`.
- [ ] No two sub-columns share the same `SubColID`.
- [ ] Blank rows separate every question block.
- [ ] No formulas, merged cells, or hidden rows in the datamap sheet.
- [ ] **Every column in raw data is declared in the datamap** (apart from the standard metadata allowlist — `record`, `uuid`, `date`, `start_date`, `status`, `termReason`, `nx`, `hSample`, `markers`).

---

## 9 · How the tool maps the datamap to raw data

```
For each block in the datamap:
   ColumnID = the bracketed string in the header row
   If ColumnID exists in raw data:
       Build a QuestionSpec with type from the type-hint
       Attach option_map from option rows
       Sub-column blocks → expand to one QuestionSpec per [SubColID]
   Else:
       Add a HARD warning "datamap declares column X but raw data has no such column"
       Skip the question
After processing the datamap:
   For each raw column NOT mentioned in the datamap (and not in the metadata
   allowlist — record, uuid, date, start_date, status, termReason, nx, hSample,
   markers):
       Add a HARD warning "raw data has column X with no datamap entry"
       The column is preserved in the raw data sheet but produces no cut.
       This is treated as a data-prep issue, not a normal state.
```

This is why the **`[ColumnID]` must match exactly** — that's the join key between the two files.

---

## 10 · Quick reference card

```
QUESTION TYPE          TYPE-HINT LINE              SHAPE OF OPTION ROWS
─────────────────────  ──────────────────────────  ───────────────────────────────
Single-select          Values: 1-N                 1   Label1
                                                   2   Label2 ...

Multi-select binary    Values: 0-1                 0   Not selected
                                                   1   Selected
                                                   [Q##r1]   Sub1 label
                                                   [Q##r2]   Sub2 label ...

Grid rated/select      Values: 1-N                 1   Scale1
                                                   ...
                                                   N   ScaleN
                                                   [Q##r1]   Row1 label ...

Numeric allocation     Values: 0-100               [Q##r1c1]   Component1 ...

Direct numeric         Open numeric response       (no option rows)

NPS                    Values: 0-10                0   Not at all likely
                                                   10  Extremely likely
                       (Q text must contain
                        "recommend" or "NPS")

Ranking                Values: 1-K                 [Q##r1]   Item1 label ...

Open text              Open text response          (no option rows)
```

> **Helpers** don't appear in this reference because they don't appear in either
> input. Raw data given to the cutter is expected to be clean — every column
> declared. Helpers are an analyst's post-processing artifact, downstream of
> the cutter.

---

## 11 · Worked example — a tiny full datamap

```
[record]: Record number
Open numeric response

[uuid]: Participant identifier
Open text response

[hSample]: Hidden sample variable
Values: 1-2
                  1     Bain respondent
                  2     Other respondent

[Q1_EmploymentStatus]: What is your current employment status?
Values: 1-7
                  1     Full-time
                  2     Part-time
                  3     Contract
                  4     Retired
                  5     Unemployed
                  6     Student
                  7     Other

[Q3_CustomerTypes]: What type of customers does your organization serve?
Values: 0-1
                  0     Not selected
                  1     Selected
                  [Q3_CustomerTypesr1]   B2B
                  [Q3_CustomerTypesr2]   B2C
                  [Q3_CustomerTypesr3]   Government
                  [Q3_CustomerTypesr4]   Other

[Q15_Recommend]: How likely are you to recommend us? (NPS)
Values: 0-10
                  0     Not at all likely
                  10    Extremely likely

[Q70_BudgetChange]: What percentage is your sales budget changing in 2026 vs 2025?
Open numeric response

[Q31_Differentiation]: For each touchpoint, how clearly do you differentiate?
Values: 1-5
                  1     Not at all
                  2     Slightly
                  3     Moderately
                  4     Very
                  5     Extremely
                  [Q31_Differentiationr1]   Website
                  [Q31_Differentiationr2]   Sales calls
                  [Q31_Differentiationr3]   Marketing collateral
```

Corresponding raw data column headers (row 1):

```
record  uuid  hSample  Q1_EmploymentStatus  Q3_CustomerTypesr1  Q3_CustomerTypesr2
Q3_CustomerTypesr3  Q3_CustomerTypesr4  Q15_Recommend  Q70_BudgetChange
Q31_Differentiationr1  Q31_Differentiationr2  Q31_Differentiationr3
```

Every column in raw data is either in the metadata allowlist (`record`, `uuid`, `hSample`) or declared in the datamap. Clean 1-to-1 mapping.

That datamap + that raw data set will produce:
- 1 metadata column (`record`), 1 ID column (`uuid`), 1 hidden flag (`hSample`)
- 1 single-select cut (`Q1_EmploymentStatus`)
- 1 multi-select cut (`Q3_CustomerTypes` → 4 rows of % selected)
- 1 NPS cut (`Q15_Recommend`)
- 1 numeric distribution (`Q70_BudgetChange`)
- 1 grid-rated cut (`Q31_Differentiation` → 3 rows of mean ratings)

All declared questions are available for cross-cuts in the UI by picking any two of the above.

---

## 12 · What's intentionally NOT in the datamap

These are **out of scope** for the datamap. They live elsewhere:

- **Cross-cut declarations** — picked in the UI per run, not declared up front.
- **Filter configuration** — picked in the UI from the demographic questions in this datamap.
- **Theme groupings** — picked in the UI to organise output sheets.
- **Skip / conditional logic** — inferred from missing data, not declared.
- **Cell-formatting / colour rules** — handled by the exporter.
- **Analyst helper columns** — created downstream of the cutter, never in the input. See §6.

The datamap is **only** "what columns exist, what type, what their labels are".

---

*Spec version 1.0 — 2026-06-22*
