import {
  attackDamage,
  strikeValues,
  CONFIG,
  type AiAction,
  type Card,
  type DefenseChoice,
  type GameState,
  type PendingTarget,
  type PlayerState,
  addLog,
  activePlayer,
  applyAttackChargeCompensation,
  addTurnFieldAttackBonus,
  addTurnGlobalAttackBonus,
  applyEchoUrnDraw,
  applyWarBannerDraw,
  bestEventInDiscard,
  bestMemoryInDiscard,
  bestReviveTargetInDiscard,
  attackCombatValue,
  canActivePlayerAttack,
  canActivePlayerAttackOpponent,
  canChargeCard,
  canSetDefenseCard,
  canUseCharge,
  canDefend,
  canUseAcceleratorMemory,
  canUpgrade,
  checkResourceExhaustion,
  checkTurnLimit,
  checkWinner,
  chooseAiDefense,
  chooseStrikeFieldDefense,
  chooseStrikeHandDefense,
  cardNameList,
  commandUsable,
  defenseCombatValue,
  discardFirewallFuel,
  discardLowPriorityCards,
  drawCards,
  drawsAfterOverheat,
  drawsOnBlockedAttack,
  drawsOnPlay,
  drawsOnSuccessfulDefense,
  drawsTwoAfterOverheat,
  entersSpentOnPlay,
  filtersOnPlay,
  finishTurn,
  highestPowerAiInDiscard,
  highestPowerFieldAi,
  highestPowerReadyAi,
  highestPowerSpentAi,
  highestPowerSpentAiByAttribute,
  hasAttribute,
  hasAttributeAi,
  legalFieldDefenders,
  legalHandDefenders,
  legalStrikeFieldDefenders,
  lowestPriorityHand,
  markKnownHandCard,
  keepsReadyAfterAttack,
  needsFirewallFuel,
  opponentPlayer,
  opponentDrawsOnPlay,
  piercesHandDefense,
  playCost,
  pressuresOnBlock,
  readiesAllyOnPlay,
  recoversAiOnPlay,
  recoversAiOnSuccessfulDefense,
  recoversMemoryOnPlay,
  removeFieldStack,
  returnsAfterOverheat,
  reviveAiFromDiscard,
  selfDamagesOnPlay,
  setNextAttackUnblockable,
  spendsEnemyOnPlay,
  stackUpgradeCard,
  trashesEnemyMemoryOnPlay,
  trashMemory,
  upgradeCost,
  useAction,
  visibleDrawText,
} from "../game";
import { TRUMP_CUT_IN_LINE } from "../duelEvents";
import type { DuelEventPayload } from "../duelEvents";

export type GameActionEffects = {
  playSfx?: (kind: string) => void;
  showDuelEvent?: (event: DuelEventPayload) => void;
  suppressEntryCutIn?: boolean;
};

function trumpCutInForPower4Entry(player: PlayerState, card: Card): DuelEventPayload["cutIn"] | undefined {
  if (player.isHuman || card.type !== "ai" || card.power !== 4) return undefined;
  return { style: "trump", line: TRUMP_CUT_IN_LINE };
}

export type ChargeTargetOptions = {
  guardTargetIndex?: number | null;
  readyTargetIndex?: number | null;
  spendTargetIndex?: number | null;
  recoverTargetIndex?: number | null;
};

function dealLifeDamage(player: PlayerState, amount = 1): void {
  player.life = Math.max(0, player.life - Math.max(0, amount));
}

export function afterAction(draft: GameState, cost = 1, kind: "normal" | "attack" = "normal"): void {
  useAction(draft, cost, kind);
  checkWinner(draft);
  checkResourceExhaustion(draft);
  checkTurnLimit(draft);
}

export function discardHandCards(game: GameState, playerIndex: number, indexes: number[]): Card[] {
  const player = game.players[playerIndex];
  const uniqueIndexes = [...new Set(indexes)]
    .filter((index) => index >= 0 && index < player.hand.length)
    .sort((a, b) => b - a);
  const discarded: Card[] = [];
  uniqueIndexes.forEach((index) => {
    const [card] = player.hand.splice(index, 1);
    player.discard.push(card);
    discarded.unshift(card);
  });
  return discarded;
}

function consumeHandDefenseCard(defender: PlayerState, index: number): Card | null {
  if (CONFIG.setDefenseEnabled && index === -1) {
    const card = defender.setDefenseCard;
    if (!card) return null;
    defender.setDefenseCard = null;
    defender.discard.push(card);
    return card;
  }
  const card = defender.hand[index];
  if (!card) return null;
  defender.hand.splice(index, 1);
  defender.discard.push(card);
  return card;
}

export function useAcceleratorMemoryInDraft(draft: GameState, playerIndex: number, fieldIndex: number): Card | null {
  const player = draft.players[playerIndex];
  if (!player || !canUseAcceleratorMemory(draft, player)) return null;
  const sacrificed = player.field[fieldIndex];
  if (!sacrificed) return null;
  const removedCards = removeFieldStack(player, fieldIndex);
  player.discard.push(...removedCards);
  player.acceleratorUsed = true;
  const before = draft.actionsRemaining;
  draft.actionsRemaining = Math.min(CONFIG.actionsPerTurn + 1, draft.actionsRemaining + 1);
  addLog(draft, `${player.name}は${player.memory!.name}で${sacrificed.name}をトラッシュし、残りアクションを${before}から${draft.actionsRemaining}に増やした。`);
  draft.selected = null;
  draft.pendingTarget = null;
  checkResourceExhaustion(draft);
  checkTurnLimit(draft);
  return sacrificed;
}

export function chargeHandCardInDraft(
  draft: GameState,
  playerIndex: number,
  handIndex: number,
  chargeTargets?: number | null | ChargeTargetOptions,
): Card | null {
  const player = draft.players[playerIndex];
  if (!player || !canUseCharge(draft, player)) return null;
  const charged = player.hand[handIndex];
  if (!charged || !canChargeCard(charged)) return null;
  player.hand.splice(handIndex, 1);
  player.discard.push(charged);
  player.chargeUsed = true;
  const before = draft.actionsRemaining;
  draft.actionsRemaining = Math.min(CONFIG.actionsPerTurn + 1, draft.actionsRemaining + 1);
  draft.chargedActionsRemaining += draft.actionsRemaining > before ? 1 : 0;
  const effectText = applyChargeEffects(draft, playerIndex, charged, chargeTargets);
  addLog(draft, `${player.name}は${charged.name}をチャージし、残りアクションを${before}から${draft.actionsRemaining}に増やした。${effectText}`);
  draft.selected = null;
  draft.pendingTarget = null;
  checkResourceExhaustion(draft);
  checkTurnLimit(draft);
  return charged;
}

export function confirmChargeGuardTargetInDraft(draft: GameState, playerIndex: number, handIndex: number, fieldIndex: number): Card | null {
  draft.pendingTarget = null;
  return chargeHandCardInDraft(draft, playerIndex, handIndex, { guardTargetIndex: fieldIndex });
}

export function confirmChargeReadyAllyTargetInDraft(draft: GameState, playerIndex: number, handIndex: number, fieldIndex: number): Card | null {
  draft.pendingTarget = null;
  return chargeHandCardInDraft(draft, playerIndex, handIndex, { readyTargetIndex: fieldIndex });
}

export function confirmChargeSpendEnemyTargetInDraft(draft: GameState, playerIndex: number, handIndex: number, enemyFieldIndex: number): Card | null {
  draft.pendingTarget = null;
  return chargeHandCardInDraft(draft, playerIndex, handIndex, { spendTargetIndex: enemyFieldIndex });
}

export function confirmChargeRecoverTargetInDraft(draft: GameState, playerIndex: number, handIndex: number, discardIndex: number): Card | null {
  draft.pendingTarget = null;
  return chargeHandCardInDraft(draft, playerIndex, handIndex, { recoverTargetIndex: discardIndex });
}

function applyChargeEffects(
  draft: GameState,
  playerIndex: number,
  charged: Card,
  chargeTargets?: number | null | ChargeTargetOptions,
): string {
  const player = draft.players[playerIndex];
  const opponent = draft.players[1 - playerIndex];
  const guardTargetIndex = chargeTargets && typeof chargeTargets === "object"
    ? chargeTargets.guardTargetIndex
    : chargeTargets;
  const readyTargetIndex = chargeTargets && typeof chargeTargets === "object"
    ? chargeTargets.readyTargetIndex
    : undefined;
  const spendTargetIndex = chargeTargets && typeof chargeTargets === "object"
    ? chargeTargets.spendTargetIndex
    : undefined;
  const recoverTargetIndex = chargeTargets && typeof chargeTargets === "object"
    ? chargeTargets.recoverTargetIndex
    : undefined;
  const texts: string[] = [];
  if (charged.effect === "charge_pressure" && opponent.hand.length >= 3) {
    discardLowPriorityCards(opponent, 1);
    texts.push(`${opponent.name}の手札を1枚トラッシュ。`);
  }
  if (charged.effect === "charge_draw") {
    const drawnCards = drawCards(player, 1);
    texts.push(`${visibleDrawText(player, drawnCards)}。`);
  }
  if (charged.effect === "charge_ready_ally") {
    const targetIndex = readyTargetIndex ?? highestPowerSpentAi(player);
    if (targetIndex !== null && player.spentFieldIndexes.has(targetIndex) && player.field[targetIndex]) {
      player.spentFieldIndexes.delete(targetIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(targetIndex);
      texts.push(`${player.field[targetIndex].name}を回復した。`);
    }
  }
  if (charged.effect === "charge_guard") {
    const targetIndex = guardTargetIndex ?? highestPowerFieldAi(player);
    if (targetIndex !== null && player.field[targetIndex]) {
      player.chargeGuardedFieldIndexes.add(targetIndex);
      texts.push(`${player.field[targetIndex].name}は次の自分ターンまで場防御値+1。`);
    }
  }
  if (charged.effect === "charge_pressure_plus" && opponent.hand.length >= 2) {
    discardLowPriorityCards(opponent, 1);
    texts.push(`${opponent.name}の手札を1枚トラッシュ。`);
  }
  if (charged.effect === "charge_surge_draw" && player.hand.length <= 2) {
    const drawnCards = drawCards(player, 2);
    if (drawnCards.length > 0) texts.push(`${visibleDrawText(player, drawnCards)}。`);
  }
  if (charged.effect === "charge_spend_enemy") {
    const targetIndex = spendTargetIndex ?? highestPowerReadyAi(opponent);
    if (targetIndex !== null && opponent.field[targetIndex] && !opponent.spentFieldIndexes.has(targetIndex)) {
      opponent.spentFieldIndexes.add(targetIndex);
      texts.push(`${opponent.name}の${opponent.field[targetIndex].name}を消耗。`);
    }
  }
  if (charged.effect === "charge_recover_discard" && player.hand.length <= 2) {
    const recoverIndex = recoverTargetIndex ?? highestPowerAiInDiscard(player, charged);
    const recovered = recoverIndex !== null ? player.discard[recoverIndex] : null;
    if (recovered && recovered !== charged && recovered.type === "ai") {
      player.discard.splice(recoverIndex!, 1);
      player.hand.push(recovered);
      markKnownHandCard(player, recovered);
      texts.push(`${recovered.name}をトラッシュから回収。`);
      const urnDrawnCards = applyEchoUrnDraw(player);
      if (urnDrawnCards.length > 0) texts.push(`${player.memory!.name}で${visibleDrawText(player, urnDrawnCards)}。`);
    }
  }
  if (charged.effect === "charge_spend_enemy_ready_ally") {
    // 旋風転身術と同じ自動対象規則: 消耗は相手の最高power未消耗、回復は自分の最高power消耗中。
    // チャージしたカード自身は場に出ていないため、回復対象になることはない。
    const spendIndex = spendTargetIndex ?? highestPowerReadyAi(opponent);
    if (spendIndex !== null && opponent.field[spendIndex] && !opponent.spentFieldIndexes.has(spendIndex)) {
      opponent.spentFieldIndexes.add(spendIndex);
      texts.push(`${opponent.name}の${opponent.field[spendIndex].name}を消耗。`);
    }
    const readyIndex = readyTargetIndex ?? highestPowerSpentAi(player);
    if (readyIndex !== null && player.field[readyIndex] && player.spentFieldIndexes.has(readyIndex)) {
      player.spentFieldIndexes.delete(readyIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(readyIndex);
      texts.push(`${player.field[readyIndex].name}を回復した。`);
    }
  }
  if (charged.effect === "charge_recover_discard_any") {
    // AI-EARTH-1C と同じ裁定: チャージした自分自身は回収対象にできない（手札枚数条件はなし）
    const recoverIndex = recoverTargetIndex ?? highestPowerAiInDiscard(player, charged);
    const recovered = recoverIndex !== null ? player.discard[recoverIndex] : null;
    if (recovered && recovered !== charged && recovered.type === "ai") {
      player.discard.splice(recoverIndex!, 1);
      player.hand.push(recovered);
      markKnownHandCard(player, recovered);
      texts.push(`${recovered.name}をトラッシュから回収。`);
      const urnDrawnCards = applyEchoUrnDraw(player);
      if (urnDrawnCards.length > 0) texts.push(`${player.memory!.name}で${visibleDrawText(player, urnDrawnCards)}。`);
    }
  }
  if (charged.effect === "charge_draw_if_discard_ai" && player.discard.some((card) => card !== charged && card.type === "ai")) {
    const drawnCards = drawCards(player, 1);
    if (drawnCards.length > 0) texts.push(`${visibleDrawText(player, drawnCards)}。`);
  }
  if (charged.effect === "charge_filter_draw") {
    const drawnCards = drawCards(player, 2);
    if (drawnCards.length > 0) texts.push(`${visibleDrawText(player, drawnCards)}。`);
    if (player.hand.length > 0) {
      const discarded = discardLowPriorityCards(player, 1);
      if (discarded.length > 0) texts.push(`${discarded[0].name}をトラッシュへ送った。`);
    }
  }
  if (charged.effect === "charge_pressure_any" && opponent.hand.length >= 1) {
    discardLowPriorityCards(opponent, 1);
    texts.push(`${opponent.name}の手札を1枚トラッシュ。`);
  }
  if (charged.effect === "charge_spend_all_enemies") {
    const spentNames: string[] = [];
    opponent.field.forEach((card, index) => {
      if (!opponent.spentFieldIndexes.has(index)) {
        opponent.spentFieldIndexes.add(index);
        spentNames.push(card.name);
      }
    });
    if (spentNames.length > 0) texts.push(`${opponent.name}の${spentNames.join("、")}をすべて消耗。`);
  }
  if (player.memory?.effect === "resonator" && player.hand.length <= 2) {
    const drawnCards = drawCards(player, 1);
    texts.push(`${player.memory.name}で${visibleDrawText(player, drawnCards)}。`);
  }
  if (player.memory?.effect === "storm_core") {
    const stormTargetIndex = highestPowerReadyAi(opponent);
    if (stormTargetIndex !== null) {
      opponent.spentFieldIndexes.add(stormTargetIndex);
      texts.push(`${player.memory.name}で${opponent.name}の${opponent.field[stormTargetIndex].name}を消耗。`);
    }
  }
  return texts.length > 0 ? ` ${texts.join(" ")}` : "";
}

export function applyPlayEffects(
  draft: GameState,
  player: PlayerState,
  card: Card,
  fieldIndex: number,
  actionCost: number,
  excludedRecoverCard?: Card,
  effects: GameActionEffects = {},
): string {
  let text = "";
  if (CONFIG.power3EntersSpent && card.power === 3) {
    player.spentFieldIndexes.add(fieldIndex);
    text += " 出たターンは消耗。";
  }
  if (CONFIG.power4EntersSpent && card.power === 4) {
    player.spentFieldIndexes.add(fieldIndex);
    text += " 出たターンは消耗。";
  }
  if (entersSpentOnPlay(card)) {
    player.spentFieldIndexes.add(fieldIndex);
    text += " 代償として消耗で出た。";
  }
  if (CONFIG.power3DiscardsOnPlay && card.power === 3) {
    const discarded = discardLowPriorityCards(player, 1);
    if (discarded.length > 0) {
      text += ` 代償として${cardNameList(discarded)}をトラッシュへ送った。`;
    }
  }
  if (selfDamagesOnPlay(card)) {
    dealLifeDamage(player);
    text += " 代償として自分に1ダメージ。";
  }
  if (opponentDrawsOnPlay(card)) {
    const playerIndex = draft.players.indexOf(player);
    const opponent = playerIndex >= 0 ? draft.players[1 - playerIndex] : null;
    if (opponent) {
      const drawnCards = drawCards(opponent, 1);
      text += ` 代償として${opponent.name}は${visibleDrawText(opponent, drawnCards)}。`;
    }
  }
  if (trashesEnemyMemoryOnPlay(card)) {
    const playerIndex = draft.players.indexOf(player);
    const opponent = playerIndex >= 0 ? draft.players[1 - playerIndex] : null;
    if (opponent?.memory) {
      if (player.isHuman) {
        draft.pendingTarget = {
          kind: "confirm",
          reason: "relic-thief-trash",
          playerIndex: draft.players.indexOf(player),
          fieldIndex,
          title: `${card.name}の効果を選択`,
          prompt: `${opponent.name}の${opponent.memory.name}をトラッシュへ送ってもよい。送った場合、この召喚獣は消耗する。`,
          confirmLabel: "トラッシュへ送る",
          cancelLabel: "送らない",
          actionCost,
          cancelable: true,
        };
        text += " 相手の遺物をトラッシュへ送るか選択。";
      } else {
        const trashed = trashMemory(opponent);
        if (trashed) {
          player.spentFieldIndexes.add(fieldIndex);
          text += ` ${opponent.name}の${trashed.name}をトラッシュへ送った。代償として消耗した。`;
        }
      }
    }
  }
  if (card.effect === "draw_on_play_if_discard_4" && player.discard.length >= 4) {
    const drawnCards = drawCards(player, 1);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
  }
  if (recoversMemoryOnPlay(card)) {
    const memoryIndex = bestMemoryInDiscard(player);
    if (memoryIndex !== null) {
      const recovered = player.discard.splice(memoryIndex, 1)[0];
      player.hand.push(recovered);
      markKnownHandCard(player, recovered);
      text += ` ${recovered.name}をトラッシュから回収。`;
      const urnDrawnCards = applyEchoUrnDraw(player);
      if (urnDrawnCards.length > 0) text += ` ${player.memory!.name}で${visibleDrawText(player, urnDrawnCards)}。`;
    }
  }
  if (CONFIG.power1DrawsOnPlay && drawsOnPlay(card)) {
    const drawnCards = drawCards(player, 1);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
  }
  if (filtersOnPlay(card)) {
    const drawnCards = drawCards(player, 2);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
    if (player.hand.length > 0) {
      if (player.isHuman) {
        draft.pendingTarget = {
          kind: "card-select",
          reason: "filter-discard",
          zone: "hand",
          playerIndex: draft.players.indexOf(player),
          title: `${card.name}でトラッシュへ送るカードを選択`,
          prompt: `登場時効果で${visibleDrawText(player, drawnCards)}。手札からトラッシュへ送るカードを1枚選んでください。`,
          confirmLabel: "このカードを送る",
          min: 1,
          max: 1,
          excludeIndexes: [],
          selectedIndexes: [],
          actionCost,
          cancelable: false,
        };
        text += " トラッシュへ送るカードを選択。";
      } else {
        const discardIndex = lowestPriorityHand(player);
        const discarded = player.hand.splice(discardIndex, 1)[0];
        player.discard.push(discarded);
        text += ` ${discarded.name}をトラッシュへ送った。`;
      }
    }
  }
  if (spendsEnemyOnPlay(card)) {
    const playerIndex = draft.players.indexOf(player);
    const opponent = playerIndex >= 0 ? draft.players[1 - playerIndex] : null;
    if (opponent) {
      const targetIndex = highestPowerReadyAi(opponent);
      if (targetIndex !== null) {
        if (player.isHuman) {
          draft.pendingTarget = {
            kind: "card-select",
            reason: "spend-enemy",
            zone: "field",
            playerIndex: 1 - playerIndex,
            title: `${card.name}の対象を選択`,
            prompt: "消耗させる相手の未消耗召喚獣を1体選んでください。",
            confirmLabel: "この召喚獣を消耗",
            min: 1,
            max: 1,
            excludeIndexes: opponent.field.map((_, index) => opponent.spentFieldIndexes.has(index) ? index : -1).filter((index) => index >= 0),
            selectedIndexes: [],
            actionCost,
            cancelable: false,
          };
          text += " 消耗させる相手を選択。";
        } else {
          opponent.spentFieldIndexes.add(targetIndex);
          text += ` ${opponent.name}の${opponent.field[targetIndex].name}を消耗。`;
        }
      }
    }
  }
  if (recoversAiOnPlay(card) && player.hand.length <= 1) {
    const targetIndex = highestPowerAiInDiscard(player, excludedRecoverCard);
    if (targetIndex !== null) {
      if (player.isHuman) {
        const excludedRecoverIndex = excludedRecoverCard ? player.discard.indexOf(excludedRecoverCard) : -1;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "recover-on-play",
          zone: "discard",
          playerIndex: draft.players.indexOf(player),
          title: `${card.name}で回収するカードを選択`,
          prompt: "トラッシュから回収する召喚獣を1枚選んでください。",
          confirmLabel: "このカードを回収",
          min: 1,
          max: 1,
          excludeIndexes: player.discard
            .map((discarded, index) => (discarded.type !== "ai" || index === excludedRecoverIndex ? index : -1))
            .filter((index) => index >= 0),
          selectedIndexes: [],
          actionCost,
          cancelable: false,
        };
        text += " トラッシュから回収するカードを選択。";
      } else {
        const recovered = player.discard.splice(targetIndex, 1)[0];
        player.hand.push(recovered);
        markKnownHandCard(player, recovered);
        text += ` ${recovered.name}をトラッシュから回収。`;
        effects.showDuelEvent?.({
          kind: "trash",
          title: `${card.name}の回収`,
          detail: `${recovered.name}をトラッシュから手札に戻しました。`,
          fromLabel: "トラッシュ",
          toLabel: "手札",
          tone: player.isHuman ? "magenta" : "cyan",
          cards: [{ card: recovered, label: "回収", state: "winner" }],
          rivalVoiceLine: player.isHuman ? undefined : "play_summon",
        });
      }
    }
  }
  if (readiesAllyOnPlay(card)) {
    // 自分自身（今出したカード。消耗で出る効果を含む）は回復対象から除外する
    const candidates = [...player.spentFieldIndexes]
      .filter((index) => index !== fieldIndex && player.field[index])
      .map((index) => ({ card: player.field[index], index }))
      .sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
    const targetIndex = candidates[0]?.index ?? null;
    if (targetIndex !== null) {
      if (player.isHuman) {
        draft.pendingTarget = {
          kind: "card-select",
          reason: "ready-ally",
          zone: "field",
          playerIndex: draft.players.indexOf(player),
          title: `${card.name}で回復する召喚獣を選択`,
          prompt: "消耗から回復する自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を回復する",
          min: 1,
          max: 1,
          excludeIndexes: player.field.map((_, index) => (player.spentFieldIndexes.has(index) && index !== fieldIndex) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          actionCost,
          cancelable: false,
        };
        text += " 回復する召喚獣を選択。";
      } else {
        player.spentFieldIndexes.delete(targetIndex);
        player.power3RecoveryDelayedFieldIndexes.delete(targetIndex);
        text += ` ${player.field[targetIndex].name}を回復した。`;
      }
    }
  }
  if (player.memory?.effect === "pipeline" && card.power === 1 && !player.pipelineUsed) {
    player.pipelineUsed = true;
    const drawnCards = drawCards(player, 1);
    text += ` ${player.memory.name}で${visibleDrawText(player, drawnCards)}。`;
  }
  return text;
}

export function useCommandAtInDraft(
  draft: GameState,
  sourceIndex: number,
  targetIndex: number | null,
  discardIndexes: number[] = [],
  effects: GameActionEffects = {},
  secondaryTargetIndex: number | null = null,
): void {
  const player = activePlayer(draft);
  const opponent = opponentPlayer(draft);
  const command = player.hand[sourceIndex];
  if (!command || command.type !== "event") return;
  if (!commandUsable(draft, command, player, opponent)) return;
  if (command.effect === "purge") {
    // 対象が不正（未消耗・範囲外）の場合はカードを消費せず中断する
    const purgeTarget = targetIndex ?? highestPowerSpentAi(opponent);
    if (purgeTarget === null || !opponent.field[purgeTarget] || !opponent.spentFieldIndexes.has(purgeTarget)) return;
  }
  if (command.effect === "grave_call") {
    // 対象が不正（power 4以上・召喚獣以外・場が満杯）の場合はカードを消費せず中断する
    const reviveTarget = targetIndex ?? bestReviveTargetInDiscard(player);
    if (
      reviveTarget === null
      || player.discard[reviveTarget]?.type !== "ai"
      || (player.discard[reviveTarget].power ?? 0) > 2
      || player.field.length >= CONFIG.fieldLimit
    ) return;
  }
  const relearnTarget = command.effect === "relearn" ? targetIndex ?? highestPowerAiInDiscard(player) : null;
  const salvageTarget = command.effect === "salvage" ? targetIndex ?? bestEventInDiscard(player) : null;
  const graveCallTarget = command.effect === "grave_call" ? targetIndex ?? bestReviveTargetInDiscard(player) : null;
  let deferredTarget: PendingTarget = null;
  const selectedDiscardCards = discardIndexes.length > 0
    ? discardHandCards(draft, draft.active, discardIndexes)
    : [];
  const commandIndex = player.hand.indexOf(command);
  if (commandIndex < 0) return;
  const used = player.hand.splice(commandIndex, 1)[0];
  player.discard.push(used);
  let text = `${player.name}は${used.name}を発動。`;
  const playerIndex = draft.players.indexOf(player);
  const opponentIndex = draft.players.indexOf(opponent);
  let impact: { kind: "life-damage"; sourcePlayerIndex: number | null; targetPlayerIndex: number; amount: number; fatal?: boolean } | undefined;
  const trinityTrashed: Card[] = [];
  if (used.effect === "optimize") {
    const discarded = selectedDiscardCards.length > 0
      ? selectedDiscardCards
      : discardLowPriorityCards(player, 1);
    const drawnCards = drawCards(player, 2);
    text += ` ${cardNameList(discarded)}をトラッシュへ送り、${visibleDrawText(player, drawnCards)}。`;
  } else if (used.effect === "patch") {
    const target = targetIndex ?? highestPowerSpentAi(player);
    if (target !== null) {
      player.spentFieldIndexes.delete(target);
      player.power3RecoveryDelayedFieldIndexes.delete(target);
      text += ` ${player.field[target].name}を回復した。`;
    }
    const drawnCards = drawCards(player, 1);
    if (drawnCards.length > 0) {
      text += ` ${visibleDrawText(player, drawnCards)}。`;
    }
  } else if (used.effect === "disrupt") {
    const resolvedTarget = targetIndex ?? highestPowerReadyAi(opponent);
    if (resolvedTarget !== null) {
      opponent.spentFieldIndexes.add(resolvedTarget);
      text += ` ${opponent.name}の${opponent.field[resolvedTarget].name}を消耗。`;
    }
  } else if (used.effect === "purge") {
    const resolvedTarget = targetIndex ?? highestPowerSpentAi(opponent);
    if (resolvedTarget !== null && opponent.field[resolvedTarget] && opponent.spentFieldIndexes.has(resolvedTarget)) {
      const purged = removeFieldStack(opponent, resolvedTarget);
      opponent.discard.push(...purged);
      text += ` ${opponent.name}の${purged[0].name}を${purged.length > 1 ? "重ねたカードごと" : ""}トラッシュへ送った。`;
    }
  } else if (used.effect === "relearn") {
    if (relearnTarget !== null) {
      const fuel = selectedDiscardCards.length > 0
        ? selectedDiscardCards
        : discardLowPriorityCards(player, 1);
      const recovered = player.discard.splice(relearnTarget, 1)[0];
      player.hand.push(recovered);
      markKnownHandCard(player, recovered);
      if (fuel.length > 0) text += ` ${fuel[0].name}を代償としてトラッシュへ送った。`;
      text += ` ${recovered.name}をトラッシュから回収。`;
      const urnDrawnCards = applyEchoUrnDraw(player);
      if (urnDrawnCards.length > 0) text += ` ${player.memory!.name}で${visibleDrawText(player, urnDrawnCards)}。`;
    }
  } else if (used.effect === "sandbox") {
    player.sandboxShield = 1;
    text += " このターン、次のpower 4攻撃後退場を1回防ぐ。";
  } else if (used.effect === "trinity") {
    for (let index = player.field.length - 1; index >= 0; index -= 1) {
      trinityTrashed.unshift(...removeFieldStack(player, index));
    }
    player.discard.push(...trinityTrashed);
    dealLifeDamage(opponent);
    impact = { kind: "life-damage", sourcePlayerIndex: playerIndex >= 0 ? playerIndex : null, targetPlayerIndex: opponentIndex, amount: 1, fatal: opponent.life <= 0 };
    text += ` ${cardNameList(trinityTrashed)}をすべてトラッシュし、${opponent.name}のライフを1減らした。`;
  } else if (used.effect === "fire_rite") {
    if (!hasAttributeAi(player, "火")) return;
    const discarded = discardLowPriorityCards(opponent, 1);
    if (discarded.length > 0) {
      text += ` ${opponent.name}の手札を1枚トラッシュ。`;
    } else {
      dealLifeDamage(opponent);
      impact = { kind: "life-damage", sourcePlayerIndex: playerIndex >= 0 ? playerIndex : null, targetPlayerIndex: opponentIndex, amount: 1, fatal: opponent.life <= 0 };
      text += ` ${opponent.name}の手札がないため、ライフを1減らした。`;
    }
  } else if (used.effect === "water_rite") {
    if (!hasAttributeAi(player, "水")) return;
    const drawnCards = drawCards(player, 2);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
  } else if (used.effect === "wind_rite") {
    if (!hasAttributeAi(player, "風")) return;
    const disruptedIndex = targetIndex ?? highestPowerReadyAi(opponent);
    const readiedIndex = secondaryTargetIndex ?? highestPowerSpentAiByAttribute(player, "風");
    if (disruptedIndex !== null && opponent.field[disruptedIndex] && !opponent.spentFieldIndexes.has(disruptedIndex)) {
      opponent.spentFieldIndexes.add(disruptedIndex);
      text += ` ${opponent.name}の${opponent.field[disruptedIndex].name}を消耗。`;
    }
    if (readiedIndex !== null && player.field[readiedIndex] && hasAttribute(player.field[readiedIndex], "風") && player.spentFieldIndexes.has(readiedIndex)) {
      player.spentFieldIndexes.delete(readiedIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(readiedIndex);
      text += ` ${player.field[readiedIndex].name}を回復した。`;
    }
  } else if (used.effect === "earth_rite") {
    if (!hasAttributeAi(player, "土")) return;
    const recoverIndex = targetIndex ?? highestPowerAiInDiscard(player);
    if (recoverIndex !== null && player.discard[recoverIndex]?.type === "ai") {
      const recovered = player.discard.splice(recoverIndex, 1)[0];
      player.hand.push(recovered);
      markKnownHandCard(player, recovered);
      text += ` ${recovered.name}をトラッシュから回収。`;
      const urnDrawnCards = applyEchoUrnDraw(player);
      if (urnDrawnCards.length > 0) text += ` ${player.memory!.name}で${visibleDrawText(player, urnDrawnCards)}。`;
    }
  } else if (used.effect === "comeback_rite") {
    const readyIndex = targetIndex ?? highestPowerSpentAi(player);
    if (readyIndex !== null && player.field[readyIndex] && player.spentFieldIndexes.has(readyIndex)) {
      player.spentFieldIndexes.delete(readyIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(readyIndex);
      text += ` ${player.field[readyIndex].name}を回復した。`;
    }
    const drawnCards = drawCards(player, 2);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
  } else if (used.effect === "war_cry") {
    addTurnGlobalAttackBonus(player, 1);
    text += " このターン、自分の召喚獣すべては戦闘時、攻撃値+1。";
  } else if (used.effect === "tide_edge") {
    if (!hasAttributeAi(player, "水")) return;
    const buffTarget = targetIndex ?? highestPowerReadyAi(player) ?? highestPowerFieldAi(player);
    if (buffTarget !== null && player.field[buffTarget]) {
      addTurnFieldAttackBonus(player, buffTarget, 2);
      text += ` このターン、${player.field[buffTarget].name}は戦闘時、攻撃値+2。`;
    }
  } else if (used.effect === "pierce_sight") {
    setNextAttackUnblockable(player);
    text += " このターン、自分の次の攻撃は手札防御されない。";
  } else if (used.effect === "grave_call") {
    if (graveCallTarget !== null) {
      const revived = reviveAiFromDiscard(player, graveCallTarget);
      if (revived) text += ` ${revived.name}を消耗状態で場に出した。`;
    }
  } else if (used.effect === "salvage") {
    if (salvageTarget !== null && player.discard[salvageTarget]?.type === "event" && player.discard[salvageTarget].effect !== "salvage") {
      const recovered = player.discard.splice(salvageTarget, 1)[0];
      player.hand.push(recovered);
      markKnownHandCard(player, recovered);
      text += ` ${recovered.name}をトラッシュから回収。`;
      const urnDrawnCards = applyEchoUrnDraw(player);
      if (urnDrawnCards.length > 0) text += ` ${player.memory!.name}で${visibleDrawText(player, urnDrawnCards)}。`;
    }
  } else if (used.effect === "overdrive") {
    const drawnCards = drawCards(player, 2);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
  } else if (used.effect === "relic_crush") {
    if (opponent.memory) {
      const trashed = trashMemory(opponent);
      if (trashed) text += ` ${opponent.name}の${trashed.name}をトラッシュへ送った。`;
    }
  } else if (used.effect === "deep_current") {
    if (player.field.filter((card) => hasAttribute(card, "水")).length < 2) return;
    const drawnCards = drawCards(player, 3);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
    if (player.hand.length > 0) {
      if (player.isHuman) {
        deferredTarget = {
          kind: "card-select",
          reason: "deep-current-discard",
          zone: "hand",
          playerIndex: draft.players.indexOf(player),
          title: `${used.name}でトラッシュへ送るカードを選択`,
          prompt: "手札からトラッシュへ送るカードを1枚選んでください。",
          confirmLabel: "このカードを送る",
          min: 1,
          max: 1,
          excludeIndexes: [],
          selectedIndexes: [],
          actionCost: 1,
          cancelable: false,
        };
        text += " トラッシュへ送るカードを選択。";
      } else {
        const discarded = discardLowPriorityCards(player, 1);
        if (discarded.length > 0) text += ` ${discarded[0].name}をトラッシュへ送った。`;
      }
    }
  }
  addLog(draft, text);
  effects.showDuelEvent?.({
    kind: "command",
    title: `${player.name}の術式`,
    detail: text,
    fromLabel: "手札",
    toLabel: used.effect === "trinity" ? "場 / トラッシュ / ライフ" : "トラッシュ",
    tone: player.isHuman ? "magenta" : "cyan",
    impact,
    rivalVoiceLine: player.isHuman ? undefined : "command",
    cards: [
      ...(used.effect === "trinity"
        ? trinityTrashed.map((card) => ({ card, label: "犠牲", state: "trash" as const }))
        : [{ card: used, label: "使用", state: "trash" as const }]),
    ],
  });
  draft.selected = null;
  draft.pendingTarget = deferredTarget;
  if (!deferredTarget) afterAction(draft);
}

export function beginAttackInDraft(
  draft: GameState,
  attackerIndex: number,
  fieldIndex: number,
  effects: GameActionEffects = {},
  aiDefenseOverride?: DefenseChoice,
): void {
  const attacker = draft.players[attackerIndex];
  const defenderIndex = 1 - attackerIndex;
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  if (attackerIndex === draft.active && !canActivePlayerAttackOpponent(draft)) return;
  if (!attackCard || attacker.spentFieldIndexes.has(fieldIndex)) return;
  if (attackerIndex === draft.active) attacker.playerAttacksThisTurn += 1;
  addLog(draft, `${attacker.name}は${attackCard.name}で攻撃。`);
  if (defender.isHuman) {
    effects.showDuelEvent?.({
      kind: "battle",
      title: `${attacker.name}が攻撃`,
      detail: `${attackCard.name}で攻撃。防御カードを選択してください。`,
      fromLabel: "場",
      toLabel: "防御選択",
      resultLabel: "攻撃宣言",
      tone: "warning",
      rivalVoiceLine: attacker.isHuman ? undefined : "attack",
      cards: [{ card: attackCard, label: "攻撃", state: "neutral" }],
    });
  }
  if (CONFIG.exhaustAfterAttack && !keepsReadyAfterAttack(attackCard)) {
    attacker.spentFieldIndexes.add(fieldIndex);
    if (CONFIG.power3AttackRecoveryDelay && attackCard.power === 3) {
      attacker.power3RecoveryDelayedFieldIndexes.add(fieldIndex);
    }
  }
  draft.pendingAttack = { attackerIndex, defenderIndex, fieldIndex };
  draft.selected = null;
  if (!defender.isHuman) {
    const attackContext = { attacker, attackerFieldIndex: fieldIndex };
    resolveDefenseInDraft(draft, aiDefenseOverride ?? chooseAiDefense(defender, attackCard, defender.aiProfile, attackContext), effects);
  }
}

export function resolveDefenseInDraft(
  draft: GameState,
  choice: DefenseChoice,
  effects: GameActionEffects = {},
): void {
  const pending = draft.pendingAttack;
  if (!pending) return;
  if (pending.strikeTargetIndex !== undefined) {
    const strikeAttackCard = draft.players[pending.attackerIndex].field[pending.fieldIndex];
    const strikeDefender = draft.players[pending.defenderIndex];
    if (!strikeAttackCard) return;
    const strikeAttackContext = { attacker: draft.players[pending.attackerIndex], attackerFieldIndex: pending.fieldIndex };
    if (choice.type === "field") {
      const defenseCard = strikeDefender.field[choice.index];
      if (!defenseCard || !legalStrikeFieldDefenders(strikeDefender, strikeAttackCard, pending.strikeTargetIndex, strikeAttackContext).some((option) => option.index === choice.index)) return;
      draft.pendingTarget = null;
      if (strikeDefender.isHuman && needsFirewallFuel(strikeDefender, defenseCard, strikeAttackCard, choice.index, strikeAttackContext) && choice.firewallDiscardIndex === undefined) {
        const baseCanDefend = canDefend(strikeAttackCard, defenseCard, strikeDefender, { fieldIndex: choice.index, attackContext: strikeAttackContext });
        draft.pendingTarget = {
          kind: "hand-discard",
          reason: "firewall",
          playerIndex: pending.defenderIndex,
          title: `${strikeDefender.memory!.name}でトラッシュへ送るカードを選択`,
          prompt: baseCanDefend
            ? "他属性防御で power +1 できます。使うなら手札を1枚選んでください。"
            : "他属性防御で power +1 しないと防御できません。手札を1枚選んでください。",
          min: baseCanDefend ? 0 : 1,
          max: 1,
          excludeIndexes: [],
          selectedIndexes: [],
          fieldIndex: choice.index,
          actionCost: 1,
          cancelable: true,
        };
        return;
      }
      resolveStrikeFieldDefenseInDraft(draft, pending.attackerIndex, pending.fieldIndex, pending.strikeTargetIndex, choice.index, effects, choice.firewallDiscardIndex);
    } else if (choice.type === "hand") {
      const defenseCard = CONFIG.setDefenseEnabled && choice.index === -1 ? strikeDefender.setDefenseCard : strikeDefender.hand[choice.index];
      if (!defenseCard || !legalHandDefenders(strikeDefender, strikeAttackCard, strikeAttackContext).some((option) => option.index === choice.index)) return;
      resolveStrikeHandDefenseInDraft(draft, pending.attackerIndex, pending.fieldIndex, pending.strikeTargetIndex, choice.index, effects);
    } else if (choice.type === "none") {
      resolveStrikeOutcomeInDraft(draft, pending.attackerIndex, pending.fieldIndex, pending.strikeTargetIndex, effects);
      if (draft.winner === null && !draft.draw) {
        draft.active = pending.attackerIndex;
      }
    }
    return;
  }
  const { attackerIndex, defenderIndex, fieldIndex } = pending;
  const attacker = draft.players[attackerIndex];
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  if (!attackCard) return;
  const attackContext = { attacker, attackerFieldIndex: fieldIndex };

  if (choice.type === "field") {
    const defenseCard = defender.field[choice.index];
    if (!defenseCard || !legalFieldDefenders(defender, attackCard, attackContext).some((option) => option.index === choice.index)) return;
    draft.pendingTarget = null;
    if (defender.isHuman && needsFirewallFuel(defender, defenseCard, attackCard, choice.index, attackContext) && choice.firewallDiscardIndex === undefined) {
      const baseCanDefend = canDefend(attackCard, defenseCard, defender, { fieldIndex: choice.index, attackContext });
      draft.pendingTarget = {
        kind: "hand-discard",
        reason: "firewall",
        playerIndex: defenderIndex,
        title: `${defender.memory!.name}でトラッシュへ送るカードを選択`,
        prompt: baseCanDefend
          ? "他属性防御で power +1 できます。使うなら手札を1枚選んでください。"
          : "防御成功には他属性防御の power +1 が必要です。使うなら手札を1枚選んでください。",
        min: 0,
        max: 1,
        excludeIndexes: [],
        selectedIndexes: [],
        fieldIndex: choice.index,
        actionCost: 1,
        cancelable: true,
      };
      return;
    }
    const firewallFuel = typeof choice.firewallDiscardIndex === "number"
      ? discardHandCards(draft, defenderIndex, [choice.firewallDiscardIndex])[0]
      : choice.firewallDiscardIndex === null
        ? null
        : discardFirewallFuel(defender, defenseCard, attackCard, choice.index, attackContext);
    const defenseValue = defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid: Boolean(firewallFuel), fieldIndex: choice.index, attackContext });
    const attackValue = attackCombatValue(attackCard, attackContext);
    const blocked = defenseValue >= attackValue;
    const isTrade = defenseValue === attackValue;
    const isFailure = defenseValue < attackValue;
    const fuelText = firewallFuel ? ` ${defender.memory!.name}で${firewallFuel.name}をトラッシュ。` : "";
    const defenseDrawnCards = drawsOnSuccessfulDefense(defenseCard) ? drawCards(defender, 1) : [];
    let defenseRecoverText = "";
    if (recoversAiOnSuccessfulDefense(defenseCard)) {
      const recoverIndex = highestPowerAiInDiscard(defender, defenseCard);
      if (recoverIndex !== null) {
        const recovered = defender.discard.splice(recoverIndex, 1)[0];
        defender.hand.push(recovered);
        markKnownHandCard(defender, recovered);
        defenseRecoverText = `${defenseCard.name}の効果で${defender.name}は${recovered.name}をトラッシュから回収。`;
        const urnDrawnCards = applyEchoUrnDraw(defender);
        if (urnDrawnCards.length > 0) defenseRecoverText += ` ${defender.memory!.name}で${visibleDrawText(defender, urnDrawnCards)}。`;
      }
    }
    const mirrorDrawnCards = defender.memory?.effect === "tidal_mirror" ? drawCards(defender, 1) : [];
    const damage = isFailure ? Math.max(0, attackValue - defenseValue) : 0;
    if (damage > 0) dealLifeDamage(defender, damage);
    const breakDrawnCards = damage > 0 && CONFIG.drawOnAttackDamage !== "none"
      ? drawCards(defender, CONFIG.drawOnAttackDamage === "event" ? 1 : damage)
      : [];
    const bannerDrawnCards = damage > 0 ? applyWarBannerDraw(attacker) : [];
    const chargeCompensated = damage > 0 ? applyAttackChargeCompensation(draft, attacker) : false;
    const shouldChoosePressureDiscard = blocked && pressuresOnBlock(attackCard) && defender.isHuman && defender.hand.length > 0;
    const pressureDiscarded = blocked && pressuresOnBlock(attackCard) && !shouldChoosePressureDiscard
      ? discardLowPriorityCards(defender, 1)[0] ?? null
      : null;
    const blockedDrawnCards = blocked && drawsOnBlockedAttack(attackCard) ? drawCards(attacker, 1) : [];
    const extraText = [
      defenseDrawnCards.length > 0 ? `${defenseCard.name}の効果で${defender.name}は${visibleDrawText(defender, defenseDrawnCards)}。` : "",
      defenseRecoverText,
      mirrorDrawnCards.length > 0 ? `${defender.memory?.name ?? "遺物"}で${defender.name}は${visibleDrawText(defender, mirrorDrawnCards)}。` : "",
      pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}をトラッシュへ送った。` : "",
      blockedDrawnCards.length > 0 ? `${attackCard.name}の効果で${attacker.name}は${visibleDrawText(attacker, blockedDrawnCards)}。` : "",
      breakDrawnCards.length > 0 ? `ブレイクドローで${defender.name}は${visibleDrawText(defender, breakDrawnCards)}。` : "",
      bannerDrawnCards.length > 0 ? `${attacker.memory?.name ?? "遺物"}で${attacker.name}は${visibleDrawText(attacker, bannerDrawnCards)}。` : "",
      chargeCompensated ? `${attacker.name}は攻撃補償で+1チャージ。` : "",
    ].filter(Boolean).join(" ");
    addLog(
      draft,
      isFailure
        ? `${defender.name}は場の${defenseCard.name}で防御したが、攻撃を止められなかった。防御値${defenseValue}が攻撃値${attackValue}を下回り、${defenseCard.name}はトラッシュ。${defender.name}は${damage}ダメージ。${fuelText}${extraText ? ` ${extraText}` : ""}`
        : isTrade
        ? `${defender.name}は場の${defenseCard.name}で防御成功。防御値${defenseValue}と攻撃値${attackValue}が同値で相打ち。両方トラッシュ。${fuelText}${extraText ? ` ${extraText}` : ""}`
        : `${defender.name}は場の${defenseCard.name}で防御成功。防御値${defenseValue}が攻撃値${attackValue}を上回り、${attackCard.name}は退場。${defenseCard.name}は場に残って消耗。${fuelText}${extraText ? ` ${extraText}` : ""}`,
    );
    effects.showDuelEvent?.({
      kind: "battle",
      title: isFailure ? "場防御失敗" : isTrade ? "相打ち" : `${defender.name}の防御成功`,
      detail: `${attackCard.name} 攻撃値${attackValue} vs 場の${defenseCard.name} 防御${defenseValue}。${isFailure ? `攻撃は通り、${defender.name}に${damage}ダメージ。防御召喚獣はトラッシュ。` : isTrade ? "同値なので両方トラッシュ。" : "防御側は場に残ります。"}${fuelText}${extraText ? ` ${extraText}` : ""}`,
      fromLabel: `${attacker.name}の場`,
      toLabel: isFailure ? `${defenseCard.name}はトラッシュ` : isTrade ? "両方トラッシュ" : `${attackCard.name}はトラッシュ`,
      resultLabel: isFailure ? "攻撃成功" : isTrade ? "相打ち" : "防御側が残る",
      tone: isFailure ? "danger" : isTrade ? "warning" : defender.isHuman ? "magenta" : "cyan",
      emphasis: isFailure ? "high" : isTrade ? "high" : undefined,
      impact: isFailure ? {
        kind: "life-damage",
        sourcePlayerIndex: attackerIndex,
        targetPlayerIndex: defenderIndex,
        amount: damage,
        fatal: defender.life <= 0,
      } : undefined,
      breakDraw: breakDrawnCards.length > 0 ? { targetPlayerIndex: defenderIndex, count: breakDrawnCards.length } : undefined,
      rivalVoiceLine: defender.isHuman ? undefined : "field_defense",
      cards: [
        { card: attackCard, label: "攻撃", state: isFailure ? "winner" : "trash" },
        { card: defenseCard, label: "防御", state: isFailure || isTrade ? "trash" : "winner" },
      ],
    });
    if (isFailure) {
      defender.discard.push(...removeFieldStack(defender, choice.index));
    } else {
      attacker.discard.push(...removeFieldStack(attacker, fieldIndex));
      if (isTrade) {
        defender.discard.push(...removeFieldStack(defender, choice.index));
      } else {
        defender.spentFieldIndexes.add(choice.index);
      }
    }
    if (isFailure) {
      effects.playSfx?.(damage >= 2 ? "damage-heavy" : "damage");
    } else {
      effects.playSfx?.("block");
    }
    if (shouldChoosePressureDiscard) {
      draft.pendingTarget = {
        kind: "card-select",
        reason: "block-pressure",
        zone: "hand",
        playerIndex: defenderIndex,
        title: `${attackCard.name}の圧でトラッシュへ送るカードを選択`,
        prompt: "攻撃を防いだため、手札からトラッシュへ送るカードを1枚選んでください。",
        confirmLabel: "このカードを送る",
        min: 1,
        max: 1,
        excludeIndexes: [],
        selectedIndexes: [],
        actionCost: 1,
        actionKind: "attack",
        cancelable: false,
      };
    }
  } else if (choice.type === "hand") {
    const defenseCard = CONFIG.setDefenseEnabled && choice.index === -1 ? defender.setDefenseCard : defender.hand[choice.index];
    if (!defenseCard || !legalHandDefenders(defender, attackCard, attackContext).some((option) => option.index === choice.index)) return;
    draft.pendingTarget = null;
    consumeHandDefenseCard(defender, choice.index);
    defender.handDefensesUsed += 1;
    const pierced = piercesHandDefense(attackCard);
    if (pierced) dealLifeDamage(defender);
    const pierceBreakDrawnCards = pierced && CONFIG.drawOnAttackDamage !== "none" ? drawCards(defender, 1) : [];
    const pierceBannerDrawnCards = pierced ? applyWarBannerDraw(attacker) : [];
    const chargeCompensated = pierced ? applyAttackChargeCompensation(draft, attacker) : false;
    const shouldChoosePressureDiscard = !pierced && pressuresOnBlock(attackCard) && defender.isHuman && defender.hand.length > 0;
    const pressureDiscarded = !pierced && pressuresOnBlock(attackCard) && !shouldChoosePressureDiscard
      ? discardLowPriorityCards(defender, 1)[0] ?? null
      : null;
    // 防御された時ドローは手札防御貫通（1ダメージ）と両立する（両方持つカードが収録された場合）
    const blockedDrawnCards = drawsOnBlockedAttack(attackCard) ? drawCards(attacker, 1) : [];
    const extraText = [
      pierced ? `${attackCard.name}の効果で防御されても1ダメージ。` : "",
      pierceBreakDrawnCards.length > 0 ? `ブレイクドローで${defender.name}は${visibleDrawText(defender, pierceBreakDrawnCards)}。` : "",
      pierceBannerDrawnCards.length > 0 ? `${attacker.memory?.name ?? "遺物"}で${attacker.name}は${visibleDrawText(attacker, pierceBannerDrawnCards)}。` : "",
      chargeCompensated ? `${attacker.name}は攻撃補償で+1チャージ。` : "",
      pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}をトラッシュへ送った。` : "",
      blockedDrawnCards.length > 0 ? `${attackCard.name}の効果で${attacker.name}は${visibleDrawText(attacker, blockedDrawnCards)}。` : "",
    ].filter(Boolean).join(" ");
    addLog(draft, `${defender.name}は手札の${defenseCard.name}で攻撃を止めた。${defenseCard.name}はトラッシュへ。${extraText ? ` ${extraText}` : ""}`);
    effects.showDuelEvent?.({
      kind: "battle",
      title: pierced ? "手札防御を貫通" : `${defender.name}の手札防御`,
      detail: `${attackCard.name}の攻撃を手札の${defenseCard.name}で止めました。防御カードはトラッシュへ。${extraText ? ` ${extraText}` : ""}`,
      fromLabel: "手札",
      toLabel: "トラッシュ",
      resultLabel: "攻撃を防御",
      tone: defender.isHuman ? "magenta" : "cyan",
      emphasis: pierced ? undefined : "low",
      impact: pierced ? {
        kind: "life-damage",
        sourcePlayerIndex: attackerIndex,
        targetPlayerIndex: defenderIndex,
        amount: 1,
        fatal: defender.life <= 0,
      } : undefined,
      breakDraw: pierceBreakDrawnCards.length > 0 ? { targetPlayerIndex: defenderIndex, count: pierceBreakDrawnCards.length } : undefined,
      rivalVoiceLine: defender.isHuman ? undefined : "hand_defense",
      cards: [
        { card: attackCard, label: "攻撃", state: "neutral" },
        { card: defenseCard, label: "防御", state: "trash" },
      ],
    });
    if (shouldChoosePressureDiscard) {
      draft.pendingTarget = {
        kind: "card-select",
        reason: "block-pressure",
        zone: "hand",
        playerIndex: defenderIndex,
        title: `${attackCard.name}の圧でトラッシュへ送るカードを選択`,
        prompt: "攻撃を防いだため、手札からトラッシュへ送るカードを1枚選んでください。",
        confirmLabel: "このカードを送る",
        min: 1,
        max: 1,
        excludeIndexes: [],
        selectedIndexes: [],
        actionCost: 1,
        actionKind: "attack",
        cancelable: false,
      };
    }
    effects.playSfx?.("block");
  } else {
    draft.pendingTarget = null;
    const damage = attackDamage(attackCard);
    dealLifeDamage(defender, damage);
    const breakDrawnCards = CONFIG.drawOnAttackDamage === "none"
      ? []
      : drawCards(defender, CONFIG.drawOnAttackDamage === "event" ? 1 : damage);
    const bannerDrawnCards = damage > 0 ? applyWarBannerDraw(attacker) : [];
    const chargeCompensated = damage > 0 ? applyAttackChargeCompensation(draft, attacker) : false;
    const breakText = breakDrawnCards.length > 0 ? ` ブレイクドローで${defender.name}は${visibleDrawText(defender, breakDrawnCards)}。` : "";
    const bannerText = bannerDrawnCards.length > 0 ? ` ${attacker.memory?.name ?? "遺物"}で${attacker.name}は${visibleDrawText(attacker, bannerDrawnCards)}。` : "";
    const compensationText = chargeCompensated ? ` ${attacker.name}は攻撃補償で+1チャージ。` : "";
    addLog(draft, `${defender.name}は防御せず${damage}ダメージ。${breakText}${bannerText}${compensationText}`);
    effects.showDuelEvent?.({
      kind: "damage",
      title: damage >= 3 ? `${defender.name}に強烈な${damage}ダメージ!!` : `${defender.name}に${damage}ダメージ`,
      detail: `${attackCard.name}の攻撃が通りました。${breakText}`,
      fromLabel: `${attacker.name}の場`,
      toLabel: `${defender.name}のライフ`,
      resultLabel: "ダメージ",
      tone: "danger",
      emphasis: damage >= 3 ? "peak" : damage === 2 ? "high" : "low",
      impact: {
        kind: "life-damage",
        sourcePlayerIndex: attackerIndex,
        targetPlayerIndex: defenderIndex,
        amount: damage,
        fatal: defender.life <= 0,
      },
      breakDraw: breakDrawnCards.length > 0 ? { targetPlayerIndex: defenderIndex, count: breakDrawnCards.length } : undefined,
      cards: [{ card: attackCard, label: "攻撃", state: "winner" }],
    });
    effects.playSfx?.(damage >= 2 ? "damage-heavy" : "damage");
  }

  attacker.nextAttackUnblockable = false;
  overheatAttackerIfNeeded(draft, attacker, fieldIndex, attackCard, effects);
  draft.pendingAttack = null;
  checkWinner(draft);
  checkResourceExhaustion(draft);
  if (draft.winner === null && !draft.draw) {
    draft.active = attackerIndex;
    if (!draft.pendingTarget) afterAction(draft, 1, "attack");
  }
}

function overheatAttackerIfNeeded(
  draft: GameState,
  attacker: PlayerState,
  fieldIndex: number,
  attackCard: Card,
  effects: GameActionEffects,
): void {
  const power4Overheats = attackCard.power === 4 && CONFIG.power4OverheatsAfterAttack;
  const power3Overheats = attackCard.power === 3 && CONFIG.power3OverheatsAfterAttack;
  if (!power4Overheats && !power3Overheats) return;
  if (attacker.field[fieldIndex] !== attackCard) return;
  if (power4Overheats && attacker.sandboxShield > 0) {
    attacker.sandboxShield -= 1;
    attacker.spentFieldIndexes.add(fieldIndex);
    addLog(draft, `${attacker.name}は蒼殻バリアで${attackCard.name}の攻撃後退場を防いだ。`);
    return;
  }
  if (returnsAfterOverheat(attackCard)) {
    const [returnedCard, ...stackedCards] = removeFieldStack(attacker, fieldIndex);
    attacker.hand.push(returnedCard);
    markKnownHandCard(attacker, returnedCard);
    attacker.discard.push(...stackedCards);
    addLog(draft, `${attacker.name}の${attackCard.name}は攻撃後、風に乗って手札へ戻った。`);
    return;
  }
  attacker.discard.push(...removeFieldStack(attacker, fieldIndex));
  const drawnCards = drawsTwoAfterOverheat(attackCard)
    ? drawCards(attacker, 2)
    : drawsAfterOverheat(attackCard)
      ? drawCards(attacker, 1)
      : [];
  addLog(draft, `${attacker.name}の${attackCard.name}は攻撃後に力を使い切って退場。${drawnCards.length > 0 ? `${visibleDrawText(attacker, drawnCards)}。` : ""}`);
  effects.showDuelEvent?.({
    kind: "trash",
    title: "攻撃後退場",
    detail: `${attacker.name}の${attackCard.name}は攻撃後にトラッシュへ送られました。`,
    fromLabel: "場",
    toLabel: "トラッシュ",
    resultLabel: "退場",
    tone: "danger",
    cards: [{ card: attackCard, label: "退場", state: "trash" }],
  });
}

export function strikeInDraft(
  draft: GameState,
  attackerIndex: number,
  fieldIndex: number,
  targetIndex: number,
  effects: GameActionEffects = {},
  aiDefenseOverride?: DefenseChoice,
): void {
  if (!CONFIG.monsterCombat) return;
  const attacker = draft.players[attackerIndex];
  const defenderIndex = 1 - attackerIndex;
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  const targetCard = defender.field[targetIndex];
  if (attackerIndex === draft.active && !canActivePlayerAttack(draft)) return;
  if (attackerIndex === draft.active && CONFIG.attackLimitCountsStrike && !canActivePlayerAttackOpponent(draft)) return;
  if (!attackCard || !targetCard || attacker.spentFieldIndexes.has(fieldIndex)) return;
  const attackContext = { attacker, attackerFieldIndex: fieldIndex };
  const { attackValue, defenseValue } = strikeValues(attackCard, defender, targetIndex, attackContext);
  if (attackValue < defenseValue) return;
  if (CONFIG.exhaustAfterAttack && !keepsReadyAfterAttack(attackCard)) {
    attacker.spentFieldIndexes.add(fieldIndex);
    if (CONFIG.power3AttackRecoveryDelay && attackCard.power === 3) {
      attacker.power3RecoveryDelayedFieldIndexes.add(fieldIndex);
    }
  }
  if (attackerIndex === draft.active && CONFIG.attackLimitCountsStrike) attacker.playerAttacksThisTurn += 1;
  if (CONFIG.handDefenseVsStrike !== "off" && aiDefenseOverride?.type !== "none") {
    if (defender.isHuman) {
      if (
        legalStrikeFieldDefenders(defender, attackCard, targetIndex, attackContext).length > 0
        || legalHandDefenders(defender, attackCard, attackContext).length > 0
      ) {
        addLog(draft, `${attacker.name}は${attackCard.name}で${defender.name}の${targetCard.name}を攻撃。`);
        effects.showDuelEvent?.({
          kind: "battle",
          title: `${attacker.name}がモンスター攻撃`,
          detail: `${attackCard.name}が${targetCard.name}を攻撃。手札防御で守るか選択してください。`,
          fromLabel: "場",
          toLabel: "防御選択",
          resultLabel: "モンスター攻撃宣言",
          tone: "warning",
          rivalVoiceLine: attacker.isHuman ? undefined : "attack",
          cards: [
            { card: attackCard, label: "攻撃", state: "neutral" },
            { card: targetCard, label: "対象", state: "neutral" },
          ],
        });
        draft.pendingAttack = { attackerIndex, defenderIndex, fieldIndex, strikeTargetIndex: targetIndex };
        draft.selected = null;
        return;
      }
    } else {
      const interceptFieldIndex = aiDefenseOverride?.type === "field"
        ? aiDefenseOverride.index
        : chooseStrikeFieldDefense(defender, attackCard, targetIndex, attackContext);
      if (interceptFieldIndex !== null) {
        resolveStrikeFieldDefenseInDraft(draft, attackerIndex, fieldIndex, targetIndex, interceptFieldIndex, effects, aiDefenseOverride?.type === "field" ? aiDefenseOverride.firewallDiscardIndex : undefined);
        return;
      }
      const interceptIndex = aiDefenseOverride?.type === "hand"
        ? aiDefenseOverride.index
        : chooseStrikeHandDefense(defender, attackCard, targetIndex, attackContext);
      if (interceptIndex !== null) {
        resolveStrikeHandDefenseInDraft(draft, attackerIndex, fieldIndex, targetIndex, interceptIndex, effects);
        return;
      }
    }
  }
  resolveStrikeOutcomeInDraft(draft, attackerIndex, fieldIndex, targetIndex, effects);
}

export function resolveStrikeFieldDefenseInDraft(
  draft: GameState,
  attackerIndex: number,
  fieldIndex: number,
  targetIndex: number,
  defenseIndex: number,
  effects: GameActionEffects = {},
  firewallDiscardIndex?: number | null,
): void {
  const attacker = draft.players[attackerIndex];
  const defenderIndex = 1 - attackerIndex;
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  const targetCard = defender.field[targetIndex];
  const defenseCard = defender.field[defenseIndex];
  if (!attackCard || !targetCard || !defenseCard || defenseIndex === targetIndex) return;
  const attackContext = { attacker, attackerFieldIndex: fieldIndex };
  if (!legalStrikeFieldDefenders(defender, attackCard, targetIndex, attackContext).some((option) => option.index === defenseIndex)) return;
  draft.pendingAttack = null;
  draft.pendingTarget = null;
  const firewallFuel = typeof firewallDiscardIndex === "number"
    ? discardHandCards(draft, defenderIndex, [firewallDiscardIndex])[0]
    : firewallDiscardIndex === null
      ? null
      : discardFirewallFuel(defender, defenseCard, attackCard, defenseIndex, attackContext);
  const defenseValue = defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid: Boolean(firewallFuel), fieldDefense: true, fieldIndex: defenseIndex, attackContext });
  const attackValue = attackCombatValue(attackCard, attackContext);
  const blocked = defenseValue >= attackValue;
  const isTrade = defenseValue === attackValue;
  const isFailure = defenseValue < attackValue;
  const fuelText = firewallFuel ? ` ${defender.memory!.name}で${firewallFuel.name}をトラッシュ。` : "";
  const defenseDrawnCards = drawsOnSuccessfulDefense(defenseCard) ? drawCards(defender, 1) : [];
  let defenseRecoverText = "";
  if (recoversAiOnSuccessfulDefense(defenseCard)) {
    const recoverIndex = highestPowerAiInDiscard(defender, defenseCard);
    if (recoverIndex !== null) {
      const recovered = defender.discard.splice(recoverIndex, 1)[0];
      defender.hand.push(recovered);
      markKnownHandCard(defender, recovered);
      defenseRecoverText = `${defenseCard.name}の効果で${defender.name}は${recovered.name}をトラッシュから回収。`;
      const urnDrawnCards = applyEchoUrnDraw(defender);
      if (urnDrawnCards.length > 0) defenseRecoverText += ` ${defender.memory!.name}で${visibleDrawText(defender, urnDrawnCards)}。`;
    }
  }
  const mirrorDrawnCards = defender.memory?.effect === "tidal_mirror" ? drawCards(defender, 1) : [];
  const shouldChoosePressureDiscard = blocked && pressuresOnBlock(attackCard) && defender.isHuman && defender.hand.length > 0;
  const pressureDiscarded = blocked && pressuresOnBlock(attackCard) && !shouldChoosePressureDiscard
    ? discardLowPriorityCards(defender, 1)[0] ?? null
    : null;
  const blockedDrawnCards = blocked && drawsOnBlockedAttack(attackCard) ? drawCards(attacker, 1) : [];
  const extraText = [
    defenseDrawnCards.length > 0 ? `${defenseCard.name}の効果で${defender.name}は${visibleDrawText(defender, defenseDrawnCards)}。` : "",
    defenseRecoverText,
    mirrorDrawnCards.length > 0 ? `${defender.memory?.name ?? "遺物"}で${defender.name}は${visibleDrawText(defender, mirrorDrawnCards)}。` : "",
    pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}をトラッシュへ送った。` : "",
    blockedDrawnCards.length > 0 ? `${attackCard.name}の効果で${attacker.name}は${visibleDrawText(attacker, blockedDrawnCards)}。` : "",
  ].filter(Boolean).join(" ");
  addLog(
    draft,
    isFailure
      ? `${defender.name}は場の${defenseCard.name}で${targetCard.name}をかばったが、攻撃を止めきれなかった。防御値${defenseValue}が攻撃値${attackValue}を下回り、${defenseCard.name}はトラッシュ。${targetCard.name}は場に残る。${fuelText}${extraText ? ` ${extraText}` : ""}`
      : isTrade
      ? `${defender.name}は場の${defenseCard.name}で${targetCard.name}をかばって防御成功。防御値${defenseValue}と攻撃値${attackValue}が同値で相打ち。攻撃側と防御側はトラッシュ、${targetCard.name}は場に残る。${fuelText}${extraText ? ` ${extraText}` : ""}`
      : `${defender.name}は場の${defenseCard.name}で${targetCard.name}をかばって防御成功。防御値${defenseValue}が攻撃値${attackValue}を上回り、${attackCard.name}は退場。${defenseCard.name}と${targetCard.name}は場に残る。${fuelText}${extraText ? ` ${extraText}` : ""}`,
  );
  effects.showDuelEvent?.({
    kind: "battle",
    title: isFailure ? "場防御でかばう" : isTrade ? "かばって相打ち" : `${defender.name}の場防御成功`,
    detail: `${attackCard.name} 攻撃値${attackValue} vs 場の${defenseCard.name} 防御${defenseValue}。${isFailure ? `${defenseCard.name}はトラッシュ。${targetCard.name}は守られます。` : isTrade ? `同値なので攻撃側と${defenseCard.name}はトラッシュ。${targetCard.name}は守られます。` : `${attackCard.name}はトラッシュ。${defenseCard.name}は場に残って消耗し、${targetCard.name}も守られます。`}${fuelText}${extraText ? ` ${extraText}` : ""}`,
    fromLabel: `${attacker.name}の場`,
    toLabel: `${defenseCard.name}がかばう`,
    resultLabel: isFailure ? "対象を防御" : isTrade ? "相打ち" : "防御側が残る",
    tone: isFailure ? "warning" : isTrade ? "warning" : defender.isHuman ? "magenta" : "cyan",
    emphasis: isFailure || isTrade ? "high" : undefined,
    rivalVoiceLine: defender.isHuman ? undefined : "field_defense",
    cards: [
      { card: attackCard, label: "攻撃", state: isFailure ? "neutral" : "trash" },
      { card: targetCard, label: "対象", state: "winner" },
      { card: defenseCard, label: "防御", state: isFailure || isTrade ? "trash" : "winner" },
    ],
  });
  if (isFailure) {
    defender.discard.push(...removeFieldStack(defender, defenseIndex));
  } else {
    attacker.discard.push(...removeFieldStack(attacker, fieldIndex));
    if (isTrade) {
      defender.discard.push(...removeFieldStack(defender, defenseIndex));
    } else {
      defender.spentFieldIndexes.add(defenseIndex);
    }
  }
  effects.playSfx?.(isFailure ? "damage" : "block");
  if (shouldChoosePressureDiscard) {
    draft.pendingTarget = {
      kind: "card-select",
      reason: "block-pressure",
      zone: "hand",
      playerIndex: defenderIndex,
      title: `${attackCard.name}の圧でトラッシュへ送るカードを選択`,
      prompt: "攻撃を防いだため、手札からトラッシュへ送るカードを1枚選んでください。",
      confirmLabel: "このカードを送る",
      min: 1,
      max: 1,
      excludeIndexes: [],
      selectedIndexes: [],
      actionCost: 1,
      actionKind: "attack",
      cancelable: false,
    };
  }
  attacker.nextAttackUnblockable = false;
  overheatAttackerIfNeeded(draft, attacker, fieldIndex, attackCard, effects);
  draft.selected = null;
  checkWinner(draft);
  checkResourceExhaustion(draft);
  if (draft.winner === null && !draft.draw) {
    draft.active = attackerIndex;
    if (!draft.pendingTarget) afterAction(draft, 1, "attack");
  }
}

export function resolveStrikeHandDefenseInDraft(
  draft: GameState,
  attackerIndex: number,
  fieldIndex: number,
  targetIndex: number,
  handIndex: number,
  effects: GameActionEffects = {},
): void {
  const attacker = draft.players[attackerIndex];
  const defenderIndex = 1 - attackerIndex;
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  const targetCard = defender.field[targetIndex];
  const defenseCard = CONFIG.setDefenseEnabled && handIndex === -1 ? defender.setDefenseCard : defender.hand[handIndex];
  if (!attackCard || !targetCard || !defenseCard) return;
  draft.pendingAttack = null;
  draft.pendingTarget = null;
  consumeHandDefenseCard(defender, handIndex);
  defender.handDefensesUsed += 1;
  const pierced = piercesHandDefense(attackCard);
  if (pierced) dealLifeDamage(defender);
  const pierceBreakDrawnCards = pierced && CONFIG.drawOnAttackDamage !== "none" ? drawCards(defender, 1) : [];
  const pierceBannerDrawnCards = pierced ? applyWarBannerDraw(attacker) : [];
  const chargeCompensated = pierced ? applyAttackChargeCompensation(draft, attacker) : false;
  const shouldChoosePressureDiscard = !pierced && pressuresOnBlock(attackCard) && defender.isHuman && defender.hand.length > 0;
  const pressureDiscarded = !pierced && pressuresOnBlock(attackCard) && !shouldChoosePressureDiscard
    ? discardLowPriorityCards(defender, 1)[0] ?? null
    : null;
  // 防御された時ドローは手札防御貫通（1ダメージ）と両立する（両方持つカードが収録された場合）
  const blockedDrawnCards = drawsOnBlockedAttack(attackCard) ? drawCards(attacker, 1) : [];
  const extraText = [
    pierced ? `${attackCard.name}の効果で防御されても1ダメージ。` : "",
    pierceBreakDrawnCards.length > 0 ? `ブレイクドローで${defender.name}は${visibleDrawText(defender, pierceBreakDrawnCards)}。` : "",
    pierceBannerDrawnCards.length > 0 ? `${attacker.memory?.name ?? "遺物"}で${attacker.name}は${visibleDrawText(attacker, pierceBannerDrawnCards)}。` : "",
    chargeCompensated ? `${attacker.name}は攻撃補償で+1チャージ。` : "",
    pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}をトラッシュへ送った。` : "",
    blockedDrawnCards.length > 0 ? `${attackCard.name}の効果で${attacker.name}は${visibleDrawText(attacker, blockedDrawnCards)}。` : "",
  ].filter(Boolean).join(" ");
  addLog(draft, `${defender.name}は手札の${defenseCard.name}で${targetCard.name}への攻撃を止めた。${defenseCard.name}はトラッシュへ。${extraText ? ` ${extraText}` : ""}`);
  effects.showDuelEvent?.({
    kind: "battle",
    title: pierced ? "手札防御を貫通" : `${defender.name}の手札防御`,
    detail: `${attackCard.name}の${targetCard.name}への攻撃を手札の${defenseCard.name}で止めました。${targetCard.name}は場に残ります。防御カードはトラッシュへ。${extraText ? ` ${extraText}` : ""}`,
    fromLabel: "手札",
    toLabel: "トラッシュ",
    resultLabel: "モンスター攻撃を防御",
    tone: defender.isHuman ? "magenta" : "cyan",
    emphasis: pierced ? undefined : "low",
    impact: pierced ? {
      kind: "life-damage",
      sourcePlayerIndex: attackerIndex,
      targetPlayerIndex: defenderIndex,
      amount: 1,
      fatal: defender.life <= 0,
    } : undefined,
    breakDraw: pierceBreakDrawnCards.length > 0 ? { targetPlayerIndex: defenderIndex, count: pierceBreakDrawnCards.length } : undefined,
    rivalVoiceLine: defender.isHuman ? undefined : "hand_defense",
    cards: [
      { card: attackCard, label: "攻撃", state: "neutral" },
      { card: targetCard, label: "対象", state: "winner" },
      { card: defenseCard, label: "防御", state: "trash" },
    ],
  });
  if (shouldChoosePressureDiscard) {
    draft.pendingTarget = {
      kind: "card-select",
      reason: "block-pressure",
      zone: "hand",
      playerIndex: defenderIndex,
      title: `${attackCard.name}の圧でトラッシュへ送るカードを選択`,
      prompt: "攻撃を防いだため、手札からトラッシュへ送るカードを1枚選んでください。",
      confirmLabel: "このカードを送る",
      min: 1,
      max: 1,
      excludeIndexes: [],
      selectedIndexes: [],
      actionCost: 1,
      actionKind: "attack",
      cancelable: false,
    };
  }
  effects.playSfx?.("block");
  attacker.nextAttackUnblockable = false;
  overheatAttackerIfNeeded(draft, attacker, fieldIndex, attackCard, effects);
  draft.selected = null;
  checkWinner(draft);
  checkResourceExhaustion(draft);
  if (draft.winner === null && !draft.draw) {
    draft.active = attackerIndex;
    if (!draft.pendingTarget) afterAction(draft, 1, "attack");
  }
}

export function resolveStrikeOutcomeInDraft(
  draft: GameState,
  attackerIndex: number,
  fieldIndex: number,
  targetIndex: number,
  effects: GameActionEffects = {},
): void {
  const attacker = draft.players[attackerIndex];
  const defenderIndex = 1 - attackerIndex;
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  const targetCard = defender.field[targetIndex];
  if (!attackCard || !targetCard) return;
  draft.pendingAttack = null;
  const { attackValue, defenseValue } = strikeValues(attackCard, defender, targetIndex, { attacker, attackerFieldIndex: fieldIndex });
  const trade = attackValue === defenseValue;
  defender.discard.push(...removeFieldStack(defender, targetIndex));
  if (trade) {
    attacker.discard.push(...removeFieldStack(attacker, fieldIndex));
  }
  addLog(
    draft,
    trade
      ? `${attacker.name}は${attackCard.name}で${defender.name}の${targetCard.name}を攻撃。攻撃値${attackValue}と防御値${defenseValue}が同値で相打ち。両方トラッシュ。`
      : `${attacker.name}は${attackCard.name}で${defender.name}の${targetCard.name}を攻撃。攻撃値${attackValue}が防御値${defenseValue}を上回り、${targetCard.name}は退場。`,
  );
  effects.showDuelEvent?.({
    kind: "battle",
    title: trade ? "相打ち" : `${targetCard.name}を討ち取った`,
    detail: `${attackCard.name} 攻撃値${attackValue} vs ${targetCard.name} 防御値${defenseValue}。${trade ? "同値なので両方トラッシュ。" : `${targetCard.name}はトラッシュへ。`}`,
    fromLabel: `${attacker.name}の場`,
    toLabel: trade ? "両方トラッシュ" : `${targetCard.name}はトラッシュ`,
    resultLabel: trade ? "相打ち" : "討伐",
    tone: trade ? "warning" : attacker.isHuman ? "magenta" : "cyan",
    emphasis: "high",
    rivalVoiceLine: attacker.isHuman ? undefined : "attack",
    cards: [
      { card: attackCard, label: "攻撃", state: trade ? "trash" : "winner" },
      { card: targetCard, label: "対象", state: "trash" },
    ],
  });
  effects.playSfx?.("attack");
  attacker.nextAttackUnblockable = false;
  if (!trade) overheatAttackerIfNeeded(draft, attacker, fieldIndex, attackCard, effects);
  draft.selected = null;
  checkWinner(draft);
  checkResourceExhaustion(draft);
  if (draft.winner === null && !draft.draw) {
    afterAction(draft, 1, "attack");
  }
}

export function performAiActionInDraft(
  draft: GameState,
  action: AiAction,
  effects: GameActionEffects = {},
): void {
  const player = activePlayer(draft);
  if (player.isHuman || draft.pendingAttack || draft.pendingTarget || draft.winner !== null || draft.draw) return;
  if (action.type === "end") {
    const discarded = finishTurn(draft, true);
    if (discarded.length > 0) {
      effects.showDuelEvent?.({
        kind: "trash",
        title: `${player.name}の手札上限`,
        detail: `ターン終了時に手札を${CONFIG.handLimit}枚まで減らし、${cardNameList(discarded)}をトラッシュ。`,
        fromLabel: "手札",
        toLabel: "トラッシュ",
        resultLabel: `${discarded.length}枚超過`,
        tone: player.isHuman ? "magenta" : "cyan",
        emphasis: "low",
        cards: discarded.map((card) => ({ card, label: "手札上限", state: "trash" })),
      });
    }
    return;
  }
  if (action.type === "play") {
    const card = player.hand[action.index];
    const cost = playCost(card, draft);
    if (!card || card.type !== "ai" || cost > draft.actionsRemaining || player.field.length >= CONFIG.fieldLimit) return;
    player.hand.splice(action.index, 1);
    player.field.push(card);
    player.playedAiThisTurn = true;
    const fieldIndex = player.field.length - 1;
    let text = `${player.name}は${card.name}を場に出した。`;
    text += applyPlayEffects(draft, player, card, fieldIndex, cost, undefined, effects);
    addLog(draft, text);
    effects.showDuelEvent?.({
      kind: "play",
      title: `${player.name}が場に出す`,
      detail: text,
      fromLabel: "手札",
      toLabel: "場",
      tone: player.isHuman ? "magenta" : "cyan",
      rivalVoiceLine: player.isHuman ? undefined : "play_summon",
      cutIn: effects.suppressEntryCutIn ? undefined : trumpCutInForPower4Entry(player, card),
      cards: [{ card, label: "登場", state: "neutral" }],
    });
    if (!draft.pendingTarget) afterAction(draft, cost);
  } else if (action.type === "upgrade") {
    const card = player.hand[action.handIndex];
    const source = player.field[action.fieldIndex];
    const cost = card && source ? upgradeCost(card, source) : 99;
    if (!card || !source || !canUpgrade(source, card) || cost > draft.actionsRemaining) return;
    player.hand.splice(action.handIndex, 1);
    stackUpgradeCard(player, action.fieldIndex, source);
    player.field[action.fieldIndex] = card;
    player.spentFieldIndexes.delete(action.fieldIndex);
    player.power3RecoveryDelayedFieldIndexes.delete(action.fieldIndex);
    player.chargeGuardedFieldIndexes.delete(action.fieldIndex);
    player.turnFieldAttackBonuses.delete(action.fieldIndex);
    let text = `${player.name}は${source.name}を元に${card.name}へアップグレード。`;
    text += applyPlayEffects(draft, player, card, action.fieldIndex, cost, source, effects);
    addLog(draft, text);
    effects.showDuelEvent?.({
      kind: "upgrade",
      title: `${player.name}がアップグレード`,
      detail: `${source.name}を元に${card.name}へ。元カードは下に重ねます。`,
      fromLabel: "手札 + 場",
      toLabel: "場",
      tone: player.isHuman ? "magenta" : "cyan",
      rivalVoiceLine: player.isHuman ? undefined : "upgrade",
      cutIn: effects.suppressEntryCutIn ? undefined : trumpCutInForPower4Entry(player, card),
      cards: [
        { card: source, label: "元", state: "neutral" },
        { card, label: "新", state: "winner" },
      ],
    });
    if (!draft.pendingTarget) afterAction(draft, cost);
  } else if (action.type === "memory") {
    const memory = player.hand[action.index];
    if (!memory || memory.type !== "memory") return;
    player.hand.splice(action.index, 1);
    const replaced = player.memory;
    if (replaced) player.discard.push(replaced);
    player.memory = memory;
    addLog(draft, `${player.name}は${memory.name}を遺物に配置。${replaced ? `${replaced.name}はトラッシュへ。` : ""}`);
    effects.showDuelEvent?.({
      kind: "memory",
      title: `${player.name}が遺物配置`,
      detail: `${memory.name}を遺物に配置。${replaced ? `${replaced.name}はトラッシュへ。` : ""}`,
      fromLabel: "手札",
      toLabel: "遺物",
      tone: player.isHuman ? "magenta" : "cyan",
      rivalVoiceLine: player.isHuman ? undefined : "memory",
      cards: [
        { card: memory, label: "遺物", state: "neutral" },
        ...(replaced ? [{ card: replaced, label: "旧遺物", state: "trash" as const }] : []),
      ],
    });
    afterAction(draft);
  } else if (action.type === "set-defense") {
    const card = player.hand[action.index];
    if (
      !CONFIG.setDefenseEnabled
      || card?.type !== "ai"
      || !canSetDefenseCard(card)
      || draft.actionsRemaining < CONFIG.setDefenseActionCost
      || (CONFIG.setDefenseOncePerTurn && player.setDefenseUsedThisTurn)
    ) return;
    player.hand.splice(action.index, 1);
    const replaced = player.setDefenseCard;
    if (replaced) player.discard.push(replaced);
    player.setDefenseCard = card;
    player.setDefenseUsedThisTurn = true;
    addLog(draft, `${player.name}はカードを1枚セットした。${replaced ? `旧セット札はトラッシュへ。` : ""}`);
    afterAction(draft, CONFIG.setDefenseActionCost);
  } else if (action.type === "memory-effect") {
    useAcceleratorMemoryInDraft(draft, draft.active, action.fieldIndex);
  } else if (action.type === "attack") {
    const attackerIndex = draft.active;
    const attackCard = player.field[action.index];
    if (!attackCard || player.spentFieldIndexes.has(action.index) || !canActivePlayerAttackOpponent(draft)) return;
    beginAttackInDraft(draft, attackerIndex, action.index, effects);
  } else if (action.type === "strike") {
    strikeInDraft(draft, draft.active, action.index, action.targetIndex, effects);
  } else if (action.type === "command") {
    draft.selected = { zone: "hand", index: action.index };
    useCommandAtInDraft(draft, action.index, null, [], effects);
  } else if (action.type === "charge") {
    const charged = chargeHandCardInDraft(draft, draft.active, action.index);
    if (!charged) return;
    effects.showDuelEvent?.({
      kind: "command",
      title: `${player.name}がチャージ`,
      detail: `${charged.name}をトラッシュへ送り、このターンのアクションを1増やしました。このターンは攻撃できません。`,
      fromLabel: "手札",
      toLabel: "トラッシュ",
      tone: player.isHuman ? "magenta" : "cyan",
      rivalVoiceLine: player.isHuman ? undefined : "charge",
      cards: [{ card: charged, label: "チャージ", state: "trash" }],
    });
  }
}
