"""Spend ledger shared by every step, and a guard that stops before the budget is exceeded."""
import json
from pathlib import Path


class BudgetExceeded(Exception):
    pass


class Ledger:
    """Total USD spent so far across all steps, persisted in logs/spend.json."""

    def __init__(self, path="logs/spend.json"):
        self.path = Path(path)
        self.by_step = json.loads(self.path.read_text()) if self.path.exists() else {}

    @property
    def total(self):
        return sum(self.by_step.values())

    def add(self, step, usd):
        self.by_step[step] = self.by_step.get(step, 0.0) + usd
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.by_step, indent=2))


class Guard:
    """Projects this step's total from the first calls; aborts if ledger + projection > budget."""

    def __init__(self, ledger, step, total_calls, budget_usd, after_calls=20):
        self.ledger, self.step = ledger, step
        self.total_calls, self.budget, self.after = total_calls, budget_usd, after_calls
        self.done, self.spent = 0, 0.0
        self.start_total = ledger.total

    def projection(self):
        if not self.done:
            return self.start_total
        return self.start_total + self.spent / self.done * self.total_calls

    def record(self, usd):
        self.done += 1
        self.spent += usd
        self.ledger.add(self.step, usd)
        if self.ledger.total > self.budget:
            raise BudgetExceeded(f"spent ${self.ledger.total:.3f} > budget ${self.budget:.2f}")
        if self.done == self.after and self.projection() > self.budget:
            raise BudgetExceeded(f"projected ${self.projection():.3f} > budget ${self.budget:.2f}")
