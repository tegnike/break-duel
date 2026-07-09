---
name: ai-break-duel-balance-regression
description: Run and interpret AI Break Duel preset-deck and biased-cost stress-deck balance regression checks. Use when you need to test existing deck round-robin balance, first-player win rate, one-sided game rate, resource-exhaustion pressure, or whether power-band stress decks such as p1, p2, p3 cap, p4 cap, p1-2, p2-3, or p3-4 cap outperform the existing six decks after card, rule, AI, or action-cost changes in the ai-break-duel repository.
---

# AI Break Duel Balance Regression

> Note: This skill covers the biased-cost stress-deck regression check only. For the full
> balance-tuning workflow (league verification, excitement metrics,
> adoption criteria, and `docs/balance-history.md` recording), see
> `.agents/skills/ai-break-duel-balance-tuning/SKILL.md`, which uses this skill as one of its
> verification steps.

## Workflow

1. Confirm the working directory is `/Users/user/WorkSpace/ai-break-duel`.
2. Inspect current uncommitted changes with `git status --short`; do not overwrite unrelated changes.
3. Run the stress-deck regression with the TypeScript CLI (same engine as the
   browser game):

```bash
npm run balance:cost -- --games-per-order 1000 --seed 3000000 --out tmp/cost-balance-3000000.json
```

The TS CLI supports `--rule-set current` only (the experimental Python rule
sets were retired with the Python simulator on 2026-07-08). It always uses
`challenger` versus `challenger`. Use `--candidate <id>` to restrict to a
single stress candidate.

4. For an existing six-deck round-robin league (previously
   `--include-preset-league`), run:

```bash
npm run sim -- league --games-per-pair 1000 --seed 3000000 --decks break control fire water wind earth --out tmp/preset-league-3000000
```

Use lower `--games-per-order` values such as `100` only for quick smoke checks. Use `1000` or more for user-facing balance reports. Candidates use the deck-builder template (updated 2026-07-04 for the 25-card deck rules): 19 summon slots from the target band, plus 4 generic commands and 2 generic relics, 25 cards total. Candidate generation also applies the current construction rules: at most 2 copies per card ID, and power 3+ summons are capped at 5 total under `--rule-set current`, with remaining summon slots filled by legal low-power summons when a target band cannot supply 19 legal summons.

5. Report `candidate_win_rate` against all six existing decks combined, but do
   not use that number alone as the final risk call when the loss is mostly
   concentrated in the mono-attribute decks. The mono-attribute decks
   (`fire`, `water`, `wind`, `earth`) are allowed to be weaker because they
   are theme / onboarding samples. The competitive baseline is the multicolor
   pair `break` and `control`; treat a stress candidate as a stronger balance
   risk when it also beats the `break`/`control` subset combined above 50%, or
   when match-shape metrics such as one-sided rate are unacceptable.
   Always report six-deck combined, `break`/`control` combined, and
   per-existing-deck rates.
6. When `--include-preset-league` is used, report existing-deck standings, first-player win rate, average turns, one-sided game rate, and resource-exhaustion rate before candidate stress-deck results.
7. If the user asks to preserve the guard in tests, keep `src/game/costBalance.guard.test.ts` aligned with `src/sim/costBalance.ts` candidate definitions and thresholds.
8. After implementation changes, run `npm run check`. If `npm` is not on PATH (Codex runtime), use:

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

## Evaluation Criteria

- `break` and `control` are the current competitive multicolor baselines.
  Multicolor decks are expected to have better strategic depth and higher deck
  efficiency than mono-attribute samples.
- `fire`, `water`, `wind`, and `earth` are mono-attribute theme / onboarding
  decks. It is acceptable if they underperform optimized or biased stress
  decks, as long as their play patterns remain clear and they are not the only
  evidence for a balance conclusion.
- Keep reporting the six-existing-deck combined win rate because it shows the
  full preset environment, but distinguish it from the competitive
  `break`/`control` subset. If a candidate is high only because it farms mono
  decks, say that explicitly instead of calling the whole rule set broken.
- One-sided game rate remains a primary quality signal. A candidate can still be
  a problem even with acceptable `break`/`control` rates if it creates too many
  one-sided games.
- When updating preset decks for this rule family, preserve mono-attribute
  identity unless the user explicitly asks to make mono decks competitive.

## Reporting

Include:

- games per ordered matchup and seed
- rule set name when using `--rule-set`
- CPU profiles; default is `challenger/challenger`
- existing-deck league standings when included
- first-player win rate, one-sided game rate, resource-exhaustion rate, and average turns
- six-deck combined win rate for each stress candidate
- `break`/`control` combined win rate for each stress candidate
- per-opponent win rates when a candidate is near or above 50%
- whether any candidate violates the design goal
- the exact validation command run

Historical note: the retired Python script supported experimental rule sets
(`high_cap_*`, `p3_cap_*`, `proposed_action_cost*`, etc.) used for one-off rule
audits. Their conclusions are recorded in `docs/balance-history.md` (see the
2026-07-06 entry for the power 3+ cap curve). The TS CLI intentionally supports
only the adopted `current` rule set.

Do not call a candidate "strong" just because it beats one or two archetypes.
For the main conclusion, separate the full six-deck environment from the
competitive multicolor baseline. A candidate that only farms mono decks is a
mono-deck weakness finding, not automatically a rule-set rejection.
