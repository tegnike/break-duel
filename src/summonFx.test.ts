import { describe, expect, it } from "vitest";
import { CARD_BY_ID, cloneCard, type Card } from "./game";
import {
  ATTRIBUTE_FX_HIGHLIGHT,
  renderSummonSfxSamples,
  summonArrivalForCard,
  summonAuraColor,
  summonSfxKind,
  type SummonSfxKind,
} from "./summonFx";

const ALL_SFX_KINDS: SummonSfxKind[] = [
  "summon-fire",
  "summon-water",
  "summon-wind",
  "summon-earth",
  "relic-place",
];

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

describe("summonArrivalForCard", () => {
  it("maps summons to their attribute", () => {
    const arrival = summonArrivalForCard(card("AI-FIRE-1"));
    expect(arrival).not.toBeNull();
    expect(arrival!.kind).toBe("summon");
    expect(arrival!.attribute).toBe("火");
  });

  it("keeps the sub attribute of dual attribute summons", () => {
    const dual = [...CARD_BY_ID.values()].find((item) => item.type === "ai" && item.subAttribute);
    if (!dual) return;
    const arrival = summonArrivalForCard(cloneCard(dual));
    expect(arrival!.subAttribute).toBe(dual.subAttribute);
  });

  it("maps relics to the relic arrival", () => {
    const memoryCard = [...CARD_BY_ID.values()].find((item) => item.type === "memory");
    expect(memoryCard).toBeDefined();
    const arrival = summonArrivalForCard(cloneCard(memoryCard!));
    expect(arrival).toEqual({ kind: "relic" });
  });

  it("returns null for command cards", () => {
    const command = [...CARD_BY_ID.values()].find((item) => item.type === "event");
    expect(command).toBeDefined();
    expect(summonArrivalForCard(cloneCard(command!))).toBeNull();
  });
});

describe("summonSfxKind", () => {
  it("maps each attribute to a dedicated sfx kind", () => {
    expect(summonSfxKind({ kind: "summon", attribute: "火" })).toBe("summon-fire");
    expect(summonSfxKind({ kind: "summon", attribute: "水" })).toBe("summon-water");
    expect(summonSfxKind({ kind: "summon", attribute: "風" })).toBe("summon-wind");
    expect(summonSfxKind({ kind: "summon", attribute: "土" })).toBe("summon-earth");
    expect(summonSfxKind({ kind: "relic" })).toBe("relic-place");
  });

  it("returns null when a summon has no attribute", () => {
    expect(summonSfxKind({ kind: "summon" })).toBeNull();
  });
});

describe("summonAuraColor", () => {
  it("uses the attribute highlight for summons", () => {
    expect(summonAuraColor({ kind: "summon", attribute: "水" })).toBe(ATTRIBUTE_FX_HIGHLIGHT["水"]);
  });

  it("uses the relic highlight for relics", () => {
    expect(summonAuraColor({ kind: "relic" })).toBe("#ffd166");
  });
});

describe("renderSummonSfxSamples", () => {
  it.each(ALL_SFX_KINDS)("renders finite, audible, clipped-free samples for %s", (kind) => {
    const samples = renderSummonSfxSamples(kind, 44100);
    expect(samples.length).toBeGreaterThan(44100 * 0.4);
    let peak = 0;
    for (const value of samples) {
      expect(Number.isFinite(value)).toBe(true);
      peak = Math.max(peak, Math.abs(value));
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it("ends silently to avoid clicks", () => {
    for (const kind of ALL_SFX_KINDS) {
      const samples = renderSummonSfxSamples(kind, 44100);
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.02);
    }
  });

  it("is deterministic for the same kind and sample rate", () => {
    const first = renderSummonSfxSamples("summon-fire", 48000);
    const second = renderSummonSfxSamples("summon-fire", 48000);
    expect(first).toEqual(second);
  });

  it("produces distinct sounds per kind", () => {
    const rendered = ALL_SFX_KINDS.map((kind) => renderSummonSfxSamples(kind, 44100));
    for (let left = 0; left < rendered.length; left += 1) {
      for (let right = left + 1; right < rendered.length; right += 1) {
        const sameLength = rendered[left].length === rendered[right].length;
        if (!sameLength) continue;
        let difference = 0;
        for (let i = 0; i < rendered[left].length; i += 1) {
          difference += Math.abs(rendered[left][i] - rendered[right][i]);
        }
        expect(difference).toBeGreaterThan(1);
      }
    }
  });
});
