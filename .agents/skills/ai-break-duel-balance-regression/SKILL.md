---
name: ai-break-duel-balance-regression
description: Run and interpret AI Break Duel preset-deck and biased-cost stress-deck balance regression checks. Use when Codex needs to test existing deck round-robin balance, first-player win rate, one-sided game rate, resource-exhaustion pressure, or whether power-band stress decks such as p1, p2, p3 cap, p4 cap, p1-2, p2-3, or p3-4 cap outperform the existing six decks after card, rule, AI, or action-cost changes in the ai-break-duel repository.
---

# AI Break Duel Balance Regression

## Workflow

1. Confirm the working directory is `/Users/user/WorkSpace/ai-break-duel`.
2. Inspect current uncommitted changes with `git status --short`; do not overwrite unrelated changes.
3. For a full rule-audit pass, run the bundled script with the existing six-deck
   league and the biased-cost stress decks together:

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --rule-set proposed_action_cost --include-preset-league --games-per-order 1000 --seed 3000000 --out tmp/action-cost-balance-audit.json
```

Use `--rule-set current` for the current rules. The `proposed_action_cost`
rule set means direct summon cost equals summon power, and upgrade cost equals
target power minus source power. Use
`--rule-set proposed_action_cost_empty_field_discount` to add the comeback
variant where the first `PLAY_AI` from an empty field each turn costs 1 less
action. Use `--rule-set proposed_action_cost_comeback_memory` to test the card
variant where each deck replaces one relic with an experimental relic that
reduces the first normal summon cost by 1 while its controller is behind on
life. The script defaults to `challenger` versus `challenger`; pass
`--first-ai` and `--second-ai` only when a comparison explicitly needs another
CPU profile.

4. For biased-cost stress-deck checks only, run:

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --games-per-order 1000 --seed 3000000
```

Use lower `--games-per-order` values such as `100` only for quick smoke checks. Use `1000` or more for user-facing balance reports. Candidates use the deck-builder template: 14 summon slots from the target band, plus 4 generic commands and 2 generic relics. Candidate generation also applies the current high-power construction rules: power 3 or higher summons are singleton by card ID and power 3+ summons are capped at 4 total, with remaining summon slots filled by legal low-power summons when a target band cannot supply 14 legal summons.

5. Treat `candidate_win_rate > 0.5` against the six existing decks combined as a balance risk. Report both combined and per-existing-deck rates.
6. When `--include-preset-league` is used, report existing-deck standings, first-player win rate, average turns, one-sided game rate, and resource-exhaustion rate before candidate stress-deck results.
7. If the user asks to preserve the guard in tests, keep `tests/test_cost_balance.py` aligned with the script's candidate definitions and threshold.
8. After implementation changes, run:

```bash
PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run check
```

## Candidates

The regression set is:

- `p1`: power 1 stress deck
- `p2`: power 2 stress deck
- `p3`: power 3 cap stress deck; low-power filler may be added
- `p4`: power 4 cap stress deck; low-power filler may be added
- `p1_2`: power 1-2 stress deck
- `p2_3`: power 2-3 stress deck; high-power cap may add filler
- `p3_4`: power 3-4 cap stress deck; low-power filler may be added

Do not call `p3`, `p4`, or `p3_4` "power 3 only", "power 4 only", or
"power 3-4 only". Under the high-power cap, those candidates are cap-stress
decks with legal filler, not pure high-power decks.

The baseline opponents are the existing six deck archetypes: `break`, `control`, `fire`, `water`, `wind`, `earth`.

## Reporting

Include:

- games per ordered matchup and seed
- rule set name when using `--rule-set`
- CPU profiles; default is `challenger/challenger`
- existing-deck league standings when included
- first-player win rate, one-sided game rate, resource-exhaustion rate, and average turns
- combined win rate for each stress candidate
- per-opponent win rates when a candidate is near or above 50%
- whether any candidate violates the design goal
- the exact validation command run

Useful experimental rule sets include `p3_cap_6`, `p3_cap_4`, `p3_cap_2`,
`p3_cap_1`, `high_cap_6`, `high_cap_4`, `p3_enters_spent`, `p3_cost_3`,
`p3_overheats`, `p3_discards_on_play`, `p3_cannot_hand_defend`,
`p3_defense_minus_1`, `p3_cap_2_defense_minus_1`, `p4_no_overheat`,
`high_direct_3_upgrade_1`, `p3_slow_recovery`,
`high_cap_4_p3_slow_recovery`, `high_cap_4_p4_no_overheat`,
`proposed_action_cost`, `proposed_action_cost_empty_field_discount`,
`proposed_action_cost_comeback_memory`, and combined rule sets such as
`p3_cap_1_high_cap_4`.

Do not call a candidate "strong" just because it beats one or two archetypes. Use the combined rate against all six existing decks for the main conclusion.
