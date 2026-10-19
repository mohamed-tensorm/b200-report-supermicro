/* B200 burn-in report — plain JS, no dependencies.
   Reads window.REPORT_DATA (data.js) and renders tables + SVG charts. */
(function () {
  'use strict';
  const D = window.REPORT_DATA;
  const PEERS = ['0', '1', '2', '3', '5', '6', '7'];
  const ALL = ['0', '1', '2', '3', '4', '5', '6', '7'];
  const $ = (s, el) => (el || document).querySelector(s);
  const el = (tag, attrs, children) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') n.className = attrs[k]; else if (k === 'html') n.innerHTML = attrs[k]; else n.setAttribute(k, attrs[k]); }
    (children || []).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };
  const fmt = (v, d) => (v == null || isNaN(v)) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d });
  const median = a => { const s = a.filter(x => x != null).slice().sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------------- password gate ---------------- */
  const PASS = 'Super123';
  const KEY = 'b200-report-unlocked';
  const gate = $('#gate'), report = $('#report');
  function unlock() { gate.classList.add('hidden'); report.classList.remove('hidden'); try { sessionStorage.setItem(KEY, '1'); } catch (e) {} render(); }
  function lock() { try { sessionStorage.removeItem(KEY); } catch (e) {} report.classList.add('hidden'); gate.classList.remove('hidden'); $('#pw').value = ''; $('#gate-err').textContent = ''; setTimeout(() => $('#pw').focus(), 50); }
  $('#gate-form').addEventListener('submit', e => {
    e.preventDefault();
    if ($('#pw').value === PASS) unlock();
    else { $('#gate-err').textContent = 'Incorrect password.'; $('#pw').select(); }
  });
  $('#btn-lock').addEventListener('click', lock);
  $('#btn-pdf').addEventListener('click', () => {
    document.querySelectorAll('details').forEach(d => { d.dataset.wasOpen = d.open ? '1' : ''; d.open = true; });
    setTimeout(() => window.print(), 50);
  });
  window.addEventListener('afterprint', () => { document.querySelectorAll('details').forEach(d => { if (d.dataset.wasOpen === '') d.open = false; }); });
  window.addEventListener('beforeprint', () => { document.querySelectorAll('details').forEach(d => { d.open = true; }); });

  let rendered = false;

  /* ---------------- TOC highlighting ---------------- */
  function initToc() {
    const links = Array.from(document.querySelectorAll('nav.toc a'));
    const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id)); } });
    }, { rootMargin: '-20% 0px -70% 0px' });
    secs.forEach(s => io.observe(s));
  }

  /* ---------------- tooltip ---------------- */
  const tip = $('#tooltip');
  function showTip(html, x, y) { tip.innerHTML = html; tip.style.display = 'block'; const r = tip.getBoundingClientRect(); let left = x + 14, top = y + 14; if (left + r.width > window.innerWidth - 8) left = x - r.width - 14; if (top + r.height > window.innerHeight - 8) top = y - r.height - 14; tip.style.left = (left + window.scrollX) + 'px'; tip.style.top = (top + window.scrollY) + 'px'; }
  function hideTip() { tip.style.display = 'none'; }

  /* ---------------- SVG helpers ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; };
  function niceTicks(min, max, n) { const span = max - min || 1; const step0 = span / (n || 5); const mag = Math.pow(10, Math.floor(Math.log10(step0))); const norm = step0 / mag; const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag; const t = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) t.push(+v.toFixed(10)); return t; }
  const hhmm = (t0, sec) => { const d = new Date(t0.replace(' ', 'T') + 'Z'); d.setSeconds(d.getSeconds() + sec); return d.toISOString().substr(11, 5); };
  const hhmmss = (t0, sec) => { const d = new Date(t0.replace(' ', 'T') + 'Z'); d.setSeconds(d.getSeconds() + sec); return d.toISOString().substr(11, 8); };

  /* Generic multi-series line chart with optional band, phase bands and markers.
     series: [{name, values:[y|null], color, width, dash, label:true}] all sharing xs (seconds).
     band: {lo:[], hi:[], color}  */
  function lineChart(container, opts) {
    const W = 900, H = opts.height || 240, m = { l: 52, r: 16, t: opts.phases ? 26 : 10, b: 30 };
    const wrap = el('div', { class: 'chart' + (opts.cls ? ' ' + opts.cls : '') });
    if (opts.id) wrap.id = opts.id;
    if (opts.title) wrap.appendChild(el('h4', { html: opts.title }));
    if (opts.sub) wrap.appendChild(el('div', { class: 'sub', html: opts.sub }));
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title || 'chart' });
    const xs = opts.xs; const xmin = opts.xmin != null ? opts.xmin : xs[0], xmax = opts.xmax != null ? opts.xmax : xs[xs.length - 1];
    let ymin = Infinity, ymax = -Infinity;
    const allY = [];
    opts.series.forEach(s => s.values.forEach(v => { if (v != null) allY.push(v); }));
    if (opts.band) { opts.band.lo.forEach(v => { if (v != null) allY.push(v); }); opts.band.hi.forEach(v => { if (v != null) allY.push(v); }); }
    allY.forEach(v => { if (v < ymin) ymin = v; if (v > ymax) ymax = v; });
    if (opts.ymin != null) ymin = opts.ymin; if (opts.ymax != null) ymax = opts.ymax;
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const pad = (ymax - ymin) * 0.06; if (opts.ymin == null) ymin -= pad; if (opts.ymax == null) ymax += pad;
    const X = x => m.l + (x - xmin) / (xmax - xmin) * (W - m.l - m.r);
    const Y = y => H - m.b - (y - ymin) / (ymax - ymin) * (H - m.t - m.b);
    // phase bands
    if (opts.phases) {
      opts.phases.forEach((p, i) => {
        if (p.end <= xmin || p.start >= xmax) return;
        const x1 = X(Math.max(p.start, xmin)), x2 = X(Math.min(p.end, xmax));
        if (i % 2 === 0) svg.appendChild(svgEl('rect', { class: 'phase-band', x: x1, y: m.t, width: Math.max(0, x2 - x1), height: H - m.t - m.b }));
        if (x2 - x1 > 22 && p.short) svg.appendChild(svgEl('text', { class: 'phase-label', x: x1 + 3, y: m.t - 6 }, p.short));
      });
    }
    // grid + y axis
    const yt = niceTicks(ymin, ymax, 5);
    const g = svgEl('g', { class: 'grid' }); const ax = svgEl('g', { class: 'axis' });
    yt.forEach(v => { g.appendChild(svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) })); ax.appendChild(svgEl('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v))); });
    // x axis
    const xt = niceTicks(xmin, xmax, 8);
    xt.forEach(v => { if (v < xmin || v > xmax) return; ax.appendChild(svgEl('text', { x: X(v), y: H - m.b + 16, 'text-anchor': 'middle' }, opts.xfmt ? opts.xfmt(v) : fmt(v))); ax.appendChild(svgEl('line', { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 4 })); });
    ax.appendChild(svgEl('path', { d: `M${m.l},${H - m.b}H${W - m.r}`, fill: 'none' }));
    svg.appendChild(g); svg.appendChild(ax);
    if (opts.ylabel) svg.appendChild(svgEl('text', { class: 'lbl', x: m.l - 6, y: m.t - 8, 'text-anchor': 'end' }, opts.ylabel));
    if (opts.xlabel) svg.appendChild(svgEl('text', { class: 'lbl', x: W - m.r, y: H - 4, 'text-anchor': 'end' }, opts.xlabel));
    // band
    if (opts.band) {
      let dUp = '', dDown = '';
      const pts = [];
      xs.forEach((x, i) => { if (opts.band.lo[i] != null && opts.band.hi[i] != null && x >= xmin && x <= xmax) pts.push([X(x), Y(opts.band.lo[i]), Y(opts.band.hi[i])]); });
      if (pts.length) { dUp = 'M' + pts.map(p => `${p[0].toFixed(1)},${p[2].toFixed(1)}`).join('L'); dDown = pts.slice().reverse().map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(''); svg.appendChild(svgEl('path', { d: dUp + dDown + 'Z', fill: opts.band.color, opacity: 0.22 })); }
    }
    // series
    opts.series.forEach(s => {
      let d = '', pen = false;
      xs.forEach((x, i) => { const v = s.values[i]; if (v == null || x < xmin || x > xmax) { pen = false; return; } d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; });
      svg.appendChild(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (s.label) { let li = -1; for (let i = xs.length - 1; i >= 0; i--) if (s.values[i] != null && xs[i] <= xmax) { li = i; break; } if (li >= 0) svg.appendChild(svgEl('text', { class: 'lbl strong', x: Math.min(X(xs[li]) + 5, W - 4), y: Y(s.values[li]) + 4, 'text-anchor': X(xs[li]) > W - 70 ? 'end' : 'start', fill: s.color, dy: X(xs[li]) > W - 70 ? -8 : 0 }, s.name)); }
    });
    // markers
    (opts.markers || []).forEach(mk => { if (mk.x < xmin || mk.x > xmax) return; svg.appendChild(svgEl('line', { class: 'marker', x1: X(mk.x), x2: X(mk.x), y1: m.t, y2: H - m.b })); svg.appendChild(svgEl('text', { class: 'marker-label', x: X(mk.x) + (mk.anchor === 'end' ? -5 : 5), y: m.t + 12, 'text-anchor': mk.anchor || 'start' }, mk.label)); });
    // hover
    const hl = svgEl('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, stroke: css('--text-3'), 'stroke-width': 1, opacity: 0 });
    svg.appendChild(hl);
    const hit = svgEl('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
    svg.appendChild(hit);
    hit.addEventListener('mousemove', ev => {
      const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) / r.width * W; const xv = xmin + (px - m.l) / (W - m.l - m.r) * (xmax - xmin);
      let bi = 0, bd = Infinity; xs.forEach((x, i) => { const d = Math.abs(x - xv); if (d < bd) { bd = d; bi = i; } });
      hl.setAttribute('x1', X(xs[bi])); hl.setAttribute('x2', X(xs[bi])); hl.setAttribute('opacity', 1);
      let html = `<b>${opts.xfmt ? opts.xfmt(xs[bi]) : fmt(xs[bi])}</b>`;
      if (opts.band) html += `<br>peers: ${fmt(opts.band.lo[bi], opts.dec)}–${fmt(opts.band.hi[bi], opts.dec)}`;
      opts.series.forEach(s => { html += `<br>${s.name}: ${s.values[bi] == null ? '—' : fmt(s.values[bi], opts.dec)}${opts.unit ? ' ' + opts.unit : ''}`; });
      showTip(html, ev.clientX, ev.clientY);
    });
    hit.addEventListener('mouseleave', () => { hl.setAttribute('opacity', 0); hideTip(); });
    wrap.appendChild(svg);
    if (opts.legend) wrap.appendChild(el('div', { class: 'legend', html: opts.legend }));
    if (opts.read) wrap.appendChild(el('div', { class: 'read', html: opts.read }));
    container.appendChild(wrap);
    return wrap;
  }

  /* Horizontal bar chart per GPU; GPU 4 highlighted. items: [{label, value, gpu4, note}] */
  function barChart(container, opts) {
    const W = 900, rowH = 26, m = { l: 70, r: 90, t: 8, b: 26 };
    const H = m.t + m.b + rowH * opts.items.length;
    const wrap = el('div', { class: 'chart' }); if (opts.id) wrap.id = opts.id;
    if (opts.title) wrap.appendChild(el('h4', { html: opts.title }));
    if (opts.sub) wrap.appendChild(el('div', { class: 'sub', html: opts.sub }));
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title || 'bar chart' });
    const max = opts.max || Math.max(...opts.items.map(i => i.value || 0)) * 1.02;
    const X = v => m.l + (v / max) * (W - m.l - m.r);
    const ax = svgEl('g', { class: 'axis' }); const g = svgEl('g', { class: 'grid' });
    niceTicks(0, max, 6).forEach(v => { g.appendChild(svgEl('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b })); ax.appendChild(svgEl('text', { x: X(v), y: H - m.b + 15, 'text-anchor': 'middle' }, fmt(v))); });
    svg.appendChild(g); svg.appendChild(ax);
    if (opts.xlabel) svg.appendChild(svgEl('text', { class: 'lbl', x: W - 4, y: H - m.b + 15, 'text-anchor': 'end' }, opts.xlabel));
    opts.items.forEach((it, i) => {
      const y = m.t + i * rowH + 4, h = rowH - 8;
      const color = it.gpu4 ? css('--gpu4') : css('--peer');
      svg.appendChild(svgEl('text', { class: 'lbl' + (it.gpu4 ? ' strong' : ''), x: m.l - 8, y: y + h / 2 + 4, 'text-anchor': 'end' }, it.label));
      if (it.value == null) { svg.appendChild(svgEl('text', { class: 'val', x: m.l + 4, y: y + h / 2 + 4 }, it.note || 'no data')); return; }
      const w = Math.max(2, X(it.value) - m.l);
      const r = svgEl('rect', { x: m.l, y, width: w, height: h, fill: color, rx: 3 });
      svg.appendChild(r);
      svg.appendChild(svgEl('text', { class: 'val', x: X(it.value) + 6, y: y + h / 2 + 4 }, fmt(it.value, opts.dec) + (it.note ? ' ' + it.note : '')));
      r.addEventListener('mousemove', ev => showTip(`<b>${it.label}</b><br>${fmt(it.value, opts.dec)} ${opts.unit || ''}${it.tip ? '<br>' + it.tip : ''}`, ev.clientX, ev.clientY));
      r.addEventListener('mouseleave', hideTip);
    });
    wrap.appendChild(svg);
    if (opts.legend) wrap.appendChild(el('div', { class: 'legend', html: opts.legend }));
    if (opts.read) wrap.appendChild(el('div', { class: 'read', html: opts.read }));
    container.appendChild(wrap);
  }

  function table(container, head, rows, opts) {
    const t = el('table');
    const thead = el('thead'); const tr = el('tr'); head.forEach((h, i) => tr.appendChild(el('th', { class: (opts && opts.num && opts.num.includes(i)) ? 'num' : '', html: h }))); thead.appendChild(tr); t.appendChild(thead);
    const tb = el('tbody');
    rows.forEach(r => { const tr = el('tr', { class: r.gpu4 ? 'gpu4' : '' }); r.cells.forEach((c, i) => { const td = el('td', { class: (opts && opts.num && opts.num.includes(i)) ? 'num' : '' }); if (typeof c === 'string') td.innerHTML = c; else td.appendChild(c); tr.appendChild(td); }); tb.appendChild(tr); });
    t.appendChild(tb);
    if (opts && opts.caption) container.appendChild(el('h4', { html: opts.caption }));
    container.appendChild(t);
  }

  const peerStats = (vals) => { const v = vals.filter(x => x != null); return { min: Math.min(...v), max: Math.max(...v), med: median(v), mean: v.reduce((a, b) => a + b, 0) / v.length }; };
  const xsOf = (run, key) => { const n = Math.max(...ALL.map(g => run.gpus[g][key].length)); return Array.from({ length: n }, (_, i) => i * run.step); };
  function bandOf(run, key, n) { const lo = [], hi = [], med = []; for (let i = 0; i < n; i++) { const v = PEERS.map(g => run.gpus[g][key][i]).filter(x => x != null); if (!v.length) { lo.push(null); hi.push(null); med.push(null); } else { lo.push(Math.min(...v)); hi.push(Math.max(...v)); med.push(median(v)); } } return { lo, hi, med }; }
  const SHORT = { '0': 'Idle', '1': 'Warm-up GEMM', '2': '1A GEMM (sequential)', '3': '1B HBM', '4': '1C', '5': 'Cooldown 1', '6': '2A', '7': '2B', '8': '2C', '9': '2D', '10': '2E', '11': 'Cooldown 2', '12': '3A', '13': '3B', '14': 'NVLink', '15': 'Final idle' };

  /* ---------------- render ---------------- */
  function render() {
    if (rendered) return; rendered = true;
    initToc();
    renderCoverage();
    renderIdle();
    renderGemm();
    renderR4Timeline();
    renderR1Timeline();
    renderPeerCompare();
    renderPhaseCards();
    renderAppendixTables();
    renderCooldown();
    renderBmc();
  }

  /* --- coverage matrix --- */
  function renderCoverage() {
    const c = $('#coverage-matrix'); const wrap = el('div', { class: 'tbl-wrap' });
    const runs = [['R1', 'r1'], ['R2', 'r2'], ['R3', 'r3'], ['R4', 'r4']];
    const ids = Object.keys(SHORT);
    const rows = ids.map(id => {
      const cells = [`<span class="mono">${id}</span> ${D.runs.r4.phases.find(p => p.id === id).label}`];
      runs.forEach(([lab, rk]) => {
        const p = D.runs[rk].phases.find(q => q.id === id);
        let s = '–', title = p.status;
        if (p.status === 'completed') s = p.kind === 'idle' ? `● <small>${p.dur}s</small>` : `● <small>${fmt(p.dur)}s</small>`;
        else if (p.status === 'failed') s = (rk === 'r4' && id === '3') ? '◐ <small>914s, 7 GPUs</small>' : '✕ <small>no CUDA</small>';
        if (p.status === 'skipped') s = '–';
        cells.push(`<span title="${title}">${s}</span>`);
      });
      return { cells };
    });
    table(wrap, ['Phase', 'R1 (1C only)', 'R2 (1C, 7 GPUs)', 'R3 (2A, 7 GPUs)', 'R4 (full profile)'], rows);
    c.appendChild(wrap);
  }

  /* --- idle chart + table --- */
  function renderIdle() {
    const r4 = D.runs.r4.phase_summary.find(p => p.id === '0');
    const items = ALL.map(g => ({ label: 'GPU ' + g, value: r4.gpus[g].t_mean, gpu4: g === '4', tip: `${fmt(r4.gpus[g].p_mean)} W · ${r4.gpus[g].c_mean} MHz · util ${r4.gpus[g].u_mean}%` }));
    barChart($('#idle-chart'), {
      id: 'idle-chart-svg', title: 'Idle junction temperature by GPU — run 4 idle baseline (120 s, 0 % utilization, 120 MHz)', sub: 'Inlet 34 °C, system fans ~11.7 k RPM, no processes. Mean over the window.', unit: '°C', dec: 1, xlabel: '°C', max: 100,
      items,
      legend: '<span><i style="background:var(--peer)"></i>GPUs 0–3, 5–7</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>',
      read: '<b>Reading.</b> Seven GPUs idle at 38.7–41.6 °C. GPU 4 idles at 77.1 °C — 36 °C above the hottest peer — drawing 231 W against 192–204 W. The same picture appears in every other capture (table below).'
    });
    // table
    const idleRuns = [['Provisioning<br><small>~14:20 Oct 8</small>', null], ['R1<br><small>19:29 Oct 8</small>', 'r1'], ['R2<br><small>02:50 Oct 9</small>', 'r2'], ['R3<br><small>03:47 Oct 9</small>', 'r3'], ['R4<br><small>04:54 Oct 9</small>', 'r4']];
    const prov = { '0': [33, 198], '1': [35, 191], '2': [37, 192], '3': [34, 190], '4': [71, 220], '5': [38, 195], '6': [38, 188], '7': [36, 194] };
    const hbm = { r1: { '0': 36, '1': 38, '2': 39, '3': 36, '4': 72, '5': 40, '6': 40, '7': 37 }, r4: { '0': 38, '1': 40, '2': 41, '3': 38, '4': 73, '5': 41, '6': 41, '7': 38 } };
    const tlim = { r1: { '0': 51, '1': 48, '2': 48, '3': 50, '4': 12, '5': 47, '6': 48, '7': 50 }, r4: { '0': 49, '1': 47, '2': 47, '3': 49, '4': 11, '5': 47, '6': 47, '7': 49 } };
    const head = ['GPU'].concat(idleRuns.map(r => r[0] + ' °C / W')).concat(['HBM °C (R1 / R4)', 'T.Limit margin °C (R1 / R4)']);
    const rows = ALL.map(g => {
      const cells = ['GPU ' + g + (g === '4' ? ' <small>(97:00)</small>' : '')];
      idleRuns.forEach(([lab, rk]) => { if (!rk) cells.push(`${prov[g][0]} / ${prov[g][1]}`); else { const s = D.runs[rk].phase_summary.find(p => p.id === '0').gpus[g]; cells.push(`${fmt(s.t_mean, 1)} / ${fmt(s.p_mean)}`); } });
      cells.push(`${hbm.r1[g]} / ${hbm.r4[g]}`); cells.push(`${tlim.r1[g]} / ${tlim.r4[g]}`);
      return { cells, gpu4: g === '4' };
    });
    table($('#tbl-idle'), head, rows, { num: [1, 2, 3, 4, 5, 6, 7], caption: 'Idle state per GPU across all captures' });
  }

  /* --- GEMM --- */
  function renderGemm() {
    const w = D.gemm.warmup, b = D.gemm.baseline;
    const sustained = (arr) => { const v = arr.map(p => p[1]); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
    const items = ALL.map(g => ({ label: 'GPU ' + g, value: sustained(b[g] || []), gpu4: g === '4', note: g === '4' ? '(8 iterations, 860 s slot)' : '', tip: `warm-up: ${fmt(sustained(w[g] || []), 1)} TFLOPS` }));
    barChart($('#gemm-chart'), {
      id: 'gemm-chart-svg', title: '1A GEMM compute baseline — mean sustained FP16 TFLOPS per GPU (run 4, sequential, 240 s each)', sub: 'Batched FP16 GEMM, 4 × 65536², 2.25 PFLOP per iteration. Hover for the warm-up phase result (same kernel, 180 s, all GPUs concurrent).', unit: 'TFLOPS', dec: 0, xlabel: 'TFLOPS', max: 1300, items,
      legend: '<span><i style="background:var(--peer)"></i>GPUs 0–3, 5–7</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>',
      read: '<b>Reading.</b> Peers 1,177–1,224 TFLOPS mean (metadata “sustained” 1,176.7–1,228.8), spread ±2.2 %; all at the 1,000 W power cap. GPU 4: 72.9 TFLOPS mean — 6 % of peers — at 120 MHz, 91.8 °C, 301 W. Each peer repeated its warm-up figure within 0.8 %.'
    });
  }

  /* --- R4 timeline --- */
  function renderR4Timeline() {
    const run = D.runs.r4; const c = $('#r4-timeline');
    const xs = xsOf(run, 'temp'); const n = xs.length;
    const phases = run.phases.filter(p => p.end - p.start > 2).map(p => ({ start: p.start, end: p.end, short: SHORT[p.id] }));
    const drop = run.gpus['4'].last;
    const xfmt = v => hhmm(run.t0, v);
    const xmin = run.phases.find(p => p.id === '0').start - 30;
    const mk = [{ x: drop, label: 'GPU 4 off bus 06:01:44', anchor: 'end' }];
    c.appendChild(el('h3', { html: 'Full assessment (run 4): GPU 4 against the peer band' }));
    c.appendChild(el('p', { class: 'small', html: 'Shaded band = min–max of GPUs 0–3, 5–7 at each 5 s step; blue line = peer median; red line = GPU 4. Alternating grey columns mark phases. Phases after the failure are compressed because each lasted 3–5 s before failing; the two 120 s cooldowns and the final idle show the peers only. Hover for values.' }));
    const bt = bandOf(run, 'temp', n), bc = bandOf(run, 'clk', n), bp = bandOf(run, 'pwr', n);
    lineChart(c, { id: 'r4-temp', title: 'Junction temperature (°C)', xs, xmin, xmax: xs[n - 1], phases, markers: mk, xfmt, unit: '°C', ymin: 30, ymax: 100,
      band: { lo: bt.lo, hi: bt.hi, color: css('--band') }, series: [{ name: 'peer median', values: bt.med, color: css('--peer'), width: 1.5 }, { name: 'GPU 4', values: run.gpus['4'].temp, color: css('--gpu4'), width: 2.2, label: true }],
      legend: '<span><i class="band" style="background:var(--band)"></i>peers min–max</span><span><i style="background:var(--peer)"></i>peer median</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>',
      read: '<b>Reading.</b> GPU 4 starts the idle window at 77 °C (peers 38–42), jumps to 89 °C within 2 s of the warm-up GEMM, sits at 91–94 °C through its own 1A slot (05:30–05:44) and climbs 87 → 96 °C in 1B before vanishing. Peers peak 63–75 °C during the concurrent GEMM and 55–66 °C in 1B, and return to 38–41 °C within a minute of load removal.' });
    lineChart(c, { id: 'r4-clk', title: 'Graphics clock (MHz)', xs, xmin, xmax: xs[n - 1], phases, markers: mk, xfmt, unit: 'MHz', ymin: 0, ymax: 2100,
      band: { lo: bc.lo, hi: bc.hi, color: css('--band') }, series: [{ name: 'peer median', values: bc.med, color: css('--peer'), width: 1.5 }, { name: 'GPU 4', values: run.gpus['4'].clk, color: css('--gpu4'), width: 2.2, label: true }],
      legend: '<span><i class="band" style="background:var(--band)"></i>peers min–max</span><span><i style="background:var(--peer)"></i>peer median</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>',
      read: '<b>Reading.</b> All GPUs idle at 120 MHz. Under GEMM the peers settle at ~1,000 MHz because the 1,000 W power limit, not temperature, bounds them; in 1B they run at 1,949 MHz. GPU 4 touches 855–1,320 MHz only for a few seconds at each load start, then is clamped to 120 MHz by hardware thermal slowdown for the entire loaded period. The band is wide during 1A because only one peer is loaded at a time.' });
    lineChart(c, { id: 'r4-pwr', title: 'Board power (W)', xs, xmin, xmax: xs[n - 1], phases, markers: mk, xfmt, unit: 'W', ymin: 0, ymax: 1300,
      band: { lo: bp.lo, hi: bp.hi, color: css('--band') }, series: [{ name: 'peer median', values: bp.med, color: css('--peer'), width: 1.5 }, { name: 'GPU 4', values: run.gpus['4'].pwr, color: css('--gpu4'), width: 2.2, label: true }],
      legend: '<span><i class="band" style="background:var(--band)"></i>peers min–max</span><span><i style="background:var(--peer)"></i>peer median</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>',
      read: '<b>Reading.</b> Loaded peers draw ~995 W (limit 1,000 W; single samples up to 1,324 W). GPU 4 draws 231 W idle — 30–40 W above peers — and only 290–345 W under load because it is running at 1/16th of the clock. The power limit never engaged on GPU 4.' });
  }

  /* --- R1 timeline (1C) --- */
  function renderR1Timeline() {
    const run = D.runs.r1; const c = $('#r1-timeline');
    const xs = xsOf(run, 'temp'); const n = xs.length;
    const ph = run.phases.find(p => p.id === '4');
    const xfmt = v => hhmm(run.t0, v);
    c.appendChild(el('h3', { html: 'Run 1 (1C LLM inference, 8 GPUs): the only loaded exposure of GPU 4 inside an integrated workload' }));
    const bt = bandOf(run, 'temp', n), bc = bandOf(run, 'clk', n);
    lineChart(c, { id: 'r1-temp', title: 'Junction temperature (°C) — run 1', xs, xmin: 0, xmax: xs[n - 1], phases: [{ start: ph.start, end: ph.end, short: '1C LLM inference (vLLM, Llama-3-8B INT8)' }], xfmt, unit: '°C', ymin: 30, ymax: 100, height: 200,
      band: { lo: bt.lo, hi: bt.hi, color: css('--band') }, series: [{ name: 'peer median', values: bt.med, color: css('--peer'), width: 1.5 }, { name: 'GPU 4', values: run.gpus['4'].temp, color: css('--gpu4'), width: 2.2, label: true }],
      legend: '<span><i class="band" style="background:var(--band)"></i>peers min–max</span><span><i style="background:var(--peer)"></i>peer median</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>' });
    lineChart(c, { id: 'r1-clk', title: 'Graphics clock (MHz) — run 1', xs, xmin: 0, xmax: xs[n - 1], phases: [{ start: ph.start, end: ph.end, short: '1C' }], xfmt, unit: 'MHz', ymin: 0, ymax: 2100, height: 200,
      band: { lo: bc.lo, hi: bc.hi, color: css('--band') }, series: [{ name: 'peer median', values: bc.med, color: css('--peer'), width: 1.5 }, { name: 'GPU 4', values: run.gpus['4'].clk, color: css('--gpu4'), width: 2.2, label: true }],
      legend: '<span><i class="band" style="background:var(--band)"></i>peers min–max</span><span><i style="background:var(--peer)"></i>peer median</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>' });
    // throughput
    const tp = D.tp.r1_1c; const m = Math.max(...ALL.map(g => tp[g].length)); const txs = Array.from({ length: m }, (_, i) => i);
    const lo = [], hi = [], med = []; for (let i = 0; i < m; i++) { const v = PEERS.map(g => tp[g][i]).filter(x => x != null); lo.push(v.length ? Math.min(...v) : null); hi.push(v.length ? Math.max(...v) : null); med.push(v.length ? median(v) : null); }
    lineChart(c, { id: 'r1-tp', title: 'Tokens per second per GPU — run 1 1C (per-second samples, 420 s including 60 s ramp)', xs: txs, xmin: 0, xmax: m - 1, xfmt: v => v + ' s', unit: 'tok/s', ymin: 0, height: 220,
      band: { lo, hi, color: css('--band') }, series: [{ name: 'peer median', values: med, color: css('--peer'), width: 1.5 }, { name: 'GPU 4', values: tp['4'], color: css('--gpu4'), width: 2.2, label: true }],
      legend: '<span><i class="band" style="background:var(--band)"></i>peers min–max</span><span><i style="background:var(--peer)"></i>peer median</span><span><i style="background:var(--gpu4)"></i>GPU 4</span>',
      read: '<b>Reading.</b> Peers deliver ~16,000 tok/s each with the bursty per-second pattern of continuous batching (vLLM reports tokens as batches complete). GPU 4 delivers 971 tok/s mean, completing 1,024 prompts in the scored window against ~7,160 for each peer; its TTFT p50 is 47 s versus 0.7–0.8 s. Its outputs were verified correct by the SDC probe. Clock and temperature show why: 177 MHz mean at 90 °C with hardware thermal slowdown.' });
  }

  /* --- peer compare table --- */
  function renderPeerCompare() {
    const r4 = D.runs.r4.phase_summary; const r1 = D.runs.r1.phase_summary;
    const pk = (sum, id) => sum.find(p => p.id === id).gpus;
    const idle = pk(r4, '0'), warm = pk(r4, '1'), oneA = pk(r4, '2'), oneB = pk(r4, '3'), c1 = pk(r1, '4');
    const sus = g => { const v = (D.gemm.baseline[g] || []).map(p => p[1]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const prange = (obj, k, d) => { const v = PEERS.map(g => obj[g] && obj[g][k]).filter(x => x != null); return `${fmt(Math.min(...v), d)}–${fmt(Math.max(...v), d)}`; };
    const pp = D.pp.r1_1c;
    const rows = [
      ['Idle temperature, R4 (°C)', `${fmt(idle['4'].t_mean, 1)}`, prange(idle, 't_mean', 1)],
      ['Idle power, R4 (W)', fmt(idle['4'].p_mean), prange(idle, 'p_mean')],
      ['Warm-up GEMM, peak temp (°C)', fmt(warm['4'].t_max), prange(warm, 't_max')],
      ['Warm-up GEMM, mean clock (MHz)', fmt(warm['4'].c_mean), prange(warm, 'c_mean')],
      ['Warm-up GEMM sustained TFLOPS', '66.4', '1,174.3–1,222.3'],
      ['1A GEMM sustained TFLOPS (own slot)', fmt(sus('4'), 1), `${fmt(Math.min(...PEERS.map(sus)), 1)}–${fmt(Math.max(...PEERS.map(sus)), 1)}`],
      ['1A slot duration (s)', '860', '278–280'],
      ['1B peak temp (°C) / mean memory-controller util (%)', `${fmt(oneB['4'].t_max)} / 4`, `${prange(oneB, 't_max')} / 98`],
      ['1B mean clock (MHz)', fmt(oneB['4'].c_mean), prange(oneB, 'c_mean')],
      ['1C tokens/s mean, R1', '971', '15,748–16,304'],
      ['1C TTFT p50 (ms), R1', fmt(pp['4'].ttft_p50), `${fmt(Math.min(...PEERS.map(g => pp[g].ttft_p50)))}–${fmt(Math.max(...PEERS.map(g => pp[g].ttft_p50)))}`],
      ['1C ITL p99 median (ms), R1', fmt(pp['4'].itl99_p50), `${fmt(Math.min(...PEERS.map(g => pp[g].itl99_p50)))}–${fmt(Math.max(...PEERS.map(g => pp[g].itl99_p50)))}`],
      ['1C peak temp (°C) / mean clock (MHz), R1', `${fmt(c1['4'].t_max)} / ${fmt(c1['4'].c_mean)}`, `${prange(c1, 't_max')} / ${prange(c1, 'c_mean')}`],
      ['Throttle reasons seen under load', '32, 104 (SW thermal; HW slowdown + HW thermal + SW thermal)', '4 (SW power cap) only'],
      ['Cumulative thermal slowdown at 04:35 (SW / HW, s)', '40,116 / 1,096', '0 / 0'],
      ['ECC correctable / uncorrectable, remapped rows', '0 / 0, 0', '0 / 0, 0'],
      ['SDC probe (R1)', 'agree, 100 %', 'agree, 100 %'],
    ];
    table($('#tbl-peer-compare'), ['Measurement', 'GPU 4', 'Peers (range, GPUs 0–3, 5–7)'], rows.map(r => ({ cells: r })), { caption: 'GPU 4 versus peers on comparable measurements' });
  }

  /* --- phase cards --- */
  function renderPhaseCards() {
    const c = $('#phase-cards');
    const r4 = D.runs.r4;
    const sumTable = (runKey, phaseId, caption) => {
      const ps = D.runs[runKey].phase_summary.find(p => p.id === phaseId); if (!ps) return null;
      const wrap = el('div', { class: 'tbl-wrap' });
      const rows = ALL.map(g => { const s = ps.gpus[g]; if (!s) return { cells: ['GPU ' + g, '<span class="dim">no telemetry (off bus)</span>', '', '', '', '', '', ''], gpu4: g === '4' }; return { cells: ['GPU ' + g, `${fmt(s.t_mean, 1)} / ${fmt(s.t_max)}`, `${fmt(s.p_mean)} / ${fmt(s.p_max)}`, `${fmt(s.c_mean)} / ${fmt(s.c_min)}–${fmt(s.c_max)}`, fmt(s.u_mean, 1), fmt(s.mem_max_gb, 1), Object.keys(s.thr).sort((a, b) => a - b).join(', ') || '–'], gpu4: g === '4' }; });
      table(wrap, ['GPU', 'Temp mean / max °C', 'Power mean / max W', 'Clock mean / range MHz', 'Util %', 'Mem used max GB', 'Throttle flags seen'], rows, { num: [1, 2, 3, 4, 5], caption });
      return wrap;
    };
    const P = [
      { id: '0', name: 'Idle Baseline', obj: 'Record the pre-assessment state of every GPU with no load: temperature, power, clocks, ECC counters. This is the anchor for the idle-to-idle comparison and the first health gate.', wl: 'None (observation). 120 s in R4; 5 s in R1–R3.', sub: 'Thermal, power, idle clocks, ECC', exp: 'All eight GPUs within a few degrees of each other near inlet + 5–10 °C, ~190–210 W, 120 MHz, ECC 0.', obs: 'Seven GPUs 38.7–41.6 °C, 192–204 W, 120 MHz, ECC 0. GPU 4: 77.1 °C, 231 W, 120 MHz, ECC 0, T.Limit margin 11 °C, HBM 73 °C. Reproduced in all four runs and the provisioning snapshot.', anom: 'GPU 4 idle anomaly (F1).', interp: 'A device 36 °C above peers at zero load should not be admitted to a stress sequence; the idle baseline alone identifies GPU 4 as unfit. Peers are normal.', ev: [['r4', '0', 'Run 4 idle baseline (120 s)'], ['r1', '0', 'Run 1 idle baseline (5 s)']] },
      { id: '1', name: 'Warm-up Tensor Compute', obj: 'Bring all GPUs to operating temperature with a known kernel; data normally discarded. Here it doubles as a concurrent-load GEMM exposure.', wl: 'FP16 batched GEMM 4 × 65536², 180 s, all 8 GPUs concurrently.', sub: 'Compute, thermal ramp, power delivery', exp: 'Peers rise to a steady temperature within ~3 min while hitting the power cap; uniform TFLOPS.', obs: 'Peers 1,174–1,222 TFLOPS sustained, 1,706–1,734 MHz mean (includes idle tail), peaks 63–75 °C, power cap flag. GPU 4: 66.4 TFLOPS from 6 iterations, 78 → 89 °C in 2 s, 120 MHz within 8 s, throttle 32 → 104, 94 °C peak.', anom: 'GPU 4 thermal clamp (F2).', interp: 'Peers show the expected B200 behaviour: power-limited, thermally comfortable. GPU 4 is thermally limited from the first second of load.', ev: [['r4', '1', 'Run 4 warm-up']] },
      { id: '2', name: '1A GEMM Compute Baseline', obj: 'The most repeatable single measurement: compute throughput per GPU in isolation, one GPU at a time so that power and thermal context are identical for each.', wl: 'Same GEMM, 240 s per GPU sequentially (20 warm-up iterations first).', sub: 'Tensor-core compute, clock stability, power delivery', exp: 'Each GPU within ~2 % of the group and within ~1 % of its own warm-up figure; stable clocks at the power limit.', obs: 'Peers 1,176.7–1,228.8 TFLOPS; each within 0.2–0.8 % of warm-up; 985–1,114 MHz at 995 W; 61–72 °C peak. GPU 2 lowest (1,176.7), GPUs 3 and 5 highest — same ordering as warm-up. GPU 4: 71.6 TFLOPS, 8 iterations, slot 860 s, 91.8 °C mean, 120 MHz.', anom: 'GPU 4 at 6 % (F2); phase wall time 2,825 s instead of ~2,250 s.', interp: 'Peer compute is healthy and repeatable; the small stable per-GPU ordering is the fingerprint for future comparison. GPU 4’s compute units are not shown to be defective — they never ran above the clamp.', ev: [['r4', '2', 'Run 4 1A (sequential; band is wide because one GPU loads at a time)']] },
      { id: '3', name: '1B Memory Bandwidth Baseline', obj: 'Isolate the HBM subsystem: streaming read, write and copy bandwidth under sustained memory-bus load, with ECC counters before and after.', wl: '32 GB buffer, read/write/copy 300 s each, all 8 GPUs concurrently.', sub: 'HBM bandwidth, memory controller, ECC, thermal under memory load', exp: 'Uniform bandwidth across GPUs; ECC delta zero; moderate temperatures.', obs: 'Six attributed results: read 6,495–6,510, write 7,566–7,569, copy 6,572–6,584 GB/s (0.2 % spread); seventh peer completed per telemetry (98 % util, 1,949 MHz, 857–892 W, 55–66 °C) but was not printed. ECC 0. GPU 4: 70.4 GB allocated, 100 % util but 4 % memory-controller utilization at 120 MHz, 87 → 96 °C, then off bus at 187 s. Phase recorded failed; result file empty.', anom: 'GPU 4 PCIe link loss (F3); Xid 154 on all GPUs (F4).', interp: 'Peer HBM is uniform with no error precursor. GPU 4 died in this phase under sustained near-limit temperature; the bandwidth kernel is not implicated as a cause.', ev: [['r4', '3', 'Run 4 1B']] },
      { id: '4', name: '1C LLM Inference', obj: 'First integrated workload: compute, HBM, attention, KV-cache and scheduler together. Should be rock-solid; any movement is real.', wl: 'vLLM Llama-3-8B GPTQ-INT8, greedy. R1: batch 1024 × 1 instance, 420 s, 8 GPUs. R2: batch 448 × 2 instances, 180 s, 7 GPUs. R4: failed to start (no CUDA devices).', sub: 'Integrated compute + memory, latency distribution, output correctness (SDC probe)', exp: 'Uniform tokens/s and latency percentiles across GPUs; SDC probe agreement.', obs: 'R1 peers 15,748–16,304 tok/s, TTFT p50 0.71–0.83 s, ITL p99 293–361 ms, 62–75 °C peak. R2 peers 15,297–15,427 tok/s (0.8 % spread), ITL p99 172–174 ms. SDC 100 % agreement in both. GPU 4 (R1): 971 tok/s, TTFT p50 47.4 s, ITL p99 3,108 ms, 93 °C, 120 MHz floor, throttle 32/104, outputs correct.', anom: 'GPU 4 at 6 % (F2).', interp: 'Integrated inference on peers is uniform and correct. R1 and R2 differ in configuration and are not a repeatability pair. GPU 4 is slow for the same thermal reason as in GEMM — an integrated workload adds no new information about it.', ev: [['r1', '4', 'Run 1 1C (8 GPUs)'], ['r2', '4', 'Run 2 1C (7 GPUs; GPU 4 idle in telemetry)']] },
      { id: '5', name: 'Cooldown 1', obj: 'Record the thermal decay curve after the Tier 1 load: how fast each GPU returns toward idle.', wl: 'None (observation), 120 s in R4.', sub: 'Thermal interface / heat removal', exp: 'Monotonic decay to within a few degrees of idle in ~1–2 min; similar curves across GPUs.', obs: 'Peers 43–51 °C → 38–41 °C in 60 s, flat by 120 s (they had been unloaded since 1B kernels ended). GPU 4: no data (off bus). In R1 the 5 s cooldown shows GPU 4 holding 89–90 °C.', anom: 'None on peers.', interp: 'Peer heat removal is effective. No decay curve exists for GPU 4 in any run.', ev: [['r4', '5', 'Run 4 cooldown 1']] },
      { id: '6', name: '2A Inference Workload', obj: 'Primary Tier 2 diagnostic: a larger model at higher memory pressure for longer, where degraded devices separate from healthy ones.', wl: 'vLLM Llama-2-13B GPTQ-INT8, FP8 KV cache, batch 80 × 2 instances, 240 s (120 s scored). R3 only, 7 GPUs. R4: failed to start.', sub: 'Sustained integrated load, HBM pressure, latency tails', exp: 'Uniform throughput; tight ITL p99; no throttling beyond power cap.', obs: 'Peers 4,052–4,179 tok/s (3.1 % spread), TTFT 2.13–2.22 s, ITL p99 44.7–45.4 ms, 743–758 W mean, 1,604–1,632 MHz, 63–74 °C peak, power-cap flag only. GPU 4 excluded (idle 79–81 °C in telemetry).', anom: 'None on peers.', interp: 'No peer separates under the Tier 2 inference load. 2A was not run with GPU 4 participating, and ran only once, so it is a single-run baseline.', ev: [['r3', '6', 'Run 3 2A (7 GPUs)']] },
      { id: '7', name: '2B Training Workload', obj: 'The only write-heavy workload: gradient and optimizer traffic exercise the HBM write path that inference does not.', wl: 'Skipped by configuration (--skip 10) in R4; never run.', sub: '—', exp: '—', obs: 'Not executed.', anom: '—', interp: 'Write-path health is untested on every GPU.', ev: [], nm: true },
      { id: '8', name: '2C Convolution Compute', obj: 'Compute-subsystem health via a different kernel family.', wl: 'Attempted in R4 at 06:16:00; failed in 3 s — “No CUDA devices”.', sub: '—', exp: '—', obs: 'Not executed.', anom: '—', interp: 'Untested.', ev: [], nm: true },
      { id: '9', name: '2D FFT Compute', obj: 'Mixed compute and memory-bandwidth health.', wl: 'Attempted in R4; failed in 3 s — “No CUDA devices”.', sub: '—', exp: '—', obs: 'Not executed.', anom: '—', interp: 'Untested.', ev: [], nm: true },
      { id: '10', name: '2E Random Access Memory', obj: 'Memory-controller health under non-streaming access.', wl: 'Attempted in R4; failed in 3 s — “No CUDA devices”.', sub: '—', exp: '—', obs: 'Not executed.', anom: '—', interp: 'Untested.', ev: [], nm: true },
      { id: '11', name: 'Cooldown 2', obj: 'Second thermal decay curve, to compare with Cooldown 1.', wl: 'None (observation), 120 s in R4.', sub: 'Thermal', exp: 'Similar to Cooldown 1.', obs: 'Peers already at idle (38–41 °C) since no Tier 2 load ran; flat.', anom: 'None.', interp: 'No new information; confirms idle stability of the seven peers.', ev: [['r4', '11', 'Run 4 cooldown 2']] },
      { id: '12', name: '3A Inference Workload (near-limit)', obj: 'Boundary probe: push memory to 95 %+ and observe graceful versus hard failure.', wl: 'Skipped by configuration (--skip 11); never run.', sub: '—', exp: '—', obs: 'Not executed.', anom: '—', interp: 'Memory-boundary behaviour untested.', ev: [], nm: true },
      { id: '13', name: '3B Sustained Power Proxy GEMM', obj: 'Thermal ceiling, clock stability and power-delivery health under 20 min of full-fleet load, followed by a 3 min decay recording.', wl: 'Attempted in R4; failed in 3 s — “No CUDA devices”.', sub: '—', exp: '—', obs: 'Not executed.', anom: '—', interp: 'Sustained-power behaviour untested. The closest proxy is the 15 min 1B phase at ~870 W per peer, during which peer clocks and temperatures were flat.', ev: [], nm: true },
      { id: '14', name: 'NVLink NCCL Collective Stress', obj: 'Interconnect health: all-reduce, all-gather, broadcast bandwidth and latency.', wl: 'Attempted in R4; failed in 3 s — CUDA initialization error.', sub: '—', exp: '—', obs: 'Not executed. Fabric state “Healthy” in every snapshot.', anom: '—', interp: 'NVLink untested.', ev: [], nm: true },
      { id: '15', name: 'Final Idle Snapshot', obj: 'Post-assessment idle readings for comparison with Phase 0.', wl: 'None (observation), 120 s.', sub: 'Thermal, power', exp: 'Return to Phase 0 values.', obs: 'Peers 37.8–40.3 °C, 191–202 W — within 0.5–1.6 °C below Phase 0 (ambient drifted down ~1 °C). GPU 4: no data.', anom: 'None on peers.', interp: 'Idle-to-idle comparison shows no residual thermal or power shift on any peer after the assessment.', ev: [['r4', '15', 'Run 4 final idle']] },
    ];
    P.forEach(p => {
      const ph = r4.phases.find(q => q.id === p.id);
      const statusBadge = p.nm ? '<span class="badge notmeasured">not executed</span>' : (ph.status === 'failed' ? '<span class="badge critical">failed</span>' : '<span class="badge good">completed</span>');
      const d = el('details', { class: 'phase' });
      d.appendChild(el('summary', { html: `<span class="ph-id">Phase ${p.id}</span><span class="ph-name">${p.name}</span><span class="ph-sum">${p.anom && p.anom !== '—' ? p.anom : (p.nm ? 'Not run' : 'No anomaly')}</span>${statusBadge}` }));
      const body = el('div', { class: 'ph-body' });
      const kv = el('dl', { class: 'kv' });
      [['Objective', p.obj], ['Workload', p.wl], ['Subsystems stressed', p.sub], ['Expected behaviour', p.exp], ['Observed behaviour', p.obs], ['Anomalies / events', p.anom], ['Operational interpretation', p.interp]].forEach(([k, v]) => { kv.appendChild(el('dt', {}, [k])); kv.appendChild(el('dd', { html: v })); });
      body.appendChild(kv);
      p.ev.forEach(([rk, pid, cap]) => { const t = sumTable(rk, pid, 'Telemetry — ' + cap); if (t) body.appendChild(t); });
      d.appendChild(body); c.appendChild(d);
    });
  }

  /* --- appendix tables --- */
  function renderAppendixTables() {
    // GEMM table
    const sus = (arr) => { const v = arr.map(p => p[1]); return v.length ? { mean: v.reduce((a, b) => a + b, 0) / v.length, n: v.length, min: Math.min(...v), max: Math.max(...v) } : null; };
    const rows = ALL.map(g => { const w = sus(D.gemm.warmup[g] || []), b = sus(D.gemm.baseline[g] || []); const delta = (w && b) ? ((b.mean - w.mean) / w.mean * 100) : null; return { cells: ['GPU ' + g, fmt(w.mean, 1), fmt(w.n), fmt(b.mean, 1), fmt(b.n), `${fmt(b.min, 0)}–${fmt(b.max, 0)}`, (delta == null ? '–' : (delta >= 0 ? '+' : '') + fmt(delta, 2) + ' %')], gpu4: g === '4' }; });
    table($('#tbl-gemm'), ['GPU', 'Warm-up mean TFLOPS', 'samples', '1A mean TFLOPS', 'samples', '1A per-second range', '1A vs warm-up'], rows, { num: [1, 2, 3, 4, 5, 6], caption: 'GEMM (workload 1): warm-up phase vs 1A baseline, run 4' });
    // inference tables
    const c = $('#tbl-inf');
    const inf = (key, run, label) => {
      const wrap = el('div', { class: 'tbl-wrap' }); const pp = D.pp[key]; const tp = D.tp[key];
      const rows = ALL.map(g => { if (!pp[g]) return { cells: ['GPU ' + g, '<span class="dim">excluded from workload</span>', '', '', '', '', ''], gpu4: g === '4' }; const v = tp[g]; const mean = v.reduce((a, b) => a + b, 0) / v.length; return { cells: ['GPU ' + g, fmt(mean), fmt(pp[g].n), fmt(pp[g].ttft_p50), fmt(pp[g].ttft_p95), fmt(pp[g].itl50_p50, 1), fmt(pp[g].itl99_p50, 1)], gpu4: g === '4' }; });
      table(wrap, ['GPU', 'tok/s mean (all samples)', 'prompts', 'TTFT p50 ms', 'TTFT p95 ms', 'ITL p50 ms (median prompt)', 'ITL p99 ms (median prompt)'], rows, { num: [1, 2, 3, 4, 5, 6], caption: label });
      c.appendChild(wrap);
    };
    inf('r1_1c', 'r1', 'Run 1 — 1C Llama-3-8B INT8, batch 1024 × 1 instance, 420 s (per-second samples include the 60 s ramp)');
    inf('r2_1c', 'r2', 'Run 2 — 1C Llama-3-8B INT8, batch 448 × 2 instances, 180 s, GPU 4 excluded');
    inf('r3_2a', 'r3', 'Run 3 — 2A Llama-2-13B INT8 + FP8 KV, batch 80 × 2 instances, 240 s, GPU 4 excluded');
    // run / phase tables
    const rp = $('#run-phase-tables');
    [['r1', 'Run 1 — 26-10-08_19-29-42'], ['r2', 'Run 2 — 26-10-09_02-49-59'], ['r3', 'Run 3 — 26-10-09_03-47-49'], ['r4', 'Run 4 — 26-10-09_04-35-46']].forEach(([rk, cap]) => {
      const run = D.runs[rk]; const det = el('details', { class: 'more' }); det.appendChild(el('summary', {}, [cap + ' — phase table']));
      const wrap = el('div', { class: 'tbl-wrap' });
      table(wrap, ['Phase', 'Label', 'Kind', 'Start (UTC)', 'End (UTC)', 'Wall s', 'Status'], run.phases.map(p => ({ cells: [p.id, p.label, p.kind, hhmmss(run.t0, p.start), hhmmss(run.t0, p.end), fmt(p.dur), p.status] })), { num: [5] });
      det.appendChild(wrap); rp.appendChild(det);
    });
  }

  /* --- cooldown chart --- */
  function renderCooldown() {
    const run = D.runs.r4; const ph = run.phases.find(p => p.id === '5');
    const i0 = Math.floor(ph.start / run.step), i1 = Math.ceil(ph.end / run.step);
    const xs = []; for (let i = i0; i <= i1; i++) xs.push((i - i0) * run.step);
    const colors = PEERS.map(() => css('--peer'));
    const series = PEERS.map((g, k) => ({ name: 'GPU ' + g, values: xs.map((_, j) => run.gpus[g].temp[i0 + j]), color: colors[k], width: 1.6, label: k === 0 || k === 2 }));
    const c = $('#cooldown-chart');
    c.appendChild(el('h3', { html: 'Thermal decay after load — run 4, Cooldown 1 (peers only)' }));
    lineChart(c, { id: 'cooldown-svg', title: 'Junction temperature during Cooldown 1 (°C), seven peers', sub: 'Window starts at 06:13:56, ~12 min after the last 1B kernel on each peer finished executing; peers had already partially cooled. GPU 4 has no post-load telemetry in any run.', xs, xmin: 0, xmax: xs[xs.length - 1], xfmt: v => v + ' s', unit: '°C', ymin: 35, ymax: 55, height: 200,
      series, legend: '<span><i style="background:var(--peer)"></i>GPUs 0–3, 5–7 (one line each)</span><span><i style="background:var(--gpu4)"></i>GPU 4 — no data</span>',
      read: '<b>Reading.</b> All seven peers fall from 43–51 °C to 38–41 °C within 60 s and are flat thereafter. GPUs 1, 2 and 6 start highest, matching their consistently warmer position under load. No peer shows a slow or stalled decay.' });
  }

  /* --- BMC chart --- */
  function renderBmc() {
    const run = D.runs.r4; const b = run.bmc; const c = $('#bmc-chart');
    const n = b.hgx_gpu.length; const xs = Array.from({ length: n }, (_, i) => i * b.step);
    const phases = run.phases.filter(p => p.end - p.start > 2).map(p => ({ start: p.start, end: p.end, short: SHORT[p.id] }));
    const xfmt = v => hhmm(run.t0, v);
    c.appendChild(el('h3', { html: 'Chassis view (BMC / IPMI) — run 4' }));
    lineChart(c, { id: 'bmc-temp', title: 'HGX board aggregate sensors and inlet (°C)', sub: 'HGX_GPU_Temp and HGX_HBM_Temp behave as the maximum across the board and therefore track GPU 4. They stop reporting at 06:02:10, 26 s after GPU 4 left the bus. HGX_T-Limit is the minimum thermal margin (negative = over limit).', xs, xmin: run.phases.find(p => p.id === '0').start - 30, xmax: xs[n - 1], phases, xfmt, unit: '°C', height: 230,
      markers: [{ x: run.gpus['4'].last, label: 'GPU 4 off bus', anchor: 'end' }],
      series: [{ name: 'HGX_GPU_Temp', values: b.hgx_gpu, color: css('--gpu4'), width: 2, label: true }, { name: 'HGX_HBM_Temp', values: b.hgx_hbm, color: css('--serious'), width: 1.6, label: true }, { name: 'HGX_T-Limit', values: b.hgx_tlimit, color: css('--neutral'), width: 1.6, dash: '4 3', label: true }, { name: 'HGX inlet', values: b.hgx_inlet, color: css('--peer'), width: 1.4, label: true }],
      legend: '<span><i style="background:var(--gpu4)"></i>HGX_GPU_Temp (max GPU)</span><span><i style="background:var(--serious)"></i>HGX_HBM_Temp (max HBM)</span><span><i class="dash" style="color:var(--neutral)"></i>HGX_T-Limit (min margin)</span><span><i style="background:var(--peer)"></i>HGX inlet</span>' });
    lineChart(c, { id: 'bmc-fan', title: 'System fan speed (mean of FAN1–FAN15, RPM)', sub: 'Flat at ~11.6 k RPM across idle, 7 × 1,000 W load, and a 96 °C GPU. MB_FAN2 (not plotted) read 0 RPM with status “cr” throughout.', xs, xmin: run.phases.find(p => p.id === '0').start - 30, xmax: xs[n - 1], phases, xfmt, unit: 'RPM', ymin: 10000, ymax: 13000, height: 170,
      markers: [{ x: run.gpus['4'].last, label: 'GPU 4 off bus', anchor: 'end' }],
      series: [{ name: 'fan mean', values: b.fan, color: css('--peer'), width: 1.8, label: true }],
      read: '<b>Reading.</b> No fan response to either load or the hot GPU. Whether this is the intended platform policy is a question for Supermicro (finding F6).' });
  }

  let unlocked = false;
  try { unlocked = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  if (unlocked) unlock();
})();
