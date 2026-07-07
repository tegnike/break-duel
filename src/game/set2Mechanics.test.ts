import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Attribute,
  type Card,
  addTurnFieldAttackBonus,
  addTurnGlobalAttackBonus,
  attackCombatValue,
  canUpgrade,
  canUseFirewall,
  cardAttributes,
  cloneCard,
  commandUsable,
  createGame,
  finishTurn,
  hasAttribute,
  hasAttributeAi,
  hasChargedThisTurn,
  legalFieldDefenders,
  legalHandDefenders,
  recoverMemoryFromDiscard,
  removeFieldStack,
  resetTurnAttackBuffs,
  reviveAiFromDiscard,
  setNextAttackUnblockable,
  sharesAttribute,
  trashMemory,
  turnAttackBonus,
} from "../game";
import { beginAttackInDraft, chargeHandCardInDraft } from "./actions";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

function dualCard(attribute: Attribute, subAttribute: Attribute, power = 3): Card {
  return {
    id: "AI-DUAL-TEST",
    name: "デュアルテスト獣",
    type: "ai",
    attribute,
    subAttribute,
    power,
    effect: "",
    status: "active",
  };
}

function makeTestGame(seed = 41) {
  return createGame(
    seed,
    { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1", "AI-FIRE-2"] },
    { kind: "custom", name: "Test Rival", cardIds: ["AI-WATER-1", "AI-WATER-2"] },
  );
}

describe("dual attribute helpers", () => {
  it("hasAttribute matches primary and sub attribute", () => {
    const magma = dualCard("火", "土");
    expect(hasAttribute(magma, "火")).toBe(true);
    expect(hasAttribute(magma, "土")).toBe(true);
    expect(hasAttribute(magma, "水")).toBe(false);
    expect(cardAttributes(magma)).toEqual(["火", "土"]);
    const single = card("AI-FIRE-1");
    expect(hasAttribute(single, "火")).toBe(true);
    expect(hasAttribute(single, "土")).toBe(false);
    expect(cardAttributes(single)).toEqual(["火"]);
  });

  it("sharesAttribute keeps single-attribute behavior and covers dual cards", () => {
    expect(sharesAttribute(card("AI-FIRE-1"), card("AI-FIRE-2"))).toBe(true);
    expect(sharesAttribute(card("AI-FIRE-1"), card("AI-WATER-2"))).toBe(false);
    const magma = dualCard("火", "土");
    expect(sharesAttribute(magma, card("AI-EARTH-2"))).toBe(true);
    expect(sharesAttribute(card("AI-EARTH-2"), magma)).toBe(true);
    expect(sharesAttribute(magma, card("AI-WATER-2"))).toBe(false);
  });

  it("dual attribute satisfies rite command conditions for both attributes", () => {
    const game = makeTestGame();
    const player = game.players[0];
    const opponent = game.players[1];
    player.field = [dualCard("火", "土")];
    player.discard = [card("AI-EARTH-1")];
    expect(hasAttributeAi(player, "火")).toBe(true);
    expect(hasAttributeAi(player, "土")).toBe(true);
    expect(hasAttributeAi(player, "水")).toBe(false);
    expect(commandUsable(game, card("CMD-FIRE-RITE"), player, opponent)).toBe(true);
    expect(commandUsable(game, card("CMD-EARTH-RITE"), player, opponent)).toBe(true);
    expect(commandUsable(game, card("CMD-WATER-RITE"), player, opponent)).toBe(false);
  });

  it("firewall treats a shared dual attribute as same attribute", () => {
    const game = makeTestGame();
    const defender = game.players[1];
    defender.memory = card("MEM-FIREWALL");
    defender.hand = [card("AI-WATER-1")];
    const dualDefense = dualCard("火", "土", 2);
    expect(canUseFirewall(defender, dualDefense, card("AI-EARTH-3"))).toBe(false);
    expect(canUseFirewall(defender, dualDefense, card("AI-FIRE-3"))).toBe(false);
    expect(canUseFirewall(defender, dualDefense, card("AI-WATER-3"))).toBe(true);
  });

  it("dual attribute can upgrade from either attribute source", () => {
    const magma = dualCard("火", "土");
    expect(canUpgrade(card("AI-FIRE-2"), magma)).toBe(true);
    expect(canUpgrade(card("AI-EARTH-2"), magma)).toBe(true);
    expect(canUpgrade(card("AI-WATER-2"), magma)).toBe(false);
    // 既存単属性カードの挙動は不変
    expect(canUpgrade(card("AI-FIRE-2"), card("AI-FIRE-3"))).toBe(true);
    expect(canUpgrade(card("AI-FIRE-2"), card("AI-WATER-3"))).toBe(false);
  });
});

describe("turn-scoped attack buffs", () => {
  it("single-target buff raises combat attack value for that field index only", () => {
    const game = makeTestGame();
    const attacker = game.players[0];
    const attackCard = card("AI-FIRE-1");
    attacker.field = [attackCard, card("AI-FIRE-2")];
    addTurnFieldAttackBonus(attacker, 0, 1);
    expect(turnAttackBonus(attacker, 0)).toBe(1);
    expect(turnAttackBonus(attacker, 1)).toBe(0);
    expect(attackCombatValue(attackCard, { attacker, attackerFieldIndex: 0 })).toBe(2);
    expect(attackCombatValue(attackCard)).toBe(1);
  });

  it("global buff raises combat attack value for every own summon", () => {
    const game = makeTestGame();
    const attacker = game.players[0];
    attacker.field = [card("AI-FIRE-1"), card("AI-FIRE-2")];
    addTurnGlobalAttackBonus(attacker, 1);
    expect(turnAttackBonus(attacker, 0)).toBe(1);
    expect(turnAttackBonus(attacker, 1)).toBe(1);
    expect(attackCombatValue(attacker.field[1], { attacker, attackerFieldIndex: 1 })).toBe(4);
  });

  it("buffed attack breaks through a defender that could otherwise block", () => {
    const game = makeTestGame();
    game.turn = 3;
    game.actionsRemaining = 3;
    game.chargedActionsRemaining = 0;
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-FIRE-1")];
    attacker.spentFieldIndexes.clear();
    defender.field = [card("AI-WATER-1")];
    defender.spentFieldIndexes.clear();
    defender.hand = [];
    defender.deck = [];
    const context = { attacker, attackerFieldIndex: 0 };
    expect(legalFieldDefenders(defender, attacker.field[0], context)).toHaveLength(1);
    addTurnFieldAttackBonus(attacker, 0, 1);
    expect(legalFieldDefenders(defender, attacker.field[0], context)).toHaveLength(0);

    const lifeBefore = defender.life;
    beginAttackInDraft(game, 0, 0);
    // ダメージは power 由来のまま（攻撃値補正はダメージに影響しない）
    expect(defender.life).toBe(lifeBefore - 1);
    expect(defender.field).toHaveLength(1);
  });

  it("next-attack-unblockable disables hand defense and is consumed by the attack", () => {
    const game = makeTestGame();
    game.turn = 3;
    game.actionsRemaining = 3;
    game.chargedActionsRemaining = 0;
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-FIRE-1")];
    attacker.spentFieldIndexes.clear();
    defender.field = [];
    defender.hand = [card("AI-WATER-4")];
    defender.deck = [];

    const attackCard = attacker.field[0];
    expect(legalHandDefenders(defender, attackCard, { attacker, attackerFieldIndex: 0 })).toHaveLength(1);
    setNextAttackUnblockable(attacker);
    expect(legalHandDefenders(defender, attackCard, { attacker, attackerFieldIndex: 0 })).toHaveLength(0);

    const lifeBefore = defender.life;
    beginAttackInDraft(game, 0, 0);
    expect(defender.life).toBe(lifeBefore - 1);
    expect(defender.hand).toHaveLength(1);
    expect(attacker.nextAttackUnblockable).toBe(false);
  });

  it("turn attack buffs reset at end of turn", () => {
    const game = makeTestGame();
    const player = game.players[game.active];
    player.field = [card("AI-FIRE-1")];
    addTurnFieldAttackBonus(player, 0, 2);
    addTurnGlobalAttackBonus(player, 1);
    setNextAttackUnblockable(player);
    finishTurn(game, true);
    expect(player.turnFieldAttackBonuses.size).toBe(0);
    expect(player.turnGlobalAttackBonus).toBe(0);
    expect(player.nextAttackUnblockable).toBe(false);
  });

  it("single-target buff indexes shift when a lower field slot is removed", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-WATER-2")];
    addTurnFieldAttackBonus(player, 1, 1);
    addTurnFieldAttackBonus(player, 2, 2);
    removeFieldStack(player, 0);
    expect(player.turnFieldAttackBonuses.get(0)).toBe(1);
    expect(player.turnFieldAttackBonuses.get(1)).toBe(2);
    expect(player.turnFieldAttackBonuses.has(2)).toBe(false);
    resetTurnAttackBuffs(player);
    expect(player.turnFieldAttackBonuses.size).toBe(0);
  });
});

describe("revive from discard", () => {
  it("puts a discarded summon onto the field in spent state", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.field = [];
    player.fieldStacks = [];
    player.discard = [card("CMD-OPTIMIZE"), card("AI-FIRE-2")];
    const revived = reviveAiFromDiscard(player, 1);
    expect(revived?.id).toBe("AI-FIRE-2");
    expect(player.field.map((c) => c.id)).toEqual(["AI-FIRE-2"]);
    expect(player.spentFieldIndexes.has(0)).toBe(true);
    expect(player.discard.map((c) => c.id)).toEqual(["CMD-OPTIMIZE"]);
  });

  it("rejects non-summon targets and a full field", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.discard = [card("CMD-OPTIMIZE"), card("AI-FIRE-2")];
    player.field = [];
    expect(reviveAiFromDiscard(player, 0)).toBeNull();
    player.field = [card("AI-FIRE-1"), card("AI-WATER-1"), card("AI-WIND-1")];
    expect(player.field).toHaveLength(CONFIG.fieldLimit);
    expect(reviveAiFromDiscard(player, 1)).toBeNull();
    expect(player.discard).toHaveLength(2);
  });
});

describe("relic manipulation", () => {
  it("trashMemory sends the relic to discard", () => {
    const game = makeTestGame();
    const opponent = game.players[1];
    expect(trashMemory(opponent)).toBeNull();
    opponent.memory = card("MEM-CACHE");
    const trashed = trashMemory(opponent);
    expect(trashed?.id).toBe("MEM-CACHE");
    expect(opponent.memory).toBeNull();
    expect(opponent.discard[opponent.discard.length - 1]?.id).toBe("MEM-CACHE");
  });

  it("recoverMemoryFromDiscard returns only relic cards to hand", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.hand = [];
    player.discard = [card("AI-FIRE-1"), card("MEM-FIREWALL")];
    expect(recoverMemoryFromDiscard(player, 0)).toBeNull();
    const recovered = recoverMemoryFromDiscard(player, 1);
    expect(recovered?.id).toBe("MEM-FIREWALL");
    expect(player.hand.map((c) => c.id)).toEqual(["MEM-FIREWALL"]);
    expect(player.discard.map((c) => c.id)).toEqual(["AI-FIRE-1"]);
  });
});

describe("charge reference", () => {
  it("hasChargedThisTurn reflects the active player's charge and resets next turn", () => {
    const game = makeTestGame(7);
    const player = game.players[0];
    expect(hasChargedThisTurn(player)).toBe(false);
    player.hand = [card("AI-FIRE-1")];
    player.deck = [card("AI-FIRE-2"), card("AI-FIRE-2")];
    game.actionsRemaining = 1;
    const charged = chargeHandCardInDraft(game, 0, 0);
    expect(charged?.id).toBe("AI-FIRE-1");
    expect(hasChargedThisTurn(player)).toBe(true);
    finishTurn(game, true);
    finishTurn(game, true);
    expect(game.active).toBe(0);
    expect(hasChargedThisTurn(player)).toBe(false);
  });
});
