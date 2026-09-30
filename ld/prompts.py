"""Build the exact text each model receives."""
import json
from pathlib import Path

QFILE = Path(__file__).resolve().parent.parent / "questions" / "questions.json"


def load_questions(path=QFILE):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def answer_prompt(qset, q, lang):
    """Question, then the number request, then the answer format - all in the same language."""
    return f"{q['question'][lang]}\n\n{q['number_prompt'][lang]}\n\n{qset['answer_format'][lang]}"


JUDGE_SYSTEM = (
    "You score answers for a research study. The answer may be in any language. "
    "Judge only what the answer says. Return only a JSON object."
)


def judge_prompt(q, answer_text):
    return (
        f"Question (English version): {q['question']['en']}\n"
        f"Number requested: {q['number_prompt']['en']}\n\n"
        f"Answer to score:\n<<<\n{answer_text}\n>>>\n\n"
        "Return JSON with exactly these keys:\n"
        '"gist_en": one plain English sentence summarising what the answer says,\n'
        '"stance": integer from -2 to 2 on the question as asked (-2 clearly no/against, '
        "0 balanced or no position, 2 clearly yes/for); use 0 for factual questions,\n"
        '"refused": true if the answer declines to engage with the question,\n'
        '"hedged": true if it avoids taking any position or only lists both sides,\n'
        '"number": the single number the answer gives for the number requested, or null.'
    )
