---
name: ai-break-duel-card-addition
description: Add or modify AI Break Duel cards end-to-end across the React/TypeScript game, headless simulation, decks, UI text, generated card art, documentation, tests, and commits. Use when the user asks to add a summon, command, relic, card effect, deck entry, card wording change, card image, or card-balance rule in the ai-break-duel repository.
---

# AI Break Duel Card Addition

## Workflow

1. Start from repository truth, not memory.
   - Read `docs/game-spec.md` for current rules and naming conventions.
   - Read `references/file-map.md` for the files that must stay synchronized.
   - Inspect current code around similar card effects before editing.

2. Model the card once in the single TypeScript implementation.
   - Add TypeScript effect unions, card pool entries, deck entries, rule helpers, action resolution, AI behavior, UI selection flow, and card text.
   - The browser game and the headless simulation CLI (`src/sim/`) share the same engine, so one change covers both.
   - **Register every new or changed card effect in `src/game/cardEffectCoverage.test.ts`.** The unit
     suite fails by design when an effect is unregistered, so skipping this breaks `npm run check`.
   - Respect the deck construction rules when touching deck entries: 25 cards per deck, at most 2
     copies per card name, and at most 5 summons of power 3 or higher.

3. Treat visible card text as player-facing rules text.
   - Do not include internal implementation caps such as "maximum 3" on the card unless the user explicitly wants it on-card.
   - Put internal details in `docs/game-spec.md` detailed rule sections when useful.
   - Write draw text as `山札からカードをN枚引く`.
   - Avoid `ただし`; split drawbacks into separate short sentences, e.g. `消耗で出る。手札防御に使えない。`
   - Opponent draw logs must not reveal opponent card names.

4. Add generated art for every new card unless the user explicitly opts out.
   - **Under Codex**: use the `imagegen` skill directly.
   - **Under Claude Code**: `imagegen` cannot be executed directly. Delegate the generation to
     Codex CLI via the `codex:rescue` skill (or the `codex:codex-rescue` subagent), passing a
     self-contained task such as:
     `imagegen スキルで「<カード名>」のカードアートを生成し、1600x900 (16:9) の WebP として
     src/assets/card-art/<card-id>.webp に保存して。アート方向性: <雰囲気・モチーフの指示>`
     After the run, verify the file exists and is 16:9 (e.g. `sips -g pixelWidth -g pixelHeight <file>`)
     before registering it.
   - Only if Codex is unavailable, procedural composition with PIL is an acceptable fallback
     (see `src/assets/card-art/cmd-purge.webp` for a precedent).
   - Default card art should be 16:9 landscape WebP under `src/assets/card-art/`.
   - Vary the art direction/style prompt for each card instead of reusing one
     fixed house style across a batch.
   - Import the asset in `src/components/cardPresentation.ts` and map it in `SUPPORT_CARD_ART` or `AI_CARD_ART`.

5. Update docs and tests.
   - Update `docs/game-spec.md` for authoritative current rules.
   - Update design/planning docs only when they would become misleading.
   - Add focused vitest cases in `src/game/*.test.ts` for rule behavior.
   - Add or adjust UI tests only if the project already has a relevant harness or the UI change is high risk.
   - **Check the tutorial is not broken.** `src/tutorial.ts` scripts a fixed playthrough that depends
     on specific card IDs, costs, effects, and draw order. Changing a card that appears in the
     tutorial decks can silently soft-lock the scripted flow. Run
     `npx vitest run src/game/tutorial.test.ts`, and for changes to tutorial-deck cards walk the
     scripted turns on paper (or in the browser) before calling the change done.

6. Verify before reporting or committing.
   - Run `npm run check` (typecheck + vitest + build). If `npm` is not on PATH
     (Codex runtime), use `PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run check`.
   - If assets or text layout changed substantially, inspect the browser when practical.
   - Card additions and effect changes shift the balance. For anything beyond cosmetic changes,
     follow the verification pipeline in `.agents/skills/ai-break-duel-balance-tuning/SKILL.md`
     (league on 2+ seeds, excitement metrics, `docs/balance-history.md` entry).

7. Commit in useful units.
   - Separate mechanical wording/docs-only cleanup from new card implementation when both exist.
   - Include generated assets in the implementation commit.
   - Keep commit messages short and concrete.
