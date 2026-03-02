"""Batch SKU API routes for the plugin."""

from az_scout.azure_api import _get_headers, _paginate  # type: ignore[attr-defined]
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from az_scout_plugin_batch_sku._log import logger

router = APIRouter()

BATCH_API_VERSION = "2024-07-01"
AZURE_MGMT_URL = "https://management.azure.com"


@router.get("/batch-skus")
async def list_batch_skus(
    subscription_id: str = Query(..., description="Azure subscription ID."),
    region: str = Query(..., description="Azure region name (e.g. westeurope)."),
    tenant_id: str | None = Query(None, description="Optional tenant ID."),
) -> JSONResponse:
    """Return Batch-compatible VM SKUs for the given subscription and region.

    Returns a flat list of SKUs sorted by family then name.
    """
    try:
        url = (
            f"{AZURE_MGMT_URL}/subscriptions/{subscription_id}"
            f"/providers/Microsoft.Batch/locations/{region}"
            f"/virtualMachineSkus?api-version={BATCH_API_VERSION}"
        )
        headers = _get_headers(tenant_id)
        raw_skus = _paginate(url, headers, timeout=60)

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

        return JSONResponse(
            {
                "region": region,
                "subscriptionId": subscription_id,
                "totalSkus": len(skus),
                "skus": skus,
            }
        )
    except Exception as exc:
        logger.exception("Failed to fetch Batch SKUs")
        return JSONResponse({"error": str(exc)}, status_code=500)
