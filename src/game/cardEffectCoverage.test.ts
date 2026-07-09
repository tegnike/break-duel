import { describe, expect, it } from "vitest";
import type { DuelEventPayload } from "../duelEvents";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  type CardEffect,
  type GameState,
  activeCardPool,
  aiEffectText,
  applyEchoUrnDraw,
  applyEndTurnGroveRest,
  applyTurnStartMemory,
  attackCombatValue,
  attackDamage,
  blocksLowLifeHandDefense,
  canDefend,
  canUseFirewall,
  cannotHandDefend,
  commandBlockedReason,
  commandUsable,
  cloneCard,
  createGame,
  defenseCombatValue,
  drawsAfterOverheat,
  drawsOnBlockedAttack,
  drawsOnPlay,
  drawsOnSuccessfulDefense,
  drawsTwoAfterOverheat,
  entersSpentOnPlay,
  filtersOnPlay,
  hasChargeEffect,
  keepsReadyAfterAttack,
  makeRng,
  opponentDrawsOnPlay,
  piercesHandDefense,
  playCost,
  pressuresOnBlock,
  readiesAllyOnPlay,
  recoversAiOnPlay,
  removeFieldStack,
  returnsAfterOverheat,
  spendsEnemyOnPlay,
  stackUpgradeCard,
  startTurn,
} from "../game";
import {
  applyPlayEffects,
  chargeHandCardInDraft,
  confirmChargeGuardTargetInDraft,
  performAiActionInDraft,
  resolveDefenseInDraft,
  useAcceleratorMemoryInDraft,
  useCommandAtInDraft,
} from "./actions";
import { displayCost } from "../components/cardPresentation";

type ActiveEffect = Exclude<CardEffect, "">;

type EffectCase = {
  cardId: string;
  description: string;
  run: () => void;
};

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

function blankGame(): GameState {
  const game = createGame(
    1,
    { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
    { kind: "custom", name: "Test Rival", cardIds: ["AI-WATER-1"] },
  );
  game.rng = makeRng(999);
  game.active = 0;
  game.turn = 2;
  game.actionsRemaining = 2;
  game.chargedActionsRemaining = 0;
  game.winner = null;
  game.draw = false;
  game.selected = null;
  game.pendingAttack = null;
  game.pendingTarget = null;
  game.log = [];
  game.players.forEach((player, index) => {
    player.name = index === 0 ? "あなた" : "ライバル";
    player.isHuman = index === 0;
    player.life = CONFIG.life;
    player.deck = [card(index === 0 ? "AI-FIRE-1" : "AI-WATER-1")];
    player.hand = [];
    player.field = [];
    player.fieldStacks = [];
    player.memory = null;
    player.discard = [];
    player.cardsDrawn = 0;
    player.turnsStarted = 1;
    player.handDefensesUsed = 0;
    player.pipelineUsed = false;
    player.acceleratorUsed = false;
    player.warBannerUsed = false;
    player.chargeUsed = false;
    player.playedAiThisTurn = false;
    player.chargeGuardedFieldIndexes.clear();
    player.sandboxShield = 0;
    player.spentFieldIndexes.clear();
    player.power3RecoveryDelayedFieldIndexes.clear();
  });
  return game;
}

function playableChargeGame(chargedCardId: string): GameState {
  const game = blankGame();
  game.actionsRemaining = 2;
  game.players[0].hand = [card(chargedCardId)];
  return game;
}

function expectCommandUsed(game: GameState, commandId: string): void {
  expect(game.players[0].discard.map((item) => item.id)).toContain(commandId);
}

const CARD_EFFECT_CASES = {
  attack_plus_1: {
    cardId: "AI-FIRE-2",
    description: "攻撃値がpowerより1高い",
    run: () => expect(attackCombatValue(card("AI-FIRE-2"))).toBe(3),
  },
  reckless_attack_plus_1: {
    cardId: "AI-FIRE-3B",
    description: "攻撃値+1で防御突破・討伐判定に強い。ダメージはpower通り3点。手札防御不可",
    run: () => {
      const target = card("AI-FIRE-3B");
      expect(attackCombatValue(target)).toBe(4);
      expect(cannotHandDefend(target)).toBe(true);
      expect(attackDamage(target)).toBe(3);
      expect(canDefend(target, card("AI-WIND-3"))).toBe(false);

      const game = blankGame();
      game.players[0].field = [card("AI-FIRE-3B")];
      game.pendingAttack = { attackerIndex: 0, defenderIndex: 1, fieldIndex: 0 };
      resolveDefenseInDraft(game, { type: "none" }, {});
      expect(game.players[1].life).toBe(CONFIG.life - 3);
    },
  },
  draw_after_overheat: {
    cardId: "AI-FIRE-4",
    description: "攻撃後退場時1枚ドロー対象になる",
    run: () => {
      expect(drawsAfterOverheat(card("AI-FIRE-4"))).toBe(true);
      expect(drawsTwoAfterOverheat(card("AI-FIRE-4"))).toBe(false);
    },
  },
  draw_after_overheat_opponent_draw: {
    cardId: "AI-WATER-4B",
    description: "攻撃後退場1枚ドローと登場時相手ドローを持つ",
    run: () => {
      const game = blankGame();
      game.players[1].deck = [card("AI-FIRE-1")];
      const target = card("AI-WATER-4B");
      applyPlayEffects(game, game.players[0], target, 0, 1);
      expect(drawsAfterOverheat(target)).toBe(true);
      expect(drawsTwoAfterOverheat(target)).toBe(false);
      expect(opponentDrawsOnPlay(target)).toBe(true);
      expect(game.players[1].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    },
  },
  draw_on_play: {
    cardId: "AI-WATER-3",
    description: "登場時に1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].deck = [card("AI-FIRE-1")];
      applyPlayEffects(game, game.players[0], card("AI-WATER-3"), 0, 1);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    },
  },
  draw_on_play_cannot_hand_defend: {
    cardId: "AI-WATER-1B",
    description: "登場時1枚ドローかつ手札防御不可",
    run: () => {
      const target = card("AI-WATER-1B");
      expect(drawsOnPlay(target)).toBe(true);
      expect(cannotHandDefend(target)).toBe(true);
    },
  },
  filter_on_play: {
    cardId: "AI-WATER-2",
    description: "登場時に2枚引き、トラッシュへ送るカード選択を要求する",
    run: () => {
      const game = blankGame();
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")];
      applyPlayEffects(game, game.players[0], card("AI-WATER-2"), 0, 1);
      expect(filtersOnPlay(card("AI-WATER-2"))).toBe(true);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-2", "AI-FIRE-1"]);
      expect(game.pendingTarget?.kind).toBe("card-select");
      expect(game.pendingTarget && "reason" in game.pendingTarget ? game.pendingTarget.reason : null).toBe("filter-discard");
    },
  },
  no_spend_after_attack: {
    cardId: "AI-WIND-1",
    description: "攻撃後に消耗しない対象になる",
    run: () => expect(keepsReadyAfterAttack(card("AI-WIND-1"))).toBe(true),
  },
  swarm_guard_plus_2: {
    cardId: "AI-FIRE-1",
    description: "相手が3面の時だけ場防御値が2上がる",
    run: () => {
      const game = blankGame();
      const attacker = card("AI-FIRE-3");
      const defender = card("AI-FIRE-1");
      game.players[1].field = [attacker, card("AI-WATER-1"), card("AI-WIND-1")];
      const attackContext = { attacker: game.players[1], attackerFieldIndex: 0 };
      expect(defenseCombatValue(attacker, defender, game.players[0], { fieldIndex: 0, attackContext })).toBe(3);
      game.players[1].field.pop();
      expect(defenseCombatValue(attacker, defender, game.players[0], { fieldIndex: 0, attackContext })).toBe(1);
    },
  },
  spend_enemy_on_play: {
    cardId: "AI-WIND-4B",
    description: "登場時に相手の未消耗召喚獣選択を要求する",
    run: () => {
      const game = blankGame();
      game.players[1].field = [card("AI-FIRE-2")];
      applyPlayEffects(game, game.players[0], card("AI-WIND-4B"), 0, 1);
      expect(spendsEnemyOnPlay(card("AI-WIND-4B"))).toBe(true);
      expect(game.pendingTarget?.kind).toBe("card-select");
      expect(game.pendingTarget && "reason" in game.pendingTarget ? game.pendingTarget.reason : null).toBe("spend-enemy");
    },
  },
  spend_enemy_on_play_enters_spent: {
    cardId: "AI-WIND-2B",
    description: "相手を消耗させ、自身も消耗で出る",
    run: () => {
      const target = card("AI-WIND-2B");
      expect(spendsEnemyOnPlay(target)).toBe(true);
      expect(entersSpentOnPlay(target)).toBe(true);
    },
  },
  defense_plus_1: {
    cardId: "AI-EARTH-2",
    description: "場防御値が1上がる",
    run: () => {
      const attacker = card("AI-FIRE-2");
      const defender = card("AI-EARTH-2");
      expect(defenseCombatValue(attacker, defender, null, { fieldIndex: 0 })).toBeGreaterThan(defender.power ?? 0);
    },
  },
  recover_ai_on_play: {
    cardId: "AI-EARTH-3B",
    description: "手札1枚以下ならトラッシュの召喚獣回収選択を要求する",
    run: () => {
      const game = blankGame();
      game.players[0].discard = [card("AI-FIRE-2")];
      applyPlayEffects(game, game.players[0], card("AI-EARTH-3B"), 0, 1);
      expect(recoversAiOnPlay(card("AI-EARTH-3B"))).toBe(true);
      expect(game.pendingTarget?.kind).toBe("card-select");
      expect(game.pendingTarget && "reason" in game.pendingTarget ? game.pendingTarget.reason : null).toBe("recover-on-play");
    },
  },
  block_pressure: {
    cardId: "AI-FIRE-1B",
    description: "防御された時の手札破壊対象になる",
    run: () => expect(pressuresOnBlock(card("AI-FIRE-1B"))).toBe(true),
  },
  hand_defense_pierce: {
    cardId: "AI-FIRE-2B",
    description: "手札防御貫通対象になる",
    run: () => expect(piercesHandDefense(card("AI-FIRE-2B"))).toBe(true),
  },
  low_life_no_hand_defense: {
    cardId: "AI-FIRE-4B",
    description: "低ライフ手札防御不可を持つ",
    run: () => {
      const game = blankGame();
      const target = card("AI-FIRE-4B");
      game.players[1].life = 2;
      applyPlayEffects(game, game.players[0], target, 0, 1);
      expect(blocksLowLifeHandDefense(target, game.players[1])).toBe(true);
      expect(game.players[0].life).toBe(CONFIG.life);
    },
  },
  draw_on_blocked_attack: {
    cardId: "AI-WATER-1",
    description: "防御された時ドロー対象になる",
    run: () => expect(drawsOnBlockedAttack(card("AI-WATER-1"))).toBe(true),
  },
  draw_on_blocked_attack_cannot_hand_defend: {
    cardId: "AI-WATER-2B",
    description: "防御された時ドロー対象かつ手札防御不可",
    run: () => {
      const target = card("AI-WATER-2B");
      expect(drawsOnBlockedAttack(target)).toBe(true);
      expect(cannotHandDefend(target)).toBe(true);
    },
  },
  ready_ally_on_play_draw: {
    cardId: "AI-WIND-3B",
    description: "登場時ドローと自分の消耗召喚獣回復選択を持つ",
    run: () => {
      const game = blankGame();
      game.players[0].deck = [card("AI-FIRE-1")];
      game.players[0].field = [card("AI-WIND-1")];
      game.players[0].spentFieldIndexes.add(0);
      applyPlayEffects(game, game.players[0], card("AI-WIND-3B"), 1, 1);
      expect(drawsOnPlay(card("AI-WIND-3B"))).toBe(true);
      expect(readiesAllyOnPlay(card("AI-WIND-3B"))).toBe(true);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
      expect(game.pendingTarget?.kind).toBe("card-select");
      expect(game.pendingTarget && "reason" in game.pendingTarget ? game.pendingTarget.reason : null).toBe("ready-ally");
    },
  },
  return_after_overheat: {
    cardId: "AI-WIND-4",
    description: "攻撃後退場時に手札へ戻る",
    run: () => {
      const target = card("AI-WIND-4");
      expect(returnsAfterOverheat(target)).toBe(true);
      expect(cannotHandDefend(target)).toBe(false);
    },
  },
  draw_on_successful_defense: {
    cardId: "AI-EARTH-1B",
    description: "場防御時ドロー対象になる",
    run: () => {
      const target = card("AI-EARTH-1B");
      expect(drawsOnSuccessfulDefense(target)).toBe(true);
      expect(entersSpentOnPlay(target)).toBe(false);
      const game = blankGame();
      game.players[1].field = [card("AI-FIRE-2")];
      game.players[0].field = [target];
      game.players[0].deck = [card("AI-WATER-1")];
      game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };
      resolveDefenseInDraft(game, { type: "field", index: 0 }, {});
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-WATER-1"]);
      expect(game.players[0].field).toHaveLength(0);
    },
  },
  charge_draw: {
    cardId: "AI-WATER-1C",
    description: "チャージ時に1枚引く",
    run: () => {
      const game = playableChargeGame("AI-WATER-1C");
      game.players[0].deck = [card("AI-FIRE-1")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
      expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-WATER-1C"]);
    },
  },
  charge_ready_ally: {
    cardId: "AI-WIND-2C",
    description: "チャージ時に消耗中の自分召喚獣を回復する",
    run: () => {
      const game = playableChargeGame("AI-WIND-2C");
      game.players[0].field = [card("AI-WIND-1"), card("AI-WIND-3")];
      game.players[0].spentFieldIndexes = new Set([0, 1]);
      chargeHandCardInDraft(game, 0, 0, { readyTargetIndex: 0 });
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
      expect(game.players[0].spentFieldIndexes.has(1)).toBe(true);
    },
  },
  charge_guard: {
    cardId: "AI-EARTH-2C",
    description: "対象選択中の確定からチャージ解決し、選んだ召喚獣だけ防御+1する",
    run: () => {
      const game = playableChargeGame("AI-EARTH-2C");
      game.actionsRemaining = 0;
      game.players[0].field = [card("AI-EARTH-1"), card("AI-EARTH-2")];
      game.pendingTarget = {
        kind: "card-select",
        reason: "charge-guard",
        zone: "field",
        playerIndex: 0,
        title: "石灯りノームの防御強化対象を選択",
        prompt: "対象を選択",
        confirmLabel: "この召喚獣を強化",
        min: 1,
        max: 1,
        excludeIndexes: [],
        selectedIndexes: [1],
        sourceIndex: 0,
        cancelable: true,
      };
      const charged = confirmChargeGuardTargetInDraft(game, 0, 0, 1);
      expect(charged?.id).toBe("AI-EARTH-2C");
      expect(game.pendingTarget).toBeNull();
      expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-EARTH-2C"]);
      expect(game.actionsRemaining).toBe(1);
      expect(game.players[0].chargeGuardedFieldIndexes).toEqual(new Set([1]));
      expect(game.players[0].chargeGuardedFieldIndexes.has(0)).toBe(false);
    },
  },
  charge_pressure_plus: {
    cardId: "AI-FIRE-2C",
    description: "チャージ時に相手手札が2枚以上なら1枚トラッシュする。1枚なら奪わない",
    run: () => {
      const game = playableChargeGame("AI-FIRE-2C");
      game.players[1].hand = [card("AI-WATER-1"), card("AI-WATER-2")];
      chargeHandCardInDraft(game, 0, 0);
      expect(hasChargeEffect(card("AI-FIRE-2C"))).toBe(true);
      expect(game.players[1].hand).toHaveLength(1);
      expect(game.players[1].discard).toHaveLength(1);

      const spared = playableChargeGame("AI-FIRE-2C");
      spared.players[1].hand = [card("AI-WATER-1")];
      chargeHandCardInDraft(spared, 0, 0);
      expect(spared.players[1].hand).toHaveLength(1);
      expect(spared.players[1].discard).toHaveLength(0);
    },
  },
  charge_surge_draw: {
    cardId: "AI-WATER-2C",
    description: "チャージ時に手札2枚以下なら2枚引く",
    run: () => {
      const game = playableChargeGame("AI-WATER-2C");
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-FIRE-3")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].hand).toHaveLength(2);

      const fullHand = playableChargeGame("AI-WATER-2C");
      fullHand.players[0].hand = [card("AI-WATER-2C"), card("AI-WATER-1"), card("AI-WATER-2"), card("AI-WATER-3")];
      fullHand.players[0].deck = [card("AI-FIRE-1")];
      chargeHandCardInDraft(fullHand, 0, 0);
      expect(fullHand.players[0].hand).toHaveLength(3);
    },
  },
  charge_spend_enemy: {
    cardId: "AI-WIND-1C",
    description: "チャージ時に相手の未消耗召喚獣1体を消耗させる",
    run: () => {
      const game = playableChargeGame("AI-WIND-1C");
      game.players[1].field = [card("AI-FIRE-2"), card("AI-FIRE-1")];
      chargeHandCardInDraft(game, 0, 0, { spendTargetIndex: 1 });
      expect(game.players[1].spentFieldIndexes).toEqual(new Set([1]));

      const auto = playableChargeGame("AI-WIND-1C");
      auto.players[1].field = [card("AI-FIRE-1"), card("AI-FIRE-4")];
      chargeHandCardInDraft(auto, 0, 0);
      expect(auto.players[1].spentFieldIndexes).toEqual(new Set([1]));
    },
  },
  charge_recover_discard: {
    cardId: "AI-EARTH-1C",
    description: "チャージ時に手札2枚以下ならトラッシュの召喚獣1枚を回収する。自分自身は回収できない",
    run: () => {
      const game = playableChargeGame("AI-EARTH-1C");
      game.players[0].discard = [card("AI-EARTH-3")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-EARTH-3"]);
      expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-EARTH-1C"]);

      const selfOnly = playableChargeGame("AI-EARTH-1C");
      chargeHandCardInDraft(selfOnly, 0, 0);
      expect(selfOnly.players[0].hand).toHaveLength(0);
      expect(selfOnly.players[0].discard.map((item) => item.id)).toEqual(["AI-EARTH-1C"]);

      const fullHand = playableChargeGame("AI-EARTH-1C");
      fullHand.players[0].hand = [card("AI-EARTH-1C"), card("AI-EARTH-1"), card("AI-EARTH-2"), card("AI-EARTH-2B")];
      fullHand.players[0].discard = [card("AI-EARTH-3")];
      chargeHandCardInDraft(fullHand, 0, 0);
      expect(fullHand.players[0].hand.map((item) => item.id)).toEqual(["AI-EARTH-1", "AI-EARTH-2", "AI-EARTH-2B"]);
      expect(fullHand.players[0].discard.map((item) => item.id)).toEqual(["AI-EARTH-3", "AI-EARTH-1C"]);
    },
  },
  optimize: {
    cardId: "CMD-OPTIMIZE",
    description: "手札1枚を捨てて2枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-OPTIMIZE"), card("AI-FIRE-1")];
      game.players[0].deck = [card("AI-WATER-1"), card("AI-WATER-2")];
      useCommandAtInDraft(game, 0, null, [1]);
      expectCommandUsed(game, "CMD-OPTIMIZE");
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-WATER-2", "AI-WATER-1"]);
    },
  },
  patch: {
    cardId: "CMD-PATCH",
    description: "消耗中の自分召喚獣1体を回復し、1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-PATCH")];
      game.players[0].field = [card("AI-FIRE-2")];
      game.players[0].spentFieldIndexes = new Set([0]);
      game.players[0].deck = [card("AI-WATER-1")];
      useCommandAtInDraft(game, 0, 0);
      expectCommandUsed(game, "CMD-PATCH");
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-WATER-1"]);
    },
  },
  disrupt: {
    cardId: "CMD-DISRUPT",
    description: "相手の未消耗召喚獣を消耗させる",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-DISRUPT")];
      game.players[1].field = [card("AI-WIND-1")];
      useCommandAtInDraft(game, 0, 0);
      expectCommandUsed(game, "CMD-DISRUPT");
      expect(game.players[1].spentFieldIndexes).toEqual(new Set([0]));
    },
  },
  purge: {
    cardId: "CMD-PURGE",
    description: "相手の消耗中召喚獣をスタックごとトラッシュへ送る",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-PURGE")];
      game.players[1].field = [card("AI-WIND-3")];
      game.players[1].spentFieldIndexes = new Set([0]);
      useCommandAtInDraft(game, 0, 0);
      expectCommandUsed(game, "CMD-PURGE");
      expect(game.players[1].field).toHaveLength(0);
      expect(game.players[1].discard.some((item) => item.id === "AI-WIND-3")).toBe(true);
    },
  },
  relearn: {
    cardId: "CMD-RELEARN",
    description: "手札1枚を代償にトラッシュの召喚獣を回収する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-RELEARN"), card("AI-FIRE-1")];
      game.players[0].discard = [card("AI-EARTH-3")];
      useCommandAtInDraft(game, 0, 0, [1]);
      expectCommandUsed(game, "CMD-RELEARN");
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-EARTH-3"]);
    },
  },
  sandbox: {
    cardId: "CMD-SANDBOX",
    description: "power 4攻撃後退場を防ぐ盾を付与する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-SANDBOX")];
      game.players[0].field = [card("AI-FIRE-4")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-SANDBOX");
      expect(game.players[0].sandboxShield).toBe(1);
    },
  },
  trinity: {
    cardId: "CMD-TRINITY",
    description: "自分の場をすべてトラッシュし、相手ライフを1減らす",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-TRINITY")];
      game.players[0].field = [card("AI-FIRE-1"), card("AI-WATER-1"), card("AI-WIND-1")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-TRINITY");
      expect(game.players[0].field).toHaveLength(0);
      expect(game.players[1].life).toBe(CONFIG.life - 1);
    },
  },
  fire_rite: {
    cardId: "CMD-FIRE-RITE",
    description: "火召喚獣がいれば相手手札を1枚トラッシュする",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-FIRE-RITE")];
      game.players[0].field = [card("AI-FIRE-1")];
      game.players[1].hand = [card("AI-WATER-1")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-FIRE-RITE");
      expect(game.players[1].discard.map((item) => item.id)).toEqual(["AI-WATER-1"]);
    },
  },
  water_rite: {
    cardId: "CMD-WATER-RITE",
    description: "水召喚獣がいれば2枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-WATER-RITE")];
      game.players[0].field = [card("AI-WATER-1")];
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-WATER-RITE");
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-2", "AI-FIRE-1"]);
    },
  },
  wind_rite: {
    cardId: "CMD-WIND-RITE",
    description: "風召喚獣がいれば相手を消耗し、自分の風を回復する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-WIND-RITE")];
      game.players[0].field = [card("AI-WIND-1"), card("AI-WIND-3")];
      game.players[0].spentFieldIndexes = new Set([0, 1]);
      game.players[1].field = [card("AI-FIRE-4"), card("AI-FIRE-2")];
      useCommandAtInDraft(game, 0, 1, [], {}, 0);
      expectCommandUsed(game, "CMD-WIND-RITE");
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
      expect(game.players[0].spentFieldIndexes.has(1)).toBe(true);
      expect(game.players[1].spentFieldIndexes).toEqual(new Set([1]));
    },
  },
  earth_rite: {
    cardId: "CMD-EARTH-RITE",
    description: "土召喚獣がいればトラッシュの召喚獣を回収する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-EARTH-RITE")];
      game.players[0].field = [card("AI-EARTH-1")];
      game.players[0].discard = [card("AI-FIRE-2"), card("AI-WATER-4")];
      useCommandAtInDraft(game, 0, 0);
      expectCommandUsed(game, "CMD-EARTH-RITE");
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-2"]);
      expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-WATER-4", "CMD-EARTH-RITE"]);
    },
  },
  comeback_rite: {
    cardId: "CMD-COMEBACK-RITE",
    description: "劣勢時に2枚引き、自分の消耗召喚獣を回復する",
    run: () => {
      const game = blankGame();
      game.players[0].life = 3;
      game.players[1].life = 5;
      game.players[0].hand = [card("CMD-COMEBACK-RITE")];
      game.players[0].field = [card("AI-FIRE-2"), card("AI-WATER-4")];
      game.players[0].spentFieldIndexes = new Set([0, 1]);
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-1B")];
      useCommandAtInDraft(game, 0, 0);
      expectCommandUsed(game, "CMD-COMEBACK-RITE");
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
      expect(game.players[0].spentFieldIndexes.has(1)).toBe(true);
      expect(game.players[0].hand.map((item) => item.id).sort()).toEqual(["AI-FIRE-1", "AI-FIRE-1B"]);
    },
  },
  firewall: {
    cardId: "MEM-FIREWALL",
    description: "異属性防御で手札を燃料に+1できる",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-FIREWALL");
      game.players[0].hand = [card("AI-FIRE-1")];
      const attackCard = card("AI-FIRE-2");
      const defenseCard = card("AI-WATER-2");
      expect(canUseFirewall(game.players[0], defenseCard, attackCard)).toBe(true);
      expect(defenseCombatValue(attackCard, defenseCard, game.players[0], { firewallPaid: true })).toBe(
        defenseCombatValue(attackCard, defenseCard, game.players[0]) + 1,
      );
    },
  },
  cache: {
    cardId: "MEM-CACHE",
    description: "ターン開始時に手札2枚以下なら1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-CACHE");
      game.players[0].deck = [card("AI-FIRE-1")];
      const drawn = applyTurnStartMemory(game.players[0]);
      expect(drawn.map((item) => item.id)).toEqual(["AI-FIRE-1"]);

      const turnStartGame = blankGame();
      turnStartGame.players[0].memory = card("MEM-CACHE");
      turnStartGame.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-1")];
      turnStartGame.players[0].deck = [card("AI-EARTH-1"), card("AI-WIND-1")];
      startTurn(turnStartGame);
      expect(turnStartGame.players[0].hand).toHaveLength(4);
    },
  },
  pipeline: {
    cardId: "MEM-PIPELINE",
    description: "power 1登場時に1ターン1回だけ1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-PIPELINE");
      game.players[0].deck = [card("AI-FIRE-2")];
      applyPlayEffects(game, game.players[0], card("AI-FIRE-1"), 0, 1);
      expect(game.players[0].pipelineUsed).toBe(true);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-2"]);
    },
  },
  accelerator: {
    cardId: "MEM-ACCELERATOR",
    description: "場の召喚獣をトラッシュしてアクションを1増やす",
    run: () => {
      const game = blankGame();
      game.actionsRemaining = 1;
      game.players[0].memory = card("MEM-ACCELERATOR");
      game.players[0].field = [card("AI-FIRE-1")];
      const sacrificed = useAcceleratorMemoryInDraft(game, 0, 0);
      expect(sacrificed?.id).toBe("AI-FIRE-1");
      expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
      expect(game.actionsRemaining).toBe(2);
    },
  },
  resonator: {
    cardId: "MEM-RESONATOR",
    description: "チャージ後に手札2枚以下なら1枚引く",
    run: () => {
      const game = playableChargeGame("AI-WATER-1C");
      game.players[0].memory = card("MEM-RESONATOR");
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-2", "AI-FIRE-1"]);
    },
  },
  recovery_cache: {
    cardId: "MEM-RECOVERY-CACHE",
    description: "相手よりライフが少ない場合、そのターン最初の召喚獣登場コストを1下げる。最低1",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-RECOVERY-CACHE");
      game.players[0].life = 3;
      game.players[1].life = 5;
      expect(playCost(card("AI-FIRE-3"), game)).toBe(2);
      expect(displayCost(card("AI-FIRE-3"), "usable", null, game)).toBe(2);
      game.players[0].playedAiThisTurn = true;
      expect(playCost(card("AI-FIRE-3"), game)).toBe(3);
      expect(displayCost(card("AI-FIRE-3"), "usable", null, game)).toBe(3);
    },
  },
  war_banner: {
    cardId: "MEM-WAR-BANNER",
    description: "自分の攻撃で相手ライフが減った時、1ターンに1回1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-WAR-BANNER");
      game.players[0].field = [card("AI-FIRE-2")];
      game.players[0].deck = [card("AI-FIRE-1")];
      game.pendingAttack = { attackerIndex: 0, defenderIndex: 1, fieldIndex: 0 };
      resolveDefenseInDraft(game, { type: "none" }, {});
      expect(game.players[1].life).toBeLessThan(CONFIG.life);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
      expect(game.players[0].warBannerUsed).toBe(true);
    },
  },
  grove_rest: {
    cardId: "MEM-GROVE",
    description: "ターン終了時、ライフ劣勢で消耗中召喚獣が2体以上なら最も強い1体を回復する",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-GROVE");
      game.players[0].life = 5;
      game.players[0].field = [card("AI-EARTH-2"), card("AI-EARTH-1")];
      game.players[0].spentFieldIndexes = new Set([0, 1]);
      const rested = applyEndTurnGroveRest(game.players[0], game.players[1]);
      expect(rested?.id).toBe("AI-EARTH-2");
      expect(game.players[0].spentFieldIndexes).toEqual(new Set([1]));

      const single = blankGame();
      single.players[0].memory = card("MEM-GROVE");
      single.players[0].life = 5;
      single.players[0].field = [card("AI-EARTH-2")];
      single.players[0].spentFieldIndexes = new Set([0]);
      expect(applyEndTurnGroveRest(single.players[0], single.players[1])).toBeNull();
      expect(single.players[0].spentFieldIndexes).toEqual(new Set([0]));

      const ahead = blankGame();
      ahead.players[0].memory = card("MEM-GROVE");
      ahead.players[0].field = [card("AI-EARTH-2"), card("AI-EARTH-1")];
      ahead.players[0].spentFieldIndexes = new Set([0, 1]);
      expect(applyEndTurnGroveRest(ahead.players[0], ahead.players[1])).toBeNull();
      expect(ahead.players[0].spentFieldIndexes).toEqual(new Set([0, 1]));
    },
  },
  trash_enemy_memory_on_play: {
    cardId: "AI-FIRE-1D",
    description: "CPU登場時、相手の遺物を自動でトラッシュへ送り、自身は消耗する（人間は任意選択、別テストで検証）",
    run: () => {
      const game = blankGame();
      game.players[0].isHuman = false;
      const target = card("AI-FIRE-1D");
      game.players[0].field = [target];
      game.players[1].memory = card("MEM-CACHE");
      applyPlayEffects(game, game.players[0], target, 0, 1);
      expect(game.players[1].memory).toBeNull();
      expect(game.players[1].discard.map((item) => item.id)).toEqual(["MEM-CACHE"]);
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(true);
      expect(game.pendingTarget).toBeNull();

      const noRelic = blankGame();
      noRelic.players[0].isHuman = false;
      const idle = card("AI-FIRE-1D");
      noRelic.players[0].field = [idle];
      applyPlayEffects(noRelic, noRelic.players[0], idle, 0, 1);
      expect(noRelic.players[0].spentFieldIndexes.has(0)).toBe(false);
    },
  },
  draw_on_play_if_discard_4: {
    cardId: "AI-WATER-1D",
    description: "トラッシュ4枚以上の時だけ登場時に1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].discard = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("CMD-OPTIMIZE"), card("AI-WATER-1")];
      game.players[0].deck = [card("AI-FIRE-1B")];
      applyPlayEffects(game, game.players[0], card("AI-WATER-1D"), 0, 1);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1B"]);

      const shallow = blankGame();
      shallow.players[0].discard = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("CMD-OPTIMIZE")];
      shallow.players[0].deck = [card("AI-FIRE-1B")];
      applyPlayEffects(shallow, shallow.players[0], card("AI-WATER-1D"), 0, 1);
      expect(shallow.players[0].hand).toHaveLength(0);
    },
  },
  charge_draw_if_discard_ai: {
    cardId: "AI-WIND-1D",
    description: "チャージ時、トラッシュに他の召喚獣があれば1枚引く。自分自身は数えない",
    run: () => {
      const game = playableChargeGame("AI-WIND-1D");
      game.players[0].discard = [card("AI-FIRE-1")];
      game.players[0].deck = [card("AI-FIRE-2")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-2"]);

      const selfOnly = playableChargeGame("AI-WIND-1D");
      selfOnly.players[0].deck = [card("AI-FIRE-2")];
      chargeHandCardInDraft(selfOnly, 0, 0);
      expect(selfOnly.players[0].hand).toHaveLength(0);
    },
  },
  recover_ai_on_successful_defense: {
    cardId: "AI-EARTH-1D",
    description: "場防御時にトラッシュの召喚獣を手札に戻す",
    run: () => {
      const game = blankGame();
      game.players[1].field = [card("AI-FIRE-2")];
      game.players[0].field = [card("AI-EARTH-1D")];
      game.players[0].discard = [card("AI-WATER-3")];
      game.players[0].deck = [];
      game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };
      resolveDefenseInDraft(game, { type: "field", index: 0 }, {});
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-WATER-3"]);
      expect(game.players[0].field).toHaveLength(0);
    },
  },
  discard_commands_attack_plus_1: {
    cardId: "AI-FIRE-2D",
    description: "自分のトラッシュに術式が2枚以上ある時だけ戦闘時攻撃値+2",
    run: () => {
      const game = blankGame();
      const attacker = game.players[0];
      const target = card("AI-FIRE-2D");
      expect(attackCombatValue(target, { attacker })).toBe(2);
      attacker.discard = [card("CMD-OPTIMIZE"), card("CMD-PURGE")];
      expect(attackCombatValue(target, { attacker })).toBe(4);
      expect(attackCombatValue(target)).toBe(2);
      expect(attackDamage(target)).toBe(2);
    },
  },
  draw_on_play_defense_draw: {
    cardId: "AI-WATER-2D",
    description: "登場時ドローと場防御時ドローの両方を持つ",
    run: () => {
      const game = blankGame();
      game.players[0].deck = [card("AI-FIRE-1")];
      applyPlayEffects(game, game.players[0], card("AI-WATER-2D"), 0, 2);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
      expect(drawsOnSuccessfulDefense(card("AI-WATER-2D"))).toBe(true);
    },
  },
  ready_ally_on_play_enters_spent: {
    cardId: "AI-WIND-2D",
    description: "登場時に他の消耗召喚獣を回復し、自身は消耗で出る。自分自身は回復できない",
    run: () => {
      const game = blankGame();
      const player = game.players[1];
      const target = card("AI-WIND-2D");
      player.field = [card("AI-WIND-1"), target];
      player.spentFieldIndexes = new Set([0, 1]);
      expect(entersSpentOnPlay(target)).toBe(true);
      expect(readiesAllyOnPlay(target)).toBe(true);
      applyPlayEffects(game, player, target, 1, 2);
      expect(player.spentFieldIndexes.has(0)).toBe(false);
      expect(player.spentFieldIndexes.has(1)).toBe(true);
    },
  },
  defense_plus_1_with_memory: {
    cardId: "AI-EARTH-2D",
    description: "自分の遺物がある間だけ場防御値+2",
    run: () => {
      const game = blankGame();
      const attacker = card("AI-FIRE-2");
      const defenderCard = card("AI-EARTH-2D");
      const defender = game.players[0];
      expect(defenseCombatValue(attacker, defenderCard, defender, { fieldIndex: 0 })).toBe(2);
      defender.memory = card("MEM-CACHE");
      expect(defenseCombatValue(attacker, defenderCard, defender, { fieldIndex: 0 })).toBe(4);
      expect(defenseCombatValue(attacker, defenderCard, defender, { fieldDefense: false })).toBe(2);
    },
  },
  blocked_attack_draw: {
    cardId: "AI-WATER-3D",
    description: "攻撃が防御された時に1枚引く。登場時のドローはない",
    run: () => {
      const target = card("AI-WATER-3D");
      expect(drawsOnPlay(target)).toBe(false);
      expect(drawsOnBlockedAttack(target)).toBe(true);
      expect(piercesHandDefense(target)).toBe(false);
      const game = blankGame();
      game.players[0].deck = [card("AI-FIRE-1")];
      applyPlayEffects(game, game.players[0], target, 0, 3);
      expect(game.players[0].hand).toHaveLength(0);
    },
  },
  charge_spend_enemy_ready_ally: {
    cardId: "AI-WIND-3C",
    description: "チャージ時に相手の最高power未消耗召喚獣を消耗させ、自分の最高power消耗中召喚獣を回復する（旋風転身術と同じ自動対象規則）",
    run: () => {
      const game = playableChargeGame("AI-WIND-3C");
      game.players[0].field = [card("AI-WIND-1")];
      game.players[0].spentFieldIndexes = new Set([0]);
      game.players[1].field = [card("AI-FIRE-2"), card("AI-FIRE-1")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[1].spentFieldIndexes).toEqual(new Set([0]));
      expect(game.players[0].spentFieldIndexes.size).toBe(0);
    },
  },
  charge_recover_discard_any: {
    cardId: "AI-EARTH-3C",
    description: "チャージ時に手札枚数条件なしでトラッシュの召喚獣を回収する。チャージした自分自身は対象外",
    run: () => {
      const game = playableChargeGame("AI-EARTH-3C");
      game.players[0].hand.push(card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-WATER-1"));
      game.players[0].discard = [card("AI-EARTH-2")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].hand.map((item) => item.id)).toContain("AI-EARTH-2");

      const selfOnly = playableChargeGame("AI-EARTH-3C");
      selfOnly.players[0].discard = [];
      chargeHandCardInDraft(selfOnly, 0, 0);
      expect(selfOnly.players[0].hand).toHaveLength(0);
      expect(selfOnly.players[0].discard.map((item) => item.id)).toEqual(["AI-EARTH-3C"]);
    },
  },
  charge_filter_draw: {
    cardId: "AI-WATER-3C",
    description: "チャージ時に2枚引き、手札1枚をトラッシュへ送る",
    run: () => {
      const game = playableChargeGame("AI-WATER-3C");
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].hand).toHaveLength(1);
      expect(game.players[0].discard).toHaveLength(2);
    },
  },
  charge_pressure_any: {
    cardId: "AI-FIRE-3C",
    description: "チャージ時に相手の手札枚数に関係なく1枚トラッシュさせる",
    run: () => {
      const game = playableChargeGame("AI-FIRE-3C");
      game.players[1].hand = [card("AI-WATER-1")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[1].hand).toHaveLength(0);
      expect(game.players[1].discard).toHaveLength(1);
    },
  },
  return_after_overheat_opponent_draw_on_play: {
    cardId: "AI-WATER-4D",
    description: "登場時に自分と相手が1枚ずつ引き、攻撃後退場時に手札へ戻る",
    run: () => {
      const target = card("AI-WATER-4D");
      expect(returnsAfterOverheat(target)).toBe(true);
      expect(opponentDrawsOnPlay(target)).toBe(true);
      const game = blankGame();
      game.players[0].deck = [card("AI-FIRE-1")];
      game.players[1].deck = [card("AI-WATER-1")];
      applyPlayEffects(game, game.players[0], target, 0, 4);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
      expect(game.players[1].hand.map((item) => item.id)).toEqual(["AI-WATER-1"]);
    },
  },
  discard_ai_attack_plus_1: {
    cardId: "AI-FIRE-4D",
    description: "トラッシュに召喚獣3枚以上で戦闘時攻撃値+1。攻撃後退場時のドローはなし",
    run: () => {
      const game = blankGame();
      const attacker = game.players[0];
      const target = card("AI-FIRE-4D");
      expect(attackCombatValue(target, { attacker })).toBe(4);
      attacker.discard = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-WATER-1")];
      expect(attackCombatValue(target, { attacker })).toBe(5);
      expect(drawsAfterOverheat(target)).toBe(false);
      expect(attackDamage(target)).toBe(4);
    },
  },
  charge_spend_all_enemies: {
    cardId: "AI-WIND-4D",
    description: "チャージ時に相手の未消耗召喚獣をすべて消耗させる",
    run: () => {
      const game = playableChargeGame("AI-WIND-4D");
      game.players[1].field = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-WATER-1")];
      game.players[1].spentFieldIndexes = new Set([2]);
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[1].spentFieldIndexes).toEqual(new Set([0, 1, 2]));
    },
  },
  recover_memory_on_play_defense_plus_1: {
    cardId: "AI-EARTH-4D",
    description: "登場時にトラッシュの遺物を手札に戻し、場防御時防御値+1",
    run: () => {
      const game = blankGame();
      game.players[0].discard = [card("AI-FIRE-1"), card("MEM-CACHE")];
      const target = card("AI-EARTH-4D");
      applyPlayEffects(game, game.players[0], target, 0, 4);
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["MEM-CACHE"]);
      expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
      expect(defenseCombatValue(card("AI-FIRE-2"), target, null, { fieldIndex: 0 })).toBe(5);
    },
  },
  war_cry: {
    cardId: "CMD-WAR-CRY",
    description: "このターン自分の召喚獣すべての戦闘時攻撃値を+1する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-WAR-CRY")];
      game.players[0].field = [card("AI-FIRE-1")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-WAR-CRY");
      expect(game.players[0].turnGlobalAttackBonus).toBe(1);
      expect(attackCombatValue(game.players[0].field[0], { attacker: game.players[0], attackerFieldIndex: 0 })).toBe(2);
    },
  },
  tide_edge: {
    cardId: "CMD-TIDE-EDGE",
    description: "自分の召喚獣1体のこのターンの戦闘時攻撃値を+2する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-TIDE-EDGE")];
      game.players[0].field = [card("AI-WATER-1"), card("AI-WATER-2")];
      useCommandAtInDraft(game, 0, 1);
      expectCommandUsed(game, "CMD-TIDE-EDGE");
      expect(game.players[0].turnFieldAttackBonuses.get(1)).toBe(2);
      expect(game.players[0].turnFieldAttackBonuses.get(0)).toBeUndefined();
    },
  },
  pierce_sight: {
    cardId: "CMD-PIERCE-SIGHT",
    description: "このターンの自分の次の攻撃を手札防御不可にする",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-PIERCE-SIGHT")];
      game.players[0].field = [card("AI-FIRE-1")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-PIERCE-SIGHT");
      expect(game.players[0].nextAttackUnblockable).toBe(true);
    },
  },
  grave_call: {
    cardId: "CMD-GRAVE-CALL",
    description: "トラッシュのpower 2以下の召喚獣を消耗状態で場に出す。power 3以上は選ばない",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-GRAVE-CALL")];
      game.players[0].discard = [card("AI-FIRE-4"), card("AI-FIRE-3"), card("AI-FIRE-2")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-GRAVE-CALL");
      expect(game.players[0].field.map((item) => item.id)).toEqual(["AI-FIRE-2"]);
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(true);
      expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-FIRE-4", "AI-FIRE-3", "CMD-GRAVE-CALL"]);
    },
  },
  salvage: {
    cardId: "CMD-SALVAGE",
    description: "トラッシュの術式1枚を手札に戻す。遺灰回収自身は対象にできない",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-SALVAGE")];
      game.players[0].discard = [card("CMD-SALVAGE"), card("CMD-OPTIMIZE")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-SALVAGE");
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["CMD-OPTIMIZE"]);
    },
  },
  overdrive: {
    cardId: "CMD-OVERDRIVE",
    description: "チャージ済みターンにだけ発動でき、2枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-OVERDRIVE")];
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")];
      expect(commandUsable(game, game.players[0].hand[0], game.players[0], game.players[1])).toBe(false);
      game.players[0].chargeUsed = true;
      expect(commandUsable(game, game.players[0].hand[0], game.players[0], game.players[1])).toBe(true);
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-OVERDRIVE");
      expect(game.players[0].hand).toHaveLength(2);
    },
  },
  relic_crush: {
    cardId: "CMD-RELIC-CRUSH",
    description: "相手の遺物があるときしか使えず、使うと相手の遺物をトラッシュへ送る",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-RELIC-CRUSH")];
      game.players[1].memory = card("MEM-CACHE");
      expect(commandUsable(game, card("CMD-RELIC-CRUSH"), game.players[0], game.players[1])).toBe(true);
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-RELIC-CRUSH");
      expect(game.players[1].memory).toBeNull();
      expect(game.players[1].discard.map((item) => item.id)).toEqual(["MEM-CACHE"]);

      const noRelic = blankGame();
      noRelic.players[0].hand = [card("CMD-RELIC-CRUSH")];
      noRelic.players[0].deck = [card("AI-FIRE-1")];
      expect(commandUsable(noRelic, card("CMD-RELIC-CRUSH"), noRelic.players[0], noRelic.players[1])).toBe(false);
      useCommandAtInDraft(noRelic, 0, null);
      expect(noRelic.players[0].hand.map((item) => item.id)).toEqual(["CMD-RELIC-CRUSH"]);
      expect(noRelic.players[0].deck.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    },
  },
  deep_current: {
    cardId: "CMD-DEEP-CURRENT",
    description: "水2体以上で3枚引き、1枚トラッシュへ送る",
    run: () => {
      const game = blankGame();
      game.players[0].isHuman = false;
      game.players[0].hand = [card("CMD-DEEP-CURRENT")];
      game.players[0].field = [card("AI-WATER-1"), card("AI-WATER-3D")];
      game.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-FIRE-3")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-DEEP-CURRENT");
      expect(game.players[0].hand).toHaveLength(2);
      expect(game.players[0].discard).toHaveLength(2);
    },
  },
  echo_urn: {
    cardId: "MEM-ECHO-URN",
    description: "1ターンに1回、トラッシュから手札にカードが戻った時に1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-ECHO-URN");
      game.players[0].hand = [card("CMD-EARTH-RITE")];
      game.players[0].field = [card("AI-EARTH-1")];
      game.players[0].discard = [card("AI-FIRE-2")];
      game.players[0].deck = [card("AI-WATER-1")];
      useCommandAtInDraft(game, 0, 0);
      expect(game.players[0].hand.map((item) => item.id).sort()).toEqual(["AI-FIRE-2", "AI-WATER-1"]);
      expect(game.players[0].echoUrnUsed).toBe(true);
      expect(applyEchoUrnDraw(game.players[0])).toHaveLength(0);
    },
  },
  storm_core: {
    cardId: "MEM-STORM-CORE",
    description: "自分がチャージした後、相手の未消耗召喚獣1体を消耗させる",
    run: () => {
      const game = playableChargeGame("AI-FIRE-1");
      game.players[0].memory = card("MEM-STORM-CORE");
      game.players[1].field = [card("AI-FIRE-1"), card("AI-FIRE-4")];
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[1].spentFieldIndexes).toEqual(new Set([1]));
    },
  },
  tidal_mirror: {
    cardId: "MEM-TIDAL-MIRROR",
    description: "自分の召喚獣が場防御した時に1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-TIDAL-MIRROR");
      game.players[0].field = [card("AI-EARTH-1")];
      game.players[0].deck = [card("AI-WATER-1")];
      game.players[1].field = [card("AI-FIRE-2")];
      game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };
      resolveDefenseInDraft(game, { type: "field", index: 0 }, {});
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-WATER-1"]);
      expect(game.players[0].life).toBe(CONFIG.life - 2);
      expect(game.players[0].field).toHaveLength(0);
    },
  },
  dual_banner: {
    cardId: "MEM-DUAL-BANNER",
    description: "ターン開始時、場に2属性以上あり手札2枚以下なら2枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].memory = card("MEM-DUAL-BANNER");
      game.players[0].field = [card("AI-FIRE-1"), card("AI-WATER-1")];
      game.players[0].deck = [card("AI-WATER-1"), card("AI-WATER-2")];
      expect(applyTurnStartMemory(game.players[0]).map((item) => item.id)).toEqual(["AI-WATER-2", "AI-WATER-1"]);

      const mono = blankGame();
      mono.players[0].memory = card("MEM-DUAL-BANNER");
      mono.players[0].field = [card("AI-FIRE-1"), card("AI-FIRE-2")];
      mono.players[0].deck = [card("AI-WATER-1")];
      expect(applyTurnStartMemory(mono.players[0])).toHaveLength(0);
    },
  },
} satisfies Partial<Record<ActiveEffect, EffectCase>>;

describe("card effect coverage", () => {
  it("registers every active card effect exactly once", () => {
    const activeEffects = new Set(
      activeCardPool()
        .map((item) => item.effect)
        .filter((effect): effect is ActiveEffect => Boolean(effect)),
    );
    const registeredEffects = new Set(Object.keys(CARD_EFFECT_CASES) as ActiveEffect[]);
    const missing = [...activeEffects].filter((effect) => !registeredEffects.has(effect)).sort();
    const stale = [...registeredEffects].filter((effect) => !activeEffects.has(effect)).sort();
    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });

  it("points each registered effect at a card that currently has that effect", () => {
    Object.entries(CARD_EFFECT_CASES).forEach(([effect, testCase]) => {
      expect(card(testCase.cardId).effect, `${effect} should use ${testCase.cardId}`).toBe(effect);
    });
  });

  it("keeps every active effect visible in player-facing text", () => {
    Object.entries(CARD_EFFECT_CASES).forEach(([effect, testCase]) => {
      const target = card(testCase.cardId);
      const text = target.type === "ai" ? aiEffectText(target) : target.name;
      expect(text, `${effect} should have visible text`).not.toBe("効果なし");
    });
  });
});

describe("registered card effect behavior", () => {
  Object.entries(CARD_EFFECT_CASES).forEach(([effect, testCase]) => {
    it(`${effect}: ${testCase.description}`, () => {
      testCase.run();
    });
  });
});

describe("AI-FIRE-1D relic thief is optional for human players", () => {
  it("raises a pending confirm target for a human instead of auto-trashing", () => {
    const game = blankGame();
    const target = card("AI-FIRE-1D");
    game.players[0].isHuman = true;
    game.players[0].field = [target];
    game.players[1].memory = card("MEM-CACHE");
    applyPlayEffects(game, game.players[0], target, 0, 1);
    expect(game.players[1].memory).not.toBeNull();
    expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
    expect(game.pendingTarget?.kind).toBe("confirm");
    expect(game.pendingTarget && "reason" in game.pendingTarget ? game.pendingTarget.reason : null).toBe("relic-thief-trash");
  });

  it("does not raise a pending target when the opponent has no relic", () => {
    const game = blankGame();
    const target = card("AI-FIRE-1D");
    game.players[0].isHuman = true;
    game.players[0].field = [target];
    applyPlayEffects(game, game.players[0], target, 0, 1);
    expect(game.pendingTarget).toBeNull();
    expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
  });
});

describe("AI-FIRE-3D shares the hand_defense_pierce effect", () => {
  it("pierces hand defense for 1 damage with no attack bonus, damage stays power-based", () => {
    const target = card("AI-FIRE-3D");
    expect(attackCombatValue(target)).toBe(3);
    expect(piercesHandDefense(target)).toBe(true);
    expect(attackDamage(target)).toBe(3);
    const game = blankGame();
    game.players[0].field = [target];
    game.players[1].hand = [card("AI-FIRE-3")];
    game.pendingAttack = { attackerIndex: 0, defenderIndex: 1, fieldIndex: 0 };
    resolveDefenseInDraft(game, { type: "hand", index: 0 }, {});
    expect(game.players[1].life).toBe(CONFIG.life - 1);
  });
});

describe("firewall field defense flow", () => {
  it("asks a human defender to choose firewall fuel, then resolves with that discard", () => {
    const game = blankGame();
    game.players[0].memory = card("MEM-FIREWALL");
    game.players[0].hand = [card("AI-FIRE-1"), card("AI-EARTH-1")];
    game.players[0].field = [card("AI-WATER-1")];
    game.players[1].field = [card("AI-FIRE-2B")];
    game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };

    resolveDefenseInDraft(game, { type: "field", index: 0 }, {});

    expect(game.pendingAttack).not.toBeNull();
    expect(game.pendingTarget).toMatchObject({
      kind: "hand-discard",
      reason: "firewall",
      playerIndex: 0,
      fieldIndex: 0,
      min: 0,
      max: 1,
    });

    resolveDefenseInDraft(game, { type: "field", index: 0, firewallDiscardIndex: 1 }, {});

    expect(game.pendingAttack).toBeNull();
    expect(game.pendingTarget).toBeNull();
    expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-EARTH-1", "AI-WATER-1"]);
    expect(game.players[1].discard.map((item) => item.id)).toEqual(["AI-FIRE-2B"]);
    expect(game.log[game.log.length - 1]).toContain("竜盾の紋章で苔掘りモールをトラッシュ");
  });

  it("can decline firewall and resolve the field defense without the bonus", () => {
    const game = blankGame();
    game.players[0].memory = card("MEM-FIREWALL");
    game.players[0].hand = [card("AI-EARTH-1")];
    game.players[0].deck = [card("AI-FIRE-1")];
    game.players[0].field = [card("AI-WATER-1")];
    game.players[1].field = [card("AI-FIRE-2B")];
    game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };

    resolveDefenseInDraft(game, { type: "field", index: 0 }, {});
    expect(game.pendingTarget).toMatchObject({ kind: "hand-discard", reason: "firewall", min: 0 });

    resolveDefenseInDraft(game, { type: "field", index: 0, firewallDiscardIndex: null }, {});

    expect(game.pendingAttack).toBeNull();
    expect(game.pendingTarget).toBeNull();
    expect(game.players[0].life).toBe(CONFIG.life - 1);
    expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-EARTH-1", "AI-FIRE-1"]);
    expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-WATER-1"]);
    expect(game.players[1].field.map((item) => item.id)).toEqual(["AI-FIRE-2B"]);
    expect(game.log[game.log.length - 1]).not.toContain("竜盾の紋章で");
  });
});

describe("command usability reasons", () => {
  it("allows comeback rite when life is behind even without a deck or spent summon", () => {
    const game = blankGame();
    const player = game.players[0];
    const opponent = game.players[1];
    player.life = 3;
    opponent.life = 5;
    player.hand = [card("CMD-COMEBACK-RITE")];
    player.deck = [];
    player.field = [card("AI-FIRE-2")];
    player.spentFieldIndexes.clear();

    expect(commandUsable(game, player.hand[0], player, opponent)).toBe(true);
    expect(commandBlockedReason(game, player.hand[0], player, opponent)).toBe("");

    useCommandAtInDraft(game, 0, null);
    expectCommandUsed(game, "CMD-COMEBACK-RITE");
    expect(game.players[0].hand).toHaveLength(0);
    expect(game.players[0].spentFieldIndexes.size).toBe(0);
  });
});

describe("life damage event metadata", () => {
  it("marks lethal command damage as fatal", () => {
    const game = blankGame();
    const events: DuelEventPayload[] = [];
    game.players[0].hand = [card("CMD-TRINITY")];
    game.players[0].field = [card("AI-FIRE-1"), card("AI-WATER-1"), card("AI-WIND-1")];
    game.players[1].life = 1;

    useCommandAtInDraft(game, 0, null, [], {
      showDuelEvent: (event) => events.push(event),
    });

    expect(events[events.length - 1]?.cards).toHaveLength(3);
    expect(events[events.length - 1]?.cards.map((entry) => entry.label)).toEqual(["犠牲", "犠牲", "犠牲"]);
    expect(events[events.length - 1]?.impact).toMatchObject({
      kind: "life-damage",
      targetPlayerIndex: 1,
      fatal: true,
    });
  });

  it("shows every stacked trinity sacrifice card", () => {
    const game = blankGame();
    const events: DuelEventPayload[] = [];
    const player = game.players[0];
    player.hand = [card("CMD-TRINITY")];
    player.field = [card("AI-FIRE-2"), card("AI-WATER-1"), card("AI-WIND-1")];
    stackUpgradeCard(player, 0, card("AI-FIRE-1"));

    useCommandAtInDraft(game, 0, null, [], {
      showDuelEvent: (event) => events.push(event),
    });

    expect(events[events.length - 1]?.cards.map((entry) => entry.card.id)).toEqual([
      "AI-FIRE-2",
      "AI-FIRE-1",
      "AI-WATER-1",
      "AI-WIND-1",
    ]);
  });

  it("marks lethal attack damage as fatal", () => {
    const game = blankGame();
    const events: DuelEventPayload[] = [];
    game.players[0].field = [card("AI-FIRE-1")];
    game.players[1].life = 1;
    game.pendingAttack = { attackerIndex: 0, defenderIndex: 1, fieldIndex: 0 };

    resolveDefenseInDraft(game, { type: "none" }, {
      showDuelEvent: (event) => events.push(event),
    });

    expect(events[events.length - 1]?.impact).toMatchObject({
      kind: "life-damage",
      targetPlayerIndex: 1,
      fatal: true,
    });
  });

  it("clamps attack damage at zero life", () => {
    const game = blankGame();
    game.players[0].field = [card("AI-FIRE-4")];
    game.players[1].life = 1;
    game.pendingAttack = { attackerIndex: 0, defenderIndex: 1, fieldIndex: 0 };

    resolveDefenseInDraft(game, { type: "none" });

    expect(game.players[1].life).toBe(0);
    expect(game.winner).toBe(0);
  });

  it("clamps command damage at zero life", () => {
    const game = blankGame();
    game.players[0].hand = [card("CMD-TRINITY")];
    game.players[0].field = [card("AI-FIRE-1"), card("AI-WATER-1"), card("AI-WIND-1")];
    game.players[1].life = 0;

    useCommandAtInDraft(game, 0, null);

    expect(game.players[1].life).toBe(0);
    expect(game.winner).toBe(0);
  });

  it("moves stacked upgrade cards with the top field card", () => {
    const game = blankGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-2")];
    player.fieldStacks = [[]];
    stackUpgradeCard(player, 0, player.field[0]);
    player.field[0] = card("AI-FIRE-4");

    const removed = removeFieldStack(player, 0);

    expect(removed.map((item) => item.id)).toEqual(["AI-FIRE-4", "AI-FIRE-2"]);
    expect(player.field).toEqual([]);
    expect(player.fieldStacks).toEqual([]);
  });

  it("emits a discard-to-hand event for automatic recover-on-play", () => {
    const game = blankGame();
    const events: DuelEventPayload[] = [];
    game.active = 1;
    game.actionsRemaining = 4;
    game.players[1].hand = [card("AI-EARTH-4")];
    game.players[1].discard = [card("AI-FIRE-2")];

    performAiActionInDraft(game, { type: "play", index: 0 }, {
      showDuelEvent: (event) => events.push(event),
    });

    const recoverEvent = events.find((event) => event.title.includes("回収"));
    expect(recoverEvent).toMatchObject({
      kind: "trash",
      fromLabel: "トラッシュ",
      toLabel: "手札",
    });
    expect(recoverEvent?.cards[0]?.card.id).toBe("AI-FIRE-2");
    expect(game.players[1].hand.map((item) => item.id)).toContain("AI-FIRE-2");
  });

  it("keeps power 4 play events as normal summon events", () => {
    const game = blankGame();
    const events: DuelEventPayload[] = [];
    game.active = 1;
    game.actionsRemaining = 4;
    game.players[1].hand = [card("AI-FIRE-4")];

    performAiActionInDraft(game, { type: "play", index: 0 }, {
      showDuelEvent: (event) => events.push(event),
    });

    expect(events[0]).toMatchObject({
      kind: "play",
      title: "ライバルが場に出す",
      cards: [{ label: "登場", state: "neutral" }],
    });
    expect(events[0]?.emphasis).toBeUndefined();
  });

  it("keeps power 4 upgrade events as normal upgrade events", () => {
    const game = blankGame();
    const events: DuelEventPayload[] = [];
    game.active = 1;
    game.actionsRemaining = 4;
    game.players[1].hand = [card("AI-FIRE-4")];
    game.players[1].field = [card("AI-FIRE-3")];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 }, {
      showDuelEvent: (event) => events.push(event),
    });

    expect(events[0]).toMatchObject({
      kind: "upgrade",
      title: "ライバルがアップグレード",
    });
    expect(events[0]?.emphasis).toBeUndefined();
    expect(events[0]?.cards[1]).toMatchObject({ label: "新", state: "winner" });
  });
});
