// challenger AI（CHALLENGER_WEIGHTS）のランダム突然変異チューニング。
// Python 版 scripts/tune_ai_profiles.py の移植。
// 使い方:
//   npm run tune:ai -- --iterations 24 --games-per-seat 12 --seed 730001 --out tmp/ai-profile-tuning.json
// 重み差し替えは src/sim/runner.ts の weightsBySeat オプション（アクション選択の直前に
// アクティブプレイヤー側の重みを Object.assign で反映）で行い、src/game.ts 本体は変更しない。
// 注意: TS 版の AI プロファイルは beginner / challenger のみのため、Python 版の
// sanity_classic_rates（classic プロファイルとの対戦）は移植していない。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { CHALLENGER_WEIGHTS } from "../src/game";
import type { AiProfile, DeckId } from "../src/game";
import { SimRandom } from "../src/sim/random";
import { runMatch } from "../src/sim/runner";
import type { ChallengerWeights } from "../src/sim/runner";

const DECKS: readonly DeckId[] = ["break", "control", "fire", "water", "wind", "earth", "apex"];

type CandidateResult = {
  fitness: number;
  head_to_head_win_rate: number;
  head_to_head_floor: number;
  head_to_head_by_deck: Record<string, number>;
  weights: ChallengerWeights;
  candidate_index?: number;
  sanity_beginner_rates?: Record<string, number>;
};

type Args = {
  iterations: number;
  gamesPerSeat: number;
  seed: number;
  out: string;
  baseJson: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    iterations: 24,
    gamesPerSeat: 12,
    seed: 730001,
    out: "tmp/ai-profile-tuning.json",
    baseJson: null,
  };
  let index = 0;
  const next = (name: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} には値が必要です。`);
    index += 2;
    return value;
  };
  const nextInt = (name: string): number => {
    const value = Number.parseInt(next(name), 10);
    if (!Number.isFinite(value)) throw new Error(`--${name} は整数で指定してください。`);
    return value;
  };
  while (index < argv.length) {
    const token = argv[index];
    switch (token) {
      case "--iterations":
        args.iterations = nextInt("iterations");
        break;
      case "--games-per-seat":
        args.gamesPerSeat = nextInt("games-per-seat");
        break;
      case "--seed":
        args.seed = nextInt("seed");
        break;
      case "--out":
        args.out = next("out");
        break;
      case "--base-json":
        args.baseJson = next("base-json");
        break;
      default:
        throw new Error(`不明な引数: ${token}`);
    }
  }
  return args;
}

// Python 版 _mutate_weights の移植: 2〜5 個のキーを 0.65〜1.40 倍して丸める。
// 符号は維持し、絶対値の下限 1 を保証する。
function mutateWeights(base: ChallengerWeights, rng: SimRandom): ChallengerWeights {
  const weights: ChallengerWeights = { ...base };
  const keys = Object.keys(weights).sort() as (keyof ChallengerWeights)[];
  const chosen = rng.sample(keys, rng.randint(2, 5));
  for (const key of chosen) {
    const value = weights[key];
    const factor = rng.uniform(0.65, 1.4);
    const mutated = Math.round(value * factor);
    weights[key] = value < 0 ? Math.min(-1, mutated) : Math.max(1, mutated);
  }
  return weights;
}

/** 候補重み vs baseline のミラーデッキ直接対決（両手番 × games/seat × 7 デッキ）。 */
function evaluateCandidate(
  weights: ChallengerWeights,
  baseline: ChallengerWeights,
  gamesPerSeat: number,
  seed: number,
): CandidateResult {
  const perDeck: Record<string, number> = {};
  let totalWins = 0;
  let totalGames = 0;
  let currentSeed = seed;
  for (const deck of DECKS) {
    let wins = 0;
    let games = 0;
    for (const candidateIsFirst of [true, false]) {
      const weightsBySeat: [ChallengerWeights, ChallengerWeights] = candidateIsFirst
        ? [weights, baseline]
        : [baseline, weights];
      for (let i = 0; i < gamesPerSeat; i += 1) {
        const record = runMatch(currentSeed, {
          firstDeck: deck,
          secondDeck: deck,
          aiProfiles: ["challenger", "challenger"],
          weightsBySeat,
        });
        currentSeed += 1;
        const winner = record.game.winner;
        if (winner === null) continue;
        games += 1;
        if (winner === (candidateIsFirst ? 0 : 1)) wins += 1;
      }
    }
    perDeck[deck] = games > 0 ? wins / games : 0;
    totalWins += wins;
    totalGames += games;
  }
  const headToHead = totalGames > 0 ? totalWins / totalGames : 0;
  const floor = Math.min(...Object.values(perDeck));
  return {
    fitness: headToHead + 0.15 * floor,
    head_to_head_win_rate: headToHead,
    head_to_head_floor: floor,
    head_to_head_by_deck: perDeck,
    weights,
  };
}

/** 候補重みを challenger 側に適用し、beginner との勝率をデッキ別に測る健全性チェック。 */
function profileRates(
  weights: ChallengerWeights,
  opponent: AiProfile,
  gamesPerSeat: number,
  seed: number,
): Record<string, number> {
  const rates: Record<string, number> = {};
  let currentSeed = seed;
  for (const deck of DECKS) {
    let challengerWins = 0;
    let total = 0;
    for (const challengerIsFirst of [true, false]) {
      const aiProfiles: [AiProfile, AiProfile] = challengerIsFirst
        ? ["challenger", opponent]
        : [opponent, "challenger"];
      for (let i = 0; i < gamesPerSeat; i += 1) {
        const record = runMatch(currentSeed, {
          firstDeck: deck,
          secondDeck: deck,
          aiProfiles,
          // beginner は CHALLENGER_WEIGHTS を参照しないため、両席に候補重みを渡してよい
          weightsBySeat: [weights, weights],
        });
        currentSeed += 1;
        if (record.game.winner === (challengerIsFirst ? 0 : 1)) challengerWins += 1;
        total += 1;
      }
    }
    rates[deck] = total > 0 ? challengerWins / total : 0;
  }
  return rates;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const rng = new SimRandom(args.seed);
  const baseline: ChallengerWeights = { ...CHALLENGER_WEIGHTS };
  let mutationBase = baseline;
  let baseJsonProvided = false;
  if (args.baseJson !== null) {
    const parsed = JSON.parse(readFileSync(args.baseJson, "utf-8")) as Record<string, number>;
    const missing = Object.keys(baseline).filter((key) => !(key in parsed));
    if (missing.length > 0) {
      throw new Error(`--base-json に重みキーが不足しています: ${missing.sort().join(", ")}`);
    }
    mutationBase = parsed as ChallengerWeights;
    baseJsonProvided = true;
  }

  const candidates: ChallengerWeights[] = [];
  if (baseJsonProvided) candidates.push({ ...mutationBase });
  while (candidates.length < args.iterations) {
    candidates.push(mutateWeights(mutationBase, rng));
  }

  const results: CandidateResult[] = [];
  candidates.forEach((weights, index) => {
    // Python 版と同じシード配分: 候補ごとに seed + index * 100000
    const result = evaluateCandidate(weights, baseline, args.gamesPerSeat, args.seed + index * 100000);
    result.candidate_index = index;
    results.push(result);
    console.error(
      `candidate ${String(index).padStart(3, "0")}: `
      + `h2h_vs_baseline=${result.head_to_head_win_rate.toFixed(3)} `
      + `floor=${result.head_to_head_floor.toFixed(3)}`,
    );
  });
  results.sort((a, b) => b.fitness - a.fitness);

  const best = results[0];
  best.sanity_beginner_rates = profileRates(best.weights, "beginner", args.gamesPerSeat, args.seed + 77000000);

  const report = {
    seed: args.seed,
    iterations: args.iterations,
    games_per_seat: args.gamesPerSeat,
    fitness_note:
      "fitness = head_to_head_win_rate + 0.15 * head_to_head_floor (candidate vs baseline weights, mirror decks, both seats)",
    baseline_weights: baseline,
    best: results[0],
    top_5: results.slice(0, 5),
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify(report, null, 2));
}

main();
