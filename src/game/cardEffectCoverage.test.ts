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
  applyTurnStartMemory,
  attackCombatValue,
  blocksLowLifeHandDefense,
  canUseFirewall,
  cannotHandDefend,
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
  returnsAfterOverheat,
  selfDamagesOnPlay,
  spendsEnemyOnPlay,
  startTurn,
} from "../game";
import {
  applyPlayEffects,
  chargeHandCardInDraft,
  confirmChargeGuardTargetInDraft,
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
    player.memory = null;
    player.discard = [];
    player.cardsDrawn = 0;
    player.turnsStarted = 1;
    player.handDefensesUsed = 0;
    player.pipelineUsed = false;
    player.acceleratorUsed = false;
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
    description: "攻撃値+1かつ手札防御不可",
    run: () => {
      const target = card("AI-FIRE-3B");
      expect(attackCombatValue(target)).toBe(4);
      expect(cannotHandDefend(target)).toBe(true);
    },
  },
  draw_two_after_overheat: {
    cardId: "AI-FIRE-4",
    description: "攻撃後退場時2枚ドロー対象になる",
    run: () => expect(drawsTwoAfterOverheat(card("AI-FIRE-4"))).toBe(true),
  },
  draw_two_after_overheat_opponent_draw: {
    cardId: "AI-WATER-4B",
    description: "攻撃後退場2枚ドローと登場時相手ドローを持つ",
    run: () => {
      const game = blankGame();
      game.players[1].deck = [card("AI-FIRE-1")];
      const target = card("AI-WATER-4B");
      applyPlayEffects(game, game.players[0], target, 0, 1);
      expect(drawsTwoAfterOverheat(target)).toBe(true);
      expect(opponentDrawsOnPlay(target)).toBe(true);
      expect(game.players[1].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    },
  },
  draw_on_play: {
    cardId: "AI-WATER-1",
    description: "登場時に1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].deck = [card("AI-FIRE-1")];
      applyPlayEffects(game, game.players[0], card("AI-WATER-1"), 0, 1);
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
    description: "登場時に2枚引き、捨て札選択を要求する",
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
  spend_enemy_on_play: {
    cardId: "AI-WIND-2B",
    description: "登場時に相手の未消耗召喚獣選択を要求する",
    run: () => {
      const game = blankGame();
      game.players[1].field = [card("AI-FIRE-2")];
      applyPlayEffects(game, game.players[0], card("AI-WIND-2B"), 0, 1);
      expect(spendsEnemyOnPlay(card("AI-WIND-2B"))).toBe(true);
      expect(game.pendingTarget?.kind).toBe("card-select");
      expect(game.pendingTarget && "reason" in game.pendingTarget ? game.pendingTarget.reason : null).toBe("spend-enemy");
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
  low_life_no_hand_defense_self_damage: {
    cardId: "AI-FIRE-4B",
    description: "低ライフ手札防御不可と登場時自傷を持つ",
    run: () => {
      const game = blankGame();
      const target = card("AI-FIRE-4B");
      game.players[1].life = 2;
      applyPlayEffects(game, game.players[0], target, 0, 1);
      expect(blocksLowLifeHandDefense(target, game.players[1])).toBe(true);
      expect(selfDamagesOnPlay(target)).toBe(true);
      expect(game.players[0].life).toBe(CONFIG.life - 1);
    },
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
  return_after_overheat_cannot_hand_defend: {
    cardId: "AI-WIND-4B",
    description: "攻撃後退場時に手札へ戻り、手札防御不可で、消耗登場する",
    run: () => {
      const target = card("AI-WIND-4B");
      expect(returnsAfterOverheat(target)).toBe(true);
      expect(cannotHandDefend(target)).toBe(true);
      expect(entersSpentOnPlay(target)).toBe(true);
    },
  },
  draw_on_successful_defense: {
    cardId: "AI-EARTH-1B",
    description: "場防御成功時ドロー対象になる",
    run: () => expect(drawsOnSuccessfulDefense(card("AI-EARTH-1B"))).toBe(true),
  },
  draw_on_successful_defense_enters_spent: {
    cardId: "AI-EARTH-4B",
    description: "場防御成功時ドロー対象で、消耗登場する",
    run: () => {
      const target = card("AI-EARTH-4B");
      expect(drawsOnSuccessfulDefense(target)).toBe(true);
      expect(entersSpentOnPlay(target)).toBe(true);
    },
  },
  charge_pressure: {
    cardId: "AI-FIRE-1C",
    description: "チャージ時に相手手札が3枚以上なら1枚トラッシュする",
    run: () => {
      const game = playableChargeGame("AI-FIRE-1C");
      game.players[1].hand = [card("AI-WATER-1"), card("AI-WATER-2"), card("AI-WATER-3")];
      chargeHandCardInDraft(game, 0, 0);
      expect(hasChargeEffect(card("AI-FIRE-1C"))).toBe(true);
      expect(game.players[1].hand).toHaveLength(2);
      expect(game.players[1].discard).toHaveLength(1);
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
      game.players[0].field = [card("AI-WIND-1")];
      game.players[0].spentFieldIndexes.add(0);
      chargeHandCardInDraft(game, 0, 0);
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
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
    description: "水召喚獣がいれば1枚引く",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-WATER-RITE")];
      game.players[0].field = [card("AI-WATER-1")];
      game.players[0].deck = [card("AI-FIRE-1")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-WATER-RITE");
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    },
  },
  wind_rite: {
    cardId: "CMD-WIND-RITE",
    description: "風召喚獣がいれば相手を消耗し、自分の風を回復する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-WIND-RITE")];
      game.players[0].field = [card("AI-WIND-1")];
      game.players[0].spentFieldIndexes.add(0);
      game.players[1].field = [card("AI-FIRE-2")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-WIND-RITE");
      expect(game.players[0].spentFieldIndexes.has(0)).toBe(false);
      expect(game.players[1].spentFieldIndexes).toEqual(new Set([0]));
    },
  },
  earth_rite: {
    cardId: "CMD-EARTH-RITE",
    description: "土召喚獣がいればトラッシュの召喚獣を回収する",
    run: () => {
      const game = blankGame();
      game.players[0].hand = [card("CMD-EARTH-RITE")];
      game.players[0].field = [card("AI-EARTH-1")];
      game.players[0].discard = [card("AI-FIRE-2")];
      useCommandAtInDraft(game, 0, null);
      expectCommandUsed(game, "CMD-EARTH-RITE");
      expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-2"]);
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
    description: "ライフ劣勢時、そのターン最初の召喚獣登場コストを1下げる。最低1",
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

    expect(events[events.length - 1]?.impact).toMatchObject({
      kind: "life-damage",
      targetPlayerIndex: 1,
      fatal: true,
    });
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
});
