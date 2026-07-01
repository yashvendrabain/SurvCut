"""Cutter v2 — Streamlit UI.

Five tabs, in order:
  1. Upload          drop the combined .xlsx OR separate raw + datamap.
  2. Validate        review the parser + validator + classifier output.
  3. Themes          edit the auto-suggested theme groupings.
  4. Cross cuts      pick any two questions → dynamic preview.
  5. Generate        download the .xlsx in target format.
"""
from __future__ import annotations

import io
import os
import sys
import tempfile
import traceback
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from core.classifier import classify, summarise
from core.cross_cut import compute_cross_cut
from core.datamap_parser import parse_datamap_from_rows
from core.exporter import ExportInputs, export
from core.io_layer import LoadedInputs, load_combined, load_separate
from core.models import (
    CrossCutResult,
    FilterSlot,
    QuestionSpec,
    QuestionType,
    SurveySchema,
    ThemeGroup,
)
from core.single_cut import compute_all_single_cuts
from core.theme_grouper import suggest_themes, validate_theme_assignment
from core.validator import format_report, validate


# ─────────────────────────────────────────────────────────────────────────────
# Page setup
# ─────────────────────────────────────────────────────────────────────────────


st.set_page_config(
    page_title="Cutter v2",
    layout="wide",
    initial_sidebar_state="collapsed",
)


st.markdown("""
<style>
.stApp .block-container { padding-top: 1rem; }

/* Tabs — force visible labels on every Streamlit theme + IDE-webview combo */
[data-baseweb="tab-list"] {
  display: flex !important;
  visibility: visible !important;
  min-height: 40px !important;
  border-bottom: 1px solid #E0E0E0 !important;
}
[data-baseweb="tab-list"] button[data-baseweb="tab"] {
  font-size: 14px !important;
  font-weight: 600 !important;
  color: #0A0A0A !important;
  padding: 8px 16px !important;
  min-height: 40px !important;
  background: transparent !important;
  border: none !important;
}
[data-baseweb="tab-list"] button[data-baseweb="tab"] p,
[data-baseweb="tab-list"] button[data-baseweb="tab"] span,
[data-baseweb="tab-list"] button[data-baseweb="tab"] div {
  color: #0A0A0A !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}
[data-baseweb="tab-list"] button[data-baseweb="tab"][aria-selected="true"] {
  color: #CC0000 !important;
}
[data-baseweb="tab-list"] button[data-baseweb="tab"][aria-selected="true"] p,
[data-baseweb="tab-list"] button[data-baseweb="tab"][aria-selected="true"] span,
[data-baseweb="tab-list"] button[data-baseweb="tab"][aria-selected="true"] div {
  color: #CC0000 !important;
}
[data-baseweb="tab-highlight"] {
  background: #CC0000 !important;
  height: 3px !important;
}

.tile { background:white; border:1px solid #E0E0E0; border-top:3px solid #CC0000;
        padding:12px 16px; }
.tile-num { font-size:24px; font-weight:700; color:#0A0A0A; }
.tile-lbl { font-size:11px; font-weight:700; letter-spacing:0.1em;
            text-transform:uppercase; color:#888; }
.section { font-size:13px; font-weight:700; text-transform:uppercase;
           letter-spacing:0.08em; color:#0A0A0A; border-bottom:2px solid #E0E0E0;
           padding-bottom:6px; margin-top:14px; }
</style>
""", unsafe_allow_html=True)


def section(txt: str) -> None:
    st.markdown(f'<div class="section">{txt}</div>', unsafe_allow_html=True)


def tile(col, value, label) -> None:
    col.markdown(
        f'<div class="tile"><div class="tile-num">{value}</div>'
        f'<div class="tile-lbl">{label}</div></div>',
        unsafe_allow_html=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Session state defaults
# ─────────────────────────────────────────────────────────────────────────────


DEFAULTS = {
    "loaded": None,            # LoadedInputs
    "blocks": None,
    "schema": None,
    "validation": None,
    "themes": None,            # list[ThemeGroup]
    "filters": [],             # list[FilterSlot]
    "cross_cuts_picked": [],   # list[CrossCutResult] (computed previews)
    "single_preview_open": False,
}
for k, v in DEFAULTS.items():
    st.session_state.setdefault(k, v)


# ─────────────────────────────────────────────────────────────────────────────
# Tabs
# ─────────────────────────────────────────────────────────────────────────────


tab_upload, tab_validate, tab_themes, tab_xcuts, tab_generate = st.tabs([
    "Upload",
    "Validate & Classify",
    "Themes & Filters",
    "Cross Cuts",
    "Generate",
])


# =============================================================================
# Tab 1 — Upload
# =============================================================================


with tab_upload:
    section("Upload inputs")
    mode = st.radio(
        "Format", ("Combined .xlsx (datamap + raw in one file)",
                   "Separate files (one raw, one datamap)"),
        horizontal=True, label_visibility="collapsed",
    )

    loaded: LoadedInputs | None = None
    if mode.startswith("Combined"):
        f = st.file_uploader("Combined .xlsx", type=["xlsx"], key="combined")
        if f is not None:
            try:
                loaded = load_combined(f.getvalue())
            except Exception as e:
                st.error(f"{type(e).__name__}: {e}")
                st.code(traceback.format_exc())
    else:
        c1, c2 = st.columns(2)
        with c1:
            raw_up = st.file_uploader("Raw data", type=["xlsx", "csv"], key="raw")
        with c2:
            dm_up = st.file_uploader("Datamap", type=["xlsx"], key="dm")
        if raw_up is not None and dm_up is not None:
            try:
                loaded = load_separate(raw_up.getvalue(), dm_up.getvalue())
            except Exception as e:
                st.error(f"{type(e).__name__}: {e}")
                st.code(traceback.format_exc())

    if loaded is not None:
        st.session_state["loaded"] = loaded
        # Run the parser + validator + classifier immediately so the next tabs
        # always see a fresh view.
        try:
            blocks = parse_datamap_from_rows(loaded.datamap_rows)
            schema = classify(blocks, loaded.raw_df)
            validation = validate(blocks, loaded.raw_df)
            st.session_state["blocks"] = blocks
            st.session_state["schema"] = schema
            st.session_state["validation"] = validation
            # Default theme suggestion
            st.session_state["themes"] = suggest_themes(schema)
            # Default filters: any demographic single-select
            st.session_state["filters"] = [
                FilterSlot(name=q.column_id, column_id=q.column_id, default_value="All")
                for q in schema.questions
                if q.analysis_eligible and q.is_demographic
                and q.question_type == QuestionType.SINGLE_SELECT
            ][:10]
            st.success(f"Loaded: raw {loaded.raw_df.shape[0]}×{loaded.raw_df.shape[1]}, "
                       f"datamap {len(blocks)} blocks. {loaded.datamap_source_note}")
        except Exception as e:
            st.error(f"Parse / classify failed: {type(e).__name__}: {e}")
            st.code(traceback.format_exc())

    if st.session_state["loaded"] is not None:
        lo = st.session_state["loaded"]
        schema = st.session_state["schema"]
        c1, c2, c3, c4 = st.columns(4)
        tile(c1, lo.raw_df.shape[0], "Respondents")
        tile(c2, lo.raw_df.shape[1], "Raw columns")
        tile(c3, len(st.session_state["blocks"]) if st.session_state["blocks"] else 0, "Datamap blocks")
        tile(c4, len(schema.analysis_questions()) if schema else 0, "Eligible questions")


# =============================================================================
# Tab 2 — Validate & Classify
# =============================================================================


with tab_validate:
    section("Validation report")
    val = st.session_state["validation"]
    if val is None:
        st.info("Upload inputs first.")
    else:
        if val.has_errors:
            st.error("Validation found errors — fix the datamap before generating.")
        elif val.has_warnings:
            st.warning("Validation found warnings — review and decide.")
        else:
            st.success("All clean — no errors, no warnings.")
        st.code(format_report(val))

    section("Classified schema")
    schema: SurveySchema | None = st.session_state["schema"]
    if schema is None:
        st.info("No schema yet.")
    else:
        st.text(summarise(schema))
        st.caption("Per-question breakdown:")
        rows = []
        for q in schema.questions:
            rows.append({
                "Column ID": q.column_id,
                "Type": q.question_type.value,
                "Options": len(q.option_map),
                "Sub-cols": len(q.sub_column_labels),
                "Demographic?": "Y" if q.is_demographic else "",
                "Eligible?": "Y" if q.analysis_eligible else f"No ({q.exclusion_reason})",
                "Text": q.question_text[:80],
            })
        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    section("Single cuts (preview)")
    if schema is not None and st.session_state["loaded"] is not None:
        if st.button("Compute all single cuts (preview)"):
            cuts = compute_all_single_cuts(schema, st.session_state["loaded"].raw_df)
            st.session_state["_preview_cuts"] = cuts
        cuts = st.session_state.get("_preview_cuts")
        if cuts:
            for cut in cuts[:50]:
                with st.expander(f"{cut.column_id} — {cut.question_text[:80]} "
                                  f"({cut.question_type.value}, n={cut.valid_n})"):
                    if cut.headline_metric:
                        st.caption(f"**{cut.headline_metric}**")
                    st.dataframe(
                        pd.DataFrame([{
                            "Label": r.label, "Count/N": r.count, "Value": round(r.pct, 2)
                        } for r in cut.rows]),
                        use_container_width=True, hide_index=True,
                    )
                    if cut.warnings:
                        for w in cut.warnings:
                            st.caption(f"⚠ {w}")


# =============================================================================
# Tab 3 — Themes & Filters
# =============================================================================


with tab_themes:
    section("Theme groups (each becomes an output sheet)")
    schema = st.session_state["schema"]
    themes: list[ThemeGroup] | None = st.session_state["themes"]
    if not schema or not themes:
        st.info("Upload inputs first.")
    else:
        # Editable table — one row per theme, one row per question per theme.
        # Simpler UX: show themes as expanders, let user reassign questions via multiselect.
        eligible_ids = [q.column_id for q in schema.analysis_questions()]
        used: set[str] = set()
        new_themes: list[ThemeGroup] = []
        for i, t in enumerate(themes):
            with st.expander(f"📁 {t.name} ({len(t.question_column_ids)} questions)", expanded=(i < 3)):
                new_name = st.text_input("Theme name", value=t.name, key=f"th_name_{i}")
                # Show only questions not yet claimed by prior themes
                available = [q for q in eligible_ids if q not in used or q in t.question_column_ids]
                picked = st.multiselect(
                    "Questions in this theme", available, default=t.question_column_ids,
                    key=f"th_qs_{i}",
                )
                for qid in picked:
                    used.add(qid)
                new_themes.append(ThemeGroup(name=new_name[:31], question_column_ids=picked))
        st.session_state["themes"] = new_themes

        warns, errs = validate_theme_assignment(new_themes, schema)
        for w in warns:
            st.warning(w)
        for e in errs:
            st.error(e)
        # Allow adding a new theme
        with st.expander("➕ Add a new theme"):
            new_name = st.text_input("New theme name", value="", key="new_theme_name")
            available = [q for q in eligible_ids if q not in used]
            new_qs = st.multiselect("Questions", available, default=[], key="new_theme_qs")
            if st.button("Add"):
                if new_name.strip():
                    new_themes.append(ThemeGroup(name=new_name[:31], question_column_ids=new_qs))
                    st.session_state["themes"] = new_themes
                    st.rerun()

    section("Global Filter slots (top of each theme sheet)")
    schema = st.session_state["schema"]
    if schema:
        demo_options = [q.column_id for q in schema.questions
                        if q.analysis_eligible and q.is_demographic
                        and q.question_type == QuestionType.SINGLE_SELECT]
        picked_filters = st.multiselect(
            "Pick demographic single-select questions to use as Global Filters",
            demo_options,
            default=[f.column_id for f in (st.session_state["filters"] or [])
                     if f.column_id in demo_options],
        )
        st.session_state["filters"] = [
            FilterSlot(name=qid, column_id=qid, default_value="All") for qid in picked_filters
        ]


# =============================================================================
# Tab 4 — Cross Cuts (dynamic preview)
# =============================================================================


with tab_xcuts:
    section("Dynamic cross-cut builder")
    schema = st.session_state["schema"]
    loaded = st.session_state["loaded"]
    if not schema or not loaded:
        st.info("Upload inputs first.")
    else:
        eligible = list(schema.analysis_questions())
        labels = {q.column_id: f"{q.column_id} — {q.question_text[:60]} ({q.question_type.value})"
                  for q in eligible}

        c1, c2, c3 = st.columns([3, 3, 1])
        with c1:
            row_qid = st.selectbox("Row question", options=list(labels.keys()),
                                    format_func=lambda x: labels[x], key="xcut_row")
        with c2:
            col_qid = st.selectbox("Column question", options=list(labels.keys()),
                                    format_func=lambda x: labels[x], key="xcut_col")
        with c3:
            do_compute = st.button("Compute")

        if do_compute and row_qid and col_qid and row_qid != col_qid:
            row_q = schema.by_column_id(row_qid)
            col_q = schema.by_column_id(col_qid)
            result = compute_cross_cut(row_q, col_q, loaded.raw_df)
            if result.warnings:
                for w in result.warnings:
                    st.caption(f"⚠ {w}")
            if result.row_labels and result.col_labels:
                st.markdown(f"**{result.row_question_text}** × **{result.col_question_text}**")
                df = pd.DataFrame(
                    [[result.counts[i][j] for j in range(len(result.col_labels))]
                     for i in range(len(result.row_labels))],
                    index=list(result.row_labels), columns=list(result.col_labels),
                )
                st.dataframe(df.style.format("{:.1f}"), use_container_width=True)
                if st.button("➕ Add this cross-cut to the output workbook"):
                    st.session_state["cross_cuts_picked"].append(result)
                    st.success(f"Added. Total cross cuts queued: {len(st.session_state['cross_cuts_picked'])}")
            else:
                st.warning("No data to display in this cross-cut.")

        section("Queued cross cuts")
        picked = st.session_state["cross_cuts_picked"]
        if not picked:
            st.caption("None yet — compute one above and click ➕ Add to queue it.")
        else:
            for i, cc in enumerate(picked):
                col_a, col_b = st.columns([8, 1])
                with col_a:
                    st.markdown(f"{i+1}. `{cc.row_column_id}` × `{cc.col_column_id}` "
                                f"— {len(cc.row_labels)}×{len(cc.col_labels)} table")
                with col_b:
                    if st.button("✕", key=f"rm_xcut_{i}"):
                        st.session_state["cross_cuts_picked"].pop(i)
                        st.rerun()


# =============================================================================
# Tab 5 — Generate
# =============================================================================


with tab_generate:
    section("Generate cuts workbook")
    schema = st.session_state["schema"]
    loaded = st.session_state["loaded"]
    themes = st.session_state["themes"]
    filters = st.session_state["filters"]
    cross_cuts = st.session_state["cross_cuts_picked"]
    blocks = st.session_state["blocks"]

    if not (schema and loaded and themes is not None):
        st.info("Upload inputs first, then visit Themes & Filters.")
    else:
        c1, c2, c3, c4 = st.columns(4)
        tile(c1, len(themes), "Themes")
        tile(c2, sum(len(t.question_column_ids) for t in themes), "Questions in themes")
        tile(c3, len(filters), "Global filters")
        tile(c4, len(cross_cuts), "Cross cuts")

        if st.button("🛠  Build workbook", type="primary"):
            try:
                out_path = os.path.join(tempfile.gettempdir(), "cutter_v2_output.xlsx")
                inputs = ExportInputs(
                    schema=schema,
                    raw_df=loaded.raw_df,
                    datamap_rows=loaded.datamap_rows,
                    themes=themes,
                    filters=filters,
                    cross_cuts=tuple(cross_cuts),
                )
                path = export(inputs, out_path)
                with open(path, "rb") as f:
                    data = f.read()
                st.session_state["_xlsx_bytes"] = data
                st.success(f"Workbook built: {len(data):,} bytes")
            except Exception as e:
                st.error(f"{type(e).__name__}: {e}")
                st.code(traceback.format_exc())

        if st.session_state.get("_xlsx_bytes"):
            st.download_button(
                "⬇  Download cuts workbook (.xlsx)",
                data=st.session_state["_xlsx_bytes"],
                file_name="cutter_v2_output.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=False,
            )
