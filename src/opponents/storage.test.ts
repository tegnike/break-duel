import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPPONENT_PROFILES_STORAGE_KEY,
  createDefaultOpponentStore,
  createOpponentProfile,
  deleteOpponentProfile,
  duplicateOpponentProfile,
  loadOpponentProfileStore,
  migrateOpponentStore,
  resetOpponentStorageMemoryForTests,
  saveOpponentProfileStore,
  selectOpponentProfile,
  updateOpponentProfile,
} from "./storage";

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

describe("opponent profile storage", () => {
  beforeEach(() => {
    resetOpponentStorageMemoryForTests();
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("creates and persists the default Nike profile", () => {
    const loaded = loadOpponentProfileStore();
    expect(loaded.persistence).toBe("persisted");
    expect(loaded.store.profiles).toHaveLength(1);
    expect(loaded.store.profiles[0]).toMatchObject({ profileLabel: "ニケ（標準）", characterId: "nike", deckSelection: { kind: "random" }, aiProfile: "challenger" });
    expect(loaded.store.selectedProfileId).toBe(loaded.store.profiles[0].id);
  });

  it("filters only malformed and duplicate profiles and repairs selection", () => {
    const valid = createDefaultOpponentStore().profiles[0];
    const migrated = migrateOpponentStore({ version: 1, selectedProfileId: "missing", profiles: [valid, { ...valid }, { id: 3 }] });
    expect(migrated.profiles).toEqual([valid]);
    expect(migrated.selectedProfileId).toBe(valid.id);
  });

  it("writes a migrated profile store back to localStorage", () => {
    const valid = createDefaultOpponentStore().profiles[0];
    const storage = memoryStorage({
      [OPPONENT_PROFILES_STORAGE_KEY]: JSON.stringify({
        version: 1,
        selectedProfileId: "missing",
        profiles: [valid, { ...valid }, { id: 3 }],
      }),
    });
    vi.stubGlobal("localStorage", storage);

    const loaded = loadOpponentProfileStore();

    expect(loaded.persistence).toBe("persisted");
    expect(loaded.store.profiles).toEqual([valid]);
    expect(loaded.store.selectedProfileId).toBe(valid.id);
    expect(storage.setItem).toHaveBeenCalledWith(
      OPPONENT_PROFILES_STORAGE_KEY,
      JSON.stringify(loaded.store),
    );
  });

  it("keeps unresolved character and saved-deck references structurally", () => {
    const valid = createDefaultOpponentStore().profiles[0];
    const migrated = migrateOpponentStore({
      version: 1,
      selectedProfileId: valid.id,
      profiles: [{ ...valid, characterId: "future-character", deckSelection: { kind: "saved", deckId: "removed-deck" } }],
    });
    expect(migrated.profiles[0]).toMatchObject({ characterId: "future-character", deckSelection: { kind: "saved", deckId: "removed-deck" } });
  });

  it("supports create, edit, select, duplicate and selected deletion rules", () => {
    let store = createDefaultOpponentStore();
    const firstId = store.selectedProfileId;
    store = createOpponentProfile(store, { profileLabel: "水ニケ", characterId: "nike", deckSelection: { kind: "preset", deckId: "water" }, aiProfile: "beginner" });
    const secondId = store.selectedProfileId;
    expect(store.profiles).toHaveLength(2);
    store = updateOpponentProfile(store, secondId, { profileLabel: "水ニケ改", characterId: "nike", deckSelection: { kind: "preset", deckId: "water" }, aiProfile: "challenger" });
    expect(store.profiles[1].profileLabel).toBe("水ニケ改");
    store = selectOpponentProfile(store, firstId);
    store = duplicateOpponentProfile(store, firstId);
    expect(store.profiles[store.profiles.length - 1]?.profileLabel).toContain("コピー");
    const duplicateId = store.selectedProfileId;
    store = deleteOpponentProfile(store, duplicateId);
    expect(store.selectedProfileId).toBe(secondId);
    expect(deleteOpponentProfile({ ...store, profiles: [store.profiles[0]], selectedProfileId: firstId }, firstId).profiles).toHaveLength(1);
  });

  it("does not overwrite an unknown future version", () => {
    const raw = JSON.stringify({ version: 99, profiles: [{ future: true }] });
    const storage = memoryStorage({ [OPPONENT_PROFILES_STORAGE_KEY]: raw });
    vi.stubGlobal("localStorage", storage);
    const loaded = loadOpponentProfileStore();
    expect(loaded.persistence).toBe("unsupported-version");
    expect(saveOpponentProfileStore(loaded.store)).toBe("unsupported-version");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(OPPONENT_PROFILES_STORAGE_KEY)).toBe(raw);
  });

  it("keeps CRUD in memory when persistence fails", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => { throw new Error("quota"); });
    vi.stubGlobal("localStorage", storage);
    const loaded = loadOpponentProfileStore();
    expect(loaded.persistence).toBe("session-only");
    const next = createOpponentProfile(loaded.store, { profileLabel: "セッション", characterId: "nike", deckSelection: { kind: "random" }, aiProfile: "beginner" });
    expect(saveOpponentProfileStore(next)).toBe("session-only");
    expect(loadOpponentProfileStore().store.profiles).toHaveLength(2);
  });
});
