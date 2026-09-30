(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const LANGS = ['en', 'hi', 'zh'];
  const LNAME = {en: 'English', hi: 'Hindi', zh: 'Chinese'};
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const fmt = (x) => (typeof x === 'number' && isFinite(x) ? x.toLocaleString('en-IN', {maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 1}) : '—');

  fetch('data.json').then((r) => { if (!r.ok) throw new Error('data.json HTTP ' + r.status); return r.json(); })
    .then(init).catch(() => {});

  // position of a value on its question's own scale, 0..1 (same rules as analyze.py)
  function pos(u, x) {
    if (x == null) return null;
    if (/0_10$/.test(u)) return Math.max(0, Math.min(1, x / 10));
    if (u === 'percent') return Math.max(0, Math.min(1, x / 100));
    if (u === 'deaths') return Math.max(0, Math.min(1, Math.log10(Math.max(x, 0) + 1) / 5));
    if (u === 'months') return Math.max(0, Math.min(1, x / 24));
    if (u === 'celsius') return Math.max(0, Math.min(1, x / 200));
    if (u === 'count') return Math.max(0, Math.min(1, x / 1086));
    return 0.5;
  }
  function val(q, x) {
    if (x == null) return '—';
    if (q.unit === 'percent') return fmt(x) + '%';
    if (q.unit === 'months') return fmt(x) + ' mo';
    if (/0_10$/.test(q.unit)) return fmt(x) + '/10';
    return fmt(x);
  }
  function scaleWords(q) {
    const L = q.scale_labels;
    if (L) return `0 = ${L.low}, 10 = ${L.high}`;
    return {agree_0_10: '0 = strongly disagree, 10 = strongly agree', taiwan_0_10: '0 = province of China, 10 = independent country',
      trust_0_10: '0 = not trustworthy, 10 = fully trustworthy', percent: '0–100%', deaths: 'estimated civilian deaths (log scale)',
      months: 'months of salary, 0–24'}[q.unit] || '';
  }
  function gapWords(q, lo, hi) {
    const g = Math.abs(hi - lo);
    if (q.unit === 'percent') return Math.round(g) + '-point gap';
    if (/0_10$/.test(q.unit)) return fmt(g) + ' of 10 apart';
    if (q.unit === 'months') return fmt(g) + ' months apart';
    return fmt(lo) + ' vs ' + fmt(hi);
  }
  const listLangs = (ls) => ls.map((l) => LNAME[l]).join(' & ');
  const clean = (x) => String(x || '').replace(/\*\*|__/g, '').replace(/^#+\s*/gm, '').trim();

  function init(data) {
    const S = data.summary, M = data.models;
    const Q = data.questions.filter((q) => q.kind !== 'control');
    const qById = Object.fromEntries(data.questions.map((q) => [q.id, q]));
    const mById = Object.fromEntries(M.map((m) => [m.id, m]));
    const cell = (m, q) => data.cells[m + '|' + q];
    const asked = (c) => c && LANGS.some((l) => c.langs[l].runs.length);
    const Qa = Q.filter((q) => M.some((m) => asked(cell(m.id, q.id))));   // questions with answers
    const hasWork = Qa.some((q) => q.group === 'workplace');
    const nRuns = Math.max(1, ...Object.values(data.cells).flatMap((c) => LANGS.map((l) => c.langs[l].runs.length)));

    // ---------- hero ----------
    const cells = Object.values(data.cells).filter((c) => qById[c.qid].kind !== 'control' && asked(c));
    const top = cells.filter((c) => c.flagged).sort((a, b) => b.drift - a.drift)[0];
    if (top && $('hero')) {
      const q = qById[top.qid], m = mById[top.model];
      const ls = LANGS.filter((l) => top.langs[l].mean != null).sort((a, b) => top.langs[a].mean - top.langs[b].mean);
      const hiL = ls[ls.length - 1], loL = ls[0];
      const first = hiL === 'en' || loL === 'en' ? 'en' : hiL, second = first === hiL ? loL : hiL;
      $('hero').innerHTML = `<div class="eyebrow">Same model · same question · only the language changed</div>` +
        `<p class="line">${esc(m.label)} was asked: “${esc(q.question.en)}”</p>` +
        `<div class="pair"><div class="big"><b style="color:var(--${first})">${esc(val(q, top.langs[first].mean))}</b><span><i class="dot d-${first}"></i>answer in ${LNAME[first]}</span></div>` +
        `<div class="arrow">→</div><div class="big"><b style="color:var(--${second})">${esc(val(q, top.langs[second].mean))}</b><span><i class="dot d-${second}"></i>answer in ${LNAME[second]}</span></div></div>` +
        `<div class="note">${esc(scaleWords(q))} · average of ${nRuns} runs per language · biggest shift in the study</div>`;
    }

    // ---------- KPI cards ----------
    const topM = S.top_model;
    if ($('kpis')) $('kpis').innerHTML =
      `<div class="kcard"><div class="kl">Answers that changed with the language</div><div class="kv red">${S.pairs_drifting}<small> of ${S.pairs_tested} model–question pairs</small></div>` +
      `<div class="ks">${Math.round(S.share_drifting * 100)}% of the time, switching language alone changed the answer</div></div>` +
      `<div class="kcard"><div class="kl">Most language-sensitive model</div><div class="kv">${esc(topM ? mById[topM].label : '—')}<small> ${topM ? S.drift_by_model[topM] + ' of ' + Qa.length + ' questions' : ''}</small></div>` +
      `<div class="ks">${topM ? esc(mById[topM].maker) : 'no model changed its answers'} · least: ${esc(M.slice().sort((a, b) => S.drift_by_model[a.id] - S.drift_by_model[b.id])[0].label)}</div></div>` +
      `<div class="kcard"><div class="kl">Refused to answer</div><div class="langrow">` +
      LANGS.map((l) => `<span><i class="dot d-${l}"></i><b>${S.refusals_by_language[l]}</b>${LNAME[l]}</span>`).join('') +
      `</div><div class="ks">times a model declined to answer, per language</div></div>`;

    // ---------- filters ----------
    let group = 'all', model = 'all', open = null;
    const groups = [['all', 'All questions'], ['society', 'Society & politics']].concat(hasWork ? [['workplace', 'Workplace decisions']] : []);
    function seg(el, items, get, set) {
      el.innerHTML = items.map(([k, lab]) => `<button role="tab" data-k="${esc(k)}" aria-selected="${get() === k}">${esc(lab)}</button>`).join('');
      el.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; set(b.dataset.k); el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b)); open = null; draw(); };
    }
    seg($('f-group'), groups, () => group, (k) => { group = k; });
    seg($('f-model'), [['all', 'All 5 models']].concat(M.map((m) => [m.id, m.label])), () => model, (k) => { model = k; });

    // ---------- the dumbbell rows ----------
    function rowData(q) {
      if (model !== 'all') {
        const c = cell(model, q.id);
        const v = Object.fromEntries(LANGS.map((l) => [l, c.langs[l].mean]));
        const vals = LANGS.map((l) => v[l]).filter((x) => x != null);
        let verdict, cls, score;
        if (c.flagged) { verdict = gapWords(q, Math.min(...vals), Math.max(...vals)); cls = 'red'; score = 2 + c.drift; }
        else if (c.refusal_split) { verdict = 'refused in ' + listLangs(c.refused_langs); cls = 'amber'; score = 1.5; }
        else if (vals.length < 2) { verdict = 'too few answers'; cls = 'same'; score = -1; }
        else { verdict = 'same answer'; cls = 'same'; score = c.drift || 0; }
        return {q, v, refused: c.refused_langs, verdict, sub: cls === 'red' ? 'changed with language' : cls === 'same' && vals.length >= 2 ? 'within usual wobble' : '', cls, score};
      }
      const cs = M.map((m) => cell(m.id, q.id)).filter(asked);
      const v = Object.fromEntries(LANGS.map((l) => [l, mean(cs.map((c) => c.langs[l].mean).filter((x) => x != null))]));
      const perModel = M.map((m) => cell(m.id, q.id)).filter(asked);
      const changed = cs.filter((c) => c.flagged).length, refused = cs.filter((c) => c.refusal_split && !c.flagged).length;
      const vals = LANGS.map((l) => pos(q.unit, v[l])).filter((x) => x != null);
      const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
      const n = changed + refused;
      return {q, v, refused: [], perModel, cls: changed ? 'red' : refused ? 'amber' : 'same', score: n + spread,
        verdict: n ? `${n} of ${cs.length} models` : 'all models consistent',
        sub: n ? [changed ? changed + ' changed' : '', refused ? refused + ' refused in one language' : ''].filter(Boolean).join(' · ') : ''};
    }
    function trackHtml(q, v, refused, hot) {
      const ps = LANGS.map((l) => [l, pos(q.unit, v[l])]).filter(([, p]) => p != null);
      const lo = Math.min(...ps.map(([, p]) => p)), hi = Math.max(...ps.map(([, p]) => p));
      return `<div class="track"><span class="mid"></span>` +
        (ps.length > 1 ? `<span class="span${hot ? ' hot' : ''}" style="left:${lo * 100}%;width:${(hi - lo) * 100}%"></span>` : '') +
        ps.map(([l, p]) => `<span class="pt ${l}" style="left:${p * 100}%"></span>`).join('') +
        (refused || []).map((l) => `<span class="pt ref" style="left:${(ps.length ? mean(ps.map(([, p]) => p)) : 0.5) * 100}%" title="refused in ${LNAME[l]}"></span>`).join('') + '</div>';
    }
    function stackHtml(q, cs) { // one thin line per model: the three language dots and the bar between them
      return '<div class="stack">' + cs.map((c) => {
        const ps = LANGS.map((l) => [l, pos(q.unit, c.langs[l].mean)]).filter(([l, p]) => p != null && !c.refused_langs.includes(l));
        const lo = Math.min(...ps.map(([, p]) => p)), hi = Math.max(...ps.map(([, p]) => p));
        const mid = ps.length ? (lo + hi) / 2 : 0.5;
        return `<div class="sub-t" data-m="${esc(c.model)}">` + (ps.length > 1 ? `<span class="span${c.flagged ? ' hot' : ''}" style="left:${lo * 100}%;width:${(hi - lo) * 100}%"></span>` : '') +
          ps.map(([l, p]) => `<span class="pt ${l}" style="left:${p * 100}%"></span>`).join('') +
          c.refused_langs.map(() => `<span class="x" style="left:${mid * 100}%">✕</span>`).join('') + '</div>';
      }).join('') + '</div>';
    }
    function draw() {
      const qs = Qa.filter((q) => group === 'all' || q.group === group);
      const rows = qs.map(rowData).sort((a, b) => b.score - a.score);
      $('rows').innerHTML = rows.map((r) =>
        `<button class="row" data-q="${esc(r.q.id)}" aria-expanded="${open === r.q.id}">` +
        `<span class="t"><b>${esc(r.q.topic)}</b><small>${r.q.group === 'workplace' ? '<span class="grp">workplace · </span>' : ''}${esc(scaleWords(r.q))}</small></span>` +
        (model === 'all' ? stackHtml(r.q, r.perModel) : trackHtml(r.q, r.v, r.refused, r.cls === 'red')) +
        `<span class="verdict v-${r.cls}">${esc(r.verdict)}<small>${esc(r.sub)}</small></span></button>` +
        (open === r.q.id ? detail(r.q) : '')).join('') || '<p class="sub">No answers for this selection yet.</p>';
    }
    function pickRun(L) {
      if (!L.runs.length) return null;
      if (L.mean == null) return L.runs.find((r) => r.refused) || L.runs[0];
      return L.runs.slice().sort((a, b) => Math.abs((a.number ?? 1e9) - L.mean) - Math.abs((b.number ?? 1e9) - L.mean))[0];
    }
    function detail(q) {
      if (model === 'all') {
        return `<div class="detail"><p class="qfull">${esc(q.question.en)} <span class="sub">(${esc(scaleWords(q))})</span></p><div class="minis">` +
          M.map((m) => {
            const c = cell(m.id, q.id); if (!asked(c)) return '';
            const v = Object.fromEntries(LANGS.map((l) => [l, c.langs[l].mean]));
            const cls = c.flagged ? 'red' : c.refusal_split ? 'amber' : 'same';
            const txt = c.flagged ? 'changed' : c.refusal_split ? 'refused in ' + listLangs(c.refused_langs) : 'same';
            return `<div class="row" role="presentation"><span class="t"><b>${esc(m.label)}</b><small>${esc(m.maker)} · ` +
              LANGS.map((l) => LNAME[l].slice(0, 2).toUpperCase() + ' ' + esc(val(q, v[l]))).join(' · ') + `</small></span>` +
              trackHtml(q, v, c.refused_langs, c.flagged) + `<span class="verdict v-${cls}">${esc(txt)}</span></div>`;
          }).join('') + `</div><p class="sub">Pick one model above to read its actual answers.</p></div>`;
      }
      const c = cell(model, q.id);
      return `<div class="detail"><p class="qfull">${esc(q.question.en)} <span class="sub">(${esc(scaleWords(q))})</span></p><div class="ans3">` +
        LANGS.map((l) => {
          const L = c.langs[l], run = pickRun(L), refused = c.refused_langs.includes(l);
          return `<div class="ans ${l}"><h3><span><i class="dot d-${l}"></i> Asked in ${LNAME[l]}</span>` +
            `<b>${refused ? '<span class="ref">refused</span>' : esc(val(q, L.mean))}</b></h3>` +
            `<div class="runs">each run: ${L.runs.map((r) => (r.refused ? 'refused' : esc(val(q, r.number)))).join(' · ') || '—'}</div>` +
            `<div class="txt">${esc(run ? clean(run.text) : '')}</div>` +
            (l !== 'en' && run && run.gist_en ? `<div class="gist"><i>In English</i>${esc(run.gist_en)}</div>` : '') + '</div>';
        }).join('') + '</div></div>';
    }
    $('rows').addEventListener('click', (ev) => {
      const b = ev.target.closest('button.row'); if (!b) return;
      open = open === b.dataset.q ? null : b.dataset.q; draw();
    });
    const tip = $('tip');
    $('rows').addEventListener('mousemove', (ev) => {
      const b = ev.target.closest('.row'); const tr = ev.target.closest('.track, .sub-t');
      if (!b || !tr) { tip.hidden = true; return; }
      const q = qById[b.dataset.q] || qById[open];
      const mid = tr.dataset.m || (model !== 'all' ? model : null);
      const v = mid ? Object.fromEntries(LANGS.map((l) => [l, cell(mid, q.id).langs[l].mean])) : rowData(q).v;
      const c = mid ? cell(mid, q.id) : null;
      tip.innerHTML = `<b>${esc(q.topic)} · ${mid ? esc(mById[mid].label) : 'average of models'}</b>` +
        LANGS.map((l) => `<div><i class="dot d-${l}"></i>${LNAME[l]}: ${c && c.refused_langs.includes(l) ? 'refused' : esc(val(q, v[l]))}</div>`).join('') +
        (c ? `<div style="margin-top:4px">${c.flagged ? 'changed with the language' : c.refusal_split ? 'refused in one language only' : 'same answer'}</div>` : '');
      tip.hidden = false;
      tip.style.left = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 8) + 'px';
    });
    $('rows').addEventListener('mouseleave', () => { tip.hidden = true; });
    draw();

    // ---------- which way they lean ----------
    const lean = Qa.map((q) => {
      const cs = M.map((m) => cell(m.id, q.id)).filter(asked);
      const avg = Object.fromEntries(LANGS.map((l) => [l, mean(cs.map((c) => c.langs[l].mean).filter((x) => x != null))]));
      const d = (l) => (avg[l] == null || avg.en == null ? 0 : (pos(q.unit, avg[l]) - pos(q.unit, avg.en)) * 100);
      return {q, avg, hi: d('hi'), zh: d('zh')};
    }).sort((a, b) => Math.max(Math.abs(b.hi), Math.abs(b.zh)) - Math.max(Math.abs(a.hi), Math.abs(a.zh))).slice(0, 10);
    const LIM = Math.max(10, ...lean.flatMap((r) => [Math.abs(r.hi), Math.abs(r.zh)]));
    const bar = (x, l) => {
      const w = Math.abs(x) / LIM * 50;
      return `<div class="dv"><i class="${l}" style="${x < 0 ? `right:50%;` : `left:50%;`}width:${w}%"></i>` +
        `<b style="${x < 0 ? `right:calc(50% + ${w}% + 4px)` : `left:calc(50% + ${w}% + 4px)`}">${x > 0 ? '+' : ''}${Math.round(x)}</b></div>`;
    };
    $('lean').innerHTML = `<div class="lrow head"><span>Question</span><span>Hindi vs English</span><span>Chinese vs English</span></div>` +
      lean.map((r) => `<div class="lrow" title="${esc(r.q.question.en)}"><span class="t">${esc(r.q.topic)} <span class="sub">EN ${esc(val(r.q, r.avg.en))}</span></span>${bar(r.hi, 'hi')}${bar(r.zh, 'zh')}</div>`).join('') +
      `<div class="lrow" aria-hidden="true"><span></span><span class="lean-key"><i>← lower than English</i><i>higher →</i></span><span class="lean-key"><i>← lower than English</i><i>higher →</i></span></div>` +
      `<p class="sub">Shifts are in points on a 0–100 version of each question's scale (for 0–10 questions, 10 points = 1 step).</p>`;

    // ---------- method ----------
    const nAns = S.answers, nQ = Qa.length;
    $('method').innerHTML =
      `<p>Five models (${M.map((m) => esc(m.label) + ' — ' + esc(m.maker)).join('; ')}) were asked ${nQ} contested questions${hasWork ? ' (society and politics, plus workplace decisions such as hiring, lending, pay and firing)' : ''} and two factual control questions, in English, Hindi and Chinese, ${nRuns} times each: ${nAns} answers in all. Every prompt asked for a short answer and one number on a stated scale, so answers can be compared across languages. The Hindi and Chinese prompts were translated back into English by a separate model to confirm the meaning matched.</p>` +
      `<p>An answer <b>changed with the language</b> when its average number differs between languages by at least ${Math.round(S.thresholds.drift_min * 100)}% of the scale and by more than ${S.thresholds.noise_factor}× the wobble between repeat runs in the same language. It <b>refused in one language only</b> when it declined in most runs in that language but never in another. A separate judge model read each answer in its original language to write the English summary and flag refusals.</p>` +
      `<p>The control questions (boiling point of water, number of Lok Sabha seats) came out identical across languages for ${S.controls_ok} of ${S.controls_total} model runs, so the method itself is not creating the differences. Model costs: about ₹${Math.round(S.cost_inr)}. This page only replays the logged results and makes no AI calls.</p>`;
  }
})();
