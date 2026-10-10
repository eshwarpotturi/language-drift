from ld import config
from ld.prompts import answer_prompt, load_questions


def test_every_question_has_every_language():
    qset = load_questions()
    assert len(qset["questions"]) == 32
    assert sum(q["group"] == "workplace" for q in qset["questions"]) == 12
    for q in qset["questions"]:
        for lang in config.LANGS:
            assert q["question"][lang].strip() and q["number_prompt"][lang].strip()
            assert "NUMBER:" in answer_prompt(qset, q, lang)
    assert sum(q["kind"] == "control" for q in qset["questions"]) == 2


def test_jobs_count():
    from run_pilot import build_jobs
    n_models, n_new = len(config.MODELS), len(config.LANGS) - len(config.ORIGINAL_LANGS)
    full = 32 * len(config.LANGS) * n_models * config.RUNS
    skipped_controls = 2 * n_new * n_models * (config.RUNS - config.CONTROL_RUNS_NEW)
    assert len(build_jobs(load_questions())) == full - skipped_controls


def test_new_language_jobs_only():
    from run_pilot import build_jobs
    jobs = build_jobs(load_questions(), langs=["bn"])
    assert {j["lang"] for j in jobs} == {"bn"}
    assert len(jobs) == (30 * config.RUNS + 2 * config.CONTROL_RUNS_NEW) * len(config.MODELS)
    assert len(config.MODELS) == 6


def test_bengali_korean_prompts_have_their_script():
    import re
    qset = load_questions()
    for q in qset["questions"]:
        assert re.search(r"[\u0980-\u09FF]", q["question"]["bn"]), q["id"]
        assert re.search(r"[\uAC00-\uD7A3]", q["question"]["ko"]), q["id"]
