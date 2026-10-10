"""Every LLM call in this project goes through this module.

How models are called (as in slm-opti, with the structure of benchmark-finance-pageindex's llm.py):
- LLM_PROVIDER in .env picks the route. Default `openrouter`: straight to OpenRouter with
  OPENROUTER_API_KEY from .env, like slm-opti. `llmfoundry` / `aipipe` go through those proxies'
  OpenRouter-compatible route (<root>/openrouter/v1). Same model ids either way;
- OpenRouter reports each call's exact cost (usage.include); the price list is the fallback;
- key_spend() reads what the key has spent so far (free), for a hard stop on the key itself;
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

import httpx  # imported here, not inside the worker threads (concurrent first imports deadlock)
import yaml
from dotenv import load_dotenv
from openai import APIError, OpenAI, RateLimitError

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)  # .env wins over stale shell variables
CONFIG = yaml.safe_load((ROOT / "config" / "models.yaml").read_text())
TIMEOUT = 120
NO_CACHE = {"Cache-Control": "no-cache"}

# LLM_PROVIDER -> (root URL, key). Default "openrouter": straight to OpenRouter with your own key,
# the way slm-opti calls models (stack.py). The proxies serve the same model ids on <root>/openrouter/v1.
PROVIDERS = {
    "openrouter": lambda: ("https://openrouter.ai/api", os.environ["OPENROUTER_API_KEY"]),
    "llmfoundry": lambda: (os.environ["LLMFOUNDRY_BASE_URL"], os.environ["LLMFOUNDRY_API_KEY"]),
    "aipipe": lambda: ("https://aipipe.org", os.environ["AIPIPE_TOKEN"]),
}
DEFAULT_PROVIDER = "openrouter"


class LLMError(Exception):
    pass


def _provider():
    try:
        root, key = PROVIDERS[provider_name()]()
    except KeyError as e:
        raise LLMError(f"missing setting in .env: {e}") from None
    return root.rstrip("/"), key


def provider_name() -> str:
    return os.environ.get("LLM_PROVIDER", DEFAULT_PROVIDER)


def base_url() -> str:
    root = _provider()[0]
    return root + "/v1" if provider_name() == "openrouter" else root + "/openrouter/v1"


def key_spend() -> dict | None:
    """What the OpenRouter key has spent so far (free to call; never returns the key). None on proxies."""
    if provider_name() != "openrouter":
        return None
    import json
    import urllib.request
    req = urllib.request.Request("https://openrouter.ai/api/v1/key", headers={"Authorization": "Bearer " + _provider()[1]})
    d = json.load(urllib.request.urlopen(req, timeout=30))["data"]
    return {"usage": float(d.get("usage") or 0), "limit": d.get("limit"), "limit_remaining": d.get("limit_remaining")}


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


# LLM Foundry's direct provider routes, as used in slm-opti's run_eval.py.
FOUNDRY_ROUTES = {"openai": "/openai/v1", "gemini": "/gemini/v1beta/openai", "anthropic": "/anthropic/v1/messages"}
ANTHROPIC_THINKING = 1024   # "low" thinking for Claude on its native API (1024 is the smallest budget allowed)


def _foundry():
    root, key = os.environ.get("LLMFOUNDRY_BASE_URL", ""), os.environ.get("LLMFOUNDRY_API_KEY", "")
    if not root or not key:
        raise LLMError("LLMFOUNDRY_BASE_URL / LLMFOUNDRY_API_KEY missing in .env")
    return root.rstrip("/"), key + ":language-drift"   # Foundry's  Bearer <token>:<project>


@cache
def _route_client(route: str) -> OpenAI:
    root, key = _foundry()
    return OpenAI(base_url=root + FOUNDRY_ROUTES[route], api_key=key, timeout=TIMEOUT, default_headers=NO_CACHE, max_retries=0)


def _anthropic(m: dict, messages: list[dict], max_tokens: int) -> dict:
    root, key = _foundry()
    body = {"model": m["route_model"], "max_tokens": max_tokens + ANTHROPIC_THINKING, "messages": messages,
            "thinking": {"type": "enabled", "budget_tokens": ANTHROPIC_THINKING}}
    for attempt in range(6):
        r = httpx.post(root + FOUNDRY_ROUTES["anthropic"], json=body, timeout=TIMEOUT,
                       headers={"Authorization": "Bearer " + key, "anthropic-version": "2023-06-01", **NO_CACHE})
        if r.status_code == 200:
            return r.json()
        if r.status_code in (400, 401, 402, 403, 404) or attempt == 5:
            raise LLMError(f"anthropic route {r.status_code}: {r.text[:200]}")
        time.sleep(min(2 ** attempt, 32))


def _complete_route(m: dict, messages: list[dict], max_tokens: int, temperature: float, json_mode: bool) -> dict:
    t0 = time.perf_counter()
    if m["route"] == "anthropic":
        d = _anthropic(m, messages, max_tokens)
        text = "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")
        u = d.get("usage", {})
        tin, tout, cached = u.get("input_tokens", 0), u.get("output_tokens", 0), u.get("cache_read_input_tokens", 0) or 0
        tin += cached
    else:
        kwargs = {"model": m["route_model"], "messages": messages, "max_completion_tokens": max_tokens,
                  "reasoning_effort": m.get("effort") or None}
        if m["route"] == "gemini":
            kwargs["temperature"] = temperature
            if m.get("thinking_budget"):   # an explicit cap replaces the effort level
                kwargs.pop("reasoning_effort", None)
                kwargs["extra_body"] = {"extra_body": {"google": {"thinking_config": {"thinking_budget": m["thinking_budget"]}}}}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        r = _retry(lambda: _route_client(m["route"]).chat.completions.create(**kwargs))
        text, u = (r.choices[0].message.content or ""), r.usage
        details = getattr(u, "prompt_tokens_details", None)
        cached = (getattr(details, "cached_tokens", 0) or 0) if details else 0
        tin, tout = u.prompt_tokens, u.completion_tokens
        # Gemini's OpenAI-compatible route leaves thinking tokens out of completion_tokens but bills them;
        # total_tokens includes them, so count output as total - prompt.
        if getattr(u, "total_tokens", None):
            tout = max(tout, u.total_tokens - u.prompt_tokens)
    return {"text": text.strip(), "cost_usd": price(m["id"], tin, cached, tout), "prompt_tokens": tin,
            "completion_tokens": tout, "latency_ms": round((time.perf_counter() - t0) * 1000)}


def complete(model_id: str, messages: list[dict], *, max_tokens: int, temperature: float = 0.7,
             json_mode: bool = False) -> dict:
    """One metered chat completion. Returns {text, cost_usd, prompt_tokens, completion_tokens, latency_ms}."""
    m = all_models()[model_id]
    if m.get("route"):
        return _complete_route(m, messages, max_tokens, temperature, json_mode)
    extra = {"reasoning": {"effort": m["effort"], "exclude": True}} if m.get("effort") else {}
    extra["usage"] = {"include": True}   # OpenRouter then reports the exact cost of the call
    kwargs = {"model": model_id, "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
              "extra_body": extra}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    t0 = time.perf_counter()
    r = _retry(lambda: _client().chat.completions.create(**kwargs))
    u = r.usage
    details = getattr(u, "prompt_tokens_details", None)
    cached = (getattr(details, "cached_tokens", 0) or 0) if details else 0
    reported = getattr(u, "cost", None)
    if reported is None and getattr(u, "model_extra", None):
        reported = u.model_extra.get("cost")
    return {"text": (r.choices[0].message.content or "").strip(),
            "cost_usd": float(reported) if reported is not None else price(model_id, u.prompt_tokens, cached, u.completion_tokens),
            "prompt_tokens": u.prompt_tokens, "completion_tokens": u.completion_tokens,
            "latency_ms": round((time.perf_counter() - t0) * 1000)}


async def chat(_client_unused, model, messages, *, max_tokens, temperature=0.7, json_mode=False, retries=None):
    """Async wrapper with the old signature, so the runner, judge and back-translation need no other change."""
    return await asyncio.to_thread(complete, model, messages, max_tokens=max_tokens, temperature=temperature,
                                   json_mode=json_mode)
