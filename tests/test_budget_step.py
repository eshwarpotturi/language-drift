import pytest

from ld.budget import BudgetExceeded, Guard, Ledger


def test_per_step_budget_ignores_earlier_spend(tmp_path):
    led = Ledger(tmp_path / "s.json")
    led.add("answers", 4.39)   # the original runs
    g = Guard(led, "answers-bn", total_calls=100, budget_usd=1.4, after_calls=20, per_step=True)
    for _ in range(100):
        g.record(0.01)
    assert g.spent == pytest.approx(1.0)


def test_per_step_budget_stops(tmp_path):
    led = Ledger(tmp_path / "s.json")
    g = Guard(led, "answers-bn", total_calls=800, budget_usd=1.4, after_calls=20, per_step=True)
    with pytest.raises(BudgetExceeded):
        for _ in range(20):
            g.record(0.01)   # projects $8


def test_per_step_budget_carries_over_between_chunks(tmp_path):
    led = Ledger(tmp_path / "s.json")
    g1 = Guard(led, "answers-bn", total_calls=10, budget_usd=1.0, after_calls=50, per_step=True)
    for _ in range(9):
        g1.record(0.1)                       # $0.90 in the first chunk
    g2 = Guard(led, "answers-bn", total_calls=10, budget_usd=1.0, after_calls=50, per_step=True)
    g2.record(0.05)
    with pytest.raises(BudgetExceeded):
        g2.record(0.1)                       # $1.05 across both chunks
