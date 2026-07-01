"""/themes — review themes + filters (read-only in MVP)."""
from __future__ import annotations

import reflex as rx

from ..components.shell import shell
from ..state import AppState


def _theme_card(name: str, q_ids: list[str]) -> rx.Component:
    return rx.box(
        rx.vstack(
            rx.text(name, font_weight="700", font_size="1rem"),
            rx.text(f"{rx.Var.create(q_ids).length()} questions",
                    font_size="0.75rem", color=rx.color("gray", 10)),
            rx.foreach(q_ids, lambda qid: rx.text(
                qid, font_size="0.75rem", color=rx.color("gray", 11),
                font_family="monospace",
            )),
            spacing="1", align="start",
        ),
        border="1px solid",
        border_color=rx.color("gray", 5),
        border_left="3px solid #CC0000",
        padding="1rem",
        background="white",
    )


def themes_body() -> rx.Component:
    return rx.cond(
        AppState.n_datamap_blocks > 0,
        rx.vstack(
            rx.heading("Theme groups (each becomes an output sheet)", size="4"),
            rx.text(
                "Auto-suggested by Q-id ranges. MVP is read-only; full editing arrives in the next slice.",
                color=rx.color("gray", 11), font_size="0.875rem",
            ),
            rx.foreach(
                AppState.theme_names,
                lambda name, i: _theme_card(name, AppState.theme_question_ids[i]),
            ),
            rx.heading("Global filter slots", size="4", margin_top="1.5rem"),
            rx.text(
                "Demographic single-selects auto-picked. Edit in Generate page later.",
                color=rx.color("gray", 11), font_size="0.875rem",
            ),
            rx.foreach(AppState.filter_column_ids, lambda fid: rx.code(fid)),
            rx.hstack(
                rx.link(rx.button("← Validate", variant="soft"), href="/validate"),
                rx.spacer(),
                rx.link(
                    rx.button("Next: Cross Cuts →",
                              background="#CC0000", color="white", font_weight="700"),
                    href="/crosscuts",
                ),
                width="100%",
                margin_top="1rem",
            ),
            spacing="3", align="stretch", width="100%",
        ),
        rx.vstack(
            rx.callout("No data loaded. Go to Upload first.",
                        icon="info", color_scheme="blue"),
            rx.link(rx.button("← Upload"), href="/"),
        ),
    )


def themes_page() -> rx.Component:
    return shell(themes_body(), title="Themes & Filters")
