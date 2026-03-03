"""MCP tools for the Batch SKU plugin."""

import json

from az_scout.azure_api import _get_headers, _paginate  # type: ignore[attr-defined]

BATCH_API_VERSION = "2024-07-01"
AZURE_MGMT_URL = "https://management.azure.com"


def _cap_float(capabilities: dict[str, str], key: str) -> float:
    """Return a capability value as a float, or 0.0 when missing/non-numeric."""
    try:
        return float(capabilities.get(key, "0"))
    except (ValueError, TypeError):
        return 0.0


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
    max_vcpus: int = 0,
    min_memory_gb: float = 0,
    max_memory_gb: float = 0,
    min_gpus: int = 0,
    max_gpus: int = 0,
    low_priority_capable: bool | None = None,
) -> str:
    """List Azure Batch-compatible VM SKUs for a region.

    Returns VM sizes that can be used in Azure Batch pools.
    Use *name_filter* for a case-insensitive substring match on the SKU name
    (e.g. "E16s_v6" matches "Standard_E16s_v6").
    Use *family_filter* to narrow results to a specific VM family
    (case-insensitive substring match, e.g. "NC" matches both
    "standardNCFamily" and "standardNCSv3Family").
    Use *min_vcpus*/*max_vcpus*, *min_memory_gb*/*max_memory_gb*, and
    *min_gpus*/*max_gpus* to keep only SKUs whose capability value falls
    within the given range (inclusive). A value of 0 means "no limit" for
    that bound.
    Use *low_priority_capable* to filter by low-priority/spot support:
    ``True`` keeps only SKUs that support low-priority nodes,
    ``False`` keeps only SKUs that do NOT, and the default ``None``
    applies no filter.
    Examples: ``min_vcpus=200`` → SKUs with ≥200 vCPUs;
    ``max_vcpus=8`` → small SKUs with ≤8 vCPUs;
    ``min_vcpus=4, max_vcpus=16`` → SKUs with 4–16 vCPUs;
    ``low_priority_capable=True`` → only spot-eligible SKUs.
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
        vcpus = _cap_int(capabilities, "vCPUs")
        if min_vcpus and vcpus < min_vcpus:
            continue
        if max_vcpus and vcpus > max_vcpus:
            continue
        mem = _cap_float(capabilities, "MemoryGB")
        if min_memory_gb and mem < min_memory_gb:
            continue
        if max_memory_gb and mem > max_memory_gb:
            continue
        gpus = _cap_int(capabilities, "GPUs")
        if min_gpus and gpus < min_gpus:
            continue
        if max_gpus and gpus > max_gpus:
            continue
        if low_priority_capable is not None:
            lpc = capabilities.get("LowPriorityCapable", "").lower() == "true"
            if lpc != low_priority_capable:
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
