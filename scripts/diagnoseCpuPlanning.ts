import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

import {
  CHALLENGER_WEIGHTS,
  activePlayer,
  chooseAiAction,
  cloneGame,
  createGame,
  debugChallengerActionScores,
  debugChallengerBeam,
  finishTurn,
} from "../src/game";
import type { AiAction, DeckId, GameState } from "../src/game";
import { performAiActionInDraft } from "../src/game/actions";
import type { ChallengerWeights } from "../src/sim/runner";

type Args = {
  seed: number;
  deck: DeckId;
  candidateJson: string;
  championJson: string;
  candidateSeat: 0 | 1;
  search: number;
  out: string;
};

type StepTrace = {
  step: number;
  turn: number;
  active: number;
  actionsRemaining: number;
  candidateAction: AiAction;
  championAction: AiAction;
  life: [number, number];
  zones: string[];
};

const DECKS: readonly DeckId[] = ["break", "control", "fire", "water", "wind", "earth", "apex"];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seed: 940001,
    deck: "water",
    candidateJson: "tmp/fair-beam2.json",
    championJson: "docs/assets/ai-champions/fair/fair-gen001.json",
    candidateSeat: 0,
    search: 200,
    out: "tmp/strongest-cpu3-p/beam-diagnosis.json",
  };
  let index = 0;
  const next = (name: string): string => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
    index += 2;
    return value;
  };
  while (index < argv.length) {
    const token = argv[index];
    switch (token) {
      case "--seed":
        args.seed = Number.parseInt(next("seed"), 10);
        break;
      case "--deck": {
        const raw = next("deck");
        if (!(DECKS as readonly string[]).includes(raw)) throw new Error(`Unknown deck: ${raw}`);
        args.deck = raw as DeckId;
        break;
      }
      case "--candidate-json":
        args.candidateJson = next("candidate-json");
        break;
      case "--champion-json":
        args.championJson = next("champion-json");
        break;
      case "--candidate-seat":
        args.candidateSeat = Number.parseInt(next("candidate-seat"), 10) === 1 ? 1 : 0;
        break;
      case "--search":
        args.search = Number.parseInt(next("search"), 10);
        break;
      case "--out":
        args.out = next("out");
        break;
      default:
        throw new Error(`Unknown arg: ${token}`);
    }
  }
  return args;
}

function readWeights(path: string): ChallengerWeights {
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as { weights?: Record<string, unknown> } & Record<string, unknown>;
  const source = parsed.weights ?? parsed;
  const weights = {} as ChallengerWeights;
  for (const key of Object.keys(CHALLENGER_WEIGHTS) as (keyof ChallengerWeights)[]) {
    const value = source[key as string];
    weights[key] = typeof value === "number" ? value : CHALLENGER_WEIGHTS[key];
  }
  return weights;
}

function withWeights<T>(weights: ChallengerWeights, fn: () => T): T {
  const original = { ...CHALLENGER_WEIGHTS };
  try {
    Object.assign(CHALLENGER_WEIGHTS, weights);
    return fn();
  } finally {
    Object.assign(CHALLENGER_WEIGHTS, original);
  }
}

function actionKey(action: AiAction): string {
  return JSON.stringify(action);
}

function zones(game: GameState): string[] {
  return game.players.map((player) => [
    `deck=${player.deck.length}`,
    `hand=${player.hand.length}`,
    `field=${player.field.map((card, index) => `${index}:${card.id}${player.spentFieldIndexes.has(index) ? "*" : ""}`).join(",")}`,
    `discard=${player.discard.length}`,
    `memory=${player.memory?.id ?? "-"}`,
  ].join(" "));
}

function snapshot(game: GameState): Omit<StepTrace, "step" | "candidateAction" | "championAction"> {
  return {
    turn: game.turn,
    active: game.active,
    actionsRemaining: game.actionsRemaining,
    life: [game.players[0].life, game.players[1].life],
    zones: zones(game),
  };
}

function sameProgress(before: GameState, after: GameState): boolean {
  return before.turn === after.turn
    && before.active === after.active
    && before.actionsRemaining === after.actionsRemaining
    && before.players.map((player) => `${player.life}/${player.deck.length}/${player.hand.length}/${player.field.length}/${player.discard.length}`).join("|")
      === after.players.map((player) => `${player.life}/${player.deck.length}/${player.hand.length}/${player.field.length}/${player.discard.length}`).join("|");
}

function makeGame(seed: number, deck: DeckId): GameState {
  const game = createGame(seed, deck, deck, "challenger");
  game.players[0].isHuman = false;
  game.players[0].aiProfile = "challenger";
  game.players[1].aiProfile = "challenger";
  return game;
}

function chooseWithWeights(game: GameState, weights: ChallengerWeights): AiAction {
  return withWeights(weights, () => chooseAiAction(game, activePlayer(game).aiProfile));
}

function timedChoice(game: GameState, weights: ChallengerWeights): { action: AiAction; ms: number } {
  return withWeights(weights, () => {
    const start = performance.now();
    const action = chooseAiAction(game, activePlayer(game).aiProfile);
    return { action, ms: performance.now() - start };
  });
}

function runUntilDivergence(seed: number, args: Args, candidate: ChallengerWeights, champion: ChallengerWeights) {
  const game = makeGame(seed, args.deck);
  const weightsBySeat: [ChallengerWeights, ChallengerWeights] = args.candidateSeat === 0
    ? [candidate, champion]
    : [champion, candidate];
  const trace: StepTrace[] = [];
  const timingSamples: Array<{ turn: number; active: number; beam1Ms: number; beam2Ms: number; beam3Ms: number }> = [];
  let divergence: StepTrace | null = null;
  let guard = 0;
  while (game.winner === null && !game.draw && guard < 10000) {
    guard += 1;
    const before = cloneGame(game);
    const seatWeights = weightsBySeat[game.active];
    const action = chooseWithWeights(game, seatWeights);
    if (game.active === args.candidateSeat) {
      const beam1Weights = { ...candidate, turnPlanBeamWidth: 1 };
      const beam2Weights = { ...candidate, turnPlanBeamWidth: 2 };
      const beam3Weights = { ...candidate, turnPlanBeamWidth: 3 };
      const beam1 = timedChoice(cloneGame(game), beam1Weights);
      const beam2 = timedChoice(cloneGame(game), beam2Weights);
      const beam3 = timedChoice(cloneGame(game), beam3Weights);
      timingSamples.push({ turn: game.turn, active: game.active, beam1Ms: beam1.ms, beam2Ms: beam2.ms, beam3Ms: beam3.ms });
      if (!divergence && actionKey(beam1.action) !== actionKey(beam2.action)) {
        divergence = {
          step: guard,
          ...snapshot(game),
          candidateAction: beam2.action,
          championAction: beam1.action,
        };
      }
    }
    performAiActionInDraft(game, action);
    if (game.winner !== null || game.draw) break;
    if (sameProgress(before, game)) {
      game.pendingAttack = null;
      game.pendingTarget = null;
      finishTurn(game, false);
    }
    if (trace.length < 80) {
      trace.push({
        step: guard,
        ...snapshot(before),
        candidateAction: action,
        championAction: action,
      });
    }
  }
  return {
    seed,
    deck: args.deck,
    candidateSeat: args.candidateSeat,
    winner: game.winner,
    draw: game.draw,
    finalLife: [game.players[0].life, game.players[1].life],
    finalZones: zones(game),
    divergence,
    trace,
    timingSamples,
  };
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const candidate = readWeights(args.candidateJson);
  const champion = readWeights(args.championJson);
  const matches = [];
  let selected = null;
  for (let offset = 0; offset < args.search; offset += 1) {
    const result = runUntilDivergence(args.seed + offset, args, candidate, champion);
    matches.push({
      seed: result.seed,
      winner: result.winner,
      draw: result.draw,
      finalLife: result.finalLife,
      divergence: result.divergence,
    });
    if (!selected && result.winner === 1 - args.candidateSeat && result.divergence) {
      selected = result;
      break;
    }
  }
  if (!selected) selected = runUntilDivergence(args.seed, args, candidate, champion);
  const divergenceGame = selected.divergence ? makeGame(selected.seed, args.deck) : null;
  if (divergenceGame && selected.divergence) {
    const weightsBySeat: [ChallengerWeights, ChallengerWeights] = args.candidateSeat === 0
      ? [candidate, champion]
      : [champion, candidate];
    for (let step = 1; step < selected.divergence.step; step += 1) {
      const action = chooseWithWeights(divergenceGame, weightsBySeat[divergenceGame.active]);
      performAiActionInDraft(divergenceGame, action);
    }
  }
  const debugScores = divergenceGame ? withWeights(candidate, () => debugChallengerActionScores(divergenceGame).slice(0, 8)) : [];
  const beam2 = divergenceGame ? withWeights({ ...candidate, turnPlanBeamWidth: 2 }, () => debugChallengerBeam(divergenceGame, 2)) : [];
  const beam3 = divergenceGame ? withWeights({ ...candidate, turnPlanBeamWidth: 3 }, () => debugChallengerBeam(divergenceGame, 3)) : [];
  const timings = selected.timingSamples;
  const report = {
    args,
    searched: matches,
    selected,
    timingSummary: {
      samples: timings.length,
      beam1AvgMs: average(timings.map((sample) => sample.beam1Ms)),
      beam2AvgMs: average(timings.map((sample) => sample.beam2Ms)),
      beam3AvgMs: average(timings.map((sample) => sample.beam3Ms)),
    },
    divergenceDebug: divergenceGame ? {
      state: snapshot(divergenceGame),
      greedyTopActions: debugScores,
      beam2,
      beam3,
    } : null,
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify(report, null, 2));
}

main();
