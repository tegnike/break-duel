import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  CONFIG,
  activePlayer,
  attackableField,
  chooseAiAction,
  createGame,
  estimatePublicHandDefenseProbability,
  finishTurn,
  legalHandDefenders,
} from "../src/game";
import type { AiProfile, Card, DeckId, GameState } from "../src/game";
import { performAiActionInDraft } from "../src/game/actions";

type Args = {
  games: number;
  seed: number;
  out: string;
  decks: DeckId[];
};

type Sample = {
  p: number;
  actual: 0 | 1;
  knownHand: number;
  deck: string;
};

const DEFAULT_DECKS: readonly DeckId[] = ["break", "control", "fire", "water", "wind", "earth"];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    games: 240,
    seed: 970001,
    out: "tmp/strongest-cpu3-c/hand-defense-calibration.json",
    decks: [...DEFAULT_DECKS],
  };
  let index = 0;
  const next = (name: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value`);
    index += 2;
    return value;
  };
  while (index < argv.length) {
    const token = argv[index];
    switch (token) {
      case "--games":
        args.games = Number.parseInt(next("games"), 10);
        break;
      case "--seed":
        args.seed = Number.parseInt(next("seed"), 10);
        break;
      case "--out":
        args.out = next("out");
        break;
      case "--decks": {
        index += 1;
        const decks: DeckId[] = [];
        while (index < argv.length && !argv[index].startsWith("--")) {
          const raw = argv[index];
          if (!(DEFAULT_DECKS as readonly string[]).includes(raw)) throw new Error(`Unknown deck: ${raw}`);
          decks.push(raw as DeckId);
          index += 1;
        }
        if (decks.length === 0) throw new Error("--decks requires at least one deck");
        args.decks = decks;
        break;
      }
      default:
        throw new Error(`Unknown arg: ${token}`);
    }
  }
  return args;
}

function sameProgress(before: GameState, after: GameState): boolean {
  const zones = (game: GameState) => game.players
    .map((player) => `${player.life}/${player.deck.length}/${player.hand.length}/${player.field.length}/${player.discard.length}/${player.memory ? 1 : 0}`)
    .join("|");
  return before.turn === after.turn
    && before.active === after.active
    && before.actionsRemaining === after.actionsRemaining
    && before.chargedActionsRemaining === after.chargedActionsRemaining
    && zones(before) === zones(after);
}

function knownHandCount(player: { hand: Card[]; knownHandCards?: Card[] }): number {
  return (player.knownHandCards ?? []).filter((card, index, cards) => player.hand.includes(card) && cards.indexOf(card) === index).length;
}

function sampleState(game: GameState, samples: Sample[]): void {
  const attacker = activePlayer(game);
  const defenderIndex = 1 - game.active;
  const defender = game.players[defenderIndex];
  for (const { card } of attackableField(attacker)) {
    const p = estimatePublicHandDefenseProbability(defender, card, { attacker });
    if (p === null) continue;
    samples.push({
      p,
      actual: legalHandDefenders(defender, card, { attacker }).length > 0 ? 1 : 0,
      knownHand: knownHandCount(defender),
      deck: defender.deckName,
    });
  }
}

function runSampleGame(seed: number, firstDeck: DeckId, secondDeck: DeckId, samples: Sample[]): void {
  const game = createGame(seed, firstDeck, secondDeck, "challenger");
  game.players[0].isHuman = false;
  game.players[0].aiProfile = "challenger" as AiProfile;
  game.players[1].aiProfile = "challenger" as AiProfile;
  let guard = 0;
  while (game.winner === null && !game.draw) {
    guard += 1;
    if (guard > 10000) throw new Error(`step limit exceeded: seed=${seed}`);
    sampleState(game, samples);
    const before = { ...game, players: game.players.map((player) => ({
      ...player,
      deck: [...player.deck],
      hand: [...player.hand],
      field: [...player.field],
      discard: [...player.discard],
      spentFieldIndexes: new Set(player.spentFieldIndexes),
    })) } as GameState;
    const action = chooseAiAction(game, activePlayer(game).aiProfile);
    performAiActionInDraft(game, action);
    if (game.winner !== null || game.draw) break;
    if (sameProgress(before, game)) {
      game.pendingAttack = null;
      game.pendingTarget = null;
      finishTurn(game, false);
    }
  }
}

function summarize(samples: Sample[]) {
  const total = samples.length;
  const mae = total === 0 ? null : samples.reduce((sum, sample) => sum + Math.abs(sample.p - sample.actual), 0) / total;
  const brier = total === 0 ? null : samples.reduce((sum, sample) => sum + (sample.p - sample.actual) ** 2, 0) / total;
  const withKnown = samples.filter((sample) => sample.knownHand > 0);
  const byBucket = [0, 0.25, 0.5, 0.75].map((start) => {
    const end = start + 0.25;
    const bucket = samples.filter((sample) => sample.p >= start && sample.p < end || (end === 1 && sample.p === 1));
    return {
      range: `${start.toFixed(2)}-${end.toFixed(2)}`,
      samples: bucket.length,
      avgP: bucket.length === 0 ? null : bucket.reduce((sum, sample) => sum + sample.p, 0) / bucket.length,
      actualRate: bucket.length === 0 ? null : bucket.reduce((sum, sample) => sum + sample.actual, 0) / bucket.length,
    };
  });
  return {
    samples: total,
    mae,
    brier,
    knownHandSamples: withKnown.length,
    knownHandActualRate: withKnown.length === 0 ? null : withKnown.reduce((sum, sample) => sum + sample.actual, 0) / withKnown.length,
    byBucket,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const samples: Sample[] = [];
  for (let index = 0; index < args.games; index += 1) {
    const firstDeck = args.decks[index % args.decks.length];
    const secondDeck = args.decks[Math.floor(index / args.decks.length) % args.decks.length];
    runSampleGame(args.seed + index, firstDeck, secondDeck, samples);
  }
  const report = {
    seed: args.seed,
    games: args.games,
    decks: args.decks,
    config: {
      handDefenseLimit: CONFIG.handDefenseLimit,
      handDefenseEmptyOnly: CONFIG.handDefenseEmptyOnly,
    },
    ...summarize(samples),
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
