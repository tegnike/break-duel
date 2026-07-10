import { describe, expect, it } from "vitest";
import { createOpponentCatalog, opponentPortrait, opponentVoiceLine } from "./catalog";
import { NIKE_CHARACTER } from "./nike";
import type { OpponentCharacterDefinition } from "./types";

const testA: OpponentCharacterDefinition = {
  id: "test-opponent-a",
  defaultDisplayName: "テストA",
  portraits: { default: "a-default.webp", cutInTrump: "a-trump.webp" },
  lines: { attack: { text: "A attack", audioSrc: "a-attack.wav" } },
};

const testB: OpponentCharacterDefinition = {
  id: "test-opponent-b",
  defaultDisplayName: "テストB",
  portraits: { default: "b-default.webp", hurt: "b-hurt.webp", cutInFinisher: "b-finisher.webp" },
  lines: { attack: { text: "B attack", audioSrc: "b-attack.wav" } },
};

describe("opponent character catalog", () => {
  it("contains the complete Nike definition", () => {
    expect(NIKE_CHARACTER.id).toBe("nike");
    expect(NIKE_CHARACTER.defaultDisplayName).toBe("ニケ");
    expect(Object.keys(NIKE_CHARACTER.lines)).toHaveLength(15);
    expect(NIKE_CHARACTER.portraits.default).toBeTruthy();
  });

  it("keeps injected character assets, lines, audio and cut-ins isolated", () => {
    const catalog = createOpponentCatalog([testA, testB]);
    const a = catalog.get(testA.id)!;
    const b = catalog.get(testB.id)!;
    expect(opponentPortrait(a, "hurt")).toBe("a-default.webp");
    expect(opponentPortrait(a, "cutInTrump")).toBe("a-trump.webp");
    expect(opponentPortrait(b, "hurt")).toBe("b-hurt.webp");
    expect(opponentPortrait(b, "cutInFinisher")).toBe("b-finisher.webp");
    expect(opponentVoiceLine(a, "attack")).toEqual({ text: "A attack", audioSrc: "a-attack.wav" });
    expect(opponentVoiceLine(b, "attack")).toEqual({ text: "B attack", audioSrc: "b-attack.wav" });
    expect(opponentVoiceLine(a, "victory")).toBeNull();
  });

  it("rejects duplicate ids", () => {
    expect(() => createOpponentCatalog([testA, { ...testB, id: testA.id }])).toThrow("重複");
  });
});
