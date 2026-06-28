import * as React from "react";
import type { Card, Zone } from "../game";
import {
  cardArtAsset,
  cardArtClass,
  cardArtGlyph,
  cardColor,
  cardCoreText,
  cardTypeLabel,
  displayCost,
  roleLabel,
} from "./cardPresentation";

export function CardView({
  card,
  ownerIndex,
  zone,
  index,
  selected = false,
  selectable = false,
  spent = false,
  actionState = "idle",
  visualEffect = "",
  showCost = true,
  extraBadges = [],
  onClick,
}: {
  card: Card;
  ownerIndex: number;
  zone: Zone;
  index: number;
  selected?: boolean;
  selectable?: boolean;
  spent?: boolean;
  actionState?: string;
  visualEffect?: string;
  showCost?: boolean;
  extraBadges?: string[];
  onClick?: () => void;
}) {
  const Element = selectable ? "button" : "div";
  const cost = displayCost(card, actionState);
  return (
    <Element
      type={selectable ? "button" : undefined}
      className={`card ${card.type === "event" ? "command" : ""} ${card.type === "memory" ? "memory" : ""} ${selected ? "selected" : ""} ${selectable ? "selectable" : ""} ${spent ? "spent" : ""} ${visualEffect} ${actionState}`}
      style={{ "--card-color": cardColor(card) } as React.CSSProperties}
      data-owner={ownerIndex}
      data-zone={zone}
      data-index={index}
      onClick={onClick}
    >
      <div className="card-header">
        <div className="card-name">{card.name}</div>
        <div className="card-id">{card.id}</div>
      </div>
      <div className={`card-art kenney-art ${cardArtClass(card)}`}>
        <img src={cardArtAsset(card)} alt="" loading="lazy" />
        <span>{cardArtGlyph(card)}</span>
      </div>
      <div className="card-core"><div className="power">{cardCoreText(card)}</div></div>
      <div className="card-foot"><span>{cardTypeLabel(card)}</span><span>{spent ? "消耗" : roleLabel(card)}</span></div>
      <div className="card-badges">
        {showCost && Number.isFinite(cost) && cost < 99 && <span>{cost}A</span>}
        {actionState === "usable" && <span>実行可</span>}
        {actionState === "upgradeable" && <span>進化可</span>}
        {actionState === "upgrade-source" && <span>元</span>}
        {spent && <span>消耗</span>}
        {extraBadges.map((badge) => <span className="wide-badge" key={badge}>{badge}</span>)}
      </div>
    </Element>
  );
}

export function CardArtPreview({ card }: { card: Card | null }) {
  if (!card) return <div className="empty-preview"><span>カード選択</span></div>;

  return (
    <div
      className={`selected-art-preview ${cardArtClass(card)}`}
      style={{ "--card-color": cardColor(card) } as React.CSSProperties}
      aria-label={`${card.name}のイラスト`}
    >
      <img src={cardArtAsset(card)} alt="" loading="lazy" />
      <span>{cardArtGlyph(card)}</span>
    </div>
  );
}
