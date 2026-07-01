"""Global Reflex state — holds uploaded inputs, parsed schema, validation, cuts.

State is reactive: when any of these vars change, only the components that
read them re-render. That's the key Streamlit-vs-Reflex difference — no
script-wide rerun on every interaction.
"""
from __future__ import annotations

import io
import os
import sys
import tempfile
import traceback
from pathlib import Path
from typing import Any

import pandas as pd
import reflex as rx

# ── Wire in v2's engine (one-time path bootstrap) ──
_HERE = Path(__file__).resolve().parent
_V2_ROOT = _HERE.parent.parent / "cutter_v2"
if str(_V2_ROOT) not in sys.path:
    sys.path.insert(0, str(_V2_ROOT))

from core.classifier import classify, summarise            # type: ignore
from core.cross_cut import compute_cross_cut                # type: ignore
from core.datamap_parser import parse_datamap_from_rows     # type: ignore
from core.io_layer import load_combined                     # type: ignore
from core.models import (                                    # type: ignore
    CrossCutResult,
    FilterSlot,
    QuestionSpec,
    QuestionType,
    SurveySchema,
    ThemeGroup,
)
from core.single_cut import compute_all_single_cuts          # type: ignore
from core.theme_grouper import suggest_themes, validate_theme_assignment  # type: ignore
from core.validator import format_report, validate          # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
# AppState — the single source of truth
# ─────────────────────────────────────────────────────────────────────────────


class AppState(rx.State):
    """Top-level application state shared across all pages."""

    # ── Busy / progress indicator ──
    # is_busy = True whenever a long-running handler is mid-execution.
    # busy_message = human label for the current step (shown in the banner).
    # Components that trigger waits set both at start and clear in `finally`.
    is_busy: bool = False
    busy_message: str = ""

    # ── Upload state ──
    upload_mode: str = "combined"               # "combined" | "separate"
    last_load_note: str = ""                    # human message from loader
    upload_error: str = ""                      # if anything failed

    # ── Pipeline outputs ──
    # We don't keep pandas DataFrames as reflex state vars (Reflex serializes
    # state to the client and DataFrames are huge). Instead, we cache them in
    # a process-local dict keyed by session id, and only expose lightweight
    # summary vars to the UI.
    n_respondents: int = 0
    n_raw_columns: int = 0
    n_datamap_blocks: int = 0
    n_eligible_questions: int = 0
    schema_summary: str = ""                    # text dump
    validation_summary: str = ""
    validation_has_errors: bool = False
    validation_has_warnings: bool = False

    # ── Theme + filter selections ──
    theme_names: list[str] = []                 # parallel arrays
    theme_question_ids: list[list[str]] = []
    filter_column_ids: list[str] = []

    # ── Cross-cut builder ──
    xcut_row_qid: str = ""
    xcut_col_qid: str = ""
    xcut_row_labels: list[str] = []
    xcut_col_labels: list[str] = []
    xcut_counts: list[list[float]] = []
    xcut_warnings: list[str] = []
    queued_cross_cuts: list[dict] = []          # serialisable summaries

    # ── Generate ──
    workbook_ready: bool = False
    workbook_path: str = ""
    workbook_size_bytes: int = 0

    # Computed: list of all eligible question ids+labels for dropdowns
    # Computed: list of all eligible question ids+labels for dropdowns.
    # Multi-column questions (grids / multi-select / ranking) get one entry for
    # the whole question PLUS one entry per sub-column so analysts can pick a
    # specific sub-row to cross-cut by (Phase 2 — sub-row granularity).
    @rx.var(cache=True)
    def eligible_options(self) -> list[dict[str, str]]:
        sess = _session_cache.get(self.router.session.session_id)
        if not sess or "schema" not in sess:
            return []
        schema: SurveySchema = sess["schema"]
        opts: list[dict[str, str]] = []
        for q in schema.analysis_questions():
            opts.append({
                "value": q.column_id,
                "label": f"{q.column_id} — {q.question_text[:60]} ({q.question_type.value})",
            })
            # Expand sub-rows when the question owns more than one raw column.
            if len(q.raw_columns) > 1:
                for sub_col in q.raw_columns:
                    sub_label = q.sub_column_labels.get(sub_col, sub_col)
                    # Strip [pipe: ...] markers for readability; show helper col instead.
                    if sub_label.startswith("[pipe:") and sub_label.endswith("]"):
                        sub_label = "(piped from " + sub_label[6:-1].strip() + ")"
                    opts.append({
                        "value": f"{q.column_id}|{sub_col}",
                        "label": f"   ↳ {sub_col} — {sub_label[:60]}",
                    })
        return opts

    def _resolve_xcut_qid(self, qid: str, schema: SurveySchema) -> QuestionSpec | None:
        """Resolve a dropdown value into a real or synthetic QuestionSpec.

        Plain qid (no `|`)  -> existing parent question via schema.by_column_id.
        `parent|sub_col`    -> a synthetic single-column QuestionSpec for the
                                sub-row, suitable for cross-cut as a numeric
                                or binary column without re-aggregating the
                                parent grid's other sub-rows.
        """
        if "|" not in qid:
            return schema.by_column_id(qid)
        parent_id, sub_col = qid.split("|", 1)
        parent = schema.by_column_id(parent_id)
        if parent is None:
            return None
        sub_label = parent.sub_column_labels.get(sub_col, sub_col)
        if parent.question_type == QuestionType.GRID_RATED:
            sub_type = QuestionType.DIRECT_NUMERIC
        elif parent.question_type in (QuestionType.MULTI_SELECT_BINARY, QuestionType.RANKING):
            sub_type = QuestionType.BINARY_TWO_OPTIONS
        elif parent.question_type == QuestionType.NUMERIC_ALLOCATION:
            sub_type = QuestionType.DIRECT_NUMERIC
        else:
            sub_type = QuestionType.DIRECT_NUMERIC
        return QuestionSpec(
            column_id=sub_col,
            question_text=f"{parent.column_id}/{sub_col}: {sub_label}",
            question_type=sub_type,
            raw_columns=(sub_col,),
            option_map={},
            sub_column_labels={},
            scale_range=parent.scale_range,
            is_metadata=False,
            is_demographic=False,
            analysis_eligible=True,
            exclusion_reason="",
            source_row_in_datamap=parent.source_row_in_datamap,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Event handlers
    # ─────────────────────────────────────────────────────────────────────────

    # Explicit setters (Reflex 0.9+ no longer auto-generates these)
    def set_upload_mode(self, mode: str) -> None:
        self.upload_mode = mode

    def on_load_sanity_check(self) -> None:
        """Run on every page load. Reflex preserves the lightweight state vars
        across server restarts and browser refreshes, but our heavy data
        (the DataFrame + parsed blocks) lives in a process-local dict that
        vanishes on restart. If the counters say we have data but the dict
        is empty, the user is looking at a ghost — clear the counters."""
        sid = self.router.session.session_id
        has_cached = sid in _session_cache
        thinks_loaded = self.n_datamap_blocks > 0
        if thinks_loaded and not has_cached:
            self._clear_loaded()

    def _clear_loaded(self) -> None:
        """Wipe every derived var from a previous upload. Called at the start
        of every new upload attempt so the UI never shows stale state."""
        sid = self.router.session.session_id
        _session_cache.pop(sid, None)
        self.last_load_note = ""
        self.upload_error = ""
        self.n_respondents = 0
        self.n_raw_columns = 0
        self.n_datamap_blocks = 0
        self.n_eligible_questions = 0
        self.schema_summary = ""
        self.validation_summary = ""
        self.validation_has_errors = False
        self.validation_has_warnings = False
        self.theme_names = []
        self.theme_question_ids = []
        self.filter_column_ids = []
        self.xcut_row_qid = ""
        self.xcut_col_qid = ""
        self.xcut_row_labels = []
        self.xcut_col_labels = []
        self.xcut_counts = []
        self.xcut_warnings = []
        self.queued_cross_cuts = []
        self.workbook_ready = False
        self.workbook_path = ""
        self.workbook_size_bytes = 0

    async def handle_combined_upload(self, files: list[rx.UploadFile]):
        """User dropped a combined .xlsx (datamap + raw)."""
        if not files:
            return
        # Reset state so each upload is a clean slate (no stale tiles or notes).
        self._clear_loaded()
        self.is_busy = True
        self.busy_message = "Reading uploaded file…"
        yield
        try:
            raw_bytes = await files[0].read()
            self.busy_message = "Parsing datamap and classifying questions…"
            yield
            loaded = load_combined(raw_bytes)
            self._wire_loaded(loaded.raw_df, loaded.datamap_rows,
                              note=f"{loaded.raw_source_note} | {loaded.datamap_source_note}")
        except Exception as exc:  # noqa: BLE001
            self.upload_error = f"{type(exc).__name__}: {exc}"
        finally:
            self.is_busy = False
            self.busy_message = ""

    def _wire_loaded(self, raw_df: pd.DataFrame, datamap_rows: list, note: str) -> None:
        """Run parse + validate + classify and stash the results."""
        self.upload_error = ""
        self.last_load_note = note

        blocks = parse_datamap_from_rows(datamap_rows)
        schema = classify(blocks, raw_df)
        report = validate(blocks, raw_df)

        # Store the heavy objects out-of-band (process memory, keyed by session)
        sid = self.router.session.session_id
        _session_cache[sid] = {
            "raw_df": raw_df,
            "datamap_rows": datamap_rows,
            "blocks": blocks,
            "schema": schema,
            "report": report,
        }

        # Mirror lightweight summaries into reactive state
        self.n_respondents = int(len(raw_df))
        self.n_raw_columns = int(len(raw_df.columns))
        self.n_datamap_blocks = len(blocks)
        self.n_eligible_questions = len(schema.analysis_questions())
        self.schema_summary = summarise(schema)
        self.validation_summary = format_report(report)
        self.validation_has_errors = bool(report.has_errors)
        self.validation_has_warnings = bool(report.has_warnings)

        # Suggest themes by default
        themes = suggest_themes(schema)
        self.theme_names = [t.name for t in themes]
        self.theme_question_ids = [list(t.question_column_ids) for t in themes]

        # Default filters: demographic single-selects, up to 10
        self.filter_column_ids = [
            q.column_id for q in schema.questions
            if q.analysis_eligible and q.is_demographic
            and q.question_type == QuestionType.SINGLE_SELECT
        ][:10]

    # ── Cross-cut handlers ──

    def set_xcut_row(self, qid: str) -> None:
        self.xcut_row_qid = qid

    def set_xcut_col(self, qid: str) -> None:
        self.xcut_col_qid = qid

    def compute_xcut(self):
        """Compute the currently-picked cross-cut and store in state."""
        sid = self.router.session.session_id
        sess = _session_cache.get(sid, {})
        schema: SurveySchema | None = sess.get("schema")
        raw_df: pd.DataFrame | None = sess.get("raw_df")
        if (not schema or raw_df is None or
                not self.xcut_row_qid or not self.xcut_col_qid or
                self.xcut_row_qid == self.xcut_col_qid):
            self.xcut_warnings = ["pick two different questions"]
            self.xcut_row_labels = []
            self.xcut_col_labels = []
            self.xcut_counts = []
            return
        self.is_busy = True
        self.busy_message = "Computing cross-cut matrix…"
        yield
        try:
            row_q = self._resolve_xcut_qid(self.xcut_row_qid, schema)
            col_q = self._resolve_xcut_qid(self.xcut_col_qid, schema)
            if row_q is None or col_q is None:
                self.xcut_warnings = ["could not resolve one or both selected questions"]
                self.xcut_row_labels = []
                self.xcut_col_labels = []
                self.xcut_counts = []
                return
            result = compute_cross_cut(row_q, col_q, raw_df)
            self.xcut_row_labels = list(result.row_labels)
            self.xcut_col_labels = list(result.col_labels)
            self.xcut_counts = [list(row) for row in result.counts]
            self.xcut_warnings = list(result.warnings)
        finally:
            self.is_busy = False
            self.busy_message = ""

    def queue_xcut(self) -> None:
        if not self.xcut_row_labels or not self.xcut_col_labels:
            return
        self.queued_cross_cuts = self.queued_cross_cuts + [{
            "row": self.xcut_row_qid,
            "col": self.xcut_col_qid,
            "row_n": len(self.xcut_row_labels),
            "col_n": len(self.xcut_col_labels),
        }]

    def remove_xcut(self, index: int) -> None:
        if 0 <= index < len(self.queued_cross_cuts):
            new_list = self.queued_cross_cuts[:]
            new_list.pop(index)
            self.queued_cross_cuts = new_list

    # ── Generate handler ──

    def build_workbook(self):
        """Run the v2 exporter and stash the output path for download."""
        from core.exporter import ExportInputs, export  # type: ignore
        from core.models import FilterSlot, ThemeGroup  # type: ignore

        sid = self.router.session.session_id
        sess = _session_cache.get(sid, {})
        if not sess:
            self.upload_error = "Nothing to generate — upload inputs first."
            return

        self.is_busy = True
        self.busy_message = "Preparing inputs…"
        yield
        try:
            schema = sess["schema"]
            raw_df = sess["raw_df"]
            datamap_rows = sess["datamap_rows"]

            themes = [ThemeGroup(name=name, question_column_ids=list(qids))
                      for name, qids in zip(self.theme_names, self.theme_question_ids)]
            filters = [FilterSlot(name=qid, column_id=qid, default_value="All")
                       for qid in self.filter_column_ids]

            # Re-compute every queued cross-cut from its (row_qid, col_qid) pair.
            # We don't keep the CrossCutResult in reflex state (would be huge),
            # so we re-run compute_cross_cut here using the cached raw_df.
            cross_cuts = []
            if self.queued_cross_cuts:
                self.busy_message = (
                    f"Computing {len(self.queued_cross_cuts)} queued cross-cut(s)…"
                )
                yield
                for qcc in self.queued_cross_cuts:
                    row_q = self._resolve_xcut_qid(qcc["row"], schema)
                    col_q = self._resolve_xcut_qid(qcc["col"], schema)
                    if row_q is None or col_q is None:
                        continue
                    cc = compute_cross_cut(row_q, col_q, raw_df)
                    if cc.row_labels and cc.col_labels:
                        cross_cuts.append(cc)

            self.busy_message = "Building Excel workbook (theme sheets + cross-cuts)…"
            yield

            out_path = os.path.join(tempfile.gettempdir(), f"cutter_v3_{sid[:8]}.xlsx")
            inputs = ExportInputs(
                schema=schema, raw_df=raw_df, datamap_rows=datamap_rows,
                themes=themes, filters=filters, cross_cuts=tuple(cross_cuts),
            )
            path = export(inputs, out_path)

            self.busy_message = "Finalising download link…"
            yield

            self.workbook_path = str(path)
            self.workbook_size_bytes = int(Path(path).stat().st_size)
            self.workbook_ready = True
        finally:
            self.is_busy = False
            self.busy_message = ""


# ─────────────────────────────────────────────────────────────────────────────
# Process-local cache for heavy objects we can't put in Reflex state
# ─────────────────────────────────────────────────────────────────────────────

_session_cache: dict[str, dict] = {}
