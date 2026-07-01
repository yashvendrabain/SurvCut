"""Cutter v3 — Reflex app entry. Registers the five pages."""
from __future__ import annotations

import reflex as rx

from .pages.crosscuts import crosscuts_page
from .pages.generate import generate_page
from .pages.themes import themes_page
from .pages.upload import upload_page
from .pages.validate import validate_page
from .state import AppState

app = rx.App()

# Sanity check runs on every page-load. Prevents stale ghost state from being
# shown to the user after a server restart / hot reload (the lightweight state
# vars survive but the heavy data dict does not).
_on_load = AppState.on_load_sanity_check

app.add_page(upload_page, route="/", title="Cutter v3 — Upload", on_load=_on_load)
app.add_page(validate_page, route="/validate", title="Cutter v3 — Validate", on_load=_on_load)
app.add_page(themes_page, route="/themes", title="Cutter v3 — Themes & Filters", on_load=_on_load)
app.add_page(crosscuts_page, route="/crosscuts", title="Cutter v3 — Cross Cuts", on_load=_on_load)
app.add_page(generate_page, route="/generate", title="Cutter v3 — Generate", on_load=_on_load)
