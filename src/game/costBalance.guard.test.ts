// power 帯偏重ストレスデッキのガードレール回帰テスト。
// Python 版 tests/test_cost_balance.py の移植。scripts/runCostBalance.ts と同じ
// 共有ロジック（src/sim/costBalance.ts）で 7 本のストレスデッキ勝率が採用済み閾値以内であることを検証する。
// 1 ストレスデッキあたり 500 試合/ordered-matchup × 6 デッキ × 両手番 = 6000 試合（Python 版と同じ試合数）。
// フル実行は約 85 秒（このファイル単体）。単独で回す場合は `npm run test:balance`。
import { describe, expect, it } from "vitest";

import type { AiProfile } from "../game";
import {
  ADOPTED_COST_BUCKET_WIN_RATE_LIMITS,
  CANDIDATES,
  evaluateCandidate,
} from "../sim/costBalance";

// Python 版 BALANCE_CONFIG = GameConfig(max_turns=40) / BALANCE_GAMES_PER_ORDERED_MATCHUP = 500 に対応。
const BALANCE_MAX_TURNS = 40;
const BALANCE_GAMES_PER_ORDERED_MATCHUP = 500;
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
