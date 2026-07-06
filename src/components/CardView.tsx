import * as React from "react";
import { attacksPlus1, cardSet, defensePowerBonus, type Card, type GameState, type Zone } from "../game";
import {
  cardArtAsset,
  cardArtClass,
  cardArtGlyph,
  cardColor,
  cardCoreText,
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
  game,
  extraBadges = [],
  onClick,
  onMouseEnter,
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
  upgradeSource?: Card | null;
  game?: GameState;
  extraBadges?: string[];
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  const Element = selectable ? "button" : "div";
  const showStatBadges = zone === "field";
  const statBadges: string[] = [];
  const overlayBadges: string[] = [];
  for (const badge of extraBadges) {
    if (showStatBadges && isStatBadge(badge)) {
      addStatBadge(statBadges, badge);
    } else {
      overlayBadges.push(badge);
    }
  }
  if (showStatBadges && attacksPlus1(card)) {
    addStatBadge(statBadges, "攻撃+1");
  }
  const fieldDefenseBonus = showStatBadges ? visibleFieldDefenseBonus(card, game, ownerIndex, zone, index) : 0;
  if (fieldDefenseBonus > 0) {
    addStatBadge(statBadges, `場防御+${fieldDefenseBonus}`);
  }
  const setBadge = `${cardSet(card)}弾`;
  return (
    <Element
      type={selectable ? "button" : undefined}
      className={`card ${card.type === "event" ? "command" : ""} ${card.type === "memory" ? "memory" : ""} ${selected ? "selected" : ""} ${selectable ? "selectable" : ""} ${spent ? "spent" : ""} ${visualEffect} ${actionState}`}
      style={{ "--card-color": cardColor(card) } as React.CSSProperties}
      data-owner={ownerIndex}
      data-zone={zone}
      data-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
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
      <div className="card-set-badge" title={setBadge}>{setBadge}</div>
      {statBadges.length > 0 && (
        <div className="card-stat-badges">
          {statBadges.map((badge) => <CardStatusBadge badge={badge} key={badge} />)}
        </div>
      )}
      {overlayBadges.length > 0 && (
        <div className="card-overlay-badges">
          {overlayBadges.map((badge) => <CardStatusBadge badge={badge} key={badge} />)}
        </div>
      )}
    </Element>
  );
}

function CardStatusBadge({ badge }: { badge: string }) {
  if (badge === "攻撃+1") {
    return (
      <span className="stat-badge sword-badge" aria-label="戦闘時、攻撃値 +1" title="戦闘時、攻撃値 +1(ダメージは power のまま)">
        <span>攻</span>
        <b>+1</b>
      </span>
    );
  }
  if (badge.startsWith("場防御+")) {
    const bonus = badge.slice("場防御".length);
    return (
      <span className="stat-badge shield-badge" aria-label={`場防御値 ${bonus}`} title={`場防御値 ${bonus}`}>
        <span>防</span>
        <b>{bonus}</b>
      </span>
    );
  }
  return <span className="wide-badge">{badge}</span>;
}

function visibleFieldDefenseBonus(card: Card, game: GameState | undefined, ownerIndex: number, zone: Zone, index: number): number {
  const baseBonus = defensePowerBonus(card, null, null, { fieldDefense: true });
  const chargeBonus = zone === "field" && game?.players[ownerIndex]?.chargeGuardedFieldIndexes.has(index) ? 1 : 0;
  return baseBonus + chargeBonus;
}

function isStatBadge(badge: string): boolean {
  return badge === "攻撃+1" || badge.startsWith("場防御+");
}

function addStatBadge(badges: string[], badge: string) {
  if (badge === "攻撃+1") {
    if (!badges.includes(badge)) badges.push(badge);
    return;
  }
  if (badge.startsWith("場防御+")) {
    const existingDefenseBadgeIndex = badges.findIndex((candidate) => candidate.startsWith("場防御+"));
    if (existingDefenseBadgeIndex === -1) {
      badges.push(badge);
    } else if (defenseBadgeValue(badge) > defenseBadgeValue(badges[existingDefenseBadgeIndex])) {
      badges[existingDefenseBadgeIndex] = badge;
    }
  }
}

function defenseBadgeValue(badge: string): number {
  const value = Number(badge.replace("場防御+", ""));
  return Number.isFinite(value) ? value : 0;
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
