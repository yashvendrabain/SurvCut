#!/usr/bin/env bash
# Boot the full SurvCut stack for Replit (or any single-container host):
#   • FastAPI backend  -> 127.0.0.1:8000  (internal)
#   • Next.js frontend -> 0.0.0.0:3000    (public; proxies /api/* to the backend)
set -euo pipefail

echo "==> Installing Python engine + API (editable)"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -e ./engine -e ./api

echo "==> Installing web dependencies"
pushd web >/dev/null
if [ ! -d node_modules ]; then
  npm install --legacy-peer-deps
fi

echo "==> Building the Next.js frontend (first run only)"
if [ ! -d .next ]; then
  # If the build runs out of memory on a small instance, switch the last line
  # below to `npm run dev` (no build needed, heavier at runtime).
  npm run build
fi
popd >/dev/null

echo "==> Starting FastAPI backend on 127.0.0.1:8000"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir api &

echo "==> Starting Next.js frontend on 0.0.0.0:3000"
cd web
exec npx next start -p 3000 -H 0.0.0.0
