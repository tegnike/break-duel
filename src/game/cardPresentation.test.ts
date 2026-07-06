import { describe, expect, it } from "vitest";
import { CARD_BY_ID, cloneCard, type Card } from "../game";
import { cardArtClass, cardArtGlyph, roleText, selectedText } from "../components/cardPresentation";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

describe("card presentation", () => {
  it("shows comeback rite effect text and generated art", () => {
    const comebackRite = card("CMD-COMEBACK-RITE");

    expect(roleText(comebackRite)).toContain("相手よりライフが少ないときしか使用できない。");
    expect(roleText(comebackRite)).toContain("山札からカードを2枚引く");
    expect(roleText(comebackRite)).toContain("消耗中召喚獣1体を選んで回復する");
    expect(selectedText(comebackRite)).toContain("逆転再起術");
    expect(cardArtClass(comebackRite)).toContain("art-generated");
  });

  it("shows purge effect text instead of the summon fallback", () => {
    const purge = card("CMD-PURGE");

    expect(roleText(purge)).toBe("相手の消耗中召喚獣1体を選び、スタックごとトラッシュする");
    expect(roleText(purge)).not.toBe("召喚獣");
    expect(selectedText(purge)).toContain("追撃粛清 / 術式 / 相手の消耗中召喚獣1体を選び");
    expect(cardArtGlyph(purge)).toBe("粛");
  });
});
