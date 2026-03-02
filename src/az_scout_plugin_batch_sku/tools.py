"""MCP tools for the Batch SKU plugin."""

import json

from az_scout.azure_api import _get_headers, _paginate  # type: ignore[attr-defined]

BATCH_API_VERSION = "2024-07-01"
AZURE_MGMT_URL = "https://management.azure.com"


def list_batch_skus(
    subscription_id: str,
    region: str,
    tenant_id: str = "",
    family_filter: str = "",
    name_filter: str = "",
) -> str:
    """List Azure Batch-compatible VM SKUs for a region.

    Returns VM sizes that can be used in Azure Batch pools.
    Use *name_filter* for a case-insensitive substring match on the SKU name
    (e.g. "E16s_v6" matches "Standard_E16s_v6").
    Use *family_filter* to narrow results to a specific family
    (case-insensitive substring match).
    If a SKU appears in the returned list, it IS available for Azure Batch
    in that region. An empty result means the SKU is NOT available.
    """
    url = (
        f"{AZURE_MGMT_URL}/subscriptions/{subscription_id}"
        f"/providers/Microsoft.Batch/locations/{region}"
        f"/virtualMachineSkus?api-version={BATCH_API_VERSION}"
    )
    headers = _get_headers(tenant_id or None)
    raw_skus = _paginate(url, headers, timeout=60)

    results: list[dict[str, object]] = []
    for sku in raw_skus:
        family = sku.get("familyName", "Other")
        name = sku.get("name", "")
        if family_filter and family_filter.lower() not in family.lower():
            continue
        if name_filter and name_filter.lower() not in name.lower():
            continue
        capabilities = {cap["name"]: cap["value"] for cap in sku.get("capabilities", [])}
        results.append(
            {
                "name": name,
                "family": family,
                "batchSupportEndOfLife": sku.get("batchSupportEndOfLife"),
                "capabilities": capabilities,
            }
        )

    results.sort(key=lambda s: (str(s["family"]), str(s["name"])))
    return json.dumps(results, indent=2)
