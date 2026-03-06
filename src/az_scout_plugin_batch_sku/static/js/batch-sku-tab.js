// Batch SKU plugin tab logic
// Globals from app.js: apiFetch(url), tenantQS(prefix), subscriptions, regions
// Global from CDN: simpleDatatables
(function () {
    const PLUGIN_NAME = "batch_sku";
    const container = document.getElementById("plugin-tab-" + PLUGIN_NAME);
    if (!container) return;

    // -------------------------------------------------------------------
    // 1. Load HTML fragment
    // -------------------------------------------------------------------
    fetch(`/plugins/${PLUGIN_NAME}/static/html/batch-sku-tab.html`)
        .then(resp => resp.text())
        .then(html => {
            container.innerHTML = html;
            initBatchSkuPlugin();
        })
        .catch(err => {
            container.innerHTML = `<div class="alert alert-danger">Failed to load plugin UI: ${err.message}</div>`;
        });

    // -------------------------------------------------------------------
    // 2. Plugin initialisation
    // -------------------------------------------------------------------
    function initBatchSkuPlugin() {
        const tenantEl    = document.getElementById("tenant-select");
        const regionEl    = document.getElementById("region-select");
        const subSearch   = document.getElementById("batch-sku-sub-search");
        const subHidden   = document.getElementById("batch-sku-sub-select");
        const subDropdown = document.getElementById("batch-sku-sub-dropdown");
        const loadBtn     = document.getElementById("batch-sku-load-btn");
        const csvCol      = document.getElementById("batch-sku-csv-col");
        const csvBtn      = document.getElementById("batch-sku-csv-btn");
        const errorDiv    = document.getElementById("batch-sku-error");
        const emptyDiv    = document.getElementById("batch-sku-empty");
        const loadingDiv  = document.getElementById("batch-sku-loading");
        const resultsDiv  = document.getElementById("batch-sku-results");
        const tableContainer = document.getElementById("batch-sku-table-container");

        let batchSkuSubscriptions = [];
        let selectedSubscriptionId = null;
        let lastSkuData = null;
        let _dataTable = null;
        let _filterState = {};
        let _lastTenantId = "";
        let _lastRegion = "";

        // --- helpers ---------------------------------------------------
        function getContext() {
            const tenantId = tenantEl?.value || "";
            const region   = regionEl?.value || "";
            return { tenantId, region };
        }

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str;
            return div.innerHTML;
        }

        // --- subscription combobox ------------------------------------
        function updateLoadButton() {
            const ctx = getContext();
            loadBtn.disabled = !(selectedSubscriptionId && ctx.region);
        }

        function renderSubDropdown(filter) {
            const lc = (filter || "").toLowerCase();
            const matches = lc
                ? batchSkuSubscriptions.filter(s => s.name.toLowerCase().includes(lc) || s.id.toLowerCase().includes(lc))
                : batchSkuSubscriptions;
            subDropdown.innerHTML = matches.map(s =>
                `<li class="dropdown-item" data-value="${s.id}">${escapeHtml(s.name)} <span class="region-name">(${s.id.slice(0, 8)}\u2026)</span></li>`
            ).join("");
            subDropdown.querySelectorAll("li").forEach(li => {
                li.addEventListener("click", () => selectSub(li.dataset.value));
            });
        }

        function selectSub(id) {
            const s = batchSkuSubscriptions.find(s => s.id === id);
            if (!s) return;
            selectedSubscriptionId = id;
            subHidden.value = id;
            subSearch.value = s.name;
            subDropdown.classList.remove("show");
            resetResults();
            updateLoadButton();
        }

        function initSubCombobox() {
            subSearch.addEventListener("focus", () => {
                subSearch.select();
                renderSubDropdown(subSearch.value.includes("(") ? "" : subSearch.value);
                subDropdown.classList.add("show");
            });
            subSearch.addEventListener("input", () => {
                subHidden.value = "";
                selectedSubscriptionId = null;
                renderSubDropdown(subSearch.value);
                subDropdown.classList.add("show");
                updateLoadButton();
            });
            subSearch.addEventListener("keydown", (e) => {
                const items = subDropdown.querySelectorAll("li");
                const active = subDropdown.querySelector("li.active");
                let idx = [...items].indexOf(active);
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (!subDropdown.classList.contains("show")) subDropdown.classList.add("show");
                    if (active) active.classList.remove("active");
                    idx = (idx + 1) % items.length;
                    items[idx]?.classList.add("active");
                    items[idx]?.scrollIntoView({ block: "nearest" });
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (active) active.classList.remove("active");
                    idx = idx <= 0 ? items.length - 1 : idx - 1;
                    items[idx]?.classList.add("active");
                    items[idx]?.scrollIntoView({ block: "nearest" });
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (active) selectSub(active.dataset.value);
                    else if (items.length === 1) selectSub(items[0].dataset.value);
                } else if (e.key === "Escape") {
                    subDropdown.classList.remove("show");
                    subSearch.blur();
                }
            });
            document.addEventListener("click", (e) => {
                if (!e.target.closest("#batch-sku-sub-combobox")) subDropdown.classList.remove("show");
            });
        }

        function clearSubscriptionSelection() {
            batchSkuSubscriptions = [];
            selectedSubscriptionId = null;
            subHidden.value = "";
            subSearch.value = "";
            subDropdown.innerHTML = "";
        }

        function applySubscriptions(subs) {
            const currentId = selectedSubscriptionId;
            batchSkuSubscriptions = Array.isArray(subs) ? subs : [];

            if (currentId && batchSkuSubscriptions.some(s => s.id === currentId)) {
                const selected = batchSkuSubscriptions.find(s => s.id === currentId);
                if (selected) {
                    subHidden.value = selected.id;
                    subSearch.value = selected.name;
                }
            } else {
                selectedSubscriptionId = null;
                subHidden.value = "";
                subSearch.value = "";
            }

            renderSubDropdown("");
            subSearch.placeholder = "Type to search subscriptions…";
            subSearch.disabled = false;
            updateLoadButton();
        }

        async function refreshSubscriptions({ allowApiFallback = true } = {}) {
            const ctx = getContext();
            resetResults();
            clearSubscriptionSelection();

            if (!ctx.tenantId) {
                subSearch.placeholder = "Select a tenant first";
                subSearch.disabled = true;
                loadBtn.disabled = true;
                return;
            }

            if (!ctx.region) {
                subSearch.placeholder = "Select region first";
                subSearch.disabled = true;
                loadBtn.disabled = true;
                return;
            }

            const coreSubs = typeof subscriptions !== "undefined" ? subscriptions : null;
            if (Array.isArray(coreSubs) && coreSubs.length > 0) {
                applySubscriptions(coreSubs);
                return;
            }

            if (!allowApiFallback) {
                subSearch.placeholder = "Waiting for subscriptions…";
                subSearch.disabled = true;
                loadBtn.disabled = true;
                return;
            }

            subSearch.placeholder = "Loading subscriptions\u2026";
            subSearch.disabled = true;

            try {
                const subs = await apiFetch("/api/subscriptions" + tenantQS("?"));
                batchSkuSubscriptions = subs;
                subSearch.placeholder = "Type to search subscriptions\u2026";
                subSearch.disabled = false;
                renderSubDropdown("");
            } catch (e) {
                subSearch.placeholder = "Error: " + e.message;
                subSearch.disabled = true;
            }
            updateLoadButton();
        }

        // --- results management ---------------------------------------
        function resetResults() {
            _saveFilters();
            if (_dataTable) {
                try { _dataTable.destroy(); } catch {}
                _dataTable = null;
            }
            lastSkuData = null;
            tableContainer.innerHTML = "";
            resultsDiv.classList.add("d-none");
            csvCol.classList.add("d-none");
            emptyDiv.classList.remove("d-none");
        }

        // --- render SKU table (Simple-DataTables) ---------------------
        function renderSkuTable(skus) {
            _saveFilters();
            if (_dataTable) {
                try { _dataTable.destroy(); } catch {}
                _dataTable = null;
            }

            if (!skus || skus.length === 0) {
                tableContainer.innerHTML = '<p class="text-body-secondary text-center py-3">No Batch SKUs found for this region.</p>';
                return;
            }

            const headers = ["SKU Name", "Family", "vCPUs", "Memory (GB)", "GPUs", "Spot", "End of Life"];

            let html = '<table id="batch-sku-datatable" class="table table-sm table-hover sku-table">';
            html += "<thead><tr>";
            headers.forEach(h => { html += `<th>${h}</th>`; });
            html += "</tr></thead><tbody>";

            skus.forEach(sku => {
                const caps = sku.capabilities || {};
                const vcpus = caps.vCPUs || caps.vCPUsAvailable || "\u2014";
                const memory = caps.MemoryGB || "\u2014";
                const gpus = caps.GPUs || "0";
                const spot = String(caps.LowPriorityCapable || "").toLowerCase() === "true";
                const eol = sku.batchSupportEndOfLife || "";

                html += "<tr>";
                html += `<td><code>${escapeHtml(sku.name)}</code></td>`;
                html += `<td>${escapeHtml(sku.family || "\u2014")}</td>`;
                html += `<td>${escapeHtml(String(vcpus))}</td>`;
                html += `<td>${escapeHtml(String(memory))}</td>`;
                html += `<td>${escapeHtml(String(gpus))}</td>`;
                html += `<td class="text-center">${spot ? '<i class="bi bi-check-circle-fill text-success" title="Spot supported"></i>' : '<i class="bi bi-x-circle text-body-tertiary" title="Spot not supported"></i>'}</td>`;
                html += `<td>${eol ? '<span class="batch-sku-eol">' + escapeHtml(eol) + '</span>' : '\u2014'}</td>`;
                html += "</tr>";
            });

            html += "</tbody></table>";
            tableContainer.innerHTML = html;

            const tableEl = document.getElementById("batch-sku-datatable");

            // Column sort types: numeric for vCPUs, Memory, GPUs
            const colConfig = [
                { select: 0, sort: "asc" },                       // SKU Name
                { select: 1 },                                    // Family
                { select: 2, type: "number" },                    // vCPUs
                { select: 3, type: "number" },                    // Memory
                { select: 4, type: "number" },                    // GPUs
                { select: 5 },                                    // Spot
                { select: 6 },                                    // End of Life
            ];

            _dataTable = new simpleDatatables.DataTable(tableEl, {
                searchable: false,
                paging: false,
                labels: { noRows: "No SKUs match", info: "{rows} SKUs" },
                columns: colConfig,
            });

            // Filterable columns (all), numeric columns
            const filterableCols = [0, 1, 2, 3, 4, 5, 6];
            const numericCols = new Set([2, 3, 4]);

            _buildColumnFilters(tableEl, filterableCols, numericCols);
            _restoreFilters(tableEl);
        }

        // --- per-column filters (same pattern as planner) -------------
        function _buildColumnFilters(tableEl, filterableCols, numericCols) {
            const thead = tableEl.querySelector("thead");
            if (!thead) return;
            const headerCells = thead.querySelectorAll("tr:first-child th");
            const filterRow = document.createElement("tr");
            filterRow.className = "datatable-filter-row";

            headerCells.forEach((_, idx) => {
                const td = document.createElement("td");
                if (filterableCols.includes(idx)) {
                    const input = document.createElement("input");
                    input.type = "search";
                    input.className = "datatable-column-filter";
                    const isNumeric = numericCols.has(idx);
                    input.placeholder = isNumeric ? ">5, <32, 4-16\u2026" : "Filter\u2026";
                    if (isNumeric) input.dataset.numeric = "1";
                    input.dataset.col = idx;
                    td.appendChild(input);
                }
                filterRow.appendChild(td);
            });
            thead.appendChild(filterRow);

            let _timeout;
            filterRow.addEventListener("input", () => {
                clearTimeout(_timeout);
                _timeout = setTimeout(() => _applyColumnFilters(tableEl, filterRow), 200);
            });
        }

        function _applyColumnFilters(tableEl, filterRow) {
            const inputs = filterRow.querySelectorAll("input[data-col]");
            const filters = [];
            inputs.forEach(inp => {
                const val = inp.value.trim();
                if (!val) return;
                const col = parseInt(inp.dataset.col, 10);
                const isNumeric = inp.dataset.numeric === "1";
                if (isNumeric) {
                    const nf = _parseNumericFilter(val);
                    if (nf) { filters.push({ col, numeric: nf }); return; }
                }
                filters.push({ col, text: val.toLowerCase() });
            });

            const rows = tableEl.querySelectorAll("tbody tr");
            rows.forEach(row => {
                if (filters.length === 0) { row.style.display = ""; return; }
                const cells = row.querySelectorAll("td");
                const match = filters.every(f => {
                    const cell = cells[f.col];
                    if (!cell) return false;
                    if (f.numeric) return _matchNumericFilter(cell.textContent, f.numeric);
                    return cell.textContent.toLowerCase().includes(f.text);
                });
                row.style.display = match ? "" : "none";
            });
        }

        function _parseNumericFilter(val) {
            const s = val.trim();
            let m;
            m = s.match(/^(\d+(?:\.\d+)?)\s*(?:[-\u2013]|\.\.)\s*(\d+(?:\.\d+)?)$/);
            if (m) return { op: "range", lo: parseFloat(m[1]), hi: parseFloat(m[2]) };
            m = s.match(/^(>=?|<=?|=)\s*(\d+(?:\.\d+)?)$/);
            if (m) return { op: m[1], val: parseFloat(m[2]) };
            if (/^\d+(?:\.\d+)?$/.test(s)) return { op: "=", val: parseFloat(s) };
            return null;
        }

        function _matchNumericFilter(cellVal, filter) {
            const n = parseFloat(cellVal);
            if (isNaN(n)) return false;
            switch (filter.op) {
                case ">": return n > filter.val;
                case ">=": return n >= filter.val;
                case "<": return n < filter.val;
                case "<=": return n <= filter.val;
                case "=": return n === filter.val;
                case "range": return n >= filter.lo && n <= filter.hi;
                default: return false;
            }
        }

        function _saveFilters() {
            const tableEl = document.getElementById("batch-sku-datatable");
            if (!tableEl) return;
            const headers = tableEl.querySelectorAll("thead tr:first-child th");
            const inputs = tableEl.querySelectorAll(".datatable-filter-row input[data-col]");
            const state = {};
            inputs.forEach(inp => {
                const val = inp.value.trim();
                if (!val) return;
                const col = parseInt(inp.dataset.col, 10);
                const hdr = headers[col]?.textContent?.trim();
                if (hdr) state[hdr] = val;
            });
            _filterState = state;
        }

        function _restoreFilters(tableEl) {
            if (!Object.keys(_filterState).length) return;
            const headers = tableEl.querySelectorAll("thead tr:first-child th");
            const headerMap = {};
            headers.forEach((th, idx) => { headerMap[th.textContent.trim()] = idx; });
            const filterRow = tableEl.querySelector(".datatable-filter-row");
            if (!filterRow) return;
            let restored = false;
            for (const [hdr, val] of Object.entries(_filterState)) {
                const col = headerMap[hdr];
                if (col == null) continue;
                const input = filterRow.querySelector(`input[data-col="${col}"]`);
                if (input) { input.value = val; restored = true; }
            }
            if (restored) _applyColumnFilters(tableEl, filterRow);
        }

        // --- CSV export -----------------------------------------------
        function exportCSV() {
            if (!lastSkuData || lastSkuData.length === 0) return;
            const headers = ["SKU Name", "Family", "vCPUs", "Memory (GB)", "GPUs", "Spot", "End of Life"];
            const rows = lastSkuData.map(sku => {
                const caps = sku.capabilities || {};
                return [
                    sku.name,
                    sku.family || "",
                    caps.vCPUs || caps.vCPUsAvailable || "",
                    caps.MemoryGB || "",
                    caps.GPUs || "0",
                    String(caps.LowPriorityCapable || "").toLowerCase() === "true" ? "Yes" : "No",
                    sku.batchSupportEndOfLife || "",
                ];
            });
            const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `batch-skus-${getContext().region || "unknown"}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
        }

        // --- core context event handlers ------------------------------
        function handleTenantChanged(event) {
            const tenantId = event?.detail?.tenantId || "";
            if (tenantId === _lastTenantId) return;
            _lastTenantId = tenantId;
            refreshSubscriptions({ allowApiFallback: false });
        }

        function handleRegionChanged(event) {
            const region = event?.detail?.region || "";
            if (region === _lastRegion) return;
            _lastRegion = region;
            resetResults();
            updateLoadButton();
            refreshSubscriptions({ allowApiFallback: false });
        }

        function handleSubscriptionsLoaded(event) {
            const eventTenantId = event?.detail?.tenantId || "";
            const ctx = getContext();
            if (!ctx.tenantId || eventTenantId !== ctx.tenantId) return;

            const eventSubs = event?.detail?.subscriptions;
            if (Array.isArray(eventSubs)) {
                applySubscriptions(eventSubs);
                return;
            }

            const coreSubs = typeof subscriptions !== "undefined" ? subscriptions : [];
            applySubscriptions(coreSubs);
        }

        function handleRegionsLoaded() {
            const ctx = getContext();
            if (!ctx.tenantId) return;
            refreshSubscriptions({ allowApiFallback: false });
        }

        // --- event listeners ------------------------------------------
        initSubCombobox();

        // Preferred integration path: subscribe to core app events
        document.addEventListener("azscout:tenant-changed", handleTenantChanged);
        document.addEventListener("azscout:region-changed", handleRegionChanged);
        document.addEventListener("azscout:subscriptions-loaded", handleSubscriptionsLoaded);
        document.addEventListener("azscout:regions-loaded", handleRegionsLoaded);

        // Compatibility fallback for older cores (without custom events)
        if (tenantEl) {
            tenantEl.addEventListener("change", () => refreshSubscriptions({ allowApiFallback: false }));
        }

        const regionObserver = new MutationObserver(() => {
            if (regionEl.value !== _lastRegion) {
                _lastRegion = regionEl.value;
                refreshSubscriptions({ allowApiFallback: false });
            }
        });
        if (regionEl) {
            regionObserver.observe(regionEl, { attributes: true, attributeFilter: ["value"] });
            regionEl.addEventListener("change", () => {
                if (regionEl.value !== _lastRegion) {
                    _lastRegion = regionEl.value;
                    refreshSubscriptions({ allowApiFallback: false });
                }
            });
        }

        // Load Batch SKUs
        loadBtn.addEventListener("click", async () => {
            const ctx = getContext();
            const subId = selectedSubscriptionId;
            if (!subId || !ctx.region) return;

            emptyDiv.classList.add("d-none");
            loadingDiv.classList.remove("d-none");
            errorDiv.classList.add("d-none");
            resultsDiv.classList.add("d-none");
            csvCol.classList.add("d-none");
            loadBtn.disabled = true;

            try {
                const qs = new URLSearchParams({
                    subscription_id: subId,
                    region: ctx.region,
                });
                if (ctx.tenantId) qs.set("tenant_id", ctx.tenantId);

                const data = await apiFetch(`/plugins/${PLUGIN_NAME}/batch-skus?${qs}`);
                lastSkuData = data.skus;
                resultsDiv.classList.remove("d-none");
                csvCol.classList.remove("d-none");
                renderSkuTable(lastSkuData);
            } catch (e) {
                errorDiv.textContent = "Error: " + e.message;
                errorDiv.classList.remove("d-none");
                emptyDiv.classList.remove("d-none");
            } finally {
                loadingDiv.classList.add("d-none");
                loadBtn.disabled = false;
            }
        });

        csvBtn.addEventListener("click", () => exportCSV());

        // --- initial state --------------------------------------------
        _lastTenantId = getContext().tenantId;
        _lastRegion = getContext().region;
        if (getContext().tenantId && getContext().region) {
            refreshSubscriptions({ allowApiFallback: false });
        }
    }
})();
