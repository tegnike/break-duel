# Break Duel

`Break Duel` is a small original card-game simulator for testing the core
rules from `/Users/user/WorkSpace/nikechan/docs/ai-break-duel-plan.md`.

This repository currently implements `Phase 2: Memory & Upgrade`:

See [`docs/game-spec.md`](docs/game-spec.md) for the complete current game
specification.
See [`docs/architecture.md`](docs/architecture.md) for the implementation
structure and handoff notes.
See [`docs/evolution-design.md`](docs/evolution-design.md) for the next-phase
design plan.

- Two 20-card decks:
  - Player 1 uses `突破デッキ`, focused on fire/water pressure and disruption.
  - Player 2 uses `制御デッキ`, focused on wind/earth defense and recursion.
- Two actions every turn.
- The game ends by life judgement after 60 player turns if neither player has
  lost by life damage.
- The first player starts with 5 cards.
- The second player starts with 4 cards.
- The first player's first turn has 1 action and no turn-start draw.
- The first player cannot attack on the first turn.
- Field limit of three AI characters.
- One memory slot per player. Playing a memory costs one action and replaces the
  previous memory.
- Same-attribute, lower-power field AI can be trashed to upgrade into a
  higher-power hand AI for 1 less action than normal play, minimum 1 action.
- There is no default hand limit. Hand size is controlled through card effects
  and hand defense instead of automatic end-of-turn cleanup.
- AI roles by power:
  - power 1: costs 1 action and draws 1 card when played.
  - power 2: costs 1 action and gets +1 power while defending.
  - power 3: costs 2 actions and can defend immediately after entering.
  - power 4: costs 2 actions, enters spent, and goes to discard after attacking.
- Command cards cost 1 action and go to discard after use:
  - `最適化`: discard up to 2 hand cards, then draw 2 cards.
  - `緊急パッチ`: ready 1 spent friendly AI.
  - `妨害コード`: spend 1 ready opposing AI.
  - `再学習`: return 1 AI from discard to hand, then discard 1 hand card
    if possible.
  - `サンドボックス`: this turn, prevent the next power-4 overheat after
    attacking.
- Memory cards reinforce strategies while also spending hand resources:
  - `キャッシュ領域`: draws only when its controller starts the turn with 2 or
    fewer cards.
  - `ファイアウォール`: discards 1 hand card to add +1 to same-attribute field
    defense.
  - In the browser UI, human players choose which hand card to discard for
    discard-cost effects such as `最適化`, `再学習`, `ファイアウォール`,
    and `パイプライン`.
- Attribute-based defense checks. Any AI can attempt to defend against any
  attribute, but attribute matchup changes the defense value:
  - defense value = defender power + defense bonus + attribute modifier.
  - advantaged defender gets +1.
  - disadvantaged defender gets -1.
  - equal defense and attack values trade; higher defense value lets the blocker
    survive spent.
- Once per turn, a player may defend from hand with any AI character that
  satisfies the defense check, regardless of field state. The hand defender
  goes to discard and prevents damage, so hand size acts as a real defensive
  resource without becoming unlimited protection.
- An AI that attacks becomes spent until its controller's next turn. Spent AI
  cannot attack again and cannot defend.
- A power 4 AI overheats after attacking and goes to discard. This makes it a
  finisher instead of a permanent attacker and prevents alternating power-4
  attacks from dominating the game.
- Field defense is resolved by numbers: if defense value equals attack value,
  both AI go to discard; if defense value is higher, only the attacker goes to
  discard and the defender stays on the field spent. Lower-power AI can still
  matter through attribute advantage or the power-2 defense bonus.
- Failed or undefended attacks deal 1 life damage. They do not draw a card.
- If the deck is empty, draw effects simply draw 0 cards. Discard is not
  automatically reshuffled into the deck.
- If both players have no deck, no hand, and no field AI, the game ends by life
  judgement. Higher life wins; equal life is a draw.
- CLI simulation with JSON and JSONL output.

The browser UI is implemented with React + TypeScript + Vite. It supports
memory placement, upgrade play, manual target selection for `妨害コード`, manual
discard-cost selection, and discard-pile inspection.

## Assets

The browser prototype uses selected PNG icons from Kenney's `Board Game Icons`
asset pack under Creative Commons CC0.

- Source: https://kenney.nl/assets/board-game-icons
- License: Creative Commons CC0

## Run

```bash
python3 -m ai_break_duel.cli simulate --games 1000 --seed 1 --out tmp
```

Use `--same-attribute-lenient` to reproduce the first draft where same-attribute
defense succeeds at equal power.

Hand defense is limited to once per turn by default. Use
`--hand-defense-limit 0` to disable hand defense. Use
`--hand-defense-empty-field-only` to reproduce the older empty-field-only rule.

The command writes:

- `tmp/summary.json`
- `tmp/matches.jsonl`

## Play UI

```bash
npm install
npm run build
python3 -m http.server 8000 --directory web
```

Open `http://localhost:8000/` to play a human-vs-AI match in the browser.
If port 8000 is already in use, choose another port such as 8017.

For live development:

```bash
npm run dev -- --host 127.0.0.1
```

## Test

```bash
npm run check
```
