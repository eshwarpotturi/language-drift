import re
import shutil
import subprocess
from pathlib import Path

import pytest

DASH = Path(__file__).resolve().parent.parent / "dashboard"


def _html():
    return (DASH / "index.html").read_text(encoding="utf-8")


def test_answer_table_right_under_headline():
    html = _html()
    intro_end = html.index("</header>", html.index('class="intro"'))
    nxt = html.index("<section", intro_end)
    assert 'id="answers"' in html[nxt:nxt + 120]
    assert '<script src="answers.js"></script>' in html


def test_detailed_results_open_by_default():
    assert re.search(r'<details[^>]*id="analyst"[^>]*\bopen\b', _html())


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_answer_colours_match_data():
    out = subprocess.run(["node", str(Path(__file__).with_name("answers_check.mjs"))], capture_output=True, text=True)
    assert out.returncode == 0, out.stdout + out.stderr


def test_answer_table_starts_on_changed_filter():
    js = (DASH / "answers.js").read_text(encoding="utf-8")
    assert "let filter = 'changed';" in js
