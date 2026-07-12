import { CONFIG, type Card, type GameState, type PlayerState } from "./game";

export const HUMAN_BATTLE_LOG_ENDPOINT = "/api/local-human-battle-logs";
export const HUMAN_BATTLE_LOG_SCHEMA_VERSION = 1;

type SerializedCard = Pick<Card, "id" | "status">;

export type HumanBattleSnapshot = {
  seed: number;
  turn: number;
  active_player_index: number;
  actions_remaining: number;
  charged_actions_remaining: number;
  action_resolved_this_turn?: boolean;
  winner: number | null;
  draw: boolean;
  selected: GameState["selected"];
  pending_attack: GameState["pendingAttack"];
  pending_target: GameState["pendingTarget"];
  siege_lead_streaks: [number, number] | null;
  players: Array<{
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
  }>;
  visible_log: string[];
};

export type HumanBattleLogRecord = {
  schema_version: typeof HUMAN_BATTLE_LOG_SCHEMA_VERSION;
  session_id: string;
  sequence: number;
  recorded_at: string;
  type: "match_start" | "state_transition" | "match_end" | "match_abandoned";
  actor: "human" | "cpu" | null;
  new_log_entries: string[];
  rules?: typeof CONFIG;
  result?: "human_win" | "cpu_win" | "draw" | "abandoned";
  state: HumanBattleSnapshot;
};

export type HumanBattleLogSession = {
  id: string;
  sequence: number;
  queuedSnapshot: HumanBattleSnapshot | null;
  lastSnapshot: HumanBattleSnapshot | null;
  pendingRecords: HumanBattleLogRecord[];
  ended: boolean;
  queue: Promise<void>;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

function serializeCard(card: Card): SerializedCard {
  return { id: card.id, status: card.status };
}

function serializePlayer(player: PlayerState) {
  return {
    name: player.name,
    deck_name: player.deckName,
    is_human: player.isHuman,
    ai_profile: player.aiProfile,
    life: player.life,
    deck: player.deck.map(serializeCard),
    hand: player.hand.map(serializeCard),
    known_hand_cards: player.knownHandCards.map(serializeCard),
    set_defense_card: player.setDefenseCard ? serializeCard(player.setDefenseCard) : null,
    field: player.field.map(serializeCard),
    field_stacks: player.fieldStacks.map((stack) => stack.map(serializeCard)),
    memory: player.memory ? serializeCard(player.memory) : null,
    discard: player.discard.map(serializeCard),
    cards_drawn: player.cardsDrawn,
    turns_started: player.turnsStarted,
    hand_defenses_used: player.handDefensesUsed,
    attacks_this_turn: player.playerAttacksThisTurn,
    set_defense_used_this_turn: player.setDefenseUsedThisTurn,
    played_ai_this_turn: player.playedAiThisTurn,
    pipeline_used: player.pipelineUsed,
    accelerator_used: player.acceleratorUsed,
    war_banner_used: player.warBannerUsed,
    echo_urn_used: player.echoUrnUsed,
    charge_used: player.chargeUsed,
    attack_charge_compensation_used: Boolean(player.attackChargeCompensationUsed),
    sandbox_shield: player.sandboxShield,
    spent_field_indexes: [...player.spentFieldIndexes].sort((a, b) => a - b),
    charge_guarded_field_indexes: [...player.chargeGuardedFieldIndexes].sort((a, b) => a - b),
    recovery_delayed_field_indexes: [...player.power3RecoveryDelayedFieldIndexes].sort((a, b) => a - b),
    turn_field_attack_bonuses: [...player.turnFieldAttackBonuses].sort(([a], [b]) => a - b),
    turn_global_attack_bonus: player.turnGlobalAttackBonus,
    next_attack_unblockable: player.nextAttackUnblockable,
  };
}

export function serializeHumanBattleState(game: GameState): HumanBattleSnapshot {
  return {
    seed: game.seed,
    turn: game.turn,
    active_player_index: game.active,
    actions_remaining: game.actionsRemaining,
    charged_actions_remaining: game.chargedActionsRemaining,
    action_resolved_this_turn: game.actionResolvedThisTurn,
    winner: game.winner,
    draw: game.draw,
    selected: game.selected ? { ...game.selected } : null,
    pending_attack: game.pendingAttack ? { ...game.pendingAttack } : null,
    pending_target: game.pendingTarget ? JSON.parse(JSON.stringify(game.pendingTarget)) as GameState["pendingTarget"] : null,
    siege_lead_streaks: game.siegeLeadStreaks ? [...game.siegeLeadStreaks] : null,
    players: game.players.map(serializePlayer),
    visible_log: [...game.log],
  };
}

export function appendedLogEntries(previous: string[], current: string[]): string[] {
  const maxOverlap = Math.min(previous.length, current.length);
  for (let overlap = maxOverlap; overlap >= 0; overlap -= 1) {
    const previousSuffix = previous.slice(previous.length - overlap);
    const currentPrefix = current.slice(0, overlap);
    if (previousSuffix.every((entry, index) => entry === currentPrefix[index])) return current.slice(overlap);
  }
  return [...current];
}

export function createHumanBattleLogSession(game: GameState, now = new Date()): HumanBattleLogSession {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return {
    id: `${timestamp}_seed-${game.seed}_${Math.random().toString(36).slice(2, 10)}`,
    sequence: 0,
    queuedSnapshot: null,
    lastSnapshot: null,
    pendingRecords: [],
    ended: false,
    queue: Promise.resolve(),
    retryTimer: null,
  };
}

export function buildHumanBattleLogRecord(
  session: HumanBattleLogSession,
  game: GameState,
  type?: HumanBattleLogRecord["type"],
  now = new Date(),
): HumanBattleLogRecord {
  const state = serializeHumanBattleState(game);
  const previousSnapshot = session.queuedSnapshot ?? session.lastSnapshot;
  const resolvedType = type ?? (previousSnapshot === null
    ? "match_start"
    : game.winner !== null || game.draw ? "match_end" : "state_transition");
  const record: HumanBattleLogRecord = {
    schema_version: HUMAN_BATTLE_LOG_SCHEMA_VERSION,
    session_id: session.id,
    sequence: session.sequence,
    recorded_at: now.toISOString(),
    type: resolvedType,
    actor: previousSnapshot === null
      ? null
      : previousSnapshot.players[previousSnapshot.active_player_index]?.is_human ? "human" : "cpu",
    new_log_entries: appendedLogEntries(previousSnapshot?.visible_log ?? [], state.visible_log),
    state,
  };
  if (resolvedType === "match_start") record.rules = { ...CONFIG };
  if (resolvedType === "match_end") record.result = game.draw ? "draw" : game.winner === 0 ? "human_win" : "cpu_win";
  if (resolvedType === "match_abandoned") record.result = "abandoned";
  return record;
}

function removePendingRecord(session: HumanBattleLogSession, record: HumanBattleLogRecord): void {
  const index = session.pendingRecords.findIndex((pending) => pending.sequence === record.sequence);
  if (index >= 0) session.pendingRecords.splice(index, 1);
  session.lastSnapshot = record.state;
}

function scheduleHumanBattleLogRetry(session: HumanBattleLogSession): void {
  if (session.retryTimer !== null || session.pendingRecords.length === 0) return;
  session.retryTimer = setTimeout(() => {
    session.retryTimer = null;
    drainHumanBattleLogSession(session);
  }, 500);
}

function drainHumanBattleLogSession(session: HumanBattleLogSession, forceKeepalive = false): void {
  if (session.retryTimer !== null) {
    clearTimeout(session.retryTimer);
    session.retryTimer = null;
  }
  session.queue = session.queue
    .catch(() => undefined)
    .then(async () => {
      while (session.pendingRecords.length > 0) {
        const pending = session.pendingRecords[0];
        const response = await fetch(HUMAN_BATTLE_LOG_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending),
          keepalive: forceKeepalive || pending.type === "match_end" || pending.type === "match_abandoned",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        removePendingRecord(session, pending);
      }
    })
    .catch((error) => {
      if (import.meta.env.DEV) console.warn("Human battle log could not be saved", error);
      scheduleHumanBattleLogRetry(session);
    });
}

export function sendHumanBattleLogRecord(session: HumanBattleLogSession, record: HumanBattleLogRecord): void {
  if (session.ended) return;
  session.sequence += 1;
  session.queuedSnapshot = record.state;
  session.pendingRecords.push(record);
  if (record.type === "match_end" || record.type === "match_abandoned") session.ended = true;
  drainHumanBattleLogSession(session);
}

export function flushHumanBattleLogSession(session: HumanBattleLogSession): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
  let needsFallback = false;
  [...session.pendingRecords].forEach((record) => {
    const queued = navigator.sendBeacon(
      HUMAN_BATTLE_LOG_ENDPOINT,
      new Blob([JSON.stringify(record)], { type: "application/json" }),
    );
    if (queued) {
      removePendingRecord(session, record);
    } else {
      needsFallback = true;
    }
  });
  if (needsFallback) drainHumanBattleLogSession(session, true);
}
