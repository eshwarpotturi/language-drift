"""Prints what the OpenRouter key has spent so far. Free to call; never prints the key. (Same as slm-opti.)"""
from ld.llm import key_spend

d = key_spend()
if d is None:
    print("LLM_PROVIDER is not openrouter; spend is tracked in logs/spend.json")
else:
    print(f"limit ${d['limit']} | used ${d['usage']:.4f} | remaining ${d['limit_remaining']}  (≈ ₹{d['usage'] * 100:.0f} used)")
