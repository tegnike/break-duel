import * as React from "react";
import { createPortal } from "react-dom";
import { DUEL_CUT_IN_DURATION_MS, duelEventDurationMs, type DuelCutIn, type DuelCutInStyle, type DuelEvent } from "../duelEvents";
import { CardView } from "./CardView";
const CUT_IN_KICKERS: Record<DuelCutInStyle, string> = {
  trump: "TRUMP CARD",
  finisher: "FINISH BLOW",
};

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

// 相手の切札/とどめ用カットイン。.stitch-shell 直下は position:relative が強制されるため body へ Portal する。
export function DuelCutInOverlay({ cutIn, portrait, line }: { cutIn: (DuelCutIn & { id: number }) | null; portrait: string; line?: string }) {
  if (!cutIn) return null;
  return createPortal(<DuelCutInView key={cutIn.id} cutIn={cutIn} portrait={portrait} line={line} />, document.body);
}

export function DuelCutInView({ cutIn, portrait, line }: { cutIn: DuelCutIn; portrait: string; line?: string }) {
  return (
    <div
      className={`duel-cut-in ${cutIn.style}`}
      style={{ "--cut-in-duration": `${DUEL_CUT_IN_DURATION_MS}ms` } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="duel-cut-in-band" />
      <img className="duel-cut-in-portrait" src={portrait} alt="" />
      <div className="duel-cut-in-line">
        <span className="duel-cut-in-kicker">{CUT_IN_KICKERS[cutIn.style]}</span>
        {line && <span className="duel-cut-in-text">{line}</span>}
      </div>
    </div>
  );
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
