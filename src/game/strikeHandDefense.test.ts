import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  type GameState,
  chooseStrikeHandDefense,
  cloneCard,
  createGame,
} from "../game";
import { resolveDefenseInDraft, strikeInDraft } from "./actions";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

function setupGame(): GameState {
  const game = createGame(
    7,
    { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1", "AI-FIRE-2"] },
    { kind: "custom", name: "Test Rival", cardIds: ["AI-WATER-1", "AI-WATER-2"] },
  );
  game.turn = 5;
  game.actionsRemaining = 3;
  game.players.forEach((player) => {
    player.hand = [];
    player.field = [];
    player.fieldStacks = [];
    player.spentFieldIndexes = new Set();
  });
  return game;
}

describe("モンスター攻撃への手札防御", () => {
  it("CPU防御側はvalue基準で価値のあるスタックを手札防御で守る", () => {
    const game = setupGame();
    game.players[0].field = [card("AI-WATER-4")];
    game.players[1].field = [card("AI-WIND-3")];
    game.players[1].fieldStacks = [[card("AI-WIND-2")]];
    game.players[1].hand = [card("AI-WATER-4")];

    strikeInDraft(game, 0, 0, 0);

    expect(game.players[1].field.map((item) => item.id)).toEqual(["AI-WIND-3"]);
    expect(game.players[1].discard.map((item) => item.id)).toEqual(["AI-WATER-4"]);
    expect(game.players[1].hand).toEqual([]);
    expect(game.players[1].handDefensesUsed).toBe(1);
    // AI-WATER-4 は攻撃後退場時に手札へ戻る個別効果を持つ
    expect(game.players[0].field).toEqual([]);
    expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-WATER-4"]);
  });

  it("CPU防御側は救う価値の低い対象には手札を使わない", () => {
    const game = setupGame();
    game.players[0].field = [card("AI-WATER-3")];
    game.players[1].field = [card("AI-WIND-1")];
    game.players[1].hand = [card("AI-WIND-3")];

    strikeInDraft(game, 0, 0, 0);

    expect(game.players[1].field).toEqual([]);
    expect(game.players[1].hand.map((item) => item.id)).toEqual(["AI-WIND-3"]);
    expect(game.players[1].handDefensesUsed).toBe(0);
  });

  it("相打ちになるモンスター攻撃はCPUは手札防御しない", () => {
    const game = setupGame();
    game.players[0].field = [card("AI-WATER-3")];
    game.players[1].field = [card("AI-WIND-3")];
    game.players[1].hand = [card("AI-WATER-4")];

    strikeInDraft(game, 0, 0, 0);

    expect(game.players[0].field).toEqual([]);
    expect(game.players[1].field).toEqual([]);
    expect(game.players[1].hand.map((item) => item.id)).toEqual(["AI-WATER-4"]);
  });

  it("手札防御の1ターン上限はプレイヤー攻撃と共有される", () => {
    const game = setupGame();
    game.players[0].field = [card("AI-WATER-4")];
    game.players[1].field = [card("AI-WIND-3")];
    game.players[1].fieldStacks = [[card("AI-WIND-2")]];
    game.players[1].hand = [card("AI-WATER-4")];
    game.players[1].handDefensesUsed = 1;

    strikeInDraft(game, 0, 0, 0);

    expect(game.players[1].field).toEqual([]);
    expect(game.players[1].hand.map((item) => item.id)).toEqual(["AI-WATER-4"]);
  });

  it("人間防御側には防御選択が保留され、手札防御で対象を守れる", () => {
    const game = setupGame();
    game.active = 1;
    game.players[1].field = [card("AI-WATER-4")];
    game.players[0].field = [card("AI-WIND-3")];
    game.players[0].hand = [card("AI-WATER-4")];

    strikeInDraft(game, 1, 0, 0);

    expect(game.pendingAttack).not.toBeNull();
    expect(game.pendingAttack?.strikeTargetIndex).toBe(0);
    expect(game.players[0].field.map((item) => item.id)).toEqual(["AI-WIND-3"]);

    resolveDefenseInDraft(game, { type: "hand", index: 0 });

    expect(game.pendingAttack).toBeNull();
    expect(game.players[0].field.map((item) => item.id)).toEqual(["AI-WIND-3"]);
    expect(game.players[0].discard.map((item) => item.id)).toEqual(["AI-WATER-4"]);
    expect(game.players[0].handDefensesUsed).toBe(1);
  });

  it("人間防御側が防御しない場合は通常どおり討伐される", () => {
    const game = setupGame();
    game.active = 1;
    game.players[1].field = [card("AI-WATER-4")];
    game.players[0].field = [card("AI-WIND-3")];
    game.players[0].hand = [card("AI-WATER-4")];

    strikeInDraft(game, 1, 0, 0);
    expect(game.pendingAttack?.strikeTargetIndex).toBe(0);

    resolveDefenseInDraft(game, { type: "none" });

    expect(game.pendingAttack).toBeNull();
    expect(game.players[0].field).toEqual([]);
    expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-WATER-4"]);
  });

  it("モンスター攻撃の保留中は場防御を選べない", () => {
    const game = setupGame();
    game.active = 1;
    game.players[1].field = [card("AI-WATER-4")];
    game.players[0].field = [card("AI-WIND-3"), card("AI-EARTH-2")];
    game.players[0].hand = [card("AI-WATER-4")];

    strikeInDraft(game, 1, 0, 0);
    expect(game.pendingAttack?.strikeTargetIndex).toBe(0);

    resolveDefenseInDraft(game, { type: "field", index: 1 });

    // 場防御は無効なので保留のまま
    expect(game.pendingAttack).not.toBeNull();
    expect(game.players[0].field.length).toBe(2);
  });

  it("chooseStrikeHandDefenseはモード別に判断する", () => {
    const game = setupGame();
    game.players[0].field = [card("AI-WATER-3")];
    game.players[1].field = [card("AI-WIND-1")];
    game.players[1].hand = [card("AI-WIND-3")];

    const original = CONFIG.handDefenseVsStrike;
    try {
      CONFIG.handDefenseVsStrike = "value";
      expect(chooseStrikeHandDefense(game.players[1], game.players[0].field[0], 0)).toBeNull();
      CONFIG.handDefenseVsStrike = "eager";
      expect(chooseStrikeHandDefense(game.players[1], game.players[0].field[0], 0)).toBe(0);
      CONFIG.handDefenseVsStrike = "off";
      expect(chooseStrikeHandDefense(game.players[1], game.players[0].field[0], 0)).toBeNull();
    } finally {
      CONFIG.handDefenseVsStrike = original;
    }
  });
});
