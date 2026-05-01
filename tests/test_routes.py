"""Tests for the Batch SKU API route."""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from az_scout.plugin_api import PluginUpstreamError
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from az_scout_batch_sku.routes import router

app = FastAPI()
app.include_router(router)


@pytest_asyncio.fixture()
async def client():
    """Return an async test client wired to the plugin router."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_list_batch_skus_success(client: AsyncClient, raw_skus: list[dict]) -> None:
    """GET /batch-skus returns a flat sorted list of SKUs."""
    with patch(
        "az_scout_batch_sku.routes.arm_paginate",
        return_value=raw_skus,
    ):
        resp = await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )

    assert resp.status_code == 200
    data = resp.json()

    assert data["region"] == "westeurope"
    assert data["subscriptionId"] == "sub-1"
    assert data["totalSkus"] == 5

    skus = data["skus"]
    assert len(skus) == 5
    # Sorted by family then name
    assert skus[0]["name"] == "Standard_D2s_v3"
    assert skus[1]["name"] == "Standard_E4s_v5"
    assert skus[2]["name"] == "Standard_M416ms_v2"


@pytest.mark.asyncio
async def test_list_batch_skus_with_tenant(client: AsyncClient, raw_skus: list[dict]) -> None:
    """Tenant ID is forwarded to arm_paginate."""
    with patch(
        "az_scout_batch_sku.routes.arm_paginate",
        return_value=raw_skus,
    ) as mock_paginate:
        resp = await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "eastus", "tenant_id": "t-123"},
        )

    assert resp.status_code == 200
    mock_paginate.assert_called_once()
    assert mock_paginate.call_args.kwargs["tenant_id"] == "t-123"


@pytest.mark.asyncio
async def test_list_batch_skus_capabilities_parsed(
    client: AsyncClient, raw_skus: list[dict]
) -> None:
    """Capabilities dict is flattened from name/value pairs."""
    with patch(
        "az_scout_batch_sku.routes.arm_paginate",
        return_value=raw_skus,
    ):
        resp = await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )

    skus = resp.json()["skus"]
    d2s = next(s for s in skus if s["name"] == "Standard_D2s_v3")
    assert d2s["capabilities"]["vCPUs"] == "2"
    assert d2s["capabilities"]["MemoryGB"] == "8"
    assert d2s["capabilities"]["LowPriorityCapable"] == "True"


@pytest.mark.asyncio
async def test_list_batch_skus_eol_field(client: AsyncClient, raw_skus: list[dict]) -> None:
    """End-of-life date is preserved in the response."""
    with patch(
        "az_scout_batch_sku.routes.arm_paginate",
        return_value=raw_skus,
    ):
        resp = await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )

    skus = resp.json()["skus"]
    nc6 = next(s for s in skus if s["name"] == "Standard_NC6")
    assert nc6["batchSupportEndOfLife"] == "2025-03-31"

    d2s = next(s for s in skus if s["name"] == "Standard_D2s_v3")
    assert d2s["batchSupportEndOfLife"] is None


@pytest.mark.asyncio
async def test_list_batch_skus_empty(client: AsyncClient) -> None:
    """GET /batch-skus with no SKUs returns an empty list."""
    with patch(
        "az_scout_batch_sku.routes.arm_paginate",
        return_value=[],
    ):
        resp = await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["totalSkus"] == 0
    assert data["skus"] == []


@pytest.mark.asyncio
async def test_list_batch_skus_error(client: AsyncClient) -> None:
    """API errors raise PluginUpstreamError."""
    with (
        patch(
            "az_scout_batch_sku.routes.arm_paginate",
            side_effect=RuntimeError("Azure API down"),
        ),
        pytest.raises(PluginUpstreamError, match="Failed to fetch Batch SKUs"),
    ):
        await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )


@pytest.mark.asyncio
async def test_list_batch_skus_obo_error_not_wrapped(client: AsyncClient) -> None:
    """OboTokenError is re-raised as-is and not wrapped in PluginUpstreamError."""
    from az_scout.azure_api import OboTokenError

    with (
        patch(
            "az_scout_batch_sku.routes.arm_paginate",
            side_effect=OboTokenError("OBO exchange failed"),
        ),
        pytest.raises(OboTokenError),
    ):
        await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )


@pytest.mark.asyncio
async def test_list_batch_skus_missing_params(client: AsyncClient) -> None:
    """Missing required params return 422."""
    resp = await client.get("/batch-skus")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_batch_skus_with_enrichment(client: AsyncClient, raw_skus: list[dict]) -> None:
    """GET /batch-skus with enrichment flags invokes enrich_skus pipeline."""
    compute_skus = [
        {"name": "Standard_D2s_v3", "zones": ["1", "2", "3"], "restrictions": []},
    ]
    with (
        patch("az_scout_batch_sku.routes.arm_paginate", return_value=raw_skus),
        patch("az_scout_batch_sku.routes.get_skus", return_value=compute_skus),
        patch("az_scout_batch_sku.routes.enrich_skus", new_callable=AsyncMock) as mock_enrich,
    ):
        resp = await client.get(
            "/batch-skus",
            params={
                "subscription_id": "sub-1",
                "region": "westeurope",
                "include_prices": "true",
                "include_quotas": "true",
                "include_confidence": "true",
                "currency_code": "EUR",
            },
        )

    assert resp.status_code == 200
    mock_enrich.assert_awaited_once()
    call_kwargs = mock_enrich.call_args
    assert call_kwargs.kwargs["prices"] is True
    assert call_kwargs.kwargs["quotas"] is True
    assert call_kwargs.kwargs["confidence"] is True
    assert call_kwargs.kwargs["currency_code"] == "EUR"


@pytest.mark.asyncio
async def test_list_batch_skus_no_enrichment_by_default(
    client: AsyncClient, raw_skus: list[dict]
) -> None:
    """Without enrichment flags, enrich_skus is not called."""
    with (
        patch("az_scout_batch_sku.routes.arm_paginate", return_value=raw_skus),
        patch("az_scout_batch_sku.routes.enrich_skus", new_callable=AsyncMock) as mock_enrich,
    ):
        resp = await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )

    assert resp.status_code == 200
    mock_enrich.assert_not_awaited()


@pytest.mark.asyncio
async def test_list_batch_skus_normalized_shape(client: AsyncClient, raw_skus: list[dict]) -> None:
    """Normalized SKUs include zones and restrictions keys."""
    with patch("az_scout_batch_sku.routes.arm_paginate", return_value=raw_skus):
        resp = await client.get(
            "/batch-skus",
            params={"subscription_id": "sub-1", "region": "westeurope"},
        )

    skus = resp.json()["skus"]
    for sku in skus:
        assert "zones" in sku
        assert "restrictions" in sku
        assert sku["zones"] == []
        assert sku["restrictions"] == []


@pytest.mark.asyncio
async def test_list_batch_skus_zones_from_compute_rp(
    client: AsyncClient, raw_skus: list[dict]
) -> None:
    """Zone and restriction data is merged from Compute RP when enrichment is enabled."""
    compute_skus = [
        {"name": "Standard_D2s_v3", "zones": ["1", "2", "3"], "restrictions": ["2"]},
        {"name": "Standard_NC6", "zones": ["1"], "restrictions": []},
    ]
    with (
        patch("az_scout_batch_sku.routes.arm_paginate", return_value=raw_skus),
        patch("az_scout_batch_sku.routes.get_skus", return_value=compute_skus),
        patch("az_scout_batch_sku.routes.enrich_skus", new_callable=AsyncMock),
    ):
        resp = await client.get(
            "/batch-skus",
            params={
                "subscription_id": "sub-1",
                "region": "westeurope",
                "include_confidence": "true",
            },
        )

    assert resp.status_code == 200
    skus = resp.json()["skus"]

    d2s = next(s for s in skus if s["name"] == "Standard_D2s_v3")
    assert d2s["zones"] == ["1", "2", "3"]
    assert d2s["restrictions"] == ["2"]

    nc6 = next(s for s in skus if s["name"] == "Standard_NC6")
    assert nc6["zones"] == ["1"]
    assert nc6["restrictions"] == []

    # SKUs not in Compute RP get empty zones
    e4s = next(s for s in skus if s["name"] == "Standard_E4s_v5")
    assert e4s["zones"] == []
