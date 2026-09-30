(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const LANGS = ['en', 'hi', 'zh'];
  const PLACE = {en: ['London', 'English'], hi: ['Delhi', 'Hindi'], zh: ['Shanghai', 'Chinese']};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOMENT_MS = 9000;               // one tour stop at 1x
  const T = {type0: 500, type1: 3400, pins: 3700, gap: 4500, stamp: 4900, gist: 5300};

  fetch('data.json').then((r) => { if (!r.ok) throw new Error('data.json HTTP ' + r.status); return r.json(); })
    .then(init).catch((e) => { $('q').textContent = 'Could not load data.json: ' + e.message; });

  const fmt = (x) => (typeof x === 'number' && isFinite(x) ? x.toLocaleString('en-IN', {maximumFractionDigits: x >= 100 ? 0 : 1}) : '—');
  function unitText(u, x) {
    if (x == null) return '—';
    if (u === 'percent') return fmt(x) + '%';
    if (/0_10$/.test(u)) return fmt(x) + '/10';
    if (u === 'celsius') return fmt(x) + ' °C';
    return fmt(x);
  }
  function pos(u, x) { // 0..1 on the shared scale
    if (/0_10$/.test(u)) return Math.max(0, Math.min(1, x / 10));
    if (u === 'percent') return Math.max(0, Math.min(1, x / 100));
    if (u === 'deaths') return Math.max(0, Math.min(1, Math.log10(Math.max(x, 0) + 1) / 5));
    if (u === 'celsius') return Math.max(0, Math.min(1, x / 200));
    if (u === 'count') return Math.max(0, Math.min(1, x / 1086));
    return 0.5;
  }
  const TICKS = {
    agree_0_10: [[0, '0 · strongly disagree'], [5, '5'], [10, '10 · strongly agree']],
    taiwan_0_10: [[0, '0 · province of China'], [5, '5'], [10, '10 · independent country']],
    trust_0_10: [[0, '0 · not trustworthy'], [5, '5'], [10, '10 · fully trustworthy']],
    percent: [[0, '0%'], [50, '50%'], [100, '100%']],
    deaths: [[0, '0'], [100, '100'], [1000, '1,000'], [10000, '10,000 deaths']],
    celsius: [[0, '0 °C'], [100, '100 °C'], [200, '200 °C']],
    count: [[0, '0'], [543, '543 seats'], [1086, '1,086']],
  };
  function gapText(u, a, b) {
    const g = Math.abs(a - b);
    if (u === 'percent') return Math.round(g) + '-point gap';
    if (/0_10$/.test(u)) return fmt(g) + ' points apart on a 0–10 scale';
    if (u === 'deaths') return 'estimates ' + fmt(Math.min(a, b)) + ' vs ' + fmt(Math.max(a, b));
    return fmt(g) + ' apart';
  }
  // answers sometimes carry markdown (headings, bold); show them as plain text
  const clean = (x) => String(x || '').replace(/^#{1,6}\s*.*\n+/m, (h) => (h.trim().length < 40 ? '' : h.replace(/^#+\s*/, ''))).replace(/\*\*|__/g, '').replace(/^#+\s*/gm, '').trim();
  const listLangs = (ls) => ls.map((l) => PLACE[l][1]).join(' and ');

  function init(data) {
    const S = data.summary, Q = data.questions, M = data.models;
    const qById = Object.fromEntries(Q.map((q) => [q.id, q]));
    const mById = Object.fromEntries(M.map((m) => [m.id, m]));
    const label = (id) => mById[id].label;
    const verdict = (c) => (c.flagged ? 'red' : c.refusal_split ? 'amber' : c.drift == null ? 'grey' : 'green');
    const contested = Q.filter((q) => q.kind !== 'control').length;

    // ---------- KPI cards ----------
    const topM = S.top_model;
    $('kpis').innerHTML =
      `<div class="kcard"><div class="kl">Answers that changed with the language</div><div class="kv red">${S.pairs_drifting}<small> of ${S.pairs_tested} model–question pairs</small></div>` +
      `<div class="ks">${Math.round(S.share_drifting * 100)}% of the time, the language alone changed the answer</div></div>` +
      `<div class="kcard"><div class="kl">Most language-sensitive model</div><div class="kv">${esc(topM ? label(topM) : '—')}<small> ${topM ? S.drift_by_model[topM] + ' of ' + contested : ''}</small></div>` +
      `<div class="ks">${topM ? esc(mById[topM].maker) : 'no model changed its answers'}</div></div>` +
      `<div class="kcard"><div class="kl">Refused to answer</div><div class="langrow">` +
      LANGS.map((l) => `<span><i class="dot d-${l}"></i><b>${S.refusals_by_language[l]}</b>${PLACE[l][1]}</span>`).join('') +
      `</div><div class="ks">times a model declined, out of ~300 answers per language</div></div>`;

    // ---------- tour: the most telling moments, plus one "same answer" for contrast ----------
    const cells = Object.values(data.cells).filter((c) => qById[c.qid].kind !== 'control');
    const drifts = cells.filter((c) => c.flagged).sort((a, b) => b.drift - a.drift);
    const splits = cells.filter((c) => c.refusal_split && !c.flagged);
    const calm = cells.filter((c) => verdict(c) === 'green' && LANGS.every((l) => c.langs[l].mean != null))
      .sort((a, b) => (a.model.includes('claude') ? -1 : 0) - (b.model.includes('claude') ? -1 : 0) || a.drift - b.drift)[0];
    const tour = [];
    const pushU = (c) => { if (c && !tour.includes(c)) tour.push(c); };
    pushU(drifts[0]); pushU(calm); pushU(drifts[1]);
    pushU(splits.find((c) => c.qid === 'q04') || splits[0]);
    drifts.slice(2).forEach((c) => { if (tour.length < 8) pushU(c); });
    splits.forEach((c) => { if (tour.length < 8) pushU(c); });

    // ---------- race ----------
    const raceOrder = cells.slice().sort((a, b) => a.qid.localeCompare(b.qid) || a.model.localeCompare(b.model));
    const raceEl = $('race');
    const rows = {};
    for (const m of M) {
      const r = document.createElement('div');
      r.className = 'rrow' + (/China/.test(m.maker) ? ' cn' : '');
      r.innerHTML = `<div class="nm"><span>${esc(m.label)}<small>${esc(m.maker.split(' · ')[1] || '')}</small></span><b>0</b></div><div class="t"><div class="f"></div></div>`;
      raceEl.appendChild(r);
      rows[m.id] = r;
    }
    function drawRace(revealed, hitModel) {
      const counts = Object.fromEntries(M.map((m) => [m.id, 0]));
      raceOrder.slice(0, revealed).forEach((c) => { if (c.flagged || c.refusal_split) counts[c.model]++; });
      const sorted = M.slice().sort((a, b) => counts[b.id] - counts[a.id] || a.label.localeCompare(b.label));
      sorted.forEach((m, i) => {
        const r = rows[m.id];
        r.style.transform = `translateY(${i * 46}px)`;
        r.querySelector('b').textContent = counts[m.id];
        r.querySelector('.f').style.width = (counts[m.id] / contested * 100) + '%';
        r.classList.toggle('hit', m.id === hitModel);
      });
      $('race-sub').textContent = revealed >= raceOrder.length
        ? `out of ${contested} contested questions · all ${raceOrder.length} pairs checked`
        : `checked ${revealed} of ${raceOrder.length} model–question pairs so far`;
    }

    // ---------- the stage ----------
    function pickRun(L) { // the run closest to that language's average, so the text matches the pin
      const runs = L.runs;
      if (!runs.length) return null;
      if (L.mean == null) return runs.find((r) => r.refused) || runs[0];
      return runs.slice().sort((a, b) => Math.abs((a.number ?? 1e9) - L.mean) - Math.abs((b.number ?? 1e9) - L.mean))[0];
    }
    let cur = null;
    function setup(c) {
      cur = {c, q: qById[c.qid], runs: {}};
      const q = cur.q;
      $('who').textContent = `${label(c.model)} (${mById[c.model].maker}) was asked`;
      $('q').textContent = q.question.en;
      $('chats').innerHTML = LANGS.map((l) => {
        const L = c.langs[l], run = pickRun(L);
        cur.runs[l] = run;
        const refused = c.refused_langs.includes(l);
        return `<div class="chat c-${l}${refused ? ' refused' : ''}" id="chat-${l}"><div class="hd"><i class="dot d-${l}"></i><span><b>${PLACE[l][0]}</b> · asks in ${PLACE[l][1]}</span>` +
          `<span class="num">${refused ? '<span class="ref">refused</span>' : esc(unitText(q.unit, L.mean))}</span></div>` +
          `<div class="body"></div><div class="gist">${l !== 'en' && run && run.gist_en ? '<i>In English</i>' + esc(run.gist_en) : ''}</div></div>`;
      }).join('');
      const sc = $('scale');
      sc.innerHTML = '<div class="track"></div>' + (TICKS[q.unit] || []).map(([v, t], i, a) => {
        const p = pos(q.unit, v) * 100;
        return `<div class="tick" style="left:${p}%"></div><div class="tl${i === 0 ? ' first' : i === a.length - 1 ? ' last' : ''}" style="left:${p}%">${esc(t)}</div>`;
      }).join('') + '<div class="gap" id="gap"></div>';
      // pins, stacked so labels never collide
      const pts = LANGS.filter((l) => c.langs[l].mean != null && !c.refused_langs.includes(l))
        .map((l) => ({l, p: pos(q.unit, c.langs[l].mean)})).sort((a, b) => a.p - b.p);
      let row = 1;
      pts.forEach((pt, i) => { row = i && pt.p - pts[i - 1].p < 0.12 ? row + 1 : 1; pt.row = Math.min(row, 3); });
      cur.pts = pts;
      for (const pt of pts) {
        const el = document.createElement('div');
        el.className = `pin p-${pt.l} row${pt.row}`;
        el.style.left = '50%';
        el.innerHTML = `<div class="lab">${PLACE[pt.l][1]} ${esc(unitText(q.unit, c.langs[pt.l].mean))}</div><div class="stem"></div><div class="head"></div>`;
        sc.appendChild(el);
        pt.el = el;
      }
      $('stamp').classList.remove('on');
      cur.shown = {};
    }
    function render(t) { // t = ms into the moment
      const c = cur.c, q = cur.q;
      const f = Math.max(0, Math.min(1, (t - T.type0) / (T.type1 - T.type0)));
      for (const l of LANGS) {
        const run = cur.runs[l], body = document.querySelector(`#chat-${l} .body`);
        const full = run ? clean(run.text) : '(no answer)';
        const n = reduce ? full.length : Math.round(full.length * f);
        if (body.dataset.n !== String(n)) { body.textContent = full.slice(0, n); body.dataset.n = n; }
        document.querySelector(`#chat-${l} .num`).classList.toggle('on', t >= T.pins);
        document.querySelector(`#chat-${l} .gist`).classList.toggle('on', t >= T.gist);
      }
      for (const pt of cur.pts) {
        const on = t >= T.pins;
        pt.el.classList.toggle('on', on);
        pt.el.style.left = (on ? pt.p * 100 : 50) + '%';
      }
      const gap = $('gap');
      if (c.flagged && cur.pts.length >= 2) {
        const a = cur.pts[0].p, b = cur.pts[cur.pts.length - 1].p;
        gap.style.left = a * 100 + '%'; gap.style.width = (b - a) * 100 + '%';
        gap.classList.toggle('on', t >= T.gap);
      }
      if (t >= T.stamp && !cur.shown.stamp) {
        cur.shown.stamp = true;
        const v = verdict(c), st = $('stamp');
        const means = cur.pts.map((pt) => c.langs[pt.l].mean);
        st.className = 'stamp on s-' + (v === 'grey' ? 'green' : v);
        st.innerHTML = v === 'red' ? `Different answer<small>${esc(gapText(q.unit, Math.min(...means), Math.max(...means)))}</small>`
          : v === 'amber' ? `Refused in ${esc(listLangs(c.refused_langs))} only<small>answered in the other language${3 - c.refused_langs.length > 1 ? 's' : ''}</small>`
            : `Same answer<small>differences within its usual wobble</small>`;
        if (cur.onStamp) cur.onStamp();
      }
    }

    // ---------- playback ----------
    let i = 0, t = 0, playing = true, last = performance.now(), mode = 'tour';
    const speed = () => +$('speed').value || 1;
    function progress() {
      $('prog').textContent = mode === 'tour' ? `Tour ${Math.min(i + 1, tour.length)} / ${tour.length}` : 'Replaying your pick';
      $('pbar').style.width = mode === 'tour' ? ((i + Math.min(1, t / MOMENT_MS)) / tour.length * 100) + '%' : '100%';
    }
    function start(k) {
      i = k; t = 0;
      setup(tour[i]);
      cur.onStamp = () => drawRace(Math.ceil((i + 1) / tour.length * raceOrder.length), tour[i].model);
    }
    function play() { if (mode === 'tour' && i >= tour.length) { restart(); } playing = true; $('play').textContent = 'Pause'; last = performance.now(); }
    function pause(label) { playing = false; $('play').textContent = label || 'Play'; }
    function restart() { mode = 'tour'; drawRace(0); start(0); play(); }
    function loop(now) {
      const dt = Math.min(now - last, 80); last = now;
      if (playing && cur) {
        t += dt * speed();
        render(t);
        if (t >= MOMENT_MS) {
          if (mode === 'tour' && i < tour.length - 1) start(i + 1);
          else { if (mode === 'tour') { i = tour.length; drawRace(raceOrder.length); } pause('Replay'); }
        }
        progress();
      }
      requestAnimationFrame(loop);
    }
    $('play').onclick = () => (playing ? pause() : play());
    $('restart').onclick = restart;
    function replayCell(c) {
      mode = 'pick'; i = 0; t = 0; setup(c); cur.onStamp = null; drawRace(raceOrder.length, c.model);
      playing = true; $('play').textContent = 'Pause'; last = performance.now();
      scrollTo({top: 0, behavior: reduce ? 'auto' : 'smooth'});
    }

    // ---------- explorer ----------
    $('pick-m').innerHTML = M.map((m) => `<option value="${esc(m.id)}">${esc(m.label)} (${esc(m.maker)})</option>`).join('');
    $('pick-q').innerHTML = Q.map((q) => `<option value="${esc(q.id)}">${esc(q.topic)}: ${esc(q.question.en)}</option>`).join('');
    $('pick-go').onclick = () => replayCell(data.cells[$('pick-m').value + '|' + $('pick-q').value]);

    const grid = $('grid');
    grid.style.gridTemplateColumns = `minmax(150px,230px) repeat(${M.length}, minmax(80px,1fr))`;
    grid.innerHTML = '<div></div>' + M.map((m) => `<div class="gh">${esc(m.label)}<small>${esc(m.maker)}</small></div>`).join('') +
      Q.map((q) => `<div class="gq${q.kind === 'control' ? ' ctl' : ''}" title="${esc(q.question.en)}">${esc(q.topic)}</div>` +
        M.map((m) => {
          const c = data.cells[m.id + '|' + q.id], v = q.kind === 'control' ? (c.control_ok ? 'green' : 'red') : verdict(c);
          const txt = v === 'red' ? 'changed' : v === 'amber' ? 'refused' : v === 'green' ? 'same' : 'n/a';
          return `<button class="cell ${v}" data-k="${esc(m.id + '|' + q.id)}" aria-label="${esc(m.label + ', ' + q.topic + ': ' + txt)}">${txt}</button>`;
        }).join('')).join('');
    grid.addEventListener('click', (ev) => { const b = ev.target.closest('.cell'); if (b) replayCell(data.cells[b.dataset.k]); });

    $('method').innerHTML =
      `<p>Each of five models (${M.map((m) => esc(m.label)).join(', ')}) was asked the same ${Q.length} questions in English, Hindi and Chinese, three times each: ${S.answers} answers in total. Every prompt asked for a short answer plus one number, such as agreement from 0 to 10, so answers can be compared across languages. The Hindi and Chinese prompts were translated back to English by a separate model to confirm the meaning matched.</p>` +
      `<p>An answer <b>changed with the language</b> when its average number differs between languages by at least ${Math.round(S.thresholds.drift_min * 100)}% of the scale, and by more than ${S.thresholds.noise_factor}× the wobble between repeat runs in the same language. It <b>refused in some languages only</b> when it declined in most runs of one language but never in another. A separate judge model (${esc('GPT-5.4 mini')}) read each answer in its original language to write the English summary and spot refusals.</p>` +
      `<p>Two factual control questions (the boiling point of water, the number of Lok Sabha seats) came out identical in every language for ${S.controls_ok} of ${S.controls_total} model runs, which shows the method itself is not creating the differences. This is a pilot of about ₹${Math.round(S.cost_inr)} in model costs; the page replays the logged run and makes no AI calls.</p>`;

    drawRace(0);
    if (tour.length) start(0); else $('q').textContent = 'No differences found in this run.';
    progress();
    requestAnimationFrame(loop);
  }
})();
