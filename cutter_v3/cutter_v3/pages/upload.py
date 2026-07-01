"""/ — Upload page."""
from __future__ import annotations

import reflex as rx

from ..components.shell import shell
from ..state import AppState


def _stat_tile(value, label: str) -> rx.Component:
    return rx.box(
        rx.vstack(
            rx.text(value, font_size="1.75rem", font_weight="700",
                    color="#0A0A0A", line_height="1.1"),
            rx.text(label, font_size="0.75rem", font_weight="700",
                    letter_spacing="0.12em", text_transform="uppercase",
                    color=rx.color("gray", 10)),
            spacing="1", align="start",
        ),
        background="white",
        border="1px solid",
        border_color=rx.color("gray", 5),
        border_top="3px solid #CC0000",
        padding="1rem 1.25rem",
        flex="1 1 0",
    )


def upload_form() -> rx.Component:
    return rx.vstack(
        rx.heading("Upload your inputs", size="4", margin_bottom="0.5rem"),
        rx.text(
            "Drop a combined .xlsx with the Datamap and Raw data on separate sheets. "
            "See docs/DATAMAP_SPEC.md for the required format.",
            color=rx.color("gray", 11),
            font_size="0.875rem",
            margin_bottom="1rem",
        ),
        rx.upload(
            rx.vstack(
                rx.icon("upload", size=32, color="#CC0000"),
                rx.text("Drag & drop the combined .xlsx (or click to browse)",
                        font_weight="600"),
                rx.text("Limit 500 MB • XLSX",
                        font_size="0.75rem", color=rx.color("gray", 9)),
                spacing="2", align="center",
            ),
            id="combined_upload",
            accept={
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            },
            max_files=1,
            border="1px dashed #CC0000",
            padding="2.5rem",
            background="white",
            _hover={"background": "#FFF7F7"},
            on_drop=AppState.handle_combined_upload(rx.upload_files(upload_id="combined_upload")),
            width="100%",
        ),
        rx.cond(
            AppState.upload_error != "",
            rx.callout(
                AppState.upload_error,
                icon="triangle_alert",
                color_scheme="red",
                margin_top="1rem",
            ),
            rx.fragment(),
        ),
        spacing="3", align="stretch", width="100%",
    )


def upload_summary() -> rx.Component:
    return rx.cond(
        AppState.n_datamap_blocks > 0,
        rx.vstack(
            rx.callout(
                AppState.last_load_note,
                icon="circle_check",
                color_scheme="green",
                margin_top="1rem",
            ),
            rx.hstack(
                _stat_tile(AppState.n_respondents, "Respondents"),
                _stat_tile(AppState.n_raw_columns, "Raw columns"),
                _stat_tile(AppState.n_datamap_blocks, "Datamap blocks"),
                _stat_tile(AppState.n_eligible_questions, "Eligible questions"),
                spacing="3", width="100%",
            ),
            rx.hstack(
                rx.link(
                    rx.button("Next: Validate →",
                              background="#CC0000", color="white",
                              padding="0.75rem 1.5rem", font_weight="700"),
                    href="/validate",
                ),
                margin_top="0.5rem",
            ),
            spacing="3", align="stretch", width="100%",
        ),
        rx.fragment(),
    )


def upload_page() -> rx.Component:
    return shell(
        rx.vstack(upload_form(), upload_summary(),
                  spacing="4", align="stretch", width="100%"),
        title="",
    )
