// コイン経済とカードコレクションの永続化。
// 第1弾（set 未指定）は常時使用可で、第2弾以降のカードだけが所持枚数の制約を受ける。

import { CARD_BY_ID, cardSet, type Card } from "./game";

export const MATCH_WIN_COINS = 10;
export const MATCH_LOSE_COINS = 5;
export const PACK_COST = 5;
export const INITIAL_COINS = 10;
export const STARTER_OWNED_COUNT = 2;

export const WALLET_STORAGE_KEY = "break-duel:wallet";
export const COLLECTION_STORAGE_KEY = "break-duel:collection";

type WalletData = { version: 1; coins: number };
type CollectionData = { version: 1; counts: Record<string, number> };

// localStorage が無い環境（node 上のユニットテスト等）ではメモリ上のフォールバックを使う
const memoryStore = new Map<string, string>();

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readRaw(key: string): string | null {
  if (hasLocalStorage()) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return memoryStore.get(key) ?? null;
}

function writeRaw(key: string, value: string) {
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      // 書き込み不能（容量超過等）でも動作は継続する
    }
  }
  memoryStore.set(key, value);
}

function loadWallet(): WalletData {
  const raw = readRaw(WALLET_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<WalletData>;
      if (typeof parsed.coins === "number" && Number.isFinite(parsed.coins)) {
        return { version: 1, coins: Math.max(0, Math.floor(parsed.coins)) };
      }
    } catch {
      // 壊れたデータは初期化する
    }
  }
  const wallet: WalletData = { version: 1, coins: INITIAL_COINS };
  writeRaw(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}

function persistWallet(wallet: WalletData) {
  writeRaw(WALLET_STORAGE_KEY, JSON.stringify(wallet));
}

export function loadCoins(): number {
  return loadWallet().coins;
}

function validWalletAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0;
}

/** コインを加算して新しい残高を返す */
export function addCoins(amount: number): number {
  const wallet = loadWallet();
  if (!validWalletAmount(amount)) return wallet.coins;
  wallet.coins = Math.max(0, wallet.coins + Math.floor(amount));
  persistWallet(wallet);
  return wallet.coins;
}

/** 残高が足りれば支払って true、足りなければ何もせず false */
export function spendCoins(amount: number): boolean {
  const wallet = loadWallet();
  if (!validWalletAmount(amount)) return false;
  const cost = Math.floor(amount);
  if (wallet.coins < cost) return false;
  wallet.coins -= cost;
  persistWallet(wallet);
  return true;
}

export function loadCollection(): Record<string, number> {
  const raw = readRaw(COLLECTION_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<CollectionData>;
    if (parsed.counts && typeof parsed.counts === "object") {
      return { ...parsed.counts };
    }
  } catch {
    // 壊れたデータは空扱い
  }
  return {};
}

/** カードを所持コレクションに追加する。newIds は追加前に未所持だったカードID */
export function addToCollection(cardIds: string[]): { counts: Record<string, number>; newIds: string[] } {
  const counts = loadCollection();
  const newIds: string[] = [];
  for (const cardId of cardIds) {
    if ((counts[cardId] ?? 0) === 0 && !newIds.includes(cardId)) newIds.push(cardId);
    counts[cardId] = (counts[cardId] ?? 0) + 1;
  }
  const data: CollectionData = { version: 1, counts };
  writeRaw(COLLECTION_STORAGE_KEY, JSON.stringify(data));
  return { counts, newIds };
}

export function ownedCount(cardId: string): number {
  const card = CARD_BY_ID.get(cardId);
  const owned = loadCollection();
  return card ? ownedCountForCard(card, owned) : (owned[cardId] ?? 0);
}

export function ownedCountForCard(card: Card, owned: Record<string, number> = loadCollection()): number {
  if (cardSet(card) === 1) return STARTER_OWNED_COUNT;
  return owned[card.id] ?? 0;
}

/**
 * 第2弾以降のカードについて、デッキ投入枚数が所持枚数を超えていないか検証する。
 * cards はデッキの中身（重複はそのまま複数要素）。
 */
export function collectionLimitMessages(cards: Card[], owned: Record<string, number>): string[] {
  const counts = new Map<string, { count: number; name: string }>();
  for (const card of cards) {
    if (cardSet(card) === 1) continue;
    const current = counts.get(card.id);
    counts.set(card.id, { count: (current?.count ?? 0) + 1, name: current?.name ?? card.name });
  }
  const exceeded: { name: string; have: number }[] = [];
  for (const [cardId, { count, name }] of counts) {
    const have = owned[cardId] ?? 0;
    if (count > have) {
      exceeded.push({ name: CARD_BY_ID.get(cardId)?.name ?? name, have });
    }
  }
  if (exceeded.length === 0) return [];
  if (exceeded.length === 1) {
    const [{ name, have }] = exceeded;
    return [`${name} は所持 ${have} 枚までしかデッキに入れられません`];
  }
  const examples = exceeded.slice(0, 3).map(({ name }) => name).join("、");
  const suffix = exceeded.length > 3 ? `、ほか${exceeded.length - 3}種類` : "";
  return [`所持枚数を超えるカードが${exceeded.length}種類あります（${examples}${suffix}）`];
}
