import { describe, expect, it } from "vitest";
import {
  type Attribute,
  BATTLE_DECK_IDS,
  CARD_BY_ID,
  type Card,
  DECKS,
  DECK_RULES,
  cardPool,
  isCardActive,
  makeDeck,
} from "../game";
import { runMatch } from "../sim/runner";

function countByName(deck: Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of deck) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
  }
  return counts;
}

describe("deck construction", () => {
  it("keeps every preset deck at the curated size with the same-name limit", () => {
    for (const deckId of BATTLE_DECK_IDS) {
      const deck = makeDeck(deckId);
      expect(deck, deckId).toHaveLength(DECK_RULES.size);
      for (const [name, count] of countByName(deck)) {
        expect(count, `${deckId}: ${name}`).toBeLessThanOrEqual(DECK_RULES.sameNameLimit);
      }
    }
  });

  it("limits the total high-power summons in each preset deck", () => {
    for (const deckId of BATTLE_DECK_IDS) {
      const highPowerCount = makeDeck(deckId).filter(
        (card) => card.type === "ai" && (card.power ?? 0) >= 3,
      ).length;
      expect(highPowerCount, deckId).toBeLessThanOrEqual(DECK_RULES.highPowerLimit);
    }
  });

  it("keeps single-color decks on their own attribute for summons", () => {
    const expectations: Array<[(typeof BATTLE_DECK_IDS)[number], Attribute]> = [
      ["fire", "火"],
      ["water", "水"],
      ["wind", "風"],
      ["earth", "土"],
    ];
    for (const [deckId, attribute] of expectations) {
      const attributes = new Set(
        makeDeck(deckId)
          .filter((card) => card.type === "ai")
          .map((card) => card.attribute),
      );
      expect([...attributes], deckId).toEqual([attribute]);
    }
  });

  it("covers required card types in every fixed deck", () => {
    for (const deckId of BATTLE_DECK_IDS) {
      const deck = makeDeck(deckId);
      expect(deck.filter((card) => card.type === "ai").length, deckId).toBeGreaterThanOrEqual(2);
      expect(deck.filter((card) => card.type === "event").length, deckId).toBeGreaterThanOrEqual(2);
      expect(deck.filter((card) => card.type === "memory").length, deckId).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps inactive cards out of every fixed deck", () => {
    const inactiveCardIds = new Set(
      cardPool()
        .filter((card) => !isCardActive(card))
        .map((card) => card.id),
    );
    // 2026-07-05 のリワークで CMD-PATCH は再アクティブ化済み。
    expect(inactiveCardIds.has("CMD-PATCH")).toBe(false);
    expect(CARD_BY_ID.has("CMD-PATCH")).toBe(true);
    for (const deckId of BATTLE_DECK_IDS) {
      for (const cardId of DECKS[deckId].cards) {
        expect(inactiveCardIds.has(cardId), `${deckId}: ${cardId}`).toBe(false);
      }
      // makeDeck は inactive / 未知カードを含むと throw する
      expect(() => makeDeck(deckId), deckId).not.toThrow();
    }
  });

  it("lets the CPU play the echoes deck to completion", () => {
    // Python の test_echoes_deck_is_playable_by_cpu と同じく CPU 同士で1試合完走させる
    const record = runMatch(4242, {
      firstDeck: "echoes",
      secondDeck: "water",
      aiProfiles: ["challenger", "challenger"],
    });

    expect(record.game.winner !== null || record.game.draw).toBe(true);
    if (record.game.winner !== null) {
      expect([0, 1]).toContain(record.game.winner);
    }
  });
});
