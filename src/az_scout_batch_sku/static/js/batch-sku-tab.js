// Batch SKU plugin tab logic
// Globals from app.js: apiFetch(url), apiPost(url, body), tenantQS(prefix), subscriptions, regions,
//                      escapeHtml(str), formatNum(val, decimals)
// Shared components: window.azScout.components (sku-badges, sku-detail-modal, data-filters)
// Global from CDN: simpleDatatables
(function () {
    const PLUGIN_NAME = "batch-sku";
    const container = document.getElementById("plugin-tab-" + PLUGIN_NAME);
    if (!container) return;

    const _C = window.azScout?.components || {};

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
        const pricesToggle = document.getElementById("batch-sku-prices-toggle");
        const spotToggle  = document.getElementById("batch-sku-spot-toggle");
        const currencySelect = document.getElementById("batch-sku-currency");
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
        let _modalSkuName = null;
        let _lastDetailData = null;

        // --- helpers ---------------------------------------------------
        function getContext() {
            const tenantId = tenantEl?.value || "";
            const region   = regionEl?.value || "";
            return { tenantId, region };
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

            // Subscriptions are tenant-scoped, not region-scoped.
            // In single-tenant mode, tenantId may be empty — that's fine,
            // the core API returns subs for the default tenant.

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
            const summaryEl = document.getElementById("batch-sku-region-summary");
            if (summaryEl) { summaryEl.innerHTML = ""; summaryEl.classList.add("d-none"); }
            resultsDiv.classList.add("d-none");
            csvCol.classList.add("d-none");
            emptyDiv.classList.remove("d-none");
        }

        // --- region summary bar (matches planner layout) --------------
        function _scoreLabel(score) {
            return _C.scoreLabel ? _C.scoreLabel(score) : "Unknown";
        }

        function renderRegionSummary(skus) {
            const el = document.getElementById("batch-sku-region-summary");
            if (!el) return;
            if (!skus || skus.length === 0) { el.classList.add("d-none"); return; }

            // Region Readiness: average confidence score
            const confScores = skus.map(s => s.confidence?.score).filter(s => s != null);
            const readiness = confScores.length > 0
                ? Math.round(confScores.reduce((a, b) => a + b, 0) / confScores.length)
                : null;

            // Zone Consistency: how uniformly SKUs are distributed across zones
            const allZones = [...new Set(skus.flatMap(s => s.zones || []))].sort();
            let consistency = null;
            if (allZones.length > 1) {
                const zoneCounts = allZones.map(lz =>
                    skus.filter(s => (s.zones || []).includes(lz) && !(s.restrictions || []).includes(lz)).length
                );
                const minC = Math.min(...zoneCounts);
                const maxC = Math.max(...zoneCounts);
                consistency = minC === maxC ? 100 : Math.round((minC / maxC) * 100);
            } else if (allZones.length === 1) {
                consistency = 100;
            }

            const zoneBreakdown = allZones.map(lz => {
                const available = skus.filter(s => (s.zones || []).includes(lz) && !(s.restrictions || []).includes(lz)).length;
                const restricted = skus.filter(s => (s.restrictions || []).includes(lz)).length;
                return { zone: lz, available, restricted };
            });

            const regionEl = document.getElementById("region-select");
            let regionName = "Region";
            if (regionEl) {
                const idx = regionEl.selectedIndex;
                if (idx >= 0 && regionEl.options && regionEl.options[idx]) {
                    regionName = regionEl.options[idx].text || regionEl.value || "Region";
                } else {
                    regionName = regionEl.value || "Region";
                }
            }

            const readinessLbl = readiness != null ? _scoreLabel(readiness).toLowerCase().replace(/\s+/g, "-") : null;
            const consistencyLbl = consistency != null ? _scoreLabel(consistency).toLowerCase().replace(/\s+/g, "-") : null;

            const icons = { high: "bi-shield-fill-check", medium: "bi-shield-fill-exclamation", low: "bi-shield-fill-x", "very-low": "bi-shield-fill-x" };
            const cIcons = { high: "bi-symmetry-vertical", medium: "bi-distribute-horizontal", low: "bi-exclude", "very-low": "bi-exclude" };

            let html = '<div class="region-summary-bar">';
            html += `<div class="region-summary-title"><i class="bi bi-geo-alt-fill"></i> ${escapeHtml(regionName)}</div>`;
            html += '<div class="region-summary-scores">';

            if (readiness != null) {
                html += '<div class="region-score-card">';
                html += '<div class="region-score-label">Region Readiness</div>';
                html += `<div class="region-score-value"><span class="confidence-badge confidence-${readinessLbl}" data-bs-toggle="tooltip" data-bs-title="Average deployment confidence across ${skus.length} Batch-compatible SKUs."><i class="bi ${icons[readinessLbl] || "bi-shield"}"></i> ${readiness}</span></div>`;
                html += '</div>';
            }

            if (consistency != null) {
                const detail = zoneBreakdown.map(z => `Zone ${z.zone}: ${z.available} avail${z.restricted ? ", " + z.restricted + " restricted" : ""}`).join(" | ");
                html += '<div class="region-score-card">';
                html += '<div class="region-score-label">Zone Consistency</div>';
                html += `<div class="region-score-value"><span class="confidence-badge confidence-${consistencyLbl}" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-title="${escapeHtml(detail)}"><i class="bi ${cIcons[consistencyLbl] || "bi-symmetry-vertical"}"></i> ${consistency}</span></div>`;
                html += '</div>';
            }

            html += '<div class="region-score-card">';
            html += '<div class="region-score-label">Batch SKUs</div>';
            html += `<div class="region-score-value"><span class="region-stat">${skus.length}</span></div>`;
            html += '</div>';

            html += '<div class="region-score-card">';
            html += '<div class="region-score-label">Zones</div>';
            html += `<div class="region-score-value"><span class="region-stat">${allZones.length}</span></div>`;
            html += '</div>';

            html += '</div></div>';
            el.innerHTML = html;
            el.classList.remove("d-none");

            el.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(t => {
                new bootstrap.Tooltip(t, { delay: { show: 0, hide: 100 }, placement: t.dataset.bsPlacement || "top" });
            });
        }

        // --- render SKU table (matches planner layout) -----------------
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

            const showPrices = pricesToggle.checked;
            const showSpot = spotToggle.checked;
            const currency = currencySelect.value || "USD";

            // Determine logical zones from all SKUs
            const allZones = [...new Set(skus.flatMap(s => s.zones || []))].sort();

            // Build headers: SKU Name, Family, vCPUs, Memory, GPUs, Quota×3, [Spot Score], Confidence, [Prices×2], EOL, Zones
            const headers = ["SKU Name", "Family", "vCPUs", "Memory (GB)", "GPUs",
                "Quota Limit", "Quota Used", "Quota Remaining"];
            if (showSpot) headers.push("Spot Score");
            const confCol = headers.length;
            headers.push("Confidence");
            if (showPrices) {
                headers.push(`PayGo ${currency}/h`);
                headers.push(`Spot ${currency}/h`);
            }
            headers.push("End of Life");
            allZones.forEach(lz => headers.push(`Zone ${lz}`));

            let html = '<table id="batch-sku-datatable" class="table table-sm table-hover sku-table">';
            html += "<thead><tr>";
            headers.forEach(h => { html += `<th>${h}</th>`; });
            html += "</tr></thead><tbody>";

            skus.forEach(sku => {
                const caps = sku.capabilities || {};
                const vcpus = caps.vCPUs || caps.vCPUsAvailable || "\u2014";
                const memory = caps.MemoryGB || "\u2014";
                const gpus = caps.GPUs || "0";
                const quota = sku.quota || {};
                const pricing = sku.pricing || {};
                const conf = sku.confidence || null;
                const eol = sku.batchSupportEndOfLife || "";
                const zones = sku.zones || [];
                const restrictions = sku.restrictions || [];

                // Confidence badge with data-sort for numeric sorting
                const confScore = conf?.score != null ? conf.score : "";
                const confHtml = _C.renderConfidenceBadge ? _C.renderConfidenceBadge(conf) : (confScore !== "" ? String(confScore) : "\u2014");

                html += "<tr>";

                // SKU Name — clickable button (not whole row)
                html += `<td><button type="button" class="sku-name-btn" data-sku="${escapeHtml(sku.name)}">${escapeHtml(sku.name)}</button></td>`;
                html += `<td>${escapeHtml(sku.family || "\u2014")}</td>`;
                html += `<td>${escapeHtml(String(vcpus))}</td>`;
                html += `<td>${escapeHtml(String(memory))}</td>`;
                html += `<td>${escapeHtml(String(gpus))}</td>`;

                // Quota columns
                html += `<td>${quota.limit != null ? formatNum(quota.limit, 0) : "\u2014"}</td>`;
                html += `<td>${quota.used != null ? formatNum(quota.used, 0) : "\u2014"}</td>`;
                html += `<td>${quota.remaining != null ? formatNum(quota.remaining, 0) : "\u2014"}</td>`;

                // Spot Score (conditional)
                if (showSpot) {
                    const spotSupported = String(caps.LowPriorityCapable || "").toLowerCase() === "true";
                    if (!spotSupported) {
                        html += '<td class="text-center"><span class="text-body-tertiary">\u2014</span></td>';
                    } else if (sku.spot_zones && Object.keys(sku.spot_zones).length) {
                        html += `<td>${_C.renderSpotBadges ? _C.renderSpotBadges(sku.spot_zones) : "\u2014"}</td>`;
                    } else {
                        html += '<td class="text-center"><span class="text-body-secondary small">N/A</span></td>';
                    }
                }

                // Confidence
                html += `<td data-sort="${confScore}">${confHtml}</td>`;

                // Prices (conditional)
                if (showPrices) {
                    html += `<td class="price-cell">${pricing.paygo != null ? formatNum(pricing.paygo, 4) : "\u2014"}</td>`;
                    html += `<td class="price-cell">${pricing.spot != null ? formatNum(pricing.spot, 4) : "\u2014"}</td>`;
                }

                // End of Life (batch-specific)
                html += `<td>${eol ? '<span class="batch-sku-eol">' + escapeHtml(eol) + '</span>' : '\u2014'}</td>`;

                // Zone columns
                allZones.forEach(lz => {
                    const restricted = restrictions.includes(lz);
                    const available = zones.includes(lz);
                    if (restricted) {
                        html += '<td class="text-center"><span class="zone-restricted" data-bs-toggle="tooltip" data-bs-title="Restricted"><i class="bi bi-exclamation-triangle-fill"></i></span></td>';
                    } else if (available) {
                        html += '<td class="text-center"><span class="zone-available" data-bs-toggle="tooltip" data-bs-title="Available"><i class="bi bi-check-circle-fill"></i></span></td>';
                    } else {
                        html += '<td class="text-center"><span class="zone-unavailable" data-bs-toggle="tooltip" data-bs-title="Not available"><i class="bi bi-dash-circle"></i></span></td>';
                    }
                });

                html += "</tr>";
            });

            html += "</tbody></table>";
            tableContainer.innerHTML = html;

            const tableEl = document.getElementById("batch-sku-datatable");

            // Column sort config
            const colConfig = [
                { select: 0, sort: "asc" },  // SKU Name
                { select: 1 },               // Family
                { select: 2, type: "number" }, // vCPUs
                { select: 3, type: "number" }, // Memory
                { select: 4, type: "number" }, // GPUs
                { select: 5, type: "number" }, // Quota Limit
                { select: 6, type: "number" }, // Quota Used
                { select: 7, type: "number" }, // Quota Remaining
            ];
            let ci = 8;
            if (showSpot) colConfig.push({ select: ci++ });              // Spot Score
            colConfig.push({ select: ci++, type: "number" });            // Confidence
            if (showPrices) {
                colConfig.push({ select: ci++, type: "number" });        // PayGo
                colConfig.push({ select: ci++, type: "number" });        // Spot $
            }
            colConfig.push({ select: ci++ });                            // End of Life
            // Zone columns — no special config

            _dataTable = new simpleDatatables.DataTable(tableEl, {
                searchable: false,
                paging: false,
                labels: { noRows: "No SKUs match", info: "{rows} SKUs" },
                columns: colConfig,
            });

            // Column filters — only on non-zone columns
            const filterableCount = ci; // up to EOL
            const filterableCols = Array.from({ length: filterableCount }, (_, i) => i);
            const numericCols = new Set([2, 3, 4, 5, 6, 7]);
            let nci = 8;
            if (showSpot) nci++; // skip spot score (text)
            numericCols.add(nci++); // Confidence
            if (showPrices) { numericCols.add(nci++); numericCols.add(nci++); }

            if (_C.buildColumnFilters) {
                _C.buildColumnFilters(tableEl, filterableCols, numericCols);
            }
            _restoreFilters(tableEl);

            // SKU name click → detail modal (event delegation)
            tableEl.addEventListener("click", (e) => {
                const btn = e.target.closest(".sku-name-btn");
                if (btn) openSkuDetail(btn.dataset.sku);
            });

            // Init Bootstrap tooltips on zone cells
            tableEl.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                new bootstrap.Tooltip(el);
            });
        }

        // --- SKU Detail Modal -----------------------------------------

        // Local confidence renderer with instance count + recalculate buttons
        function _renderConfidenceWithControls(conf) {
            // Use shared renderer for the breakdown table
            let html = _C.renderConfidenceBreakdown ? _C.renderConfidenceBreakdown(conf) : "";

            // Append scoring controls (instance count + recalculate buttons)
            const controlsHtml = '<div class="confidence-controls mt-2 pt-2 border-top">'
                + '<div class="d-flex align-items-center gap-2 flex-wrap">'
                + '<label class="text-body-secondary small mb-0" for="batch-sku-instance-count">Instances:</label>'
                + '<input type="number" id="batch-sku-instance-count" class="form-control form-control-sm" value="1" min="1" max="1000" style="width:70px;" title="Number of instances to deploy (affects quota pressure)">'
                + '<button class="btn btn-sm btn-outline-success" id="batch-sku-recalc-btn"><i class="bi bi-arrow-counterclockwise me-1"></i>Recalculate</button>'
                + '<button class="btn btn-sm btn-outline-primary" id="batch-sku-recalc-spot-btn"><i class="bi bi-lightning-charge me-1"></i>Recalculate with Spot</button>'
                + '</div></div>';

            // Insert controls before the closing </div> of confidence-section
            if (html.endsWith("</div>")) {
                html = html.slice(0, -6) + controlsHtml + "</div>";
            } else {
                html += controlsHtml;
            }
            return html;
        }

        function _renderModalContent(data, conf, openAccordionIds) {
            const bodyEl = document.getElementById("batch-sku-detail-body");
            const tableSku = (lastSkuData || []).find(s => s.name === _modalSkuName);
            const effectiveConf = conf || tableSku?.confidence || data?.confidence;

            let html = "";

            // Confidence breakdown with controls
            if (effectiveConf) {
                html += _renderConfidenceWithControls(effectiveConf);
            }

            // VM Profile accordion
            if (data?.profile) {
                html += _C.renderVmProfile ? _C.renderVmProfile(data.profile) : "";

                // Zone availability
                html += _C.renderZoneAvailability ? _C.renderZoneAvailability(data.profile, effectiveConf) : "";

                // Quota panel — prefer table data
                const quota = tableSku?.quota || data.profile.quota;
                const vcpus = parseInt(data.profile.capabilities?.vCPUs || "0", 10);
                if (quota && _C.renderQuotaPanel) {
                    html += _C.renderQuotaPanel(quota, vcpus, effectiveConf);
                }
            }

            // Pricing accordion
            if (data?.paygo != null || data?.spot != null) {
                const pricingData = {
                    paygo: data.paygo,
                    spot: data.spot,
                    ri_1y: data.ri_1y,
                    ri_3y: data.ri_3y,
                    sp_1y: data.sp_1y,
                    sp_3y: data.sp_3y,
                    currency: data.currency || currencySelect.value,
                };
                html += _C.renderPricingPanel ? _C.renderPricingPanel(pricingData) : "";
            }

            bodyEl.innerHTML = html || '<p class="text-body-secondary">No detail data available.</p>';

            // Restore open accordion panels
            if (openAccordionIds?.length) {
                openAccordionIds.forEach(id => {
                    const panel = bodyEl.querySelector(`#${id}`);
                    if (panel) panel.classList.add("show");
                    const btn = bodyEl.querySelector(`[data-bs-target="#${id}"]`);
                    if (btn) { btn.classList.remove("collapsed"); btn.setAttribute("aria-expanded", "true"); }
                });
            }

            // Initialize Bootstrap tooltips
            bodyEl.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                new bootstrap.Tooltip(el);
            });

            // Currency change in modal → reload
            const modalCurrencySelect = bodyEl.querySelector("#pricing-modal-currency-select");
            if (modalCurrencySelect) {
                modalCurrencySelect.addEventListener("change", () => {
                    currencySelect.value = modalCurrencySelect.value;
                    openSkuDetail(_modalSkuName);
                });
            }

            // Recalculate buttons
            const recalcBtn = bodyEl.querySelector("#batch-sku-recalc-btn");
            const recalcSpotBtn = bodyEl.querySelector("#batch-sku-recalc-spot-btn");
            if (recalcBtn) recalcBtn.addEventListener("click", () => recalculateConfidence(false));
            if (recalcSpotBtn) recalcSpotBtn.addEventListener("click", () => recalculateConfidence(true));
        }

        async function openSkuDetail(skuName) {
            const modalEl = document.getElementById("batch-sku-detail-modal");
            const titleEl = document.getElementById("batch-sku-detail-title");
            const bodyEl = document.getElementById("batch-sku-detail-body");

            _modalSkuName = skuName;
            titleEl.textContent = "Azure Batch \u2014 SKU Detail \u2014 " + skuName;
            bodyEl.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-body-secondary">Loading SKU details…</p></div>';

            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();

            const ctx = getContext();
            const qs = new URLSearchParams({
                region: ctx.region,
                sku: skuName,
                currencyCode: currencySelect.value,
            });
            if (selectedSubscriptionId) qs.set("subscriptionId", selectedSubscriptionId);
            if (ctx.tenantId) qs.set("tenantId", ctx.tenantId);

            try {
                const data = await apiFetch(`/api/sku-detail?${qs}`);
                _lastDetailData = data;
                _renderModalContent(data, null, null);
            } catch (e) {
                bodyEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
            }
        }

        // --- Recalculate confidence (with or without Spot) ------------
        async function recalculateConfidence(preferSpot) {
            const skuName = _modalSkuName;
            if (!skuName) return;
            const ctx = getContext();
            if (!selectedSubscriptionId || !ctx.region) return;

            const btnId = preferSpot ? "#batch-sku-recalc-spot-btn" : "#batch-sku-recalc-btn";
            const bodyEl = document.getElementById("batch-sku-detail-body");
            const btn = bodyEl.querySelector(btnId);
            const origHtml = btn?.innerHTML;
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Calculating\u2026';
            }

            const instanceCount = parseInt(bodyEl.querySelector("#batch-sku-instance-count")?.value, 10) || 1;

            try {
                const payload = {
                    subscriptionId: selectedSubscriptionId,
                    region: ctx.region,
                    currencyCode: currencySelect.value,
                    preferSpot: preferSpot,
                    instanceCount: instanceCount,
                    skus: [skuName],
                    includeSignals: false,
                    includeProvenance: true,
                };
                if (ctx.tenantId) payload.tenantId = ctx.tenantId;

                const result = await apiPost("/api/deployment-confidence", payload);

                if (result.results) {
                    for (const r of result.results) {
                        const sku = (lastSkuData || []).find(s => s.name === r.sku);
                        if (sku && r.deploymentConfidence) {
                            sku.confidence = r.deploymentConfidence;
                        }
                    }
                }

                // Refresh the table with the new scores
                if (lastSkuData) {
                    renderRegionSummary(lastSkuData);
                    renderSkuTable(lastSkuData);
                }

                // Re-render modal in place, preserving open accordions
                if (_lastDetailData) {
                    const openIds = [...bodyEl.querySelectorAll('.accordion-collapse.show')]
                        .map(el => el.id).filter(Boolean);
                    _renderModalContent(_lastDetailData, null, openIds);
                }
            } catch (err) {
                errorDiv.textContent = "Failed to recalculate: " + err.message;
                errorDiv.classList.remove("d-none");
                if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
            }
        }

        // --- filter persistence (header name-based) -------------------
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
            if (restored && _C.applyColumnFilters) _C.applyColumnFilters(tableEl, filterRow);
        }

        // --- CSV export -----------------------------------------------
        function exportCSV() {
            if (!lastSkuData || lastSkuData.length === 0) return;
            const showPrices = pricesToggle.checked;
            const headers = ["SKU Name", "Family", "vCPUs", "Memory (GB)", "GPUs",
                "Quota Limit", "Quota Used", "Quota Remaining",
                "Spot Supported"];
            if (showPrices) headers.push("PayGo $/hr", "Spot $/hr");
            headers.push("Confidence", "Confidence Label", "End of Life");
            const rows = lastSkuData.map(sku => {
                const caps = sku.capabilities || {};
                const pricing = sku.pricing || {};
                const conf = sku.confidence || {};
                const quota = sku.quota || {};
                const row = [
                    sku.name,
                    sku.family || "",
                    caps.vCPUs || caps.vCPUsAvailable || "",
                    caps.MemoryGB || "",
                    caps.GPUs || "0",
                    quota.limit != null ? quota.limit : "",
                    quota.used != null ? quota.used : "",
                    quota.remaining != null ? quota.remaining : "",
                    String(caps.LowPriorityCapable || "").toLowerCase() === "true" ? "Yes" : "No",
                ];
                if (showPrices) {
                    row.push(pricing.paygo != null ? pricing.paygo : "");
                    row.push(pricing.spot != null ? pricing.spot : "");
                }
                row.push(conf.score != null ? conf.score : "");
                row.push(conf.label || "");
                row.push(sku.batchSupportEndOfLife || "");
                return row;
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
                    include_prices: pricesToggle.checked,
                    include_quotas: "true",
                    include_confidence: "true",
                    currency_code: currencySelect.value,
                });
                if (ctx.tenantId) qs.set("tenant_id", ctx.tenantId);

                const data = await apiFetch(`/plugins/${PLUGIN_NAME}/batch-skus?${qs}`);
                lastSkuData = data.skus;
                resultsDiv.classList.remove("d-none");
                csvCol.classList.remove("d-none");
                renderRegionSummary(lastSkuData);
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

        // Toggle handlers — re-render the table when toggled
        pricesToggle.addEventListener("change", () => {
            if (lastSkuData) { renderRegionSummary(lastSkuData); renderSkuTable(lastSkuData); }
        });
        spotToggle.addEventListener("change", () => {
            if (lastSkuData) { renderRegionSummary(lastSkuData); renderSkuTable(lastSkuData); }
        });

        // --- initial state --------------------------------------------
        _lastTenantId = getContext().tenantId;
        _lastRegion = getContext().region;
        // Load subscriptions immediately — they don't depend on region
        refreshSubscriptions({ allowApiFallback: false });
    }
})();
