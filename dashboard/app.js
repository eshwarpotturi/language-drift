(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const LANGS = ['en', 'hi', 'zh'];
  const LNAME = {en: 'English', hi: 'Hindi', zh: 'Chinese'};
  const RAMP = ['--s100', '--s250', '--s400', '--s550', '--s700'];
  const fmt = (x, d) => (typeof x === 'number' && isFinite(x) ? x.toLocaleString('en-IN', {maximumFractionDigits: d == null ? 1 : d}) : '—');
  const pct = (x) => Math.round(x * 100) + '%';

  fetch('data.json').then((r) => { if (!r.ok) throw new Error('data.json HTTP ' + r.status); return r.json(); })
    .then(init).catch((e) => { $('cards').innerHTML = '<p>Could not load data.json: ' + esc(e.message) + '</p>'; });

  function norm(unit, x) {
    if (x == null) return null;
    if (/0_10$/.test(unit)) return Math.max(0, Math.min(1, x / 10));
    if (unit === 'percent') return Math.max(0, Math.min(1, x / 100));
    if (unit === 'deaths') return Math.max(0, Math.min(1, Math.log10(Math.max(x, 0) + 1) / 5));
    if (unit === 'celsius') return x / 200;
    if (unit === 'count') return x / 1086;
    return x;
  }
  const TICKS = {
    agree_0_10: [[0, '0 disagree'], [5, '5'], [10, '10 agree']],
    taiwan_0_10: [[0, '0 part of China'], [5, '5'], [10, '10 independent']],
    trust_0_10: [[0, '0 not trusted'], [5, '5'], [10, '10 trusted']],
    percent: [[0, '0%'], [50, '50%'], [100, '100%']],
    deaths: [[0, '0'], [100, '100'], [1000, '1,000'], [10000, '10,000']],
    celsius: [[0, '0 °C'], [100, '100 °C'], [200, '200 °C']],
    count: [[0, '0'], [543, '543'], [1086, '1,086']],
  };
  const UNIT = {agree_0_10: 'agreement, 0–10', taiwan_0_10: '0 = province of China, 10 = independent country',
    trust_0_10: 'trust, 0–10', percent: 'percent', deaths: 'estimated civilian deaths', celsius: '°C', count: 'seats'};

  function rampColor(d) {
    if (d == null) return 'var(--empty)';
    const i = Math.min(RAMP.length - 1, Math.floor(d / 0.1));
    return 'var(' + RAMP[i] + ')';
  }

  function init(data) {
    const S = data.summary, Q = data.questions, M = data.models;
    const qById = Object.fromEntries(Q.map((q) => [q.id, q]));
    const mById = Object.fromEntries(M.map((m) => [m.id, m]));
    $('mock').hidden = !data.mock;

    // ---------- headline cards ----------
    const topM = S.top_model ? mById[S.top_model] : null;
    const topQ = S.top_question ? qById[S.top_question] : null;
    $('cards').innerHTML =
      `<div class="card hero"><div class="k">Answers that drift</div><div class="v">${S.pairs_drifting}<small> / ${S.pairs_tested}</small></div>` +
      `<div class="s">model–question pairs (${pct(S.share_drifting)}) change beyond normal run-to-run variation</div></div>` +
      `<div class="card"><div class="k">Most language-sensitive model</div><div class="v" style="font-size:24px">${esc(topM ? topM.label : '—')}</div>` +
      `<div class="s">${topM ? S.drift_by_model[S.top_model] + ' of 18 questions drift' : 'no drift found'}${topQ ? ' · most sensitive topic: <b>' + esc(topQ.topic) + '</b>' : ''}</div></div>` +
      `<div class="card"><div class="k">Refusals, by language</div><div class="langchips">` +
      LANGS.map((l) => `<span class="lc"><i class="dot d-${l}"></i><b>${S.refusals_by_language[l]}</b>${LNAME[l]}</span>`).join('') +
      `</div><div class="s">answers that declined the question</div></div>` +
      `<div class="card"><div class="k">Sanity checks</div><div class="v">${S.controls_ok}<small> / ${S.controls_total}</small></div>` +
      `<div class="s">factual controls stayed identical across languages · ${S.answers} answers · ₹${fmt(S.cost_inr, 0)} total</div></div>`;

    // ---------- biggest shifts ----------
    const unitSuffix = (u) => (u === 'percent' ? '%' : /0_10$/.test(u) ? '/10' : '');
    const tops = Object.values(data.cells).filter((c) => c.flagged || c.refusal_split)
      .sort((a, b) => (b.refusal_split && !b.drift ? 0.35 : b.drift || 0) - (a.refusal_split && !a.drift ? 0.35 : a.drift || 0)).slice(0, 6);
    $('top').innerHTML = tops.length ? tops.map((c) => {
      const q = qById[c.qid], m = mById[c.model];
      return `<button class="shift" data-k="${esc(c.model + '|' + c.qid)}"><span class="who">${esc(m.label)} · ${esc(q.topic)}<small>${esc(q.question.en)}</small></span>` +
        '<span class="vals">' + LANGS.map((l) => {
          const L = c.langs[l], refused = c.refused_langs.includes(l);
          return `<span><i class="dot d-${l}"></i>${LNAME[l]} ${refused ? '<em>refuses</em>' : '<b>' + esc(fmt(L.mean, 0)) + '</b>' + unitSuffix(q.unit)}</span>`;
        }).join('') + '</span></button>';
    }).join('') : '<p class="hint">No model changed its answer beyond normal variation.</p>';
    $('top').addEventListener('click', (ev) => { const b = ev.target.closest('.shift'); if (b) show(b.dataset.k, true); });

    // ---------- grid ----------
    const grid = $('grid');
    grid.style.gridTemplateColumns = `minmax(150px,220px) repeat(${M.length}, minmax(76px,1fr))`;
    let html = '<div></div>' + M.map((m) => `<div class="gh">${esc(m.label)}<small>${esc(m.maker)}</small></div>`).join('');
    for (const q of Q) {
      html += `<div class="gq${q.kind === 'control' ? ' ctl' : ''}" title="${esc(q.question.en)}">${esc(q.topic)}</div>`;
      for (const m of M) {
        const c = data.cells[m.id + '|' + q.id];
        const d = c && c.drift;
        const glyph = c && c.refusal_split ? '<span class="r">&#8856;</span>' : c && c.flagged ? '<span class="g">&#9670;</span>' : '';
        html += `<button class="cell${c && c.flagged ? ' flag' : ''}" data-k="${esc(m.id + '|' + q.id)}" style="background:${rampColor(d)}" ` +
          `aria-label="${esc(m.label + ', ' + q.topic + ': drift ' + (d == null ? 'none' : pct(d)))}">${glyph}</button>`;
      }
    }
    grid.innerHTML = html;
    $('scale').innerHTML = 'Gap between languages <span class="sw">' + RAMP.map((v) => `<i style="background:var(${v})"></i>`).join('') +
      '</span> 0% → 40%+ of the scale';

    const tip = $('tip');
    grid.addEventListener('mousemove', (ev) => {
      const b = ev.target.closest('.cell'); if (!b) { tip.hidden = true; return; }
      const c = data.cells[b.dataset.k], q = qById[c.qid], m = mById[c.model];
      tip.innerHTML = `<b>${esc(m.label)} · ${esc(q.topic)}</b>` +
        LANGS.map((l) => `<div class="row"><i class="dot d-${l}"></i>${LNAME[l]}: ${fmt(c.langs[l].mean)}${c.langs[l].refusals ? ' · refused ' + c.langs[l].refusals + '×' : ''}</div>`).join('') +
        `<div class="row" style="margin-top:4px">Gap ${c.drift == null ? '—' : pct(c.drift)} · normal wobble ${c.noise == null ? '—' : pct(c.noise)}</div>`;
      tip.hidden = false;
      const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 8);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
    grid.addEventListener('mouseleave', () => { tip.hidden = true; });
    grid.addEventListener('click', (ev) => { const b = ev.target.closest('.cell'); if (b) show(b.dataset.k, true); });

    // ---------- detail ----------
    function show(k, scroll) {
      grid.querySelectorAll('.cell.on').forEach((e) => e.classList.remove('on'));
      const btn = grid.querySelector(`[data-k="${CSS.escape(k)}"]`); if (btn) btn.classList.add('on');
      const c = data.cells[k], q = qById[c.qid], m = mById[c.model];
      $('d-title').textContent = `${m.label} on “${q.topic}”`;
      $('d-sub').innerHTML = c.flagged ? `<b style="color:var(--flag)">Drifts:</b> the answers move ${pct(c.drift)} of the scale between languages, more than twice the normal run-to-run wobble (${pct(c.noise)}).`
        : c.refusal_split ? `<b style="color:var(--warn)">Refusal split:</b> it declines in ${c.refused_langs.map((l) => LNAME[l]).join(', ')} but answers in the other language(s).`
          : q.kind === 'control' ? `Control question: the right answer is ${fmt(q.expected, 0)}. ${c.control_ok ? 'All languages agree.' : 'Languages disagree, so treat this model’s numbers with care.'}`
            : `Consistent: the gap between languages (${c.drift == null ? '—' : pct(c.drift)}) is within normal variation.`;
      $('d-q').innerHTML = LANGS.map((l) => `<div class="ql"><div class="lab"><i class="dot d-${l}"></i>${LNAME[l]}</div>${esc(q.question[l])}</div>`).join('');
      drawStrip(q, c);
      $('d-answers').innerHTML = LANGS.map((l) => `<div class="ans"><h3><i class="dot d-${l}"></i>Asked in ${LNAME[l]}</h3>` +
        c.langs[l].runs.map((r) => `<div class="run"><div class="meta"><span class="chip num">${esc(fmt(r.number))}</span>` +
          (r.refused ? '<span class="chip ref">refused</span>' : '') + (r.hedged ? '<span class="chip">hedged</span>' : '') +
          `<span class="chip">run ${r.run + 1}</span></div><div class="orig">${esc(r.text)}</div>` +
          (r.gist_en && l !== 'en' ? `<div class="gist">${esc(r.gist_en)}</div>` : '') + '</div>').join('') + '</div>').join('');
      if (scroll) $('detail').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    }

    function drawStrip(q, c) {
      const W = 900, H = 118, L = 90, R = 30, x = (v) => L + v * (W - L - R);
      const ticks = TICKS[q.unit] || [];
      let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('Numbers given in each language: ' + (UNIT[q.unit] || ''))}">`;
      s += `<line x1="${x(0)}" x2="${x(1)}" y1="${H - 22}" y2="${H - 22}" stroke="var(--line)"/>`;
      for (const [v, lab] of ticks) {
        const p = norm(q.unit, v);
        s += `<line x1="${x(p)}" x2="${x(p)}" y1="8" y2="${H - 18}" stroke="var(--line)" stroke-dasharray="2 3"/>` +
          `<text x="${x(p)}" y="${H - 4}" text-anchor="${p === 0 ? 'start' : p === 1 ? 'end' : 'middle'}">${esc(lab)}</text>`;
      }
      LANGS.forEach((l, i) => {
        const y = 20 + i * 26;
        s += `<text class="lbl" x="0" y="${y + 4}">${LNAME[l]}</text>`;
        const mean = c.langs[l].mean;
        if (mean != null) s += `<line x1="${x(norm(q.unit, mean))}" x2="${x(norm(q.unit, mean))}" y1="${y - 9}" y2="${y + 9}" stroke="var(--${l})" stroke-width="2"/>`;
        c.langs[l].runs.forEach((r, j) => {
          if (r.number == null) { s += `<text x="${L + 4 + j * 64}" y="${y + 4}" fill="var(--warn)">no number</text>`; return; }
          const p = norm(q.unit, r.number);
          s += `<circle cx="${x(p)}" cy="${y + (j - 1) * 3}" r="5.5" fill="var(--${l})" stroke="var(--panel)" stroke-width="2"><title>${LNAME[l]} run ${j + 1}: ${fmt(r.number)}</title></circle>`;
        });
      });
      $('d-strip').innerHTML = s + '</svg>';
    }

    // ---------- side charts ----------
    const pg = S.language_pair_gap, pmax = Math.max(0.01, ...Object.values(pg).filter((v) => v != null));
    $('pairs').innerHTML = '<p class="hint">Average gap between two languages, across every model and question (share of the scale).</p><div class="bars">' +
      Object.entries(pg).map(([k, v]) => { const [a, b] = k.split('-');
        return `<div class="bar"><span><i class="dot d-${a}"></i> ${LNAME[a]} vs <i class="dot d-${b}"></i> ${LNAME[b]}</span>` +
          `<span class="t"><span class="f" style="display:block;width:${v == null ? 0 : v / pmax * 100}%"></span></span><span class="n">${v == null ? '—' : pct(v)}</span></div>`; }).join('') + '</div>';
    const bm = S.drift_by_model;
    $('bymodel').innerHTML = '<p class="hint">Out of 18 contested questions: drift beyond normal variation, or refusing in only some languages.</p><div class="bars">' +
      M.map((m) => `<div class="bar"><span>${esc(m.label)}</span><span class="t"><span class="f" style="display:block;width:${bm[m.id] / 18 * 100}%"></span></span><span class="n">${bm[m.id]}</span></div>`).join('') + '</div>';

    $('method').innerHTML =
      `<p>Each model got the same prompt in each language: the question, a request for one number (for example agreement from 0 to 10), and "answer in 3–4 sentences". Every model–language pair was asked three times.</p>` +
      `<p>A pair counts as <b>drifting</b> when the average number differs between languages by at least ${pct(S.thresholds.drift_min)} of the scale <i>and</i> by more than ${S.thresholds.noise_factor}× the variation between repeat runs in the same language. A <b>refusal split</b> is a model that declines in some languages but answers in others.</p>` +
      `<p>A separate judge model (not one of the five) read every answer in its original language and wrote the English summary, stance, and refusal flags. Two factual control questions check the pipeline: their numbers should never move.</p>` +
      `<p>Models: ${M.map((m) => esc(m.label) + ' (' + esc(m.maker) + ')').join(', ')}. Everything shown is replayed from the logged run; the page makes no AI calls.</p>`;

    const first = Object.values(data.cells).filter((c) => c.flagged || c.refusal_split).sort((a, b) => (b.drift || 0) - (a.drift || 0))[0] || Object.values(data.cells)[0];
    if (first) show(first.model + '|' + first.qid, false);
  }
})();
