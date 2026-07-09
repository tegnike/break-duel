import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CHALLENGER_WEIGHTS,
  CONFIG,
  type Card,
  chooseAiAction,
  chooseAiDefense,
  cloneCard,
  createGame,
  debugBoardAiScore,
  debugChallengerActionScores,
  debugChallengerBeam,
  estimatePublicHandDefenseValue,
  type GameState,
  markKnownHandCard,
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
    player.setDefenseCard = null;
    player.setDefenseUsedThisTurn = false;
    player.spentFieldIndexes.clear();
  }
  return game;
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

describe("ai strategy", () => {
  it("keeps unadopted clock-world evaluation features inert", () => {
    expect(CHALLENGER_WEIGHTS.fatigueClockPressure).toBe(0);
    expect(CHALLENGER_WEIGHTS.handLimitAwareness).toBe(1);
    expect(CHALLENGER_WEIGHTS.lifeJudgementPressure).toBe(0);
    expect(CHALLENGER_WEIGHTS.power4UnblockableAttack).toBe(0);
  });

  it("scores fatigue urgency, hand cap, and late life judgement from public state", () => {
    const original = { ...CHALLENGER_WEIGHTS };
    try {
      const game = makeGame(40);
      game.turn = 35;
      game.players[0].life = 6;
      game.players[1].life = 4;
      game.players[0].deck = [card("AI-FIRE-1")];
      game.players[1].deck = Array.from({ length: 6 }, () => card("AI-WATER-1"));
      game.players[0].hand = Array.from({ length: 8 }, () => card("AI-FIRE-1"));

      CHALLENGER_WEIGHTS.fatigueClockPressure = 0;
      CHALLENGER_WEIGHTS.handLimitAwareness = 0;
      CHALLENGER_WEIGHTS.lifeJudgementPressure = 0;
      const baseline = debugBoardAiScore(game, 0);

      CHALLENGER_WEIGHTS.fatigueClockPressure = 10;
      CHALLENGER_WEIGHTS.handLimitAwareness = 1;
      CHALLENGER_WEIGHTS.lifeJudgementPressure = 20;
      expect(debugBoardAiScore(game, 0) - baseline).toBe(-54);
    } finally {
      Object.assign(CHALLENGER_WEIGHTS, original);
    }
  });

  it("can explicitly value power 4 attacks that hand defense cannot stop", () => {
    const original = { ...CHALLENGER_WEIGHTS };
    try {
      const game = makeGame(39);
      game.turn = 3;
      game.actionsRemaining = CONFIG.actionsPerTurn;
      game.players[0].field = [card("AI-FIRE-4")];
      game.players[1].hand = [card("AI-WATER-3")];

      CHALLENGER_WEIGHTS.power4UnblockableAttack = 0;
      const baseline = debugChallengerActionScores(game).find((entry) => entry.action.type === "attack")?.immediateScore;
      CHALLENGER_WEIGHTS.power4UnblockableAttack = 30;
      const weighted = debugChallengerActionScores(game).find((entry) => entry.action.type === "attack")?.immediateScore;

      expect(weighted).toBe((baseline ?? 0) + 30);
    } finally {
      Object.assign(CHALLENGER_WEIGHTS, original);
    }
  });

  it("uses optimize even without a useful effect, then ends the turn", () => {
    // 2026-07-06 のリワークで CMD-OPTIMIZE の「手札2枚以上」制約を撤廃したため、
    // 山札が空でも自分自身をトラッシュへ送るだけの発動が選ばれ得る。
    const original = { ...CHALLENGER_WEIGHTS };
    try {
      CHALLENGER_WEIGHTS.turnPlanBeamWidth = 1;
      const game = makeGame(41);
      game.players[0].isHuman = false;
      game.players[0].hand = [card("CMD-OPTIMIZE")];

      const action = chooseAiAction(game, "challenger");
      expect(action.type).toBe("command");

      performAiActionInDraft(game, action);

      expect(game.players[0].hand).toEqual([]);
      expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
    } finally {
      Object.assign(CHALLENGER_WEIGHTS, original);
    }
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

  it("beam planning does not prefer a support chain by double-counting board scores", () => {
    const original = { ...CHALLENGER_WEIGHTS };
    try {
      CHALLENGER_WEIGHTS.turnPlanBeamWidth = 2;
      const game = createGame(940001, "water", "water", "challenger");
      game.players[0].isHuman = false;
      game.players[0].aiProfile = "challenger";

      performAiActionInDraft(game, { type: "charge", index: 4 });
      performAiActionInDraft(game, { type: "play", index: 3 });
      performAiActionInDraft(game, { type: "play", index: 0 });
      performAiActionInDraft(game, { type: "charge", index: 2 });
      performAiActionInDraft(game, { type: "memory", index: 0 });

      expect(game.turn).toBe(3);
      expect(game.active).toBe(0);
      expect(game.actionsRemaining).toBe(CONFIG.actionsPerTurn);
      expect(chooseAiAction(game, "challenger")).toEqual({ type: "command", index: 1 });
    } finally {
      Object.assign(CHALLENGER_WEIGHTS, original);
    }
  });

  it("beam planning can end instead of replacing memories repeatedly", () => {
    const original = { ...CHALLENGER_WEIGHTS };
    try {
      CHALLENGER_WEIGHTS.turnPlanBeamWidth = 5;
      const game = makeGame(940002);
      game.players[0].isHuman = false;
      game.players[0].aiProfile = "challenger";
      game.turn = 3;
      game.actionsRemaining = CONFIG.actionsPerTurn;
      game.players[0].deck = Array.from({ length: 10 }, () => card("AI-FIRE-1"));
      game.players[1].deck = Array.from({ length: 10 }, () => card("AI-WATER-1"));
      game.players[0].memory = card("MEM-CACHE");
      game.players[0].hand = [
        card("MEM-ACCELERATOR"),
        card("MEM-RESONATOR"),
        card("MEM-RECOVERY-CACHE"),
        card("MEM-WAR-BANNER"),
        card("MEM-GROVE"),
      ];

      expect(debugChallengerBeam(game, 5)[0]?.firstAction).toEqual({ type: "end" });
      expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
    } finally {
      Object.assign(CHALLENGER_WEIGHTS, original);
    }
  });

  it("ends at zero actions when charge is not useful", () => {
    const original = { ...CHALLENGER_WEIGHTS };
    try {
      CHALLENGER_WEIGHTS.turnPlanBeamWidth = 1;
      const game = makeGame(43);
      game.players[0].hand = [card("CMD-OPTIMIZE")];
      game.actionsRemaining = 0;
      game.chargedActionsRemaining = 0;

      expect(chooseAiAction(game, "challenger")).toEqual({ type: "end" });
    } finally {
      Object.assign(CHALLENGER_WEIGHTS, original);
    }
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

  it("beginner keeps high-power hand defenders outside water decks", () => {
    const game = makeGame(4601);
    game.players[1].deckName = "火単色デッキ";
    game.players[1].hand = [card("AI-FIRE-4")];

    expect(chooseAiDefense(game.players[1], card("AI-FIRE-2"), "beginner")).toEqual({ type: "none" });
  });

  it("beginner water decks can use power 3 hand defense after fair-gen006 calibration", () => {
    const game = makeGame(4602);
    game.players[1].deckName = "水単色デッキ";
    game.players[1].hand = [card("AI-WATER-3")];

    expect(chooseAiDefense(game.players[1], card("AI-FIRE-2"), "beginner")).toEqual({ type: "hand", index: 0 });
    expect(chooseAiDefense(game.players[1], card("AI-FIRE-2"), "challenger")).toEqual({ type: "hand", index: 0 });
  });

  it("beginner earth decks can use power 3 hand defense after fair-gen005 calibration", () => {
    const game = makeGame(4603);
    game.players[1].deckName = "土単色デッキ";
    game.players[1].hand = [card("AI-EARTH-3")];

    expect(chooseAiDefense(game.players[1], card("AI-FIRE-2"), "beginner")).toEqual({ type: "hand", index: 0 });
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

  it("beginner water deck summons stronger units after fair-gen005 calibration", () => {
    const game = makeGame(4700);
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].deckName = "水単色デッキ";
    game.players[0].hand = [card("AI-WATER-1"), card("AI-WATER-2")];

    expect(chooseAiAction(game, "beginner")).toEqual({ type: "play", index: 1 });
  });

  it("beginner water deck uses tide edge as a simple attack setup", () => {
    const game = makeGame(4701);
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].deckName = "水単色デッキ";
    game.players[0].field = [card("AI-WATER-2")];
    game.players[0].hand = [card("CMD-TIDE-EDGE")];
    game.players[1].field = [card("AI-WATER-4")];

    expect(chooseAiAction(game, "beginner")).toEqual({ type: "command", index: 0 });
  });

  it("beginner earth deck upgrades with a full field", () => {
    const game = makeGame(4702);
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].deckName = "土単色デッキ";
    game.players[0].field = [card("AI-EARTH-2"), card("AI-FIRE-1"), card("AI-WATER-1")];
    game.players[0].hand = [card("AI-EARTH-3")];
    game.players[1].field = [card("AI-WATER-4")];

    expect(chooseAiAction(game, "beginner")).toEqual({ type: "upgrade", handIndex: 0, fieldIndex: 0 });
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
    // 公平化後も挑戦者が小標本で明確に勝ち越すことを固定する。
    expect(challengerWins / games).toBeGreaterThanOrEqual(0.6);
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

    const attackCard = card("AI-FIRE-1");

    expect(estimatePublicHandDefenseValue(first.players[1], attackCard))
      .toBe(estimatePublicHandDefenseValue(second.players[1], attackCard));
  });

  it("counts publicly known hand cards without reading hidden hand identities", () => {
    const hidden = makeGame(51);
    const known = makeGame(51);
    for (const game of [hidden, known]) {
      game.players[1].deckName = "火単色デッキ";
      game.players[1].field = [];
      game.players[1].discard = [];
      game.players[1].hand = [card("AI-FIRE-2")];
    }
    markKnownHandCard(known.players[1], known.players[1].hand[0]);

    const attackCard = card("AI-FIRE-1");

    expect(estimatePublicHandDefenseValue(known.players[1], attackCard))
      .toBeGreaterThan(estimatePublicHandDefenseValue(hidden.players[1], attackCard) ?? 0);
  });

  it("challenger action choice ignores hidden opponent hand identities", () => {
    const first = makeGame(49);
    const second = makeGame(49);
    for (const game of [first, second]) {
      game.turn = 3;
      game.actionsRemaining = CONFIG.actionsPerTurn;
      game.players[0].field = [card("AI-FIRE-2")];
      game.players[0].hand = [card("AI-FIRE-1"), card("AI-FIRE-4")];
      game.players[1].deckName = "火単色デッキ";
      game.players[1].field = [];
      game.players[1].discard = [card("AI-FIRE-1")];
    }
    first.players[1].hand = [card("AI-FIRE-2"), card("CMD-OPTIMIZE")];
    second.players[1].hand = [card("AI-FIRE-1"), card("MEM-CACHE")];

    expect(chooseAiAction(first, "challenger")).toEqual(chooseAiAction(second, "challenger"));
  });

  it("beginner attack choice ignores hidden opponent hand identities", () => {
    const first = makeGame(50);
    const second = makeGame(50);
    for (const game of [first, second]) {
      game.turn = 3;
      game.actionsRemaining = CONFIG.actionsPerTurn;
      game.players[0].field = [card("AI-FIRE-2")];
      game.players[1].deckName = "火単色デッキ";
      game.players[1].field = [card("AI-FIRE-1")];
    }
    first.players[1].hand = [card("AI-FIRE-2"), card("CMD-OPTIMIZE")];
    second.players[1].hand = [card("AI-FIRE-1"), card("MEM-CACHE")];

    expect(chooseAiAction(first, "beginner")).toEqual(chooseAiAction(second, "beginner"));
  });

  it("can set a non-memory card as paid defense", () => withConfig({ setDefenseEnabled: true }, () => {
    const game = makeGame(52);
    game.players[0].isHuman = false;
    game.turn = 3;
    game.actionsRemaining = CONFIG.actionsPerTurn;
    game.players[0].hand = [card("CMD-OPTIMIZE")];
    game.players[0].deck = [card("AI-FIRE-1")];
    game.players[1].deck = [card("AI-WATER-1")];

    performAiActionInDraft(game, { type: "set-defense", index: 0 });

    expect(game.players[0].hand).toEqual([]);
    expect(game.players[0].setDefenseCard?.id).toBe("CMD-OPTIMIZE");
    expect(game.actionsRemaining).toBe(CONFIG.actionsPerTurn - 1);
  }));

  it("can set defense for free only once per turn", () => withConfig({ setDefenseEnabled: true, setDefenseActionCost: 0, setDefenseOncePerTurn: true }, () => {
    const game = makeGame(54);
    game.players[0].isHuman = false;
    game.turn = 3;
    game.actionsRemaining = 0;
    game.players[0].chargeUsed = true;
    game.players[0].hand = [card("CMD-OPTIMIZE"), card("AI-FIRE-1")];
    game.players[0].deck = [card("AI-FIRE-1")];
    game.players[1].deck = [card("AI-WATER-1")];

    performAiActionInDraft(game, { type: "set-defense", index: 0 });

    expect(game.players[0].setDefenseCard?.id).toBe("CMD-OPTIMIZE");
    expect(game.players[0].setDefenseUsedThisTurn).toBe(true);
    expect(game.actionsRemaining).toBe(0);

    performAiActionInDraft(game, { type: "set-defense", index: 0 });

    expect(game.players[0].setDefenseCard?.id).toBe("CMD-OPTIMIZE");
    expect(game.players[0].hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    expect(game.players[0].discard).toEqual([]);
  }));

  it("challenger action choice ignores opponent set defense identity", () => withConfig({ setDefenseEnabled: true }, () => {
    const first = makeGame(53);
    const second = makeGame(53);
    for (const game of [first, second]) {
      game.turn = 3;
      game.actionsRemaining = CONFIG.actionsPerTurn;
      game.players[0].field = [card("AI-FIRE-2")];
      game.players[0].hand = [card("AI-FIRE-1"), card("AI-FIRE-4")];
      game.players[1].deckName = "火単色デッキ";
      game.players[1].field = [];
      game.players[1].discard = [card("AI-FIRE-1")];
      game.players[1].hand = [card("CMD-OPTIMIZE")];
    }
    first.players[1].setDefenseCard = card("AI-WATER-4");
    second.players[1].setDefenseCard = card("CMD-OPTIMIZE");

    expect(chooseAiAction(first, "challenger")).toEqual(chooseAiAction(second, "challenger"));
    expect(estimatePublicHandDefenseValue(first.players[1], card("AI-FIRE-2")))
      .toBe(estimatePublicHandDefenseValue(second.players[1], card("AI-FIRE-2")));
  }));
});
