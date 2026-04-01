"""Batch SKU API routes for the plugin."""

import asyncio
from typing import Any

from az_scout.azure_api import AZURE_MGMT_URL, arm_paginate, enrich_skus, get_skus
from az_scout.azure_api._obo import OboTokenError
from az_scout.plugin_api import PluginUpstreamError
from fastapi import APIRouter, Query

from az_scout_batch_sku._constants import BATCH_API_VERSION
from az_scout_batch_sku._log import logger

router = APIRouter()


def _normalize_batch_skus(
    raw_skus: list[dict[str, Any]],
    compute_lookup: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Normalize Batch RP SKU dicts to the canonical shape expected by enrichment.

    Zone and restriction data is merged from the Compute RP lookup (by SKU name)
    because the Batch RP does not provide this information.
    """
    skus: list[dict[str, Any]] = []
    for sku in raw_skus:
        name = sku.get("name", "")
        capabilities = {cap["name"]: cap["value"] for cap in sku.get("capabilities", [])}
        compute_sku = compute_lookup.get(name, {})
        skus.append(
            {
                "name": name,
                "family": sku.get("familyName", "Other"),
                "batchSupportEndOfLife": sku.get("batchSupportEndOfLife"),
                "capabilities": capabilities,
                "zones": compute_sku.get("zones", []),
                "restrictions": compute_sku.get("restrictions", []),
            }
        )
    return skus


@router.get("/batch-skus")
async def list_batch_skus(
    subscription_id: str = Query(..., description="Azure subscription ID."),
    region: str = Query(..., description="Azure region name (e.g. westeurope)."),
    tenant_id: str | None = Query(None, description="Optional tenant ID."),
    include_prices: bool = Query(False, description="Enrich SKUs with pricing data."),
    include_quotas: bool = Query(False, description="Enrich SKUs with quota data."),
    include_confidence: bool = Query(
        False, description="Enrich SKUs with deployment confidence scores."
    ),
    currency_code: str = Query("USD", description="ISO 4217 currency code for pricing."),
) -> dict[str, object]:
    """Return Batch-compatible VM SKUs for the given subscription and region.

    Returns a flat list of SKUs sorted by family then name.
    Optionally enriched with pricing, quota, and confidence data.
    """
    try:
        url = (
            f"{AZURE_MGMT_URL}/subscriptions/{subscription_id}"
            f"/providers/Microsoft.Batch/locations/{region}"
            f"/virtualMachineSkus?api-version={BATCH_API_VERSION}"
        )
        raw_skus = await asyncio.to_thread(arm_paginate, url, tenant_id=tenant_id, timeout=60)

        # Fetch Compute RP SKU data for zone/restriction info (Batch RP omits these)
        compute_lookup: dict[str, dict[str, Any]] = {}
        if include_prices or include_quotas or include_confidence:
            try:
                compute_skus = await asyncio.to_thread(get_skus, region, subscription_id, tenant_id)
                compute_lookup = {s["name"]: s for s in compute_skus}
            except Exception:
                logger.warning(
                    "Failed to fetch Compute RP SKU data; zones will be empty", exc_info=True
                )

        skus = _normalize_batch_skus(raw_skus, compute_lookup)

        if include_prices or include_quotas or include_confidence:
            await enrich_skus(
                skus,
                region,
                subscription_id,
                quotas=include_quotas,
                prices=include_prices,
                confidence=include_confidence or include_quotas or include_prices,
                currency_code=currency_code,
                tenant_id=tenant_id or "",
            )

        skus.sort(key=lambda s: (str(s["family"]), str(s["name"])))

        return {
            "region": region,
            "subscriptionId": subscription_id,
            "totalSkus": len(skus),
            "skus": skus,
        }
    except OboTokenError:
        # Let az-scout core handle it (returns 401, no traceback needed)
        raise
    except Exception as exc:
        logger.exception("Failed to fetch Batch SKUs")
        raise PluginUpstreamError(f"Failed to fetch Batch SKUs: {exc}") from exc
