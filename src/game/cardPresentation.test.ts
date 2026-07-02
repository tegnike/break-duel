import { describe, expect, it } from "vitest";
import { CARD_BY_ID, cloneCard, type Card } from "../game";
import { cardArtClass, roleText, selectedText } from "../components/cardPresentation";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

describe("card presentation", () => {
  it("shows comeback rite effect text and generated art", () => {
    const comebackRite = card("CMD-COMEBACK-RITE");

    expect(roleText(comebackRite)).toContain("山札からカードを1枚引き");
    expect(roleText(comebackRite)).toContain("消耗召喚獣1体を回復");
    expect(selectedText(comebackRite)).toContain("逆転再起術");
    expect(cardArtClass(comebackRite)).toContain("art-generated");
  });
});
