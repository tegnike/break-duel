/**
 * 対人CPU戦ログ（tmp/human-battle-logs/*.jsonl）からCPUの手番を復元し、
 * challenger の行動選択とスコアトレースを突き合わせる診断スクリプト。
 *
 * 使い方:
 *   npx tsx scripts/diagnoseHumanBattleLogs.ts --log <path.jsonl> [--turn <n>] [--beam] [--candidate-json <weights.json>] [--out <out.json>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  CARD_BY_ID,
  CONFIG,
  chooseAiAction,
  debugChallengerActionScores,
  debugChallengerBeam,
  debugBoardAiScore,
  makeRng,
  CHALLENGER_WEIGHTS,
  type AiAction,
  type Card,
  type GameState,
  type PlayerState,
} from "../src/game";

type SerializedCard = { id: string; status: Card["status"] };

type SnapshotPlayer = {
  name: string;
  deck_name: string;
  is_human: boolean;
  ai_profile: PlayerState["aiProfile"];
  life: number;
  deck: SerializedCard[];
  hand: SerializedCard[];
  known_hand_cards: SerializedCard[];
  set_defense_card: SerializedCard | null;
  field: SerializedCard[];
  field_stacks: SerializedCard[][];
  memory: SerializedCard | null;
  discard: SerializedCard[];
  cards_drawn: number;
  turns_started: number;
  hand_defenses_used: number;
  attacks_this_turn: number;
  set_defense_used_this_turn: boolean;
  played_ai_this_turn: boolean;
  pipeline_used: boolean;
  accelerator_used: boolean;
  war_banner_used: boolean;
  echo_urn_used: boolean;
  charge_used: boolean;
  attack_charge_compensation_used: boolean;
  sandbox_shield: number;
  spent_field_indexes: number[];
  charge_guarded_field_indexes: number[];
  recovery_delayed_field_indexes: number[];
  turn_field_attack_bonuses: Array<[number, number]>;
  turn_global_attack_bonus: number;
  next_attack_unblockable: boolean;
};

type Snapshot = {
  seed: number;
  turn: number;
  active_player_index: number;
  actions_remaining: number;
  charged_actions_remaining: number;
  winner: number | null;
  draw: boolean;
  selected: GameState["selected"];
  pending_attack: GameState["pendingAttack"];
  pending_target: GameState["pendingTarget"];
  siege_lead_streaks: [number, number] | null;
  players: SnapshotPlayer[];
  visible_log: string[];
};

type LogRecord = {
  sequence: number;
  type: string;
  actor: "human" | "cpu" | null;
  new_log_entries: string[];
  state: Snapshot;
};

function reifyCard(serialized: SerializedCard): Card {
  const base = CARD_BY_ID.get(serialized.id);
  if (!base) throw new Error(`unknown card id: ${serialized.id}`);
  return { ...base, status: serialized.status };
}

function reifyPlayer(p: SnapshotPlayer): PlayerState {
  return {
    name: p.name,
    deckName: p.deck_name,
    aiProfile: p.ai_profile,
    isHuman: p.is_human,
    life: p.life,
    deck: p.deck.map(reifyCard),
    hand: p.hand.map(reifyCard),
    knownHandCards: p.known_hand_cards.map(reifyCard),
    setDefenseCard: p.set_defense_card ? reifyCard(p.set_defense_card) : null,
    field: p.field.map(reifyCard),
    fieldStacks: p.field_stacks.map((stack) => stack.map(reifyCard)),
    memory: p.memory ? reifyCard(p.memory) : null,
    discard: p.discard.map(reifyCard),
    cardsDrawn: p.cards_drawn,
    turnsStarted: p.turns_started,
    handDefensesUsed: p.hand_defenses_used,
    playerAttacksThisTurn: p.attacks_this_turn,
    setDefenseUsedThisTurn: p.set_defense_used_this_turn,
    playedAiThisTurn: p.played_ai_this_turn,
    pipelineUsed: p.pipeline_used,
    acceleratorUsed: p.accelerator_used,
    warBannerUsed: p.war_banner_used,
    echoUrnUsed: p.echo_urn_used,
    chargeUsed: p.charge_used,
    attackChargeCompensationUsed: p.attack_charge_compensation_used,
    chargeGuardedFieldIndexes: new Set(p.charge_guarded_field_indexes),
    sandboxShield: p.sandbox_shield,
    spentFieldIndexes: new Set(p.spent_field_indexes),
    power3RecoveryDelayedFieldIndexes: new Set(p.recovery_delayed_field_indexes),
    turnFieldAttackBonuses: new Map(p.turn_field_attack_bonuses),
    turnGlobalAttackBonus: p.turn_global_attack_bonus,
    nextAttackUnblockable: p.next_attack_unblockable,
  };
}

export function reifyGame(snapshot: Snapshot): GameState {
  return {
    rng: makeRng(snapshot.seed),
    seed: snapshot.seed,
    players: snapshot.players.map(reifyPlayer),
    active: snapshot.active_player_index,
    turn: snapshot.turn,
    actionsRemaining: snapshot.actions_remaining,
    chargedActionsRemaining: snapshot.charged_actions_remaining,
    winner: snapshot.winner,
    draw: snapshot.draw,
    selected: snapshot.selected,
    pendingAttack: snapshot.pending_attack,
    pendingTarget: snapshot.pending_target,
    log: [...snapshot.visible_log],
    aiRunning: false,
    discardViewerOwner: null,
    discardViewerIndex: null,
    siegeLeadStreaks: snapshot.siege_lead_streaks ?? undefined,
  };
}

function describeAction(game: GameState, action: AiAction): string {
  const ai = game.players[game.active];
  const opp = game.players[1 - game.active];
  switch (action.type) {
    case "play": return `play ${ai.hand[action.index]?.name ?? "?"}`;
    case "upgrade": return `upgrade ${ai.field[action.fieldIndex]?.name ?? "?"}→${ai.hand[action.handIndex]?.name ?? "?"}`;
    case "memory": return `memory ${ai.hand[action.index]?.name ?? "?"}`;
    case "set-defense": return `set-defense ${ai.hand[action.index]?.name ?? "?"}`;
    case "memory-effect": return `memory-effect ${ai.field[action.fieldIndex]?.name ?? "?"}`;
    case "attack": return `attack with ${ai.field[action.index]?.name ?? "?"}`;
    case "strike": return `strike ${ai.field[action.index]?.name ?? "?"}→${opp.field[action.targetIndex]?.name ?? "?"}`;
    case "command": return `command ${ai.hand[action.index]?.name ?? "?"}`;
    case "charge": return `charge ${ai.hand[action.index]?.name ?? "?"}`;
    case "end": return "end";
  }
}

function parseArgs(): { log: string; turn: number | null; beam: boolean; candidateJson: string | null; out: string | null } {
  const args = { log: "", turn: null as number | null, beam: false, candidateJson: null as string | null, out: null as string | null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--log") args.log = argv[++i];
    else if (argv[i] === "--turn") args.turn = Number(argv[++i]);
    else if (argv[i] === "--beam") args.beam = true;
    else if (argv[i] === "--candidate-json") args.candidateJson = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  if (!args.log) {
    console.error("usage: npx tsx scripts/diagnoseHumanBattleLogs.ts --log <path.jsonl> [--turn n] [--beam] [--candidate-json weights.json] [--out out.json]");
    process.exit(1);
  }
  return args;
}

function main(): void {
  const args = parseArgs();
  if (args.candidateJson) {
    const parsed = JSON.parse(readFileSync(args.candidateJson, "utf-8")) as Record<string, unknown>;
    const source = typeof parsed.weights === "object" && parsed.weights !== null
      ? parsed.weights as Record<string, number>
      : parsed as Record<string, number>;
    for (const key of Object.keys(CHALLENGER_WEIGHTS)) {
      const value = source[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        (CHALLENGER_WEIGHTS as Record<string, number>)[key] = value;
      }
    }
  }
  const records: LogRecord[] = readFileSync(args.log, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LogRecord);

  const results: unknown[] = [];
  for (const record of records) {
    const s = record.state;
    if (s.winner !== null || s.draw) continue;
    if (s.pending_attack || s.pending_target) continue;
    const cpuSeat = s.players.findIndex((p) => !p.is_human);
    if (s.active_player_index !== cpuSeat) continue;
    if (args.turn !== null && s.turn !== args.turn) continue;

    const game = reifyGame(s);
    const chosen = chooseAiAction(game, "challenger");
    const scores = debugChallengerActionScores(game);
    const cpu = s.players[cpuSeat];
    const entry: Record<string, unknown> = {
      sequence: record.sequence,
      turn: s.turn,
      actions_remaining: s.actions_remaining,
      cpu_life: cpu.life,
      cpu_deck: cpu.deck.length,
      cpu_hand: cpu.hand.length,
      cpu_field: cpu.field.length,
      opp_life: s.players[1 - cpuSeat].life,
      opp_deck: s.players[1 - cpuSeat].deck.length,
      opp_field: s.players[1 - cpuSeat].field.length,
      board_score: debugBoardAiScore(game, cpuSeat),
      chosen: describeAction(game, chosen),
      chosen_raw: chosen,
      top_scores: scores.slice(0, 8).map((d) => ({
        action: describeAction(game, d.action),
        immediate: Math.round(d.immediateScore),
        after_board: Math.round(d.afterBoardScore),
        after_turn_end: Math.round(d.afterTurnEndScore),
      })),
    };
    if (args.beam) {
      entry.beam = debugChallengerBeam(game, Math.max(1, Math.floor(CHALLENGER_WEIGHTS.turnPlanBeamWidth))).map((node) => ({
        first: describeAction(game, node.firstAction),
        actions: node.actions.map((a) => a.type),
        total: Math.round(node.totalScore),
        depth: node.depth,
      }));
    }
    results.push(entry);
  }

  const output = JSON.stringify({ config_snapshot: { handLimit: CONFIG.handLimit, maxTurns: CONFIG.maxTurns }, states: results }, null, 1);
  if (args.out) {
    writeFileSync(args.out, output);
    console.log(`wrote ${results.length} cpu decision points to ${args.out}`);
  } else {
    console.log(output);
  }
}

main();
