# Break Duel

`Break Duel` is a small original card-game simulator for testing the core
rules from `/Users/user/WorkSpace/nikechan/docs/ai-break-duel-plan.md`.

This repository currently implements `Phase 2: Relic & Upgrade`:

See [`docs/game-spec.md`](docs/game-spec.md) for the complete current game
specification.
See [`docs/architecture.md`](docs/architecture.md) for the implementation
structure and handoff notes.
See [`docs/evolution-design.md`](docs/evolution-design.md) for the next-phase
design plan.

- Python simulations use two standard 20-card decks by default:
  - Player 1 uses `紅蓮突破デッキ`, focused on fire/water pressure and disruption.
  - Player 2 uses `大地守護デッキ`, focused on wind/earth defense and recursion.
- The browser UI starts from a battle deck picker. The human player chooses one
  of the six preset decks, and the rival is selected randomly from the
  remaining presets.
- Four mono-attribute 20-card decks are available for browser play and balance
  leagues:
  - `fire`: aggro pressure, hand-defense punishment, disruption, finishers.
  - `water`: draw, filtering, refill finishers, and recursion.
  - `wind`: tempo, ready/spent control, reusable attackers, returning finishers.
  - `earth`: defense, firewall, successful-defense draw, and recursion.
  - Each mono-attribute deck keeps summon cards within one attribute, then
    doubles theme-defining summons as needed for balance.
- Two actions every turn.
- The game ends by life judgement after 60 player turns if neither player has
  lost by life damage.
- The first player starts with 5 cards.
- The second player starts with 4 cards.
- The first player's first turn has 1 action and no turn-start draw.
- The first player cannot attack on the first turn.
- Field limit of three summon cards.
- One relic slot per player. Playing a relic costs one action and replaces the
  previous relic.
- Same-attribute, lower-power field summons can be trashed to upgrade into a
  higher-power hand summon for 1 less action than normal play, minimum 1 action.
- There is no default hand limit. Hand size is controlled through card effects
  and hand defense instead of automatic end-of-turn cleanup.
- Summon cards have base power roles plus selected individual effects:
  - The summon pool has 32 cards: 4 attributes x 4 power values x A/B variants.
  - power 1/2: costs 1 action and works well as upgrade material.
  - power 3: costs 2 actions as a mid-size summon.
  - power 4: costs 2 actions and goes to discard after attacking.
  - selected summon cards have effects such as attack value +1, draw on play,
    hand-defense punishment, blocked-attack draw, ready/spent control,
    return-to-hand after attack, defense value +1, or successful-defense draw.
    Some stronger effects carry drawbacks such as self-damage, entering spent,
    letting the opponent draw, or being unusable for hand defense.
  - attribute themes are intentionally distinct: fire forces damage/resource
    pressure through defenses, water keeps hand quality high, wind wins tempo
    through ready/spent manipulation, and earth converts defense into resources.
- Command cards cost 1 action and go to discard after use:
  - `陣形リライト`: discard 1 hand card, then draw 2 cards.
  - `若葉の息吹`: ready 1 spent friendly summon.
  - `黒蔦の足止め`: spend 1 ready opposing summon.
  - `幻獣回帰の巻`: return 1 summon from discard to hand, then discard 1 hand card
    if possible.
  - `蒼殻バリア`: this turn, prevent the next power-4 post-attack retreat after
    attacking.
- Relic cards reinforce strategies while also spending hand resources:
  - `灯火の旅嚢`: draws only when its controller starts the turn with 2 or
    fewer cards.
  - `竜盾の紋章`: discards 1 hand card to add +1 to off-attribute field
    defense.
  - In the browser UI, human players choose which hand card to discard for
    discard-cost effects such as `陣形リライト`, `幻獣回帰の巻`, `竜盾の紋章`,
    and `星泉の導脈`.
- Attribute matchup is not used. Any summon can attempt to defend against any
  attribute, and attribute differences are expressed through individual summon
  card effects:
  - attack value = attacker power + attacker individual effect.
  - defense value = defender power + defender individual effect + defense bonus.
  - equal defense and attack values trade; higher defense value lets the blocker
    survive spent.
- Once per turn, a player may defend from hand with any summon card that
  satisfies the defense check, regardless of field state. The hand defender
  goes to discard and prevents damage, so hand size acts as a real defensive
  resource without becoming unlimited protection.
- A summon that attacks becomes spent until its controller's next turn. Spent
  summons cannot attack again and cannot defend.
- A power 4 summon retreats after attacking and goes to discard. This makes it a
  finisher instead of a permanent attacker and prevents alternating power-4
  attacks from dominating the game.
- Field defense is resolved by numbers: if defense value equals attack value,
  both summons go to discard; if defense value is higher, only the attacker goes
  to discard and the defender stays on the field spent. Lower-power summons can
  still matter through individual effects.
- Failed or undefended attacks deal 1 life damage. They do not draw a card.
- If the deck is empty, draw effects simply draw 0 cards. Discard is not
  automatically reshuffled into the deck.
- If both players have no deck, no hand, and no field summons, the game ends by
  life judgement. Higher life wins; equal life is a draw.
- CLI simulation with JSON and JSONL output.

The browser UI is implemented with React + TypeScript + Vite. It supports
starter deck selection, relic placement, upgrade play, manual target selection
for key effects, manual discard-cost selection, and discard-pile inspection.

## Assets

The browser prototype uses selected PNG icons from Kenney's `Board Game Icons`
asset pack under Creative Commons CC0.

- Source: https://kenney.nl/assets/board-game-icons
- License: Creative Commons CC0

## Run

```bash
python3 -m ai_break_duel.cli simulate --games 1000 --seed 1 --out tmp
```

Run a mono-attribute round-robin league:

```bash
python3 -m ai_break_duel.cli league --games-per-pair 1000 --seed 4701 --out tmp/feature_league_4701
```

The legacy `--advantage-bonus`, `--disadvantage-penalty`, and
`--same-attribute-*` options are retained for CLI compatibility, but current
rules do not use attribute matchup bonuses.

Hand defense is limited to once per turn by default. Use
`--hand-defense-limit 0` to disable hand defense. Use
`--hand-defense-empty-field-only` to reproduce the older empty-field-only rule.

The command writes:

- `tmp/summary.json`
- `tmp/matches.jsonl`

The league command writes `league-summary.json` under the selected output
directory.

The latest balanced-deck checks used seed `21001`: `break` vs `control` over
5000 games landed at 56.8% for first-player `break`; the six-deck ordered league
with 1000 games per pair landed at 56.0% `earth`, 51.8% `control`, 49.5%
`water`, 48.6% `break`, 47.4% `wind`, and 46.6% `fire`.

## Play UI

```bash
npm install
npm run build
python3 -m http.server 8000 --directory web
```

Open `http://localhost:8000/` to play a human-vs-rival match in the browser.
If port 8000 is already in use, choose another port such as 8017.

For live development:

```bash
npm run dev -- --host 127.0.0.1
```

## Test

```bash
npm run check
```
