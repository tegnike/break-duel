---
name: ai-break-duel-card-addition
description: Add or modify AI Break Duel cards end-to-end across the React/TypeScript game, Python simulator, decks, UI text, generated card art, documentation, tests, and commits. Use when the user asks to add a summon, command, relic, card effect, deck entry, card wording change, card image, or card-balance rule in the ai-break-duel repository.
---

# AI Break Duel Card Addition

## Workflow

1. Start from repository truth, not memory.
   - Read `docs/game-spec.md` for current rules and naming conventions.
   - Read `references/file-map.md` for the files that must stay synchronized.
   - Inspect current code around similar card effects before editing.

2. Model the card once, then mirror it.
   - Add TypeScript effect unions, card pool entries, deck entries, rule helpers, action resolution, AI behavior, UI selection flow, and card text.
   - Add Python enum values, card pool entries, deck entries, engine resolution, AI behavior, and tests.
   - Keep browser game and Python simulator behavior equivalent unless the user explicitly scopes one side only.

3. Treat visible card text as player-facing rules text.
   - Do not include internal implementation caps such as "maximum 3" on the card unless the user explicitly wants it on-card.
   - Put internal details in `docs/game-spec.md` detailed rule sections when useful.
   - Write draw text as `山札からカードをN枚引く`.
   - Avoid `ただし`; split drawbacks into separate short sentences, e.g. `消耗で出る。手札防御に使えない。`
   - Opponent draw logs must not reveal opponent card names.

4. Add art only when requested.
   - Use the `imagegen` skill for generated raster art.
   - Default card art should be 16:9 landscape WebP under `src/assets/card-art/`.
   - Import the asset in `src/components/cardPresentation.ts` and map it in `SUPPORT_CARD_ART` or `AI_CARD_ART`.

5. Update docs and tests.
   - Update `docs/game-spec.md` for authoritative current rules.
   - Update design/planning docs only when they would become misleading.
   - Add focused Python tests in `tests/test_core_rules.py` for simulator behavior.
   - Add or adjust UI tests only if the project already has a relevant harness or the UI change is high risk.

6. Verify before reporting or committing.
   - Run `PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/tsc --noEmit`.
   - Run `python3 -m unittest`.
   - Run `PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vite build`.
   - If assets or text layout changed substantially, inspect the browser when practical.

7. Commit in useful units.
   - Separate mechanical wording/docs-only cleanup from new card implementation when both exist.
   - Include generated assets in the implementation commit.
   - Keep commit messages short and concrete.
