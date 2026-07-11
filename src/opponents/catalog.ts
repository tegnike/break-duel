import { NIKE_CHARACTER } from "./nike";
import type { AiProfile } from "../game";
import type { DeckSelection } from "../duelSetup";
import type { OpponentCharacterDefinition, OpponentVoiceCue } from "./types";

export const OPPONENT_CHARACTER_CATALOG = [NIKE_CHARACTER] as const satisfies readonly OpponentCharacterDefinition[];
let runtimeOpponentCharacters: readonly OpponentCharacterDefinition[] = OPPONENT_CHARACTER_CATALOG;
let runtimeOpponentCharacterById = createOpponentCatalog(runtimeOpponentCharacters);

export function createOpponentCatalog(definitions: readonly OpponentCharacterDefinition[] = OPPONENT_CHARACTER_CATALOG): Map<string, OpponentCharacterDefinition> {
  const catalog = new Map<string, OpponentCharacterDefinition>();
  definitions.forEach((definition) => {
    if (catalog.has(definition.id)) throw new Error(`相手キャラクターIDが重複しています: ${definition.id}`);
    catalog.set(definition.id, definition);
  });
  return catalog;
}

export function setCustomOpponentCharacters(definitions: readonly OpponentCharacterDefinition[]): void {
  const nextRuntimeOpponentCharacters = [...OPPONENT_CHARACTER_CATALOG, ...definitions];
  const nextRuntimeOpponentCharacterById = createOpponentCatalog(nextRuntimeOpponentCharacters);
  runtimeOpponentCharacters = nextRuntimeOpponentCharacters;
  runtimeOpponentCharacterById = nextRuntimeOpponentCharacterById;
}

export function listOpponentCharacters(): readonly OpponentCharacterDefinition[] {
  return runtimeOpponentCharacters;
}

export function resolveOpponentCharacter(characterId: string): OpponentCharacterDefinition | null {
  return runtimeOpponentCharacterById.get(characterId) ?? null;
}

export function opponentPortrait(character: OpponentCharacterDefinition, kind: "default" | "hurt" | "delight" | "cutInTrump" | "cutInFinisher"): string {
  return character.portraits[kind] ?? character.portraits.default;
}

export function opponentVoiceLine(character: OpponentCharacterDefinition, cue: OpponentVoiceCue) {
  return character.lines[cue] ?? null;
}

export function opponentDeckSelection(character: OpponentCharacterDefinition): DeckSelection {
  return character.deckSelection ?? { kind: "random" };
}

export function opponentAiProfile(character: OpponentCharacterDefinition): AiProfile {
  return character.aiProfile ?? "challenger";
}
