// ヘッドレスシミュレーション用のランナー。AI vs AI で 1 試合を最後まで同期実行する。
// エンジン本体（src/game.ts / src/game/actions.ts）は変更せず、
// duelEvents（showDuelEvent フック）の購読と試合前後の状態観測だけで統計を取る。
import {
  CHALLENGER_WEIGHTS,
  CONFIG,
  activePlayer,
  cardAttributes,
  chooseAiAction,
  createGame,
  finishTurn,
} from "../game";
import type { AiProfile, Card, DeckId, DuelDeckSource, GameState } from "../game";
import { performAiActionInDraft } from "../game/actions";
import type { GameActionEffects } from "../game/actions";
import type { DuelEventPayload } from "../duelEvents";
import type { AiAction } from "../game";

// Python 版 simulation.py の MatchResult.log に相当する構造化ログ。
// excitement_metrics.py が turn_start / game_end の life 配列を読むため必須。
export type SimLogEvent = { event: string } & Record<string, unknown>;

export type MatchStats = {
  attacks: number;
  successfulDefenses: number;
  failedDefenses: number;
  undefendedAttacks: number;
  actionsUsed: number;
  attackByAttribute: Record<string, Record<string, number>>;
  cardUsage: Record<string, Record<string, number>>;
};

// CHALLENGER_WEIGHTS のキーを数値で差し替える型（challenger AI の評価関数の重み）。
export type ChallengerWeights = { [K in keyof typeof CHALLENGER_WEIGHTS]: number };

export type MatchOptions = {
  // DeckId（プリセット）に加え、カスタムデッキ（DuelDeckSource）も指定できる。
  firstDeck?: DeckId | DuelDeckSource;
  secondDeck?: DeckId | DuelDeckSource;
  aiProfiles?: [AiProfile, AiProfile];
  // 手番ごとの CHALLENGER_WEIGHTS 差し替え（Python 版 tune_ai_profiles.py の
  // モジュール変数 swap と同じ思想）。指定時は各アクション選択の直前に
  // アクティブプレイヤー側の重みを Object.assign で反映し、試合終了時に必ず元へ戻す。
  // 注意: Python 版と同様、重みが影響するのはアクティブプレイヤーの行動選択のみ。
  weightsBySeat?: [ChallengerWeights, ChallengerWeights];
};

export type MatchRecord = {
  game: GameState;
  aiProfiles: [AiProfile, AiProfile];
  stats: MatchStats;
  log: SimLogEvent[];
};

// 1 試合あたりのアクション実行回数の上限（無限ループ防止）。
// 40 ターン × 数アクションでも十分収まる値にしている。
const MAX_STEPS = 10000;

export function playerName(index: number): string {
  return index === 0 ? "player_1" : "player_2";
}

function emptyStats(): MatchStats {
  return {
    attacks: 0,
    successfulDefenses: 0,
    failedDefenses: 0,
    undefendedAttacks: 0,
    actionsUsed: 0,
    attackByAttribute: {},
    cardUsage: {},
  };
}

function recordCardUsage(stats: MatchStats, cardId: string, key: string): void {
  const usage = stats.cardUsage[cardId] ?? (stats.cardUsage[cardId] = {});
  usage[key] = (usage[key] ?? 0) + 1;
}

function recordAttributeAttack(stats: MatchStats, attribute: string, outcome: string): void {
  const bucket = stats.attackByAttribute[attribute] ?? (stats.attackByAttribute[attribute] = {});
  bucket[outcome] = (bucket[outcome] ?? 0) + 1;
}

type Snapshot = {
  turn: number;
  active: number;
  actionsRemaining: number;
  chargedActionsRemaining: number;
  zoneSizes: string;
  life: string;
};

function takeSnapshot(game: GameState): Snapshot {
  return {
    turn: game.turn,
    active: game.active,
    actionsRemaining: game.actionsRemaining,
    chargedActionsRemaining: game.chargedActionsRemaining,
    zoneSizes: game.players
      .map((player) => `${player.deck.length}/${player.hand.length}/${player.field.length}/${player.discard.length}/${player.memory ? 1 : 0}`)
      .join("|"),
    life: game.players.map((player) => player.life).join("|"),
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.turn === b.turn
    && a.active === b.active
    && a.actionsRemaining === b.actionsRemaining
    && a.chargedActionsRemaining === b.chargedActionsRemaining
    && a.zoneSizes === b.zoneSizes
    && a.life === b.life
  );
}

// 攻撃解決イベント（battle / damage）を Python 版の防御統計に写像する。
// resultLabel は actions.ts の resolveDefenseInDraft / strike 系が出す固定文字列。
function classifyAttackResolution(
  stats: MatchStats,
  action: AiAction,
  attackCard: Card,
  events: DuelEventPayload[],
): void {
  const resolution = events.find((event) => event.kind === "battle" || event.kind === "damage");
  if (!resolution) return; // 攻撃が成立しなかった（不正アクションで no-op）

  const isStrike = action.type === "strike";
  stats.attacks += 1;
  recordCardUsage(stats, attackCard.id, isStrike ? "struck" : "attacked");

  const defenseEntry = resolution.cards.find((entry) => entry.label === "防御");
  let outcome: "blocked" | "damage" = "blocked";
  if (resolution.kind === "damage") {
    stats.undefendedAttacks += 1;
    outcome = "damage";
  } else if (defenseEntry) {
    const label = resolution.resultLabel ?? "";
    const failed = label === "攻撃成功" || label === "対象を防御";
    if (failed) {
      stats.failedDefenses += 1;
      recordCardUsage(stats, defenseEntry.card.id, isStrike ? "field_defended_strike_failed" : "defended_partial_failed");
      outcome = "damage";
    } else if (label === "攻撃を防御") {
      stats.successfulDefenses += 1;
      recordCardUsage(stats, defenseEntry.card.id, "hand_defended_success");
      if ((resolution.impact?.amount ?? 0) > 0) outcome = "damage"; // 手札防御貫通
    } else if (label === "モンスター攻撃を防御") {
      stats.successfulDefenses += 1;
      recordCardUsage(stats, defenseEntry.card.id, "hand_defended_strike");
    } else {
      // 相打ち / 防御側が残る = 防御成功
      stats.successfulDefenses += 1;
      recordCardUsage(stats, defenseEntry.card.id, isStrike ? "field_defended_strike" : "defended_success");
    }
  }
  // Python 版は通常攻撃のみ属性別統計を取る（strike は対象外）
  if (!isStrike) {
    const attribute = cardAttributes(attackCard)[0] ?? "-";
    recordAttributeAttack(stats, attribute, outcome);
  }
}

// 非戦闘アクションのカード使用統計。成功判定は duel イベントの有無で行う。
function classifyNonCombatAction(
  stats: MatchStats,
  action: AiAction,
  actor: { hand: Card[]; field: Card[]; memory: Card | null },
  events: DuelEventPayload[],
): void {
  if (action.type === "play") {
    const card = actor.hand[action.index];
    if (card && events.some((event) => event.kind === "play")) recordCardUsage(stats, card.id, "played");
  } else if (action.type === "upgrade") {
    const card = actor.hand[action.handIndex];
    const source = actor.field[action.fieldIndex];
    if (card && source && events.some((event) => event.kind === "upgrade")) {
      recordCardUsage(stats, card.id, "upgraded");
      recordCardUsage(stats, source.id, "upgrade_source");
    }
  } else if (action.type === "memory") {
    const card = actor.hand[action.index];
    if (card && events.some((event) => event.kind === "memory")) recordCardUsage(stats, card.id, "played");
  } else if (action.type === "command") {
    const card = actor.hand[action.index];
    if (card && events.some((event) => event.kind === "command")) recordCardUsage(stats, card.id, "used");
  } else if (action.type === "charge") {
    const card = actor.hand[action.index];
    if (card && events.some((event) => event.kind === "command")) recordCardUsage(stats, card.id, "charged");
  } else if (action.type === "memory-effect") {
    if (actor.memory) recordCardUsage(stats, actor.memory.id, "used");
  }
}

/**
 * AI vs AI で 1 試合を最後まで回す。
 * プレイヤー 0 も performAiActionInDraft で駆動するため isHuman を外す
 * （エンジン側は isHuman=false のプレイヤーに対して防御・対象選択を自動解決する）。
 */
export function runMatch(seed: number, options: MatchOptions = {}): MatchRecord {
  if (!options.weightsBySeat) return runMatchCore(seed, options);
  // 重み差し替えはモジュール変数 CHALLENGER_WEIGHTS の破壊的更新で行うため、
  // 例外時も含めて必ず元の値へ復元する。
  const original: ChallengerWeights = { ...CHALLENGER_WEIGHTS };
  try {
    return runMatchCore(seed, options);
  } finally {
    Object.assign(CHALLENGER_WEIGHTS, original);
  }
}

function runMatchCore(seed: number, options: MatchOptions): MatchRecord {
  const firstDeck = options.firstDeck ?? "break";
  const secondDeck = options.secondDeck ?? "control";
  const aiProfiles = options.aiProfiles ?? ["challenger", "challenger"];
  const weightsBySeat = options.weightsBySeat;

  const game = createGame(seed, firstDeck, secondDeck, aiProfiles[1]);
  game.players[0].isHuman = false;
  game.players[0].aiProfile = aiProfiles[0];

  const stats = emptyStats();
  const log: SimLogEvent[] = [];
  log.push({
    event: "setup",
    seed,
    initial_hands: game.players.map((player) => player.hand.length),
    life: CONFIG.life,
  });

  let lastTurnKey = "";
  const recordTurnStart = () => {
    const key = `${game.turn}:${game.active}`;
    if (key === lastTurnKey) return;
    lastTurnKey = key;
    log.push({
      event: "turn_start",
      turn: game.turn,
      active_player: playerName(game.active),
      actions_remaining: game.actionsRemaining,
      life: game.players.map((player) => player.life),
    });
  };
  recordTurnStart();

  let guard = 0;
  while (game.winner === null && !game.draw) {
    guard += 1;
    if (guard > MAX_STEPS) {
      throw new Error(`シミュレーションがステップ上限（${MAX_STEPS}）を超過: seed=${seed} turn=${game.turn}`);
    }
    const before = takeSnapshot(game);
    const actor = activePlayer(game);
    const actorZones = { hand: [...actor.hand], field: [...actor.field], memory: actor.memory };
    if (weightsBySeat) Object.assign(CHALLENGER_WEIGHTS, weightsBySeat[game.active]);
    const action = chooseAiAction(game, actor.aiProfile);

    const events: DuelEventPayload[] = [];
    const effects: GameActionEffects = { showDuelEvent: (event) => events.push(event) };
    performAiActionInDraft(game, action, effects);

    if (action.type === "attack" || action.type === "strike") {
      const attackCard = actorZones.field[action.index];
      if (attackCard) classifyAttackResolution(stats, action, attackCard, events);
    } else {
      classifyNonCombatAction(stats, action, actorZones, events);
    }

    const after = takeSnapshot(game);
    const turnChanged = after.turn !== before.turn || after.active !== before.active;
    stats.actionsUsed += turnChanged
      ? (action.type === "end" ? 0 : before.actionsRemaining)
      : Math.max(0, before.actionsRemaining - after.actionsRemaining);

    if (game.winner !== null || game.draw) break;
    if (!turnChanged && sameSnapshot(before, after)) {
      // AI が不正アクションを選んで no-op になった場合の詰み保険。ターンを強制終了して前進させる。
      game.pendingAttack = null;
      game.pendingTarget = null;
      finishTurn(game, false);
    }
    recordTurnStart();
  }

  const life = game.players.map((player) => player.life);
  const reason = Math.min(...life) <= 0
    ? "lifeout"
    : game.draw && game.turn >= CONFIG.maxTurns
      ? "turn_limit"
      : "resource_exhaustion";
  log.push({
    event: "game_end",
    turn: game.turn,
    winner: game.winner === null ? null : playerName(game.winner),
    life,
    reason,
  });

  return { game, aiProfiles, stats, log };
}
