import { describe, expect, it } from "vitest";
import { currentTutorialStep, createTutorialGame, tutorialForcedAiAction } from "../tutorial";

describe("tutorial duel setup", () => {
  it("starts from a fixed summon lesson state", () => {
    const game = createTutorialGame();

    expect(game.seed).toBe(20260630);
    expect(game.active).toBe(0);
    expect(game.turn).toBe(1);
    expect(game.actionsRemaining).toBe(1);
    expect(game.players[0].hand.map((card) => card.id)).toEqual([
      "AI-FIRE-2",
      "MEM-CACHE",
      "AI-FIRE-1C",
      "CMD-FIRE-RITE",
      "AI-FIRE-2B",
    ]);
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
    const summonIndex = game.players[0].hand.findIndex((card) => card.id === "AI-FIRE-2");
    const [summon] = game.players[0].hand.splice(summonIndex, 1);
    game.players[0].field.push(summon);
    game.players[0].discard.push(game.players[0].hand.find((card) => card.id === "CMD-FIRE-RITE")!);
    game.players[0].discard.push(game.players[0].hand.find((card) => card.id === "AI-FIRE-1C")!);
    game.players[0].hand = game.players[0].hand.filter((card) => card.id !== "CMD-FIRE-RITE" && card.id !== "AI-FIRE-1C" && card.id !== "AI-FIRE-2");
    game.players[0].chargeUsed = true;
    game.players[1].life = 4;
    const memoryIndex = game.players[0].hand.findIndex((card) => card.id === "MEM-CACHE");
    const [memory] = game.players[0].hand.splice(memoryIndex, 1);
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
      game.players[0].deck.find((card) => card.id === "AI-FIRE-1B")!,
    );
    expect(currentTutorialStep(game).id).toBe("select-upgrade");

    game.players[0].discard.push(game.players[0].field[0]);
    const power3 = game.players[0].hand.find((card) => card.id === "AI-FIRE-3B")!;
    game.players[0].field[0] = power3;
    game.players[0].hand = game.players[0].hand.filter((card) => card.id !== "AI-FIRE-3B");
    game.actionsRemaining = 1;
    expect(currentTutorialStep(game).id).toBe("select-power4-base");

    const base = game.players[0].hand.find((card) => card.id === "AI-FIRE-1B")!;
    game.players[0].field.push(base);
    game.players[0].hand = game.players[0].hand.filter((card) => card.id !== "AI-FIRE-1B");
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
    expect(game.players[0].field.map((card) => card.id)).toEqual(["AI-FIRE-3B", "AI-FIRE-4"]);
    expect(currentTutorialStep(game).id).toBe("saved-action-attack");

    game.players[1].life -= 1;
    game.players[0].spentFieldIndexes.add(0);
    game.actionsRemaining = 0;
    expect(currentTutorialStep(game).id).toBe("end-after-upgrade");

    game.turn = 7;
    game.active = 1;
    game.actionsRemaining = 2;
    if (game.players[1].field.length === 0) {
      const lateAttackerIndex = game.players[1].hand.findIndex((card) => card.id === "AI-EARTH-2");
      const [lateAttacker] = game.players[1].hand.splice(lateAttackerIndex, 1);
      game.players[1].field.push(lateAttacker);
    }
    expect(currentTutorialStep(game).kicker).toBe("STEP 14");
    expect(tutorialForcedAiAction(game)).toEqual({ type: "end" });

    game.turn = 8;
    expect(currentTutorialStep(game).kicker).toBe("STEP 14");
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
    expect(currentTutorialStep(game).id).toBe("complete");
  });
});
