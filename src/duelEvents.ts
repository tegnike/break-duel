import type { Card } from "./game";

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
  durationMs?: number;
};

export type DuelEvent = DuelEventPayload & { id: number };
