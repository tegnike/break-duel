import { describe, expect, it } from "vitest";
import { baseCardRarity, type CardRarity } from "./rarity";
import {
  PACK_CARD_POOL,
  PACK_SIZE,
  TEN_PACK_COUNT,
  cardIdsFromPacks,
  collectionCountsAfterPacks,
  markNewCards,
  packRevealCompletion,
  rollHighSlotRarity,
  rollPack,
  rollPackBatch,
  type PackCard,
} from "./pack";

describe("pack rarity roll", () => {
  it("高レア枠は UR 10%・SR 30%・R 60% の境界で判定する", () => {
    expect(rollHighSlotRarity(() => 0)).toBe("ur");
    expect(rollHighSlotRarity(() => 0.0999)).toBe("ur");
    expect(rollHighSlotRarity(() => 0.1)).toBe("sr");
    expect(rollHighSlotRarity(() => 0.3999)).toBe("sr");
    expect(rollHighSlotRarity(() => 0.4)).toBe("r");
    expect(rollHighSlotRarity(() => 0.9999)).toBe("r");
  });

  it("1パックは5枚・パック内同名なし・N3枚とR以上2枚になる", () => {
    const pack = rollPack(() => 0.5);
    const rarityCounts = pack.reduce<Record<CardRarity, number>>(
      (counts, entry) => ({ ...counts, [entry.rarity]: counts[entry.rarity] + 1 }),
      { n: 0, r: 0, sr: 0, ur: 0 },
    );

    expect(pack).toHaveLength(PACK_SIZE);
    expect(new Set(pack.map((entry) => entry.card.id)).size).toBe(PACK_SIZE);
    expect(rarityCounts).toEqual({ n: 3, r: 2, sr: 0, ur: 0 });
  });
});

describe("ten-pack batch", () => {
  it("10パックを独立した5枚組として抽選し、カードキーを重複させない", () => {
    const packs = rollPackBatch(TEN_PACK_COUNT, () => 0.5);

    expect(packs).toHaveLength(TEN_PACK_COUNT);
    expect(packs.every((pack) => pack.length === PACK_SIZE)).toBe(true);
    expect(packs.every((pack) => new Set(pack.map((entry) => entry.card.id)).size === PACK_SIZE)).toBe(true);
    expect(new Set(packs.flat().map((entry) => entry.key)).size).toBe(TEN_PACK_COUNT * PACK_SIZE);
    expect(cardIdsFromPacks(packs)).toHaveLength(TEN_PACK_COUNT * PACK_SIZE);
  });

  it("10連内で重複した未所持カードは最初の1枚だけNEWになる", () => {
    const [firstCard, ownedCard] = PACK_CARD_POOL;
    expect(firstCard).toBeDefined();
    expect(ownedCard).toBeDefined();
    const entry = (key: number, card: typeof firstCard): PackCard => ({
      key,
      card,
      rarity: baseCardRarity(card) ?? "n",
    });
    const marked = markNewCards(
      [
        [entry(0, firstCard), entry(1, ownedCard)],
        [entry(PACK_SIZE, firstCard)],
      ],
      { [ownedCard.id]: 2 },
    );

    expect(marked[0][0].isNew).toBe(true);
    expect(marked[0][1].isNew).toBe(false);
    expect(marked[1][0].isNew).toBe(false);
  });

  it("所持枚数表示には開示済みパックだけを段階反映する", () => {
    const [card] = PACK_CARD_POOL;
    const entry = (key: number): PackCard => ({
      key,
      card,
      rarity: baseCardRarity(card) ?? "n",
    });
    const packs = [[entry(0)], [entry(PACK_SIZE)]];

    expect(collectionCountsAfterPacks(packs, { [card.id]: 1 }, 1)[card.id]).toBe(2);
    expect(collectionCountsAfterPacks(packs, { [card.id]: 1 }, 2)[card.id]).toBe(3);
  });

  it("10連の1〜9パック目は次パック待ち、10パック目だけ一覧結果になる", () => {
    expect(packRevealCompletion(1, 0)).toBe("single-result");
    expect(packRevealCompletion(TEN_PACK_COUNT, 0)).toBe("next-pack");
    expect(packRevealCompletion(TEN_PACK_COUNT, 8)).toBe("next-pack");
    expect(packRevealCompletion(TEN_PACK_COUNT, 9)).toBe("batch-results");
  });
});
