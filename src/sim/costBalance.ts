// power 帯偏重ストレスデッキのバランス回帰チェック（共有ロジック）。
// Python 版 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py と
// tests/test_cost_balance.py の共通部分を TS に移植したもの。
// scripts/runCostBalance.ts（CLI）と src/game/costBalance.guard.test.ts（vitest ガードレール）が使う。
// ルールセットは現行ルール（"current": 25 枚デッキ / power 3+ 合計 5 枚まで）のみサポート。
import { CARD_BY_ID, CONFIG } from "../game";
import type { AiProfile, DeckId } from "../game";
import { runMatch } from "./runner";

export const POWER_CARD_IDS: Record<number, readonly string[]> = {
  1: [
    "AI-FIRE-1",
    "AI-FIRE-1B",
    "AI-FIRE-1C",
    "AI-WATER-1",
    "AI-WATER-1B",
    "AI-WATER-1C",
    "AI-WIND-1",
    "AI-WIND-1B",
    "AI-EARTH-1",
    "AI-EARTH-1B",
  ],
  2: [
    "AI-FIRE-2",
    "AI-FIRE-2B",
    "AI-WATER-2",
    "AI-WATER-2B",
    "AI-WIND-2",
    "AI-WIND-2B",
    "AI-WIND-2C",
    "AI-EARTH-2",
    "AI-EARTH-2B",
    "AI-EARTH-2C",
  ],
  3: [
    "AI-FIRE-3",
    "AI-FIRE-3B",
    "AI-WATER-3",
    "AI-WATER-3B",
    "AI-WIND-3",
    "AI-WIND-3B",
    "AI-EARTH-3",
    "AI-EARTH-3B",
  ],
  4: [
    "AI-FIRE-4",
    "AI-FIRE-4B",
    "AI-WATER-4",
    "AI-WATER-4B",
    "AI-WIND-4",
    "AI-WIND-4B",
    "AI-EARTH-4",
    "AI-EARTH-4B",
  ],
};

export const LOW_COST_CARD_IDS: readonly string[] = [
  "AI-FIRE-1",
  "AI-FIRE-1B",
  "AI-FIRE-1C",
  "AI-FIRE-2",
  "AI-FIRE-2B",
  "AI-WATER-1",
  "AI-WATER-1B",
  "AI-WATER-1C",
  "AI-WATER-2",
  "AI-WATER-2B",
  "AI-WIND-1",
  "AI-WIND-1B",
  "AI-WIND-2",
  "AI-WIND-2B",
  "AI-WIND-2C",
  "AI-EARTH-1",
  "AI-EARTH-1B",
  "AI-EARTH-2",
  "AI-EARTH-2B",
  "AI-EARTH-2C",
  "AI-FIRE-1",
  "AI-WATER-1",
  "AI-WIND-1",
  "AI-EARTH-1",
];

export const MID_COST_CARD_IDS: readonly string[] = [
  "AI-FIRE-3",
  "AI-FIRE-3B",
  "AI-WATER-3",
  "AI-WATER-3B",
  "AI-WIND-3",
  "AI-WIND-3B",
  "AI-EARTH-3",
  "AI-EARTH-3B",
  "AI-FIRE-2",
  "AI-FIRE-2B",
  "AI-WATER-2",
  "AI-WATER-2B",
  "AI-WIND-2",
  "AI-WIND-2B",
  "AI-WIND-2C",
  "AI-EARTH-2",
  "AI-EARTH-2B",
  "AI-EARTH-2C",
  "AI-FIRE-2",
  "AI-WATER-2",
];

export const HIGH_COST_CARD_IDS: readonly string[] = [
  "AI-FIRE-3",
  "AI-FIRE-3B",
  "AI-FIRE-4",
  "AI-FIRE-4B",
  "AI-WATER-3",
  "AI-WATER-3B",
  "AI-WATER-4",
  "AI-WATER-4B",
  "AI-WIND-3",
  "AI-WIND-3B",
  "AI-WIND-4",
  "AI-WIND-4B",
  "AI-EARTH-3",
  "AI-EARTH-3B",
  "AI-EARTH-4",
  "AI-EARTH-4B",
  "AI-FIRE-3",
  "AI-WATER-3",
  "AI-WIND-3",
  "AI-EARTH-3",
];

export const SUPPORT_CARD_IDS: readonly string[] = [
  "CMD-DISRUPT",
  "CMD-SANDBOX",
  "CMD-TRINITY",
  "CMD-OPTIMIZE",
  "MEM-CACHE",
  "MEM-FIREWALL",
];

export const FILLER_SUMMON_CARD_IDS: readonly string[] = [...POWER_CARD_IDS[2], ...POWER_CARD_IDS[1]];

export const EXISTING_DECKS: readonly DeckId[] = ["break", "control", "fire", "water", "wind", "earth"];

function repeat<T>(items: readonly T[], times: number): T[] {
  const result: T[] = [];
  for (let i = 0; i < times; i += 1) result.push(...items);
  return result;
}

export const CANDIDATES: Record<string, { label: string; cardIds: readonly string[] }> = {
  p1: { label: "power 1 stress deck", cardIds: repeat(POWER_CARD_IDS[1], 3) },
  p2: { label: "power 2 stress deck", cardIds: repeat(POWER_CARD_IDS[2], 3) },
  p3: { label: "power 3 cap stress deck; low-power filler may be added", cardIds: repeat(POWER_CARD_IDS[3], 3) },
  p4: { label: "power 4 cap stress deck; low-power filler may be added", cardIds: repeat(POWER_CARD_IDS[4], 3) },
  p1_2: { label: "power 1-2 stress deck", cardIds: LOW_COST_CARD_IDS },
  p2_3: { label: "power 2-3 stress deck; high-power cap may add filler", cardIds: MID_COST_CARD_IDS },
  p3_4: { label: "power 3-4 cap stress deck; low-power filler may be added", cardIds: HIGH_COST_CARD_IDS },
};

// 採用済みガードレール閾値（Python 版 tests/test_cost_balance.py の
// ADOPTED_COST_BUCKET_WIN_RATE_LIMITS と同値）。候補キーで引く。
export const ADOPTED_COST_BUCKET_WIN_RATE_LIMITS: Record<string, number> = {
  p1: 0.15,
  p2: 0.65,
  p3: 0.8,
  p4: 0.75,
  p1_2: 0.45,
  p2_3: 0.8,
  p3_4: 0.75,
};

// 現行ルール: 25 枚 = 召喚獣 19 枚 + サポート 6 枚、power 3+ は合計 5 枚まで、同名（同 ID）2 枚まで。
export const STRESS_DECK_SUMMON_COUNT = 25 - SUPPORT_CARD_IDS.length;
const HIGH_POWER_LIMIT = 5;

// Python 版 stress_deck_cards（current ルールセット相当）の移植。
export function stressDeckCards(cardIds: readonly string[]): string[] {
  const summonIds: string[] = [];
  const highPowerCounts = new Map<string, number>();
  const lowPowerCounts = new Map<string, number>();
  let highPowerCount = 0;
  for (const cardId of [...cardIds, ...FILLER_SUMMON_CARD_IDS]) {
    const card = CARD_BY_ID.get(cardId);
    if (!card) throw new Error(`Unknown card id: ${cardId}`);
    if ((card.power ?? 0) >= 3) {
      // 現行構築ルールと同じく同名 2 枚まで許容しつつ、power 3+ の総数上限を守る
      if ((highPowerCounts.get(cardId) ?? 0) >= 2) continue;
      if (highPowerCount >= HIGH_POWER_LIMIT) continue;
      highPowerCounts.set(cardId, (highPowerCounts.get(cardId) ?? 0) + 1);
      highPowerCount += 1;
    } else {
      if ((lowPowerCounts.get(cardId) ?? 0) >= 2) continue;
      lowPowerCounts.set(cardId, (lowPowerCounts.get(cardId) ?? 0) + 1);
    }
    summonIds.push(cardId);
    if (summonIds.length === STRESS_DECK_SUMMON_COUNT) {
      return [...summonIds, ...SUPPORT_CARD_IDS];
    }
  }
  throw new Error(`Unable to build a ${STRESS_DECK_SUMMON_COUNT} summon stress deck.`);
}

export type CostEvalConfig = {
  gamesPerOrder: number;
  seed: number;
  maxTurns: number;
  firstAi: AiProfile;
  secondAi: AiProfile;
};

export type PerOpponentRow = {
  candidate_win_rate: number;
  candidate_wins: number;
  existing_wins: number;
  draws: number;
  games: number;
  first_player_win_rate: number | null;
  one_sided_game_rate: number | null;
  resource_exhaustion_rate: number;
  average_turns: number;
};

export type CandidateResult = {
  candidate: string;
  rule_set: string;
  rule_label: string;
  deck_ids: string[];
  games: number;
  candidate_win_rate: number;
  existing_win_rate: number;
  draw_rate: number;
  candidate_wins: number;
  existing_wins: number;
  draws: number;
  first_player_win_rate: number | null;
  one_sided_game_rate: number | null;
  resource_exhaustion_rate: number;
  average_turns: number;
  median_turns: number;
  average_life_difference: number;
  per_opponent: Record<string, PerOpponentRow>;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Python statistics.median 互換（偶数個は中央 2 値の平均）
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type SingleGameOutcome = {
  candidateWon: boolean;
  winner: number | null;
  firstPlayerWon: boolean;
  oneSided: boolean;
  resourceExhaustion: boolean;
  turnCount: number;
  lifeDiff: number;
};

function playOne(
  seed: number,
  candidateDeckIds: readonly string[],
  opponentDeck: DeckId,
  candidateIsFirst: boolean,
  aiProfiles: [AiProfile, AiProfile],
): SingleGameOutcome {
  const candidateSource = { kind: "custom" as const, name: "stress", cardIds: [...candidateDeckIds] };
  const record = runMatch(seed, {
    firstDeck: candidateIsFirst ? candidateSource : opponentDeck,
    secondDeck: candidateIsFirst ? opponentDeck : candidateSource,
    aiProfiles,
  });
  const { game } = record;
  const [life1, life2] = game.players.map((player) => player.life);
  const lastEvent = record.log[record.log.length - 1];
  const reason = lastEvent && lastEvent.event === "game_end" ? (lastEvent.reason as string) : "unknown";
  return {
    candidateWon: game.winner === (candidateIsFirst ? 0 : 1),
    winner: game.winner,
    firstPlayerWon: game.winner === 0,
    oneSided: game.winner !== null && Math.max(life1, life2) >= 4,
    resourceExhaustion: reason === "resource_exhaustion",
    turnCount: game.turn,
    lifeDiff: Math.abs(life1 - life2),
  };
}

/**
 * ストレスデッキ 1 本を既存 6 デッキ（両手番 × gamesPerOrder）と対戦させて集計する。
 * Python 版 run_cost_balance.py evaluate_candidate（current ルールセット）の移植。
 * シード消費は Python 版と同じく 1 試合ごとに +1 の連番。
 */
export function evaluateCandidate(
  candidateKey: string,
  cardIds: readonly string[],
  evalConfig: CostEvalConfig,
): CandidateResult {
  const candidateDeckIds = stressDeckCards(cardIds);
  const aiProfiles: [AiProfile, AiProfile] = [evalConfig.firstAi, evalConfig.secondAi];
  const originalMaxTurns = CONFIG.maxTurns;
  CONFIG.maxTurns = evalConfig.maxTurns;

  let currentSeed = evalConfig.seed;
  let candidateWins = 0;
  let existingWins = 0;
  let draws = 0;
  let firstPlayerWins = 0;
  let decisiveGames = 0;
  let oneSidedGames = 0;
  let resourceExhaustion = 0;
  const turns: number[] = [];
  const lifeDiffs: number[] = [];
  const perOpponent: Record<string, PerOpponentRow> = {};

  try {
    for (const opponent of EXISTING_DECKS) {
      let pairCandidateWins = 0;
      let pairExistingWins = 0;
      let pairDraws = 0;
      let pairFirstPlayerWins = 0;
      let pairDecisiveGames = 0;
      let pairOneSidedGames = 0;
      let pairResourceExhaustion = 0;
      const pairTurns: number[] = [];
      for (const candidateIsFirst of [true, false]) {
        for (let i = 0; i < evalConfig.gamesPerOrder; i += 1) {
          const outcome = playOne(currentSeed, candidateDeckIds, opponent, candidateIsFirst, aiProfiles);
          currentSeed += 1;
          if (outcome.resourceExhaustion) {
            resourceExhaustion += 1;
            pairResourceExhaustion += 1;
          }
          if (outcome.winner === null) {
            draws += 1;
            pairDraws += 1;
          } else {
            decisiveGames += 1;
            pairDecisiveGames += 1;
            if (outcome.firstPlayerWon) {
              firstPlayerWins += 1;
              pairFirstPlayerWins += 1;
            }
            if (outcome.oneSided) {
              oneSidedGames += 1;
              pairOneSidedGames += 1;
            }
            if (outcome.candidateWon) {
              candidateWins += 1;
              pairCandidateWins += 1;
            } else {
              existingWins += 1;
              pairExistingWins += 1;
            }
          }
          turns.push(outcome.turnCount);
          pairTurns.push(outcome.turnCount);
          lifeDiffs.push(outcome.lifeDiff);
        }
      }
      const pairGames = pairCandidateWins + pairExistingWins + pairDraws;
      perOpponent[opponent] = {
        candidate_win_rate: pairCandidateWins / pairGames,
        candidate_wins: pairCandidateWins,
        existing_wins: pairExistingWins,
        draws: pairDraws,
        games: pairGames,
        first_player_win_rate: pairDecisiveGames ? pairFirstPlayerWins / pairDecisiveGames : null,
        one_sided_game_rate: pairDecisiveGames ? pairOneSidedGames / pairDecisiveGames : null,
        resource_exhaustion_rate: pairResourceExhaustion / pairGames,
        average_turns: mean(pairTurns),
      };
    }
  } finally {
    CONFIG.maxTurns = originalMaxTurns;
  }

  const totalGames = candidateWins + existingWins + draws;
  return {
    candidate: candidateKey,
    rule_set: "current",
    rule_label: "current high-power cap 5",
    deck_ids: [...candidateDeckIds],
    games: totalGames,
    candidate_win_rate: candidateWins / totalGames,
    existing_win_rate: existingWins / totalGames,
    draw_rate: draws / totalGames,
    candidate_wins: candidateWins,
    existing_wins: existingWins,
    draws,
    first_player_win_rate: decisiveGames ? firstPlayerWins / decisiveGames : null,
    one_sided_game_rate: decisiveGames ? oneSidedGames / decisiveGames : null,
    resource_exhaustion_rate: resourceExhaustion / totalGames,
    average_turns: mean(turns),
    median_turns: median(turns),
    average_life_difference: mean(lifeDiffs),
    per_opponent: perOpponent,
  };
}
