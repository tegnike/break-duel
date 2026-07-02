import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  actionsForTurn,
  type Card,
  chooseAiAction,
  cloneCard,
  createGame,
  finishTurn,
  upgradeSourceIndexes,
} from "../game";
import { chargeHandCardInDraft } from "./actions";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

describe("turn action state", () => {
  it("keeps actionsRemaining scoped to the active turn", () => {
    const game = createGame(
      7,
      { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1", "AI-FIRE-2"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-WATER-1", "AI-WATER-2"] },
    );

    expect(game.active).toBe(0);
    expect(game.actionsRemaining).toBe(actionsForTurn(game));

    finishTurn(game, true);

    expect(game.active).toBe(1);
    expect(game.actionsRemaining).toBe(actionsForTurn(game));

    game.players[1].hand = [card("AI-WATER-1")];
    game.players[1].deck = [card("AI-WATER-2")];
    const actionsBeforeCharge = game.actionsRemaining;
    const charged = chargeHandCardInDraft(game, 1, 0);

    expect(charged?.id).toBe("AI-WATER-1");
    expect(game.active).toBe(1);
    expect(game.actionsRemaining).toBe(Math.min(3, actionsBeforeCharge + 1));

    finishTurn(game, true);

    expect(game.active).toBe(0);
    expect(game.actionsRemaining).toBe(CONFIG.actionsPerTurn);
  });

  it("keeps challenger from attacking into a stronger field defender", () => {
    const game = createGame(
      13,
      { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-2"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1"] },
    );
    game.active = 1;
    game.turn = 2;
    game.actionsRemaining = 2;
    game.chargedActionsRemaining = 0;
    game.players[0].deck = [];
    game.players[0].hand = [];
    game.players[0].field = [card("AI-FIRE-2")];
    game.players[0].spentFieldIndexes.clear();
    game.players[1].deck = [];
    game.players[1].hand = [];
    game.players[1].field = [card("AI-FIRE-1")];
    game.players[1].spentFieldIndexes.clear();

    expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
  });

  it("keeps challenger from charging without a follow-up or immediate value", () => {
    const game = createGame(
      17,
      { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1C"] },
    );
    game.active = 1;
    game.turn = 2;
    game.actionsRemaining = 0;
    game.chargedActionsRemaining = 0;
    game.players[0].hand = [];
    game.players[1].deck = [];
    game.players[1].hand = [card("AI-FIRE-1C")];
    game.players[1].field = [];

    expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
  });

  it("keeps challenger from charging for a summon when the field is full", () => {
    const game = createGame(
      18,
      { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1", "AI-WIND-2"] },
    );
    game.active = 1;
    game.turn = 2;
    game.actionsRemaining = 2;
    game.chargedActionsRemaining = 0;
    game.players[1].deck = [];
    game.players[1].hand = [card("AI-FIRE-1"), card("AI-WIND-2")];
    game.players[1].field = [card("AI-FIRE-2"), card("AI-WATER-2"), card("AI-EARTH-2")];
    game.players[1].spentFieldIndexes = new Set([0, 1, 2]);

    expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
  });

  it("keeps challenger from using accelerator without an enabled summon", () => {
    const game = createGame(
      19,
      { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1"] },
    );
    game.active = 1;
    game.turn = 2;
    game.actionsRemaining = 1;
    game.chargedActionsRemaining = 0;
    game.players[1].memory = card("MEM-ACCELERATOR");
    game.players[1].deck = [];
    game.players[1].hand = [];
    game.players[1].field = [card("AI-FIRE-1")];
    game.players[1].spentFieldIndexes.add(0);

    expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
  });

  it("filters upgrade source choices by the remaining action cost", () => {
    const game = createGame(
      23,
      { kind: "custom", name: "Test Player", cardIds: ["AI-WATER-3"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1"] },
    );
    game.players[0].field = [
      card("AI-WATER-1"),
      card("AI-WATER-2"),
      card("AI-WATER-1C"),
    ];
    const target = card("AI-WATER-3");

    expect(upgradeSourceIndexes(game.players[0], target).map((index) => game.players[0].field[index].id)).toEqual([
      "AI-WATER-1",
      "AI-WATER-2",
      "AI-WATER-1C",
    ]);
    expect(upgradeSourceIndexes(game.players[0], target, 1).map((index) => game.players[0].field[index].id)).toEqual([
      "AI-WATER-2",
    ]);
  });
});
