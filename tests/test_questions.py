from ld import config
from ld.prompts import answer_prompt, load_questions


def test_every_question_has_every_language():
    qset = load_questions()
    assert len(qset["questions"]) == 20
    for q in qset["questions"]:
        for lang in config.LANGS:
            assert q["question"][lang].strip() and q["number_prompt"][lang].strip()
            assert "NUMBER:" in answer_prompt(qset, q, lang)
    assert sum(q["kind"] == "control" for q in qset["questions"]) == 2


def test_jobs_count():
    from run_pilot import build_jobs
    assert len(build_jobs(load_questions())) == 20 * 3 * len(config.MODELS) * config.RUNS
