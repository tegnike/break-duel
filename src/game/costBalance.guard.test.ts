// power 帯偏重ストレスデッキのガードレール回帰テスト。
// scripts/runCostBalance.ts と同じ共有ロジック（src/sim/costBalance.ts）で
// 7 本のストレスデッキ勝率が採用済み閾値以内であることを検証する。
// p2-3 は 50% 合否ゲートではなく、60% 警報線を越えないことを監視する。
// unit では 80 試合/ordered-matchup × 6 デッキ × 両手番 = 960 試合に抑える。
// フル回帰は `npm run balance:cost -- --games-per-order 500` で実行する。
import { describe, expect, it } from "vitest";

import type { AiProfile } from "../game";
import {
  ADOPTED_COST_BUCKET_WIN_RATE_LIMITS,
  CANDIDATES,
  evaluateCandidate,
} from "../sim/costBalance";

// Python 版 BALANCE_CONFIG = GameConfig(max_turns=40) に対応。
const BALANCE_MAX_TURNS = 40;
const BALANCE_GAMES_PER_ORDERED_MATCHUP = 80;
const AI_PROFILES: [AiProfile, AiProfile] = ["challenger", "challenger"];

// Python 版テストと同じシード割り当て。
const GUARDRAIL_CASES: { key: string; label: string; seed: number }[] = [
  { key: "p1", label: "power 1 stress", seed: 1_200_000 },
  { key: "p2", label: "power 2 stress", seed: 1_250_000 },
  { key: "p3", label: "power 3 cap stress", seed: 1_300_000 },
  { key: "p4", label: "power 4 cap stress", seed: 1_350_000 },
  { key: "p1_2", label: "power 1-2 stress", seed: 1_400_000 },
  { key: "p2_3", label: "power 2-3 stress", seed: 1_450_000 },
  { key: "p3_4", label: "power 3-4 cap stress", seed: 1_500_000 },
];

// 6000 試合/ケースを回すため、タイムアウトは余裕を持たせる。
const CASE_TIMEOUT_MS = 600_000;

describe("cost balance guardrails (stress decks vs existing six decks)", () => {
  for (const { key, label, seed } of GUARDRAIL_CASES) {
    it(
      `${label} deck stays within the adopted guardrail`,
      () => {
        const result = evaluateCandidate(key, CANDIDATES[key].cardIds, {
          gamesPerOrder: BALANCE_GAMES_PER_ORDERED_MATCHUP,
          seed,
          maxTurns: BALANCE_MAX_TURNS,
          firstAi: AI_PROFILES[0],
          secondAi: AI_PROFILES[1],
        });
        const limit = ADOPTED_COST_BUCKET_WIN_RATE_LIMITS[key];
        expect(
          result.candidate_win_rate,
          `${label} win rate ${result.candidate_win_rate.toFixed(3)} exceeded `
          + `${limit.toFixed(3)} against the six existing decks`,
        ).toBeLessThanOrEqual(limit);
      },
      CASE_TIMEOUT_MS,
    );
  }
});
