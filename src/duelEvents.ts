import type { Card } from "./game";
import type { RivalVoiceLineId } from "./rivalVoiceLines";

export type DuelEventCardState = "neutral" | "winner" | "loser" | "trash";

export type DuelEventPayload = {
  kind: "play" | "memory" | "upgrade" | "command" | "battle" | "damage" | "trash";
  title: string;
  detail: string;
  fromLabel?: string;
  toLabel?: string;
  resultLabel?: string;
  tone?: "cyan" | "magenta" | "warning" | "danger";
  cards: {
    card: Card;
    label: string;
    state?: DuelEventCardState;
  }[];
  impact?: {
    kind: "life-damage";
    sourcePlayerIndex: number | null;
    targetPlayerIndex: number;
    amount: number;
  };
  rivalVoiceLine?: RivalVoiceLineId;
  durationMs?: number;
};

export type DuelEvent = DuelEventPayload & { id: number };
