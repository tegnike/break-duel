// challenger AI（CHALLENGER_WEIGHTS）のランダム突然変異チューニング。
// Python 版 scripts/tune_ai_profiles.py の移植。
// 使い方:
//   npm run tune:ai -- --iterations 24 --games-per-seat 12 --seed 730001 --out tmp/ai-profile-tuning.json
// 重み差し替えは src/sim/runner.ts の weightsBySeat オプション（アクション選択の直前に
// アクティブプレイヤー側の重みを Object.assign で反映）で行い、src/game.ts 本体は変更しない。
// 注意: TS 版の AI プロファイルは beginner / challenger のみのため、Python 版の
// sanity_classic_rates（classic プロファイルとの対戦）は移植していない。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
  pool_win_rate?: number;
  pool_floor?: number;
  pool_by_champion?: Record<string, number>;
  weights: ChallengerWeights;
  candidate_index?: number;
  pass_index?: number;
  sanity_beginner_rates?: Record<string, number>;
};

type Args = {
  iterations: number;
  gamesPerSeat: number;
  seed: number;
  out: string;
  baseJson: string | null;
  championsDir: string | null;
  passes: number;
  eliteCount: number;
  mutationMin: number;
  mutationMax: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    iterations: 24,
    gamesPerSeat: 12,
    seed: 730001,
    out: "tmp/ai-profile-tuning.json",
    baseJson: null,
    championsDir: null,
    passes: 1,
    eliteCount: 1,
    mutationMin: 0.65,
    mutationMax: 1.4,
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
  const nextFloat = (name: string): number => {
    const value = Number.parseFloat(next(name));
    if (!Number.isFinite(value)) throw new Error(`--${name} は数値で指定してください。`);
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
      case "--champions-dir":
        args.championsDir = next("champions-dir");
        break;
      case "--passes":
        args.passes = nextInt("passes");
        break;
      case "--elite-count":
        args.eliteCount = nextInt("elite-count");
        break;
      case "--mutation-min":
        args.mutationMin = nextFloat("mutation-min");
        break;
      case "--mutation-max":
        args.mutationMax = nextFloat("mutation-max");
        break;
      default:
        throw new Error(`不明な引数: ${token}`);
    }
  }
  if (args.passes < 1) throw new Error("--passes は1以上で指定してください。");
  if (args.iterations < 1) throw new Error("--iterations は1以上で指定してください。");
  if (args.eliteCount < 0) throw new Error("--elite-count は0以上で指定してください。");
  if (args.mutationMin <= 0 || args.mutationMax <= 0 || args.mutationMin > args.mutationMax) {
    throw new Error("--mutation-min / --mutation-max の範囲が不正です。");
  }
  return args;
}

type Champion = {
  id: string;
  weights: ChallengerWeights;
};

function parseWeights(value: Record<string, unknown>, label: string): ChallengerWeights {
  const keys = Object.keys(CHALLENGER_WEIGHTS).sort();
  const missing = keys.filter((key) => typeof value[key] !== "number");
  if (missing.length > 0) throw new Error(`${label} に重みキーが不足しています: ${missing.join(", ")}`);
  const weights = {} as ChallengerWeights;
  for (const key of keys) weights[key as keyof ChallengerWeights] = value[key] as number;
  return weights;
}

function readWeightsJson(path: string): ChallengerWeights {
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const source = typeof parsed.weights === "object" && parsed.weights !== null
    ? parsed.weights as Record<string, unknown>
    : parsed;
  return parseWeights(source, path);
}

function readChampions(dir: string | null): Champion[] {
  if (dir === null) return [{ id: "baseline", weights: { ...CHALLENGER_WEIGHTS } }];
  if (!existsSync(dir)) throw new Error(`チャンピオンディレクトリが見つかりません: ${dir}`);
  const champions = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      const id = typeof parsed.id === "string" ? parsed.id : name.replace(/\.json$/, "");
      const source = typeof parsed.weights === "object" && parsed.weights !== null
        ? parsed.weights as Record<string, unknown>
        : parsed;
      return { id, weights: parseWeights(source, path) };
    });
  if (champions.length === 0) throw new Error(`チャンピオンJSONがありません: ${dir}`);
  return champions;
}

// Python 版 _mutate_weights の移植: 2〜5 個のキーを 0.65〜1.40 倍して丸める。
// 符号は維持し、絶対値の下限 1 を保証する。
function mutateWeights(base: ChallengerWeights, rng: SimRandom, minFactor: number, maxFactor: number): ChallengerWeights {
  const weights: ChallengerWeights = { ...base };
  const keys = Object.keys(weights).sort() as (keyof ChallengerWeights)[];
  const chosen = rng.sample(keys, rng.randint(2, 5));
  for (const key of chosen) {
    const value = weights[key];
    const factor = rng.uniform(minFactor, maxFactor);
    const mutated = Math.round(value * factor);
    weights[key] = value < 0 ? Math.min(-1, mutated) : Math.max(1, mutated);
  }
  return weights;
}

/** 候補重み vs baseline のミラーデッキ直接対決（両手番 × games/seat × 7 デッキ）。 */
function evaluateCandidate(
  weights: ChallengerWeights,
  baseline: ChallengerWeights,
  champions: readonly Champion[],
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
    for (let i = 0; i < gamesPerSeat; i += 1) {
      const pairedSeed = currentSeed;
      currentSeed += 1;
      for (const candidateIsFirst of [true, false]) {
        const weightsBySeat: [ChallengerWeights, ChallengerWeights] = candidateIsFirst
          ? [weights, baseline]
          : [baseline, weights];
        const record = runMatch(pairedSeed, {
          firstDeck: deck,
          secondDeck: deck,
          aiProfiles: ["challenger", "challenger"],
          weightsBySeat,
        });
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
  const championRates: Record<string, number> = {};
  let poolWinsWeighted = 0;
  let poolGames = 0;
  let poolFloor = 1;
  champions.forEach((champion, championIndex) => {
    let championWins = 0;
    let championGames = 0;
    const championDeckRates: number[] = [];
    let championSeed = seed + 50000000 + championIndex * 100000;
    for (const deck of DECKS) {
      let wins = 0;
      let games = 0;
      for (let i = 0; i < gamesPerSeat; i += 1) {
        const pairedSeed = championSeed;
        championSeed += 1;
        for (const candidateIsFirst of [true, false]) {
          const weightsBySeat: [ChallengerWeights, ChallengerWeights] = candidateIsFirst
            ? [weights, champion.weights]
            : [champion.weights, weights];
          const record = runMatch(pairedSeed, {
            firstDeck: deck,
            secondDeck: deck,
            aiProfiles: ["challenger", "challenger"],
            weightsBySeat,
          });
          const winner = record.game.winner;
          if (winner === null) continue;
          games += 1;
          if (winner === (candidateIsFirst ? 0 : 1)) wins += 1;
        }
      }
      const deckRate = games > 0 ? wins / games : 0;
      championDeckRates.push(deckRate);
      championWins += wins;
      championGames += games;
    }
    const championRate = championGames > 0 ? championWins / championGames : 0;
    championRates[champion.id] = championRate;
    poolWinsWeighted += championWins;
    poolGames += championGames;
    poolFloor = Math.min(poolFloor, ...championDeckRates);
  });
  const poolWinRate = poolGames > 0 ? poolWinsWeighted / poolGames : headToHead;
  const poolFitness = poolWinRate + 0.15 * poolFloor;
  return {
    fitness: poolFitness,
    head_to_head_win_rate: headToHead,
    head_to_head_floor: floor,
    head_to_head_by_deck: perDeck,
    pool_win_rate: poolWinRate,
    pool_floor: poolFloor,
    pool_by_champion: championRates,
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
    mutationBase = readWeightsJson(args.baseJson);
    baseJsonProvided = true;
  }
  const champions = readChampions(args.championsDir);

  const results: CandidateResult[] = [];
  let elite: ChallengerWeights[] = baseJsonProvided ? [{ ...mutationBase }] : [];
  for (let pass = 0; pass < args.passes; pass += 1) {
    const progress = args.passes === 1 ? 0 : pass / (args.passes - 1);
    const minFactor = args.mutationMin + (1 - args.mutationMin) * 0.5 * progress;
    const maxFactor = args.mutationMax - (args.mutationMax - 1) * 0.5 * progress;
    const candidates: ChallengerWeights[] = elite.slice(0, args.eliteCount).map((weights) => ({ ...weights }));
    if (pass === 0 && !baseJsonProvided) candidates.push({ ...mutationBase });
    while (candidates.length < args.iterations) {
      const base = elite.length > 0 ? elite[rng.randint(0, elite.length - 1)] : mutationBase;
      candidates.push(mutateWeights(base, rng, minFactor, maxFactor));
    }
    const passResults: CandidateResult[] = [];
    candidates.forEach((weights, index) => {
      const result = evaluateCandidate(
        weights,
        baseline,
        champions,
        args.gamesPerSeat,
        args.seed + pass * 10000000 + index * 100000,
      );
      result.candidate_index = index;
      result.pass_index = pass;
      passResults.push(result);
      results.push(result);
      console.error(
        `pass ${String(pass).padStart(2, "0")} candidate ${String(index).padStart(3, "0")}: `
        + `pool=${(result.pool_win_rate ?? result.head_to_head_win_rate).toFixed(3)} `
        + `pool_floor=${(result.pool_floor ?? result.head_to_head_floor).toFixed(3)} `
        + `h2h_vs_baseline=${result.head_to_head_win_rate.toFixed(3)}`,
      );
    });
    passResults.sort((a, b) => b.fitness - a.fitness);
    elite = passResults.slice(0, Math.max(1, args.eliteCount)).map((result) => result.weights);
    mutationBase = elite[0];
  }
  results.sort((a, b) => b.fitness - a.fitness);

  const best = results[0];
  best.sanity_beginner_rates = profileRates(best.weights, "beginner", args.gamesPerSeat, args.seed + 77000000);

  const report = {
    seed: args.seed,
    iterations: args.iterations,
    passes: args.passes,
    elite_count: args.eliteCount,
    games_per_seat: args.gamesPerSeat,
    champions_dir: args.championsDir,
    fitness_note:
      "fitness = pool_win_rate + 0.15 * pool_floor (candidate vs champion pool, mirror decks, both seats)",
    baseline_weights: baseline,
    best: results[0],
    top_5: results.slice(0, 5),
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify(report, null, 2));
}

main();
