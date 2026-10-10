"""Route check: do answers through LLM Foundry match the original answers that came straight from OpenRouter?

Re-asks a few questions in English, a couple of runs per model, through the same pipeline as the new
languages, and writes them to logs/route_check.jsonl. tools/route_check_report.py compares them with
the stored English answers in logs/answers.jsonl.

    python tools/route_check.py            # 5 questions x the directly-routed models x 2 runs
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ld import config  # noqa: E402
from ld.budget import BudgetExceeded, Guard, Ledger  # noqa: E402
from ld.llm import LLMError, chat  # noqa: E402
from ld.llm import all_models as llm_all  # noqa: E402
from ld.parse import parse_number  # noqa: E402
from ld.prompts import answer_prompt, load_questions  # noqa: E402

OUT = Path("logs/route_check.jsonl")
QIDS = ["q29", "q16", "q15", "q22", "q07"]   # mix of stable and drifting, workplace and society


async def main(runs, budget_inr):
    qset = load_questions()
    qmap = {q["id"]: q for q in qset["questions"]}
    routed = [m for m, mm in llm_all().items() if mm.get("route") and m in {x[0] for x in config.MODELS}]
    jobs = [(m, qid, r) for r in range(runs) for qid in QIDS for m in routed]
    ledger = Ledger(config.SPEND_FILE)
    guard = Guard(ledger, "route_check", len(jobs), budget_inr / config.USD_TO_INR, 10, per_step=True)
    sem = asyncio.Semaphore(config.CONCURRENCY)
    OUT.parent.mkdir(exist_ok=True)

    async def one(m, qid, r):
        async with sem:
            row = {"model": m, "qid": qid, "lang": "en", "run": r, "route": "llmfoundry-direct"}
            try:
                res = await chat(None, m, [{"role": "user", "content": answer_prompt(qset, qmap[qid], "en")}],
                                 max_tokens=config.ANSWER_MAX_TOKENS, temperature=config.TEMPERATURE)
                row.update(res, number=parse_number(res["text"]))
            except LLMError as e:
                row.update(error=str(e), cost_usd=0.0)
            with OUT.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            guard.record(row["cost_usd"])

    try:
        await asyncio.gather(*(one(*j) for j in jobs))
    except BudgetExceeded as e:
        print("STOPPED:", e)
    print(f"route check spent ${guard.spent:.4f} (≈ ₹{guard.spent * config.USD_TO_INR:.1f})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--budget-inr", type=float, default=config.STEP_BUDGET_INR["route_check"])
    a = ap.parse_args()
    asyncio.run(main(a.runs, a.budget_inr))
