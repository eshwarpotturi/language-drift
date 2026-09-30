"""Turn answers + judgements into dashboard/data.json: drift per model x question, headline findings."""
import json
import math
import statistics as st
import sys
from itertools import combinations
from pathlib import Path

from ld import config
from ld.parse import strip_number_line
from ld.prompts import latest_ok, load_questions


def normalise(unit, x):
    """Map every unit onto 0..1 so gaps are comparable across questions."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    if unit.endswith("0_10"):
        return max(0.0, min(1.0, x / 10))
    if unit == "percent":
        return max(0.0, min(1.0, x / 100))
    if unit == "deaths":  # spans orders of magnitude (dozens to thousands)
        return max(0.0, min(1.0, math.log10(max(x, 0) + 1) / 5))
    if unit == "celsius":
        return x / 100
    if unit == "count":
        return x / 543
    if unit == "months":
        return max(0.0, min(1.0, x / 24))
    return x


def drift_stats(by_lang):
    """by_lang: {lang: [normalised values]}. Returns drift (gap between language means), noise, flag."""
    means = {l: st.mean(v) for l, v in by_lang.items() if v}
    if len(means) < 2:
        return {"drift": None, "noise": None, "flagged": False, "means": means}
    drift = max(means.values()) - min(means.values())
    sds = [st.pstdev(v) for v in by_lang.values() if len(v) > 1]
    noise = st.mean(sds) if sds else 0.0
    flagged = drift >= config.DRIFT_MIN and drift > config.NOISE_FACTOR * noise
    return {"drift": round(drift, 4), "noise": round(noise, 4), "flagged": flagged, "means": means}


def load_jsonl(path):
    p = Path(path)
    if not p.exists():
        return []
    rows = []
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def build(answers, judged, qset, spend_usd=0.0, mock=False):
    jmap = {f"{j['model']}|{j['qid']}|{j['lang']}|{j['run']}": j for j in judged}
    qs = qset["questions"]
    models = [{"id": m, "label": lab, "maker": mk} for m, lab, mk in config.MODELS]
    mids = [m["id"] for m in models]
    cells, cell_list = {}, []
    for q in qs:
        for m in mids:
            rows = [a for a in answers if a["model"] == m and a["qid"] == q["id"] and not a.get("error")]
            per_lang, langs = {}, {}
            for lang in config.LANGS:
                runs = []
                for a in sorted((r for r in rows if r["lang"] == lang), key=lambda r: r["run"]):
                    j = jmap.get(f"{m}|{q['id']}|{lang}|{a['run']}", {})
                    num = a.get("number") if a.get("number") is not None else j.get("judge_number")
                    runs.append({"run": a["run"], "text": strip_number_line(a.get("text", "")), "number": num,
                                 "gist_en": j.get("gist_en"), "stance": j.get("stance"),
                                 "refused": bool(j.get("refused")), "hedged": bool(j.get("hedged"))})
                vals = [normalise(q["unit"], r["number"]) for r in runs if r["number"] is not None]
                per_lang[lang] = [v for v in vals if v is not None]
                nums = [r["number"] for r in runs if r["number"] is not None]
                stances = [r["stance"] for r in runs if r["stance"] is not None]
                langs[lang] = {"runs": runs, "mean": round(st.mean(nums), 2) if nums else None,
                               "stance": round(st.mean(stances), 2) if stances else None,
                               "refusals": sum(r["refused"] for r in runs)}
            d = drift_stats(per_lang)
            # A refusal split needs a clean contrast: refuses in most runs of one language, never in another.
            # (A model that refuses 1 of 3 times everywhere is inconsistent, not language-sensitive.)
            refused_langs = [l for l in config.LANGS if langs[l]["runs"] and langs[l]["refusals"] * 3 >= 2 * len(langs[l]["runs"])]
            clean_langs = [l for l in config.LANGS if langs[l]["runs"] and langs[l]["refusals"] == 0]
            cell = {"qid": q["id"], "model": m, "langs": langs, "drift": d["drift"], "noise": d["noise"],
                    "flagged": d["flagged"] and q["kind"] != "control",
                    "refusal_split": bool(refused_langs) and bool(clean_langs), "refused_langs": refused_langs}
            if q["kind"] == "control":
                exp = q["expected"]
                allnums = [r["number"] for l in langs.values() for r in l["runs"] if r["number"] is not None]
                cell["control_ok"] = bool(allnums) and all(abs(x - exp) <= 0.05 * exp for x in allnums)
            cells[f"{m}|{q['id']}"] = cell
            cell_list.append(cell)

    # only pairs that were actually asked count (questions added later have no answers until their run)
    test = [c for c in cell_list if next(q for q in qs if q["id"] == c["qid"])["kind"] != "control"
            and any(c["langs"][l]["runs"] for l in config.LANGS)]
    flagged = [c for c in test if c["flagged"] or c["refusal_split"]]
    by_model = {m: sum(1 for c in flagged if c["model"] == m) for m in mids}
    by_q = {q["id"]: sum(1 for c in flagged if c["qid"] == q["id"]) for q in qs}
    pair_gaps = {}
    for a, b in combinations(config.LANGS, 2):
        gaps = []
        for c in test:
            q = next(q for q in qs if q["id"] == c["qid"])
            ma, mb = c["langs"][a]["mean"], c["langs"][b]["mean"]
            if ma is not None and mb is not None:
                gaps.append(abs(normalise(q["unit"], ma) - normalise(q["unit"], mb)))
        pair_gaps[f"{a}-{b}"] = round(st.mean(gaps), 4) if gaps else None
    refusals = {l: sum(c["langs"][l]["refusals"] for c in test) for l in config.LANGS}
    controls = [c for c in cell_list if "control_ok" in c]
    n_calls = len([a for a in answers if not a.get("error")])
    top_model = max(by_model, key=by_model.get) if flagged else None
    top_q = max(by_q, key=by_q.get) if flagged else None
    return {
        "mock": mock,
        "languages": qset["languages"],
        "models": models,
        "questions": [{"id": q["id"], "topic": q["topic"], "kind": q["kind"], "unit": q["unit"],
                       "group": q.get("group", "society"), "scale_labels": q.get("scale_labels"), "plain": q.get("plain"),
                       "expected": q["expected"], "question": q["question"], "number_prompt": q["number_prompt"]}
                      for q in qs],
        "cells": cells,
        "summary": {
            "pairs_tested": len(test), "pairs_drifting": len(flagged),
            "share_drifting": round(len(flagged) / len(test), 4) if test else 0,
            "drift_by_model": by_model, "drift_by_question": by_q,
            "top_model": top_model, "top_question": top_q,
            "language_pair_gap": pair_gaps, "refusals_by_language": refusals,
            "controls_ok": sum(c["control_ok"] for c in controls), "controls_total": len(controls),
            "answers": n_calls, "cost_usd": round(spend_usd, 4), "cost_inr": round(spend_usd * config.USD_TO_INR, 1),
            "thresholds": {"drift_min": config.DRIFT_MIN, "noise_factor": config.NOISE_FACTOR},
        },
    }


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    answers = latest_ok(load_jsonl(argv[0] if argv else "logs/answers.jsonl"))
    judged = load_jsonl(argv[1] if len(argv) > 1 else "logs/judged.jsonl")
    out = Path(argv[2] if len(argv) > 2 else "dashboard/data.json")
    spend = Path("logs/spend.json")
    usd = sum(json.loads(spend.read_text()).values()) if spend.exists() else 0.0
    mock = any(a.get("mock") for a in answers[:1])
    data = build(answers, judged, load_questions(), usd, mock)
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    s = data["summary"]
    print(f"wrote {out}: {s['pairs_drifting']}/{s['pairs_tested']} model-question pairs drift; "
          f"controls {s['controls_ok']}/{s['controls_total']} ok; cost ₹{s['cost_inr']}")


if __name__ == "__main__":
    main()
