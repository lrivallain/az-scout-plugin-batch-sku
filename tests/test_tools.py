"""Tests for the MCP tool function."""

import json
from unittest.mock import patch

from az_scout_plugin_batch_sku.tools import list_batch_skus


def test_list_batch_skus_returns_json_string(raw_skus: list[dict]) -> None:
    """MCP tool must return a JSON string, not a list."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = list_batch_skus(subscription_id="sub-1", region="westeurope")

    assert isinstance(result, str)
    parsed = json.loads(result)
    assert isinstance(parsed, list)
    assert len(parsed) == 5


def test_list_batch_skus_sorted(raw_skus: list[dict]) -> None:
    """Results are sorted by family then name."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(list_batch_skus(subscription_id="sub-1", region="westeurope"))

    names = [s["name"] for s in result]
    assert names == [
        "Standard_D2s_v3",
        "Standard_E4s_v5",
        "Standard_M416ms_v2",
        "Standard_NC6",
        "Standard_NC24s_v3",
    ]


def test_family_filter(raw_skus: list[dict]) -> None:
    """family_filter narrows results by case-insensitive substring."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(subscription_id="sub-1", region="westeurope", family_filter="NCFamily")
        )

    assert len(result) == 1
    assert result[0]["name"] == "Standard_NC6"


def test_name_filter(raw_skus: list[dict]) -> None:
    """name_filter narrows results by case-insensitive substring."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(subscription_id="sub-1", region="westeurope", name_filter="e4s")
        )

    assert len(result) == 1
    assert result[0]["name"] == "Standard_E4s_v5"


def test_combined_filters(raw_skus: list[dict]) -> None:
    """Both filters applied together narrow results."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(
                subscription_id="sub-1",
                region="westeurope",
                family_filter="DS",
                name_filter="d2s",
            )
        )

    assert len(result) == 1
    assert result[0]["name"] == "Standard_D2s_v3"


def test_no_match_returns_empty(raw_skus: list[dict]) -> None:
    """When no SKU matches, an empty JSON list is returned."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(subscription_id="sub-1", region="westeurope", name_filter="nonexistent")
        )

    assert result == []


def test_tenant_id_forwarded(raw_skus: list[dict]) -> None:
    """Non-empty tenant_id is passed to _get_headers."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}) as mock_hdr,
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        list_batch_skus(subscription_id="sub-1", region="westeurope", tenant_id="t-abc")

    mock_hdr.assert_called_once_with("t-abc")


def test_empty_tenant_id_passes_none(raw_skus: list[dict]) -> None:
    """Empty tenant_id string is converted to None for _get_headers."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}) as mock_hdr,
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        list_batch_skus(subscription_id="sub-1", region="westeurope", tenant_id="")

    mock_hdr.assert_called_once_with(None)


def test_min_vcpus_filter(raw_skus: list[dict]) -> None:
    """min_vcpus keeps only SKUs with vCPUs >= the given threshold."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(subscription_id="sub-1", region="westeurope", min_vcpus=200)
        )

    assert len(result) == 1
    assert result[0]["name"] == "Standard_M416ms_v2"


def test_min_memory_gb_filter(raw_skus: list[dict]) -> None:
    """min_memory_gb keeps only SKUs with MemoryGB >= the given threshold."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(subscription_id="sub-1", region="westeurope", min_memory_gb=100)
        )

    names = [s["name"] for s in result]
    assert "Standard_M416ms_v2" in names
    assert "Standard_NC24s_v3" in names
    assert "Standard_D2s_v3" not in names


def test_min_gpus_filter(raw_skus: list[dict]) -> None:
    """min_gpus keeps only SKUs with GPUs >= the given threshold."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(subscription_id="sub-1", region="westeurope", min_gpus=1)
        )

    names = [s["name"] for s in result]
    assert "Standard_NC6" in names
    assert "Standard_NC24s_v3" in names
    assert len(result) == 2


def test_capability_filter_combined_with_name(raw_skus: list[dict]) -> None:
    """Capability filters work together with name_filter."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(
                subscription_id="sub-1", region="westeurope", min_gpus=1, name_filter="NC24"
            )
        )

    assert len(result) == 1
    assert result[0]["name"] == "Standard_NC24s_v3"


def test_zero_capability_filters_return_all(raw_skus: list[dict]) -> None:
    """Default zero values for capability filters do not exclude any SKU."""
    with (
        patch("az_scout_plugin_batch_sku.tools._get_headers", return_value={}),
        patch("az_scout_plugin_batch_sku.tools._paginate", return_value=raw_skus),
    ):
        result = json.loads(
            list_batch_skus(
                subscription_id="sub-1",
                region="westeurope",
                min_vcpus=0,
                min_memory_gb=0,
                min_gpus=0,
            )
        )

    assert len(result) == 5
