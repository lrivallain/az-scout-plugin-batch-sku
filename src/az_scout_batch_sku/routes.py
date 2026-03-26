"""Batch SKU API routes for the plugin."""

from az_scout.azure_api import AZURE_MGMT_URL, arm_paginate
from az_scout.plugin_api import PluginUpstreamError
from fastapi import APIRouter, Query

from az_scout_batch_sku._constants import BATCH_API_VERSION
from az_scout_batch_sku._log import logger

router = APIRouter()


@router.get("/batch-skus")
async def list_batch_skus(
    subscription_id: str = Query(..., description="Azure subscription ID."),
    region: str = Query(..., description="Azure region name (e.g. westeurope)."),
    tenant_id: str | None = Query(None, description="Optional tenant ID."),
) -> dict[str, object]:
    """Return Batch-compatible VM SKUs for the given subscription and region.

    Returns a flat list of SKUs sorted by family then name.
    """
    try:
        url = (
            f"{AZURE_MGMT_URL}/subscriptions/{subscription_id}"
            f"/providers/Microsoft.Batch/locations/{region}"
            f"/virtualMachineSkus?api-version={BATCH_API_VERSION}"
        )
        raw_skus = arm_paginate(url, tenant_id=tenant_id, timeout=60)

        skus: list[dict[str, object]] = []
        for sku in raw_skus:
            family = sku.get("familyName", "Other")
            name = sku.get("name", "")
            capabilities = {cap["name"]: cap["value"] for cap in sku.get("capabilities", [])}
            skus.append(
                {
                    "name": name,
                    "family": family,
                    "batchSupportEndOfLife": sku.get("batchSupportEndOfLife"),
                    "capabilities": capabilities,
                }
            )

        skus.sort(key=lambda s: (str(s["family"]), str(s["name"])))

        return {
            "region": region,
            "subscriptionId": subscription_id,
            "totalSkus": len(skus),
            "skus": skus,
        }
    except Exception as exc:
        logger.exception("Failed to fetch Batch SKUs")
        raise PluginUpstreamError(f"Failed to fetch Batch SKUs: {exc}") from exc
