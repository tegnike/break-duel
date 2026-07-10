import { BATTLE_DECK_IDS, type DeckId } from "../game";
import { isAiProfile, type DeckSelection } from "../duelSetup";
import type { OpponentProfileStoreV1, SavedOpponentProfile } from "./types";

export const OPPONENT_PROFILES_STORAGE_KEY = "break-duel:opponent-profiles";

export type OpponentStoreLoadResult = {
  store: OpponentProfileStoreV1;
  persistence: "persisted" | "session-only" | "unsupported-version";
  message?: string;
  raw?: string;
};

export type OpponentStoreSaveResult = "persisted" | "session-only" | "unsupported-version";

let sessionStore: OpponentProfileStoreV1 | null = null;
let unsupportedRaw: string | null = null;
let sessionPersistence: OpponentStoreSaveResult | null = null;

export function createId(prefix = "opponent"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultNikeProfile(now = new Date().toISOString()): SavedOpponentProfile {
  return {
    id: createId("nike"),
    profileLabel: "ニケ（標準）",
    characterId: "nike",
    deckSelection: { kind: "random" },
    aiProfile: "challenger",
    updatedAt: now,
  };
}

export function createDefaultOpponentStore(): OpponentProfileStoreV1 {
  const profile = createDefaultNikeProfile();
  return { version: 1, selectedProfileId: profile.id, profiles: [profile] };
}

export function loadOpponentProfileStore(): OpponentStoreLoadResult {
  if (sessionStore) return { store: sessionStore, persistence: sessionPersistence ?? (unsupportedRaw ? "unsupported-version" : "session-only"), raw: unsupportedRaw ?? undefined };
  if (typeof localStorage === "undefined") {
    sessionStore = createDefaultOpponentStore();
    sessionPersistence = "session-only";
    return { store: sessionStore, persistence: "session-only", message: "このタブでは使えますがブラウザへ保存できません" };
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OPPONENT_PROFILES_STORAGE_KEY);
  } catch {
    sessionStore = createDefaultOpponentStore();
    sessionPersistence = "session-only";
    return { store: sessionStore, persistence: "session-only", message: "このタブでは使えますがブラウザへ保存できません" };
  }
  if (!raw) {
    const store = createDefaultOpponentStore();
    const persistence = saveOpponentProfileStore(store);
    return { store, persistence, message: persistence === "persisted" ? undefined : "このタブでは使えますがブラウザへ保存できません" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const store = createDefaultOpponentStore();
    return { store, persistence: saveOpponentProfileStore(store), message: "壊れた相手プロフィールを初期状態へ復旧しました" };
  }
  if (isRecord(parsed) && typeof parsed.version === "number" && parsed.version !== 1) {
    unsupportedRaw = raw;
    sessionStore = createDefaultOpponentStore();
    sessionPersistence = "unsupported-version";
    return {
      store: sessionStore,
      persistence: "unsupported-version",
      message: "このバージョンでは保存済み相手プロフィールを読み込めません。元データは変更していません",
      raw,
    };
  }
  const store = migrateOpponentStore(parsed);
  sessionStore = store;
  sessionPersistence = "persisted";
  return { store, persistence: "persisted" };
}

export function saveOpponentProfileStore(store: OpponentProfileStoreV1, options: { overwriteUnsupported?: boolean } = {}): OpponentStoreSaveResult {
  sessionStore = store;
  if (unsupportedRaw && !options.overwriteUnsupported) {
    sessionPersistence = "unsupported-version";
    return sessionPersistence;
  }
  if (options.overwriteUnsupported) unsupportedRaw = null;
  if (typeof localStorage === "undefined") {
    sessionPersistence = "session-only";
    return sessionPersistence;
  }
  try {
    localStorage.setItem(OPPONENT_PROFILES_STORAGE_KEY, JSON.stringify(store));
    sessionPersistence = "persisted";
    return sessionPersistence;
  } catch {
    sessionPersistence = "session-only";
    return sessionPersistence;
  }
}

export function initializeOpponentProfileStore(store: OpponentProfileStoreV1): OpponentStoreSaveResult {
  return saveOpponentProfileStore(store, { overwriteUnsupported: true });
}

export function migrateOpponentStore(input: unknown): OpponentProfileStoreV1 {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.profiles)) return createDefaultOpponentStore();
  const ids = new Set<string>();
  const profiles = input.profiles.flatMap((item) => {
    const profile = parseProfile(item);
    if (!profile || ids.has(profile.id)) return [];
    ids.add(profile.id);
    return [profile];
  });
  if (profiles.length === 0) return createDefaultOpponentStore();
  const selectedProfileId = typeof input.selectedProfileId === "string" && ids.has(input.selectedProfileId)
    ? input.selectedProfileId
    : profiles[0].id;
  return { version: 1, selectedProfileId, profiles };
}

export function createOpponentProfile(store: OpponentProfileStoreV1, draft: Omit<SavedOpponentProfile, "id" | "updatedAt">): OpponentProfileStoreV1 {
  const profile = { ...normalizeProfileDraft(draft), id: createId(), updatedAt: new Date().toISOString() };
  return { ...store, profiles: [...store.profiles, profile], selectedProfileId: profile.id };
}

export function updateOpponentProfile(store: OpponentProfileStoreV1, profileId: string, draft: Omit<SavedOpponentProfile, "id" | "updatedAt">): OpponentProfileStoreV1 {
  const normalized = normalizeProfileDraft(draft);
  return {
    ...store,
    profiles: store.profiles.map((profile) => profile.id === profileId ? { ...normalized, id: profile.id, updatedAt: new Date().toISOString() } : profile),
  };
}

export function duplicateOpponentProfile(store: OpponentProfileStoreV1, profileId: string): OpponentProfileStoreV1 {
  const source = store.profiles.find((profile) => profile.id === profileId);
  if (!source) return store;
  const suffix = " コピー";
  const profileLabel = `${source.profileLabel.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`;
  return createOpponentProfile(store, { ...source, profileLabel });
}

export function deleteOpponentProfile(store: OpponentProfileStoreV1, profileId: string): OpponentProfileStoreV1 {
  if (store.profiles.length <= 1) return store;
  const index = store.profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) return store;
  const profiles = store.profiles.filter((profile) => profile.id !== profileId);
  const selectedProfileId = store.selectedProfileId === profileId
    ? profiles[Math.min(index, profiles.length - 1)].id
    : store.selectedProfileId;
  return { ...store, profiles, selectedProfileId };
}

export function selectOpponentProfile(store: OpponentProfileStoreV1, profileId: string): OpponentProfileStoreV1 {
  return store.profiles.some((profile) => profile.id === profileId) ? { ...store, selectedProfileId: profileId } : store;
}

function parseProfile(input: unknown): SavedOpponentProfile | null {
  if (!isRecord(input)) return null;
  const deckSelection = parseDeckSelection(input.deckSelection);
  if (
    typeof input.id !== "string" || !input.id
    || typeof input.profileLabel !== "string" || !input.profileLabel.trim() || input.profileLabel.trim().length > 30
    || typeof input.characterId !== "string" || !input.characterId
    || !deckSelection || !isAiProfile(input.aiProfile)
  ) return null;
  return {
    id: input.id,
    profileLabel: input.profileLabel.trim(),
    characterId: input.characterId,
    deckSelection,
    aiProfile: input.aiProfile,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date(0).toISOString(),
  };
}

function normalizeProfileDraft(draft: Omit<SavedOpponentProfile, "id" | "updatedAt">) {
  const profileLabel = draft.profileLabel.trim();
  if (!profileLabel) throw new Error("プロフィール名を入力してください");
  if (profileLabel.length > 30) throw new Error("プロフィール名は30文字以内です");
  return { ...draft, profileLabel };
}

function parseDeckSelection(input: unknown): DeckSelection | null {
  if (!isRecord(input) || typeof input.kind !== "string") return null;
  if (input.kind === "random") return { kind: "random" };
  if (input.kind === "preset" && typeof input.deckId === "string" && BATTLE_DECK_IDS.includes(input.deckId as never)) {
    return { kind: "preset", deckId: input.deckId as DeckId };
  }
  if (input.kind === "saved" && typeof input.deckId === "string" && input.deckId) return { kind: "saved", deckId: input.deckId };
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function resetOpponentStorageMemoryForTests(): void {
  sessionStore = null;
  unsupportedRaw = null;
  sessionPersistence = null;
}
