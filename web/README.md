# cutter-web

Next.js 15 + Tailwind + shadcn-style components. The wizard UI on top of the `cutter-api` backend.

## Local dev

Requires Node.js 20+ and pnpm (or npm).

```bash
# from the web/ directory
pnpm install
pnpm dev
```

Open http://localhost:3000. The dev server proxies `/api/*` to `http://localhost:8000/api/*` via `next.config.ts` rewrites, so make sure the FastAPI backend is running:

```bash
# in another terminal, from monorepo root
uvicorn app.main:app --reload --port 8000 --app-dir api
```

## Structure

```
app/
  layout.tsx        Root layout with Bain-red theme + navbar
  page.tsx          Landing page (hero + feature grid)
  upload/           Wizard: upload
  validate/         Wizard: validate schema
  themes/           Wizard: theme/filter assignment
  crosscuts/        Wizard: cross-cut builder
  generate/         Wizard: build + download
components/
  navbar.tsx        Sticky top nav
  query-provider.tsx  TanStack Query client
  ui/               shadcn primitives (add later)
lib/
  api-client.ts     Typed API client (matches api/app/schemas/responses.py)
  utils.ts          cn() helper
```

## Design system

- Bain-red brand (`#CC0000`) + neutral ink scale
- Dark theme by default (Tailwind `dark` class on `<html>`)
- Grid + radial-red background pattern
- Framer Motion for entrance animations
- `.glass` component class for the modern glassmorphism look
- Custom animations: `fade-in-up`, `slide-in-right`, `shimmer`

## Next steps (Week 2)

- Wire the Upload page to `POST /api/upload` (drag-drop, progress)
- Validate page: fetch `/api/schema/{id}` and render the question table
- Themes page: drag-and-drop question reordering (@dnd-kit)
- Cross-cuts page: dropdowns + live matrix preview
- Generate page: `POST /api/export/build` + download link