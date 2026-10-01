// Answer table: every question as a small sheet (rows = AIs, columns = languages),
// each cell the AI's plain answer, coloured green (agrees) or red (the odd one out).
// "Changed" uses the same rule as the rest of the page: flagged || refusal_split.
(function () {
  'use strict';
  const LANGS = ['en', 'hi', 'zh'];
  const LANG = {en: 'English', hi: 'Hindi', zh: 'Chinese'};
  const SCRIPT = {en: 'English', hi: 'हिन्दी', zh: '中文'};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const fmt = (x) => (typeof x === 'number' && isFinite(x) ? x.toLocaleString('en-IN', {maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 1}) : '—');

  // What a person would hear, plus the score it came from.
  function labelOf(q, c, l) {
    const L = c.langs[l];
    if (c.refused_langs.includes(l) || (L.mean == null && L.refusals)) return {text: 'Refused', score: ''};
    if (L.mean == null) return {text: 'No clear answer', score: ''};
    const p = q.plain || {};
    if (q.unit === 'months') return {text: 'About ' + fmt(L.mean) + ' months’ pay', score: ''};
    if (q.unit === 'deaths') return {text: 'About ' + fmt(L.mean) + ' deaths', score: ''};
    if (!p.high) return {text: q.unit === 'percent' ? fmt(L.mean) + '%' : fmt(L.mean), score: ''};
    const x = q.unit === 'percent' ? L.mean / 10 : L.mean;
    const score = q.unit === 'percent' ? fmt(L.mean) + '%' : fmt(L.mean) + '/10';
    if (x >= 6.5) return {text: p.high, score};
    if (x <= 3.5) return {text: p.low, score};
    return {text: 'It depends', score};
  }

  // Binary colours: green agrees, red is the odd one out.
  function coloursFor(c, q) {
    const out = {en: 'green', hi: 'green', zh: 'green'};
    if (c.refusal_split) { c.refused_langs.forEach((l) => { out[l] = 'red'; }); return out; }
    if (!c.flagged) return out;
    // What the reader sees comes first: if two answers read the same and one reads differently, that one is red.
    if (q) {
      const t = Object.fromEntries(LANGS.map((l) => [l, labelOf(q, c, l).text]));
      const odd = LANGS.filter((l) => LANGS.filter((k) => t[k] === t[l]).length === 1);
      if (odd.length === 1) { out[odd[0]] = 'red'; return out; }
    }
    // Otherwise (all read the same, or all differ): the language on the far side of the biggest gap in scores.
    const pts = LANGS.filter((l) => c.langs[l].mean != null).map((l) => [l, c.langs[l].mean]).sort((a, b) => a[1] - b[1]);
    if (pts.length < 3) { if (pts.length === 2) out[pts[1][0]] = 'red'; return out; }
    const g1 = pts[1][1] - pts[0][1], g2 = pts[2][1] - pts[1][1];
    if (g1 >= g2) out[pts[0][0]] = 'red';
    if (g2 >= g1) out[pts[2][0]] = 'red';
    return out;
  }

  window.LDAnswers = {labelOf, coloursFor};
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return;
  fetch('data.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(render).catch(() => {
    const el = document.getElementById('answers'); if (el) el.hidden = true;
  });

  function render(data) {
    const el = document.getElementById('answers');
    if (!el) return;
    const M = data.models;
    const Q = data.questions.filter((q) => q.kind !== 'control');
    const cell = (m, q) => data.cells[m + '|' + q];
    const asked = (c) => c && LANGS.some((l) => c.langs[l].runs.length);
    const changed = (c) => c.flagged || c.refusal_split;

    const items = Q.map((q) => {
      const cs = M.map((m) => ({m, c: cell(m.id, q.id)})).filter((x) => asked(x.c));
      const n = cs.filter((x) => changed(x.c)).length;
      cs.sort((a, b) => changed(b.c) - changed(a.c));   // AIs that changed first
      return {q, cs, n};
    }).filter((x) => x.cs.length)
      .sort((a, b) => (b.n > 0) - (a.n > 0) || ((b.q.group === 'workplace') - (a.q.group === 'workplace')) || b.n - a.n);

    const total = items.reduce((s, x) => s + x.cs.length, 0);
    const nChanged = items.reduce((s, x) => s + x.n, 0);
    let filter = 'all';

    function scaleNote(q) {
      const p = q.plain || {};
      if (p.high && /0_10$/.test(q.unit)) return `0–10, where 10 = “${p.high}”`;
      if (p.high && q.unit === 'percent') return `0–100%, where 100% = “${p.high}”`;
      return '';
    }
    function block(x) {
      const q = x.q;
      const rows = x.cs.map(({m, c}) => {
        const col = coloursFor(c, q);
        return `<tr class="${changed(c) ? 'chg' : ''}"><th scope="row">${esc(m.label)}<small>${esc(m.maker)}</small></th>` +
          LANGS.map((l) => {
            const a = labelOf(q, c, l);
            return `<td class="a-${col[l]}"><span class="say">${esc(a.text)}</span>${a.score ? `<span class="sc">${esc(a.score)}</span>` : ''}</td>`;
          }).join('') + '</tr>';
      }).join('');
      const tag = x.n ? `<span class="qtag on">${x.n} of ${x.cs.length} AIs changed their answer</span>` : `<span class="qtag">Same answer from every AI</span>`;
      return `<article class="qblock" data-g="${esc(q.group || 'society')}" data-n="${x.n}">` +
        `<header><h3>“${esc((q.plain && q.plain.question) || q.question.en)}”</h3>` +
        `<p>${q.group === 'workplace' ? '<span class="grp">Workplace</span>' : '<span class="grp soc">Society &amp; politics</span>'}${tag}${scaleNote(q) ? `<span class="scale">${esc(scaleNote(q))}</span>` : ''}</p></header>` +
        `<div class="atwrap"><table class="at"><thead><tr><th scope="col">AI</th>` +
        LANGS.map((l) => `<th scope="col"><i class="dot d-${l}"></i>${LANG[l]}<small>${SCRIPT[l] === LANG[l] ? '' : SCRIPT[l]}</small></th>`).join('') +
        `</tr></thead><tbody>${rows}</tbody></table></div></article>`;
    }
    function draw() {
      const shown = items.filter((x) => filter === 'all' || (filter === 'changed' ? x.n > 0 : (x.q.group || 'society') === filter));
      document.getElementById('at-list').innerHTML = shown.map(block).join('');
    }
    const chips = [['all', 'All 30 questions'], ['changed', 'Only where an AI changed'], ['workplace', 'Workplace'], ['society', 'Society & politics']];
    el.innerHTML =
      `<div class="at-head"><h2>Every question, every AI, all three languages</h2>` +
      `<p class="sub">Each table is one question. Each row is one AI’s answer in English, Hindi and Chinese. ` +
      `<span class="key key-green">Green</span> the answers agree. <span class="key key-red">Red</span> the odd one out: the language where the AI changed its advice, or refused. ` +
      `${nChanged} of ${total} rows have a red answer.</p>` +
      `<div class="seg at-chips" role="tablist" aria-label="Filter questions">` +
      chips.map(([k, lab]) => `<button role="tab" data-k="${k}" aria-selected="${k === filter}">${esc(lab)}</button>`).join('') + `</div></div>` +
      `<div id="at-list" class="at-list"></div>`;
    el.querySelector('.at-chips').addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      filter = b.dataset.k;
      el.querySelectorAll('.at-chips button').forEach((x) => x.setAttribute('aria-selected', x === b));
      draw();
    });
    draw();
  }
})();
