import { BATTLE_DECK_IDS, DECKS, type AiProfile, type DeckId, type DuelDeckSource } from "./game";
import type { SavedDeck } from "./savedDecks";
import { validateDeck } from "./savedDecks";
import type { SavedOpponentProfile } from "./opponents/types";
import { resolveOpponentCharacter } from "./opponents/catalog";

export type DeckSelection =
  | { kind: "random" }
  | { kind: "preset"; deckId: DeckId }
  | { kind: "saved"; deckId: string };

export type ResolvedDeckSelection =
  | { kind: "preset"; deckId: DeckId }
  | { kind: "saved"; deck: SavedDeck };

export type OpponentProfileReferenceResult = { valid: true } | { valid: false; reason: string };

export function playableDeckOptions(savedDecks: SavedDeck[]): ResolvedDeckSelection[] {
  return [
    ...BATTLE_DECK_IDS.map((deckId) => ({ kind: "preset" as const, deckId })),
    ...savedDecks.filter((deck) => validateDeck(deck.cardIds).valid).map((deck) => ({ kind: "saved" as const, deck })),
  ];
}

export function resolveDeckSelection(selection: DeckSelection, savedDecks: SavedDeck[], rng: () => number): ResolvedDeckSelection {
  if (selection.kind === "random") {
    const options = playableDeckOptions(savedDecks);
    return options[Math.floor(rng() * options.length)];
  }
  if (selection.kind === "preset") return { kind: "preset", deckId: selection.deckId };
  const deck = savedDecks.find((item) => item.id === selection.deckId);
  if (!deck) throw new Error("保存済みデッキが見つかりません");
  const validation = validateDeck(deck.cardIds);
  if (!validation.valid) throw new Error(validation.messages[0] ?? "デッキ条件を満たしていません");
  return { kind: "saved", deck };
}

export function toDuelDeckSource(selection: ResolvedDeckSelection): DuelDeckSource {
  if (selection.kind === "preset") return { kind: "preset", deckId: selection.deckId };
  return { kind: "custom", name: selection.deck.name, cardIds: selection.deck.cardIds };
}

export function deckSelectionLabel(selection: DeckSelection, savedDecks: SavedDeck[]): string {
  if (selection.kind === "random") return "ランダム";
  if (selection.kind === "preset") return DECKS[selection.deckId]?.name ?? selection.deckId;
  return savedDecks.find((deck) => deck.id === selection.deckId)?.name ?? "保存済みデッキ（削除済み）";
}

export function isDeckSelectionEqual(left: DeckSelection, right: DeckSelection): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "preset" && right.kind === "preset") return left.deckId === right.deckId;
  if (left.kind === "saved" && right.kind === "saved") return left.deckId === right.deckId;
  return left.kind === "random";
}

export function validateOpponentProfileReferences(profile: SavedOpponentProfile, savedDecks: SavedDeck[]): OpponentProfileReferenceResult {
  if (!resolveOpponentCharacter(profile.characterId)) return { valid: false, reason: `キャラクター「${profile.characterId}」が見つかりません` };
  if (profile.deckSelection.kind === "preset" && !BATTLE_DECK_IDS.includes(profile.deckSelection.deckId)) {
    return { valid: false, reason: `固定デッキ「${profile.deckSelection.deckId}」が見つかりません` };
  }
  if (profile.deckSelection.kind === "saved") {
    const savedDeckId = profile.deckSelection.deckId;
    const deck = savedDecks.find((item) => item.id === savedDeckId);
    if (!deck) return { valid: false, reason: "参照先の保存デッキが削除されています" };
    const validation = validateDeck(deck.cardIds);
    if (!validation.valid) return { valid: false, reason: validation.messages[0] ?? "参照先デッキを使用できません" };
  }
  return { valid: true };
}

export function isAiProfile(value: unknown): value is AiProfile {
  return value === "beginner" || value === "challenger";
}
