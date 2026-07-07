import { cardSet, type Card } from "./game";

export type CardRarity = "n" | "r" | "sr" | "ur";

export const RARITY_LABELS: Record<CardRarity, string> = {
  n: "N",
  r: "R",
  sr: "SR",
  ur: "UR",
};

export function baseCardRarity(card: Card): CardRarity | null {
  if (cardSet(card) === 1) return null;
  if (card.type === "ai") {
    if ((card.power ?? 0) >= 4) return "ur";
    if ((card.power ?? 0) === 3) return "sr";
    if ((card.power ?? 0) === 2) return "r";
    return "n";
  }
  return card.type === "memory" ? "r" : "n";
}
