"""Every LLM call in this project goes through this module.

Modelled on jivraj-18/benchmark-finance-pageindex (finbench/llm.py):
- calls go to an LLM proxy chosen by LLM_PROVIDER in .env: `llmfoundry` (default) or `aipipe`,
  on its OpenRouter-compatible route (<root>/openrouter/v1), with the OpenAI Python client;
- every request sends `Cache-Control: no-cache`, because LLM Foundry replays an earlier answer
  for an identical request. This study asks each question several times with the identical
  prompt, so without it runs 2-5 would be copies of run 1;
- each call's cost is computed from the token counts and the prices in config/models.yaml;
- rate limits and server errors are retried with exponential backoff.

Unlike finbench, a failing call is never retried at a different reasoning effort: that would
change the conditions mid-study. It fails, is logged, and is retried on the next run.
"""
import asyncio
import os
import time
from functools import cache
from pathlib import Path

import yaml
from dotenv import load_dotenv
from openai import APIError, OpenAI, RateLimitError

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)  # .env wins over stale shell variables
CONFIG = yaml.safe_load((ROOT / "config" / "models.yaml").read_text())
TIMEOUT = 600
NO_CACHE = {"Cache-Control": "no-cache"}

PROVIDERS = {
    "llmfoundry": lambda: (os.environ["LLMFOUNDRY_BASE_URL"], os.environ["LLMFOUNDRY_API_KEY"]),
    "aipipe": lambda: ("https://aipipe.org", os.environ["AIPIPE_TOKEN"]),
}


class LLMError(Exception):
    pass


def _provider():
    try:
        root, key = PROVIDERS[os.environ.get("LLM_PROVIDER", "llmfoundry")]()
    except KeyError as e:
        raise LLMError(f"missing setting in .env: {e}") from None
    return root.rstrip("/"), key


def base_url() -> str:
    return _provider()[0] + "/openrouter/v1"


def all_models() -> dict:
    """OpenRouter id -> model entry (the five, the judge and the second translator)."""
    out = {m["id"]: m for m in CONFIG["models"].values()}
    for k in ("judge_model", "second_translator"):
        out[CONFIG[k]["id"]] = CONFIG[k]
    return out


def price(model_id: str, input_tokens: int, cached_tokens: int, output_tokens: int) -> float:
    """USD cost of one call; reasoning tokens are part of output_tokens."""
    p = all_models()[model_id]
    return ((input_tokens - cached_tokens) * p["input"] + cached_tokens * p["cache_read"] + output_tokens * p["output"]) / 1e6


@cache
def _client() -> OpenAI:
    return OpenAI(base_url=base_url(), api_key=_provider()[1], timeout=TIMEOUT, default_headers=NO_CACHE, max_retries=0)


def _retry(call, retries: int = 6):
    """Retry rate limits and server errors with exponential backoff (1, 2, 4 ... 32 s)."""
    for attempt in range(retries):
        try:
            return call()
        except (RateLimitError, APIError) as e:
            status = getattr(e, "status_code", None)
            if attempt == retries - 1 or status in (400, 401, 402, 403, 404):
                raise LLMError(f"{type(e).__name__} {status}: {str(e)[:200]}") from None
            time.sleep(min(2 ** attempt, 32))


def complete(model_id: str, messages: list[dict], *, max_tokens: int, temperature: float = 0.7,
             json_mode: bool = False) -> dict:
    """One metered chat completion. Returns {text, cost_usd, prompt_tokens, completion_tokens, latency_ms}."""
    m = all_models()[model_id]
    extra = {"reasoning": {"effort": m["effort"], "exclude": True}} if m.get("effort") else {}
    kwargs = {"model": model_id, "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
              "extra_body": extra}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    t0 = time.perf_counter()
    r = _retry(lambda: _client().chat.completions.create(**kwargs))
    u = r.usage
    details = getattr(u, "prompt_tokens_details", None)
    cached = (getattr(details, "cached_tokens", 0) or 0) if details else 0
    return {"text": (r.choices[0].message.content or "").strip(),
            "cost_usd": price(model_id, u.prompt_tokens, cached, u.completion_tokens),
            "prompt_tokens": u.prompt_tokens, "completion_tokens": u.completion_tokens,
            "latency_ms": round((time.perf_counter() - t0) * 1000)}


async def chat(_client_unused, model, messages, *, max_tokens, temperature=0.7, json_mode=False, retries=None):
    """Async wrapper with the old signature, so the runner, judge and back-translation need no other change."""
    return await asyncio.to_thread(complete, model, messages, max_tokens=max_tokens, temperature=temperature,
                                   json_mode=json_mode)
