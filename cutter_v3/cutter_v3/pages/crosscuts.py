"""/crosscuts — pick two questions, see a dynamically-sized matrix, queue it."""
from __future__ import annotations

import reflex as rx

from ..components.shell import shell
from ..state import AppState


def _value_options() -> rx.Component:
    return rx.foreach(
        AppState.eligible_options,
        lambda opt: rx.select.item(opt["label"], value=opt["value"]),
    )


def crosscut_builder() -> rx.Component:
    return rx.vstack(
        rx.heading("Dynamic cross-cut builder", size="4"),
        rx.text(
            "Pick any two questions. Table dimensions size from the actual option counts.",
            color=rx.color("gray", 11), font_size="0.875rem",
        ),
        rx.hstack(
            rx.vstack(
                rx.text("Row question", font_weight="600", font_size="0.8rem"),
                rx.select.root(
                    rx.select.trigger(placeholder="Pick row…"),
                    rx.select.content(_value_options()),
                    value=AppState.xcut_row_qid,
                    on_change=AppState.set_xcut_row,
                ),
                spacing="1", align="start", flex="1 1 0",
            ),
            rx.vstack(
                rx.text("Column question", font_weight="600", font_size="0.8rem"),
                rx.select.root(
                    rx.select.trigger(placeholder="Pick column…"),
                    rx.select.content(_value_options()),
                    value=AppState.xcut_col_qid,
                    on_change=AppState.set_xcut_col,
                ),
                spacing="1", align="start", flex="1 1 0",
            ),
            rx.button("Compute",
                        on_click=AppState.compute_xcut,
                        background="#CC0000", color="white",
                        padding="0.65rem 1.25rem", font_weight="700",
                        align_self="end"),
            spacing="3", align="end", width="100%",
        ),
        rx.cond(
            AppState.xcut_warnings.length() > 0,
            rx.foreach(AppState.xcut_warnings, lambda w: rx.callout(
                w, icon="triangle_alert", color_scheme="amber", size="1",
            )),
            rx.fragment(),
        ),
        spacing="3", align="stretch", width="100%",
    )


def crosscut_table() -> rx.Component:
    return rx.cond(
        AppState.xcut_row_labels.length() > 0,
        rx.vstack(
            rx.text(
                f"Matrix: {AppState.xcut_row_labels.length()} rows × {AppState.xcut_col_labels.length()} cols",
                font_size="0.875rem", color=rx.color("gray", 11),
            ),
            rx.box(
                rx.table.root(
                    rx.table.header(
                        rx.table.row(
                            rx.table.column_header_cell(""),
                            rx.foreach(
                                AppState.xcut_col_labels,
                                lambda c: rx.table.column_header_cell(c),
                            ),
                        ),
                    ),
                    rx.table.body(
                        rx.foreach(
                            AppState.xcut_row_labels,
                            lambda rlbl, i: rx.table.row(
                                rx.table.row_header_cell(rlbl),
                                rx.foreach(
                                    AppState.xcut_counts[i],
                                    lambda v: rx.table.cell(v.to_string()),
                                ),
                            ),
                        ),
                    ),
                    variant="surface",
                ),
                overflow_x="auto", width="100%",
            ),
            rx.button(
                "Add to output workbook",
                on_click=AppState.queue_xcut,
                background="#CC0000", color="white",
                padding="0.5rem 1.25rem", font_weight="700",
            ),
            spacing="3", align="stretch", width="100%",
        ),
        rx.fragment(),
    )


def queued_list() -> rx.Component:
    return rx.cond(
        AppState.queued_cross_cuts.length() > 0,
        rx.vstack(
            rx.heading("Queued cross cuts", size="3", margin_top="1rem"),
            rx.foreach(
                AppState.queued_cross_cuts,
                lambda cc, i: rx.hstack(
                    rx.text(f"{i+1}. ", font_weight="700"),
                    rx.code(cc["row"]),
                    rx.text("×"),
                    rx.code(cc["col"]),
                    rx.text(f"({cc['row_n']} × {cc['col_n']})",
                            color=rx.color("gray", 10), font_size="0.8rem"),
                    rx.spacer(),
                    rx.button("✕", on_click=AppState.remove_xcut(i),
                                variant="ghost", size="1"),
                    align="center", spacing="2", width="100%",
                ),
            ),
            spacing="1", align="stretch", width="100%",
        ),
        rx.fragment(),
    )


def crosscuts_body() -> rx.Component:
    return rx.cond(
        AppState.n_datamap_blocks > 0,
        rx.vstack(
            crosscut_builder(),
            crosscut_table(),
            queued_list(),
            rx.hstack(
                rx.link(rx.button("← Themes", variant="soft"), href="/themes"),
                rx.spacer(),
                rx.link(
                    rx.button("Next: Generate →",
                              background="#CC0000", color="white", font_weight="700"),
                    href="/generate",
                ),
                width="100%",
                margin_top="1rem",
            ),
            spacing="4", align="stretch", width="100%",
        ),
        rx.vstack(
            rx.callout("No data loaded. Go to Upload first.",
                        icon="info", color_scheme="blue"),
            rx.link(rx.button("← Upload"), href="/"),
        ),
    )


def crosscuts_page() -> rx.Component:
    return shell(crosscuts_body(), title="Cross Cuts")
