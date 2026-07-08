import type { Card } from "./game";
import type { RivalVoiceLineId } from "./rivalVoiceLines";

export type DuelEventCardState = "neutral" | "winner" | "loser" | "trash";

// カットイン演出の種別。trump = ライバルの power 4 登場、finisher = ライバルの致死攻撃。
export type DuelCutInStyle = "trump" | "finisher";

export type DuelCutIn = {
  style: DuelCutInStyle;
  line?: string;
};

// カットイン全体の表示時間。リール表示の前置きとして再生され、この時間経過後に通常のリールへ進む。
export const DUEL_CUT_IN_DURATION_MS = 1400;

export const TRUMP_CUT_IN_LINE = "ここで決めます…！！";
export const FINISHER_CUT_IN_LINE = "これで最後です…！！";

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
  cutIn?: DuelCutIn;
  breakDraw?: {
    targetPlayerIndex: number;
    count: number;
  };
};

export type DuelEvent = DuelEventPayload & { id: number };

// 相手（rivalIndex）の致死攻撃に finisher カットインを付与する判定。
// すでに cutIn を持つイベント（trump 付与済みなど）はそのまま優先する。
export function cutInForEvent(event: DuelEventPayload, rivalIndex: number): DuelCutIn | null {
  if (event.cutIn) return event.cutIn;
  const impact = event.impact;
  if (!impact || impact.kind !== "life-damage") return null;
  if (impact.sourcePlayerIndex !== rivalIndex || impact.targetPlayerIndex === rivalIndex) return null;
  if (impact.fatal) return { style: "finisher", line: FINISHER_CUT_IN_LINE };
  return null;
}

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
