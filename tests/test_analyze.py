import pytest

from analyze import build, drift_stats, normalise
from ld import config
from ld.prompts import load_questions


def test_normalise_units():
    assert normalise("agree_0_10", 7) == 0.7
    assert normalise("percent", 150) == 1.0
    assert 0 < normalise("deaths", 1000) < 1
    assert normalise("agree_0_10", None) is None


def test_drift_flag_needs_gap_and_beating_noise():
    same = drift_stats({"en": [0.5, 0.5, 0.5], "hi": [0.5, 0.5, 0.5], "zh": [0.5, 0.5, 0.5]})
    assert same["drift"] == 0 and not same["flagged"]
    real = drift_stats({"en": [0.8, 0.8, 0.8], "hi": [0.8, 0.8, 0.8], "zh": [0.3, 0.3, 0.3]})
    assert real["flagged"] and real["drift"] == pytest.approx(0.5)
    noisy = drift_stats({"en": [0.2, 0.9, 0.5], "hi": [0.9, 0.2, 0.6], "zh": [0.4, 0.8, 0.1]})
    assert not noisy["flagged"]


def test_drift_single_language_not_flagged():
    assert not drift_stats({"en": [0.5], "hi": [], "zh": []})["flagged"]


def _rows(qset, value_by_lang, refused_zh=False):
    A, J = [], []
    for q in qset["questions"]:
        for m, _, _ in config.MODELS:
            for lang in config.LANGS:
                for r in range(3):
                    v = q["expected"] if q["kind"] == "control" else value_by_lang[lang]
                    A.append({"model": m, "qid": q["id"], "lang": lang, "run": r, "text": f"x\nNUMBER: {v}", "number": v})
                    J.append({"model": m, "qid": q["id"], "lang": lang, "run": r, "gist_en": "g", "stance": 0,
                              "refused": refused_zh and lang == "zh", "hedged": False, "judge_number": None})
    return A, J


def test_build_no_drift():
    qset = load_questions()
    A, J = _rows(qset, {"en": 5, "hi": 5, "zh": 5})
    d = build(A, J, qset)
    s = d["summary"]
    assert s["pairs_tested"] == 18 * len(config.MODELS)
    assert s["pairs_drifting"] == 0 and s["top_model"] is None
    assert s["controls_ok"] == s["controls_total"] == 2 * len(config.MODELS)


def test_build_drift_and_refusal_split():
    qset = load_questions()
    A, J = _rows(qset, {"en": 8, "hi": 8, "zh": 2})
    s = build(A, J, qset)["summary"]
    # an 8-vs-2 gap is big on a 0-10 scale, but tiny as a percent or a death toll
    scale_qs = sum(q["unit"].endswith("0_10") for q in qset["questions"])
    assert s["pairs_drifting"] == scale_qs * len(config.MODELS)
    A, J = _rows(qset, {"en": 5, "hi": 5, "zh": 5}, refused_zh=True)
    d = build(A, J, qset)
    assert d["summary"]["pairs_drifting"] == d["summary"]["pairs_tested"]
    assert d["summary"]["refusals_by_language"]["zh"] > 0
    assert next(iter(d["cells"].values()))["refused_langs"] == ["zh"]


def test_errors_ignored_and_empty_ok():
    qset = load_questions()
    d = build([], [], qset)
    assert d["summary"]["pairs_drifting"] == 0 and d["summary"]["answers"] == 0
