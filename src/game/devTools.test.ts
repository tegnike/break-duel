import { describe, expect, it } from "vitest";
import { CONFIG, createGame, type GameState } from "../game";
import {
  devAddCard,
  devRemoveCard,
  devRemoveFieldCard,
  devSetMatchResult,
  devToggleFieldSpent,
  devTriggerRivalAttack,
} from "./devTools";

function makeTestGame(): GameState {
  return createGame(
    1,
    { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1", "AI-WATER-1"] },
    { kind: "custom", name: "Test Rival", cardIds: ["AI-EARTH-1", "AI-WIND-1"] },
  );
}

describe("devAddCard", () => {
  it("adds a summon to the field and keeps fieldStacks in sync", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.field = [];
    player.fieldStacks = [];

    expect(devAddCard(game, 0, "field", "AI-FIRE-2")).toBe(true);
    expect(player.field).toHaveLength(1);
    expect(player.fieldStacks).toHaveLength(1);
  });

  it("rejects non-summon cards on the field and non-memory cards in the memory slot", () => {
    const game = makeTestGame();
    expect(devAddCard(game, 0, "field", "MEM-FIREWALL")).toBe(false);
    expect(devAddCard(game, 0, "memory", "AI-FIRE-1")).toBe(false);
  });

  it("rejects field additions beyond the field limit", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.field = [];
    player.fieldStacks = [];
    for (let i = 0; i < CONFIG.fieldLimit; i += 1) {
      expect(devAddCard(game, 0, "field", "AI-FIRE-1")).toBe(true);
    }
    expect(devAddCard(game, 0, "field", "AI-FIRE-1")).toBe(false);
    expect(player.field).toHaveLength(CONFIG.fieldLimit);
  });

  it("puts deckTop cards where the next draw happens (end of the deck array)", () => {
    const game = makeTestGame();
    const player = game.players[0];

    expect(devAddCard(game, 0, "deckTop", "AI-WIND-2")).toBe(true);
    expect(player.deck[player.deck.length - 1].id).toBe("AI-WIND-2");

    expect(devAddCard(game, 0, "deckBottom", "AI-EARTH-2")).toBe(true);
    expect(player.deck[0].id).toBe("AI-EARTH-2");
  });
});

describe("devRemoveFieldCard", () => {
  it("shifts index-based tracking when removing a field card", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.field = [];
    player.fieldStacks = [];
    devAddCard(game, 0, "field", "AI-FIRE-1");
    devAddCard(game, 0, "field", "AI-WATER-1");
    devAddCard(game, 0, "field", "AI-EARTH-1");
    player.spentFieldIndexes = new Set([0, 2]);
    player.turnFieldAttackBonuses = new Map([[0, 1], [2, 2]]);

    expect(devRemoveFieldCard(player, 0)).toBe(true);
    expect(player.field).toHaveLength(2);
    expect(player.fieldStacks).toHaveLength(2);
    expect([...player.spentFieldIndexes]).toEqual([1]);
    expect([...player.turnFieldAttackBonuses.entries()]).toEqual([[1, 2]]);
  });
});

describe("devRemoveCard", () => {
  it("clears a pending attack that points past the shrunken field", () => {
    const game = makeTestGame();
    const rival = game.players[1];
    rival.field = [];
    rival.fieldStacks = [];
    devAddCard(game, 1, "field", "AI-EARTH-1");
    game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };

    expect(devRemoveCard(game, 1, "field", 0)).toBe(true);
    expect(game.pendingAttack).toBeNull();
  });
});

describe("devToggleFieldSpent", () => {
  it("toggles the spent state of a field card", () => {
    const game = makeTestGame();
    const player = game.players[0];
    player.field = [];
    player.fieldStacks = [];
    devAddCard(game, 0, "field", "AI-FIRE-1");

    expect(devToggleFieldSpent(player, 0)).toBe(true);
    expect(player.spentFieldIndexes.has(0)).toBe(true);
    expect(devToggleFieldSpent(player, 0)).toBe(true);
    expect(player.spentFieldIndexes.has(0)).toBe(false);
  });
});

describe("devTriggerRivalAttack", () => {
  it("sets up a pending attack from the rival and readies the attacker", () => {
    const game = makeTestGame();
    const rival = game.players[1];
    rival.field = [];
    rival.fieldStacks = [];
    devAddCard(game, 1, "field", "AI-EARTH-1");
    rival.spentFieldIndexes.add(0);

    expect(devTriggerRivalAttack(game, 0)).toBe(true);
    expect(game.active).toBe(1);
    expect(game.actionsRemaining).toBeGreaterThanOrEqual(1);
    expect(game.pendingAttack).toEqual({ attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 });
    expect(rival.spentFieldIndexes.has(0)).toBe(false);
  });

  it("refuses to trigger without a field card or after the match is resolved", () => {
    const game = makeTestGame();
    game.players[1].field = [];
    game.players[1].fieldStacks = [];
    expect(devTriggerRivalAttack(game, 0)).toBe(false);

    devAddCard(game, 1, "field", "AI-EARTH-1");
    game.winner = 0;
    expect(devTriggerRivalAttack(game, 0)).toBe(false);
  });
});

describe("devSetMatchResult", () => {
  it("sets and clears win, lose and draw states", () => {
    const game = makeTestGame();

    devSetMatchResult(game, "win");
    expect(game.winner).toBe(0);
    expect(game.draw).toBe(false);

    devSetMatchResult(game, "lose");
    expect(game.winner).toBe(1);

    devSetMatchResult(game, "draw");
    expect(game.winner).toBeNull();
    expect(game.draw).toBe(true);

    devSetMatchResult(game, null);
    expect(game.winner).toBeNull();
    expect(game.draw).toBe(false);
  });
});
