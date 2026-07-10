# SurvCut — Spec-driven Survey Cutter

> Upload a survey **datamap + raw responses** → get a **live-formula Excel workbook**
> (every cut, cross-cut, filter, and segment) plus a **live QC dashboard** — in under
> a minute, with every number traceable to a rule. Bain-internal.

---

## 1 · The problem it solves

Turning a raw survey export into board-ready **cuts** (frequency tables) and
**cross-cuts** (cross-tabs) is hours of manual, error-prone Excel work per study —
building COUNTIFS by hand, wiring filter dropdowns, formatting every block, then
QC-ing it all. SurvCut automates that end-to-end and **deterministically**: it's
essentially a *compiler for surveys* — datamap in, typed schema out, Excel formulas
emitted. No ML in the hot path, so every output maps to a rule you can audit.

---

## 2 · What it does

- **Auto-classifies** every question from the datamap (10+ types — see §4).
- **Generates a live-formula `.xlsx`** where each number is a real Excel formula
  (`COUNTIFS` / `AVERAGEIFS` / `VLOOKUP`), so analysts re-slice in Excel without
  re-running the tool.
- **Cuts** (single-dimension) and **cross-cuts** (any question × any question).
- **Global filters** — single- and multi-select questions become dropdowns tagged
  to every cut (up to 40).
- **Custom segments** — build named groups (e.g. WLO) from **AND/OR** conditions
  across questions, materialised as live helper columns + a filter.
- **Live dashboard** — preview every cut/cross-cut with the configured filters and
  segments applied, **cell-for-cell identical to the workbook**, so QC is one pass.
- **Bain-formatted output** — framed grids, grey header/label/total boxes, a
  full-width question banner, and red→green heatmaps on grid % blocks.

---

## 3 · The workflow (6-step wizard)

```
Upload → Validate → Add/Create filters → Dashboard → Create cuts → Generate
```

1. **Upload** a combined `.xlsx` (a `Datamap` sheet + a `Raw data` sheet).
2. **Validate** — the datamap ↔ raw-data cross-check (hard errors block export).
3. **Add/Create filters** — theme sheets, global filters, and AND/OR segments.
4. **Dashboard** — explore cuts/cross-cuts live under your filters/segments (QC).
5. **Create cuts** — queue the cross-cuts you want in the workbook.
6. **Generate** — build + download the Excel workbook.

---

## 4 · Question types

Detection is **legend-aware** (does the datamap give a value→label legend?) and,
for numeric grids, **data-aware** (do the columns sum to exactly 100?).

| Type | Datamap shape | Output |
|---|---|---|
| **Single-select** | `Values: 1-N` + coded legend, no sub-cols | option × count / % |
| **Binary** | `Values: 0-1`, no sub-cols | 2-option count / % |
| **Multi-select** | `Values: 0-1` + `[SubColID]` rows | option × count / % (base = selected ≥1) |
| **Ranking** | legend `Rank 1..K` + sub-cols | ranks × options count **matrix** |
| **Grid (rated / non-numerical)** | descriptive legend + sub-cols | scale × option **matrix** (# / % + heatmap) |
| **Numeric grid** | no legend + sub-cols, rows don't sum to 100 | per-column mean (incl. negatives) |
| **Likert / allocation** | no legend + sub-cols, every row sums to **exactly 100** | per-component mean |
| **Direct numeric** | `Open numeric response` | mean |
| **Open text** | `Open text response` | excluded from cuts |
| **Metadata** | `record`/`uuid`/`hSample`/… | passthrough, excluded |

The datamap contract lives in [`docs/DATAMAP_SPEC.md`](docs/DATAMAP_SPEC.md);
engine internals in [`docs/QUESTION_TYPES_REFERENCE.md`](docs/QUESTION_TYPES_REFERENCE.md).

---

## 5 · Architecture — the layer boundary is the point

```
┌──────────────────────────────────────────────────────────────┐
│  web/    Next.js 15 + React 19 + TS   → the 6-step wizard      │
│  api/    FastAPI                      → HTTP + session cache   │
│  engine/ cutter_engine (pip package)  → ALL logic. No HTTP/UI. │
└──────────────────────────────────────────────────────────────┘
```

- **`engine/`** has zero web dependencies — `pip install` it and run the whole
  pipeline (`load → parse → classify → validate → cut → export`) from a REPL.
- **`api/`** is a thin adapter: receives the upload, calls the engine, caches the
  result under a `session_id`, returns JSON.
- Type identification is isolated in `question_type_detector.py` — a **swap-point**
  for replacing heuristics later without touching the rest.

Core pipeline: `io_layer → datamap_parser (state machine) → question_type_detector →
classifier → validator → single_cut / cross_cut → exporter (.xlsx)`.

---

## 6 · Tech stack

- **Engine/API:** Python 3.11+, pandas, openpyxl, FastAPI, uvicorn, Pydantic.
- **Web:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind,
  TanStack Query, Framer Motion; pure-SVG charts.
- **Quality:** pytest (engine + API), GitHub Actions CI (Python 3.11/3.12 + Node 22).

---

## 7 · Run it locally

Requires **Python 3.11+** and **Node 22+**.

```bash
# backend (engine + API)
pip install -e ./engine
pip install -e ./api
uvicorn app.main:app --port 8000 --app-dir api   # (use: python -m uvicorn ... on Windows)

# frontend (separate terminal)
cd web
npm install --legacy-peer-deps
npm run dev                                        # http://localhost:3000
```

`web/next.config.ts` proxies `/api/*` → `http://localhost:8000` (override with the
`API_PROXY_TARGET` env var to point at a different backend port).

---

## 8 · Repo layout

```
SurvCut/
├── engine/   cutter-engine — pure Python core (parser, classifier, cuts, exporter)
├── api/      FastAPI service (routers: upload, schema, cuts, crosscuts, export)
├── web/      Next.js wizard (upload · validate · filters · dashboard · cuts · generate)
├── docs/     DATAMAP_SPEC · QUESTION_TYPES_REFERENCE · CUTS_FRAMEWORK · SCHEMA + sample .xlsx
├── infra/    docker-compose (redis + api + web)
└── .github/  CI workflow
```

---

## 9 · Status & roadmap

**Built:** full pipeline — upload → classify → validate → cuts + cross-cuts +
filters + AND/OR segments → live-formula Excel + live QC dashboard; matrix output
for grids/ranking; framed Bain formatting.

**Deferred / next:**
- Async build jobs (Celery + Redis — endpoint signatures already stable).
- Open-text **verbatim theming** (NLP: embeddings + clustering, or LLM coding).
- Semantic auto-theming, smart cross-cut suggestions, data-quality flags.
- WLO / blacklist / MPPM preset filters; Azure AD SSO.

---

## 10 · Related docs

- [`SURVCUT_FORMAT_GUIDE.md`](SURVCUT_FORMAT_GUIDE.md) — how to shape any datamap into SurvCut's input format.
- [`SURVCUT_TECH_WALKTHROUGH.md`](SURVCUT_TECH_WALKTHROUGH.md) — presenter's guide to the internals (parsing + validation deep dives).
- [`docs/`](docs/) — datamap spec, question-type reference, cut framework, schema.
