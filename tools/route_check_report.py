"""Compare route-check answers (LLM Foundry) with the stored English answers (straight from OpenRouter)."""
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from analyze import normalise  # noqa: E402
from ld.prompts import latest_ok, load_questions  # noqa: E402

q = {x["id"]: x for x in load_questions()["questions"]}
old = [a for a in latest_ok([json.loads(l) for l in open("logs/answers.jsonl", encoding="utf-8")]) if a["lang"] == "en"]
new = [json.loads(l) for l in open("logs/route_check.jsonl", encoding="utf-8")]
new = [r for r in new if not r.get("error")]
rows, ok = [], 0
for m in sorted({r["model"] for r in new}):
    for qid in sorted({r["qid"] for r in new}):
        o = [normalise(q[qid]["unit"], a["number"]) for a in old if a["model"] == m and a["qid"] == qid and a.get("number") is not None]
        n = [normalise(q[qid]["unit"], a["number"]) for a in new if a["model"] == m and a["qid"] == qid and a.get("number") is not None]
        if not o or not n:
            rows.append((m, qid, None, None, "no number", None)); continue
        lo, hi = min(o), max(o)
        spread = max(hi - lo, 0.1)            # at least 1 point on a 0-10 scale
        inside = all(lo - spread / 2 <= x <= hi + spread / 2 for x in n)
        ok += inside
        tok_old = st.mean(a["completion_tokens"] for a in old if a["model"] == m and a["qid"] == qid and a.get("completion_tokens"))
        tok_new = st.mean(a["completion_tokens"] for a in new if a["model"] == m and a["qid"] == qid and a.get("completion_tokens"))
        rows.append((m, qid, round(st.mean(o), 2), round(st.mean(n), 2), "match" if inside else "DIFFERENT", (round(tok_old), round(tok_new))))
for r in rows:
    print(f"{r[0]:30s} {r[1]}  original {r[2]}  foundry {r[3]}  {r[4]:9s} output tokens (orig, foundry) {r[5]}")
print(f"\n{ok} of {sum(1 for r in rows if r[2] is not None)} model-question pairs within the original run-to-run range")
