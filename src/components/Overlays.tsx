import * as React from "react";
import { duelEventDurationMs, type DuelEvent } from "../duelEvents";
import { ATTRIBUTES, MEMORY_COLOR, type Attribute } from "../game";
import { ATTRIBUTE_FX_HIGHLIGHT, RELIC_FX_HIGHLIGHT } from "../summonFx";
import { CardView } from "./CardView";

export type Toast = { title: string; detail?: string; id: number } | null;
export type Banner = {
  kind: "start" | "turn" | "result";
  title: string;
  detail: string;
  id: number;
  tone?: "human" | "ai" | "win" | "lose" | "draw";
} | null;

export function DuelActionReel({
  event,
  autoDismiss,
  onClose,
  children,
}: {
  event: DuelEvent | null;
  autoDismiss: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  if (!event) return null;
  const durationMs = duelEventDurationMs(event);
  const resultText = event.resultLabel ?? routeText(event);
  const showResult = resultText.trim() !== event.title.trim();
  return (
    <>
      <div className="duel-action-backdrop" aria-hidden="true" onClick={onClose} />
      <section
        className={`duel-action-reel ${autoDismiss ? "auto" : "manual"} ${event.kind} ${event.tone ?? ""} ${event.emphasis ? `emphasis-${event.emphasis}` : ""} ${event.cards.length > 2 ? "multi" : event.cards.length > 1 ? "pair" : "single"} ${children ? "with-panel" : ""}`}
        style={{ "--event-duration": `${durationMs}ms` } as React.CSSProperties}
        aria-live="polite"
      >
        <button type="button" className="duel-action-close" onClick={onClose}>
          {autoDismiss ? "閉じる" : "確認"}
        </button>
        <div className="duel-action-head">
          <span>{event.fromLabel ?? "ACTION"}</span>
          <strong>{event.title}</strong>
          <span>{event.toLabel ?? event.resultLabel ?? ""}</span>
        </div>
        <div className="duel-action-route">
          <span>{event.fromLabel ?? "ACTION"}</span>
          <b>→</b>
          <span>{event.toLabel ?? event.resultLabel ?? "RESULT"}</span>
        </div>
        <div className="duel-action-body">
          <div className="duel-action-burst" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => <span key={index} />)}
          </div>
          {event.cards.map(({ card, label, state }, index) => (
            <React.Fragment key={`${event.id}-${card.id}-${index}`}>
              {index > 0 && <div className="duel-action-vs">{event.kind === "battle" ? "VS" : "→"}</div>}
              <div className={`duel-action-card card-${index} ${state ?? "neutral"}`}>
                <div className="duel-action-card-role">{label}</div>
                <CardView card={card} ownerIndex={9} zone="field" index={index} showCost={false} showSetBadge={false} />
              </div>
            </React.Fragment>
          ))}
        </div>
        {showResult && <div className="duel-action-result"><span>{resultText}</span></div>}
        <p>{event.detail}</p>
        {children && <div className="duel-action-embedded">{children}</div>}
      </section>
    </>
  );
}

function routeText(event: DuelEvent): string {
  if (event.fromLabel && event.toLabel) return `${event.fromLabel} → ${event.toLabel}`;
  return event.kind.toUpperCase();
}

export type SummonBurst = {
  id: number;
  kind: "summon" | "relic";
  attribute?: Attribute;
  subAttribute?: Attribute;
  rect: { left: number; top: number; width: number; height: number };
};

type BurstParticle = { x: number; y: number; delay: number; size: number; rot: number };

// 決定的なパーティクル配置（角度扇状 + 疑似ばらつき）。Math.random は使わない。
function fanParticles(count: number, baseAngleDeg: number, spreadDeg: number, distMin: number, distMax: number): BurstParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const step = count <= 1 ? 0.5 : index / (count - 1);
    const angleDeg = baseAngleDeg - spreadDeg / 2 + spreadDeg * step;
    const angle = (angleDeg * Math.PI) / 180;
    const distStep = count <= 1 ? 0.5 : ((index * 5) % count) / (count - 1);
    const dist = distMin + (distMax - distMin) * distStep;
    return {
      x: Math.round(Math.cos(angle) * dist),
      y: Math.round(Math.sin(angle) * dist),
      delay: (index * 41) % 160,
      size: 7 + ((index * 3) % 6),
      // 進行方向に沿った回転（風の筋・岩片・星の向きを揃える）
      rot: Math.round(angleDeg),
    };
  });
}

// 属性ごとの散り方: 火=上向きに舞う、水=全方位の波紋、風=左右へ流れる、土=下方へ砕け散る、遺物=輪状の煌めき
const SUMMON_BURST_PARTICLES: Record<string, BurstParticle[]> = {
  fire: fanParticles(14, -90, 130, 60, 128),
  water: fanParticles(12, -90, 360, 48, 86),
  wind: [...fanParticles(6, 0, 56, 80, 140), ...fanParticles(6, 180, 56, 80, 140)],
  earth: fanParticles(12, 90, 160, 56, 108),
  relic: fanParticles(10, -90, 360, 62, 94),
};

export function SummonBurstLayer({ burst, mode = "viewport" }: { burst: SummonBurst; mode?: "viewport" | "slot" }) {
  const attributeMeta = burst.kind === "summon" && burst.attribute ? ATTRIBUTES[burst.attribute] : null;
  const primary = burst.kind === "relic" ? MEMORY_COLOR : attributeMeta?.color;
  if (!primary) return null;
  const variant = burst.kind === "relic" ? "relic" : attributeMeta!.code.toLowerCase();
  const highlight = burst.kind === "relic" ? RELIC_FX_HIGHLIGHT : ATTRIBUTE_FX_HIGHLIGHT[burst.attribute!];
  const secondaryAttribute = burst.kind === "summon" && burst.subAttribute && burst.subAttribute !== burst.attribute
    ? burst.subAttribute
    : null;
  const secondary = secondaryAttribute ? ATTRIBUTES[secondaryAttribute].color : primary;
  const secondaryHighlight = secondaryAttribute ? ATTRIBUTE_FX_HIGHLIGHT[secondaryAttribute] : highlight;
  const particles = SUMMON_BURST_PARTICLES[variant] ?? SUMMON_BURST_PARTICLES.relic;
  // slot モードは着地カードの positioned 親に Portal 描画され、rect はその親基準のレイアウト座標。
  // viewport モードはビューポート座標の fixed 描画。式はどちらもスロット中心を指す。
  const style = {
    left: `${burst.rect.left + burst.rect.width / 2}px`,
    top: `${burst.rect.top + burst.rect.height / 2}px`,
    "--burst-color": primary,
    "--burst-color-2": secondary,
    "--burst-highlight": highlight,
  } as React.CSSProperties;
  return (
    <div
      className={["summon-burst", mode === "slot" ? "in-slot" : "", variant === "relic" ? "relic" : `attr-${variant}`].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      <span className="summon-burst-flash" />
      <span className="summon-burst-glow" />
      <span className="summon-burst-ring" />
      <span className="summon-burst-ring ring-late" />
      <div className="summon-burst-particles">
        {particles.map((particle, index) => (
          <i
            key={index}
            style={{
              "--p-x": `${particle.x}px`,
              "--p-y": `${particle.y}px`,
              "--p-delay": `${particle.delay}ms`,
              "--p-size": `${particle.size}px`,
              "--p-rot": `${particle.rot}deg`,
              "--particle-color": index % 2 === 0 ? highlight : secondaryHighlight,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

export function EventToast({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return (
    <div className="event-toast" aria-live="polite">
      <strong>{toast.title}</strong>
      {toast.detail && <span>{toast.detail}</span>}
    </div>
  );
}

export function GameBanner({ banner, turn }: { banner: Banner; turn: number }) {
  if (!banner) return null;
  return (
    <div className={`duel-overlay ${banner.kind === "turn" ? `turn-banner ${banner.tone === "ai" ? "ai" : "human"}` : banner.kind} ${banner.tone ?? ""}`}>
      <div>
        <div className={banner.kind === "turn" ? "turn-banner-kicker" : "duel-overlay-kicker"}>
          {banner.kind === "turn" ? `TURN ${turn}` : banner.kind === "start" ? "MATCH START" : banner.tone === "win" ? "VICTORY" : banner.tone === "lose" ? "DEFEAT" : "DRAW"}
        </div>
        <div className={banner.kind === "turn" ? "turn-banner-title" : "duel-overlay-title"}>{banner.title}</div>
        <div className={banner.kind === "turn" ? "turn-banner-detail" : "duel-overlay-detail"}>{banner.detail}</div>
      </div>
    </div>
  );
}
