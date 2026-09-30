"""Ask every model every question in every language, RUNS times. Resumable; stops at the budget.

    OPENROUTER_API_KEY=... python run_pilot.py            # full pilot
    python run_pilot.py --dry-run                          # count calls, no key needed
"""
import argparse
import asyncio
import json
from pathlib import Path

import httpx

from ld import config
from ld.budget import BudgetExceeded, Guard, Ledger
from ld.openrouter import OpenRouterError, chat
from ld.parse import parse_number
from ld.prompts import answer_prompt, is_truncated, load_questions

OUT = Path("logs/answers.jsonl")


def job_key(j):
    return f"{j['model']}|{j['qid']}|{j['lang']}|{j['run']}"


def build_jobs(qset, models=None, runs=config.RUNS):
    models = models or [m[0] for m in config.MODELS]
    return [{"model": m, "qid": q["id"], "lang": lang, "run": r}
            for r in range(runs) for q in qset["questions"] for lang in config.LANGS for m in models]


def done_keys(path=OUT):
    if not path.exists():
        return set()
    keys = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not row.get("error") and not is_truncated(row):
            keys.add(job_key(row))
    return keys


async def run(jobs, qset, budget_usd, limit=None):
    qmap = {q["id"]: q for q in qset["questions"]}
    remaining = [j for j in jobs if job_key(j) not in done_keys()]
    already = len(jobs) - len(remaining)
    todo = remaining[:limit]
    ledger = Ledger()
    guard = Guard(ledger, "answers", len(todo), budget_usd, config.GUARD_AFTER_CALLS)
    OUT.parent.mkdir(exist_ok=True)
    sem = asyncio.Semaphore(config.CONCURRENCY)
    stop = asyncio.Event()
    print(f"{len(todo)} calls to make ({already} already done, {len(remaining) - len(todo)} left for later); "
          f"spent so far ${ledger.total:.3f}")

    async with httpx.AsyncClient() as client:
        async def one(j):
            if stop.is_set():
                return
            async with sem:
                if stop.is_set():
                    return
                q = qmap[j["qid"]]
                row = dict(j)
                try:
                    res = await chat(client, j["model"], [{"role": "user", "content": answer_prompt(qset, q, j["lang"])}],
                                     max_tokens=config.ANSWER_MAX_TOKENS, temperature=config.TEMPERATURE)
                    row.update(res, number=parse_number(res["text"]), max_tokens=config.ANSWER_MAX_TOKENS)
                except OpenRouterError as e:
                    row.update(error=str(e), cost_usd=0.0)
                with OUT.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                try:
                    guard.record(row["cost_usd"])
                except BudgetExceeded as e:
                    print("STOPPING:", e)
                    stop.set()
                if guard.done % 50 == 0:
                    print(f"  {guard.done}/{len(todo)} · spent ${ledger.total:.3f} · projected ${guard.projection():.3f}")

        await asyncio.gather(*(one(j) for j in todo))
    print(f"done. total spent ${ledger.total:.3f} (≈ ₹{ledger.total * config.USD_TO_INR:.0f})")
    return guard


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--models", nargs="*")
    ap.add_argument("--runs", type=int, default=config.RUNS)
    a = ap.parse_args()
    qset = load_questions()
    jobs = build_jobs(qset, a.models, a.runs)
    if a.dry_run:
        print(f"{len(jobs)} calls: {len(qset['questions'])} questions x {len(config.LANGS)} languages x "
              f"{len(a.models or config.MODELS)} models x {a.runs} runs")
        print(answer_prompt(qset, qset["questions"][0], "hi"))
        return
    asyncio.run(run(jobs, qset, config.ANSWERS_BUDGET_INR / config.USD_TO_INR, a.limit))


if __name__ == "__main__":
    main()
