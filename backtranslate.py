"""Translate the prompts back to English with two independent models, so the meaning can be checked.

    python backtranslate.py                 # Bengali and Korean (default)
    python backtranslate.py --langs hi zh   # the original languages
"""
import argparse
import asyncio
import json
from pathlib import Path

from ld import config
from ld.budget import BudgetExceeded, Guard, Ledger
from ld.llm import chat
from ld.prompts import answer_prompt, load_questions

OUT = Path("questions/backtranslations.json")
ASK = "Translate this text into English as literally as possible. Return only the translation.\n\n"


async def main(langs, budget_inr):
    qset = load_questions()
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    translators = {"a": config.JUDGE_MODEL, "b": config.SECOND_TRANSLATOR}
    jobs = [(q, l, k) for q in qset["questions"] for l in langs for k in translators]
    ledger = Ledger(config.SPEND_FILE)
    guard = Guard(ledger, "backtranslate", len(jobs), budget_inr / config.USD_TO_INR, 10, per_step=True)
    sem = asyncio.Semaphore(config.CONCURRENCY)

    async def one(q, l, k):
        async with sem:
            res = await chat(None, translators[k], [{"role": "user", "content": ASK + answer_prompt(qset, q, l)}],
                             max_tokens=600, temperature=0)
            entry = out.setdefault(q["id"], {})
            if k == "a":
                entry[l] = res["text"]          # same key as the original hi/zh check
            else:
                entry[l + "_2"] = res["text"]   # second, independent translator
            guard.record(res["cost_usd"])

    try:
        await asyncio.gather(*(one(*j) for j in jobs))
    except BudgetExceeded as e:
        print("STOPPED:", e)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT}; this step spent ${guard.spent:.4f} (≈ ₹{guard.spent * config.USD_TO_INR:.1f})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", nargs="*", default=["bn", "ko"])
    ap.add_argument("--budget-inr", type=float, default=config.STEP_BUDGET_INR["backtranslate"])
    a = ap.parse_args()
    asyncio.run(main(a.langs, a.budget_inr))
