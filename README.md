<div align="center">

# SurvCut

**Spec-driven survey cutter — Bain-internal.** Upload a bracketed datamap + raw survey data. Get a live-formulas Excel workbook with every cut shape, filter dropdowns, and cross-cuts. Under a minute end-to-end.

```
┌──────────────────────────────────────────┐
│  web/    →  Next.js 15 + Tailwind        │
│  api/    →  FastAPI + Pydantic           │
│  engine/ →  cutter-engine (pip package)  │
└──────────────────────────────────────────┘
```

</div>

---

## Monorepo layout

```
SurvCut/
├── engine/              # cutter-engine — pure Python core (framework-agnostic)
│   ├── src/cutter_engine/
│   ├── tests/
│   └── pyproject.toml
├── api/                 # FastAPI service that imports cutter-engine
│   ├── app/
│   │   ├── main.py
│   │   ├── deps.py
│   │   ├── routers/
│   │   └── schemas/
│   ├── tests/
│   ├── Dockerfile
│   └── pyproject.toml
├── web/                 # Next.js 15 + Tailwind + TanStack Query
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── Dockerfile
│   └── package.json
├── docs/                # Framework specs and internal references
│   ├── CUTS_FRAMEWORK.md
│   ├── QUESTION_TYPES_REFERENCE.md
│   ├── DATAMAP_SPEC.md
│   └── SCHEMA.md
├── infra/
│   └── docker-compose.yml
├── .github/workflows/
│   └── ci.yml
├── cutter_v2/           # legacy Streamlit / library entry (kept for reference)
├── cutter_v3/           # legacy Reflex UI (kept for reference)
└── README.md
```

### The layer boundary is the whole point

`engine/` has zero UI or HTTP dependencies. Any layer above can be replaced without touching the engine, and the engine can be replaced (e.g. with an explicit-format detector) without touching the layers above. The public contract lives in `engine/src/cutter_engine/models.py`.

---

## Quick start (local dev)

Requires Python 3.11+ and Node.js 22+.

```bash
# 1. Install the engine + API as editable packages
pip install -e ./engine
pip install -e ./api

# 2. Start the API (port 8000)
uvicorn app.main:app --reload --port 8000 --app-dir api

# 3. In another terminal, start the web (port 3000)
cd web
pnpm install       # or: npm install
pnpm dev           # or: npm run dev
```

Open http://localhost:3000. The frontend proxies `/api/*` → `http://localhost:8000/api/*` via `next.config.ts`.

## Quick start (Docker)

```bash
docker compose -f infra/docker-compose.yml up --build
```

Brings up `redis` (for the future Celery queue), `api` on 8000, `web` on 3000.

---

## What's built (Phase 1)

**Engine** (`engine/`):
- 10 question types with dedicated per-type computers and Excel block writers
- Bracketed-format datamap parser + `[pipe: helper]` detection
- `_q_sum_<col_id>` helper column for RANKING + MULTI_SELECT base counts
- Ranking blocks laid out as ranks × options matrix
- Cross-cut engine — grid/ranking/numeric-allocation work on both row & column axes
- Cross-cut sheets show grouped `# of respondents` then grouped `% of respondents`
- VLOOKUP label → code filter pass-through so numeric-coded raw data still matches label dropdowns
- Master Check cell + IFERROR wrapping throughout the workbook
- Datamap ↔ raw data cross-check (validator)
- Type identification isolated in `question_type_detector.py` as the future swap-point

**API** (`api/`):
- FastAPI factory with 4 routers under `/api/{upload,schema,crosscuts,export}`
- Session-cached uploads (in-process for Phase 1; Redis-backed in Phase 2)
- Auto-generated OpenAPI docs at `/docs`
- Synchronous build for now; endpoint signatures stable for future Celery migration

**Web** (`web/`):
- Next.js 15 (App Router) + React 19 + TypeScript strict
- Bain-red brand + dark theme by default
- Landing page with animated hero, glass-morphism cards, grid + radial-red background
- 5-step wizard shell with sticky navbar (Upload / Validate / Themes / Cross Cuts / Generate)
- Typed API client mirroring the FastAPI Pydantic models

---

## Deferred to Phase 2

- WLO segmentation (Winners / Laggards / Others)
- Blacklist criteria filter
- MPPM category filters
- Theme sheet preset duplicates (`Pricing` + `Pricing_Omnibus` pattern)
- Explicit-format datamap (`Type: ranking` declarations) — will replace heuristic detection
- Word Cloud / verbatim analysis
- Real ML endpoints (auto-theming, smart cross-cut suggestions)
- Azure AD SSO
- Celery + Redis for async build jobs

---

## Docs

- [`docs/CUTS_FRAMEWORK.md`](docs/CUTS_FRAMEWORK.md) — cut shape catalog (S1..S11) + Phase 1/2 scope
- [`docs/QUESTION_TYPES_REFERENCE.md`](docs/QUESTION_TYPES_REFERENCE.md) — engine internals reference
- [`docs/DATAMAP_SPEC.md`](docs/DATAMAP_SPEC.md) — required bracketed datamap format
- [`engine/README.md`](engine/README.md), [`api/README.md`](api/README.md), [`web/README.md`](web/README.md) — per-layer READMEs

---

## Legacy

`cutter_v2/` and `cutter_v3/` remain in the tree until feature parity is confirmed. They will be removed when the new stack ships. Everything in them has already been ported to `engine/`.