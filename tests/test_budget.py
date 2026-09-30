import pytest

from ld.budget import BudgetExceeded, Guard, Ledger


def test_projection_aborts_early(tmp_path):
    led = Ledger(tmp_path / "s.json")
    g = Guard(led, "answers", total_calls=900, budget_usd=1.0, after_calls=20)
    with pytest.raises(BudgetExceeded):
        for _ in range(20):
            g.record(0.01)  # 0.01 x 900 = $9 projected
    assert g.done == 20


def test_within_budget(tmp_path):
    led = Ledger(tmp_path / "s.json")
    g = Guard(led, "answers", total_calls=100, budget_usd=1.0, after_calls=20)
    for _ in range(100):
        g.record(0.005)
    assert led.total == pytest.approx(0.5)


def test_hard_ceiling_counts_earlier_steps(tmp_path):
    led = Ledger(tmp_path / "s.json")
    led.add("answers", 0.95)
    g = Guard(led, "judge", total_calls=10, budget_usd=1.0, after_calls=20)
    with pytest.raises(BudgetExceeded):
        g.record(0.1)


def test_ledger_persists(tmp_path):
    p = tmp_path / "s.json"
    Ledger(p).add("a", 0.2)
    assert Ledger(p).total == pytest.approx(0.2)
