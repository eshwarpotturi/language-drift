"""Score every answer with one neutral judge model: English gist, stance, refused/hedged, number."""
import asyncio
import json
from pathlib import Path

import httpx

from ld import config
from ld.budget import BudgetExceeded, Guard, Ledger
from ld.openrouter import OpenRouterError, chat
from ld.prompts import JUDGE_SYSTEM, judge_prompt, load_questions

ANS = Path("logs/answers.jsonl")
OUT = Path("logs/judged.jsonl")


def key(r):
    return f"{r['model']}|{r['qid']}|{r['lang']}|{r['run']}"


def parse_judgement(text):
    try:
        d = json.loads(text[text.find("{"): text.rfind("}") + 1])
    except (ValueError, TypeError):
        return None
    try:
        stance = max(-2, min(2, int(round(float(d.get("stance", 0))))))
    except (TypeError, ValueError):
        stance = 0
    num = d.get("number")
    try:
        num = float(num) if num is not None and str(num).strip() != "" else None
    except (TypeError, ValueError):
        num = None
    return {"gist_en": str(d.get("gist_en", ""))[:400], "stance": stance,
            "refused": bool(d.get("refused")), "hedged": bool(d.get("hedged")), "judge_number": num}


async def main():
    qmap = {q["id"]: q for q in load_questions()["questions"]}
    answers = [json.loads(l) for l in ANS.read_text(encoding="utf-8").splitlines() if l.strip()]
    answers = [a for a in answers if not a.get("error")]
    done = {key(json.loads(l)) for l in OUT.read_text(encoding="utf-8").splitlines() if l.strip()} if OUT.exists() else set()
    todo = [a for a in answers if key(a) not in done]
    ledger = Ledger()
    guard = Guard(ledger, "judge", len(todo), config.BUDGET_INR / config.USD_TO_INR, config.GUARD_AFTER_CALLS)
    sem, stop = asyncio.Semaphore(config.CONCURRENCY), asyncio.Event()
    print(f"{len(todo)} answers to judge; spent so far ${ledger.total:.3f}")
    async with httpx.AsyncClient() as client:
        async def one(a):
            if stop.is_set():
                return
            async with sem:
                if stop.is_set():
                    return
                try:
                    res = await chat(client, config.JUDGE_MODEL,
                                     [{"role": "system", "content": JUDGE_SYSTEM},
                                      {"role": "user", "content": judge_prompt(qmap[a["qid"]], a["text"])}],
                                     max_tokens=300, temperature=0, json_mode=True)
                except OpenRouterError as e:
                    print("judge error:", e)
                    return
                j = parse_judgement(res["text"])
                if j:
                    row = {k: a[k] for k in ("model", "qid", "lang", "run")} | j
                    with OUT.open("a", encoding="utf-8") as f:
                        f.write(json.dumps(row, ensure_ascii=False) + "\n")
                try:
                    guard.record(res["cost_usd"])
                except BudgetExceeded as e:
                    print("STOPPING:", e)
                    stop.set()
        await asyncio.gather(*(one(a) for a in todo))
    print(f"done. total spent ${ledger.total:.3f} (≈ ₹{ledger.total * config.USD_TO_INR:.0f})")


if __name__ == "__main__":
    asyncio.run(main())
