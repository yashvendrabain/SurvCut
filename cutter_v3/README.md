# Cutter v3 — Reflex rebuild of the spec-driven survey cutter

Same engine as Cutter v2, **Reflex UI instead of Streamlit**.

## Why Reflex

Streamlit's BaseWeb tab-strip rendering was unreliable on Windows + Streamlit
1.39 — tab labels went invisible despite explicit CSS overrides. Reflex has:

- Real reactive state — only changed components re-render
- Multi-page routing as a first-class feature
- CSS that works the way you expect (no fighting BaseWeb internals)
- React/Next.js under the hood — production-ready
- Pure Python — no JavaScript needed

## What stays the same as v2

100% of the analysis engine. We import directly from `cutter_v2.core.*`:

| Module | What it does |
|---|---|
| `cutter_v2/core/models.py` | Frozen dataclasses |
| `cutter_v2/core/datamap_parser.py` | Strict spec-compliant parser |
| `cutter_v2/core/validator.py` | Raw↔datamap consistency check |
| `cutter_v2/core/classifier.py` | Deterministic type dispatch |
| `cutter_v2/core/single_cut.py` | Per-question cuts |
| `cutter_v2/core/cross_cut.py` | Dynamic cross-cut tables |
| `cutter_v2/core/theme_grouper.py` | Auto-suggest themes |
| `cutter_v2/core/exporter.py` | Target-format Excel writer |
| `cutter_v2/core/io_layer.py` | File loader |

The Reflex app only re-implements the **UI layer** that was in
`cutter_v2/app.py`.

## Folder layout

```
cutter_v3/
├── README.md
├── requirements.txt           reflex + the same pandas/openpyxl stack
├── rxconfig.py                Reflex project config (port 3000 dev / 8003 prod)
├── cutter_v3/                 The Reflex app module
│   ├── __init__.py
│   ├── cutter_v3.py           App entry — registers pages
│   ├── state.py               Global app state (uploaded data, schema, etc.)
│   ├── pages/
│   │   ├── upload.py          /upload
│   │   ├── validate.py        /validate
│   │   ├── themes.py          /themes
│   │   ├── crosscuts.py       /crosscuts
│   │   └── generate.py        /generate
│   └── components/
│       └── shell.py           Shared layout (navbar, brand)
├── assets/                    Static assets (logo etc.)
├── uploaded_files/            Temp upload destination
└── docs/
    └── (links to v2's docs/DATAMAP_SPEC.md and SCHEMA.md)
```

## How to run (when complete)

```powershell
cd cutter_v3
..\.venv\Scripts\reflex.exe init   # one-time per machine
..\.venv\Scripts\reflex.exe run    # dev mode at http://localhost:3000
```

## Status

Phase 1 (in progress): Reflex scaffold + Upload page importing v2 core.
