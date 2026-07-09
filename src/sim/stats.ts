// 試合結果を Python 版（ai_break_duel/engine.py result_summary / simulation.py summarize_results）
// 互換の summary に変換し、複数試合を集計する。下流の分析スクリプト
// （excitement_metrics.py / league_report.py）が読むキー名・構造を維持すること。
import { CONFIG } from "../game";
import type { MatchRecord } from "./runner";
import { playerName } from "./runner";

export type MatchSummary = Record<string, unknown> & {
  winner: string | null;
  draw: boolean;
  turn_count: number;
  player_1_final_life: number;
  player_2_final_life: number;
  successful_defenses: number;
  failed_defenses: number;
  undefended_attacks: number;
  attacks: number;
  config: Record<string, unknown>;
};

// Python 版 result_summary の config ブロック相当。TS エンジンの CONFIG から
// 対応するキーだけ snake_case で写す（TS に存在しない Python 専用キーは省略）。
export function configSummary(aiProfiles: [string, string]): Record<string, unknown> {
  return {
    life: CONFIG.life,
    initial_hand: CONFIG.initialHand,
    first_player_initial_hand: CONFIG.firstPlayerInitialHand,
    second_player_initial_hand: CONFIG.secondPlayerInitialHand,
    actions_per_turn: CONFIG.actionsPerTurn,
    field_ai_limit: CONFIG.fieldLimit,
    max_turns: CONFIG.maxTurns,
    defense_advantage_bonus: CONFIG.advantageBonus,
    defense_disadvantage_penalty: CONFIG.disadvantagePenalty,
    first_player_first_turn_actions: CONFIG.firstPlayerFirstTurnActions,
    each_player_first_turn_actions: CONFIG.eachPlayerFirstTurnActions,
    first_player_first_turn_can_attack: CONFIG.firstPlayerFirstTurnCanAttack,
    first_player_first_turn_draw: CONFIG.firstPlayerFirstTurnDraw,
    second_player_first_turn_draw: CONFIG.secondPlayerFirstTurnDraw,
    hand_defense_limit_per_turn: CONFIG.handDefenseLimit,
    hand_defense_requires_empty_field: CONFIG.handDefenseEmptyOnly,
    hand_defense_max_power: CONFIG.handDefenseMaxPower,
    set_defense_enabled: CONFIG.setDefenseEnabled,
    set_defense_action_cost: CONFIG.setDefenseActionCost,
    set_defense_once_per_turn: CONFIG.setDefenseOncePerTurn,
    exhaust_after_attack: CONFIG.exhaustAfterAttack,
    exhausted_ai_can_defend: CONFIG.exhaustedCanDefend,
    exact_upgrade_step: CONFIG.exactUpgradeStep,
    power_1_draws_on_play: CONFIG.power1DrawsOnPlay,
    power_2_defense_bonus: CONFIG.power2DefenseBonus,
    large_ai_play_cost: CONFIG.largeAiPlayCost,
    large_ai_upgrade_cost: CONFIG.largeAiUpgradeCost,
    power_3_play_cost: CONFIG.power3PlayCost,
    power_4_play_cost: CONFIG.power4PlayCost,
    power_3_enters_spent: CONFIG.power3EntersSpent,
    power_3_discards_on_play: CONFIG.power3DiscardsOnPlay,
    power_3_cannot_hand_defend: CONFIG.power3CannotHandDefend,
    power_3_cannot_field_defend: CONFIG.power3CannotFieldDefend,
    power_3_defense_modifier: CONFIG.power3DefenseModifier,
    power_3_overheats_after_attack: CONFIG.power3OverheatsAfterAttack,
    power_3_attack_recovery_delay: CONFIG.power3AttackRecoveryDelay,
    power_4_enters_spent: CONFIG.power4EntersSpent,
    power_4_overheats_after_attack: CONFIG.power4OverheatsAfterAttack,
    hand_limit: CONFIG.handLimit,
    turn_limit_result: CONFIG.turnLimitResult,
    deck_out_fatigue_damage: CONFIG.deckOutFatigueDamage,
    draw_on_attack_damage: CONFIG.drawOnAttackDamage,
    attack_damage_charge_compensation: CONFIG.attackDamageChargeCompensation,
    attack_damage_charge_compensation_once_per_turn: CONFIG.attackDamageChargeCompensationOncePerTurn,
    siege_damage: CONFIG.siegeDamage,
    siege_consecutive_turns: CONFIG.siegeConsecutiveTurns,
    hand_defense_vs_strike: CONFIG.handDefenseVsStrike,
    attacks_per_turn_limit: CONFIG.attacksPerTurnLimit,
    attack_limit_counts_strike: CONFIG.attackLimitCountsStrike,
    ai_profiles: [...aiProfiles],
  };
}

// AI 損失数の近似値。Python 版は場から失われた召喚獣＋手札防御で消費した召喚獣を数えるが、
// TS 側は sim 層から正確に追跡できないため「トラッシュにある召喚獣カード数」で代用する
// （手札からトラッシュした召喚獣も含むぶん、わずかに多めに出る）。
function approximateAiLost(discard: { type: string }[]): number {
  return discard.filter((card) => card.type === "ai").length;
}

export function matchSummary(record: MatchRecord): MatchSummary {
  const { game, stats, aiProfiles } = record;
  const [player1, player2] = game.players;
  return {
    seed: game.seed,
    config: configSummary(aiProfiles),
    winner: game.winner === null ? null : playerName(game.winner),
    draw: game.draw,
    turn_count: game.turn,
    player_1_final_life: player1.life,
    player_2_final_life: player2.life,
    player_1_cards_drawn: player1.cardsDrawn,
    player_2_cards_drawn: player2.cardsDrawn,
    player_1_ai_lost: approximateAiLost(player1.discard),
    player_2_ai_lost: approximateAiLost(player2.discard),
    successful_defenses: stats.successfulDefenses,
    failed_defenses: stats.failedDefenses,
    undefended_attacks: stats.undefendedAttacks,
    actions_used: stats.actionsUsed,
    charged_actions_remaining: game.chargedActionsRemaining,
    attacks: stats.attacks,
    attack_by_attribute: sortedNestedCounter(stats.attackByAttribute),
    card_usage: sortedNestedCounter(stats.cardUsage),
    final_hand_sizes: game.players.map((player) => player.hand.length),
    final_memory: game.players.map((player) => (player.memory ? player.memory.id : null)),
  };
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Python statistics.median 互換（偶数個は中央 2 値の平均）
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mergeNestedCounter(items: Record<string, Record<string, number>>[]): Record<string, Record<string, number>> {
  const merged: Record<string, Record<string, number>> = {};
  items.forEach((item) => {
    Object.entries(item).forEach(([key, values]) => {
      const counter = merged[key] ?? (merged[key] = {});
      Object.entries(values).forEach(([subKey, count]) => {
        counter[subKey] = (counter[subKey] ?? 0) + count;
      });
    });
  });
  return sortedNestedCounter(merged);
}

function sortedNestedCounter(counter: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const sorted: Record<string, Record<string, number>> = {};
  Object.keys(counter).sort().forEach((key) => {
    sorted[key] = counter[key];
  });
  return sorted;
}

// Python 版 simulation.py summarize_results の移植
export function summarizeResults(summaries: MatchSummary[], seed: number): Record<string, unknown> {
  if (summaries.length === 0) throw new Error("At least one game is required.");

  const winnerCounts: Record<string, number> = {};
  summaries.forEach((summary) => {
    if (summary.winner !== null) winnerCounts[summary.winner] = (winnerCounts[summary.winner] ?? 0) + 1;
  });
  const nonDraws = summaries.filter((summary) => !summary.draw);
  const turnCounts = summaries.map((summary) => summary.turn_count);
  const successfulDefenses = summaries.reduce((sum, summary) => sum + summary.successful_defenses, 0);
  const failedDefenses = summaries.reduce((sum, summary) => sum + summary.failed_defenses, 0);
  const undefendedAttacks = summaries.reduce((sum, summary) => sum + summary.undefended_attacks, 0);
  const attacks = summaries.reduce((sum, summary) => sum + summary.attacks, 0);
  const totalDefenseEvents = successfulDefenses + failedDefenses + undefendedAttacks;

  const firstPlayerWins = winnerCounts["player_1"] ?? 0;
  const decisiveGames = nonDraws.length;
  const oneSidedGames = nonDraws.filter(
    (summary) => Math.max(summary.player_1_final_life, summary.player_2_final_life) >= 4,
  ).length;

  return {
    seed,
    config: summaries[0].config,
    games: summaries.length,
    wins: winnerCounts,
    draws: summaries.length - decisiveGames,
    first_player_win_rate: rate(firstPlayerWins, decisiveGames),
    average_turns: mean(turnCounts),
    median_turns: median(turnCounts),
    average_life_difference: mean(
      summaries.map((summary) => Math.abs(summary.player_1_final_life - summary.player_2_final_life)),
    ),
    defense_success_rate: rate(successfulDefenses, totalDefenseEvents),
    defense_failure_rate: rate(failedDefenses, totalDefenseEvents),
    undefended_attack_rate: rate(undefendedAttacks, totalDefenseEvents),
    average_ai_lost: mean(
      summaries.map((summary) => (summary.player_1_ai_lost as number) + (summary.player_2_ai_lost as number)),
    ),
    average_cards_drawn: mean(
      summaries.map((summary) => (summary.player_1_cards_drawn as number) + (summary.player_2_cards_drawn as number)),
    ),
    average_final_hand_size: mean(
      summaries.map((summary) => (summary.final_hand_sizes as number[]).reduce((sum, size) => sum + size, 0) / 2),
    ),
    one_sided_game_rate: rate(oneSidedGames, decisiveGames),
    attacks,
    successful_defenses: successfulDefenses,
    failed_defenses: failedDefenses,
    undefended_attacks: undefendedAttacks,
    attack_by_attribute: mergeNestedCounter(
      summaries.map((summary) => summary.attack_by_attribute as Record<string, Record<string, number>>),
    ),
    card_usage: mergeNestedCounter(
      summaries.map((summary) => summary.card_usage as Record<string, Record<string, number>>),
    ),
  };
}

// Python 版 simulation.py _standings_with_rates の移植
export type StandingsRow = { wins: number; losses: number; draws: number; games: number };

export function standingsWithRates(
  standings: Record<string, StandingsRow>,
): Record<string, StandingsRow & { win_rate: number | null }> {
  const rows = Object.entries(standings).map(([deck, values]) => {
    const decisiveGames = values.wins + values.losses;
    return [deck, { ...values, win_rate: rate(values.wins, decisiveGames) }] as const;
  });
  rows.sort((a, b) => {
    const aRate = a[1].win_rate;
    const bRate = b[1].win_rate;
    const aNull = aRate === null ? 1 : 0;
    const bNull = bRate === null ? 1 : 0;
    if (aNull !== bNull) return aNull - bNull;
    if ((aRate ?? 0) !== (bRate ?? 0)) return (bRate ?? 0) - (aRate ?? 0);
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  return Object.fromEntries(rows);
}
