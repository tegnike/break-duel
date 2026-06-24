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
  canDefend,
  canUpgrade,
  checkResourceExhaustion,
  checkTurnLimit,
  checkWinner,
  chooseAiDefense,
  defenseCombatValue,
  discardFirewallFuel,
  discardLowPriorityCards,
  draw,
  drawsAfterOverheat,
  drawsOnBlockedAttack,
  drawsOnPlay,
  drawsOnSuccessfulDefense,
  drawsTwoAfterOverheat,
  entersSpentOnPlay,
  filtersOnPlay,
  finishTurn,
  highestPowerAiInDiscard,
  highestPowerReadyAi,
  highestPowerSpentAi,
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
} from "../game";
import type { DuelEventPayload } from "../duelEvents";

export type GameActionEffects = {
  playSfx?: (kind: string) => void;
  showDuelEvent?: (event: DuelEventPayload) => void;
};

export function afterAction(draft: GameState, cost = 1): void {
  useAction(draft, cost);
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

export function applyPlayEffects(
  draft: GameState,
  player: PlayerState,
  card: Card,
  fieldIndex: number,
  actionCost: number,
  excludedRecoverCard?: Card,
): string {
  let text = "";
  if (CONFIG.power4EntersSpent && card.power === 4) {
    player.spentFieldIndexes.add(fieldIndex);
    text += " 出たターンは消耗。";
  }
  if (entersSpentOnPlay(card)) {
    player.spentFieldIndexes.add(fieldIndex);
    text += " 代償として消耗で出た。";
  }
  if (selfDamagesOnPlay(card)) {
    player.life -= 1;
    text += " 代償として自分に1ダメージ。";
  }
  if (opponentDrawsOnPlay(card)) {
    const playerIndex = draft.players.indexOf(player);
    const opponent = playerIndex >= 0 ? draft.players[1 - playerIndex] : null;
    if (opponent) {
      const drawn = draw(opponent, 1);
      text += ` 代償として${opponent.name}は${drawn}枚引いた。`;
    }
  }
  if (CONFIG.power1DrawsOnPlay && drawsOnPlay(card)) {
    const drawn = draw(player, 1);
    text += ` ${drawn}枚引いた。`;
  }
  if (filtersOnPlay(card)) {
    const drawn = draw(player, 2);
    text += ` ${drawn}枚引いた。`;
    if (player.hand.length > 0) {
      const discardIndex = lowestPriorityHand(player);
      const discarded = player.hand.splice(discardIndex, 1)[0];
      player.discard.push(discarded);
      text += ` ${discarded.name}を捨てた。`;
    }
  }
  if (spendsEnemyOnPlay(card)) {
    const playerIndex = draft.players.indexOf(player);
    const opponent = playerIndex >= 0 ? draft.players[1 - playerIndex] : null;
    if (opponent) {
      const targetIndex = highestPowerReadyAi(opponent);
      if (targetIndex !== null) {
        opponent.spentFieldIndexes.add(targetIndex);
        text += ` ${opponent.name}の${opponent.field[targetIndex].name}を消耗。`;
      }
    }
  }
  if (recoversAiOnPlay(card) && player.hand.length <= 1) {
    const targetIndex = highestPowerAiInDiscard(player, excludedRecoverCard);
    if (targetIndex !== null) {
      const recovered = player.discard.splice(targetIndex, 1)[0];
      player.hand.push(recovered);
      text += ` ${recovered.name}をトラッシュから回収。`;
    }
  }
  if (readiesAllyOnPlay(card)) {
    const targetIndex = highestPowerSpentAi(player);
    if (targetIndex !== null) {
      player.spentFieldIndexes.delete(targetIndex);
      text += ` ${player.field[targetIndex].name}を回復。`;
    }
  }
  if (player.memory?.effect === "pipeline" && card.power === 1 && !player.pipelineUsed) {
    player.pipelineUsed = true;
    const drawn = draw(player, 1);
    if (player.hand.length > 0) {
      if (player.isHuman) {
        draft.pendingTarget = {
          kind: "hand-discard",
          reason: "pipeline",
          playerIndex: draft.players.indexOf(player),
          title: `${player.memory.name}の捨て札を選択`,
          prompt: "追加ドロー後にトラッシュする手札を1枚選んでください。",
          min: 1,
          max: 1,
          excludeIndexes: [],
          selectedIndexes: [],
          sourceIndex: actionCost,
        };
        text += ` ${player.memory.name}で${drawn}枚引いた。捨てるカードを選択。`;
      } else {
        const discardIndex = lowestPriorityHand(player);
        const discarded = player.hand.splice(discardIndex, 1)[0];
        player.discard.push(discarded);
        text += ` ${player.memory.name}で${drawn}枚引き、${discarded.name}を捨てた。`;
      }
    } else {
      text += ` ${player.memory.name}で${drawn}枚引いた。`;
    }
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
      : discardLowPriorityCards(player, 2);
    const drawn = draw(player, 2);
    text += ` ${discarded.map((card) => card.name).join("、")}を捨て、${drawn}枚引いた。`;
  } else if (used.effect === "patch") {
    const target = highestPowerSpentAi(player);
    if (target !== null) {
      player.spentFieldIndexes.delete(target);
      text += ` ${player.field[target].name}を回復。`;
    }
  } else if (used.effect === "disrupt") {
    const resolvedTarget = targetIndex ?? highestPowerReadyAi(opponent);
    if (resolvedTarget !== null) {
      opponent.spentFieldIndexes.add(resolvedTarget);
      text += ` ${opponent.name}の${opponent.field[resolvedTarget].name}を消耗。`;
    }
  } else if (used.effect === "relearn") {
    const target = highestPowerAiInDiscard(player);
    if (target !== null) {
      const recovered = player.discard.splice(target, 1)[0];
      const fuel = selectedDiscardCards.length > 0
        ? selectedDiscardCards
        : discardLowPriorityCards(player, 1);
      player.hand.push(recovered);
      text += ` ${recovered.name}をトラッシュから回収。`;
      if (fuel.length > 0) text += ` ${fuel[0].name}を代償としてトラッシュ。`;
    }
  } else if (used.effect === "sandbox") {
    player.sandboxShield = 1;
    text += " このターン、次のpower 4攻撃後退場を1回防ぐ。";
  }
  addLog(draft, text);
  effects.showDuelEvent?.({
    kind: "command",
    title: `${player.name}の指令`,
    detail: text,
    fromLabel: "手札",
    toLabel: "トラッシュ",
    tone: player.isHuman ? "magenta" : "cyan",
    cards: [{ card: used, label: "使用", state: "trash" }],
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
  if (CONFIG.exhaustAfterAttack && !keepsReadyAfterAttack(attackCard)) attacker.spentFieldIndexes.add(fieldIndex);
  draft.pendingAttack = { attackerIndex, defenderIndex, fieldIndex };
  draft.selected = null;
  if (!defender.isHuman) resolveDefenseInDraft(draft, chooseAiDefense(defender, attackCard), effects);
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
    if (!defenseCard || !canDefend(attackCard, defenseCard, defender)) return;
    if (defender.isHuman && needsFirewallFuel(defender, defenseCard, attackCard) && choice.firewallDiscardIndex === undefined) {
      draft.pendingTarget = {
        kind: "hand-discard",
        reason: "firewall",
        playerIndex: defenderIndex,
        title: `${defender.memory!.name}の捨て札を選択`,
        prompt: "同属性防御の power +1 に使う手札を1枚選んでください。",
        min: 1,
        max: 1,
        excludeIndexes: [],
        selectedIndexes: [],
        fieldIndex: choice.index,
      };
      return;
    }
    const firewallFuel = choice.firewallDiscardIndex !== undefined
      ? discardHandCards(draft, defenderIndex, [choice.firewallDiscardIndex])[0]
      : discardFirewallFuel(defender, defenseCard, attackCard);
    const defenseValue = defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid: Boolean(firewallFuel) });
    const attackValue = attackCombatValue(attackCard);
    const isTrade = defenseValue === attackValue;
    const fuelText = firewallFuel ? ` ${defender.memory!.name}で${firewallFuel.name}をトラッシュ。` : "";
    const defenseDrawn = drawsOnSuccessfulDefense(defenseCard) ? draw(defender, 1) : 0;
    const pressureDiscarded = pressuresOnBlock(attackCard)
      ? discardLowPriorityCards(defender, 1)[0] ?? null
      : null;
    const blockedDrawn = drawsOnBlockedAttack(attackCard) ? draw(attacker, 1) : 0;
    const extraText = [
      defenseDrawn ? `${defenseCard.name}の効果で${defender.name}は1枚引いた。` : "",
      pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}を捨てた。` : "",
      blockedDrawn ? `${attackCard.name}の効果で${attacker.name}は1枚引いた。` : "",
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
    effects.playSfx?.("block");
  } else if (choice.type === "hand") {
    const defenseCard = defender.hand[choice.index];
    if (!defenseCard || !legalHandDefenders(defender, attackCard).some((option) => option.index === choice.index)) return;
    defender.hand.splice(choice.index, 1);
    defender.handDefensesUsed += 1;
    defender.discard.push(defenseCard);
    const pierced = piercesHandDefense(attackCard);
    if (pierced) defender.life -= 1;
    const pressureDiscarded = !pierced && pressuresOnBlock(attackCard)
      ? discardLowPriorityCards(defender, 1)[0] ?? null
      : null;
    const blockedDrawn = !pierced && drawsOnBlockedAttack(attackCard) ? draw(attacker, 1) : 0;
    const extraText = [
      pierced ? `${attackCard.name}の効果で防御されても1ダメージ。` : "",
      pressureDiscarded ? `${attackCard.name}の圧で${defender.name}は${pressureDiscarded.name}を捨てた。` : "",
      blockedDrawn ? `${attackCard.name}の効果で${attacker.name}は1枚引いた。` : "",
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
    effects.playSfx?.("block");
  } else {
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
    afterAction(draft);
  }
}

function overheatAttackerIfNeeded(
  draft: GameState,
  attacker: PlayerState,
  fieldIndex: number,
  attackCard: Card,
  effects: GameActionEffects,
): void {
  if (!CONFIG.power4OverheatsAfterAttack || attackCard.power !== 4) return;
  if (attacker.field[fieldIndex] !== attackCard) return;
  if (attacker.sandboxShield > 0) {
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
  const drawn = drawsTwoAfterOverheat(attackCard)
    ? draw(attacker, 2)
    : drawsAfterOverheat(attackCard)
      ? draw(attacker, 1)
      : 0;
  addLog(draft, `${attacker.name}の${attackCard.name}は攻撃後に力を使い切って退場。${drawn ? `${drawn}枚引いた。` : ""}`);
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
  } else if (action.type === "attack") {
    const attackerIndex = draft.active;
    const attackCard = player.field[action.index];
    if (!attackCard || player.spentFieldIndexes.has(action.index) || !canActivePlayerAttack(draft)) return;
    beginAttackInDraft(draft, attackerIndex, action.index, effects);
  } else if (action.type === "command") {
    draft.selected = { zone: "hand", index: action.index };
    useCommandAtInDraft(draft, action.index, null, [], effects);
  } else if (action.type === "cycle") {
    const card = player.hand.splice(action.index, 1)[0];
    player.discard.push(card);
    const drawn = draw(player, 1);
    addLog(draft, `${player.name}は手札を交換し、${drawn}枚引いた。`);
    effects.showDuelEvent?.({
      kind: "cycle",
      title: `${player.name}が交換`,
      detail: `${card.name}をトラッシュへ送り、${drawn}枚引きました。`,
      fromLabel: "手札",
      toLabel: "トラッシュ",
      tone: player.isHuman ? "magenta" : "cyan",
      cards: [{ card, label: "交換", state: "trash" }],
    });
    afterAction(draft);
  }
}
