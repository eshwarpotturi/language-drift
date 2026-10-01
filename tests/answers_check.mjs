import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../dashboard/answers.js', import.meta.url), 'utf8');
const ctx = {window: {}};
vm.runInNewContext(src, ctx);
const {labelOf, coloursFor} = ctx.window.LDAnswers;
const data = JSON.parse(fs.readFileSync(new URL('../dashboard/data.json', import.meta.url), 'utf8'));
const Q = Object.fromEntries(data.questions.map((x) => [x.id, x]));
const cells = Object.values(data.cells).filter((c) => Q[c.qid].kind !== 'control');
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
const ok = (c, m) => c || fail(m);
const LANGS = ['en', 'hi', 'zh'];

let redRows = 0; const byModel = {};
for (const c of cells) {
  const col = coloursFor(c, Q[c.qid]);
  ok(LANGS.every((l) => col[l] === 'red' || col[l] === 'green'), 'binary colours only ' + c.model + c.qid);
  const reds = LANGS.filter((l) => col[l] === 'red');
  const changed = c.flagged || c.refusal_split;
  ok(changed ? reds.length >= 1 : reds.length === 0, 'red iff changed ' + c.model + '|' + c.qid);
  if (c.flagged && !c.refusal_split) ok(reds.length <= 2, 'odd one out, not all three ' + c.model + c.qid);
  if (c.refusal_split) ok(c.refused_langs.every((l) => col[l] === 'red'), 'refused language red');
  if (reds.length) { redRows++; byModel[c.model] = (byModel[c.model] || 0) + 1; }
}
ok(redRows === 23, 'expected 23 rows with red, got ' + redRows);
ok(JSON.stringify(Object.values(byModel).sort((a, b) => b - a)) === '[8,7,4,3,1]', 'per-AI totals ' + JSON.stringify(byModel));

// DeepSeek, rude top performer: 6.8 / 7.6 / 3.2 -> Chinese is the odd one out
const ds = data.cells['deepseek/deepseek-v4.1-flash|q29'];
ok(JSON.stringify(coloursFor(ds, Q.q29)) === JSON.stringify({en: 'green', hi: 'green', zh: 'red'}), 'deepseek q29');
ok(labelOf(Q.q29, ds, 'en').text === 'Yes, let them go' && labelOf(Q.q29, ds, 'zh').text === 'No, coach them first', 'q29 labels');

// GPT, rude top performer: 2.8 / 4.2 / 6.0 reads No / It depends / It depends -> English is the odd one out
const gpt = data.cells['openai/gpt-6-luna|q29'];
ok(JSON.stringify(coloursFor(gpt, Q.q29)) === JSON.stringify({en: 'red', hi: 'green', zh: 'green'}), 'gpt q29 follows the visible labels');
// every changed row with two matching labels marks the third one
for (const c of cells.filter((x) => x.flagged && !x.refusal_split)) {
  const t = LANGS.map((l) => labelOf(Q[c.qid], c, l).text), col = coloursFor(c, Q[c.qid]);
  const odd = LANGS.filter((l, i) => t.filter((x) => x === t[i]).length === 1);
  if (odd.length === 1) ok(col[odd[0]] === 'red' && LANGS.filter((l) => col[l] === 'red').length === 1, 'label odd-one-out ' + c.model + c.qid);
}
// tie: 2, 5, 8 -> both ends red
const mk = (en, hi, zh) => ({flagged: true, refusal_split: false, refused_langs: [],
  langs: {en: {mean: en, runs: [1], refusals: 0}, hi: {mean: hi, runs: [1], refusals: 0}, zh: {mean: zh, runs: [1], refusals: 0}}});
ok(JSON.stringify(coloursFor(mk(2, 5, 8))) === JSON.stringify({en: 'red', hi: 'green', zh: 'red'}), 'tie case');
ok(JSON.stringify(coloursFor(mk(9, 2, 8))) === JSON.stringify({en: 'green', hi: 'red', zh: 'green'}), 'low outlier');

// number question shows the number with its unit
const sev = data.cells['openai/gpt-6-luna|q32'];
ok(/months/.test(labelOf(Q.q32, sev, 'en').text), 'months label');
ok(labelOf(Q.q32, sev, 'zh').text === 'Refused', 'refused label');
console.log('ok');
