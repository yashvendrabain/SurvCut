# Survey Insight Engine — Data Schema

> Complement to [`TOOL_STRUCTURE.md`](TOOL_STRUCTURE.md). Where TOOL_STRUCTURE describes **what files exist**, this document describes **what data flows through them** — the contracts that connect every stage of the pipeline.

The authoritative source for every dataclass below is [`src/models.py`](../src/models.py). All inter-stage data crosses through those frozen dataclasses; no module returns ad-hoc dicts to its caller.

---

## 1 · End-to-end data flow

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐    ┌──────────────┐
│  RAW FILES  │──▶│  DataMap +      │──▶│  SurveySchema    │──▶│ SingleCut +    │──▶│   WORKBOOK   │
│ .xlsx /.csv │    │  pd.DataFrame   │    │  (typed         │    │ CrossCut       │    │  .xlsx with  │
│  .docx      │    │ + LoadReport    │    │   questions)    │    │   Results      │    │  formulas    │
└─────────────┘    └─────────────────┘    └──────────────────┘    └────────────────┘    └──────────────┘
   Stage 1            Stage 2                Stage 3                Stage 4                Stage 5
   io.py +            datamap_parser.py +    question_              single_cut/            excel_exporter.py
   word_survey_       raw_decoder.py         classifier.py          engine.py
   parser.py
```

Every stage produces a **frozen dataclass**; the next stage consumes it. Errors at any stage propagate to a `SkipRecord` rather than crashing.

---

## 2 · Stage 1 — File intake

Detects which of three upload scenarios you're in and routes accordingly.

| Scenario | Trigger | Loader |
|---|---|---|
| **A — separate files** | 2+ files (`.csv`+`.xlsx`) | [`_load_scenario_a`](../src/io.py) — filename keywords + datamap-score fallback to identify roles |
| **B — combined `.xlsx`** | exactly one `.xlsx`, no `.csv` | [`_load_scenario_b`](../src/io.py) — sheet-name keywords pick raw vs map |
| **C — Word datamap** | any `.docx` present | [`_load_scenario_c`](../src/io.py) → [`word_survey_parser.parse_word_survey`](../src/word_survey_parser.py) |

### Output: `LoadReport`

```python
@dataclass(frozen=True, slots=True)
class LoadReport:
    scenario: Literal["A_separate_files", "B_combined_xlsx", "C_word_datamap"]
    raw_data_source: str          # filename or "sheet:Name"
    datamap_source: str
    raw_rows: int
    raw_columns: int
    questions_parsed: int
    parser_warnings: tuple[str, ...]
    detection_notes: list[str]
    manual_cohort_input: ManualCohortInput | None   # winners/laggards from embedded sheet
```

---

## 3 · Stage 2 — DataMap

`src/datamap_parser.py` is a state machine over the datamap workbook that produces a list of `ParsedQuestion`:

```python
class ParsedQuestion(TypedDict):
    canonical_id: str                              # e.g. "Q4"
    raw_id: str                                    # the raw header (case-preserved)
    question_text: str                             # human-readable prompt
    type_hint: "values_range" | "open_numeric" | "open_text" | None
    value_range: tuple[int, int] | None            # e.g. (1, 10) for NPS
    options: list[tuple[int | str, str]]           # [(code, label), ...]
    sub_columns: list[tuple[str, str]]             # grids/multi rows
    parent_canonical_id: str | None                # links sub-question to parent
    source_row: int                                # for error pinpointing
    warnings: list[str]
    children: list[ParsedQuestion]                 # nested grids
    conditional_on: str | None                     # gating question id
    label_to_numeric_value: dict[str, float]       # ordinal label → score
    na_label_set: frozenset[str]                   # labels treated as "no answer"
    allowed_numeric_range: tuple[float, float] | None
```

Wrapped in:

```python
class DataMap(TypedDict):
    questions: list[ParsedQuestion]
    source_path: str
    sheet_name: str
    total_rows_in_sheet: int
    parser_warnings: list[str]
```

---

## 4 · Stage 3 — Typed schema

[`question_classifier.classify_questions`](../src/question_classifier.py) turns each `ParsedQuestion` into a `QuestionSpec` and tags eligibility for analysis.

### Question types ([`QuestionType` enum](../src/models.py))

| Enum | Layout | Engine module |
|---|---|---|
| `SINGLE_SELECT` | one column, one code per respondent | [`single_cut/_single_select.py`](../src/single_cut/_single_select.py) |
| `MULTI_SELECT_BINARY` | many columns (`Q9r1`, `Q9r2`…), each 0/1 | [`single_cut/_multi_select.py`](../src/single_cut/_multi_select.py) |
| `GRID_SINGLE_SELECT` | rows × one selection per row | [`single_cut/_grid.py`](../src/single_cut/_grid.py) |
| `RANK_ORDER` | many columns (one per item, value = rank) | [`single_cut/rank_order.py`](../src/single_cut/rank_order.py) |
| `GRID_RATED` | rows × ordinal scale per row | [`single_cut/grid_rated.py`](../src/single_cut/grid_rated.py) |
| `GRID_BINARY_SELECT` | rows × cols of 0/1 cells | [`single_cut/grid_binary_pivot.py`](../src/single_cut/grid_binary_pivot.py) |
| `NUMERIC_ALLOCATION` | many columns that sum to 100% | [`single_cut/_numeric.py`](../src/single_cut/_numeric.py) |
| `DIRECT_NUMERIC` | one numeric column | [`single_cut/_numeric.py`](../src/single_cut/_numeric.py) |
| `NPS` | one column 0–10 | [`single_cut/nps.py`](../src/single_cut/nps.py) |
| `OPEN_TEXT` | free text | *(excluded from cuts)* |
| `DEMOGRAPHIC_OR_SEGMENT` | flagged for filter UI | classified, not cut |
| `METADATA_OR_ID` | `record`, `uuid`, dates | excluded |
| `UNKNOWN` | classifier couldn't decide | excluded |

### `QuestionSpec`

```python
@dataclass(frozen=True, slots=True)
class QuestionSpec:
    question_id: str                # surface label (e.g. "Q4")
    canonical_id: str               # the data-column key (== Q4)
    question_text: str
    question_type: QuestionType
    raw_columns: tuple[str, ...]    # which DataFrame columns belong here
    option_map: dict[int|str, str]  # code → human label
    value_range: tuple[int,int] | None
    denominator_policy: DenominatorPolicy
    conditional_on: str | None      # gate question id
    is_demographic: bool
    analysis_eligible: bool
    exclusion_reason: str           # e.g. "all-empty column"
    # plus: sub_columns, label_to_numeric_value, na_label_set, parent_canonical_id, etc.
```

### `SurveySchema`

```python
@dataclass(frozen=True, slots=True)
class SurveySchema:
    questions: tuple[QuestionSpec, ...]
    respondent_id_column: str       # usually "record" or "uuid"
    total_respondents: int

    def by_id(self, canonical_id) -> QuestionSpec | None: ...
    def demographic_questions(self) -> tuple[QuestionSpec, ...]: ...
```

### Critical invariant

> **DataFrame column names equal each question's `canonical_id`.**
> Mismatches between datamap canonical IDs and raw column headers cause silent
> empty cuts — the classifier finds no eligible questions because `df[canonical_id]`
> resolves to nothing.

### Denominator policy

```python
class DenominatorPolicy(str, Enum):
    VALID_RESPONSES    = "VALID_RESPONSES"     # answered the question
    ALL_RESPONDENTS    = "ALL_RESPONDENTS"     # everyone in the dataset
    EXPOSED_TO_QUESTION = "EXPOSED_TO_QUESTION" # passed conditional gate
```

Recorded on each `QuestionSpec` so every cut downstream uses a coherent base.

---

## 5 · Stage 4 — Cut results

### Single cuts

[`single_cut.engine.compute_single_cuts`](../src/single_cut/engine.py) dispatches per `QuestionType` and returns:

```python
SingleCutResult(
    question_id="Q4",
    question_type=QuestionType.SINGLE_SELECT,
    valid_n=4631,
    missing_n=19,
    denominator_policy=DenominatorPolicy.VALID_RESPONSES,
    distribution={
        1: {"label": "1,000–9,999 employees", "count": 1180, "rate": 0.255},
        2: {"label": "10,000–49,999 employees", "count": 890, "rate": 0.192},
        ...
    },
    audit_records=(CalculationAudit(...),),
    warnings=("..."),
)
```

Plus per-type variants: `MultiSelectResult`, `RankOrderResult`, `NumericResult`, `NpsResult`, `GridRatedResult`, `GridBinarySelectResult`, `GridSingleSelectResult`. Each carries its own shape for the metrics it cares about.

### Cross cuts

[`cross_cut_engine.compute_cross_cuts`](../src/cross_cut_engine.py):

```python
CrossCutResult(
    cross_cut_id="CC-001",
    synthetic_question_title="Company size × Likelihood to recommend",
    business_question="Do larger firms recommend more?",
    source_question_ids=("Q4", "Q5"),
    analysis_type=AnalysisType.CROSS_TAB,
    table=[...],   # row-col matrix with counts + %
    warnings=...,
)
```

`AnalysisType` covers `CROSS_TAB`, `SEGMENT_PROFILE`, `GROUP_COMPARISON`, `EXPECTED_VS_REALIZED`, `MULTI_QUESTION_METRIC`.

### Skipped cuts

Every skipped question becomes a `SkipRecord`:

```python
SkipRecord(
    question_id="Q31",
    question_type=QuestionType.OPEN_TEXT,
    skip_reason="unsupported_type: OPEN_TEXT",
    details="...",
)
```

### Hypothesis results

`HypothesisResult` from `hypothesis_validator.py` carries the statistical test outcome (chi-square / Welch / ANOVA) + effect size + verdict (`CONFIRMED` / `NOT_CONFIRMED` / `INCONCLUSIVE`).

### Outcome segmentation

`OutcomeSegmentationResult` carries winners/laggards cohorts and the differentiator list (questions where the two cohorts diverge most).

---

## 6 · Stage 5 — Workbook output

The exporter writes **Excel formulas** that recompute when filter dropdowns change — not pre-computed values alone.

### Sheet layout

```
Cover                        Project title, run timestamp, version
Filters                      Workbook-wide filter dropdowns
<Theme 1>                    Per-theme sheet (e.g. "Demographics")
<Theme 2>                    e.g. "All Questions"
…                            One per theme
_RawData                     Embedded raw data + every helper column
_Options                     Lookup ranges for dropdown lists
Calculation_Log              Every CalculationAudit row, traceable to cell
Skipped                      SkipRecords with reasons
Schema                       QuestionSpec listing
Warnings                     DataQualityReport warnings
Hypothesis_Check             Hypothesis test verdicts (if any)
Filter_Log                   Active filter state at export time
```

### Helper-column algebra in `_RawData`

```
passes_workbook_filters_data          ← global filter pass mask
passes_workbook_custom_filters_data   ← custom filter pass mask
{theme}_F_{Qx}_local_match_data       ← per-filter match (one column each)
{theme}_passes_local_filters_data     ← product of all theme local matches
{theme}_{Qx}_F_passes_per_q_filter_data  ← per-question filter mask
```

Every cut cell is a `COUNTIFS` over `Qx_data` × (`passes_workbook_filters_data, 1`) × (`passes_workbook_custom_filters_data, 1`) × (`{theme}_passes_local_filters_data, 1`) × (`{theme}_{Qx}_F_passes_per_q_filter_data, 1`).

### Filter scope hierarchy

Filters compose with **AND** at four scopes — a row must pass every active filter to be counted:

```
                    ┌── Workbook filter (Filters sheet)         applies to ALL cuts
                    │
ROW PASSES IF ALL ─┼── Workbook custom filter                   user-built ad-hoc
                    │
                    ├── Theme local filter (top of theme sheet) applies to cuts on that sheet
                    │
                    └── Per-question filter (above each cut)    applies to one cut only
```

### Calculation properties (Windows fix)

The exporter sets `workbook.calculation.fullCalcOnLoad = True` and `calcMode = "auto"` so Excel re-evaluates every formula on open. Without it, cached values shadow live formulas and filter dropdowns appear to do nothing.

---

## 7 · Audit / traceability

Every numeric computation records a `CalculationAudit`:

```python
@dataclass(frozen=True, slots=True)
class CalculationAudit:
    audit_id: str
    question_id: str
    source_columns: tuple[str, ...]
    filter_expr: str | None         # active filter expression at compute time
    output_sheet: str
    output_cell_hint: str
    valid_n: int
    missing_n: int
    denominator_policy: DenominatorPolicy
    computed_at: datetime           # tz-aware UTC
```

`CalculationLog` is a list of these. It surfaces in the `Calculation_Log` workbook sheet, letting any reviewer trace any cell back to its source columns, filter, and timestamp.

---

## 8 · Quality reporting

```python
@dataclass(frozen=True, slots=True)
class DataQualityReport:
    total_rows: int
    total_columns: int
    columns_in_datamap: int                       # matched columns
    columns_not_in_datamap: tuple[str, ...]       # raw cols the datamap doesn't know
    per_column_missing_pct: dict[str, float]
    per_column_out_of_range_pct: dict[str, float]
    coercion_log: tuple[dict, ...]                # which cells were force-converted
    warnings: tuple[str, ...]
    decoder_warnings: tuple[dict, ...]
```

`columns_in_datamap` is the proxy for "is this the right datamap?" — a value of 0 means raw data and datamap don't share any column names (silent mismatch failure).

---

## 9 · Insight payloads (AI/rule-based)

Output of [`ai_insights.generate_insight`](../src/ai_insights.py):

```python
@dataclass(frozen=True, slots=True)
class InsightResult:
    title: str
    insight: str                # the headline / takeaway sentence
    was_template: bool          # True ⇒ deterministic fallback, not AI-generated
    model_used: str
    tokens_used: int
    error_message: str          # empty on success
```

`was_template=True` indicates one of: missing `PORTKEY_API_KEY`, network failure, API error, or number-verification mismatch. The UI shows a hedge badge in those cases.

---

## 10 · Chat assistant (added by post/main)

[`chat_panel.render_chat_panel`](../src/chat_panel.py) wraps [`assistant_bot.handle_message`](../src/assistant_bot.py). Bot reply contract:

```python
@dataclass
class BotReply:
    text: str                       # the message shown
    intent: Literal["tool_help", "survey_structure", "hypothesis"]
    table: list[dict] | None        # tabular evidence (hypothesis only)
    table_caption: str
    caveats: list[str]              # base-size warnings, etc.
    was_grounded: bool              # False ⇒ "AI-phrased / not grounded" badge
    debug: dict
```

Three intents, each with a different ceiling on what AI can do:

| Intent | Source of truth | LLM role |
|---|---|---|
| `tool_help` | `assistant_faq.json` (18 Q&As) | Rephrase only — cannot invent features |
| `survey_structure` | `SurveySchema` facts | Phrase only — Python finds facts deterministically |
| `hypothesis` | cross_cut_engine output | Map NL → question IDs only; Python computes; verify numbers before phrasing |

`MIN_CELL_N_FOR_CONFIDENT_CLAIM = 30` — below that, the bot hedges.

---

## 11 · Configuration constants

[`config.py`](../config.py):

| Constant | Meaning | Default |
|---|---|---|
| `DATAMAP_SHEET_NAME` | Default sheet name for the datamap | `"Sheet1"` |
| `MISSING_VALUE_TOKENS` | Cell values treated as missing | `{"", "NA", "N/A", "NULL", "None", "nan"}` |
| `HIGH_MISSING_THRESHOLD` | Threshold for "high missing" warning | `0.5` |
| `DEFAULT_ALLOCATION_TARGET` | Numeric-allocation sum target | `100.0` |
| `ALLOCATION_TOLERANCE` | Tolerance around the target | `2.0` |
| `LOW_SAMPLE_THRESHOLD` | Below this, cuts get a low-base warning | `30` |
| `RAW_DATA_SHEET_ROW_LIMIT` | Cap on rows in the embedded raw sheet | `50000` |
| `CROSS_TAB_MAX_GROUPS` | Max groups per cross-tab axis | `12` |
| `PORTKEY_BASE_URL` | AI gateway endpoint | `https://portkey.bain.dev/v1` |
| `PORTKEY_DEFAULT_MODEL` | Default LLM | `@personal-openai/gpt-4o-mini` |
| `PORTKEY_PREMIUM_MODEL` | Premium LLM | `@personal-openai/gpt-4o` |
| `AI_INSIGHT_TEMPERATURE` | LLM temperature for phrasing | `0.1` |
| `AI_INSIGHT_MAX_TOKENS` | Hard cap per AI call | `350` |
| `AI_INSIGHT_TIMEOUT_SECONDS` | LLM call timeout | `30` |

---

## 12 · Cross-reference map

| Concept | Defined in | Consumed by |
|---|---|---|
| `DataMap` | `src/datamap_parser.py` | `src/raw_decoder.py`, `src/question_classifier.py` |
| `ParsedQuestion` | `src/datamap_parser.py` | `src/question_classifier.py`, `src/word_survey_parser.py` |
| `QuestionSpec`, `QuestionType` | `src/models.py` | every cut module, `src/excel_exporter.py` |
| `SurveySchema` | `src/models.py` | `src/single_cut/engine.py`, `src/cross_cut_engine.py`, `src/excel_exporter.py`, `src/chat_panel.py` |
| `SingleCutResult` | `src/models.py` | `src/excel_exporter.py`, `src/ai_insights.py` |
| `CrossCutResult` | `src/models.py` | `src/excel_exporter.py`, `src/hypothesis_validator.py` |
| `DataQualityReport` | `src/models.py` | `src/excel_exporter.py` (`Warnings` sheet) |
| `CalculationLog` | `src/calculation_log.py` | `src/excel_exporter.py` (`Calculation_Log` sheet) |
| `OutcomeSegmentationResult` | `src/models.py` | `src/excel_exporter.py`, `app.py` outcome section |
| `InsightResult` | `src/models.py` | `app.py` insight cards, `src/excel_exporter.py` |
| `GlobalFilterState` | `src/models.py` | `src/global_filter.py`, `src/excel_exporter.py` |

---

*Last regenerated: 2026-06-19 (matches `Survey-cutter-post/main` @ `431d1a0b`)*
