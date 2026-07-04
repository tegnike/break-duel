import { describe, expect, it } from "vitest";
import { type Card } from "../game";
import { currentTutorialStep, createTutorialGame, tutorialForcedAiAction } from "../tutorial";

function takeCardById(cards: Card[], cardId: string): Card {
  const index = cards.findIndex((card) => card.id === cardId);
  expect(index).toBeGreaterThanOrEqual(0);
  const card = cards[index];
  expect(card).toBeDefined();
  cards.splice(index, 1);
  return card!;
}

describe("tutorial duel setup", () => {
  it("starts from a fixed summon lesson state", () => {
    const game = createTutorialGame();

    expect(game.seed).toBe(20260630);
    expect(game.active).toBe(0);
    expect(game.turn).toBe(1);
    expect(game.actionsRemaining).toBe(2);
    expect(game.players[0].hand.map((card) => card.id)).toEqual([
      "AI-FIRE-2",
      "MEM-CACHE",
      "AI-FIRE-1C",
      "CMD-FIRE-RITE",
      "AI-FIRE-2B",
    ]);
    expect(game.players[0].deck.slice(-2).map((card) => card.id)).toEqual(["AI-FIRE-4", "AI-FIRE-3B"]);
    expect(game.players[1].field).toEqual([]);
    expect(game.selected).toBeNull();
    expect(currentTutorialStep(game).id).toBe("select-summon");
  });

  it("recognizes selected summon and forces the first rival attack", () => {
    const game = createTutorialGame();
    game.selected = { zone: "hand", ownerIndex: 0, index: 0 };

    expect(currentTutorialStep(game).id).toBe("play-summon");

    const [summon] = game.players[0].hand.splice(0, 1);
    game.players[0].field.push(summon);
    game.selected = null;
    game.actionsRemaining = 0;
    expect(currentTutorialStep(game).id).toBe("end-first-turn");

    game.active = 1;
    game.turn = 2;
    game.actionsRemaining = 2;
    expect(currentTutorialStep(game).id).toBe("watch-rival");
    expect(currentTutorialStep(game).title).toBe("ライバルの召喚を見る");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "play", index: 0 });

    const [rivalSummon] = game.players[1].hand.splice(0, 1);
    game.players[1].field.push(rivalSummon);
    game.actionsRemaining = 1;
    expect(currentTutorialStep(game).title).toBe("ライバルの攻撃を見る");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "attack", index: 0 });

    game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };
    expect(currentTutorialStep(game).id).toBe("field-defend");
    game.pendingAttack = null;
    game.players[1].discard.push(game.players[1].field.shift()!);
    game.players[0].spentFieldIndexes.add(0);
    game.actionsRemaining = 0;
    expect(currentTutorialStep(game).kicker).toBe("STEP 3");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "end" });

    game.turn = 4;
    game.active = 1;
    game.actionsRemaining = 2;
    expect(currentTutorialStep(game).title).toBe("次の攻撃役を見る");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "play", index: 0 });

    const [nextRivalSummon] = game.players[1].hand.splice(0, 1);
    game.players[1].field.push(nextRivalSummon);
    game.actionsRemaining = 1;
    expect(game.players[1].field.map((card) => card.id)).toEqual(["AI-EARTH-2"]);
    expect(tutorialForcedAiAction(game)).toEqual({ type: "end" });
  });

  it("continues after the charged extra action and completes after power 4 overheat", () => {
    const game = createTutorialGame();
    const summon = takeCardById(game.players[0].hand, "AI-FIRE-2");
    game.players[0].field.push(summon);
    game.players[0].discard.push(game.players[0].hand.find((card) => card.id === "CMD-FIRE-RITE")!);
    game.players[0].discard.push(game.players[0].hand.find((card) => card.id === "AI-FIRE-1C")!);
    game.players[0].hand = game.players[0].hand.filter((card) => card.id !== "CMD-FIRE-RITE" && card.id !== "AI-FIRE-1C" && card.id !== "AI-FIRE-2");
    game.players[0].chargeUsed = true;
    game.players[1].life = 4;
    const memory = takeCardById(game.players[0].hand, "MEM-CACHE");
    game.players[0].memory = memory;
    game.turn = 3;
    game.active = 0;
    game.actionsRemaining = 0;

    expect(currentTutorialStep(game).id).toBe("end-after-memory");

    game.turn = 5;
    game.active = 0;
    game.actionsRemaining = 2;
    game.players[0].hand.push(
      game.players[0].deck.find((card) => card.id === "AI-FIRE-3B")!,
      game.players[0].deck.find((card) => card.id === "AI-FIRE-4")!,
    );
    expect(currentTutorialStep(game).id).toBe("select-upgrade");

    const power3 = game.players[0].hand.find((card) => card.id === "AI-FIRE-3B")!;
    game.players[0].field.push(power3);
    game.players[0].hand = game.players[0].hand.filter((card) => card.id !== "AI-FIRE-3B");
    game.actionsRemaining = 0;
    expect(currentTutorialStep(game).id).toBe("end-after-power3-upgrade");

    game.turn = 7;
    game.active = 0;
    game.actionsRemaining = 2;
    game.players[0].chargeUsed = false;
    expect(currentTutorialStep(game).id).toBe("select-power4-upgrade");

    game.players[0].discard.push(game.players[0].field[1]);
    const upgraded = game.players[0].hand.find((card) => card.id === "AI-FIRE-4")!;
    game.players[0].field[1] = upgraded;
    game.players[0].hand = game.players[0].hand.filter((card) => card.id !== "AI-FIRE-4");
    game.actionsRemaining = 1;
    expect(game.players[0].field.map((card) => card.id)).toEqual(["AI-FIRE-2", "AI-FIRE-4"]);
    expect(currentTutorialStep(game).id).toBe("saved-action-attack");

    game.players[1].life -= 2;
    game.players[0].spentFieldIndexes.add(0);
    game.actionsRemaining = 0;
    expect(currentTutorialStep(game).id).toBe("end-after-upgrade");

    game.turn = 7;
    game.active = 1;
    game.actionsRemaining = 2;
    if (game.players[1].field.length === 0) {
      const lateAttacker = takeCardById(game.players[1].hand, "AI-EARTH-2");
      game.players[1].field.push(lateAttacker);
    }
    expect(currentTutorialStep(game).kicker).toBe("STEP 14");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "end" });

    game.turn = 8;
    expect(currentTutorialStep(game).kicker).toBe("STEP 14");
    game.players[1].hand.push(takeCardById(game.players[1].deck, "AI-EARTH-1"));
    const wallIndex = game.players[1].hand.findIndex((card) => card.id === "AI-EARTH-1");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "play", index: wallIndex });
    game.players[1].field.push(takeCardById(game.players[1].hand, "AI-EARTH-1"));
    expect(tutorialForcedAiAction(game)).toEqual({ type: "attack", index: 0 });

    game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };
    expect(currentTutorialStep(game).id).toBe("defend");
    game.pendingAttack = null;

    game.turn = 9;
    game.active = 0;
    game.actionsRemaining = 1;
    game.players[0].chargeUsed = false;
    expect(currentTutorialStep(game).id).toBe("power4-attack");

    game.players[0].discard.push(game.players[0].field.splice(1, 1)[0]);
    expect(currentTutorialStep(game).id).toBe("end-after-power4");

    game.players[0].life -= 1;
    expect(currentTutorialStep(game).id).toBe("complete");
  });

  it("teaches purge, monster strike and break draw on turns 9-10", () => {
    const game = createTutorialGame();
    const player = game.players[0];
    const rival = game.players[1];
    game.turn = 9;
    game.active = 0;
    game.actionsRemaining = 3;
    player.discard.push(takeCardById(player.hand, "CMD-FIRE-RITE"));
    player.discard.push(takeCardById(player.hand, "AI-FIRE-1C"));
    player.field.push(takeCardById(player.hand, "AI-FIRE-2"));
    player.hand.push(takeCardById(player.deck, "CMD-PURGE"));
    player.hand.push(takeCardById(player.deck, "AI-FIRE-4"));
    player.field.push(player.hand.splice(player.hand.findIndex((card) => card.id === "AI-FIRE-4"), 1)[0]);
    rival.field.push(takeCardById(rival.hand, "AI-EARTH-2"));
    rival.field.push(takeCardById(rival.deck, "AI-EARTH-1"));
    rival.spentFieldIndexes.add(0);
    rival.life = 4;

    // ④ 追撃粛清: 消耗中の相手召喚獣がいる間は粛清ステップ
    expect(currentTutorialStep(game).id).toBe("purge-command");
    game.selected = { zone: "hand", ownerIndex: 0, index: player.hand.findIndex((card) => card.id === "CMD-PURGE") };
    expect(currentTutorialStep(game).focus).toEqual({ kind: "action", action: "command" });
    game.selected = null;

    // 粛清後: ③ モンスター攻撃ステップ
    player.discard.push(takeCardById(player.hand, "CMD-PURGE"));
    rival.discard.push(rival.field.splice(0, 1)[0]);
    rival.spentFieldIndexes.clear();
    expect(currentTutorialStep(game).id).toBe("strike-monster");

    // 討伐後: ① 切札の4点パンチステップ
    rival.discard.push(rival.field.splice(0, 1)[0]);
    player.spentFieldIndexes.add(0);
    expect(currentTutorialStep(game).id).toBe("power4-attack");
    expect(currentTutorialStep(game).detail).toContain("4点");

    // 攻撃後: ターンを渡すステップ
    const power4Index = player.field.findIndex((card) => card.id === "AI-FIRE-4");
    player.discard.push(player.field.splice(power4Index, 1)[0]);
    game.actionsRemaining = 0;
    expect(currentTutorialStep(game).id).toBe("end-after-power4");

    // ② ターン10: ライバルの最後の攻撃を防御せず受ける
    game.turn = 10;
    game.active = 1;
    game.actionsRemaining = 3;
    expect(currentTutorialStep(game).kicker).toBe("STEP 18");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "play", index: rival.hand.findIndex((card) => card.id === "AI-EARTH-2C") });
    rival.field.push(takeCardById(rival.hand, "AI-EARTH-2C"));
    game.actionsRemaining = 1;
    expect(tutorialForcedAiAction(game)).toEqual({ type: "attack", index: 0 });
    game.pendingAttack = { attackerIndex: 1, defenderIndex: 0, fieldIndex: 0 };
    expect(currentTutorialStep(game).id).toBe("take-break-draw");
    game.pendingAttack = null;

    // 被弾してブレイクドローを確認したら完了
    game.players[0].life -= 1;
    expect(currentTutorialStep(game).id).toBe("complete");
  });

  it("plays the strike-target wall before the turn-8 attack", () => {
    const game = createTutorialGame();
    const rival = game.players[1];
    game.turn = 8;
    game.active = 1;
    game.actionsRemaining = 3;
    rival.field.push(takeCardById(rival.hand, "AI-EARTH-2"));
    rival.hand.push(takeCardById(rival.deck, "AI-EARTH-1"));

    const wallIndex = rival.hand.findIndex((card) => card.id === "AI-EARTH-1");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "play", index: wallIndex });
    rival.field.push(takeCardById(rival.hand, "AI-EARTH-1"));
    expect(tutorialForcedAiAction(game)).toEqual({ type: "attack", index: 0 });
  });
});
