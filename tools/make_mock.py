"""Fake answers + judgements so the dashboard can be built before the real run. Clearly marked mock."""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ld import config  # noqa: E402
from ld.prompts import load_questions  # noqa: E402

random.seed(7)
qset = load_questions()
base = {"agree_0_10": (5, 2.5), "taiwan_0_10": (5, 3), "trust_0_10": (6, 2), "percent": (45, 15),
        "deaths": (1500, 1200), "celsius": (100, 0), "count": (543, 0)}
A, J = [], []
for q in qset["questions"]:
    for m, _, maker in config.MODELS:
        mu, sd = base[q["unit"]]
        center = mu + random.uniform(-sd, sd)
        shift = {l: (random.uniform(-sd, sd) if q["kind"] != "control" and random.random() < 0.35 else 0) for l in config.LANGS}
        for lang in config.LANGS:
            for r in range(config.RUNS):
                x = center + shift[lang] + (random.gauss(0, sd * 0.08) if q["kind"] != "control" else 0)
                if q["unit"].endswith("0_10"):
                    x = round(max(0, min(10, x)))
                elif q["unit"] == "percent":
                    x = round(max(0, min(100, x)))
                elif q["unit"] == "deaths":
                    x = round(max(0, x), -1)
                refused = q["id"] in ("q03", "q04") and lang == "zh" and "China" in maker and random.random() < 0.7
                A.append({"mock": True, "model": m, "qid": q["id"], "lang": lang, "run": r,
                          "text": f"[mock answer] {q['question'][lang]}\nNUMBER: {x}", "number": None if refused else x,
                          "cost_usd": 0.0})
                J.append({"model": m, "qid": q["id"], "lang": lang, "run": r,
                          "gist_en": "Mock: placeholder summary until the real run.",
                          "stance": 0 if q["kind"] == "control" else random.choice([-2, -1, 0, 1, 2]),
                          "refused": refused, "hedged": random.random() < 0.2, "judge_number": None})
Path("logs").mkdir(exist_ok=True)
Path("logs/mock_answers.jsonl").write_text("\n".join(json.dumps(a, ensure_ascii=False) for a in A), encoding="utf-8")
Path("logs/mock_judged.jsonl").write_text("\n".join(json.dumps(j, ensure_ascii=False) for j in J), encoding="utf-8")
print(len(A), "mock answers")
