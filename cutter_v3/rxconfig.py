"""Reflex project config for Cutter v3."""
import reflex as rx
from reflex_components_radix.plugin import RadixThemesPlugin

config = rx.Config(
    app_name="cutter_v3",
    frontend_port=3003,
    backend_port=8003,
    db_url=None,
    plugins=[
        RadixThemesPlugin(
            theme=rx.theme(
                accent_color="red",
                gray_color="slate",
                radius="small",
                scaling="100%",
            ),
        ),
    ],
)
