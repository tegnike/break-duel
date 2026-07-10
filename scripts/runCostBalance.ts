// power 帯偏重ストレスデッキのバランスチェック CLI。
// Python 版 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py の移植。
// 使い方:
//   npm run balance:cost -- --games-per-order 1000 --seed 3000000 --out tmp/cost-balance.json
// 注意: --rule-set は "current"（現行ルール）のみサポート。旧ルールセット比較は移植していない。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { AiProfile } from "../src/game";
import {
  ADOPTED_COST_BUCKET_WIN_RATE_LIMITS,
  CANDIDATES,
  evaluateCandidate,
} from "../src/sim/costBalance";
import type { CandidateResult, CostEvalConfig } from "../src/sim/costBalance";

const AI_PROFILE_CHOICES: AiProfile[] = ["beginner", "challenger"];
const EXISTING_DECK_COUNT = 6;

type Args = {
  candidates: string[];
  gamesPerOrder: number;
  seed: number;
  maxTurns: number;
  threshold: number;
  firstAi: AiProfile;
  secondAi: AiProfile;
  ruleSets: string[];
  endgamePackage: string;
  endgameHandLimit: number | undefined;
  siegeConsecutiveTurns: number | undefined;
  attacksPerTurnLimit: number | undefined;
  attackLimitCountsStrike: boolean | undefined;
  out: string | null;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    candidates: [],
    gamesPerOrder: 1000,
    seed: 3_000_000,
    maxTurns: 60,
    threshold: 0.5,
    firstAi: "challenger",
    secondAi: "challenger",
    ruleSets: [],
    endgamePackage: "current",
    endgameHandLimit: undefined,
    siegeConsecutiveTurns: undefined,
    attacksPerTurnLimit: undefined,
    attackLimitCountsStrike: undefined,
    out: null,
    json: false,
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
  const nextBool = (name: string): boolean => {
    const value = next(name);
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    throw new Error(`--${name} は true/false で指定してください。`);
  };
  while (index < argv.length) {
    const token = argv[index];
    switch (token) {
      case "--candidate": {
        const value = next("candidate");
        if (!(value in CANDIDATES)) {
          throw new Error(`--candidate が不正です: ${value}（候補: ${Object.keys(CANDIDATES).join(", ")}）`);
        }
        args.candidates.push(value);
        break;
      }
      case "--games-per-order":
        args.gamesPerOrder = nextInt("games-per-order");
        break;
      case "--seed":
        args.seed = nextInt("seed");
        break;
      case "--max-turns":
        args.maxTurns = nextInt("max-turns");
        break;
      case "--threshold":
        args.threshold = Number.parseFloat(next("threshold"));
        break;
      case "--first-ai":
      case "--second-ai": {
        const name = token.slice(2);
        const value = next(name);
        if (!AI_PROFILE_CHOICES.includes(value as AiProfile)) {
          throw new Error(`--${name} が不正です: ${value}（候補: ${AI_PROFILE_CHOICES.join(", ")}）`);
        }
        if (token === "--first-ai") args.firstAi = value as AiProfile;
        else args.secondAi = value as AiProfile;
        break;
      }
      case "--rule-set": {
        const value = next("rule-set");
        if (value !== "current") {
          throw new Error(
            `--rule-set は "current" のみサポートしています（指定値: ${value}）。旧ルールセット比較は Python シミュレータ廃止（2026-07-08）とともに廃止しました。`,
          );
        }
        args.ruleSets.push(value);
        break;
      }
      case "--endgame-package":
        args.endgamePackage = next("endgame-package");
        break;
      case "--endgame-hand-limit":
        args.endgameHandLimit = nextInt("endgame-hand-limit");
        break;
      case "--siege-consecutive-turns":
        args.siegeConsecutiveTurns = nextInt("siege-consecutive-turns");
        break;
      case "--attacks-per-turn-limit":
        args.attacksPerTurnLimit = nextInt("attacks-per-turn-limit");
        break;
      case "--attack-limit-counts-strike":
        args.attackLimitCountsStrike = nextBool("attack-limit-counts-strike");
        break;
      case "--include-preset-league":
        throw new Error("--include-preset-league は TS 版では未サポートです。既存デッキ総当たりは `npm run sim -- league` を使ってください。");
      case "--out":
        args.out = next("out");
        break;
      case "--json":
        args.json = true;
        index += 1;
        break;
      default:
        throw new Error(`不明な引数: ${token}`);
    }
  }
  return args;
}

function fmtRate(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(4);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const selected = args.candidates.length > 0 ? args.candidates : Object.keys(CANDIDATES).sort();

  const results: CandidateResult[] = [];
  let seed = args.seed;
  for (const key of selected) {
    const evalConfig: CostEvalConfig = {
      gamesPerOrder: args.gamesPerOrder,
      seed,
      maxTurns: args.maxTurns,
      firstAi: args.firstAi,
      secondAi: args.secondAi,
      endgamePackage: args.endgamePackage,
      endgameHandLimit: args.endgameHandLimit,
      siegeConsecutiveTurns: args.siegeConsecutiveTurns,
      attacksPerTurnLimit: args.attacksPerTurnLimit,
      attackLimitCountsStrike: args.attackLimitCountsStrike,
    };
    results.push(evaluateCandidate(key, CANDIDATES[key].cardIds, evalConfig));
    // Python 版と同じシード前進（games_per_order × 6 デッキ × 両手番 + 10000）
    seed += args.gamesPerOrder * EXISTING_DECK_COUNT * 2 + 10_000;
  }

  const output = {
    seed: args.seed,
    games_per_order: args.gamesPerOrder,
    max_turns: args.maxTurns,
    threshold: args.threshold,
    ai_profiles: [args.firstAi, args.secondAi],
    endgame_package: args.endgamePackage,
    endgame_hand_limit: args.endgameHandLimit ?? null,
    siege_consecutive_turns: args.siegeConsecutiveTurns ?? null,
    attacks_per_turn_limit: args.attacksPerTurnLimit ?? null,
    attack_limit_counts_strike: args.attackLimitCountsStrike ?? false,
    rule_sets: {
      current: { label: "current high-power cap 5", max_high_power_summons: 5 },
    },
    adopted_guardrail_limits: ADOPTED_COST_BUCKET_WIN_RATE_LIMITS,
    results,
  };

  if (args.out !== null) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  }
  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(
      `seed=${args.seed} games_per_order=${args.gamesPerOrder} `
      + `threshold=${args.threshold.toFixed(3)} `
      + `ai=${args.firstAi}/${args.secondAi} `
      + `endgame=${args.endgamePackage} `
      + `attacks_per_turn_limit=${args.attacksPerTurnLimit ?? "null"} `
      + `attack_limit_counts_strike=${args.attackLimitCountsStrike ?? false}`,
    );
    for (const result of results) {
      const label = CANDIDATES[result.candidate].label;
      const status = result.candidate_win_rate > args.threshold ? "RISK" : "OK";
      console.log(
        `${result.rule_set.padEnd(10)} ${result.endgame_package.padEnd(12)} ${result.candidate.padStart(4)} ${label.padEnd(24)} `
        + `win_rate=${result.candidate_win_rate.toFixed(4)} `
        + `first=${fmtRate(result.first_player_win_rate)} `
        + `one_sided=${fmtRate(result.one_sided_game_rate)} `
        + `wins=${result.candidate_wins}/${result.games} ${status}`,
      );
      const rates = Object.entries(result.per_opponent)
        .map(([deck, values]) => `${deck}:${values.candidate_win_rate.toFixed(3)}`)
        .join(", ");
      console.log(`     by_opponent ${rates}`);
    }
  }
}

main();
