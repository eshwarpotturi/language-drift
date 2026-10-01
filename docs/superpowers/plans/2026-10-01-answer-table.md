# Answer Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Directly under the headline, show every question as a small table (rows = the 5 AIs, columns = English / Hindi / Chinese) with each AI's plain answer, colour coded green/red, and open the "detailed results" section by default.

**Architecture:** New `dashboard/answers.js` with two pure functions (`labelOf`, `coloursFor`) plus a renderer that reads the existing `data.json`. `index.html` gets a `<section id="answers">` right after the intro, and `<details id="analyst" open>`. No data or AI-call changes.

**Spec:** Eswar, 1 Oct 2026 — sheet-style layout (question heading, Model | English | Hindi | Chinese), answers colour coded; choices: odd-one-out red, all 30 questions, right under the headline, numbers shown as numbers; detailed results expanded by default.

## Global Constraints
- Two colours only: green = agrees, red = the odd one out.
- Same advice in all languages (not `flagged`, not `refusal_split`) → all three green.
- `refusal_split` → refused language(s) red, others green.
- `flagged` → sort the three language averages; red = the language(s) on the far side of the largest gap; others green. Exactly one red per changed row unless the two gaps tie.
- Totals must match the rest of the page: 23 AI × question rows contain red; per AI 8/7/4/3/1.
- Every cell carries text (label + small score), never colour alone. Light + dark themes via existing tokens.
- Order: questions with any change first, workplace before society, then by number of changed AIs.
- Filter chips: All · Only changes · Workplace · Society (default All).

## Review Focus
1. Two gaps tie (e.g. 2, 5, 8) → both ends red; tested.
2. A flagged row with a refused language → the refusal is red; tested via refusal_split path.
3. Number questions (months, %, deaths) → show value with unit; tested labelOf.
4. Dark mode readability → screenshot.
5. Phone width 390 → page has no horizontal scroll; table scrolls in its own box.

### Task 1: answer table (tests: tests/answers_check.mjs, tests/test_dashboard_page.py)
- [ ] Write failing tests (counts 23 / per-AI 8,7,4,3,1 / one red per flagged row / tie case / refusal case / labels; page: section after intro, details open, script tag)
- [ ] Run → fail
- [ ] Implement answers.js, index.html, style.css
- [ ] Run → pass; commit

### Task 2: verify and publish
- [ ] Screenshots 1440×900 light + dark, 390×844
- [ ] Push to main, confirm Pages build + live HTML, sync Mac
