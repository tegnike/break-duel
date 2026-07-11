import type { AiProfile } from "../game";
import type { DeckSelection } from "../duelSetup";

export type OpponentVoiceCue =
  | "match_start"
  | "rival_turn_start"
  | "play_summon"
  | "upgrade"
  | "memory"
  | "charge"
  | "attack"
  | "field_defense"
  | "hand_defense"
  | "damage_taken"
  | "command"
  | "cutin_trump"
  | "cutin_finisher"
  | "victory"
  | "defeat";

export type OpponentVoiceLine = Readonly<{ text: string; audioSrc?: string }>;

export type OpponentCharacterDefinition = Readonly<{
  id: string;
  defaultDisplayName: string;
  deckSelection?: DeckSelection;
  aiProfile?: AiProfile;
  portraits: Readonly<{
    default: string;
    hurt?: string;
    delight?: string;
    cutInTrump?: string;
    cutInFinisher?: string;
  }>;
  lines: Partial<Record<OpponentVoiceCue, OpponentVoiceLine>>;
}>;

export type OpponentPortraitKind = keyof OpponentCharacterDefinition["portraits"];

export type SavedOpponentCharacter = {
  version: 1;
  id: string;
  defaultDisplayName: string;
  deckSelection: DeckSelection;
  aiProfile: AiProfile;
  portraits: {
    default: string;
    hurt?: string;
    delight?: string;
    cutInTrump?: string;
    cutInFinisher?: string;
  };
  lines: Partial<Record<OpponentVoiceCue, { text: string; audioSrc?: string }>>;
  assetNames: {
    portraits: Partial<Record<OpponentPortraitKind, string>>;
    audio: Partial<Record<OpponentVoiceCue, string>>;
  };
  updatedAt: string;
};

export type SavedOpponentProfile = {
  id: string;
  profileLabel: string;
  characterId: string;
  deckSelection: DeckSelection;
  aiProfile: AiProfile;
  updatedAt: string;
};

export type OpponentProfileStoreV1 = {
  version: 1;
  selectedProfileId: string;
  profiles: SavedOpponentProfile[];
};

export type ResolvedOpponentSnapshot = {
  profileId: string;
  profileLabel: string;
  displayName: string;
  characterId: string;
  aiProfile: AiProfile;
  character: OpponentCharacterDefinition;
  matchId: string;
};
