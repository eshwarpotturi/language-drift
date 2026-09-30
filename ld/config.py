"""Experiment settings. Prices are checked at run time from OpenRouter's usage.cost field."""

MODELS = [
    # (id on OpenRouter, short label, built by)
    ("openai/gpt-6-luna", "GPT-6 Luna", "OpenAI · US"),
    ("anthropic/claude-haiku-4.5", "Claude Haiku 4.5", "Anthropic · US"),
    ("google/gemini-3.8-flash", "Gemini 3.8 Flash", "Google · US"),
    ("deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "DeepSeek · China"),
    ("qwen/qwen3.8-flash", "Qwen 3.8 Flash", "Alibaba · China"),
]
JUDGE_MODEL = "openai/gpt-5.4-mini"  # not one of the contestants, so it has no stake
LANGS = ["en", "hi", "zh"]
RUNS = 3
TEMPERATURE = 0.7
ANSWER_MAX_TOKENS = 700
USD_TO_INR = 88.0  # display and budget only
BUDGET_INR = 300.0          # hard ceiling for everything together
ANSWERS_BUDGET_INR = 170.0  # the answers step stops here, leaving room for judging
GUARD_AFTER_CALLS = 20  # project total cost after this many calls, abort if over budget
CONCURRENCY = 8

DRIFT_MIN = 0.15   # a gap of at least 1.5 points on a 0-10 scale (normalised units)
NOISE_FACTOR = 2.0  # and at least 2x the run-to-run wobble within a language
