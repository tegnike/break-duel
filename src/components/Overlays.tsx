import * as React from "react";
import type { DuelEvent } from "../duelEvents";
import { cardColor, cardCoreText, cardTypeLabel } from "./cardPresentation";

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
  const durationMs = event.durationMs ?? defaultDuelEventDuration(event.kind);
  return (
    <section
      className={`duel-action-reel ${autoDismiss ? "auto" : "manual"} ${event.kind} ${event.tone ?? ""} ${event.cards.length > 1 ? "pair" : "single"} ${children ? "with-panel" : ""}`}
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
            <div className={`duel-action-card card-${index} ${state ?? "neutral"}`} style={{ "--card-color": cardColor(card) } as React.CSSProperties}>
              <div className="duel-action-card-label">{label}</div>
              <div className="duel-action-card-name">{card.name}</div>
              <div className="duel-action-card-core">{cardCoreText(card)}</div>
              <div className="duel-action-card-type">{cardTypeLabel(card)}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className="duel-action-result"><span>{event.resultLabel ?? routeText(event)}</span></div>
      <p>{event.detail}</p>
      {children && <div className="duel-action-embedded">{children}</div>}
    </section>
  );
}

function defaultDuelEventDuration(kind: DuelEvent["kind"]) {
  if (kind === "battle") return 3200;
  if (kind === "damage") return 2900;
  if (kind === "play" || kind === "upgrade") return 2600;
  return 2400;
}

function routeText(event: DuelEvent): string {
  if (event.fromLabel && event.toLabel) return `${event.fromLabel} → ${event.toLabel}`;
  return event.kind.toUpperCase();
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
