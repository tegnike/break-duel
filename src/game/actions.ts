import {
  CONFIG,
  type AiAction,
  type Card,
  type DefenseChoice,
  type GameState,
  type PlayerState,
  addLog,
  activePlayer,
  attackCombatValue,
  canActivePlayerAttack,
  canChargeCard,
  canUseCharge,
  canDefend,
  canDefendWithOptionalFirewall,
  canUseAcceleratorMemory,
  canUpgrade,
  checkResourceExhaustion,
  checkTurnLimit,
  checkWinner,
  chooseAiDefense,
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
  hasAttributeAi,
  legalHandDefenders,
  lowestPriorityHand,
  keepsReadyAfterAttack,
  needsFirewallFuel,
  opponentPlayer,
  opponentDrawsOnPlay,
  piercesHandDefense,
  playCost,
  pressuresOnBlock,
  readiesAllyOnPlay,
  recoversAiOnPlay,
  removeFieldCard,
  returnsAfterOverheat,
  selfDamagesOnPlay,
  spendsEnemyOnPlay,
  upgradeCost,
  useAction,
  visibleDrawText,
} from "../game";
import type { DuelEventPayload } from "../duelEvents";

export type GameActionEffects = {
  playSfx?: (kind: string) => void;
  showDuelEvent?: (event: DuelEventPayload) => void;
};

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

export function useAcceleratorMemoryInDraft(draft: GameState, playerIndex: number, fieldIndex: number): Card | null {
  const player = draft.players[playerIndex];
  if (!player || !canUseAcceleratorMemory(draft, player)) return null;
  const sacrificed = player.field[fieldIndex];
  if (!sacrificed) return null;
  player.discard.push(removeFieldCard(player, fieldIndex));
  player.acceleratorUsed = true;
  const before = draft.actionsRemaining;
  draft.actionsRemaining = Math.min(3, draft.actionsRemaining + 1);
  addLog(draft, `${player.name}は${player.memory!.name}で${sacrificed.name}をトラッシュし、残りアクションを${before}から${draft.actionsRemaining}に増やした。`);
  draft.selected = null;
  draft.pendingTarget = null;
  checkResourceExhaustion(draft);
  checkTurnLimit(draft);
  return sacrificed;
}

export function chargeHandCardInDraft(draft: GameState, playerIndex: number, handIndex: number, chargeGuardTargetIndex?: number | null): Card | null {
  const player = draft.players[playerIndex];
  if (!player || !canUseCharge(draft, player)) return null;
  const charged = player.hand[handIndex];
  if (!charged || !canChargeCard(charged)) return null;
  player.hand.splice(handIndex, 1);
  player.discard.push(charged);
  player.chargeUsed = true;
  const before = draft.actionsRemaining;
  draft.actionsRemaining = Math.min(3, draft.actionsRemaining + 1);
  draft.chargedActionsRemaining += draft.actionsRemaining > before ? 1 : 0;
  const effectText = applyChargeEffects(draft, playerIndex, charged, chargeGuardTargetIndex);
  addLog(draft, `${player.name}は${charged.name}をチャージし、残りアクションを${before}から${draft.actionsRemaining}に増やした。${effectText}`);
  draft.selected = null;
  draft.pendingTarget = null;
  checkResourceExhaustion(draft);
  checkTurnLimit(draft);
  return charged;
}

function applyChargeEffects(draft: GameState, playerIndex: number, charged: Card, chargeGuardTargetIndex?: number | null): string {
  const player = draft.players[playerIndex];
  const opponent = draft.players[1 - playerIndex];
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
    const targetIndex = highestPowerSpentAi(player);
    if (targetIndex !== null) {
      player.spentFieldIndexes.delete(targetIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(targetIndex);
      texts.push(`${player.field[targetIndex].name}を回復。`);
    }
  }
  if (charged.effect === "charge_guard") {
    const targetIndex = chargeGuardTargetIndex ?? highestPowerFieldAi(player);
    if (targetIndex !== null && player.field[targetIndex]) {
      player.chargeGuardedFieldIndexes.add(targetIndex);
      texts.push(`${player.field[targetIndex].name}は次の自分ターンまで場防御値+1。`);
    }
  }
  if (player.memory?.effect === "resonator" && player.hand.length <= 2) {
    const drawnCards = drawCards(player, 1);
    texts.push(`${player.memory.name}で${visibleDrawText(player, drawnCards)}。`);
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
      text += ` 代償として${cardNameList(discarded)}を捨てた。`;
    }
  }
  if (selfDamagesOnPlay(card)) {
    player.life -= 1;
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
          title: `${card.name}の捨て札を選択`,
          prompt: `登場時効果で${visibleDrawText(player, drawnCards)}。手札からトラッシュするカードを1枚選んでください。`,
          confirmLabel: "このカードを捨てる",
          min: 1,
          max: 1,
          excludeIndexes: [],
          selectedIndexes: [],
          actionCost,
          cancelable: false,
        };
        text += " 捨てるカードを選択。";
      } else {
        const discardIndex = lowestPriorityHand(player);
        const discarded = player.hand.splice(discardIndex, 1)[0];
        player.discard.push(discarded);
        text += ` ${discarded.name}を捨てた。`;
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
        text += ` ${recovered.name}をトラッシュから回収。`;
      }
    }
  }
  if (readiesAllyOnPlay(card)) {
    const targetIndex = highestPowerSpentAi(player);
    if (targetIndex !== null) {
      if (player.isHuman) {
        draft.pendingTarget = {
          kind: "card-select",
          reason: "ready-ally",
          zone: "field",
          playerIndex: draft.players.indexOf(player),
          title: `${card.name}で回復する召喚獣を選択`,
          prompt: "消耗から回復させる自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を回復",
          min: 1,
          max: 1,
          excludeIndexes: player.field.map((_, index) => player.spentFieldIndexes.has(index) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          actionCost,
          cancelable: false,
        };
        text += " 回復する召喚獣を選択。";
      } else {
        player.spentFieldIndexes.delete(targetIndex);
        player.power3RecoveryDelayedFieldIndexes.delete(targetIndex);
        text += ` ${player.field[targetIndex].name}を回復。`;
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
): void {
  const player = activePlayer(draft);
  const opponent = opponentPlayer(draft);
  const command = player.hand[sourceIndex];
  if (!command || command.type !== "event") return;
  if (!commandUsable(draft, command, player, opponent)) return;
  const relearnTarget = command.effect === "relearn" ? targetIndex ?? highestPowerAiInDiscard(player) : null;
  const selectedDiscardCards = discardIndexes.length > 0
    ? discardHandCards(draft, draft.active, discardIndexes)
    : [];
  const commandIndex = player.hand.indexOf(command);
  if (commandIndex < 0) return;
  const used = player.hand.splice(commandIndex, 1)[0];
  player.discard.push(used);
  let text = `${player.name}は${used.name}を使用。`;
  if (used.effect === "optimize") {
    const discarded = selectedDiscardCards.length > 0
      ? selectedDiscardCards
      : discardLowPriorityCards(player, 1);
    const drawnCards = drawCards(player, 2);
    text += ` ${cardNameList(discarded)}を捨て、${visibleDrawText(player, drawnCards)}。`;
  } else if (used.effect === "patch") {
    const target = targetIndex ?? highestPowerSpentAi(player);
    if (target !== null) {
      player.spentFieldIndexes.delete(target);
      player.power3RecoveryDelayedFieldIndexes.delete(target);
      text += ` ${player.field[target].name}を回復。`;
    }
  } else if (used.effect === "disrupt") {
    const resolvedTarget = targetIndex ?? highestPowerReadyAi(opponent);
    if (resolvedTarget !== null) {
      opponent.spentFieldIndexes.add(resolvedTarget);
      text += ` ${opponent.name}の${opponent.field[resolvedTarget].name}を消耗。`;
    }
  } else if (used.effect === "relearn") {
    if (relearnTarget !== null) {
      const fuel = selectedDiscardCards.length > 0
        ? selectedDiscardCards
        : discardLowPriorityCards(player, 1);
      const recovered = player.discard.splice(relearnTarget, 1)[0];
      player.hand.push(recovered);
      if (fuel.length > 0) text += ` ${fuel[0].name}を代償としてトラッシュ。`;
      text += ` ${recovered.name}をトラッシュから回収。`;
    }
  } else if (used.effect === "sandbox") {
    player.sandboxShield = 1;
    text += " このターン、次のpower 4攻撃後退場を1回防ぐ。";
  } else if (used.effect === "trinity") {
    const trashed: Card[] = [];
    for (let index = player.field.length - 1; index >= 0; index -= 1) {
      trashed.unshift(removeFieldCard(player, index));
    }
    player.discard.push(...trashed);
    opponent.life -= 1;
    text += ` ${cardNameList(trashed)}をすべてトラッシュし、${opponent.name}のライフを1減らした。`;
  } else if (used.effect === "fire_rite") {
    if (!hasAttributeAi(player, "火")) return;
    const discarded = discardLowPriorityCards(opponent, 1);
    if (discarded.length > 0) {
      text += ` ${opponent.name}の手札を1枚トラッシュ。`;
    } else {
      opponent.life -= 1;
      text += ` ${opponent.name}の手札がないため、ライフを1減らした。`;
    }
  } else if (used.effect === "water_rite") {
    if (!hasAttributeAi(player, "水")) return;
    const drawnCards = drawCards(player, 1);
    text += ` ${visibleDrawText(player, drawnCards)}。`;
  } else if (used.effect === "wind_rite") {
    if (!hasAttributeAi(player, "風")) return;
    const disruptedIndex = highestPowerReadyAi(opponent);
    const readiedIndex = highestPowerSpentAiByAttribute(player, "風");
    if (disruptedIndex !== null) {
      opponent.spentFieldIndexes.add(disruptedIndex);
      text += ` ${opponent.name}の${opponent.field[disruptedIndex].name}を消耗。`;
    }
    if (readiedIndex !== null) {
      player.spentFieldIndexes.delete(readiedIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(readiedIndex);
      text += ` ${player.field[readiedIndex].name}を回復。`;
    }
  } else if (used.effect === "earth_rite") {
    if (!hasAttributeAi(player, "土")) return;
    const recoverIndex = highestPowerAiInDiscard(player);
    if (recoverIndex !== null) {
      const recovered = player.discard.splice(recoverIndex, 1)[0];
      player.hand.push(recovered);
      text += ` ${recovered.name}をトラッシュから回収。`;
    }
  }
  addLog(draft, text);
  effects.showDuelEvent?.({
    kind: "command",
    title: `${player.name}の指令`,
    detail: text,
    fromLabel: "手札",
    toLabel: used.effect === "trinity" ? "場 / トラッシュ / ライフ" : "トラッシュ",
    tone: player.isHuman ? "magenta" : "cyan",
    cards: [
      { card: used, label: "使用", state: "trash" },
      ...(used.effect === "trinity"
        ? player.discard.slice(-3).map((card) => ({ card, label: "犠牲", state: "trash" as const }))
        : []),
    ],
  });
  draft.selected = null;
  draft.pendingTarget = null;
  afterAction(draft);
}

export function beginAttackInDraft(
  draft: GameState,
  attackerIndex: number,
  fieldIndex: number,
  effects: GameActionEffects = {},
): void {
  const attacker = draft.players[attackerIndex];
  const defenderIndex = 1 - attackerIndex;
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  if (attackerIndex === draft.active && !canActivePlayerAttack(draft)) return;
  if (!attackCard || attacker.spentFieldIndexes.has(fieldIndex)) return;
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
  if (!defender.isHuman) resolveDefenseInDraft(draft, chooseAiDefense(defender, attackCard, defender.aiProfile), effects);
}

export function resolveDefenseInDraft(
  draft: GameState,
  choice: DefenseChoice,
  effects: GameActionEffects = {},
): void {
  const pending = draft.pendingAttack;
  if (!pending) return;
  const { attackerIndex, defenderIndex, fieldIndex } = pending;
  const attacker = draft.players[attackerIndex];
  const defender = draft.players[defenderIndex];
  const attackCard = attacker.field[fieldIndex];
  if (!attackCard) return;

  if (choice.type === "field") {
    const defenseCard = defender.field[choice.index];
    if (!defenseCard || !canDefendWithOptionalFirewall(attackCard, defenseCard, defender, choice.index)) return;
    draft.pendingTarget = null;
    if (defender.isHuman && needsFirewallFuel(defender, defenseCard, attackCard, choice.index) && choice.firewallDiscardIndex === undefined) {
      const baseCanDefend = canDefend(attackCard, defenseCard, defender, { fieldIndex: choice.index });
      draft.pendingTarget = {
        kind: "hand-discard",
        reason: "firewall",
        playerIndex: defenderIndex,
        title: `${defender.memory!.name}の捨て札を選択`,
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
    const firewallFuel = typeof choice.firewallDiscardIndex === "number"
      ? discardHandCards(draft, defenderIndex, [choice.firewallDiscardIndex])[0]
      : choice.firewallDiscardIndex === null
        ? null
        : discardFirewallFuel(defender, defenseCard, attackCard, choice.index);
    const defenseValue = defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid: Boolean(firewallFuel), fieldIndex: choice.index });
    const attackValue = attackCombatValue(attackCard);
    const isTrade = defenseValue === attackValue;
    const fuelText = firewallFuel ? ` ${defender.memory!.name}で${firewallFuel.name}をトラッシュ。` : "";
    const defenseDrawnCards = drawsOnSuccessfulDefense(defenseCard) ? drawCards(defender, 1) : [];
    const shouldChoosePressureDiscard = pressuresOnBlock(attackCard) && defender.isHuman && defender.hand.length > 0;
    const pressureDiscarded = pressuresOnBlock(attackCard) && !shouldChoosePressureDiscard
      ? discardLowPriorityCards(defender, 1)[0] ?? null
      : null;
    const blockedDrawnCards = drawsOnBlockedAttack(attackCard) ? drawCards(attacker, 1) : [];
    const extraText = [
      defenseDrawnCards.length > 0 ? `${defenseCard.name}の効果で${defender.name}は${visibleDrawText(defender, defenseDrawnCards)}。` : "",
      pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}を捨てた。` : "",
      blockedDrawnCards.length > 0 ? `${attackCard.name}の効果で${attacker.name}は${visibleDrawText(attacker, blockedDrawnCards)}。` : "",
    ].filter(Boolean).join(" ");
    addLog(
      draft,
      isTrade
        ? `${defender.name}は場の${defenseCard.name}で防御成功。防御値${defenseValue}と攻撃値${attackValue}が同値で相打ち。両方トラッシュ。${fuelText}${extraText ? ` ${extraText}` : ""}`
        : `${defender.name}は場の${defenseCard.name}で防御成功。防御値${defenseValue}が攻撃値${attackValue}を上回り、${attackCard.name}は退場。${defenseCard.name}は場に残って消耗。${fuelText}${extraText ? ` ${extraText}` : ""}`,
    );
    effects.showDuelEvent?.({
      kind: "battle",
      title: isTrade ? "相打ち" : `${defender.name}の防御成功`,
      detail: `${attackCard.name} 攻撃値${attackValue} vs 場の${defenseCard.name} 防御${defenseValue}。${isTrade ? "同値なので両方トラッシュ。" : "防御側は場に残ります。"}${fuelText}${extraText ? ` ${extraText}` : ""}`,
      fromLabel: `${attacker.name}の場`,
      toLabel: isTrade ? "両方トラッシュ" : `${attackCard.name}はトラッシュ`,
      resultLabel: isTrade ? "相打ち" : "防御側が残る",
      tone: isTrade ? "warning" : defender.isHuman ? "magenta" : "cyan",
      cards: [
        { card: attackCard, label: "攻撃", state: "trash" },
        { card: defenseCard, label: "防御", state: isTrade ? "trash" : "winner" },
      ],
    });
    attacker.discard.push(removeFieldCard(attacker, fieldIndex));
    if (isTrade) {
      defender.discard.push(removeFieldCard(defender, choice.index));
    } else {
      defender.spentFieldIndexes.add(choice.index);
    }
    if (shouldChoosePressureDiscard) {
      draft.pendingTarget = {
        kind: "card-select",
        reason: "block-pressure",
        zone: "hand",
        playerIndex: defenderIndex,
        title: `${attackCard.name}の圧で捨てるカードを選択`,
        prompt: "攻撃を防いだため、手札からトラッシュするカードを1枚選んでください。",
        confirmLabel: "このカードを捨てる",
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
  } else if (choice.type === "hand") {
    const defenseCard = defender.hand[choice.index];
    if (!defenseCard || !legalHandDefenders(defender, attackCard).some((option) => option.index === choice.index)) return;
    draft.pendingTarget = null;
    defender.hand.splice(choice.index, 1);
    defender.handDefensesUsed += 1;
    defender.discard.push(defenseCard);
    const pierced = piercesHandDefense(attackCard);
    if (pierced) defender.life -= 1;
    const shouldChoosePressureDiscard = !pierced && pressuresOnBlock(attackCard) && defender.isHuman && defender.hand.length > 0;
    const pressureDiscarded = !pierced && pressuresOnBlock(attackCard) && !shouldChoosePressureDiscard
      ? discardLowPriorityCards(defender, 1)[0] ?? null
      : null;
    const blockedDrawnCards = !pierced && drawsOnBlockedAttack(attackCard) ? drawCards(attacker, 1) : [];
    const extraText = [
      pierced ? `${attackCard.name}の効果で防御されても1ダメージ。` : "",
      pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}を捨てた。` : "",
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
        title: `${attackCard.name}の圧で捨てるカードを選択`,
        prompt: "攻撃を防いだため、手札からトラッシュするカードを1枚選んでください。",
        confirmLabel: "このカードを捨てる",
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
    defender.life -= 1;
    addLog(draft, `${defender.name}は防御せず1ダメージ。`);
    effects.showDuelEvent?.({
      kind: "damage",
      title: `${defender.name}に1ダメージ`,
      detail: `${attackCard.name}の攻撃が通りました。`,
      fromLabel: `${attacker.name}の場`,
      toLabel: `${defender.name}のライフ`,
      resultLabel: "ダメージ",
      tone: "danger",
      cards: [{ card: attackCard, label: "攻撃", state: "winner" }],
    });
    effects.playSfx?.("damage");
  }

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
    attacker.hand.push(removeFieldCard(attacker, fieldIndex));
    addLog(draft, `${attacker.name}の${attackCard.name}は攻撃後、風に乗って手札へ戻った。`);
    return;
  }
  attacker.discard.push(removeFieldCard(attacker, fieldIndex));
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

export function performAiActionInDraft(
  draft: GameState,
  action: AiAction,
  effects: GameActionEffects = {},
): void {
  const player = activePlayer(draft);
  if (player.isHuman || draft.pendingAttack || draft.pendingTarget || draft.winner !== null || draft.draw) return;
  if (action.type === "end") {
    finishTurn(draft, true);
    return;
  }
  if (action.type === "play") {
    const card = player.hand[action.index];
    if (!card || card.type !== "ai" || playCost(card) > draft.actionsRemaining || player.field.length >= CONFIG.fieldLimit) return;
    player.hand.splice(action.index, 1);
    player.field.push(card);
    const fieldIndex = player.field.length - 1;
    let text = `${player.name}は${card.name}を場に出した。`;
    text += applyPlayEffects(draft, player, card, fieldIndex, playCost(card));
    addLog(draft, text);
    effects.showDuelEvent?.({
      kind: "play",
      title: `${player.name}が場に出す`,
      detail: text,
      fromLabel: "手札",
      toLabel: "場",
      tone: player.isHuman ? "magenta" : "cyan",
      cards: [{ card, label: "登場", state: "neutral" }],
    });
    if (!draft.pendingTarget) afterAction(draft, playCost(card));
  } else if (action.type === "upgrade") {
    const card = player.hand[action.handIndex];
    const source = player.field[action.fieldIndex];
    if (!card || !source || !canUpgrade(source, card) || upgradeCost(card) > draft.actionsRemaining) return;
    player.hand.splice(action.handIndex, 1);
    player.discard.push(source);
    player.field[action.fieldIndex] = card;
    player.spentFieldIndexes.delete(action.fieldIndex);
    player.power3RecoveryDelayedFieldIndexes.delete(action.fieldIndex);
    player.chargeGuardedFieldIndexes.delete(action.fieldIndex);
    let text = `${player.name}は${source.name}を元に${card.name}へアップグレード。`;
    text += applyPlayEffects(draft, player, card, action.fieldIndex, upgradeCost(card), source);
    addLog(draft, text);
    effects.showDuelEvent?.({
      kind: "upgrade",
      title: `${player.name}がアップグレード`,
      detail: `${source.name}を元に${card.name}へ。元カードはトラッシュへ。`,
      fromLabel: "手札 + 場",
      toLabel: "場 / トラッシュ",
      tone: player.isHuman ? "magenta" : "cyan",
      cards: [
        { card: source, label: "元", state: "trash" },
        { card, label: "新", state: "winner" },
      ],
    });
    if (!draft.pendingTarget) afterAction(draft, upgradeCost(card));
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
      cards: [
        { card: memory, label: "遺物", state: "neutral" },
        ...(replaced ? [{ card: replaced, label: "旧遺物", state: "trash" as const }] : []),
      ],
    });
    afterAction(draft);
  } else if (action.type === "memory-effect") {
    useAcceleratorMemoryInDraft(draft, draft.active, action.fieldIndex);
  } else if (action.type === "attack") {
    const attackerIndex = draft.active;
    const attackCard = player.field[action.index];
    if (!attackCard || player.spentFieldIndexes.has(action.index) || !canActivePlayerAttack(draft)) return;
    beginAttackInDraft(draft, attackerIndex, action.index, effects);
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
      cards: [{ card: charged, label: "チャージ", state: "trash" }],
    });
  }
}
