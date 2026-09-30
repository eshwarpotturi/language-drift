"""Translate the Hindi and Chinese prompts back to English with an independent model, so meaning can be checked."""
import asyncio
import json
from pathlib import Path

import httpx

from ld import config
from ld.budget import Ledger
from ld.openrouter import chat
from ld.prompts import answer_prompt, load_questions

OUT = Path("questions/backtranslations.json")


async def main():
    qset = load_questions()
    ledger = Ledger()
    out = {}
    async with httpx.AsyncClient() as client:
        async def one(q, lang):
            res = await chat(client, config.JUDGE_MODEL, [{"role": "user", "content":
                "Translate this text into English as literally as possible. Return only the translation.\n\n"
                + answer_prompt(qset, q, lang)}], max_tokens=400, temperature=0)
            ledger.add("backtranslate", res["cost_usd"])
            out.setdefault(q["id"], {})[lang] = res["text"]
        await asyncio.gather(*(one(q, l) for q in qset["questions"] for l in ("hi", "zh")))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT}; spent so far ${ledger.total:.4f}")


if __name__ == "__main__":
    asyncio.run(main())
