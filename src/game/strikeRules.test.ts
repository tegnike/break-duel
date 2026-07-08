import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  type GameState,
  attackCombatValue,
  canDefend,
  cloneCard,
  createGame,
  strikeTargets,
} from "../game";
import { beginAttackInDraft, strikeInDraft, useCommandAtInDraft } from "./actions";

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
  game.chargedActionsRemaining = 0;
  game.players.forEach((player) => {
    player.hand = [];
    player.deck = [];
    player.field = [];
    player.fieldStacks = [];
    player.spentFieldIndexes = new Set();
    player.discard = [];
  });
  return game;
}

describe("無防御攻撃とブレイクドロー", () => {
  it("無防御攻撃は power ぶんのダメージを与え、山札の残りぶんだけブレイクドローする", () => {
    const game = setupGame();
    const defender = game.players[1];
    game.players[0].field = [card("AI-WATER-4")];
    defender.deck = [card("AI-WATER-1")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life - 4);
    // ダメージは4だが山札が1枚しかないため、ドローは1枚で停止する
    expect(defender.hand).toHaveLength(1);
    expect(defender.deck).toHaveLength(0);
  });

  it("無防御攻撃のダメージは攻撃側の power に比例する", () => {
    const cases: [string, number][] = [
      ["AI-WATER-1", 7],
      ["AI-WATER-3", 5],
      ["AI-WATER-4", 4],
    ];
    cases.forEach(([cardId, expectedLife]) => {
      const game = setupGame();
      const defender = game.players[1];
      game.players[0].field = [card(cardId)];
      defender.hand = [card("MEM-CACHE")]; // 遺物カードは手札防御に使えない
      defender.deck = [];

      beginAttackInDraft(game, 0, 0);

      expect(defender.life).toBe(expectedLife);
    });
  });
});

describe("reckless（攻撃値+1・ダメージは power 通り）", () => {
  it("reckless 攻撃側のプレイヤーダメージは power ぶんに留まる", () => {
    // AI-FIRE-3B は戦闘判定では攻撃値4（power 3 + attack_plus_1）だが、
    // 突破ダメージは常に power（3）に等しい
    const game = setupGame();
    const defender = game.players[1];
    game.players[0].field = [card("AI-FIRE-3B")];
    defender.hand = [card("MEM-CACHE")];
    defender.deck = [];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(5);
    expect(game.players[0].life).toBe(8);
  });

  it("reckless は防御判定・討伐判定では攻撃値4のまま扱われる", () => {
    const reckless = card("AI-FIRE-3B");
    expect(attackCombatValue(reckless)).toBe(4);
    expect(canDefend(reckless, card("AI-WIND-3"))).toBe(false);

    const game = setupGame();
    game.players[0].field = [card("AI-FIRE-3B")];
    game.players[1].field = [card("AI-EARTH-4")];
    game.players[1].fieldStacks = [[]];
    game.players[1].deck = [card("AI-WATER-1")];
    game.players[0].deck = [card("AI-FIRE-1")];

    strikeInDraft(game, 0, 0, 0);

    expect(game.players[1].field).toEqual([]);
    expect(game.players[1].discard.map((item) => item.id)).toEqual(["AI-EARTH-4"]);
  });
});

describe("Strike（モンスター攻撃）", () => {
  it("下位の敵召喚獣を廃棄し、攻撃者は消耗する", () => {
    const game = setupGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3")];
    defender.field = [card("AI-WIND-1")];
    defender.fieldStacks = [[]];
    defender.deck = [card("AI-WATER-1")];

    expect(strikeTargets(attacker.field[0], defender).map((option) => option.index)).toEqual([0]);
    strikeInDraft(game, 0, 0, 0);

    expect(defender.field).toEqual([]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WIND-1"]);
    expect(attacker.field.map((item) => item.id)).toEqual(["AI-WATER-3"]);
    expect(attacker.spentFieldIndexes.has(0)).toBe(true);
    expect(defender.life).toBe(8);
  });

  it("CPU防御側の場防御が失敗しても、場防御時効果は発動し対象は守られる", () => {
    const game = setupGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-4")];
    defender.field = [card("AI-WIND-3"), card("AI-EARTH-1B")];
    defender.fieldStacks = [[card("AI-WIND-2")], []];
    defender.deck = [card("AI-FIRE-1")];

    strikeInDraft(game, 0, 0, 0);

    // AI-EARTH-1B（防御値1）でかばって失敗するが、対象 AI-WIND-3 は場に残り
    // 防御時効果（1枚ドロー）は発動する
    expect(defender.field.map((item) => item.id)).toEqual(["AI-WIND-3"]);
    expect(defender.fieldStacks[0].map((item) => item.id)).toEqual(["AI-WIND-2"]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-EARTH-1B"]);
    expect(defender.hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    expect(defender.life).toBe(8);
  });

  it("同値の相打ちで両者ともトラッシュへ送られる", () => {
    const game = setupGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3")];
    attacker.fieldStacks = [[]];
    attacker.deck = [card("AI-FIRE-1")];
    defender.field = [card("AI-WIND-3")];
    defender.fieldStacks = [[]];
    defender.deck = [card("AI-WATER-1")];

    strikeInDraft(game, 0, 0, 0);

    expect(attacker.field).toEqual([]);
    expect(defender.field).toEqual([]);
    expect(attacker.discard.map((item) => item.id)).toEqual(["AI-WATER-3"]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WIND-3"]);
  });

  it("攻撃値以上の防御値を持つ上位対象への strike は拒否される", () => {
    const game = setupGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WIND-1")];
    defender.field = [card("AI-EARTH-2")];
    defender.fieldStacks = [[]];
    const actionsBefore = game.actionsRemaining;

    expect(strikeTargets(attacker.field[0], defender)).toEqual([]);
    strikeInDraft(game, 0, 0, 0);

    // Python では ValueError。TS では no-op（状態は変わらない）
    expect(attacker.field.map((item) => item.id)).toEqual(["AI-WIND-1"]);
    expect(defender.field.map((item) => item.id)).toEqual(["AI-EARTH-2"]);
    expect(attacker.spentFieldIndexes.size).toBe(0);
    expect(game.actionsRemaining).toBe(actionsBefore);
  });

  it("power4 は strike 勝利後にオーバーヒートして退場する", () => {
    const game = setupGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-FIRE-4")];
    attacker.fieldStacks = [[]];
    attacker.deck = [card("AI-FIRE-1")];
    defender.field = [card("AI-WIND-2")];
    defender.fieldStacks = [[]];
    defender.deck = [card("AI-WATER-1")];

    strikeInDraft(game, 0, 0, 0);

    expect(defender.field).toEqual([]);
    expect(attacker.field).toEqual([]);
    expect(attacker.discard.map((item) => item.id)).toContain("AI-FIRE-4");
  });
});

describe("Purge（追撃粛清）", () => {
  it("消耗中の召喚獣をスタックごとトラッシュへ送る", () => {
    const game = setupGame();
    const player = game.players[0];
    const opponent = game.players[1];
    player.hand = [card("CMD-PURGE")];
    opponent.field = [card("AI-WIND-3")];
    opponent.fieldStacks = [[card("AI-WIND-2")]];
    opponent.spentFieldIndexes = new Set([0]);
    opponent.deck = [card("AI-WATER-1")];

    useCommandAtInDraft(game, 0, 0);

    expect(opponent.field).toEqual([]);
    expect(opponent.discard.map((item) => item.id)).toEqual(["AI-WIND-3", "AI-WIND-2"]);
    expect(player.discard.map((item) => item.id)).toEqual(["CMD-PURGE"]);
  });

  it("未消耗の対象には使用できず、カードも消費されない", () => {
    const game = setupGame();
    const player = game.players[0];
    const opponent = game.players[1];
    player.hand = [card("CMD-PURGE")];
    opponent.field = [card("AI-WIND-3")];
    opponent.fieldStacks = [[]];

    useCommandAtInDraft(game, 0, 0);

    // Python では ValueError。TS では no-op（カードは手札に残る）
    expect(player.hand.map((item) => item.id)).toEqual(["CMD-PURGE"]);
    expect(player.discard).toEqual([]);
    expect(opponent.field.map((item) => item.id)).toEqual(["AI-WIND-3"]);
  });
});
