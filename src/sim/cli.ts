// Python 版 ai_break_duel/cli.py を置き換えるヘッドレスシミュレーション CLI。
// 使い方:
//   npm run sim -- simulate --games 100 --seed 41 --out tmp/ts-sim
//   npm run sim -- league --games-per-pair 20 --seed 41 --decks fire water --out tmp/ts-league
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BATTLE_DECK_IDS, CONFIG } from "../game";
import type { AiProfile, DeckId } from "../game";
import { applyEndgameRulePackage } from "./endgameRules";
import { runMatch } from "./runner";
import type { MatchRecord } from "./runner";
import { matchSummary, standingsWithRates, summarizeResults } from "./stats";
import type { MatchSummary, StandingsRow } from "./stats";

const AI_PROFILE_CHOICES: AiProfile[] = ["beginner", "challenger"];

type ParsedArgs = { flags: Map<string, string | string[]> };

function parseArgs(argv: string[], listFlags: Set<string>): ParsedArgs {
  const flags = new Map<string, string | string[]>();
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`不明な引数: ${token}`);
    }
    const name = token.slice(2);
    if (listFlags.has(name)) {
      const values: string[] = [];
      index += 1;
      while (index < argv.length && !argv[index].startsWith("--")) {
        values.push(argv[index]);
        index += 1;
      }
      if (values.length === 0) throw new Error(`--${name} には 1 つ以上の値が必要です。`);
      flags.set(name, values);
    } else {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${name} には値が必要です。`);
      flags.set(name, value);
      index += 2;
    }
  }
  return { flags };
}

function intFlag(args: ParsedArgs, name: string, fallback: number): number {
  const raw = args.flags.get(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw as string, 10);
  if (!Number.isFinite(value)) throw new Error(`--${name} は整数で指定してください: ${raw}`);
  return value;
}

function deckFlag(args: ParsedArgs, name: string): DeckId | undefined {
  const raw = args.flags.get(name) as string | undefined;
  if (raw === undefined) return undefined;
  return validateDeck(raw, name);
}

function validateDeck(raw: string, flagName: string): DeckId {
  if (!(BATTLE_DECK_IDS as readonly string[]).includes(raw)) {
    throw new Error(`--${flagName} のデッキ ID が不正です: ${raw}（候補: ${BATTLE_DECK_IDS.join(", ")}）`);
  }
  return raw as DeckId;
}

function aiFlag(args: ParsedArgs, name: string): AiProfile {
  const raw = (args.flags.get(name) as string | undefined) ?? "challenger";
  if (!AI_PROFILE_CHOICES.includes(raw as AiProfile)) {
    throw new Error(`--${name} の AI プロファイルが不正です: ${raw}（候補: ${AI_PROFILE_CHOICES.join(", ")}）`);
  }
  return raw as AiProfile;
}

function optionalIntFlag(args: ParsedArgs, name: string): number | undefined {
  const raw = args.flags.get(name);
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw as string, 10);
  if (!Number.isFinite(value)) throw new Error(`--${name} は整数で指定してください: ${raw}`);
  return value;
}

function optionalBoolFlag(args: ParsedArgs, name: string): boolean | undefined {
  const raw = args.flags.get(name);
  if (raw === undefined) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`--${name} は true/false で指定してください: ${raw}`);
}

function applySimConfig(args: ParsedArgs): string {
  // CONFIG は可変オブジェクトなので sim 層から上書きできる（エンジンコードは変更しない）
  CONFIG.maxTurns = intFlag(args, "max-turns", CONFIG.maxTurns);
  return applyEndgameRulePackage(args.flags.get("endgame-package") as string | undefined, {
    handLimit: optionalIntFlag(args, "endgame-hand-limit"),
    siegeConsecutiveTurns: optionalIntFlag(args, "siege-consecutive-turns"),
    attacksPerTurnLimit: optionalIntFlag(args, "attacks-per-turn-limit"),
    attackLimitCountsStrike: optionalBoolFlag(args, "attack-limit-counts-strike"),
  });
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

// Python 版 run_simulation と同じシード配布（試合ごとに seed + offset）
function runSimulate(args: ParsedArgs): void {
  const games = intFlag(args, "games", 1000);
  const seed = intFlag(args, "seed", 1);
  const outDir = (args.flags.get("out") as string | undefined) ?? "tmp";
  const firstDeck = deckFlag(args, "first-deck");
  const secondDeck = deckFlag(args, "second-deck");
  if ((firstDeck === undefined) !== (secondDeck === undefined)) {
    throw new Error("--first-deck と --second-deck は同時に指定してください。");
  }
  const aiProfiles: [AiProfile, AiProfile] = [aiFlag(args, "first-ai"), aiFlag(args, "second-ai")];
  const endgamePackage = applySimConfig(args);

  const records: MatchRecord[] = [];
  for (let offset = 0; offset < games; offset += 1) {
    records.push(runMatch(seed + offset, { firstDeck, secondDeck, aiProfiles }));
  }
  const summaries = records.map((record) => matchSummary(record));
  const summary = summarizeResults(summaries, seed);
  summary.config = { ...(summary.config as Record<string, unknown>), endgame_package: endgamePackage };

  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, "summary.json"), summary);
  const lines = records.map((record, index) => JSON.stringify({ summary: summaries[index], log: record.log }));
  writeFileSync(join(outDir, "matches.jsonl"), `${lines.join("\n")}\n`, "utf-8");
  console.log(JSON.stringify(summary, null, 2));
}

// Python 版 run_league と同じ順序（first × second の順序付き総当たり、シードは連番で消費）
function runLeague(args: ParsedArgs): void {
  const gamesPerPair = intFlag(args, "games-per-pair", 1000);
  const seed = intFlag(args, "seed", 1);
  const outDir = (args.flags.get("out") as string | undefined) ?? "tmp/league";
  const rawDecks = (args.flags.get("decks") as string[] | undefined) ?? ["fire", "water", "wind", "earth"];
  const decks = rawDecks.map((deck) => validateDeck(deck, "decks"));
  const aiProfiles: [AiProfile, AiProfile] = [aiFlag(args, "first-ai"), aiFlag(args, "second-ai")];
  const endgamePackage = applySimConfig(args);

  if (gamesPerPair <= 0) throw new Error("games_per_pair must be positive.");
  if (decks.length < 2) throw new Error("At least two decks are required.");

  const standings: Record<string, StandingsRow> = {};
  decks.forEach((deck) => {
    standings[deck] = { wins: 0, losses: 0, draws: 0, games: 0 };
  });
  const pairResults: { first_deck: string; second_deck: string; summary: Record<string, unknown> }[] = [];
  let currentSeed = seed;

  for (const first of decks) {
    for (const second of decks) {
      if (first === second) continue;
      const summaries: MatchSummary[] = [];
      for (let i = 0; i < gamesPerPair; i += 1) {
        const record = runMatch(currentSeed, { firstDeck: first, secondDeck: second, aiProfiles });
        currentSeed += 1;
        const summary = matchSummary(record);
        summaries.push(summary);

        const firstRow = standings[first];
        const secondRow = standings[second];
        firstRow.games += 1;
        secondRow.games += 1;
        if (summary.winner === "player_1") {
          firstRow.wins += 1;
          secondRow.losses += 1;
        } else if (summary.winner === "player_2") {
          secondRow.wins += 1;
          firstRow.losses += 1;
        } else {
          firstRow.draws += 1;
          secondRow.draws += 1;
        }
      }
      pairResults.push({
        first_deck: first,
        second_deck: second,
        summary: summarizeResults(summaries, currentSeed - gamesPerPair),
      });
    }
  }

  const league = {
    seed,
    games_per_ordered_pair: gamesPerPair,
    total_games: gamesPerPair * decks.length * (decks.length - 1),
    endgame_package: endgamePackage,
    decks,
    standings: standingsWithRates(standings),
    pairs: pairResults,
  };

  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, "league-summary.json"), league);
  console.log(JSON.stringify(league, null, 2));
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "simulate") {
    runSimulate(parseArgs(rest, new Set()));
  } else if (command === "league") {
    runLeague(parseArgs(rest, new Set(["decks"])));
  } else {
    console.error("使い方: sim <simulate|league> [options]");
    console.error("  simulate --games N --seed S --out DIR [--first-deck D --second-deck D] [--first-ai P] [--second-ai P] [--max-turns N] [--endgame-package P] [--attacks-per-turn-limit N] [--attack-limit-counts-strike true]");
    console.error("  league --games-per-pair N --seed S --out DIR --decks a b c ... [--first-ai P] [--second-ai P] [--max-turns N] [--endgame-package P] [--attacks-per-turn-limit N] [--attack-limit-counts-strike true]");
    process.exitCode = 1;
  }
}

main();
