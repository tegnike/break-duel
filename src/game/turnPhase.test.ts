import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  actionsForTurn,
  canActivePlayerAttack,
  checkResourceExhaustion,
  checkTurnLimit,
  cloneCard,
  createGame,
  draw,
  finishTurn,
} from "../game";
import { beginAttackInDraft } from "./actions";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

const TEST_DECK_A = [
  "AI-FIRE-1",
  "AI-FIRE-1",
  "AI-FIRE-2",
  "AI-FIRE-2",
  "AI-FIRE-3",
  "AI-FIRE-3",
  "AI-FIRE-4",
  "AI-WATER-1",
  "AI-WATER-2",
  "AI-WATER-3",
];

const TEST_DECK_B = [
  "AI-WATER-1",
  "AI-WATER-1",
  "AI-WATER-2",
  "AI-WATER-2",
  "AI-WATER-3",
  "AI-WATER-3",
  "AI-WATER-4",
  "AI-WIND-1",
  "AI-WIND-2",
  "AI-WIND-3",
];

function setupGame(seed = 1) {
  return createGame(
    seed,
    { kind: "custom", name: "Test Player", cardIds: TEST_DECK_A },
    { kind: "custom", name: "Test Rival", cardIds: TEST_DECK_B },
  );
}

function withConfig<T>(patch: Partial<typeof CONFIG>, run: () => T): T {
  const original = Object.fromEntries(Object.keys(patch).map((key) => [key, CONFIG[key as keyof typeof CONFIG]])) as Partial<typeof CONFIG>;
  Object.assign(CONFIG, patch);
  try {
    return run();
  } finally {
    Object.assign(CONFIG, original);
  }
}

describe("initialization and turn management", () => {
  it("deals opening hands of five to each player by default", () => {
    const game = setupGame(1);

    expect(CONFIG.firstPlayerInitialHand).toBe(5);
    expect(CONFIG.secondPlayerInitialHand).toBe(5);
    expect(game.players[0].hand).toHaveLength(5);
    expect(game.players[1].hand).toHaveLength(5);
  });

  it("skips the first player's first-turn draw by default", () => {
    const game = setupGame(1);

    expect(CONFIG.firstPlayerFirstTurnDraw).toBe(false);
    expect(game.turn).toBe(1);
    expect(game.active).toBe(0);
    // 初手5枚のみ。手番開始ドローが走っていれば山札は 10 - 5 - 1 になるはず。
    expect(game.players[0].hand).toHaveLength(5);
    expect(game.players[0].deck).toHaveLength(TEST_DECK_A.length - 5);
  });

  it("gives the first player one action and the second player three on their first turns", () => {
    const game = setupGame(2);

    expect(game.turn).toBe(1);
    expect(game.active).toBe(0);
    expect(actionsForTurn(game)).toBe(CONFIG.firstPlayerFirstTurnActions);
    expect(game.actionsRemaining).toBe(1);

    finishTurn(game, true);

    expect(game.active).toBe(1);
    expect(actionsForTurn(game)).toBe(CONFIG.actionsPerTurn);
    expect(game.actionsRemaining).toBe(3);
  });

  it("forbids the first player from attacking on the first turn", () => {
    const game = setupGame(3);
    game.players[0].field = [card("AI-FIRE-1")];
    game.players[0].spentFieldIndexes.clear();
    const rivalLifeBefore = game.players[1].life;

    expect(CONFIG.firstPlayerFirstTurnCanAttack).toBe(false);
    expect(game.turn).toBe(1);
    expect(game.active).toBe(0);
    expect(canActivePlayerAttack(game)).toBe(false);

    beginAttackInDraft(game, 0, 0);

    expect(game.pendingAttack).toBeNull();
    expect(game.players[1].life).toBe(rivalLifeBefore);

    finishTurn(game, true);

    expect(game.active).toBe(1);
    expect(canActivePlayerAttack(game)).toBe(true);
  });

  it("lets the second player draw on their first turn", () => {
    const game = setupGame(4);
    const rivalDeckBefore = game.players[1].deck.length;
    const rivalHandBefore = game.players[1].hand.length;

    finishTurn(game, true);

    expect(game.turn).toBe(2);
    expect(game.active).toBe(1);
    expect(game.players[1].deck).toHaveLength(rivalDeckBefore - 1);
    expect(game.players[1].hand).toHaveLength(rivalHandBefore + 1);
  });

  it("fails to draw when the deck is empty", () => {
    const game = setupGame(5);
    const player = game.players[0];
    player.deck = [];
    player.hand = [];
    player.discard = [card("AI-FIRE-1")];
    const cardsDrawnBefore = player.cardsDrawn;

    const drawn = draw(player, 1);

    expect(drawn).toBe(0);
    expect(player.hand).toEqual([]);
    expect(player.discard[0].id).toBe("AI-FIRE-1");
    expect(player.cardsDrawn).toBe(cardsDrawnBefore);
  });

  it("forces a loss when only one player has exhausted all resources", () => {
    const game = setupGame(6);
    game.players[0].deck = [];
    game.players[0].hand = [];
    game.players[0].field = [];
    game.players[1].deck = [card("AI-FIRE-1")];
    game.players[0].life = 4;
    game.players[1].life = 2;

    checkResourceExhaustion(game);

    expect(game.winner).toBe(1);
    expect(game.draw).toBe(false);
    expect(game.actionsRemaining).toBe(0);
    expect(game.chargedActionsRemaining).toBe(0);
    // TS ではログは日本語文字列（Python の構造化ログとは形式が異なる）
    expect(game.log[game.log.length - 1]).toContain("手札・山札・場がすべて尽きたため");
    expect(game.log[game.log.length - 1]).toContain(`${game.players[1].name}の勝利`);
  });

  it("draws when both players have exhausted all resources", () => {
    const game = setupGame(7);
    for (const player of game.players) {
      player.deck = [];
      player.hand = [];
      player.field = [];
      player.life = 3;
    }

    checkResourceExhaustion(game);

    expect(game.winner).toBeNull();
    expect(game.draw).toBe(true);
    expect(game.actionsRemaining).toBe(0);
    expect(game.chargedActionsRemaining).toBe(0);
    expect(game.log[game.log.length - 1]).toContain("両者の手札・山札・場がすべて尽きたため引き分け");
  });

  // turn limit の「ライフ差があっても引き分け」版は turnActionState.test.ts の
  // "draws when the turn limit is reached regardless of life totals" が既にカバー。
  // ここでは同点ライフ版のみ追加する。
  it("draws at the turn limit when both players have equal life", () => {
    const game = setupGame(8);
    game.turn = CONFIG.maxTurns;
    game.actionsRemaining = 1;
    game.chargedActionsRemaining = 1;
    game.players[0].life = 3;
    game.players[1].life = 3;

    checkTurnLimit(game);

    expect(game.winner).toBeNull();
    expect(game.draw).toBe(true);
    expect(game.actionsRemaining).toBe(0);
    expect(game.chargedActionsRemaining).toBe(0);
    expect(game.log[game.log.length - 1]).toContain(`${CONFIG.maxTurns}手番に到達したため引き分け`);
  });

  it("uses life judgement at the turn limit when enabled", () => withConfig({ turnLimitResult: "life_judgement" }, () => {
    const game = setupGame(80);
    game.turn = CONFIG.maxTurns;
    game.actionsRemaining = 1;
    game.chargedActionsRemaining = 1;
    game.players[0].life = 5;
    game.players[1].life = 3;

    checkTurnLimit(game);

    expect(game.winner).toBe(0);
    expect(game.draw).toBe(false);
    expect(game.actionsRemaining).toBe(0);
    expect(game.chargedActionsRemaining).toBe(0);
    expect(game.log[game.log.length - 1]).toContain("ライフ判定");
  }));

  it("applies fatigue damage when a required turn-start draw fails", () => withConfig({ deckOutFatigueDamage: 1 }, () => {
    const game = setupGame(81);
    const rival = game.players[1];
    rival.deck = [];
    rival.hand = [card("AI-WATER-1")];
    rival.life = 4;

    finishTurn(game, true);

    expect(game.active).toBe(1);
    expect(game.turn).toBe(2);
    expect(rival.life).toBe(3);
    expect(game.winner).toBeNull();
    expect(game.log.some((entry) => entry.includes("衰弱"))).toBe(true);
  }));

  it("discards down to the hand limit at own turn end when enabled", () => withConfig({ handLimit: 6 }, () => {
    const game = setupGame(82);
    const player = game.players[0];
    player.hand = [
      card("AI-FIRE-1"),
      card("AI-FIRE-1"),
      card("AI-FIRE-2"),
      card("AI-FIRE-2"),
      card("AI-FIRE-3"),
      card("AI-FIRE-3"),
      card("AI-FIRE-4"),
    ];

    finishTurn(game, true);

    expect(player.hand).toHaveLength(6);
    expect(player.discard).toHaveLength(1);
    expect(game.log.some((entry) => entry.includes("手札上限"))).toBe(true);
  }));

  it("deals siege damage at turn end when field power is ahead", () => withConfig({ siegeDamage: 1, siegeConsecutiveTurns: 1 }, () => {
    const game = setupGame(83);
    const player = game.players[0];
    const rival = game.players[1];
    player.field = [card("AI-FIRE-3")];
    rival.field = [card("AI-WATER-1")];
    rival.life = 5;

    finishTurn(game, true);

    expect(rival.life).toBe(4);
    expect(game.winner).toBeNull();
    expect(game.log.some((entry) => entry.includes("戦線圧力"))).toBe(true);
  }));

  it("clamps life at zero when attack damage exceeds remaining life", () => {
    const game = setupGame(9);
    game.turn = 5;
    game.active = 0;
    game.actionsRemaining = 3;
    game.chargedActionsRemaining = 0;
    game.players[0].field = [card("AI-FIRE-4")];
    game.players[0].spentFieldIndexes.clear();
    game.players[1].deck = [card("AI-WATER-1")];
    game.players[1].hand = [];
    game.players[1].field = [];
    game.players[1].life = 1;

    // 防御側は CPU のため防御選択（防御不能 → 直撃）まで自動で解決される
    beginAttackInDraft(game, 0, 0);

    expect(game.players[1].life).toBe(0);
    expect(game.winner).toBe(0);
  });
});
