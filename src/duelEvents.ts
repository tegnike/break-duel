import type { Card } from "./game";
import type { RivalVoiceLineId } from "./rivalVoiceLines";

export type DuelEventCardState = "neutral" | "winner" | "loser" | "trash";

// 山場の強調度。peak = 3点以上のダメージ/切札登場、high = 2点ダメージ/討伐/相打ち、low = 1点ダメージ等の軽い出来事。
export type DuelEventEmphasis = "low" | "high" | "peak";

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
    fatal?: boolean;
  };
  rivalVoiceLine?: RivalVoiceLineId;
  durationMs?: number;
  emphasis?: DuelEventEmphasis;
  breakDraw?: {
    targetPlayerIndex: number;
    count: number;
  };
};

export type DuelEvent = DuelEventPayload & { id: number };

export function duelEventDurationMs(event: DuelEventPayload): number {
  if (event.durationMs) return event.durationMs;
  if (event.emphasis === "peak") return 3800;
  if (event.emphasis === "high") return 3200;
  if (event.emphasis === "low") return 2000;
  if (event.kind === "battle") return 3200;
  if (event.kind === "damage") return 2900;
  if (event.kind === "play" || event.kind === "upgrade") return 2600;
  return 2400;
}
