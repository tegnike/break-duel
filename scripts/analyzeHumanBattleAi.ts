import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  CARD_BY_ID,
  CHALLENGER_WEIGHTS,
  CONFIG,
  actionsForTurn,
  chooseAiAction,
  cloneCard,
  createGame,
  type AiAction,
  type Card,
  type GameState,
  type PlayerState,
} from "../src/game";
import type { HumanBattleLogRecord, HumanBattleSnapshot } from "../src/humanBattleLog";

type SerializedCard = { id: string; status: Card["status"] };

function collectJsonlFiles(path: string): string[] {
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return collectJsonlFiles(child);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [child] : [];
  }).sort();
}

function deserializeCard(serialized: SerializedCard): Card {
  const card = CARD_BY_ID.get(serialized.id);
  if (!card) throw new Error(`Unknown card id in battle log: ${serialized.id}`);
  return { ...cloneCard(card), status: serialized.status };
}

function deserializePlayer(snapshot: HumanBattleSnapshot["players"][number]): PlayerState {
  const hand = snapshot.hand.map(deserializeCard);
  const unmatchedHand = [...hand];
  const knownHandCards = snapshot.known_hand_cards.map((known) => {
    const index = unmatchedHand.findIndex((card) => card.id === known.id && card.status === known.status);
    if (index < 0) return deserializeCard(known);
    return unmatchedHand.splice(index, 1)[0];
  });
  return {
    name: snapshot.name,
    deckName: snapshot.deck_name,
    aiProfile: snapshot.ai_profile,
    isHuman: snapshot.is_human,
    life: snapshot.life,
    deck: snapshot.deck.map(deserializeCard),
    hand,
    knownHandCards,
    setDefenseCard: snapshot.set_defense_card ? deserializeCard(snapshot.set_defense_card) : null,
    field: snapshot.field.map(deserializeCard),
    fieldStacks: snapshot.field_stacks.map((stack) => stack.map(deserializeCard)),
    memory: snapshot.memory ? deserializeCard(snapshot.memory) : null,
    discard: snapshot.discard.map(deserializeCard),
    cardsDrawn: snapshot.cards_drawn,
    turnsStarted: snapshot.turns_started,
    handDefensesUsed: snapshot.hand_defenses_used,
    playerAttacksThisTurn: snapshot.attacks_this_turn,
    setDefenseUsedThisTurn: snapshot.set_defense_used_this_turn,
    playedAiThisTurn: snapshot.played_ai_this_turn,
    pipelineUsed: snapshot.pipeline_used,
    acceleratorUsed: snapshot.accelerator_used,
    warBannerUsed: snapshot.war_banner_used,
    echoUrnUsed: snapshot.echo_urn_used,
    chargeUsed: snapshot.charge_used,
    attackChargeCompensationUsed: snapshot.attack_charge_compensation_used,
    sandboxShield: snapshot.sandbox_shield,
    spentFieldIndexes: new Set(snapshot.spent_field_indexes),
    chargeGuardedFieldIndexes: new Set(snapshot.charge_guarded_field_indexes),
    power3RecoveryDelayedFieldIndexes: new Set(snapshot.recovery_delayed_field_indexes),
    turnFieldAttackBonuses: new Map(snapshot.turn_field_attack_bonuses),
    turnGlobalAttackBonus: snapshot.turn_global_attack_bonus,
    nextAttackUnblockable: snapshot.next_attack_unblockable,
  };
}

function deserializeGame(snapshot: HumanBattleSnapshot): GameState {
  const game = createGame(snapshot.seed, "fire", "earth", "challenger");
  game.players = snapshot.players.map(deserializePlayer);
  game.active = snapshot.active_player_index;
  game.turn = snapshot.turn;
  game.actionsRemaining = snapshot.actions_remaining;
  game.chargedActionsRemaining = snapshot.charged_actions_remaining;
  const active = snapshot.players[snapshot.active_player_index];
  game.actionResolvedThisTurn = snapshot.action_resolved_this_turn ?? (
    game.actionsRemaining !== actionsForTurn(game)
    || active.attacks_this_turn > 0
    || active.set_defense_used_this_turn
    || active.played_ai_this_turn
    || active.accelerator_used
    || active.charge_used
    || active.attack_charge_compensation_used
  );
  game.winner = snapshot.winner;
  game.draw = snapshot.draw;
  game.selected = snapshot.selected;
  game.pendingAttack = snapshot.pending_attack;
  game.pendingTarget = snapshot.pending_target;
  game.log = [...snapshot.visible_log];
  game.siegeLeadStreaks = snapshot.siege_lead_streaks ?? [0, 0];
  return game;
}

function chooseWithOverflowRelief(game: GameState, enabled: number): AiAction {
  const original = CHALLENGER_WEIGHTS.handOverflowRelief;
  try {
    CHALLENGER_WEIGHTS.handOverflowRelief = enabled;
    return chooseAiAction(game, "challenger");
  } finally {
    CHALLENGER_WEIGHTS.handOverflowRelief = original;
  }
}

function withRecordedRules<T>(rules: typeof CONFIG, run: () => T): T {
  const original = { ...CONFIG };
  Object.assign(CONFIG, rules);
  try {
    return run();
  } finally {
    Object.assign(CONFIG, original);
  }
}

function main(): void {
  const logsDir = resolve(process.argv[2] ?? "tmp/human-battle-logs");
  const files = collectJsonlFiles(logsDir);
  const candidateRelief = CHALLENGER_WEIGHTS.handOverflowRelief;
  let cpuTurns = 0;
  let unusedActionTurns = 0;
  let discardedCards = 0;
  let baselineEnds = 0;
  let candidateEnds = 0;
  const candidateActions: Record<string, number> = {};

  for (const file of files) {
    const records = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as HumanBattleLogRecord);
    const recordedRules = records.find((record) => record.type === "match_start")?.rules;
    if (!recordedRules) throw new Error(`Missing match_start rules in battle log: ${file}`);
    withRecordedRules(recordedRules, () => {
      for (let index = 1; index < records.length; index += 1) {
        const endRecord = records[index];
        const previous = records[index - 1];
        if (endRecord.actor !== "cpu" || !endRecord.new_log_entries.some((entry) => entry.includes("ターン終了"))) continue;
        cpuTurns += 1;
        if (CONFIG.handLimit !== null) {
          const cpu = previous.state.players[previous.state.active_player_index];
          discardedCards += Math.max(0, cpu.hand.length - CONFIG.handLimit);
        }
        if (previous.state.actions_remaining <= 0) continue;
        unusedActionTurns += 1;
        const game = deserializeGame(previous.state);
        const baseline = chooseWithOverflowRelief(game, 0);
        const candidate = chooseWithOverflowRelief(game, candidateRelief);
        if (baseline.type === "end") baselineEnds += 1;
        if (candidate.type === "end") candidateEnds += 1;
        candidateActions[candidate.type] = (candidateActions[candidate.type] ?? 0) + 1;
      }
    });
  }

  console.log(JSON.stringify({
    logs_dir: logsDir,
    matches: files.length,
    cpu_turns: cpuTurns,
    unused_action_turns: unusedActionTurns,
    observed_hand_limit_discards: discardedCards,
    baseline_hand_overflow_relief: 0,
    baseline_end_choices: baselineEnds,
    candidate_hand_overflow_relief: candidateRelief,
    candidate_end_choices: candidateEnds,
    rescued_end_choices: baselineEnds - candidateEnds,
    candidate_actions: candidateActions,
  }, null, 2));
}

main();
