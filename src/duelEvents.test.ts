import { describe, expect, it } from "vitest";
import { cutInForEvent, FINISHER_CUT_IN_LINE, type DuelEventPayload } from "./duelEvents";

const RIVAL_INDEX = 1;

function battleEvent(impact?: DuelEventPayload["impact"]): DuelEventPayload {
  return {
    kind: "battle",
    title: "ライバルの攻撃",
    detail: "",
    cards: [],
    impact,
  };
}

describe("cutInForEvent", () => {
  it("ignores rival damage of 2 or more without fatal", () => {
    const event = battleEvent({ kind: "life-damage", sourcePlayerIndex: 1, targetPlayerIndex: 0, amount: 2 });
    expect(cutInForEvent(event, RIVAL_INDEX)).toBeNull();
  });

  it("returns a finisher cut-in for a fatal rival hit even at 1 damage", () => {
    const event = battleEvent({ kind: "life-damage", sourcePlayerIndex: 1, targetPlayerIndex: 0, amount: 1, fatal: true });
    expect(cutInForEvent(event, RIVAL_INDEX)).toMatchObject({ style: "finisher" });
  });

  it("ignores rival damage of 1 without fatal", () => {
    const event = battleEvent({ kind: "life-damage", sourcePlayerIndex: 1, targetPlayerIndex: 0, amount: 1 });
    expect(cutInForEvent(event, RIVAL_INDEX)).toBeNull();
  });

  it("ignores damage dealt by the human player", () => {
    const event = battleEvent({ kind: "life-damage", sourcePlayerIndex: 0, targetPlayerIndex: 1, amount: 3, fatal: true });
    expect(cutInForEvent(event, RIVAL_INDEX)).toBeNull();
  });

  it("ignores rival self-damage", () => {
    const event = battleEvent({ kind: "life-damage", sourcePlayerIndex: 1, targetPlayerIndex: 1, amount: 2 });
    expect(cutInForEvent(event, RIVAL_INDEX)).toBeNull();
  });

  it("ignores events without impact", () => {
    expect(cutInForEvent(battleEvent(), RIVAL_INDEX)).toBeNull();
  });

  it("keeps an existing cut-in instead of overriding it", () => {
    const event: DuelEventPayload = {
      ...battleEvent({ kind: "life-damage", sourcePlayerIndex: 1, targetPlayerIndex: 0, amount: 3 }),
      cutIn: { style: "trump", line: "切札" },
    };
    expect(cutInForEvent(event, RIVAL_INDEX)).toEqual({ style: "trump", line: "切札" });
  });
});
