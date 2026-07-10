import { afterEach, describe, expect, it } from "vitest";
import { listOpponentCharacters, resolveOpponentCharacter, setCustomOpponentCharacters } from "./catalog";
import {
  createEmptySavedOpponentCharacter,
  savedCharacterToDefinition,
  validateSavedOpponentCharacter,
} from "./characterStorage";
import type { SavedOpponentCharacter } from "./types";

function customCharacter(): SavedOpponentCharacter {
  return {
    ...createEmptySavedOpponentCharacter(),
    id: "astra-01",
    defaultDisplayName: "アストラ",
    deckSelection: { kind: "preset", deckId: "water" },
    aiProfile: "beginner",
    portraits: {
      default: "data:image/webp;base64,default",
      hurt: "data:image/webp;base64,hurt",
    },
    lines: {
      match_start: { text: "始めましょう", audioSrc: "data:audio/wav;base64,start" },
      victory: { text: "私の勝ちです" },
    },
  };
}

afterEach(() => setCustomOpponentCharacters([]));

describe("character admin model", () => {
  it("requires an id, display name, and default portrait", () => {
    expect(validateSavedOpponentCharacter(createEmptySavedOpponentCharacter())).toEqual([
      "キャラクターIDは2〜32文字の半角英小文字・数字・ハイフンで入力してください",
      "表示名を入力してください",
      "通常立ち絵を登録してください",
    ]);
    expect(validateSavedOpponentCharacter(customCharacter())).toEqual([]);
  });

  it("converts saved media and lines into a runtime character", () => {
    const definition = savedCharacterToDefinition(customCharacter());
    expect(definition.id).toBe("astra-01");
    expect(definition.deckSelection).toEqual({ kind: "preset", deckId: "water" });
    expect(definition.aiProfile).toBe("beginner");
    expect(definition.portraits.hurt).toContain("hurt");
    expect(definition.lines.match_start).toEqual({ text: "始めましょう", audioSrc: "data:audio/wav;base64,start" });
  });

  it("merges saved characters into the live opponent catalog", () => {
    setCustomOpponentCharacters([savedCharacterToDefinition(customCharacter())]);
    expect(listOpponentCharacters().map((character) => character.id)).toContain("astra-01");
    expect(resolveOpponentCharacter("astra-01")?.defaultDisplayName).toBe("アストラ");
    expect(resolveOpponentCharacter("nike")?.defaultDisplayName).toBe("ニケ");
  });

  it("rejects an id that collides with a built-in character", () => {
    expect(() => setCustomOpponentCharacters([{ ...savedCharacterToDefinition(customCharacter()), id: "nike" }])).toThrow("重複");
    expect(listOpponentCharacters()).toHaveLength(1);
    expect(resolveOpponentCharacter("nike")?.defaultDisplayName).toBe("ニケ");
  });
});
