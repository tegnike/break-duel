import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  type GameState,
  canUpgrade,
  cloneCard,
  createGame,
  finishTurn,
  upgradeCost,
} from "../game";
import { beginAttackInDraft, performAiActionInDraft } from "./actions";

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
  // performAiActionInDraft は人間プレイヤーでは動かないため、両者とも AI として扱う
  game.players[0].isHuman = false;
  return game;
}

describe("アップグレード", () => {
  it("同属性の下位召喚獣を上位に置換できる（canUpgrade 基本形）", () => {
    expect(canUpgrade(card("AI-FIRE-1"), card("AI-FIRE-3"))).toBe(true);
    expect(canUpgrade(card("AI-FIRE-2"), card("AI-FIRE-4"))).toBe(true);
    // 属性違い・同 power・降格は不可
    expect(canUpgrade(card("AI-FIRE-2"), card("AI-WATER-3"))).toBe(false);
    expect(canUpgrade(card("AI-FIRE-3"), card("AI-FIRE-3B"))).toBe(false);
    expect(canUpgrade(card("AI-FIRE-3"), card("AI-FIRE-1"))).toBe(false);
  });

  it("アップグレードで場のカードが置換され、元カードはスタックに積まれる", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-1")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-3")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

    expect(player.field[0].id).toBe("AI-FIRE-3");
    expect(player.fieldStacks[0].map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    expect(player.discard).toEqual([]);
  });

  it("アップグレードコストは power 差に等しい", () => {
    expect(upgradeCost(card("AI-FIRE-3"), card("AI-FIRE-1"))).toBe(2);
    expect(upgradeCost(card("AI-FIRE-4"), card("AI-FIRE-2"))).toBe(2);
    expect(upgradeCost(card("AI-FIRE-4"), card("AI-FIRE-1"))).toBe(3);
    expect(upgradeCost(card("AI-FIRE-3"), card("AI-FIRE-2"))).toBe(1);
  });

  it("power1→power3 のアップグレードは 2 行動を消費する", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-1")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-3")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

    expect(player.field[0].id).toBe("AI-FIRE-3");
    expect(game.actionsRemaining).toBe(1); // 3 - 2
  });

  it("power2→power4 のアップグレードは 2 行動を消費する", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-2")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-4")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

    expect(player.field[0].id).toBe("AI-FIRE-4");
    expect(game.actionsRemaining).toBe(1); // 3 - 2
  });

  it("power1→power4 は 3 行動が必要で、残り 2 行動では実行されない", () => {
    const game = setupGame();
    game.actionsRemaining = 2;
    const player = game.players[0];
    player.field = [card("AI-FIRE-1")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-4")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    expect(upgradeCost(card("AI-FIRE-4"), card("AI-FIRE-1"))).toBe(3);
    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

    // Python では ValueError。TS では no-op（状態は変わらない）
    expect(player.field[0].id).toBe("AI-FIRE-1");
    expect(player.hand.map((item) => item.id)).toEqual(["AI-FIRE-4"]);
    expect(game.actionsRemaining).toBe(2);
  });

  it("exactUpgradeStep 有効時は power を飛ばすアップグレードを拒否する", () => {
    const original = CONFIG.exactUpgradeStep;
    try {
      CONFIG.exactUpgradeStep = true;
      const game = setupGame();
      const player = game.players[0];
      player.field = [card("AI-FIRE-1")];
      player.fieldStacks = [[]];
      player.hand = [card("AI-FIRE-3")];
      game.players[1].hand = [card("CMD-OPTIMIZE")];

      expect(canUpgrade(player.field[0], player.hand[0])).toBe(false);
      performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

      expect(player.field[0].id).toBe("AI-FIRE-1");
      expect(player.hand.map((item) => item.id)).toEqual(["AI-FIRE-3"]);
    } finally {
      CONFIG.exactUpgradeStep = original;
    }
  });

  it("exactUpgradeStep 有効時も次の power へのアップグレードは許可する", () => {
    const original = CONFIG.exactUpgradeStep;
    try {
      CONFIG.exactUpgradeStep = true;
      const game = setupGame();
      const player = game.players[0];
      player.field = [card("AI-FIRE-2")];
      player.fieldStacks = [[]];
      player.hand = [card("AI-FIRE-3")];
      game.players[1].hand = [card("CMD-OPTIMIZE")];

      performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

      expect(player.field[0].id).toBe("AI-FIRE-3");
    } finally {
      CONFIG.exactUpgradeStep = original;
    }
  });

  it("power3 の攻撃後回復遅延は次の準備ステップを 1 回スキップする", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-3")];
    player.fieldStacks = [[]];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    beginAttackInDraft(game, 0, 0);

    expect(player.spentFieldIndexes.has(0)).toBe(true);
    expect(player.power3RecoveryDelayedFieldIndexes.has(0)).toBe(true);

    // 相手ターン → 自分ターン: 回復遅延により消耗のまま
    finishTurn(game, true);
    finishTurn(game, true);
    expect(game.active).toBe(0);
    expect(player.spentFieldIndexes.has(0)).toBe(true);
    expect(player.power3RecoveryDelayedFieldIndexes.size).toBe(0);

    // さらに 1 巡すると回復する
    finishTurn(game, true);
    finishTurn(game, true);
    expect(game.active).toBe(0);
    expect(player.spentFieldIndexes.has(0)).toBe(false);
  });

  it("power3 の回復遅延はアップグレードで解消される", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-3")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-4")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    beginAttackInDraft(game, 0, 0);
    expect(player.spentFieldIndexes.has(0)).toBe(true);
    expect(player.power3RecoveryDelayedFieldIndexes.has(0)).toBe(true);

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

    expect(player.field[0].id).toBe("AI-FIRE-4");
    expect(player.spentFieldIndexes.has(0)).toBe(false);
    expect(player.power3RecoveryDelayedFieldIndexes.size).toBe(0);
  });

  it("アップグレードしても手札の他カードは失われない", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-1")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-3"), card("CMD-PATCH")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });

    expect(player.field[0].id).toBe("AI-FIRE-3");
    expect(player.fieldStacks[0].map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    expect(player.discard).toEqual([]);
    expect(player.hand.map((item) => item.id)).toEqual(["CMD-PATCH"]);
  });

  it("アップグレード後に場を離れると、スタックの元カードも一緒にトラッシュへ移動する", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-1")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-3")];
    player.deck = [card("AI-FIRE-1")];
    game.players[1].field = [card("AI-FIRE-4")];
    game.players[1].fieldStacks = [[]];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });
    expect(player.field[0].id).toBe("AI-FIRE-3");

    // AI-FIRE-4（防御値4）の場防御で攻撃側 AI-FIRE-3（攻撃値3）が敗北しトラッシュへ
    beginAttackInDraft(game, 0, 0, {}, { type: "field", index: 0 });

    expect(player.field).toEqual([]);
    expect(player.discard.map((item) => item.id)).toEqual(["AI-FIRE-3", "AI-FIRE-1"]);
  });

  it("power4 のオーバーヒート（攻撃後退場）でアップグレードスタックも廃棄される", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-FIRE-2")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-FIRE-4")];
    player.deck = [card("AI-FIRE-1")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });
    expect(player.field[0].id).toBe("AI-FIRE-4");

    beginAttackInDraft(game, 0, 0);

    expect(player.field).toEqual([]);
    expect(player.discard.map((item) => item.id)).toEqual(["AI-FIRE-4", "AI-FIRE-2"]);
    // AI-FIRE-4 は攻撃後退場時に 1 枚ドロー
    expect(player.hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
  });

  it("power4 が攻撃後に手札へ戻る場合も、下に積まれたスタックは廃棄される", () => {
    const game = setupGame();
    const player = game.players[0];
    player.field = [card("AI-WATER-2")];
    player.fieldStacks = [[]];
    player.hand = [card("AI-WATER-4")];
    game.players[1].hand = [card("CMD-OPTIMIZE")];

    performAiActionInDraft(game, { type: "upgrade", handIndex: 0, fieldIndex: 0 });
    expect(player.field[0].id).toBe("AI-WATER-4");

    beginAttackInDraft(game, 0, 0);

    // AI-WATER-4 は攻撃後退場時に手札へ戻る個別効果を持つ
    expect(player.field).toEqual([]);
    expect(player.hand.map((item) => item.id)).toEqual(["AI-WATER-4"]);
    expect(player.discard.map((item) => item.id)).toEqual(["AI-WATER-2"]);
  });
});
