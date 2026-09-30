from ld.parse import parse_number, strip_number_line


def test_basic():
    assert parse_number("Yes because...\nNUMBER: 7") == 7


def test_last_number_line_wins():
    assert parse_number("NUMBER: 3\nactually\nNUMBER: 8") == 8


def test_fullwidth_colon_and_digits():
    assert parse_number("回答。\nNUMBER：８") == 8


def test_devanagari_digits():
    assert parse_number("उत्तर।\nNUMBER: ७") == 7


def test_thousands_and_range():
    assert parse_number("NUMBER: 10,000") == 10000
    assert parse_number("NUMBER: 200-300") == 250
    assert parse_number("NUMBER: 200 to 300") == 250


def test_decimal_and_text_after():
    assert parse_number("NUMBER: 6.5 (roughly)") == 6.5


def test_missing():
    assert parse_number("I won't answer.") is None
    assert parse_number("") is None
    assert parse_number(None) is None


def test_strip():
    assert strip_number_line("Body text.\nNUMBER: 4") == "Body text."


def test_truncated_rows_are_retried_and_deduped():
    from ld.prompts import is_truncated, latest_ok
    cut = {"model": "g", "qid": "q01", "lang": "en", "run": 0, "text": "Proponents argue", "number": None, "completion_tokens": 696}
    ok = dict(cut, text="x\nNUMBER: 5", number=5.0, completion_tokens=900, max_tokens=1500)
    refused = dict(cut, text="I can't discuss this.", completion_tokens=12)
    assert is_truncated(cut) and not is_truncated(ok) and not is_truncated(refused)
    assert latest_ok([cut, ok]) == [ok]
    assert latest_ok([refused]) == [refused]
