# SurvCut — Tech Walkthrough

> A presenter's guide for explaining SurvCut to the engineering team.
> Every step below is grounded in the actual engine code (links are clickable).
> Parsing and validation get the deepest treatment, since that's where the logic lives.

---

## 0 · How to run the call (suggested arc, ~25–30 min)

| Min | Segment | What you say / show |
|----|---------|---------------------|
| 0–3 | **The problem** | Analysts get a raw survey export + a datamap (codebook). Turning that into banner tables / cross-tabs in Excel is hours of manual, error-prone work. |
| 3–6 | **What SurvCut does** | Upload one `.xlsx` → get a live-formula Excel workbook (every cut, filter dropdown, cross-cut) in under a minute. Demo the happy path with `docs/sample_datamap_and_rawdata.xlsx`. |
| 6–10 | **Architecture** | Three layers, one hard boundary: a pure-Python **engine**, a thin **API**, a **web** shell. The engine is the product; everything else is swappable. |
| 10–22 | **The pipeline** | Walk the 7 steps below. Spend your time on **Parse** and **Validate** — that's the interesting logic. |
| 22–27 | **A real bug** | Tell the story of the BCN upload that showed "Internal Server Error" (§11). It demonstrates the strict-parser philosophy *and* an error-handling gap — good hook for a tech audience. |
| 27–30 | **Roadmap + Q&A** | Phase-2 items (segmentation, piping, async jobs) and the anticipated questions in §12. |

**Framing line to open with:** *"It's a deterministic compiler for surveys. Datamap in, typed schema out, Excel formulas emitted. No ML in the hot path — every output is traceable to a rule."*

---

## 1 · The 30-second "what & why"

- **Input:** one combined workbook — a `Datamap` sheet (the codebook: what each column is, its type, its value labels) and a `Raw data` sheet (one row per respondent).
- **Output:** a formatted `.xlsx` where every number is a **live Excel formula** (`COUNTIFS` / `AVERAGEIFS` / `VLOOKUP`), plus filter dropdowns and cross-cut sheets. Analysts can keep slicing in Excel without re-running the tool.
- **Why it's built this way:** the datamap *is* a contract. If we can parse it deterministically and classify each question, the whole cut layout follows mechanically. So the tool is essentially a **parser + type system + code generator**, not a stats package.

---

## 2 · Architecture — the layer boundary is the whole point

```
┌──────────────────────────────────────────────────────────────┐
│  web/    Next.js 15 + React   → wizard UI, calls the API       │
│  api/    FastAPI              → HTTP endpoints, session cache   │
│  engine/ cutter_engine (pip)  → ALL the logic. No HTTP, no UI.  │
└──────────────────────────────────────────────────────────────┘
```

- **`engine/`** has zero web/HTTP dependencies. You can `pip install` it and run the whole pipeline from a Python REPL. This is what makes it testable and reusable.
- **`api/`** is a thin adapter: it receives the upload, calls engine functions, caches the result under a `session_id`, and returns JSON.
- **`web/`** is a 5-step wizard (Upload → Validate → Themes → Cross Cuts → Generate) that just calls the API.

**One deliberate seam to point out:** type identification is isolated in its own module ([question_type_detector.py](SurvCut/engine/src/cutter_engine/question_type_detector.py)) so the current heuristics can later be swapped for an explicit `Type: ranking` declaration in the datamap **without touching anything else**. Everyone downstream calls `detect_type(block)` and trusts the answer.

---

## 3 · The pipeline at a glance (the spine of the walkthrough)

```
   upload .xlsx
       │
   ①   ▼  io_layer.load_combined()          pick sheets, read bytes-safe
       │        → raw_df (DataFrame) + datamap_rows (list of (A,B,C) tuples)
   ②   ▼  datamap_parser.parse_datamap_from_rows()   STATE MACHINE
       │        → list[ParsedBlock]          raw shape per question
   ③   ▼  question_type_detector.detect_type()       9-RULE DECISION TREE
       │        → (QuestionType, scale_range) per block
   ④   ▼  classifier.classify()              assemble typed schema
       │        → SurveySchema (QuestionSpec[])
   ⑤   ▼  validator.validate()               raw ↔ datamap cross-check
       │        → ValidationReport (errors / warnings)
       │  ── schema + raw_df cached under session_id ──
   ⑥   ▼  single_cut / cross_cut             compute preview tables
   ⑦   ▼  exporter.export()                  emit LIVE-FORMULA .xlsx
       │
   download workbook
```

Steps ①–⑤ all happen inside the **`POST /api/upload`** handler ([upload.py](SurvCut/api/app/routers/upload.py)). Steps ⑥–⑦ happen on the later `/cuts`, `/crosscuts`, and `/export` calls.

---

## 4 · Step ① — Ingest ([io_layer.py](SurvCut/engine/src/cutter_engine/io_layer.py))

**Job:** turn an uploaded file into two clean in-memory objects.

- Reads everything through a `BytesIO` buffer first — deliberate, because OneDrive Files-on-Demand can transiently lock a file mid-read. Never touches the path twice.
- **Sheet auto-detection** by name (`_pick_datamap_sheet`, `_pick_raw_sheet`):
  - Datamap sheet = first sheet whose name contains `datamap` / `data map` / `codebook` / `questions` / `metadata`.
  - Raw sheet = first whose name contains `raw data` / `rawdata` / `raw` / `responses` / `data sheet`; **fallback = the widest sheet** that isn't the datamap.
- Returns `LoadedInputs`: `raw_df` (a pandas DataFrame, header = row 1) and `datamap_rows` (only columns **A, B, C** of the datamap sheet, as tuples).

**Talking point:** the datamap is read as *positional* `(A, B, C)` tuples, not a DataFrame — because the datamap isn't tabular, it's a **line-oriented grammar**. That's what the next step parses.

---

## 5 · Step ② — Parse the datamap ★ (deep dive) — [datamap_parser.py](SurvCut/engine/src/cutter_engine/datamap_parser.py)

This is the heart of the tool. The datamap is a sequence of **question blocks** separated by blank rows, and the parser is a **3-state finite state machine** that walks the rows top to bottom.

### 5.1 The states

```
        ┌──────────────────┐
        │ BETWEEN_BLOCKS   │ ◄── start. Waiting for a header "[id]: text" in col A.
        └───────┬──────────┘
                │ header row seen  → capture column_id + question_text
                ▼
        ┌──────────────────┐
        │ EXPECT_TYPE_HINT │ ◄── the very next non-blank row must be the type hint.
        └───────┬──────────┘
                │ type-hint row seen → store hint
                ▼
        ┌──────────────────┐
        │ IN_OPTIONS       │ ◄── consume option rows / sub-column rows until…
        └───────┬──────────┘
                │ blank row  → flush() the finished block, reset(), back to top
                ▼
        BETWEEN_BLOCKS
```

`flush()` freezes the in-progress buffers into an immutable `ParsedBlock` and appends it; `reset()` clears the buffers ([datamap_parser.py:150](SurvCut/engine/src/cutter_engine/datamap_parser.py#L150)). A trailing block at EOF is flushed too.

### 5.2 How each row is classified (the row grammar)

For every row `(A, B, C)`, in this order ([datamap_parser.py:176](SurvCut/engine/src/cutter_engine/datamap_parser.py#L176)):

| Test | Action |
|------|--------|
| A, B, C **all blank** | End of block: `flush()` + `reset()` → `BETWEEN_BLOCKS`. |
| Col A starts with `>>`, `Section:`, or `#` | Visual divider / comment → **skip** (no effect on parsing). |
| Col A matches `^\[(id)\]\s*:\s*(text)$` | **Header row.** Start a new block; capture `column_id` + `question_text`; → `EXPECT_TYPE_HINT`. |
| Col A has other text, state = `EXPECT_TYPE_HINT` | It's the **type hint** (`Values: M-N` / `Open numeric response` / `Open text response`). Store it; → `IN_OPTIONS`. |
| Col A blank, Col B = `[SubColID]`, state = `IN_OPTIONS` | **Sub-column** declaration (grid/multi/ranking/allocation). Append to `sub_columns`. |
| Col A blank, Col B = a code, state = `IN_OPTIONS` | **Option row.** Coerce B to int→float→str, pair with the Col C label, append to `scale_options`. |
| Col A blank, Col C = `[pipe: helper]` on a sub-row | Record a **piping source** (captured now, consumed in Phase 2). |

### 5.3 The error philosophy — this is the key design point

The parser is **strict where ambiguity would corrupt output, lenient where it can recover**:

- **Hard stop → `raise DatamapParseError`** ([:216](SurvCut/engine/src/cutter_engine/datamap_parser.py#L216)) when Col A has text that isn't a header, divider, or comment **while between blocks**. There's no safe guess — this is exactly the failure the BCN file hit at row 145 (a bare `Q8:` instead of `[Q8]:`). Also hard-stops if a type-hint row is missing (Col A blank right after a header, [:241](SurvCut/engine/src/cutter_engine/datamap_parser.py#L241)).
- **Soft recover → append a warning, keep going** for things that are odd but unambiguous: a missing blank-row separator before a new header ([:200](SurvCut/engine/src/cutter_engine/datamap_parser.py#L200)), an unrecognised type-hint pattern ([:227](SurvCut/engine/src/cutter_engine/datamap_parser.py#L227)), a label in Col C with no code in Col B. These warnings ride along on the block and resurface in validation.

**Talking point:** "It fails loudly on structure it can't interpret, and warns on structure it can interpret but suspects is a mistake. Warnings never block; a `DatamapParseError` stops the upload with a row number."

### 5.4 The output: `ParsedBlock`

One per question, immutable ([models.py:42](SurvCut/engine/src/cutter_engine/models.py#L42)):
`column_id`, `question_text`, `type_hint` (raw string), `scale_options` (code→label pairs), `sub_columns` (`[SubColID]`→label pairs), `pipe_sources`, `source_row_in_datamap` (for error messages), `warnings`. **No type yet** — the parser only captures *shape*.

---

## 6 · Step ③ — Detect the type ★ — [question_type_detector.py](SurvCut/engine/src/cutter_engine/question_type_detector.py)

`detect_type(block) -> (QuestionType, scale_range)`. Pure function of the type-hint + the block's shape. **No data inspection** — it never looks at the raw values, only at what the datamap declared. Rules, top wins ([:103](SurvCut/engine/src/cutter_engine/question_type_detector.py#L103)):

```
has_subs = block has ≥1 [SubColID] row

1.  hint == "Open numeric response"                    → DIRECT_NUMERIC
2.  hint == "Open text response"                       → OPEN_TEXT
3.  hint isn't "Values: M-N"                           → UNKNOWN
4.  range (0,10)  & text has "recommend"/"nps" & no subs→ NPS
5.  range (0,100) & has_subs                           → NUMERIC_ALLOCATION
6.  range (0,1)   & has_subs                           → MULTI_SELECT_BINARY
7.  range (0,1)   & no subs                            → BINARY_TWO_OPTIONS
8a. has_subs & is_ranking (text has "rank", or ≥2      → RANKING
        option labels look like "Rank 1"/"Rank 2")
8b. has_subs (any other range)                         → GRID_RATED
9.  no subs (default)                                  → SINGLE_SELECT
```

Two nuances worth calling out:
- **NPS is a promotion, not a requirement.** A `0-10` single column *without* the keyword safely falls through to `SINGLE_SELECT` — both are valid; NPS just adds the Promoter/Passive/Detractor split.
- **Ranking vs grid is decided by the datamap, not the numbers** — the old "big range = ranking" numeric heuristic was removed because it false-positived on 7-point Likert grids. Now it keys off the word "rank" in the text (`_is_ranking_question`, [:74](SurvCut/engine/src/cutter_engine/question_type_detector.py#L74)).

The 12 possible types live in the `QuestionType` enum ([models.py:17](SurvCut/engine/src/cutter_engine/models.py#L17)).

---

## 7 · Step ④ — Classify into a schema — [classifier.py](SurvCut/engine/src/cutter_engine/classifier.py)

`classify(parsed, raw_df)` turns each `ParsedBlock` into a `QuestionSpec` and bundles them into a `SurveySchema`. For each block ([:59](SurvCut/engine/src/cutter_engine/classifier.py#L59)):

1. Call `detect_type()`.
2. Resolve **`raw_columns`** — the single most important field downstream: the sub-column IDs if the block has sub-columns, else the parent `column_id`. Every cut/export reads this to know which DataFrame columns to touch.
3. Build `option_map` (code→label) and `sub_column_labels`.
4. **Metadata override:** if `column_id` is in the `METADATA_ALLOWLIST` — `{record, uuid, date, start_date, status, termReason, nx, hSample, markers}` ([models.py:33](SurvCut/engine/src/cutter_engine/models.py#L33)) — force type `METADATA`.
5. **Eligibility:** `METADATA`, `OPEN_TEXT`, and `UNKNOWN` are marked `analysis_eligible = False` with a reason; everything else is eligible for cuts.
6. **`is_demographic`** flag: keyword match on the question text (sector/region/employees/…). Informational only — the UI uses it to suggest filter slots.

`SurveySchema` also picks the respondent-id column (`record` → `uuid` → … → first column) and exposes helpers like `analysis_questions()`.

---

## 8 · Step ⑤ — Validate ★ (deep dive) — [validator.py](SurvCut/engine/src/cutter_engine/validator.py)

**Job:** prove the datamap and the raw data are mutually consistent **before** we generate anything. This is pure set algebra over column names ([:32](SurvCut/engine/src/cutter_engine/validator.py#L32)).

### 8.1 The three sets

```
raw_set          = every column header in the Raw data sheet
declared_columns = every column the datamap claims exists
                   (for each block: its sub-col IDs if it has sub-cols, else its column_id)
METADATA_ALLOWLIST = the 9 known system columns
```

### 8.2 The two checks

| Check | Definition | Level | Meaning |
|-------|-----------|-------|---------|
| **Raw undeclared** | in `raw_set`, **not** in `declared_columns`, **not** in allowlist | ⚠️ **WARNING** | A raw column nobody declared. Usually a data-prep slip or an analyst helper. Column is kept, but produces no cut. |
| **Datamap missing** | in `declared_columns`, **not** in `raw_set` | ⛔ **ERROR** | The datamap promised a column the raw data doesn't have. Match is **case-sensitive**. |

Plus: every parser warning from Step ② is surfaced here as a soft `PARSER_WARNING` issue ([:44](SurvCut/engine/src/cutter_engine/validator.py#L44)), so all diagnostics land in one report.

### 8.3 Why the asymmetry (WARNING vs ERROR)

- An **undeclared raw column** is recoverable — we just don't cut it. So it warns.
- A **missing declared column** means any cut referencing it would break (a formula pointing at a column that isn't there). So it's a hard error.

### 8.4 The gate

`ValidationReport.has_errors` ([models.py:126](SurvCut/engine/src/cutter_engine/models.py#L126)) is the export gate. The upload response splits issues into `validation_errors` and `validation_warnings`; the web wizard **disables "Continue to Validate/Generate" when `validation_errors.length > 0`** ([upload/page.tsx:194](SurvCut/web/app/upload/page.tsx#L194)). Warnings are shown but never block.

**Talking point:** "Validation is the contract enforcer. The join key between the two sheets is the bracketed ID matching the raw header exactly — this step is where we prove that join is total."

---

## 9 · Step ⑥ — Compute cuts (preview) — `single_cut` / `cross_cut`

For the on-screen preview and the API's `/cuts` and `/crosscuts` endpoints, the engine computes results in Python:

- **Single cut:** dispatch by `question_type` to a per-type computer (single-select = counts+%; grid = means; NPS = 3 buckets; ranking = %top-3; etc.). Every handler is wrapped in try/except so one bad question can't crash the run — it returns an empty result with the exception as a warning.
- **Cross cut:** deliberately asymmetric — the **row** dimension must be categorical (single/binary/multi/NPS), while the **column** dimension's type decides the cell semantics (counts vs mean vs %top-3). Grid/ranking/numeric can't be a row axis.

*(Keep this brief on the call unless asked — the Excel output is where cuts actually "live"; the Python versions are for preview.)*

---

## 10 · Step ⑦ — Export the workbook — `exporter.py`

Emits the `.xlsx` where **every number is a formula, not a value**:

- Per-theme sheet: a Master Check cell, a Global Filters block (dropdowns backed by a Validation sheet), then one block per question.
- Filters work via a `VLOOKUP` that translates the dropdown **label** back to the underlying **numeric code**, so label dropdowns still filter numeric-coded raw data. Everything is wrapped in `IFERROR`.
- **Why live formulas:** the analyst can change a filter dropdown in Excel and every cut recomputes — no round-trip to the tool. That's the core value prop; emphasise it.

*(In our test run, a 10-respondent sample produced a 7-sheet workbook with 166 live formulas.)*

---

## 11 · A real debugging story to tell (great for a tech audience)

We uploaded a real project file (`BCN_LTB_raw_data …`) and the UI showed a bare **"Internal Server Error."** The debugging had two layers, and both are instructive:

1. **The masked error.** Sent straight to the API, the same file returns a clean **HTTP 400** with an exact message: *"Row 145: unrecognised content in column A … 'Q8: Which of the following…'"*. Through the **web proxy**, though, the Next.js dev server logged `Failed to proxy … socket hang up (ECONNRESET)` and returned its own generic **500 page**. So the useful message was being **swallowed by the proxy hop** on a 5.5 MB upload.
2. **The real cause.** The file's datamap mixes formats — 86 headers correctly bracketed `[Q1]:`, but **131 written bare** `Q8:`. The strict parser (§5.3) hard-stops at the first one. Fixing row 145 alone just surfaces the next of 131.

**Two takeaways for the team:** (a) the strict-parser design did its job — it refused to guess and pointed at the exact row; (b) we have an **error-passthrough gap** — the API's real 400 should reach the UI instead of being masked as a 500. That's a concrete Phase-2 ticket (wrap `classify`/`validate`, make the proxy relay upstream errors, and handle the early-reject connection reset).

---

## 12 · Anticipated questions & answers

- **"Is there ML in this?"** No, not in the hot path. Classification is a deterministic rule tree. Type detection is isolated so it *could* be replaced, but today every output is traceable to a rule. (Phase 2 has optional ML for theme/cross-cut *suggestions* only.)
- **"What happens on a malformed datamap?"** Structural ambiguity → `DatamapParseError` with a row number (hard 400). Recoverable oddities → warnings that don't block. A declared-but-missing column → validation ERROR that blocks export.
- **"How does it scale?"** Phase 1 is synchronous and in-process (session cache in memory). The endpoint signatures are already shaped for a Celery/Redis async migration (Phase 2) without changing the engine.
- **"Can we reuse the engine elsewhere?"** Yes — that's the point of the layer boundary. `pip install ./engine` and call `load_combined → parse → classify → validate → export` from any Python context. No web dependency.
- **"Why Excel formulas instead of static values?"** So analysts re-slice interactively in Excel (change a filter, everything recomputes) without re-running the tool.
- **"Case sensitivity?"** The datamap `[ID]` ↔ raw header join is case-sensitive and whitespace-exact. That's enforced in validation, by design.

---

## 13 · File map (where each thing lives)

| Concern | File |
|--------|------|
| Data contracts (all dataclasses, enums, allowlist) | [engine/src/cutter_engine/models.py](SurvCut/engine/src/cutter_engine/models.py) |
| Ingest / sheet detection | [engine/src/cutter_engine/io_layer.py](SurvCut/engine/src/cutter_engine/io_layer.py) |
| **Datamap parser (state machine)** | [engine/src/cutter_engine/datamap_parser.py](SurvCut/engine/src/cutter_engine/datamap_parser.py) |
| **Type detection (swap-point)** | [engine/src/cutter_engine/question_type_detector.py](SurvCut/engine/src/cutter_engine/question_type_detector.py) |
| Classification → schema | [engine/src/cutter_engine/classifier.py](SurvCut/engine/src/cutter_engine/classifier.py) |
| **Validation** | [engine/src/cutter_engine/validator.py](SurvCut/engine/src/cutter_engine/validator.py) |
| Single / cross cuts | `engine/src/cutter_engine/single_cut.py`, `cross_cut.py` |
| Excel export | `engine/src/cutter_engine/exporter.py` |
| Upload endpoint (orchestrates ①–⑤) | [api/app/routers/upload.py](SurvCut/api/app/routers/upload.py) |
| Input format spec (for data prep) | [SURVCUT_FORMAT_GUIDE.md](SurvCut/SURVCUT_FORMAT_GUIDE.md) |
| Deeper engine reference | [docs/QUESTION_TYPES_REFERENCE.md](SurvCut/docs/QUESTION_TYPES_REFERENCE.md) |

---

*Grounded in the engine source as of this walkthrough. Pair with `SURVCUT_FORMAT_GUIDE.md` (data-prep contract) and `docs/QUESTION_TYPES_REFERENCE.md` (cut/export internals).*
