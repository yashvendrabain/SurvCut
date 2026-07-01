"""/validate — show parser + classifier + validator output."""
from __future__ import annotations

import reflex as rx

from ..components.shell import shell
from ..state import AppState


def validate_body() -> rx.Component:
    return rx.cond(
        AppState.n_datamap_blocks > 0,
        rx.vstack(
            rx.heading("Validation", size="4"),
            rx.cond(
                AppState.validation_has_errors,
                rx.callout("Validation found errors — fix before generating.",
                            icon="circle_alert", color_scheme="red"),
                rx.cond(
                    AppState.validation_has_warnings,
                    rx.callout("Validation found warnings — review and decide.",
                                icon="triangle_alert", color_scheme="amber"),
                    rx.callout("All clean — no errors, no warnings.",
                                icon="circle_check", color_scheme="green"),
                ),
            ),
            rx.box(
                rx.text(
                    AppState.validation_summary,
                    font_family="monospace", font_size="0.8rem",
                    white_space="pre-wrap", color=rx.color("gray", 12),
                ),
                background=rx.color("gray", 2),
                border="1px solid",
                border_color=rx.color("gray", 5),
                padding="0.75rem 1rem",
                width="100%",
            ),
            rx.heading("Classified schema", size="4", margin_top="1rem"),
            rx.box(
                rx.text(
                    AppState.schema_summary,
                    font_family="monospace", font_size="0.8rem",
                    white_space="pre-wrap", color=rx.color("gray", 12),
                ),
                background=rx.color("gray", 2),
                border="1px solid",
                border_color=rx.color("gray", 5),
                padding="0.75rem 1rem",
                width="100%",
            ),
            rx.hstack(
                rx.link(rx.button("← Upload", variant="soft"), href="/"),
                rx.spacer(),
                rx.link(
                    rx.button("Next: Themes & Filters →",
                              background="#CC0000", color="white", font_weight="700"),
                    href="/themes",
                ),
                width="100%",
                margin_top="1rem",
            ),
            spacing="3", align="stretch", width="100%",
        ),
        rx.vstack(
            rx.callout(
                "No data loaded. Go to Upload first.",
                icon="info", color_scheme="blue",
            ),
            rx.link(rx.button("← Upload"), href="/"),
            spacing="3", align="start",
        ),
    )


def validate_page() -> rx.Component:
    return shell(validate_body(), title="Validate & Classify")
