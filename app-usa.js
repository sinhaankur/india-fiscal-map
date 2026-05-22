/* ══════════════════════════════════════════════════════════════════════
   USA FISCAL MAP — sibling of India dashboard. 50 states + DC.
   ══════════════════════════════════════════════════════════════════════ */

(function init() {
  const root = document.getElementById('map');
  if (!root) return;

  const VIEWS = {
    gsp: {
      label: 'Gross State Product ($ billion)',
      shortLabel: 'GSP',
      diverging: false,
      compute: (d) => d.gsp,
      fmt: v => '$' + (v >= 1000 ? (v/1000).toFixed(2) + 'T' : v.toFixed(0) + 'B'),
      help: 'BEA Gross State Product, current-dollar nominal. CA leads at ~$3.85T (2023).'
    },
    perCapitaGsp: {
      label: 'Per-capita GSP ($ thousand / yr)',
      shortLabel: 'GSP / person',
      diverging: false,
      compute: (d) => d.pop ? (d.gsp * 1000 / d.pop) : null,
      fmt: v => v == null ? '—' : '$' + (v/1000).toFixed(0) + 'k',
      help: 'GSP per resident per year. DC + NY top, MS + WV bottom.'
    },
    ownTax: {
      label: 'State own-tax revenue ($ billion)',
      shortLabel: 'Own tax',
      diverging: false,
      compute: (d) => d.ownTax,
      fmt: v => '$' + v.toFixed(1) + 'B',
      help: 'State-government own-source tax revenue (Census Annual Survey).'
    },
    fed_transfers: {
      label: 'Federal grants-in-aid to state govt ($ billion)',
      shortLabel: 'Fed in',
      diverging: false,
      compute: (d) => d.fed_transfers,
      fmt: v => '$' + v.toFixed(1) + 'B',
      help: 'Federal grants to state government (Medicaid, IIJA, education, etc.).'
    },
    fed_taxes_paid: {
      label: 'Federal taxes paid (est. $ billion)',
      shortLabel: 'Fed out',
      diverging: false,
      compute: (d) => d.fed_taxes_paid,
      fmt: v => '$' + v.toFixed(0) + 'B',
      help: 'Estimated federal taxes paid by state residents + businesses (Rockefeller methodology).'
    },
    netFlow: {
      label: 'Net flow ($ billion · fed_in − fed_out)',
      shortLabel: 'Net flow',
      diverging: true,
      compute: (d) => d.fed_transfers - d.fed_taxes_paid,
      fmt: v => (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(0) + 'B',
      help: 'Federal transfers minus federal taxes paid. Positive = net recipient (red states like MS, KY, WV). Negative = net donor (CT, NJ, NY, CA, MA).'
    },
    ownTaxPctGsp: {
      label: 'Own tax / GSP (%)',
      shortLabel: 'Tax / GSP',
      diverging: false,
      compute: (d) => (d.ownTax / d.gsp) * 100,
      fmt: v => v.toFixed(2) + '%',
      help: 'Fiscal effort — % of state economy captured as state-level tax.'
    },
    pop: {
      label: 'Population (millions)',
      shortLabel: 'Population',
      diverging: false,
      compute: (d) => d.pop,
      fmt: v => v.toFixed(2) + ' M',
      help: 'Census Bureau Vintage Population Estimates.'
    }
  };

  const ui = { state: { view: 'gsp', yearIdx: 9, selected: null, hover: null } };
  let DATA = null, GEO = null;
  let map = null, geoLayer = null;
  const pathByName = new Map();

  const $ind = s => root.querySelector(s);
  const $$ind = s => root.querySelectorAll(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function oklch(l, c, h, a = 1) { return `oklch(${l} ${c} ${h} / ${a})`; }
  function seqColor(t) {
    t = Math.max(0, Math.min(1, t));
    return oklch(0.22 + 0.50 * t, 0.02 + 0.20 * t, 50);
  }
  function divColor(t) {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) { const k = 1 - t * 2; return oklch(0.30 + 0.40 * k, 0.02 + 0.16 * k, 210); }
    const k = (t - 0.5) * 2; return oklch(0.30 + 0.45 * k, 0.02 + 0.20 * k, 35);
  }
  function colorFor(v, view, domain) {
    if (v == null || Number.isNaN(v)) return 'oklch(0.22 0 0)';
    if (view.diverging) {
      const max = Math.max(Math.abs(domain.min), Math.abs(domain.max));
      if (max <= 0) return divColor(0.5);
      return divColor(0.5 + (v / max) * 0.5);
    }
    const range = domain.max - domain.min;
    if (range <= 0) return seqColor(0.5);
    return seqColor((v - domain.min) / range);
  }

  function rowFor(stateName, yearIdx) {
    const s = DATA.states[stateName];
    if (!s) return null;
    return {
      stateName, meta: s, yearLabel: DATA._meta.yearLabels[yearIdx],
      gsp: s.gsp[yearIdx], ownTax: s.ownTax[yearIdx], fed_transfers: s.fed_transfers[yearIdx],
      fed_taxes_paid: s.fed_taxes_paid[yearIdx], pop: s.pop[yearIdx]
    };
  }

  function computeDomain(view, yearIdx) {
    const values = [];
    for (const name of Object.keys(DATA.states)) {
      const r = rowFor(name, yearIdx);
      if (!r) continue;
      const v = view.compute(r);
      if (typeof v === 'number' && !Number.isNaN(v)) values.push(v);
    }
    if (!values.length) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  function fillStyle(name) {
    const view = VIEWS[ui.state.view];
    const r = rowFor(name, ui.state.yearIdx);
    if (!r) return { className: 'india-state-path no-data', fillColor: 'oklch(0.22 0 0)', fillOpacity: 0.55, color: 'oklch(0.985 0 0 / 0.18)', weight: 0.5 };
    return { className: 'india-state-path', color: 'oklch(0.985 0 0 / 0.22)', weight: 0.5, fillColor: colorFor(view.compute(r), view, ui._domain), fillOpacity: 0.92 };
  }

  function updateLegend() {
    const view = VIEWS[ui.state.view];
    $ind('#india-legend-title').textContent = view.label;
    const d = ui._domain;
    const grad = $ind('#india-legend-grad');
    if (view.diverging) {
      const max = Math.max(Math.abs(d.min), Math.abs(d.max));
      grad.style.background = `linear-gradient(90deg, ${divColor(0)} 0%, ${divColor(0.5)} 50%, ${divColor(1)} 100%)`;
      $ind('#india-legend-min').textContent = view.fmt(-max);
      $ind('#india-legend-mid').textContent = view.fmt(0);
      $ind('#india-legend-max').textContent = view.fmt(max);
    } else {
      grad.style.background = `linear-gradient(90deg, ${seqColor(0)} 0%, ${seqColor(0.5)} 50%, ${seqColor(1)} 100%)`;
      $ind('#india-legend-min').textContent = view.fmt(d.min);
      $ind('#india-legend-mid').textContent = view.fmt((d.min + d.max) / 2);
      $ind('#india-legend-max').textContent = view.fmt(d.max);
    }
  }

  function updateReadout() {
    const view = VIEWS[ui.state.view];
    const name = ui.state.hover || ui.state.selected;
    const labelEl = $ind('.readout-label'), nameEl = $ind('.readout-name'), valEl = $ind('.readout-value');
    if (!name) {
      labelEl.textContent = 'Hover a state';
      nameEl.textContent = '—';
      valEl.textContent = view.help; valEl.style.color = 'var(--muted-foreground)'; valEl.style.fontSize = '11px';
      return;
    }
    const r = rowFor(name, ui.state.yearIdx);
    if (!r) {
      labelEl.textContent = 'No data'; nameEl.textContent = name; valEl.textContent = '—';
      valEl.style.color = 'var(--muted-foreground)'; valEl.style.fontSize = '12px';
      return;
    }
    labelEl.textContent = `${view.shortLabel} · ${r.yearLabel}`;
    nameEl.textContent = name;
    valEl.textContent = view.fmt(view.compute(r));
    valEl.style.color = 'oklch(0.78 0.16 70)'; valEl.style.fontSize = '14px';
  }

  function repaint() {
    ui._domain = computeDomain(VIEWS[ui.state.view], ui.state.yearIdx);
    if (geoLayer) geoLayer.eachLayer(layer => layer.setStyle(fillStyle(layer.feature.properties.name)));
    updateLegend(); updateReadout();
    if (ui.state.selected) renderDetail(ui.state.selected); else renderEmptyState();
    $ind('#india-year-value').textContent = DATA._meta.yearLabels[ui.state.yearIdx];
  }

  function src(key) {
    const o = DATA._meta.sources?.[key];
    return o ? `<a class="src-link" href="${esc(o.url)}" target="_blank" rel="noopener" title="${esc(o.name)}">↗</a>` : '';
  }

  function renderDetail(name) {
    const detail = $ind('#india-detail');
    const r = rowFor(name, ui.state.yearIdx);
    if (!r) {
      detail.innerHTML = `<div class="india-detail-empty"><div class="eyebrow">${esc(name)}</div><p class="india-detail-empty-body">No data.</p></div>`;
      return;
    }
    const s = r.meta;
    const net = r.fed_transfers - r.fed_taxes_paid;
    const isDonor = net < 0;
    const perCapita = r.pop ? (r.gsp * 1000 / r.pop) : null;
    const taxPctGsp = (r.ownTax / r.gsp) * 100;

    detail.innerHTML = `
      <div class="india-detail-head">
        <div>
          <div class="india-detail-name">${esc(name)}</div>
          <div class="mono" style="font-size:10.5px;letter-spacing:0.04em;color:var(--muted-foreground);text-transform:uppercase;margin-top:2px">${esc(s.region)} · ${esc(s.capital)} · pop ${r.pop.toFixed(1)} M</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
          <button class="india-back-btn" id="usa-back">← Back</button>
          <div class="india-detail-meta">${esc(r.yearLabel)}</div>
        </div>
      </div>

      <div class="india-stat-grid">
        <div class="india-stat"><div class="label">GSP ${src('gsp')}</div><div class="value">$${r.gsp.toFixed(0)}B</div></div>
        <div class="india-stat"><div class="label">GSP / person ${src('perCapitaGsp')}</div><div class="value">${perCapita ? '$' + (perCapita/1000).toFixed(0) + 'k' : '—'}</div></div>
        <div class="india-stat"><div class="label">Own tax ${src('ownTax')}</div><div class="value">$${r.ownTax.toFixed(1)}B</div></div>
        <div class="india-stat"><div class="label">Federal in ${src('fed_transfers')}</div><div class="value">$${r.fed_transfers.toFixed(1)}B</div></div>
        <div class="india-stat"><div class="label">Federal out (est.) ${src('fed_taxes_paid')}</div><div class="value">$${r.fed_taxes_paid.toFixed(0)}B</div></div>
        <div class="india-stat ${isDonor ? 'donor' : 'recipient'}"><div class="label">Net flow ${src('netFlow')}</div><div class="value">${net >= 0 ? '+' : '−'}$${Math.abs(net).toFixed(0)}B</div></div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:0.6rem;font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground);margin-bottom:0.85rem;flex-wrap:wrap">
        <span>Tax / GSP: <span style="color:var(--foreground)">${taxPctGsp.toFixed(2)}%</span></span>
        <span>Pop: <span style="color:var(--foreground)">${r.pop.toFixed(1)} M</span></span>
        <span>In : Out: <span style="color:${isDonor ? 'oklch(0.7 0.18 30)' : 'oklch(0.7 0.17 162)'}">${(r.fed_transfers / r.fed_taxes_paid).toFixed(2)}×</span></span>
      </div>

      <div class="india-detail-section-title">10-year history</div>
      <svg id="india-spark" viewBox="0 0 320 110" preserveAspectRatio="none"></svg>
      <div class="india-spark-legend">
        <span><span class="sw" style="background:oklch(0.7 0.17 162)"></span>Own tax</span>
        <span><span class="sw" style="background:oklch(0.78 0.16 70)"></span>Federal in</span>
        <span><span class="sw" style="background:oklch(0.65 0.18 250)"></span>Federal out (est.)</span>
      </div>

      <div class="india-detail-section-title">Pros &amp; Cons</div>
      <div class="india-proscons">
        <div class="india-pc pros"><h4>Pros</h4><ul>${s.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
        <div class="india-pc cons"><h4>Cons</h4><ul>${s.cons.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      </div>
    `;
    drawSpark(s, ui.state.yearIdx);
    $ind('#usa-back')?.addEventListener('click', deselectState);
  }

  function renderEmptyState() {
    const detail = $ind('#india-detail');
    const view = VIEWS[ui.state.view];
    detail.innerHTML = `
      <div class="india-detail-empty">
        <div class="eyebrow">Active view: ${esc(view.shortLabel)} · ${esc(DATA._meta.yearLabels[ui.state.yearIdx])}</div>
        <p class="india-detail-empty-body">Click any state for its 10-year history, fiscal flows, and structural pros / cons.</p>
        <div id="usa-summary" class="india-summary-inline"></div>
      </div>`;
    renderSummary();
  }

  function deselectState() {
    ui.state.selected = null;
    pathByName.forEach(layer => layer._path?.classList.remove('selected'));
    renderEmptyState();
  }

  function drawSpark(s, yearIdx) {
    const svg = $ind('#india-spark');
    if (!svg) return;
    const W = 320, H = 110, padL = 32, padR = 8, padT = 8, padB = 18;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const years = DATA._meta.yearLabels, n = years.length;
    const series = [
      { vals: s.ownTax, color: 'oklch(0.7 0.17 162)' },
      { vals: s.fed_transfers, color: 'oklch(0.78 0.16 70)' },
      { vals: s.fed_taxes_paid, color: 'oklch(0.65 0.18 250)' }
    ];
    const max = Math.max(...series.flatMap(x => x.vals)) * 1.05;
    const x = i => padL + (i / (n - 1)) * innerW;
    const y = v => padT + innerH - (v / max) * innerH;
    let svgContent = '';
    for (let g = 0; g <= 3; g++) {
      const v = max * (g / 3), yy = y(v);
      svgContent += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="oklch(0.985 0 0 / 0.07)" stroke-width="1"/>`;
      svgContent += `<text x="${padL - 4}" y="${yy + 3}" text-anchor="end" fill="oklch(0.6 0 0)" font-family="ui-monospace, monospace" font-size="8">${Math.round(v)}</text>`;
    }
    [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
      svgContent += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" fill="oklch(0.6 0 0)" font-family="ui-monospace, monospace" font-size="8">${years[i]}</text>`;
    });
    svgContent += `<line x1="${x(yearIdx)}" x2="${x(yearIdx)}" y1="${padT}" y2="${padT + innerH}" stroke="var(--foreground)" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.4"/>`;
    for (const ser of series) {
      const pts = ser.vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      svgContent += `<polyline points="${pts}" fill="none" stroke="${ser.color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
      svgContent += `<circle cx="${x(yearIdx)}" cy="${y(ser.vals[yearIdx])}" r="3" fill="${ser.color}" stroke="oklch(0.145 0 0)" stroke-width="1"/>`;
    }
    svg.innerHTML = svgContent;
  }

  function renderSummary() {
    const container = $ind('#usa-summary');
    if (!container) return;
    const view = VIEWS[ui.state.view];
    const ranked = [];
    for (const name of Object.keys(DATA.states)) {
      const r = rowFor(name, ui.state.yearIdx);
      if (!r) continue;
      const v = view.compute(r);
      if (v == null || Number.isNaN(v)) continue;
      ranked.push({ name, value: v });
    }
    ranked.sort((a, b) => a.value - b.value);
    const isDiv = view.diverging;
    const renderRow = (it, i) => `
      <div class="india-rank-row" data-state="${esc(it.name)}">
        <span class="rnk">${String(i + 1).padStart(2, '0')}</span>
        <span class="name">${esc(it.name)}</span>
        <span class="val">${view.fmt(it.value)}</span>
      </div>`;
    container.innerHTML = `
      <div class="india-summary-card">
        <div class="h">${isDiv ? 'Top net donors' : 'Lowest by ' + view.shortLabel.toLowerCase()}</div>
        <div class="sub">${DATA._meta.yearLabels[ui.state.yearIdx]}</div>
        ${ranked.slice(0, 8).map(renderRow).join('')}
      </div>
      <div class="india-summary-card">
        <div class="h">${isDiv ? 'Top net recipients' : 'Highest by ' + view.shortLabel.toLowerCase()}</div>
        <div class="sub">${DATA._meta.yearLabels[ui.state.yearIdx]}</div>
        ${ranked.slice(-8).reverse().map((it, i) => renderRow(it, i)).join('')}
      </div>`;
    container.querySelectorAll('.india-rank-row').forEach(row => {
      row.addEventListener('click', () => selectState(row.dataset.state, true));
    });
  }

  function selectState(name, scrollMap = false) {
    ui.state.selected = name;
    pathByName.forEach((layer, n) => layer._path?.classList.toggle('selected', n === name));
    renderDetail(name);
    if (scrollMap) {
      const layer = pathByName.get(name);
      if (layer?.getBounds) { try { map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 6 }); } catch (e) {} }
    }
  }
  function setHover(name) {
    ui.state.hover = name;
    pathByName.forEach((layer, n) => layer._path?.classList.toggle('hover', n === name));
    updateReadout();
  }

  function wireControls() {
    $$ind('.ind-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$ind('.ind-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ui.state.view = btn.dataset.view;
        repaint();
      });
    });
    const slider = $ind('#india-year');
    slider.max = DATA._meta.years.length - 1;
    slider.value = ui.state.yearIdx;
    slider.addEventListener('input', e => {
      ui.state.yearIdx = parseInt(e.target.value, 10);
      repaint();
    });
  }

  function buildMap() {
    map = L.map('india-map', {
      attributionControl: true, zoomControl: true, worldCopyJump: false,
      minZoom: 3, maxZoom: 7,
    }).setView([39, -96], 4);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', attribution: '&copy; OSM, &copy; CARTO', maxZoom: 7,
    }).addTo(map);
    geoLayer = L.geoJSON(GEO, {
      style: f => fillStyle(f.properties.name),
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name;
        pathByName.set(name, layer);
        layer.on('mouseover', () => setHover(name));
        layer.on('mouseout', () => setHover(null));
        layer.on('click', () => selectState(name));
      }
    }).addTo(map);
    try { map.fitBounds(geoLayer.getBounds(), { padding: [10, 10] }); } catch (e) {}
  }

  async function bootstrap() {
    try {
      const [geoRes, dataRes] = await Promise.all([
        fetch('usa-states.geojson'),
        fetch('usa-fiscal.json')
      ]);
      if (!geoRes.ok) throw new Error('GeoJSON HTTP ' + geoRes.status);
      if (!dataRes.ok) throw new Error('Fiscal HTTP ' + dataRes.status);
      GEO = await geoRes.json();
      DATA = await dataRes.json();
      ui.state.yearIdx = DATA._meta.years.length - 1;
      ui._domain = computeDomain(VIEWS[ui.state.view], ui.state.yearIdx);
      wireControls();
      buildMap();
      repaint();
    } catch (err) {
      console.error('USA bootstrap failed:', err);
      const wrap = $ind('#india-map-wrap');
      if (wrap) wrap.innerHTML = `<div style="padding:2rem;color:var(--muted-foreground);font-family:var(--font-mono);font-size:12px"><strong>Bootstrap failed.</strong><br/><code>${esc(err.message)}</code></div>`;
    }
  }
  bootstrap();
})();
