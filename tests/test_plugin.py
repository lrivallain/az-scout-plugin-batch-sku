"""Tests for the BatchSkuPlugin class."""

from pathlib import Path

from az_scout.plugin_api import TabDefinition

from az_scout_batch_sku import BatchSkuPlugin, plugin


class TestPluginInstance:
    """Verify the module-level plugin instance."""

    def test_module_level_instance(self) -> None:
        assert isinstance(plugin, BatchSkuPlugin)

    def test_name(self) -> None:
        assert plugin.name == "batch-sku"

    def test_version_is_string(self) -> None:
        assert isinstance(plugin.version, str)
        assert len(plugin.version) > 0


class TestPluginMethods:
    """Verify every protocol method returns the expected type."""

    def setup_method(self) -> None:
        self.plugin = BatchSkuPlugin()

    def test_get_router_returns_api_router(self) -> None:
        from fastapi import APIRouter

        router = self.plugin.get_router()
        assert isinstance(router, APIRouter)

    def test_get_mcp_tools_returns_list(self) -> None:
        tools = self.plugin.get_mcp_tools()
        assert tools is not None
        assert len(tools) == 1
        assert callable(tools[0])
        assert tools[0].__name__ == "list_batch_skus"

    def test_get_static_dir_exists(self) -> None:
        static_dir = self.plugin.get_static_dir()
        assert isinstance(static_dir, Path)
        assert static_dir.is_dir()

    def test_get_tabs_returns_tab_definitions(self) -> None:
        tabs = self.plugin.get_tabs()
        assert tabs is not None
        assert len(tabs) == 1
        tab = tabs[0]
        assert isinstance(tab, TabDefinition)
        assert tab.id == "batch-sku"
        assert tab.label == "Batch SKUs"
        assert tab.js_entry == "js/batch-sku-tab.js"
        assert tab.css_entry == "css/batch-sku.css"

    def test_get_chat_modes_returns_none(self) -> None:
        assert self.plugin.get_chat_modes() is None
