/* History page — FC-by-FC race + land-revenue timeline */

(function init() {
  let DATA = null;
  let currentIdx = 14; // default to 15th FC
  let timer = null;
  const FRAME_MS = 1500;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Distinct colors per state (region-grouped) — kept stable across FCs so eye can track
  function colorForState(name) {
    const palette = {
      'Uttar Pradesh': 'oklch(0.65 0.18 30)',
      'Bihar': 'oklch(0.68 0.16 50)',
      'Madhya Pradesh': 'oklch(0.7 0.14 70)',
      'Rajasthan': 'oklch(0.72 0.18 90)',
      'West Bengal': 'oklch(0.62 0.14 110)',
      'Maharashtra': 'oklch(0.65 0.18 150)',
      'Andhra Pradesh': 'oklch(0.68 0.16 170)',
      'Tamil Nadu': 'oklch(0.62 0.18 190)',
      'Karnataka': 'oklch(0.65 0.18 210)',
      'Gujarat': 'oklch(0.7 0.16 230)',
      'Odisha': 'oklch(0.62 0.16 250)',
      'Kerala': 'oklch(0.65 0.18 270)',
      'Telangana': 'oklch(0.68 0.18 290)',
      'Punjab': 'oklch(0.7 0.18 310)',
      'Haryana': 'oklch(0.72 0.18 330)',
      'Assam': 'oklch(0.6 0.16 350)',
      'Jharkhand': 'oklch(0.55 0.12 10)',
      'Chhattisgarh': 'oklch(0.6 0.12 30)',
      'Uttarakhand': 'oklch(0.6 0.12 50)',
      'Himachal Pradesh': 'oklch(0.6 0.1 80)',
      'Jammu & Kashmir': 'oklch(0.55 0.12 120)',
      'Goa': 'oklch(0.65 0.1 200)',
    };
    return palette[name] || 'oklch(0.5 0.05 0)';
  }

  function renderRow(state, share, rank, max, present, posIdx) {
    const w = share == null ? 0 : (share / max) * 100;
    const c = colorForState(state);
    return `
      <div class="race-row ${present ? '' : 'absent'}" data-state="${esc(state)}" style="order:${posIdx}">
        <span class="rnk">${present ? String(rank).padStart(2, '0') : '—'}</span>
        <span class="name">${esc(state)}</span>
        <span class="bar-wrap"><span class="bar" style="width:${w.toFixed(2)}%; background:${c}"></span></span>
        <span class="val">${share == null ? '—' : share.toFixed(2) + '%'}</span>
      </div>`;
  }

  function renderRace(idx) {
    const fc = DATA.fcs[idx];
    document.getElementById('race-fc-name').textContent = fc.name;
    document.getElementById('race-fc-years').textContent = fc.years + ' · ' + fc.vertical_pool_pct + '% vertical pool';
    document.getElementById('race-fc-chair').textContent = 'Chair: ' + fc.chair;
    document.getElementById('race-fc-key').textContent = fc.key;
    document.getElementById('race-fc-idx').textContent = idx + 1;
    document.getElementById('race-pool-info').innerHTML = 'Vertical pool: <strong>' + fc.vertical_pool_pct + '%</strong>';

    // Update strip
    const strip = document.getElementById('race-fc-strip');
    if (!strip.children.length) {
      strip.innerHTML = DATA.fcs.map((f, i) =>
        `<div class="race-fc-tick" data-idx="${i}" title="${esc(f.name)} · ${esc(f.years)}"></div>`
      ).join('');
      strip.querySelectorAll('.race-fc-tick').forEach(t => {
        t.addEventListener('click', () => {
          stop();
          currentIdx = parseInt(t.dataset.idx, 10);
          document.getElementById('race-fc-slider').value = currentIdx;
          renderRace(currentIdx);
        });
      });
    }
    strip.querySelectorAll('.race-fc-tick').forEach((t, i) => t.classList.toggle('active', i === idx));

    // Compute rows: present-states ranked + absent states at bottom
    const allStates = Object.keys(DATA.shares);
    const present = [], absent = [];
    for (const st of allStates) {
      const share = DATA.shares[st][idx];
      if (share == null || share === 0) absent.push({ state: st, share: share == null ? null : share, present: false });
      else present.push({ state: st, share: share, present: true });
    }
    present.sort((a, b) => b.share - a.share);
    absent.sort((a, b) => a.state.localeCompare(b.state));

    const max = present.length ? present[0].share : 1;
    const list = document.getElementById('race-list');
    list.innerHTML =
      present.map((p, i) => renderRow(p.state, p.share, i + 1, max, true, i)).join('') +
      absent.map((p, i) => renderRow(p.state, p.share, 0, max, false, present.length + i)).join('');
  }

  function play() {
    timer = setInterval(() => {
      currentIdx++;
      if (currentIdx >= DATA.fcs.length) { stop(); currentIdx = DATA.fcs.length - 1; return; }
      document.getElementById('race-fc-slider').value = currentIdx;
      renderRace(currentIdx);
    }, FRAME_MS);
    document.getElementById('race-play').textContent = '⏸';
    document.getElementById('race-play').title = 'Pause';
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    document.getElementById('race-play').textContent = '▶';
    document.getElementById('race-play').title = 'Play';
  }
  function togglePlay() {
    if (timer) stop();
    else {
      if (currentIdx >= DATA.fcs.length - 1) currentIdx = 0; // restart from beginning
      play();
    }
  }

  function renderTimeline() {
    const wrap = document.getElementById('timeline');
    const eras = DATA.land_revenue_history;
    wrap.innerHTML = eras.map(era => {
      let body = '';
      if (era.system) body += `<p class="system">${esc(era.system)}</p>`;
      if (era.systems) {
        body += `<div class="systems-list">${era.systems.map(s =>
          `<div class="item"><div class="n">${esc(s.name)}</div><div class="w">${esc(s.where)}</div><div class="b">${esc(s.what)}</div></div>`
        ).join('')}</div>`;
      }
      if (era.data_point) body += `<div class="data-point">${esc(era.data_point)}</div>`;
      if (era.note) body += `<p class="system" style="color:var(--muted-foreground);font-size:12px">${esc(era.note)}</p>`;
      if (era.key_facts) body += `<ul>${era.key_facts.map(k => `<li>${esc(k)}</li>`).join('')}</ul>`;
      if (era.headline_numbers) body += `<div class="headline">${esc(era.headline_numbers)}</div>`;
      if (era.source) body += `<div class="source">Source: ${esc(era.source)}</div>`;
      return `<div class="era"><h3>${esc(era.era)}</h3>${body}</div>`;
    }).join('');
  }

  async function bootstrap() {
    try {
      const res = await fetch('fc-history.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      DATA = await res.json();
      currentIdx = DATA.fcs.length - 1;
      const slider = document.getElementById('race-fc-slider');
      slider.max = DATA.fcs.length - 1;
      slider.value = currentIdx;
      slider.addEventListener('input', e => {
        stop();
        currentIdx = parseInt(e.target.value, 10);
        renderRace(currentIdx);
      });
      document.getElementById('race-play').addEventListener('click', togglePlay);
      renderRace(currentIdx);
      renderTimeline();
    } catch (err) {
      console.error('History bootstrap failed:', err);
      document.body.innerHTML += `<div style="padding:2rem;color:oklch(0.7 0.18 30);font-family:var(--font-mono)">Bootstrap failed: ${esc(err.message)}</div>`;
    }
  }
  bootstrap();
})();
