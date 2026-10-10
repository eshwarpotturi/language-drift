import pytest

from ld import llm


def test_calls_go_to_foundry_openrouter_route(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "llmfoundry")
    monkeypatch.setenv("LLMFOUNDRY_BASE_URL", "https://llmfoundry.straivedemo.com/")
    monkeypatch.setenv("LLMFOUNDRY_API_KEY", "x")
    assert llm.base_url() == "https://llmfoundry.straivedemo.com/openrouter/v1"


def test_default_is_straight_to_openrouter(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "x")
    assert llm.base_url() == "https://openrouter.ai/api/v1"


def test_no_cache_header_is_sent():
    assert llm.NO_CACHE == {"Cache-Control": "no-cache"}


def test_price_from_config():
    # gpt-6-luna: $0.10/M in, $0.50/M out
    assert llm.price("openai/gpt-6-luna", 1_000_000, 0, 1_000_000) == pytest.approx(0.60)
    # cached input is cheaper
    assert llm.price("openai/gpt-6-luna", 1_000_000, 1_000_000, 0) == pytest.approx(0.01)


def test_every_model_has_a_price_and_effort():
    for mid, m in llm.all_models().items():
        assert m["input"] > 0 and m["output"] > 0 and m["effort"] == "low", mid


def test_missing_key_is_a_clear_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "llmfoundry")
    monkeypatch.delenv("LLMFOUNDRY_API_KEY", raising=False)
    monkeypatch.setenv("LLMFOUNDRY_BASE_URL", "https://x")
    with pytest.raises(llm.LLMError):
        llm._provider()
