"""Shared fixtures for Batch SKU plugin tests."""

import pytest


# Sample raw SKU data as returned by the Azure Batch API
@pytest.fixture()
def raw_skus() -> list[dict]:
    """Fake raw SKU payload mimicking the Azure Batch virtualMachineSkus API."""
    return [
        {
            "name": "Standard_D2s_v3",
            "familyName": "standardDSv3Family",
            "capabilities": [
                {"name": "vCPUs", "value": "2"},
                {"name": "MemoryGB", "value": "8"},
                {"name": "GPUs", "value": "0"},
                {"name": "LowPriorityCapable", "value": "True"},
            ],
            "batchSupportEndOfLife": None,
        },
        {
            "name": "Standard_NC6",
            "familyName": "standardNCFamily",
            "capabilities": [
                {"name": "vCPUs", "value": "6"},
                {"name": "MemoryGB", "value": "56"},
                {"name": "GPUs", "value": "1"},
                {"name": "LowPriorityCapable", "value": "True"},
            ],
            "batchSupportEndOfLife": "2025-03-31",
        },
        {
            "name": "Standard_E4s_v5",
            "familyName": "standardESv5Family",
            "capabilities": [
                {"name": "vCPUs", "value": "4"},
                {"name": "MemoryGB", "value": "32"},
                {"name": "GPUs", "value": "0"},
                {"name": "LowPriorityCapable", "value": "False"},
            ],
            "batchSupportEndOfLife": None,
        },
        {
            "name": "Standard_M416ms_v2",
            "familyName": "standardMSv2Family",
            "capabilities": [
                {"name": "vCPUs", "value": "416"},
                {"name": "MemoryGB", "value": "11400"},
                {"name": "GPUs", "value": "0"},
                {"name": "LowPriorityCapable", "value": "True"},
            ],
            "batchSupportEndOfLife": None,
        },
        {
            "name": "Standard_NC24s_v3",
            "familyName": "standardNCSv3Family",
            "capabilities": [
                {"name": "vCPUs", "value": "24"},
                {"name": "MemoryGB", "value": "448"},
                {"name": "GPUs", "value": "4"},
                {"name": "LowPriorityCapable", "value": "True"},
            ],
            "batchSupportEndOfLife": None,
        },
    ]
