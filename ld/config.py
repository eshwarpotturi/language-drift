"""Experiment settings. Models and prices live in config/models.yaml (see ld/llm.py)."""
from ld.llm import CONFIG

MODELS = [(m["id"], m["label"], m["maker"]) for m in CONFIG["models"].values()]
JUDGE_MODEL = CONFIG["judge_model"]["id"]          # not one of the contestants, so it has no stake
SECOND_TRANSLATOR = CONFIG["second_translator"]["id"]
LANGS = ["en", "hi", "zh", "bn", "ko"]
ORIGINAL_LANGS = ["en", "hi", "zh"]                 # asked directly on OpenRouter, Sept 2026
RUNS = 5
CONTROL_RUNS_NEW = 1      # new languages ask the two factual controls once: they only check the pipeline
TEMPERATURE = 0.7
ANSWER_MAX_TOKENS = 1500  # Gemini spends hidden reasoning tokens from this budget; 700 cut answers off
USD_TO_INR = 100.0        # display and budget only
GUARD_AFTER_CALLS = 20    # project this step's cost after this many calls, abort if over budget
CONCURRENCY = 8
SPEND_FILE = "logs/spend.json"  # every step adds to it; budgets below apply per step and per language

# Hard stops, in INR, per paid step of the Bengali/Korean extension.
STEP_BUDGET_INR = {"backtranslate": 20, "route_check": 30, "answers": 140, "judge": 60}

DRIFT_MIN = 0.15   # a gap of at least 1.5 points on a 0-10 scale (normalised units)
NOISE_FACTOR = 2.0  # and at least 2x the run-to-run wobble within a language
