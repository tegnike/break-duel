// Compatibility exports for code outside the character catalog. New code should
// resolve cues from the active OpponentCharacterDefinition instead.
import { NIKE_CHARACTER } from "./opponents/nike";
import type { OpponentVoiceCue, OpponentVoiceLine } from "./opponents/types";

export type RivalVoiceLineId = OpponentVoiceCue;
export type RivalVoiceLine = OpponentVoiceLine;
export const RIVAL_VOICE_LINES = NIKE_CHARACTER.lines as Record<OpponentVoiceCue, OpponentVoiceLine>;
