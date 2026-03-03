"""MCP tools for the Batch SKU plugin."""

import json

from az_scout.azure_api import _get_headers, _paginate  # type: ignore[attr-defined]

BATCH_API_VERSION = "2024-07-01"
AZURE_MGMT_URL = "https://management.azure.com"


def _cap_int(capabilities: dict[str, str], key: str) -> int:
    """Return a capability value as an integer, or 0 when missing/non-numeric."""
    try:
        return int(float(capabilities.get(key, "0")))
    except (ValueError, TypeError):
        return 0


def list_batch_skus(
    subscription_id: str,
    region: str,
    tenant_id: str = "",
    family_filter: str = "",
    name_filter: str = "",
    min_vcpus: int = 0,
    min_memory_gb: float = 0,
    min_gpus: int = 0,
) -> str:
    """List Azure Batch-compatible VM SKUs for a region.

    Returns VM sizes that can be used in Azure Batch pools.
    Use *name_filter* for a case-insensitive substring match on the SKU name
    (e.g. "E16s_v6" matches "Standard_E16s_v6").
    Use *family_filter* to narrow results to a specific family
    (case-insensitive substring match).
    Use *min_vcpus*, *min_memory_gb*, and *min_gpus* to keep only SKUs
    whose vCPU count, memory (GB), or GPU count is **>=** the given value.
    These capability filters are especially useful to reduce the result set
    when looking for high-end SKUs (e.g. min_vcpus=200).
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
        if min_vcpus and _cap_int(capabilities, "vCPUs") < min_vcpus:
            continue
        if min_memory_gb and float(capabilities.get("MemoryGB", "0")) < min_memory_gb:
            continue
        if min_gpus and _cap_int(capabilities, "GPUs") < min_gpus:
            continue
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
