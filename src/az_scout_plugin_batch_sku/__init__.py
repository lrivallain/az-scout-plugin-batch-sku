"""az-scout Batch SKU plugin.

Lists Azure Batch-compatible VM SKUs per region, grouped by VM family.
"""

from collections.abc import Callable
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version
from pathlib import Path
from typing import Any

from az_scout.plugin_api import ChatMode, TabDefinition
from fastapi import APIRouter

try:
    __version__ = _pkg_version("az-scout-plugin-batch-sku")
except PackageNotFoundError:
    __version__ = "0.0.0-dev"

_STATIC_DIR = Path(__file__).parent / "static"


class BatchSkuPlugin:
    """Plugin that lists Batch-compatible VM SKUs per region."""

    name = "batch_sku"
    version = __version__

    def get_router(self) -> APIRouter | None:
        """Return API routes, or None to skip."""
        from az_scout_plugin_batch_sku.routes import router

        return router

    def get_mcp_tools(self) -> list[Callable[..., Any]] | None:
        """Return MCP tool functions, or None to skip."""
        from az_scout_plugin_batch_sku.tools import list_batch_skus

        return [list_batch_skus]

    def get_static_dir(self) -> Path | None:
        """Return path to static assets directory, or None to skip."""
        return _STATIC_DIR

    def get_tabs(self) -> list[TabDefinition] | None:
        """Return UI tab definitions, or None to skip."""
        return [
            TabDefinition(
                id="batch_sku",
                label="Batch SKUs",
                icon="bi bi-gpu-card",
                js_entry="js/batch-sku-tab.js",
                css_entry="css/batch-sku.css",
            )
        ]

    def get_chat_modes(self) -> list[ChatMode] | None:
        """Return chat mode definitions, or None to skip."""
        return None

    def get_system_prompt_addendum(self) -> str | None:
        """Return extra guidance for the default discussion chat mode, or None."""
        return None


# Module-level instance — referenced by the entry point
plugin = BatchSkuPlugin()
