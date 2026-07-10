import {
  ATTRIBUTES,
  CARD_BY_ID,
  type Attribute,
  type Card,
  type CardType,
  isCardActive,
} from "./game";
import { collectionLimitMessages, loadCollection } from "./collection";

export const DECK_SIZE = 25;
export const SAME_NAME_LIMIT = 2;
export const HIGH_POWER_LIMIT = 5;
export const SAVED_DECKS_STORAGE_KEY = "break-duel:saved-decks";

const CARD_ID_COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export type SavedDeck = {
  version: 1;
  id: string;
  name: string;
  cardIds: string[];
  updatedAt: string;
};

export function validateDeck(cardIds: string[]): { valid: boolean; messages: string[] } {
  const messages: string[] = [];
  if (cardIds.length !== DECK_SIZE) messages.push(`${DECK_SIZE}枚ちょうどにしてください`);
  const knownCards = cardIds.map((cardId) => CARD_BY_ID.get(cardId)).filter((card): card is Card => Boolean(card));
  const highPowerCount = knownCards.filter((card) => card.type === "ai" && (card.power ?? 0) >= 3).length;
  if (highPowerCount > HIGH_POWER_LIMIT) messages.push(`power 3以上の召喚獣は${HIGH_POWER_LIMIT}枚までです`);
  const counts = new Map<string, number>();
  cardIds.forEach((cardId) => counts.set(cardId, (counts.get(cardId) ?? 0) + 1));
  if ([...counts.values()].some((count) => count > SAME_NAME_LIMIT)) messages.push(`同名${SAME_NAME_LIMIT}枚を超えています`);
  const unknown = cardIds.filter((cardId) => !CARD_BY_ID.has(cardId));
  if (unknown.length > 0) messages.push("不明なカードが含まれています");
  const inactive = cardIds.filter((cardId) => {
    const card = CARD_BY_ID.get(cardId);
    return card && !isCardActive(card);
  });
  if (inactive.length > 0) messages.push("現在使えないカードが含まれています");
  messages.push(...collectionLimitMessages(knownCards, loadCollection()));
  return { valid: messages.length === 0, messages };
}

export function loadSavedDecks(): SavedDeck[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_DECKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      try {
        return [normalizeImportedDeck(item)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function persistSavedDecks(decks: SavedDeck[]): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}

export function normalizeImportedDeck(input: unknown): SavedDeck {
  if (!input || typeof input !== "object") throw new Error("デッキJSONの形式が不正です");
  const item = input as Partial<SavedDeck>;
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "読み込みデッキ";
  if (!Array.isArray(item.cardIds) || !item.cardIds.every((cardId) => typeof cardId === "string")) {
    throw new Error("cardIds が見つかりません");
  }
  const validation = validateDeck(item.cardIds);
  if (validation.messages.some((message) => message.includes("不明"))) throw new Error("不明なカードIDが含まれています");
  return {
    version: 1,
    id: typeof item.id === "string" ? item.id : `deck-${Date.now()}`,
    name,
    cardIds: sortCardIds(item.cardIds),
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
  };
}

export function sortCardIds(cardIds: readonly string[]): string[] {
  return [...cardIds].sort(compareCardIds);
}

function compareCardIds(leftId: string, rightId: string): number {
  const left = CARD_BY_ID.get(leftId);
  const right = CARD_BY_ID.get(rightId);
  if (left && right) return compareCardsByNumber(left, right);
  if (left) return -1;
  if (right) return 1;
  return CARD_ID_COLLATOR.compare(leftId, rightId);
}

function compareCardsByNumber(left: Card, right: Card): number {
  return typeRank(left.type) - typeRank(right.type)
    || attributeRank(left.attribute) - attributeRank(right.attribute)
    || (left.power ?? 0) - (right.power ?? 0)
    || CARD_ID_COLLATOR.compare(left.id, right.id);
}

function typeRank(type: CardType): number {
  if (type === "ai") return 0;
  if (type === "event") return 1;
  return 2;
}

function attributeRank(attribute: Attribute | undefined): number {
  if (!attribute) return 99;
  return Object.keys(ATTRIBUTES).indexOf(attribute);
}
