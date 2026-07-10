import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAVED_DECKS_STORAGE_KEY, loadSavedDecks, normalizeImportedDeck } from "./savedDecks";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() { return values.size; },
  } satisfies Storage;
}

describe("saved deck storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("keeps valid decks when another stored entry is malformed", () => {
    const validDeck = {
      version: 1,
      id: "valid-deck",
      name: "有効なデッキ",
      cardIds: ["AI-FIRE-1"],
      updatedAt: "2026-07-10T00:00:00.000Z",
    };
    vi.stubGlobal("localStorage", memoryStorage({
      [SAVED_DECKS_STORAGE_KEY]: JSON.stringify([
        validDeck,
        { id: "broken-deck", name: "壊れたデッキ", cardIds: [42] },
      ]),
    }));

    expect(loadSavedDecks()).toEqual([validDeck]);
  });

  it("rejects unsupported imported deck versions", () => {
    expect(() => normalizeImportedDeck({ version: 2, cardIds: [] })).toThrow("対応していないデッキバージョン");
  });
});
