import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  chooseAiAction,
  cloneCard,
  createGame,
  estimatePublicHandDefenseValue,
  type GameState,
} from "../game";
import { beginAttackInDraft, performAiActionInDraft } from "./actions";
import { runMatch } from "../sim/runner";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

// Python の no_opening_hands + start_turn 相当の初期状態を作るヘルパー。
// createGame 後に手札・山札・場を直接上書きして使う。
function makeGame(seed: number): GameState {
  const game = createGame(
    seed,
    { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
    { kind: "custom", name: "Test Rival", cardIds: ["AI-WATER-1"] },
  );
  for (const player of game.players) {
    player.deck = [];
    player.hand = [];
    player.field = [];
    player.spentFieldIndexes.clear();
  }
  return game;
}

describe("ai strategy", () => {
  it("uses optimize even without a useful effect, then ends the turn", () => {
    // 2026-07-06 のリワークで CMD-OPTIMIZE の「手札2枚以上」制約を撤廃したため、
    // 山札が空でも自分自身をトラッシュへ送るだけの発動が選ばれ得る。
    const game = makeGame(41);
    game.players[0].isHuman = false;
    game.players[0].hand = [card("CMD-OPTIMIZE")];

    const action = chooseAiAction(game, "challenger");
    expect(action.type).toBe("command");

    performAiActionInDraft(game, action);

    expect(game.players[0].hand).toEqual([]);
    expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
  });

  it("can choose charge at zero actions", () => {
    const game = makeGame(42);
    game.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-1")];
    game.actionsRemaining = 0;
    game.chargedActionsRemaining = 0;

    const action = chooseAiAction(game, "challenger");

    expect(action.type).toBe("charge");
    if (action.type === "charge") expect(action.index).toBe(0);
  });

  it("ends at zero actions when charge is not useful", () => {
    const game = makeGame(43);
    game.players[0].hand = [card("CMD-OPTIMIZE")];
    game.actionsRemaining = 0;
    game.chargedActionsRemaining = 0;

    expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
  });

  it("beginner attacks when the field cannot block", () => {
    const game = makeGame(44);
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].field = [card("AI-FIRE-2")];
    game.players[1].field = [card("AI-FIRE-1")];

    const action = chooseAiAction(game, "beginner");

    expect(action.type).toBe("attack");
    if (action.type === "attack") expect(action.index).toBe(0);
  });

  it("beginner skips an attack blocked by a field defender", () => {
    const game = makeGame(45);
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].field = [card("AI-FIRE-1")];
    game.players[1].field = [card("AI-WATER-2")];

    expect(chooseAiAction(game, "beginner")).toEqual({ type: "end" });
  });

  it("beginner defends when possible", () => {
    const game = makeGame(46);
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].field = [card("AI-FIRE-1")];
    game.players[1].field = [card("AI-WATER-2")];
    game.players[1].aiProfile = "beginner";

    beginAttackInDraft(game, 0, 0);

    expect(game.players[1].life).toBe(8);
  });

  it("beginner summons with field room", () => {
    const game = makeGame(47);
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].field = [card("AI-WATER-2")];
    game.players[0].hand = [card("AI-FIRE-1"), card("AI-FIRE-2")];
    game.players[1].field = [card("AI-WATER-2")];

    const action = chooseAiAction(game, "beginner");

    expect(action.type).toBe("play");
    if (action.type === "play") expect(action.index).toBe(0);
  });

  it("challenger profile beats beginner with the same deck", () => {
    let challengerWins = 0;
    const games = 24;
    for (let offset = 0; offset < games; offset += 1) {
      const record = runMatch(9000 + offset, {
        firstDeck: "fire",
        secondDeck: "fire",
        aiProfiles: ["challenger", "beginner"],
      });
      if (record.game.winner === 0) challengerWins += 1;
    }
    // WP4 (2026-07-04) 以降、初心者は防御と単純攻撃を行うため全勝は期待しない。
    // 目標水準: 挑戦者が大きく勝ち越しつつ、初心者も 5-20% 程度勝てること。
    expect(challengerWins / games).toBeGreaterThanOrEqual(0.7);
  });

  it("estimates hand defense from public zones and hand size, not actual hand identities", () => {
    const first = makeGame(48);
    const second = makeGame(48);
    for (const game of [first, second]) {
      game.players[1].deckName = "火単色デッキ";
      game.players[1].field = [card("AI-FIRE-1")];
      game.players[1].discard = [card("AI-FIRE-2")];
    }
    first.players[1].hand = [card("AI-WATER-4"), card("CMD-OPTIMIZE")];
    second.players[1].hand = [card("AI-EARTH-1"), card("MEM-CACHE")];

    const attackCard = card("AI-FIRE-2");

    expect(estimatePublicHandDefenseValue(first.players[1], attackCard))
      .toBe(estimatePublicHandDefenseValue(second.players[1], attackCard));
  });
});
