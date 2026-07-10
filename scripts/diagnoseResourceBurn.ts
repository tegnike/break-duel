import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { DeckId } from "../src/game";
import { runMatch } from "../src/sim/runner";

const decks: DeckId[] = ["fire", "water", "earth"];
const seeds = [4101, 730001];
const gamesPerSeat = 100;
const out = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "tmp/strongest-cpu3-r/resource-burn-diagnosis.json";

type Totals = {
  deck: DeckId;
  games: number;
  beginnerWins: number;
  lossReasons: Record<string, number>;
  challengerFinalOnLoss: { life: number; deck: number; hand: number; field: number };
  beginnerFinalOnWin: { life: number; deck: number; hand: number; field: number };
};

function addFinal(target: Totals["challengerFinalOnLoss"], values: Totals["challengerFinalOnLoss"]): void {
  target.life += values.life;
  target.deck += values.deck;
  target.hand += values.hand;
  target.field += values.field;
}

const summary: Array<Totals & {
  beginnerWinRate: number;
  avgChallengerFinalOnLoss: Totals["challengerFinalOnLoss"] | null;
  avgBeginnerFinalOnWin: Totals["beginnerFinalOnWin"] | null;
}> = [];

for (const deck of decks) {
  const totals: Totals = {
    deck,
    games: 0,
    beginnerWins: 0,
    lossReasons: {},
    challengerFinalOnLoss: { life: 0, deck: 0, hand: 0, field: 0 },
    beginnerFinalOnWin: { life: 0, deck: 0, hand: 0, field: 0 },
  };
  for (const batchSeed of seeds) {
    let seed = batchSeed;
    for (let i = 0; i < gamesPerSeat; i += 1) {
      for (const challengerSeat of [0, 1] as const) {
        const aiProfiles = challengerSeat === 0
          ? ["challenger", "beginner"] as const
          : ["beginner", "challenger"] as const;
        const record = runMatch(seed, {
          firstDeck: deck,
          secondDeck: deck,
          aiProfiles: [...aiProfiles],
        });
        const beginnerSeat = 1 - challengerSeat;
        const beginnerWon = record.game.winner === beginnerSeat;
        totals.games += 1;
        if (beginnerWon) {
          totals.beginnerWins += 1;
          const end = record.log[record.log.length - 1];
          const reason = typeof end.reason === "string" ? end.reason : "unknown";
          totals.lossReasons[reason] = (totals.lossReasons[reason] ?? 0) + 1;
          const challenger = record.game.players[challengerSeat];
          const beginner = record.game.players[beginnerSeat];
          addFinal(totals.challengerFinalOnLoss, {
            life: challenger.life,
            deck: challenger.deck.length,
            hand: challenger.hand.length,
            field: challenger.field.length,
          });
          addFinal(totals.beginnerFinalOnWin, {
            life: beginner.life,
            deck: beginner.deck.length,
            hand: beginner.hand.length,
            field: beginner.field.length,
          });
        }
      }
      seed += 1;
    }
  }
  const losses = totals.beginnerWins;
  const average = (values: Totals["challengerFinalOnLoss"]) => losses > 0
    ? {
      life: values.life / losses,
      deck: values.deck / losses,
      hand: values.hand / losses,
      field: values.field / losses,
    }
    : null;
  summary.push({
    ...totals,
    beginnerWinRate: totals.beginnerWins / totals.games,
    avgChallengerFinalOnLoss: average(totals.challengerFinalOnLoss),
    avgBeginnerFinalOnWin: average(totals.beginnerFinalOnWin),
  });
}

const report = { seeds, gamesPerSeat, summary };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
