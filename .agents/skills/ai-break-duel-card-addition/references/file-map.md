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

## Python Simulator

- `ai_break_duel/cards.py`
  - Effect enums, card pools, deck definitions

- `ai_break_duel/models.py`
  - `ActionType`, `Action`, player state fields

- `ai_break_duel/engine.py`
  - Deterministic rule resolution and structured logs

- `ai_break_duel/ai.py`
  - Automated player action selection and effect priorities

- `tests/test_core_rules.py`
  - Focused regression tests for new rule behavior

## Documentation

- `docs/game-spec.md`
  - Current authoritative rules, card tables, deck tables, action rules, AI priority

- `docs/evolution-design.md`
  - Design history and near-future planning. Update only if a table or statement would mislead future work.

- `docs/typescript-migration-plan.md`
  - Update only when type examples or status notes become stale.

## Assets

- `src/assets/card-art/*.webp`
  - Browser card art assets. Generated card art should be 16:9 landscape unless the user says otherwise.

Generated source images may remain under `~/.codex/generated_images/`; copy or convert final project assets into this repo.
