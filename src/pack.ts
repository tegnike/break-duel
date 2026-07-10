import { ACTIVE_CARD_CATALOG, cardSet, type Card } from "./game";
import { baseCardRarity, type CardRarity } from "./rarity";

export const PACK_SIZE = 5;
export const TEN_PACK_COUNT = 10;
export const FIFTH_SLOT_UR_RATE = 0.1;
export const FIFTH_SLOT_SR_RATE = 0.3;

export type PackPurchaseCount = 1 | typeof TEN_PACK_COUNT;
export type PackRevealCompletion = "next-pack" | "single-result" | "batch-results";
export type PackCard = {
  key: number;
  card: Card;
  rarity: CardRarity;
  isNew?: boolean;
};

export const PACK_CARD_POOL: readonly Card[] = Object.freeze(
  ACTIVE_CARD_CATALOG.filter((card) => cardSet(card) === 2),
);

type RandomSource = () => number;

function drawFrom(pool: readonly Card[], usedIds: Set<string>, random: RandomSource): Card {
  const candidates = pool.filter((card) => !usedIds.has(card.id));
  if (candidates.length === 0) {
    throw new Error("パック抽選対象のカードが不足しています");
  }
  const picked = candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
  usedIds.add(picked.id);
  return picked;
}

// Fisher-Yates。最高レアリティが常に右端に固まらないよう、枠内の並び順をシャッフルする。
function shuffled<T>(items: T[], random: RandomSource): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function rollHighSlotRarity(random: RandomSource = Math.random): CardRarity {
  const highRoll = random();
  if (highRoll < FIFTH_SLOT_UR_RATE) return "ur";
  if (highRoll < FIFTH_SLOT_UR_RATE + FIFTH_SLOT_SR_RATE) return "sr";
  return "r";
}

export function rollPack(random: RandomSource = Math.random, keyOffset = 0): PackCard[] {
  const poolByRarity: Record<CardRarity, Card[]> = {
    n: PACK_CARD_POOL.filter((card) => baseCardRarity(card) === "n"),
    r: PACK_CARD_POOL.filter((card) => baseCardRarity(card) === "r"),
    sr: PACK_CARD_POOL.filter((card) => baseCardRarity(card) === "sr"),
    ur: PACK_CARD_POOL.filter((card) => baseCardRarity(card) === "ur"),
  };
  const rarities = shuffled<CardRarity>(["n", "n", "n", "r", rollHighSlotRarity(random)], random);
  const usedIds = new Set<string>();
  return rarities.map((rarity, slot) => ({
    key: keyOffset + slot,
    card: drawFrom(poolByRarity[rarity], usedIds, random),
    rarity,
  }));
}

/** 各パックを独立抽選する。パック内は同名なし、別パック間の重複はあり。 */
export function rollPackBatch(count: PackPurchaseCount, random: RandomSource = Math.random): PackCard[][] {
  return Array.from({ length: count }, (_, packIndex) => rollPack(random, packIndex * PACK_SIZE));
}

/** 10連内で同じ未所持カードを複数引いても、最初の1枚だけを NEW とする。 */
export function markNewCards(
  packs: PackCard[][],
  ownedBefore: Record<string, number>,
): PackCard[][] {
  const seen = new Set(Object.entries(ownedBefore)
    .filter(([, count]) => count > 0)
    .map(([cardId]) => cardId));
  return packs.map((pack) => pack.map((entry) => {
    const isNew = !seen.has(entry.card.id);
    seen.add(entry.card.id);
    return { ...entry, isNew };
  }));
}

export function cardIdsFromPacks(packs: PackCard[][]): string[] {
  return packs.flatMap((pack) => pack.map((entry) => entry.card.id));
}

/** 未開示の後続パックを所持枚数表示へ混ぜず、指定数までの獲得分だけを反映する。 */
export function collectionCountsAfterPacks(
  packs: PackCard[][],
  ownedBefore: Record<string, number>,
  revealedPackCount = packs.length,
): Record<string, number> {
  const counts = { ...ownedBefore };
  for (const entry of packs.slice(0, revealedPackCount).flat()) {
    counts[entry.card.id] = (counts[entry.card.id] ?? 0) + 1;
  }
  return counts;
}

export function packRevealCompletion(packCount: number, activePackIndex: number): PackRevealCompletion {
  if (packCount <= 1) return "single-result";
  if (activePackIndex < packCount - 1) return "next-pack";
  return "batch-results";
}
