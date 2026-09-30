"""Minimal OpenRouter chat client. The API key is read from OPENROUTER_API_KEY only."""
import asyncio
import os
import time

import httpx

URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterError(Exception):
    pass


def _key():
    k = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not k:
        raise OpenRouterError("OPENROUTER_API_KEY is not set")
    return k


async def chat(client, model, messages, *, max_tokens, temperature=0.7, json_mode=False, retries=3):
    """Return {text, cost_usd, prompt_tokens, completion_tokens, latency_ms}. Raises OpenRouterError."""
    body = {"model": model, "messages": messages, "max_tokens": max_tokens,
            "temperature": temperature, "usage": {"include": True},
            "reasoning": {"effort": "low", "exclude": True}}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {_key()}", "X-Title": "language-drift"}
    last = None
    for attempt in range(retries):
        t0 = time.perf_counter()
        try:
            r = await client.post(URL, json=body, headers=headers, timeout=90)
        except httpx.HTTPError as e:
            last = f"network: {type(e).__name__}"
        else:
            if r.status_code == 200:
                d = r.json()
                if d.get("error"):
                    last = f"api: {str(d['error'])[:200]}"
                else:
                    u = d.get("usage") or {}
                    msg = (d.get("choices") or [{}])[0].get("message") or {}
                    return {"text": (msg.get("content") or "").strip(),
                            "cost_usd": float(u.get("cost") or 0.0),
                            "prompt_tokens": u.get("prompt_tokens"),
                            "completion_tokens": u.get("completion_tokens"),
                            "latency_ms": round((time.perf_counter() - t0) * 1000)}
            elif r.status_code in (400, 401, 402, 403, 404):
                raise OpenRouterError(f"HTTP {r.status_code}: {r.text[:200]}")
            else:
                last = f"HTTP {r.status_code}"
        await asyncio.sleep(2 * (attempt + 1))
    raise OpenRouterError(last or "unknown error")
