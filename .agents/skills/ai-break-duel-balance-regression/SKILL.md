---
name: ai-break-duel-balance-regression
description: Run and interpret AI Break Duel biased-cost deck balance regression checks. Use when Codex needs to periodically test whether power 1 only, power 2 only, power 3 only, power 4 only, power 1-2 only, or power 3-4 only synthetic decks are stronger than the existing six decks, investigate cost-bucket balance drift, or report matchup win rates after card/rule/AI changes in the ai-break-duel repository.
---

# AI Break Duel Balance Regression

## Workflow

1. Confirm the working directory is `/Users/user/WorkSpace/ai-break-duel`.
2. Inspect current uncommitted changes with `git status --short`; do not overwrite unrelated changes.
3. Run the bundled script for biased-cost deck checks:

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --games-per-order 1000 --seed 3000000
```

Use lower `--games-per-order` values such as `100` only for quick smoke checks. Use `1000` or more for user-facing balance reports. Candidates use the deck-builder template: 14 summon slots from the target cost band, plus 4 generic commands and 2 generic relics. Candidate generation also applies the fixed-deck high-power rule: power 3 or higher summons are singleton by card ID, with remaining summon slots filled by low-power summons when a target band cannot supply 14 legal summons.

4. Treat `candidate_win_rate > 0.5` against the six existing decks combined as a balance risk. Report both combined and per-existing-deck rates.
5. If the user asks to preserve the guard in tests, keep `tests/test_cost_balance.py` aligned with the script's candidate definitions and threshold.
6. After implementation changes, run:

```bash
PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run check
```

## Candidates

The regression set is:

- `p1`: power 1 summon slots
- `p2`: power 2 summon slots
- `p3`: power 3 summon slots
- `p4`: power 4 summon slots
- `p1_2`: power 1-2 summon slots
- `p2_3`: power 2-3 summon slots
- `p3_4`: power 3-4 summon slots

The baseline opponents are the existing six deck archetypes: `break`, `control`, `fire`, `water`, `wind`, `earth`.

## Reporting

Include:

- games per ordered matchup and seed
- rule set name when using `--rule-set`
- combined win rate for each candidate
- per-opponent win rates when a candidate is near or above 50%
- whether any candidate violates the design goal
- the exact validation command run

Useful experimental rule sets include `p3_cap_6`, `p3_cap_4`, `p3_cap_2`,
`p3_cap_1`, `high_cap_6`, `high_cap_4`, `p3_enters_spent`, `p3_cost_3`,
`p3_overheats`, `p3_discards_on_play`, `p3_cannot_hand_defend`,
`p4_no_overheat`, and combined rule sets such as `p3_cap_1_high_cap_4`.

Do not call a candidate "strong" just because it beats one or two archetypes. Use the combined rate against all six existing decks for the main conclusion.
