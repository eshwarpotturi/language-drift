(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const LANGS = ['en', 'hi', 'zh'];
  const LANG = {en: 'English', hi: 'Hindi', zh: 'Chinese'};
  const WORDS = ['', 'once', 'twice'];

  fetch('data.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(init).catch((e) => { $('hero-card').textContent = 'Could not load the results (' + e.message + ').'; });

  const fmt = (x) => (typeof x === 'number' && isFinite(x) ? x.toLocaleString('en-IN', {maximumFractionDigits: 1}) : '—');

  // Turn a language's average answer into what a person would hear.
  function verdict(q, c, l) {
    const L = c.langs[l];
    if (c.refused_langs.includes(l) || (L.mean == null && L.refusals)) return {key: 'refused', text: 'Refused to answer'};
    if (L.mean == null) return {key: 'none', text: 'No clear answer'};
    const p = q.plain || {};
    if (!p.high) { // number questions without a yes/no reading: say the number
      const unit = q.unit === 'months' ? ' months’ pay' : q.unit === 'percent' ? '%' : q.unit === 'deaths' ? ' people' : '';
      return {key: 'value', text: 'About ' + fmt(L.mean) + unit, value: L.mean};
    }
    const x = q.unit === 'percent' ? L.mean / 10 : L.mean;   // 0-10 either way
    if (x >= 6.5) return {key: 'high', text: p.high};
    if (x <= 3.5) return {key: 'low', text: p.low};
    return {key: 'mid', text: 'It depends'};
  }
  function differs(q, c) {
    const vs = LANGS.map((l) => verdict(q, c, l));
    if (vs.every((v) => v.key === 'value')) {
      const xs = vs.map((v) => v.value);
      return Math.max(...xs) >= 2 * Math.max(0.5, Math.min(...xs));   // e.g. 5 months vs 1.5 months
    }
    return new Set(vs.map((v) => v.key)).size > 1;
  }
  function gistFor(c, l) {
    const L = c.langs[l];
    if (!L.runs.length) return '';
    const run = L.mean == null ? (L.runs.find((r) => r.refused) || L.runs[0])
      : L.runs.slice().sort((a, b) => Math.abs((a.number ?? 1e9) - L.mean) - Math.abs((b.number ?? 1e9) - L.mean))[0];
    return (run && run.gist_en) || '';
  }
  const tone = (v) => (v.key === 'high' ? 'yes' : v.key === 'low' ? 'no' : v.key === 'refused' ? 'ref' : 'mid');

  function card(q, c, m, big) {
    const vs = Object.fromEntries(LANGS.map((l) => [l, verdict(q, c, l)]));
    const rows = LANGS.map((l) => `<div class="ans t-${tone(vs[l])}"><span class="lang"><i class="flag f-${l}"></i>${LANG[l]}</span>` +
      `<span class="say">${esc(vs[l].text)}</span>` + (big ? `<span class="gist">${esc(gistFor(c, l))}</span>` : '') + '</div>').join('');
    const keys = new Set(LANGS.map((l) => vs[l].key));
    const punch = keys.has('refused') ? 'Same AI, same question: it answered in some languages and refused in another.'
      : keys.has('high') && keys.has('low') ? 'Same AI, same question: opposite advice.'
        : 'Same AI, same question: different advice.';
    return `<article class="card${big ? ' big' : ''}">` +
      `<p class="asked">Asked to <b>${esc(m.label)}</b> <span>(${esc(m.maker.split(' · ')[0])})</span></p>` +
      `<p class="q">“${esc((q.plain && q.plain.question) || q.question.en)}”</p>` +
      `<div class="three">${rows}</div><p class="punch">${esc(punch)}</p></article>`;
  }

  function init(data) {
    const M = data.models, S = data.summary;
    const qById = Object.fromEntries(data.questions.map((q) => [q.id, q]));
    const mById = Object.fromEntries(M.map((m) => [m.id, m]));
    const nModels = M.length;
    const answered = Object.values(data.cells).filter((c) => qById[c.qid].kind !== 'control' && LANGS.some((l) => c.langs[l].runs.length));
    const nQuestions = new Set(answered.map((c) => c.qid)).size;

    // ---------- 1 + 2: story cards (only real findings, whose plain answers really differ) ----------
    const found = answered.filter((c) => (c.flagged || c.refusal_split) && differs(qById[c.qid], c))
      .map((c) => {
        const q = qById[c.qid], vs = LANGS.map((l) => verdict(q, c, l).key);
        const opposite = vs.includes('high') && vs.includes('low');
        return {c, q, score: (q.group === 'workplace' ? 2 : 0) + (opposite ? 1.5 : 0) + (c.refusal_split ? 0.8 : 0) + (c.drift || 0)};
      }).sort((a, b) => b.score - a.score);
    const picked = [], seen = new Set();
    for (const f of found) { if (!seen.has(f.q.id)) { picked.push(f); seen.add(f.q.id); } if (picked.length === 7) break; }
    if (picked.length) {
      const h = picked[0];
      $('hero-card').innerHTML = card(h.q, h.c, mById[h.c.model], true);
      $('cards').innerHTML = picked.slice(1).map((f) => card(f.q, f.c, mById[f.c.model], false)).join('');
    } else {
      $('hero-card').textContent = 'In this test, every AI gave the same advice in all three languages.';
    }

    // ---------- 3: how often ----------
    const work = answered.filter((c) => qById[c.qid].group === 'workplace');
    const soc = answered.filter((c) => qById[c.qid].group !== 'workplace');
    const hit = (c) => c.flagged || c.refusal_split;
    const ratio = (n, d) => (n ? Math.max(1, Math.round(d / n)) : 0);
    const total = answered.length, nHit = answered.filter(hit).length;
    $('often-h').textContent = nHit ? `About 1 in ${ratio(nHit, total)} times, just changing the language changed the advice` : 'The language never changed the advice';
    const waffle = (list, title) => {
      const n = list.filter(hit).length;
      const rank = (c) => (c.refusal_split && !c.flagged ? 0 : c.flagged ? 1 : c.drift == null ? 3 : 2);
      const sorted = list.slice().sort((a, b) => rank(a) - rank(b));
      return `<div class="wf"><h3>${esc(title)}</h3><p class="big-n"><b>${n}</b> of ${list.length}${n ? ` <span>· about 1 in ${ratio(n, list.length)}</span>` : ''}</p>` +
        `<div class="squares" role="img" aria-label="${esc(n + ' of ' + list.length + ' changed')}">` +
        sorted.map((c) => `<i class="${c.flagged ? 'r' : c.refusal_split ? 'a' : c.drift == null ? 'n' : 'g'}" title="${esc(mById[c.model].label + ': ' + ((qById[c.qid].plain || {}).question || qById[c.qid].topic))}"></i>`).join('') + '</div></div>';
    };
    $('often').innerHTML = (work.length ? waffle(work, 'Workplace decisions (hiring, firing, pay, lending, pricing)') : '') +
      waffle(soc, 'Society and politics') +
      `<p class="how">Each square is one AI answering one question in all three languages. <span class="kr">Red</span>: the advice changed with the language. <span class="ka">Amber</span>: it refused in one language but answered in another. <span class="kg">Green</span>: same advice in every language.${answered.some((c) => !hit(c) && c.drift == null) ? ' <span class="kn">Grey</span>: not enough comparable answers.' : ''} Each question was asked ${nRunsText(data)} per language so we could separate real changes from normal randomness.</p>`;

    // ---------- 4: which AI ----------
    const byModel = M.map((m) => ({m, n: answered.filter((c) => c.model === m.id && hit(c)).length}))
      .sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...byModel.map((x) => x.n));
    $('models').innerHTML = byModel.map(({m, n}) => `<div class="mrow"><span class="who"><b>${esc(m.label)}</b><small>${esc(m.maker)}</small></span>` +
      `<span class="mbar"><i style="width:${n / max * 100}%"></i></span><span class="said">${n === 0 ? 'never' : n < 3 ? WORDS[n] : n + ' times'}</span></div>`).join('') +
      `<p class="how">Refusals also depended on the language: across all AIs, ${S.refusals_by_language.en} refusals in English, ${S.refusals_by_language.hi} in Hindi and <b>${S.refusals_by_language.zh} in Chinese</b>.</p>`;

    $('lede').textContent = `We asked ${nModels} popular AI assistants the same ${nQuestions} questions in English, Hindi and Chinese — about workplace decisions and about society. Same AI, same question, only the language changed. Sometimes the advice flipped.`;
  }
  function nRunsText(data) {
    const n = Math.max(1, ...Object.values(data.cells).flatMap((c) => LANGS.map((l) => c.langs[l].runs.length)));
    return n + ' times';
  }
})();
