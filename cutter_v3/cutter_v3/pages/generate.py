"""/generate — kick off the exporter and provide a download link."""
from __future__ import annotations

import reflex as rx

from ..components.shell import shell
from ..state import AppState


def generate_body() -> rx.Component:
    return rx.cond(
        AppState.n_datamap_blocks > 0,
        rx.vstack(
            rx.heading("Build the cuts workbook", size="4"),
            rx.text(
                "Click Build to assemble the .xlsx in the target Bain format. "
                "Once built, a download link appears.",
                color=rx.color("gray", 11), font_size="0.875rem",
            ),
            rx.hstack(
                rx.text("Themes:", font_weight="600"),
                rx.text(AppState.theme_names.length().to_string()),
                rx.text("Filters:", font_weight="600"),
                rx.text(AppState.filter_column_ids.length().to_string()),
                rx.text("Queued cross-cuts:", font_weight="600"),
                rx.text(AppState.queued_cross_cuts.length().to_string()),
                spacing="3",
            ),
            rx.button(
                "Build workbook",
                on_click=AppState.build_workbook,
                background="#CC0000", color="white",
                padding="0.75rem 1.5rem", font_weight="700",
                font_size="0.95rem",
            ),
            rx.cond(
                AppState.workbook_ready,
                rx.vstack(
                    rx.callout(
                        f"Built: {AppState.workbook_size_bytes} bytes at {AppState.workbook_path}",
                        icon="circle_check", color_scheme="green",
                    ),
                    rx.text(
                        "The file is in your temp dir. Open it directly with Excel "
                        "(or set up a server-side download endpoint in a later iteration).",
                        font_size="0.8rem", color=rx.color("gray", 11),
                    ),
                    spacing="2", align="stretch",
                ),
                rx.fragment(),
            ),
            rx.hstack(
                rx.link(rx.button("← Cross Cuts", variant="soft"), href="/crosscuts"),
                rx.spacer(),
                width="100%", margin_top="1rem",
            ),
            spacing="3", align="stretch", width="100%",
        ),
        rx.vstack(
            rx.callout("No data loaded. Go to Upload first.",
                        icon="info", color_scheme="blue"),
            rx.link(rx.button("← Upload"), href="/"),
        ),
    )


def generate_page() -> rx.Component:
    return shell(generate_body(), title="Generate")
