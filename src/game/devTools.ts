// 開発ビルド限定のデブパネル（DevPanel）から盤面を直接編集するためのミューテータ群。
// cloneGame 済みの draft に対して呼ぶ前提で、UI側の都合（fieldStacks やインデックス系
// Set/Map の同期）をここで一括して面倒みる。

import {
  addLog,
  CARD_BY_ID,
  cloneCard,
  CONFIG,
  type Card,
  type GameState,
  type PlayerState,
} from "../game";

export type DevCardZone = "hand" | "field" | "memory" | "deckTop" | "deckBottom" | "discard";
export type DevRemovableZone = "hand" | "field" | "memory" | "deck" | "discard";
export type DevResultTone = "win" | "lose" | "draw";

function shiftIndexSet(indexes: Set<number>, removedIndex: number): Set<number> {
  const next = new Set<number>();
  for (const index of indexes) {
    if (index === removedIndex) continue;
    next.add(index > removedIndex ? index - 1 : index);
  }
  return next;
}

function shiftIndexMap(map: Map<number, number>, removedIndex: number): Map<number, number> {
  const next = new Map<number, number>();
  for (const [index, value] of map) {
    if (index === removedIndex) continue;
    next.set(index > removedIndex ? index - 1 : index, value);
  }
  return next;
}

/** 場のインデックスに紐づく管理情報（fieldStacks / Set / Map）ごと安全に1体取り除く */
export function devRemoveFieldCard(player: PlayerState, index: number): boolean {
  if (index < 0 || index >= player.field.length) return false;
  player.field.splice(index, 1);
  player.fieldStacks.splice(index, 1);
  player.spentFieldIndexes = shiftIndexSet(player.spentFieldIndexes, index);
  player.power3RecoveryDelayedFieldIndexes = shiftIndexSet(player.power3RecoveryDelayedFieldIndexes, index);
  player.chargeGuardedFieldIndexes = shiftIndexSet(player.chargeGuardedFieldIndexes, index);
  player.turnFieldAttackBonuses = shiftIndexMap(player.turnFieldAttackBonuses, index);
  return true;
}

function clearInvalidPendingState(game: GameState): void {
  const pending = game.pendingAttack;
  if (pending) {
    const attacker = game.players[pending.attackerIndex];
    if (!attacker || pending.fieldIndex >= attacker.field.length) {
      game.pendingAttack = null;
    }
  }
  if (game.discardViewerOwner !== null) {
    const owner = game.players[game.discardViewerOwner];
    if (!owner || game.discardViewerIndex === null || game.discardViewerIndex >= owner.discard.length) {
      game.discardViewerOwner = null;
      game.discardViewerIndex = null;
    }
  }
}

export function devAddCard(game: GameState, playerIndex: number, zone: DevCardZone, cardId: string): boolean {
  const player = game.players[playerIndex];
  const source = CARD_BY_ID.get(cardId);
  if (!player || !source) return false;
  const card = cloneCard(source);
  switch (zone) {
    case "hand":
      player.hand.push(card);
      return true;
    case "field":
      if (card.type !== "ai" || player.field.length >= CONFIG.fieldLimit) return false;
      player.field.push(card);
      player.fieldStacks.push([]);
      return true;
    case "memory":
      if (card.type !== "memory") return false;
      player.memory = card;
      return true;
    // deck は末尾（pop 側）が次に引くカード
    case "deckTop":
      player.deck.push(card);
      return true;
    case "deckBottom":
      player.deck.unshift(card);
      return true;
    case "discard":
      player.discard.push(card);
      return true;
  }
}

export function devRemoveCard(game: GameState, playerIndex: number, zone: DevRemovableZone, index: number): boolean {
  const player = game.players[playerIndex];
  if (!player) return false;
  let removed = false;
  switch (zone) {
    case "hand":
      removed = player.hand.splice(index, 1).length > 0;
      break;
    case "field":
      removed = devRemoveFieldCard(player, index);
      break;
    case "memory":
      removed = player.memory !== null;
      player.memory = null;
      break;
    case "deck":
      removed = player.deck.splice(index, 1).length > 0;
      break;
    case "discard":
      removed = player.discard.splice(index, 1).length > 0;
      break;
  }
  if (removed) clearInvalidPendingState(game);
  return removed;
}

export function devToggleFieldSpent(player: PlayerState, index: number): boolean {
  if (index < 0 || index >= player.field.length) return false;
  if (player.spentFieldIndexes.has(index)) {
    player.spentFieldIndexes.delete(index);
    player.power3RecoveryDelayedFieldIndexes.delete(index);
  } else {
    player.spentFieldIndexes.add(index);
  }
  return true;
}

/** ライバルの場の召喚獣で即時攻撃を発生させ、防御選択UIを開かせる */
export function devTriggerRivalAttack(game: GameState, fieldIndex: number): boolean {
  const rival = game.players[1];
  if (game.winner !== null || game.draw) return false;
  if (!rival || fieldIndex < 0 || fieldIndex >= rival.field.length) return false;
  rival.spentFieldIndexes.delete(fieldIndex);
  game.active = 1;
  game.actionsRemaining = Math.max(game.actionsRemaining, 1);
  game.selected = null;
  game.pendingTarget = null;
  game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex };
  addLog(game, `開発用: ${rival.name}の${rival.field[fieldIndex].name}で攻撃を発生させました。`);
  return true;
}

/** 勝敗演出のテスト用に決着状態を直接セットする。tone=null で解除 */
export function devSetMatchResult(game: GameState, tone: DevResultTone | null): void {
  if (tone === null) {
    game.winner = null;
    game.draw = false;
    addLog(game, "開発用: 決着状態を解除しました。");
    return;
  }
  game.pendingAttack = null;
  game.pendingTarget = null;
  game.selected = null;
  game.draw = tone === "draw";
  game.winner = tone === "win" ? 0 : tone === "lose" ? 1 : null;
  addLog(game, `開発用: 決着演出（${tone}）をトリガーしました。`);
}

/** ターン中に1度だけ系のフラグをまとめてリセットして再テスト可能にする */
export function devResetTurnFlags(player: PlayerState): void {
  player.playedAiThisTurn = false;
  player.chargeUsed = false;
  player.pipelineUsed = false;
  player.acceleratorUsed = false;
  player.warBannerUsed = false;
  player.echoUrnUsed = false;
  player.handDefensesUsed = 0;
}

export function devCardLabel(card: Card): string {
  const attributes = [card.attribute, card.subAttribute].filter(Boolean).join("/");
  const power = card.type === "ai" && card.power !== undefined ? ` P${card.power}` : "";
  return `${card.name}${power}${attributes ? `（${attributes}）` : ""}`;
}
