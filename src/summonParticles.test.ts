import { describe, expect, it } from "vitest";
import { attributeBurstTheme, summonBurstPalette, type SummonBurstTheme } from "./summonParticles";

describe("attributeBurstTheme", () => {
  it("maps each attribute to a dedicated burst theme", () => {
    expect(attributeBurstTheme("火")).toBe("fire");
    expect(attributeBurstTheme("水")).toBe("water");
    expect(attributeBurstTheme("風")).toBe("wind");
    expect(attributeBurstTheme("土")).toBe("earth");
  });
});

describe("summonBurstPalette", () => {
  const themes: SummonBurstTheme[] = ["fire", "water", "wind", "earth", "relic"];

  it("returns a base and highlight color for every theme", () => {
    for (const theme of themes) {
      const palette = summonBurstPalette(theme);
      expect(palette.base).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.highlight).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("gives every theme a distinct color pair", () => {
    const seen = new Set<string>();
    for (const theme of themes) {
      const palette = summonBurstPalette(theme);
      const key = `${palette.base}:${palette.highlight}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("keeps the relic palette golden, matching MEMORY_COLOR/RELIC_FX_HIGHLIGHT", () => {
    expect(summonBurstPalette("relic")).toEqual({ base: "#f59e0b", highlight: "#ffd166" });
  });
});
