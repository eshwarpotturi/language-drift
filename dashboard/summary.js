// Results at a glance: three small charts under the headline, plus the refusals chart in step 4.
// Reads the same data.json as story.js and counts the same way, so the numbers always match.
(function () {
  'use strict';
  const LANGS = ['en', 'hi', 'zh'];
  const LANG = {en: 'English', hi: 'Hindi', zh: 'Chinese'};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  fetch('data.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(init).catch(() => {
    const g = document.getElementById('glance'); if (g) g.hidden = true;
  });

  function refusalChart(S, big) {
    const R = S.refusals_by_language || {};
    const max = Math.max(1, ...LANGS.map((l) => R[l] || 0));
    const top = LANGS.reduce((a, l) => ((R[l] || 0) > (R[a] || 0) ? l : a), 'en');
    return `<div class="cols${big ? ' big' : ''}" role="img" aria-label="${esc(LANGS.map((l) => LANG[l] + ' ' + (R[l] || 0)).join(', '))} refusals">` +
      LANGS.map((l) => `<div class="col c-${l}${l === top ? ' top' : ''}"><b>${R[l] || 0}</b><span class="colbar"><i style="height:${((R[l] || 0) / max) * 100}%"></i></span><small>${LANG[l]}</small></div>`).join('') + '</div>';
  }

  function init(data) {
    const M = data.models, S = data.summary;
    const qById = Object.fromEntries(data.questions.map((q) => [q.id, q]));
    const answered = Object.values(data.cells).filter((c) => qById[c.qid].kind !== 'control' && LANGS.some((l) => c.langs[l].runs.length));
    const hit = (c) => c.flagged || c.refusal_split;
    const work = answered.filter((c) => qById[c.qid].group === 'workplace');
    const soc = answered.filter((c) => qById[c.qid].group !== 'workplace');
    const nAll = answered.filter(hit).length, nW = work.filter(hit).length, nS = soc.filter(hit).length;
    const nQ = new Set(answered.map((c) => c.qid)).size;

    const byModel = M.map((m) => ({m, n: answered.filter((c) => c.model === m.id && hit(c)).length})).sort((a, b) => b.n - a.n);
    const maxM = Math.max(1, ...byModel.map((x) => x.n));

    const bar = (label, n, d, strong) => `<div class="gbar${strong ? ' strong' : ''}"><span class="gl">${esc(label)}</span>` +
      `<span class="gt"><i style="width:${pct(n, d)}%"></i></span><span class="gv"><b>${pct(n, d)}%</b> <small>${n}/${d}</small></span></div>`;

    const g = document.getElementById('glance');
    if (g) {
      g.innerHTML =
        `<a class="gpanel" href="#s-often"><h2>Advice changed with the language</h2>` +
          `<p class="gbig"><b>${pct(nAll, answered.length)}%</b><span>of ${answered.length} AI × question tests</span></p>` +
          (work.length ? bar('Workplace', nW, work.length, true) : '') + bar('Society & politics', nS, soc.length) +
          `<span class="gmore">See every test</span></a>` +
        `<a class="gpanel" href="#s-models"><h2>Times each AI changed its advice</h2><p class="gsub">out of ${nQ} questions</p>` +
          `<div class="mbars">` + byModel.map(({m, n}) => `<div class="mb"><span class="gl">${esc(m.label)}</span><span class="gt"><i style="width:${(n / maxM) * 100}%"></i></span><b>${n}</b></div>`).join('') + `</div>` +
          `<span class="gmore">Compare the AIs</span></a>` +
        `<a class="gpanel" href="#s-models"><h2>Refused to answer</h2><p class="gsub">all ${M.length} AIs, by language</p>` +
          refusalChart(S, false) + `<span class="gmore">See refusals</span></a>`;
    }
    const r = document.getElementById('refusals');
    if (r) r.innerHTML = `<h3>Refusals by language, all ${M.length} AIs</h3>` + refusalChart(S, true);
  }
})();
