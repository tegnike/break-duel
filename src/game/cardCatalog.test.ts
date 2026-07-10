import { describe, expect, it } from "vitest";
import {
  ACTIVE_CARD_CATALOG,
  CARD_BY_ID,
  CARD_CATALOG,
  activeCardPool,
  cardPool,
} from "../game";

describe("card catalog", () => {
  it("keeps one canonical object for every card definition", () => {
    expect(CARD_BY_ID.size).toBe(CARD_CATALOG.length);
    expect(new Set(CARD_CATALOG.map((card) => card.id)).size).toBe(CARD_CATALOG.length);

    for (const card of CARD_CATALOG) {
      expect(CARD_BY_ID.get(card.id)).toBe(card);
      expect(Object.isFrozen(card)).toBe(true);
    }
  });

  it("shares canonical card objects through active and compatibility pools", () => {
    for (const card of cardPool()) {
      expect(CARD_BY_ID.get(card.id)).toBe(card);
    }
    for (const card of activeCardPool()) {
      expect(ACTIVE_CARD_CATALOG).toContain(card);
      expect(CARD_BY_ID.get(card.id)).toBe(card);
    }
  });

  it("returns defensive arrays without rebuilding card objects", () => {
    const firstCatalogCard = CARD_CATALOG[0];
    const pool = cardPool();
    pool.reverse();

    expect(cardPool()).not.toBe(pool);
    expect(CARD_CATALOG[0]).toBe(firstCatalogCard);
    expect(cardPool()[0]).toBe(firstCatalogCard);
  });
});
