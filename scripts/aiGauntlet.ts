import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { CHALLENGER_WEIGHTS } from "../src/game";
import type { DeckId } from "../src/game";
import { runMatch } from "../src/sim/runner";
import type { ChallengerWeights } from "../src/sim/runner";

const DEFAULT_DECKS: readonly DeckId[] = ["break", "control", "fire", "water", "wind", "earth", "apex"];

type Champion = {
  id: string;
  weights: ChallengerWeights;
};

type Args = {
  candidateJson: string | null;
  championsDir: string;
  gamesPerSeat: number;
  seed: number;
  out: string;
  decks: DeckId[];
};

type ChampionResult = {
  champion_id: string;
  win_rate: number;
  floor: number;
  games: number;
  by_deck: Record<string, number>;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    candidateJson: null,
    championsDir: "docs/assets/ai-champions",
    gamesPerSeat: 20,
    seed: 510001,
    out: "tmp/ai-gauntlet.json",
    decks: [...DEFAULT_DECKS],
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
      case "--candidate-json":
        args.candidateJson = next("candidate-json");
        break;
      case "--champions-dir":
        args.championsDir = next("champions-dir");
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
      case "--decks": {
        index += 1;
        const decks: DeckId[] = [];
        while (index < argv.length && !argv[index].startsWith("--")) {
          decks.push(parseDeck(argv[index]));
          index += 1;
        }
        if (decks.length === 0) throw new Error("--decks には1つ以上のデッキIDが必要です。");
        args.decks = decks;
        break;
      }
      default:
        throw new Error(`不明な引数: ${token}`);
    }
  }
  return args;
}

function parseDeck(raw: string): DeckId {
  if ((DEFAULT_DECKS as readonly string[]).includes(raw)) return raw as DeckId;
  throw new Error(`不明なデッキID: ${raw}`);
}

function assertWeights(value: Record<string, unknown>, label: string): ChallengerWeights {
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
  return assertWeights(source, path);
}

function readChampions(dir: string): Champion[] {
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
      return { id, weights: assertWeights(source, path) };
    });
  if (champions.length === 0) throw new Error(`チャンピオンJSONがありません: ${dir}`);
  return champions;
}

function evaluateAgainstChampion(
  candidate: ChallengerWeights,
  champion: Champion,
  decks: readonly DeckId[],
  gamesPerSeat: number,
  seed: number,
): ChampionResult {
  const byDeck: Record<string, number> = {};
  let totalWins = 0;
  let totalGames = 0;
  let currentSeed = seed;
  for (const deck of decks) {
    let wins = 0;
    let games = 0;
    for (let i = 0; i < gamesPerSeat; i += 1) {
      const pairedSeed = currentSeed;
      currentSeed += 1;
      for (const candidateIsFirst of [true, false]) {
        const weightsBySeat: [ChallengerWeights, ChallengerWeights] = candidateIsFirst
          ? [candidate, champion.weights]
          : [champion.weights, candidate];
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
    byDeck[deck] = games > 0 ? wins / games : 0;
    totalWins += wins;
    totalGames += games;
  }
  return {
    champion_id: champion.id,
    win_rate: totalGames > 0 ? totalWins / totalGames : 0,
    floor: Math.min(...Object.values(byDeck)),
    games: totalGames,
    by_deck: byDeck,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const candidate = args.candidateJson ? readWeightsJson(args.candidateJson) : { ...CHALLENGER_WEIGHTS };
  const champions = readChampions(args.championsDir);
  const championResults = champions.map((champion, index) => evaluateAgainstChampion(
    candidate,
    champion,
    args.decks,
    args.gamesPerSeat,
    args.seed + index * 100000,
  ));
  const totalGames = championResults.reduce((sum, result) => sum + result.games, 0);
  const weightedWins = championResults.reduce((sum, result) => sum + result.win_rate * result.games, 0);
  const byDeck: Record<string, number> = {};
  for (const deck of args.decks) {
    byDeck[deck] = championResults.reduce((sum, result) => sum + result.by_deck[deck], 0) / championResults.length;
  }
  const report = {
    seed: args.seed,
    games_per_seat: args.gamesPerSeat,
    decks: args.decks,
    candidate_json: args.candidateJson,
    champions_dir: args.championsDir,
    pool_win_rate: totalGames > 0 ? weightedWins / totalGames : 0,
    deck_floor: Math.min(...Object.values(byDeck)),
    by_deck: byDeck,
    by_champion: championResults,
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify(report, null, 2));
}

main();
