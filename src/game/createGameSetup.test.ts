import { describe, expect, it } from "vitest";
import { createGame, createGameFromSetup, type AiProfile, type GameState } from "../game";

function initialState(game: GameState) {
  return {
    seed: game.seed,
    active: game.active,
    turn: game.turn,
    actionsRemaining: game.actionsRemaining,
    players: game.players.map((player) => ({
      name: player.name,
      deckName: player.deckName,
      aiProfile: player.aiProfile,
      deck: player.deck.map((card) => card.id),
      hand: player.hand.map((card) => card.id),
    })),
    log: game.log,
  };
}

describe("createGameFromSetup", () => {
  for (const seed of [1, 4101, 730001]) {
    for (const aiProfile of ["beginner", "challenger"] satisfies AiProfile[]) {
      it(`preserves explicit-deck RNG and initial state for seed ${seed} / ${aiProfile}`, () => {
        const legacy = createGame(seed, "fire", "water", aiProfile);
        const setup = createGameFromSetup(seed, {
          first: { name: "あなた", deck: "fire", isHuman: true, aiProfile: "challenger" },
          second: { name: "ライバル", deck: "water", isHuman: false, aiProfile },
        });
        expect(initialState(setup)).toEqual(initialState(legacy));
      });
    }
  }

  it("uses the resolved opponent name, deck and profile", () => {
    const game = createGameFromSetup(123, {
      first: { name: "あなた", deck: "fire", isHuman: true, aiProfile: "challenger" },
      second: { name: "ニケ", deck: "earth", isHuman: false, aiProfile: "beginner" },
    });
    expect(game.players[1]).toMatchObject({ name: "ニケ", deckName: "土単色デッキ", aiProfile: "beginner" });
    expect(game.log[0]).toContain("ニケ: 土単色デッキ");
  });
});
