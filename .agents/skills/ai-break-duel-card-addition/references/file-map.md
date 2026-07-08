# AI Break Duel Card Addition File Map

Use this file when adding or modifying cards in `ai-break-duel`.

## TypeScript Browser Game

- `src/game.ts`
  - Effect unions: `AiEffect`, `CommandEffect`, `MemoryEffect`
  - Card pool: `cardPool()`
  - Decks: `DECKS`
  - Player state, reset flags, helper predicates, AI decision helpers
  - Player-facing AI effect text: `aiEffectText`

- `src/game/actions.ts`
  - Main resolution functions for play, command, memory effect, attack, defense, overheat, cycle
  - Logs and duel event payloads
  - Draw logs should use `visibleDrawText`

- `src/App.tsx`
  - Human UI action handlers
  - Pending target selection flows
  - Toasts, duel events, and command/memory confirmation paths

- `src/components/cardPresentation.ts`
  - Card art imports and maps
  - Card glyphs, fallback icons, role text, selected card text

- `src/components/DuelPanel.tsx`
  - Selected-card hints and tactical text

- `src/components/DeckWorkshop.tsx`
  - Card type counts and deck workshop display

- `src/styles.css`
  - Layout changes, log/sidebar changes, and card art presentation styles

- `src/game/cardEffectCoverage.test.ts`
  - **Mandatory registration for every card effect.** The suite fails when an effect is unregistered.

- `src/tutorial.ts` and `src/game/tutorial.test.ts`
  - Fixed tutorial script. Depends on specific card IDs, costs, effects, and draw order; verify it
    still completes when those change.

- `src/duelEvents.ts` and `src/components/Overlays.tsx`
  - Duel event payloads and emphasis levels (`low`/`high`/`peak`) for battle presentation.

## Headless Simulation (TypeScript)

- `src/sim/cli.ts`, `src/sim/runner.ts`, `src/sim/stats.ts`
  - Headless simulate/league CLI sharing the browser engine (`npm run sim`)

- `src/sim/costBalance.ts` and `src/game/costBalance.guard.test.ts`
  - Stress-deck definitions and cost-balance guardrails

- `src/game/*.test.ts`
  - Focused vitest regression tests for new rule behavior

## Documentation

- `docs/game-spec.md`
  - Current authoritative rules, card tables, deck tables, action rules, AI priority

- `docs/balance-history.md`
  - Adoption decisions with verification numbers. Add an entry for any balance-relevant card change.

- `docs/evolution-design.md`
  - Design history and near-future planning. Update only if a table or statement would mislead future work.

- `docs/design-principles.md`
  - Standing design principles, rejected proposals, and verification pass criteria. Read before balance-relevant changes.

- `docs/archive/`
  - Completed historical records (migration log, finished work packages). Do not update except to fix broken links.

## Assets

- `src/assets/card-art/*.webp`
  - Browser card art assets. Generated card art should be 16:9 landscape unless the user says otherwise.

Generated source images may remain under `~/.codex/generated_images/`; copy or convert final project assets into this repo.
