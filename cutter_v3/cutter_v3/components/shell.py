"""Shared layout shell — Bain-red header + nav links + page slot."""
from __future__ import annotations

import reflex as rx

from ..state import AppState


NAV_ITEMS = [
    ("Upload", "/"),
    ("Validate", "/validate"),
    ("Themes & Filters", "/themes"),
    ("Cross Cuts", "/crosscuts"),
    ("Generate", "/generate"),
]


def _nav_link(label: str, href: str) -> rx.Component:
    return rx.link(
        rx.text(
            label,
            color=rx.color("gray", 12),
            font_size="0.875rem",
            font_weight="600",
            letter_spacing="0.04em",
        ),
        href=href,
        underline="none",
        padding_x="1rem",
        padding_y="0.75rem",
        _hover={"background": rx.color("gray", 3)},
    )


def navbar() -> rx.Component:
    return rx.box(
        rx.hstack(
            rx.hstack(
                rx.box(width="6px", height="22px", background="#CC0000"),
                rx.text("CUTTER v3", font_weight="800",
                        font_size="1rem", letter_spacing="0.08em"),
                rx.text("· Reflex UI · port 3003",
                        font_size="0.75rem", color=rx.color("gray", 9),
                        letter_spacing="0.06em"),
                align="center", spacing="2",
            ),
            rx.spacer(),
            rx.hstack(
                *[_nav_link(label, href) for label, href in NAV_ITEMS],
                spacing="0",
            ),
            align="center",
            padding_x="2rem",
            padding_y="0.5rem",
        ),
        border_bottom=f"2px solid #CC0000",
        background="white",
        width="100%",
        position="sticky",
        top="0",
        z_index="100",
    )


def busy_banner() -> rx.Component:
    """A red-accent banner with spinner that appears while AppState.is_busy is True."""
    return rx.cond(
        AppState.is_busy,
        rx.box(
            rx.hstack(
                rx.spinner(size="3", color="#CC0000"),
                rx.text(
                    AppState.busy_message,
                    color="#0A0A0A",
                    font_weight="600",
                    font_size="0.9rem",
                ),
                align="center",
                spacing="3",
                padding_x="2rem",
                padding_y="0.75rem",
            ),
            background="#FFF5F5",
            border_bottom="2px solid #CC0000",
            width="100%",
            position="sticky",
            top="48px",
            z_index="99",
        ),
        rx.fragment(),
    )


def shell(page: rx.Component, title: str = "") -> rx.Component:
    """Wrap a page in navbar + content area."""
    return rx.box(
        navbar(),
        busy_banner(),
        rx.box(
            rx.vstack(
                rx.cond(
                    title != "",
                    rx.heading(title, size="6", weight="bold",
                               margin_bottom="1rem"),
                    rx.fragment(),
                ),
                page,
                width="100%",
                spacing="3",
                align="stretch",
            ),
            max_width="1100px",
            margin="0 auto",
            padding="1.5rem 2rem",
        ),
        background="white",
        min_height="100vh",
    )
