/* ══════════════════════════════════════════════════════════════════════
   INDIA FISCAL MAP — standalone single-screen dashboard
   Click a state → its 10-year history + governance footprint + pros/cons.
   ══════════════════════════════════════════════════════════════════════ */

(function init() {
  const root = document.getElementById('map');
  if (!root) return;

  const VIEWS = {
    ownTax: {
      label: 'Own tax revenue (₹ \'000 cr)',
      shortLabel: 'Own revenue',
      diverging: false,
      compute: (d, ext) => d.ownTax,
      fmt: v => v.toFixed(1) + ' k cr',
      help: 'Taxes the state collects itself — SGST share, stamp duty, state excise, motor-vehicle tax.'
    },
    corruption: {
      label: 'Households reporting bribe paid in last 12 mo (%)',
      shortLabel: 'Corruption %',
      diverging: false,
      compute: (d, ext) => ext?.corruption_pct ?? null,
      fmt: v => v == null ? '—' : v.toFixed(0) + '%',
      help: 'CMS-India India Corruption Study 2019 — % of households reporting they paid a bribe to access a public service.'
    },
    gsdp: {
      label: 'GSDP (₹ \'000 cr)',
      shortLabel: 'GSDP',
      diverging: false,
      compute: (d, ext) => d.gsdp,
      fmt: v => v.toFixed(0) + ' k cr',
      help: 'Gross State Domestic Product at current prices.'
    },
    ownTaxPctGsdp: {
      label: 'Own tax / GSDP (%)',
      shortLabel: 'Revenue / GSDP',
      diverging: false,
      compute: (d, ext) => (d.ownTax / d.gsdp) * 100,
      fmt: v => v.toFixed(2) + '%',
      help: 'Fiscal effort — what share of the state economy the state captures as own revenue.'
    },
    netFlow: {
      label: 'Net flow (₹ \'000 cr)',
      shortLabel: 'Net flow',
      diverging: true,
      compute: (d, ext) => (d.devolution + d.grants) - d.contribution,
      fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' k cr',
      help: 'Devolution + grants received minus estimated federal taxes contributed. Positive = net recipient.'
    },
    devolution: {
      label: 'Central tax devolution (₹ \'000 cr)',
      shortLabel: 'Devolution',
      diverging: false,
      compute: (d, ext) => d.devolution,
      fmt: v => v.toFixed(1) + ' k cr',
      help: 'State\'s share of the divisible pool of central taxes per the active Finance Commission.'
    },
    contribution: {
      label: 'Estimated contribution to Center (₹ \'000 cr)',
      shortLabel: 'Contribution',
      diverging: false,
      compute: (d, ext) => d.contribution,
      fmt: v => v.toFixed(1) + ' k cr',
      help: 'Estimated federal taxes (income, corporate, GST/IGST origin, customs) attributable to the state.'
    },
    perCapitaGsdp: {
      label: 'Per-capita GSDP (₹ lakh / yr)',
      shortLabel: 'GDP / person',
      diverging: false,
      compute: (d) => d.meta?.pop_cr ? (d.gsdp * 1000 / d.meta.pop_cr) / 100000 : null,
      fmt: v => v == null ? '—' : '₹' + v.toFixed(2) + ' L',
      help: 'GSDP per resident per year (₹ lakh). State pop is 2024 estimate ≈ Census 2011 projection.'
    },
    fcShare: {
      label: 'Finance Commission horizontal share (%)',
      shortLabel: 'FC share',
      diverging: false,
      compute: (d, ext) => d.fcShare,
      fmt: v => v.toFixed(2) + '%',
      help: 'Percent of the divisible pool allocated to this state under the active Finance Commission.'
    }
  };

  // Source-of-truth registry — surfaced as `↗ Source` links next to each metric.
  const SOURCES = {
    gsdp:           { name: 'MoSPI',                  url: 'https://mospi.gov.in/state-domestic-product' },
    ownTax:         { name: 'RBI State Finances',     url: 'https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook+of+Statistics+on+Indian+States' },
    devolution:     { name: 'Union Budget receipts',  url: 'https://www.indiabudget.gov.in/' },
    grants:         { name: 'Union Budget receipts',  url: 'https://www.indiabudget.gov.in/' },
    contribution:   { name: 'CBDT + GST Council (est.)', url: 'https://incometaxindia.gov.in/Pages/Direct-Taxes-Data.aspx' },
    netFlow:        { name: 'Derived from above',     url: 'references.html' },
    ownTaxPctGsdp:  { name: 'RBI ÷ MoSPI',            url: 'https://www.rbi.org.in/' },
    perCapitaGsdp:  { name: 'MoSPI ÷ Census 2011 pop', url: 'https://mospi.gov.in/state-domestic-product' },
    fcShare:        { name: 'FC XIV / XV reports',    url: 'https://fincomindia.nic.in' },
    corruption:     { name: 'CMS India 2019',         url: 'https://www.cmsindia.org/india-corruption-study' },
    ias:            { name: 'DoPT Civil List',        url: 'https://dopt.gov.in/' },
    employees:      { name: 'State finance reports',  url: 'https://doe.gov.in/' },
    districts:      { name: 'Datameet · Census 2011 boundaries', url: 'https://github.com/geohacker/india' },
    population:     { name: 'Census of India 2011',   url: 'https://censusindia.gov.in' }
  };

  const ui = { state: { view: 'ownTax', yearIdx: 9, selected: null, hover: null, mode: 'states', drillState: null, drillDistrict: null } };

  let DATA = null, EXTRAS = null, GEO = null, DISTRICT_POP = null;
  let map = null, geoLayer = null, districtLayer = null;
  const pathByName = new Map();
  const districtPathByName = new Map();
  const districtGeoCache = new Map();

  // Census uses older / uppercase state names. Map to standard ST_NM.
  const CENSUS_STATE_MAP = {
    'ORISSA': 'Odisha',
    'PONDICHERRY': 'Puducherry',
    'NCT OF DELHI': 'Delhi',
    'ANDAMAN AND NICOBAR ISLANDS': 'Andaman & Nicobar',
    'JAMMU AND KASHMIR': 'Jammu & Kashmir',
    'UTTARAKHAND': 'Uttarakhand'
  };
  function normalizeStateName(s) {
    const up = s.toUpperCase();
    if (CENSUS_STATE_MAP[up]) return CENSUS_STATE_MAP[up];
    return s.split(/\s+/).map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
  }

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
    if (t < 0.5) {
      const k = 1 - t * 2;
      return oklch(0.30 + 0.40 * k, 0.02 + 0.16 * k, 210);
    }
    const k = (t - 0.5) * 2;
    return oklch(0.30 + 0.45 * k, 0.02 + 0.20 * k, 35);
  }
  function colorFor(value, view, domain) {
    if (value === null || value === undefined || Number.isNaN(value)) return 'oklch(0.22 0 0)';
    if (view.diverging) {
      const max = Math.max(Math.abs(domain.min), Math.abs(domain.max));
      if (max <= 0) return divColor(0.5);
      return divColor(0.5 + (value / max) * 0.5);
    }
    const range = domain.max - domain.min;
    if (range <= 0) return seqColor(0.5);
    return seqColor((value - domain.min) / range);
  }

  function rowFor(stateName, yearIdx) {
    const s = DATA.states[stateName];
    if (!s) return null;
    const year = DATA._meta.years[yearIdx];
    const fcPeriod = DATA._meta.fc_periods.find(p => p.years.includes(year));
    const fcShare = (fcPeriod && fcPeriod.name === '15th FC') ? s.fc15_share : s.fc14_share;
    return {
      stateName, meta: s, year, yearLabel: DATA._meta.yearLabels[yearIdx], fcPeriod,
      gsdp: s.gsdp[yearIdx],
      ownTax: s.ownTax[yearIdx],
      devolution: s.devolution[yearIdx],
      grants: s.grants[yearIdx],
      contribution: s.contribution[yearIdx],
      fcShare
    };
  }
  function extFor(name) { return EXTRAS?.states?.[name] || null; }

  function computeDomain(view, yearIdx) {
    const values = [];
    for (const name of Object.keys(DATA.states)) {
      const r = rowFor(name, yearIdx);
      if (!r) continue;
      const v = view.compute(r, extFor(name));
      if (typeof v === 'number' && !Number.isNaN(v)) values.push(v);
    }
    if (!values.length) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  function fillStyle(name) {
    const view = VIEWS[ui.state.view];
    const r = rowFor(name, ui.state.yearIdx);
    if (!r) return { color: 'oklch(0.985 0 0 / 0.18)', weight: 0.5, fillColor: 'oklch(0.22 0 0)', fillOpacity: 0.55, className: 'india-state-path no-data' };
    const v = view.compute(r, extFor(name));
    return {
      color: 'oklch(0.985 0 0 / 0.22)',
      weight: 0.5,
      fillColor: colorFor(v, view, ui._domain),
      fillOpacity: 0.92,
      className: 'india-state-path'
    };
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
    const labelEl = $ind('.readout-label');
    const nameEl = $ind('.readout-name');
    const valEl = $ind('.readout-value');
    if (!name) {
      labelEl.textContent = 'Hover a state';
      nameEl.textContent = '—';
      valEl.textContent = view.help;
      valEl.style.color = 'var(--muted-foreground)';
      valEl.style.fontSize = '11px';
      return;
    }
    const r = rowFor(name, ui.state.yearIdx);
    if (!r) {
      labelEl.textContent = 'No fiscal data';
      nameEl.textContent = name;
      valEl.textContent = 'UT or excluded from this dataset';
      valEl.style.color = 'var(--muted-foreground)';
      valEl.style.fontSize = '12px';
      return;
    }
    labelEl.textContent = `${view.shortLabel} · ${r.yearLabel}`;
    nameEl.textContent = name;
    const v = view.compute(r, extFor(name));
    valEl.textContent = view.fmt(v);
    valEl.style.color = 'oklch(0.78 0.16 70)';
    valEl.style.fontSize = '14px';
  }

  function repaint() {
    ui._domain = computeDomain(VIEWS[ui.state.view], ui.state.yearIdx);
    if (geoLayer) geoLayer.eachLayer(layer => layer.setStyle(fillStyle(layer.feature.properties.ST_NM)));
    updateLegend();
    updateReadout();
    if (ui.state.selected) renderDetail(ui.state.selected);
    else renderEmptyState();
    updateYearMarker();
  }

  function updateYearMarker() {
    const total = DATA._meta.years.length;
    const pct = (ui.state.yearIdx / (total - 1)) * 100;
    const marker = root.querySelector('#india-fc-strip .fc-marker');
    if (marker) marker.style.left = `calc(${pct}% - 1px)`;
    $ind('#india-year-value').textContent = DATA._meta.yearLabels[ui.state.yearIdx];
  }

  function fmtComma(v) {
    if (Math.abs(v) >= 100) return Math.round(v).toLocaleString('en-IN');
    return v.toFixed(1);
  }

  function renderDetail(name) {
    const detail = $ind('#india-detail');
    const r = rowFor(name, ui.state.yearIdx);
    if (!r) {
      detail.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
          <div class="eyebrow">${esc(name)}</div>
          <button class="india-back-btn" id="india-back">← Back</button>
        </div>
        <p class="india-detail-empty-body">No fiscal data for this UT / excluded entity in the current dataset.</p>`;
      $ind('#india-back')?.addEventListener('click', deselectState);
      return;
    }
    const s = r.meta;
    const ext = extFor(name);
    const totalIn = r.devolution + r.grants;
    const net = totalIn - r.contribution;
    const isDonor = net < 0;
    const ratio = r.contribution > 0 ? (totalIn / r.contribution) : 0;
    const ownTaxPct = (r.ownTax / r.gsdp) * 100;

    const govStrip = ext ? `
      <div class="india-gov-strip">
        <div class="india-gov-cell">
          <div class="label">IAS cadre strength</div>
          <div class="value">${ext.ias}</div>
          <div class="sub">approved · ~25–40% on Central deputation</div>
        </div>
        <div class="india-gov-cell">
          <div class="label">State employees</div>
          <div class="value">${ext.employees_lakh} lakh</div>
          <div class="sub">direct only · excl. contract</div>
        </div>
        <div class="india-gov-cell">
          <div class="label">Bribe-paid %</div>
          <div class="value">${ext.corruption_pct}%</div>
          <div class="sub">CMS 2019 · last 12 mo</div>
        </div>
      </div>` : '';

    const deptBlock = ext ? `
      <div class="india-detail-section-title">Government departments</div>
      <div class="india-depts">
        <div class="india-dept-col back">
          <h4>Back-office (high payroll · low public output)</h4>
          <ul>${ext.dept_back.map(d => `<li><span class="name">${esc(d.name)}</span><span class="note">${esc(d.note)}</span></li>`).join('')}</ul>
        </div>
        <div class="india-dept-col front">
          <h4>Public-facing (citizen interaction)</h4>
          <ul>${ext.dept_public.map(d => `<li><span class="name">${esc(d.name)}</span><span class="note">${esc(d.note)}</span></li>`).join('')}</ul>
        </div>
      </div>
      <p class="india-caveat">IAS counts are cadre approved-strength snapshots; a sizeable share is on Central deputation under DoPT at any given time, so this is a structural cap, not a count of officers physically present in the state.</p>
    ` : '';

    const perCapita = s.pop_cr ? ((r.gsdp * 1000 / s.pop_cr) / 100000) : null;
    const src = (key) => {
      const o = SOURCES[key];
      return o ? `<a class="src-link" href="${esc(o.url)}" target="_blank" rel="noopener" title="Source: ${esc(o.name)}">↗</a>` : '';
    };
    detail.innerHTML = `
      <div class="india-detail-head">
        <div>
          <div class="india-detail-name">${esc(name)}</div>
          <div class="mono" style="font-size:10.5px;letter-spacing:0.04em;color:var(--muted-foreground);text-transform:uppercase;margin-top:2px">${esc(s.region)} · ${esc(s.capital)} · pop ~${s.pop_cr.toFixed(1)} cr</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
          <button class="india-back-btn" id="india-back">← Back</button>
          <div class="india-detail-meta">${esc(r.yearLabel)} · <span style="opacity:0.6">${esc(r.fcPeriod?.name ?? '—')}</span></div>
          <button class="india-drill-btn" id="india-drill">Districts ↘</button>
        </div>
      </div>

      <div class="india-stat-grid">
        <div class="india-stat"><div class="label">GSDP ${src('gsdp')}</div><div class="value">₹${fmtComma(r.gsdp)} k cr</div></div>
        <div class="india-stat"><div class="label">Own revenue ${src('ownTax')}</div><div class="value">₹${fmtComma(r.ownTax)} k cr</div></div>
        <div class="india-stat"><div class="label">GDP / person ${src('perCapitaGsdp')}</div><div class="value">${perCapita == null ? '—' : '₹' + perCapita.toFixed(2) + ' L'}</div></div>
        <div class="india-stat"><div class="label">FC share ${src('fcShare')}</div><div class="value">${r.fcShare.toFixed(3)}%</div></div>
        <div class="india-stat"><div class="label">Devolution in ${src('devolution')}</div><div class="value">₹${fmtComma(r.devolution)} k cr</div></div>
        <div class="india-stat"><div class="label">Grants in ${src('grants')}</div><div class="value">₹${fmtComma(r.grants)} k cr</div></div>
        <div class="india-stat"><div class="label">Contrib. to Center (est.) ${src('contribution')}</div><div class="value">₹${fmtComma(r.contribution)} k cr</div></div>
        <div class="india-stat ${isDonor ? 'donor' : 'recipient'}"><div class="label">Net flow ${src('netFlow')}</div><div class="value">${net >= 0 ? '+' : ''}${fmtComma(net)} k cr</div></div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:0.6rem;font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground);margin-bottom:0.85rem;flex-wrap:wrap">
        <span>FC share: <span style="color:var(--foreground)">${r.fcShare.toFixed(3)}%</span></span>
        <span>Revenue / GSDP: <span style="color:var(--foreground)">${ownTaxPct.toFixed(2)}%</span></span>
        <span>In : Out: <span style="color:${isDonor ? 'oklch(0.7 0.18 30)' : 'oklch(0.7 0.17 162)'}">${ratio.toFixed(2)}×</span></span>
      </div>

      ${govStrip}

      <div class="india-detail-section-title">10-year history</div>
      <svg id="india-spark" viewBox="0 0 320 110" preserveAspectRatio="none"></svg>
      <div class="india-spark-legend">
        <span><span class="sw" style="background:oklch(0.7 0.17 162)"></span>Own revenue</span>
        <span><span class="sw" style="background:oklch(0.78 0.16 70)"></span>Devolution + grants</span>
        <span><span class="sw" style="background:oklch(0.65 0.18 250)"></span>Contribution (est.)</span>
      </div>

      ${deptBlock}

      <div class="india-detail-section-title">Pros &amp; Cons</div>
      <div class="india-proscons">
        <div class="india-pc pros"><h4>Pros</h4><ul>${s.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
        <div class="india-pc cons"><h4>Cons</h4><ul>${s.cons.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      </div>
    `;
    drawSpark(s, ui.state.yearIdx);
    $ind('#india-back')?.addEventListener('click', deselectState);
    $ind('#india-drill')?.addEventListener('click', () => drillIntoDistricts(name));
  }

  /* ───────── DISTRICT DRILL-DOWN ───────── */
  async function drillIntoDistricts(stateName) {
    const fname = 'districts/' + stateName.replace(/ /g, '_').replace(/&/g, 'and') + '.geojson';
    try {
      let geo = districtGeoCache.get(stateName);
      if (!geo) {
        const res = await fetch(fname);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + fname);
        geo = await res.json();
        districtGeoCache.set(stateName, geo);
      }
      ui.state.mode = 'districts';
      ui.state.drillState = stateName;
      renderDistrictLayer(geo, stateName);
      renderDistrictPanel(stateName, geo);
    } catch (err) {
      console.error('District drill failed:', err);
      $ind('#india-detail').insertAdjacentHTML('afterbegin',
        `<div style="background:oklch(0.25 0.08 30);padding:0.5rem;border-radius:4px;font-family:var(--font-mono);font-size:11px;margin-bottom:0.5rem">No district file for ${esc(stateName)}: ${esc(err.message)}</div>`);
    }
  }

  function getDistrictPop(stateName, districtName) {
    if (!DISTRICT_POP) return null;
    // Census state names are uppercase + older; build matcher
    for (const [csState, dists] of Object.entries(DISTRICT_POP.states)) {
      const std = normalizeStateName(csState);
      const stdAmp = std.replace(' and ', ' & ').replace('Andaman & Nicobar Islands', 'Andaman & Nicobar');
      if (stdAmp === stateName || std === stateName) {
        // Case-insensitive district match
        for (const [dn, vals] of Object.entries(dists)) {
          if (dn.toLowerCase() === districtName.toLowerCase()) return vals;
        }
      }
    }
    return null;
  }

  function renderDistrictLayer(geo, stateName) {
    // Hide the state layer's other states by drastically reducing their opacity (keep selected state visible underneath as outline)
    if (geoLayer) {
      geoLayer.eachLayer(layer => {
        const isThis = layer.feature.properties.ST_NM === stateName;
        layer.setStyle({ fillOpacity: isThis ? 0.0 : 0.15, weight: isThis ? 1.5 : 0.3, color: isThis ? 'oklch(0.985 0 0)' : 'oklch(0.985 0 0 / 0.15)' });
      });
    }
    if (districtLayer) {
      districtLayer.remove();
      districtPathByName.clear();
    }
    // Domain for district population coloring
    const pops = [];
    for (const f of geo.features) {
      const pop = getDistrictPop(stateName, f.properties.DISTRICT)?.population;
      if (typeof pop === 'number') pops.push(pop);
    }
    const popMax = pops.length ? Math.max(...pops) : 1;
    const popMin = pops.length ? Math.min(...pops) : 0;

    districtLayer = L.geoJSON(geo, {
      style: f => {
        const pop = getDistrictPop(stateName, f.properties.DISTRICT)?.population;
        const t = pop != null ? (pop - popMin) / Math.max(1, popMax - popMin) : 0;
        return {
          className: 'india-state-path',
          color: 'oklch(0.985 0 0 / 0.45)',
          weight: 0.6,
          fillColor: pop == null ? 'oklch(0.22 0 0)' : seqColor(t),
          fillOpacity: pop == null ? 0.45 : 0.9
        };
      },
      onEachFeature: (feature, layer) => {
        const dn = feature.properties.DISTRICT;
        districtPathByName.set(dn, layer);
        layer.on('mouseover', () => {
          layer.setStyle({ weight: 1.6, color: 'oklch(0.985 0 0)' });
          const pop = getDistrictPop(stateName, dn)?.population;
          updateDistrictReadout(dn, stateName, pop);
        });
        layer.on('mouseout', () => {
          if (ui.state.drillDistrict !== dn) layer.setStyle({ weight: 0.6, color: 'oklch(0.985 0 0 / 0.45)' });
          updateReadout();
        });
        layer.on('click', () => selectDistrict(dn, stateName));
      }
    }).addTo(map);

    try { map.fitBounds(districtLayer.getBounds(), { padding: [30, 30] }); } catch (e) {}
  }

  function updateDistrictReadout(district, state, pop) {
    $ind('.readout-label').textContent = `District · ${state}`;
    $ind('.readout-name').textContent = district;
    const valEl = $ind('.readout-value');
    valEl.textContent = pop != null ? `Pop ${pop.toLocaleString('en-IN')} (Census 2011)` : 'Population data pending';
    valEl.style.color = 'oklch(0.78 0.16 70)';
    valEl.style.fontSize = '12.5px';
  }

  function selectDistrict(district, state) {
    ui.state.drillDistrict = district;
    districtPathByName.forEach((layer, n) => {
      if (n === district) layer.setStyle({ weight: 2, color: 'oklch(0.985 0 0)' });
      else layer.setStyle({ weight: 0.6, color: 'oklch(0.985 0 0 / 0.45)' });
    });
    renderDistrictDetail(district, state);
  }

  function renderDistrictPanel(stateName, geo) {
    // List districts of this state sorted by population (Census 2011 where available)
    const items = geo.features.map(f => {
      const dn = f.properties.DISTRICT;
      const data = getDistrictPop(stateName, dn);
      return { name: dn, pop: data?.population ?? null, lit: data?.literate ?? null, hh: data?.households ?? null };
    });
    items.sort((a, b) => (b.pop || 0) - (a.pop || 0));
    const totalPop = items.reduce((s, x) => s + (x.pop || 0), 0);
    const src = (key) => {
      const o = SOURCES[key];
      return o ? `<a class="src-link" href="${esc(o.url)}" target="_blank" rel="noopener" title="Source: ${esc(o.name)}">↗</a>` : '';
    };
    const max = items[0]?.pop || 1;
    const detail = $ind('#india-detail');
    detail.innerHTML = `
      <div class="india-detail-head">
        <div>
          <div class="india-detail-name">${esc(stateName)} · districts</div>
          <div class="mono" style="font-size:10.5px;letter-spacing:0.04em;color:var(--muted-foreground);text-transform:uppercase;margin-top:2px">${items.length} districts · total Census 2011 pop ${totalPop.toLocaleString('en-IN')}</div>
        </div>
        <button class="india-back-btn" id="india-back-to-state">← Back to ${esc(stateName)}</button>
      </div>

      <div class="india-caveat" style="margin-bottom:0.6rem">
        Every district is headed by <strong style="color:var(--foreground)">one IAS Collector / District Magistrate</strong> ${src('ias')} — not a varying count. The rest of the state's IAS cadre sits at the state secretariat, on Central deputation, in PSUs, on training, or vacant. Population from Census 2011 ${src('population')} — Census 2021 was deferred; some post-2011 newer districts not in this dataset.
      </div>

      <div class="india-detail-section-title">Districts by population</div>
      <div class="district-list">
        ${items.map((it, i) => `
          <button class="district-row" data-district="${esc(it.name)}">
            <span class="rnk">${String(i + 1).padStart(2, '0')}</span>
            <span class="name">${esc(it.name)}</span>
            <span class="bar-wrap"><span class="bar" style="width:${it.pop ? ((it.pop / max) * 100).toFixed(0) : 0}%"></span></span>
            <span class="val">${it.pop ? (it.pop / 1e6).toFixed(2) + ' M' : '—'}</span>
          </button>
        `).join('')}
      </div>
    `;
    detail.querySelectorAll('.district-row').forEach(row => {
      row.addEventListener('click', () => selectDistrict(row.dataset.district, stateName));
    });
    $ind('#india-back-to-state')?.addEventListener('click', () => exitDrill(stateName));
  }

  function renderDistrictDetail(district, state) {
    const data = getDistrictPop(state, district);
    const src = (key) => {
      const o = SOURCES[key];
      return o ? `<a class="src-link" href="${esc(o.url)}" target="_blank" rel="noopener" title="Source: ${esc(o.name)}">↗</a>` : '';
    };
    const detail = $ind('#india-detail');
    const litRate = data?.literate && data?.population ? (data.literate / data.population * 100).toFixed(1) : null;
    const urbanPct = data?.urban_hh && data?.households ? (data.urban_hh / data.households * 100).toFixed(1) : null;
    detail.innerHTML = `
      <div class="india-detail-head">
        <div>
          <div class="india-detail-name">${esc(district)}</div>
          <div class="mono" style="font-size:10.5px;letter-spacing:0.04em;color:var(--muted-foreground);text-transform:uppercase;margin-top:2px">District of ${esc(state)} · headed by 1 IAS Collector</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
          <button class="india-back-btn" id="india-back-to-districts">← All districts</button>
          <button class="india-back-btn" id="india-back-to-state">← ${esc(state)}</button>
        </div>
      </div>
      ${data ? `
      <div class="india-stat-grid">
        <div class="india-stat"><div class="label">Population (2011) ${src('population')}</div><div class="value">${data.population.toLocaleString('en-IN')}</div></div>
        <div class="india-stat"><div class="label">Literate ${src('population')}</div><div class="value">${litRate ? litRate + '%' : '—'}</div></div>
        <div class="india-stat"><div class="label">Male / Female</div><div class="value">${data.male.toLocaleString('en-IN')} / ${data.female.toLocaleString('en-IN')}</div></div>
        <div class="india-stat"><div class="label">Households ${src('population')}</div><div class="value">${data.households ? data.households.toLocaleString('en-IN') : '—'}</div></div>
        <div class="india-stat"><div class="label">Urban share</div><div class="value">${urbanPct ? urbanPct + '%' : '—'}</div></div>
        <div class="india-stat"><div class="label">Administrative head</div><div class="value" style="font-size:11.5px">1 IAS Collector / DM</div></div>
      </div>
      ` : `<p class="india-detail-empty-body">No Census 2011 record for this district — likely carved out post-2011.</p>`}

      <div class="india-caveat">
        Census 2011 totals are persons (not lakh / crore). Sex / household figures from the same Census round. IAS Collector posting changes ~every 2–3 years; the current DM's name isn't in this dashboard (no central machine-readable list — would have to scrape state DOPT sites). What IS structural: every district has exactly one DM, and that's the state's only routine IAS field deployment outside the secretariat.
      </div>
    `;
    detail.querySelector('#india-back-to-districts')?.addEventListener('click', () => {
      ui.state.drillDistrict = null;
      const geo = districtGeoCache.get(state);
      if (geo) renderDistrictPanel(state, geo);
      districtPathByName.forEach(layer => layer.setStyle({ weight: 0.6, color: 'oklch(0.985 0 0 / 0.45)' }));
    });
    detail.querySelector('#india-back-to-state')?.addEventListener('click', () => exitDrill(state));
  }

  function exitDrill(stateName) {
    ui.state.mode = 'states';
    ui.state.drillState = null;
    ui.state.drillDistrict = null;
    if (districtLayer) { districtLayer.remove(); districtLayer = null; districtPathByName.clear(); }
    // Restore state layer styling
    if (geoLayer) geoLayer.eachLayer(layer => layer.setStyle(fillStyle(layer.feature.properties.ST_NM)));
    if (stateName) selectState(stateName);
    try { map.fitBounds(geoLayer.getBounds(), { padding: [10, 10] }); } catch (e) {}
  }

  function renderEmptyState() {
    const detail = $ind('#india-detail');
    const view = VIEWS[ui.state.view];
    detail.innerHTML = `
      <div class="india-detail-empty">
        <div class="eyebrow">Active view: ${esc(view.shortLabel)} · ${esc(DATA._meta.yearLabels[ui.state.yearIdx])}</div>
        <p class="india-detail-empty-body">Click any state for its 10-year history, governance footprint (IAS · employees · bribe-paid %), departments split (back-office vs public-facing), and structural pros / cons.</p>
        <div id="india-summary" class="india-summary-inline"></div>
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
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const years = DATA._meta.yearLabels;
    const n = years.length;

    const inFlow = s.devolution.map((d, i) => d + s.grants[i]);
    const series = [
      { name: 'ownTax', vals: s.ownTax, color: 'oklch(0.7 0.17 162)' },
      { name: 'inflow', vals: inFlow, color: 'oklch(0.78 0.16 70)' },
      { name: 'contribution', vals: s.contribution, color: 'oklch(0.65 0.18 250)' }
    ];
    const max = Math.max(...series.flatMap(ser => ser.vals)) * 1.05;
    const x = i => padL + (i / (n - 1)) * innerW;
    const y = v => padT + innerH - (v / max) * innerH;

    let svgContent = '';
    for (let g = 0; g <= 3; g++) {
      const v = (max) * (g / 3);
      const yy = y(v);
      svgContent += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="oklch(0.985 0 0 / 0.07)" stroke-width="1"/>`;
      svgContent += `<text x="${padL - 4}" y="${yy + 3}" text-anchor="end" fill="oklch(0.6 0 0)" font-family="ui-monospace, monospace" font-size="8">${Math.round(v)}</text>`;
    }
    [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
      svgContent += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" fill="oklch(0.6 0 0)" font-family="ui-monospace, monospace" font-size="8">${years[i]}</text>`;
    });
    svgContent += `<line x1="${x(yearIdx)}" x2="${x(yearIdx)}" y1="${padT}" y2="${padT + innerH}" stroke="var(--foreground)" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.4"/>`;
    [1, 6].forEach(i => {
      svgContent += `<line x1="${x(i) - (innerW / (n - 1) / 2)}" x2="${x(i) - (innerW / (n - 1) / 2)}" y1="${padT}" y2="${padT + innerH}" stroke="oklch(0.985 0 0 / 0.18)" stroke-width="1" stroke-dasharray="1 3"/>`;
    });
    for (const ser of series) {
      const pts = ser.vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      svgContent += `<polyline points="${pts}" fill="none" stroke="${ser.color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
      svgContent += `<circle cx="${x(yearIdx)}" cy="${y(ser.vals[yearIdx])}" r="3" fill="${ser.color}" stroke="oklch(0.145 0 0)" stroke-width="1"/>`;
    }
    svg.innerHTML = svgContent;
  }

  function renderSummary() {
    const container = $ind('#india-summary');
    if (!container) return;
    const view = VIEWS[ui.state.view];
    const ranked = [];
    for (const name of Object.keys(DATA.states)) {
      const r = rowFor(name, ui.state.yearIdx);
      if (!r) continue;
      const v = view.compute(r, extFor(name));
      if (v == null || Number.isNaN(v)) continue;
      ranked.push({ name, value: v });
    }
    ranked.sort((a, b) => a.value - b.value);

    const renderRow = (item, i) => `
      <div class="india-rank-row" data-state="${esc(item.name)}">
        <span class="rnk">${String(i + 1).padStart(2, '0')}</span>
        <span class="name">${esc(item.name)}</span>
        <span class="val">${view.fmt(item.value)}</span>
      </div>`;

    const isDiv = view.diverging;
    container.innerHTML = `
      <div class="india-summary-card">
        <div class="h">${isDiv ? 'Top net donors' : 'Lowest by ' + view.shortLabel.toLowerCase()}</div>
        <div class="sub">${isDiv ? 'Most negative net flow' : view.label} · ${DATA._meta.yearLabels[ui.state.yearIdx]}</div>
        ${ranked.slice(0, 8).map(renderRow).join('')}
      </div>
      <div class="india-summary-card">
        <div class="h">${isDiv ? 'Top net recipients' : 'Highest by ' + view.shortLabel.toLowerCase()}</div>
        <div class="sub">${isDiv ? 'Most positive net flow' : view.label} · ${DATA._meta.yearLabels[ui.state.yearIdx]}</div>
        ${ranked.slice(-8).reverse().map((it, i) => renderRow(it, i)).join('')}
      </div>
    `;
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
      if (layer && layer.getBounds) {
        try { map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 6 }); } catch (e) {}
      }
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
    slider.addEventListener('input', (e) => {
      ui.state.yearIdx = parseInt(e.target.value, 10);
      repaint();
    });

    const fcStrip = $ind('#india-fc-strip');
    fcStrip.innerHTML = `
      <div class="fc-seg fc-13" title="13th Finance Commission · 32% vertical pool · FY15"><span class="fc-label">13th FC</span></div>
      <div class="fc-seg fc-14" title="14th Finance Commission · 42% vertical pool · FY16-FY20"><span class="fc-label">14th FC · 42%</span></div>
      <div class="fc-seg fc-15" title="15th Finance Commission · 41% vertical pool · FY21-FY26"><span class="fc-label">15th FC · 41%</span></div>
      <div class="fc-marker" style="left:0"></div>
    `;
  }

  function buildMap() {
    map = L.map('india-map', {
      attributionControl: true,
      zoomControl: true,
      worldCopyJump: false,
      minZoom: 4,
      maxZoom: 7,
    }).setView([22.5, 80], 4.5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      attribution: '&copy; OSM, &copy; CARTO',
      maxZoom: 7,
    }).addTo(map);

    geoLayer = L.geoJSON(GEO, {
      style: f => fillStyle(f.properties.ST_NM),
      onEachFeature: (feature, layer) => {
        const name = feature.properties.ST_NM;
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
      const [geoRes, dataRes, extrasRes, popRes] = await Promise.all([
        fetch('india-states.geojson'),
        fetch('india-fiscal.json'),
        fetch('india-extras.json'),
        fetch('district-pop.json')
      ]);
      if (!geoRes.ok) throw new Error('GeoJSON HTTP ' + geoRes.status);
      if (!dataRes.ok) throw new Error('Fiscal JSON HTTP ' + dataRes.status);
      GEO = await geoRes.json();
      DATA = await dataRes.json();
      if (extrasRes.ok) EXTRAS = await extrasRes.json();
      else console.warn('india-extras.json missing — proceeding without governance footprint');
      if (popRes.ok) DISTRICT_POP = await popRes.json();
      else console.warn('district-pop.json missing — district drill-down will show names only');

      ui.state.yearIdx = DATA._meta.years.length - 1;
      // Compute the color domain BEFORE building the map: Leaflet's GeoJSON layer
      // synchronously invokes the style callback for every feature during construction,
      // which calls fillStyle → colorFor(domain). Without this, domain is undefined and
      // colorFor crashes on the first paint.
      ui._domain = computeDomain(VIEWS[ui.state.view], ui.state.yearIdx);
      wireControls();
      buildMap();
      repaint();
    } catch (err) {
      console.error('Bootstrap failed:', err);
      const wrap = $ind('#india-map-wrap');
      if (wrap) {
        wrap.innerHTML = `<div style="padding:2rem;color:var(--muted-foreground);font-family:var(--font-mono);font-size:12px"><strong style="color:var(--foreground)">Bootstrap failed.</strong><br/><br/><code style="display:block;background:oklch(0.18 0 0);padding:0.5rem;border-radius:4px;color:oklch(0.7 0.18 30)">${esc(err.message)}</code><br/>If you're opening the HTML file directly (file://), serve it over HTTP instead:<br/><code>python3 -m http.server 8000</code></div>`;
      }
    }
  }

  bootstrap();
})();
