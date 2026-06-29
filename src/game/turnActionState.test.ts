import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  cloneCard,
  createGame,
  finishTurn,
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
    expect(game.actionsRemaining).toBe(CONFIG.firstPlayerFirstTurnActions);

    finishTurn(game, true);

    expect(game.active).toBe(1);
    expect(game.actionsRemaining).toBe(CONFIG.eachPlayerFirstTurnActions);

    game.players[1].hand = [card("AI-WATER-1")];
    game.players[1].deck = [card("AI-WATER-2")];
    const charged = chargeHandCardInDraft(game, 1, 0);

    expect(charged?.id).toBe("AI-WATER-1");
    expect(game.active).toBe(1);
    expect(game.actionsRemaining).toBe(3);

    finishTurn(game, true);

    expect(game.active).toBe(0);
    expect(game.actionsRemaining).toBe(CONFIG.actionsPerTurn);
  });
});
