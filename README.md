# az-scout-plugin-batch-sku

[az-scout](https://az-scout.com) plugin for Azure Batch-compatible VM SKUs per region, grouped by VM family.

<img width="1178" height="941" alt="image" src="https://github.com/user-attachments/assets/19414de0-add9-48a0-ae55-4f7b0c893a32" />

## Features

- **UI tab** with subscription selector that reacts to the main app's tenant & region
- **API route** that queries the Azure Batch RP for supported VM sizes
- **MCP tool** to list Batch SKUs from the AI chat assistant
- **Family grouping** — SKUs are grouped by VM family in collapsible sections
- **Live filter** — search by SKU name or family after loading
- **Capabilities display** — shows vCPUs, memory, GPU count and end-of-life date

## Setup

```bash
uv pip install az-scout-plugin-batch-sku
az-scout  # plugin is auto-discovered
```

For development:

```bash
git clone https://github.com/az-scout/az-scout-plugin-batch-sku
cd az-scout-plugin-batch-sku
uv sync --group dev
uv pip install -e .
az-scout  # plugin is auto-discovered
```

## Structure

```text
az-scout-plugin-batch-sku/
├── pyproject.toml
├── README.md
└── src/
    └── az_scout_plugin_batch_sku/
        ├── __init__.py          # Plugin class + module-level `plugin` instance
        ├── routes.py            # FastAPI APIRouter — GET /plugins/batch_sku/batch-skus
        ├── tools.py             # MCP tool: list_batch_skus
        └── static/
            ├── css/
            │   └── batch-sku.css
            ├── html/
            │   └── batch-sku-tab.html
            └── js/
                └── batch-sku-tab.js
```

## How it works

1. The plugin tab loads the HTML fragment into `#plugin-tab-batch_sku`.
2. It watches `#tenant-select` and `#region-select` for changes.
3. When both are set, it fetches subscriptions from `/api/subscriptions`.
4. The user picks a subscription and clicks **Load SKUs**.
5. The plugin calls `GET /plugins/batch_sku/batch-skus?subscription_id=…&region=…&tenant_id=…`.
6. Results are displayed in table with filtering capabilities.

## Quality checks

```bash
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/
uv run pytest
```

## Copilot support

The `.github/copilot-instructions.md` file provides context to GitHub Copilot about
the plugin structure, conventions, and az-scout plugin API.

## License

[MIT](LICENSE.txt)

## Disclaimer

> **This tool is not affiliated with Microsoft.** All capacity, pricing, and availability information is indicative and not a guarantee of deployment success. Values are dynamic and may change between planning and actual deployment. Always validate in official Microsoft sources and in your target tenant/subscription.
