# az-scout-plugin-batch-sku

An [az-scout](https://github.com/az-scout/az-scout) plugin that lists Azure Batch-compatible VM SKUs per region, grouped by VM family.

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
# Install the plugin (editable mode for development)
uv pip install -e .

# Start az-scout — the plugin is auto-discovered
az-scout
```

## Structure

```text
az-scout-plugin-batch-sku/
├── pyproject.toml
├── README.md
└── src/
    └── az_scout_batch_sku/
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

The scaffold includes GitHub Actions workflows in `.github/workflows/`:

- **`ci.yml`** — Runs lint (ruff + mypy) and tests (pytest) on Python 3.11–3.13, triggered on push/PR to `main`.
- **`publish.yml`** — Builds, creates a GitHub Release, and publishes to PyPI via trusted publishing (OIDC). Triggered on version tags (`v*`). Requires a `pypi` environment configured in your repo settings with OIDC trusted publishing.

Run the same checks locally:

```bash
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/
uv run pytest
```

To publish a release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## Copilot support

The `.github/copilot-instructions.md` file provides context to GitHub Copilot about
the plugin structure, conventions, and az-scout plugin API. It helps Copilot generate
code that follows the project patterns.

## License

[MIT](LICENSE.txt)

## Disclaimer

> **This tool is not affiliated with Microsoft.** All capacity, pricing, and latency information are indicative and not a guarantee of deployment success. Spot placement scores are probabilistic. Quota values and pricing are dynamic and may change between planning and actual deployment. Latency values are based on [Microsoft published statistics](https://learn.microsoft.com/en-us/azure/networking/azure-network-latency) and must be validated with in-tenant measurements.
