import * as React from "react";
import Tilt from "react-parallax-tilt";
import { attacksPlus1, cardSet, conditionalAttackBonus, defensePowerBonus, turnAttackBonus, type Card, type GameState, type Zone } from "../game";
import {
  cardArtAsset,
  cardArtClass,
  cardArtGlyph,
  cardColor,
  cardCoreText,
} from "./cardPresentation";
import { RARITY_LABELS, baseCardRarity, type CardRarity } from "../rarity";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const TILT_SETTINGS: Record<"sr" | "ur", { angle: number; scale: number; glareOpacity: number }> = {
  sr: { angle: 10, scale: 1.03, glareOpacity: 0.28 },
  ur: { angle: 16, scale: 1.05, glareOpacity: 0.42 },
};

// 大型プレビューは面積が大きく、拡大や深い角度はフレーム余白を突き抜けるので控えめにする
const PREVIEW_TILT_SETTINGS: Record<CardRarity, { angle: number; scale: number; glareOpacity: number }> = {
  n: { angle: 5, scale: 1, glareOpacity: 0.08 },
  r: { angle: 6, scale: 1, glareOpacity: 0.15 },
  sr: { angle: 8, scale: 1, glareOpacity: 0.28 },
  ur: { angle: 10, scale: 1, glareOpacity: 0.42 },
};

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
  showSetBadge = true,
  showRarityBadge = true,
  tiltEnabled = false,
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
  showSetBadge?: boolean;
  showRarityBadge?: boolean;
  tiltEnabled?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
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
  const attackBonus = showStatBadges ? visibleAttackBonus(card, game, ownerIndex, index) : 0;
  if (attackBonus > 0) {
    addStatBadge(statBadges, `攻撃+${attackBonus}`);
  }
  const fieldDefenseBonus = showStatBadges ? visibleFieldDefenseBonus(card, game, ownerIndex, zone, index) : 0;
  if (fieldDefenseBonus > 0) {
    addStatBadge(statBadges, `場防御+${fieldDefenseBonus}`);
  }
  const setBadge = `${cardSet(card)}弾`;
  const rarity = baseCardRarity(card);
  const rarityClass = rarity ? `card-rarity-${rarity}` : "";
  const foilRarity: "sr" | "ur" | null = rarity === "sr" || rarity === "ur" ? rarity : null;
  const useTilt = tiltEnabled && foilRarity !== null && !reducedMotion;

  const cardElement = (
    <Element
      type={selectable ? "button" : undefined}
      className={`card ${card.type === "event" ? "command" : ""} ${card.type === "memory" ? "memory" : ""} ${selected ? "selected" : ""} ${selectable ? "selectable" : ""} ${spent ? "spent" : ""} ${rarityClass} ${visualEffect} ${actionState}`}
      style={{ "--card-color": cardColor(card) } as React.CSSProperties}
      data-owner={ownerIndex}
      data-zone={zone}
      data-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="card-header">
        <div className="card-name">{card.name}</div>
        <div className="card-id">
          <span>{card.id}</span>
          {showRarityBadge && rarity && <span className={`card-face-rarity rarity-${rarity}`}>{RARITY_LABELS[rarity]}</span>}
        </div>
      </div>
      <div className={`card-art kenney-art ${cardArtClass(card)}`}>
        <img src={cardArtAsset(card)} alt="" loading="lazy" />
        <span>{cardArtGlyph(card)}</span>
      </div>
      <div className="card-core"><div className="power">{cardCoreText(card)}</div></div>
      {showSetBadge && <div className="card-set-badge" title={setBadge}>{setBadge}</div>}
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

  if (!useTilt) return cardElement;

  const { angle, scale, glareOpacity } = TILT_SETTINGS[foilRarity];
  return (
    <Tilt
      className={`card-tilt rarity-${foilRarity}`}
      tiltMaxAngleX={angle}
      tiltMaxAngleY={angle}
      perspective={800}
      scale={scale}
      transitionSpeed={800}
      glareEnable
      glareMaxOpacity={glareOpacity}
      glareColor="#ffffff"
      glarePosition="all"
      glareBorderRadius="10px"
    >
      {cardElement}
    </Tilt>
  );
}

function CardStatusBadge({ badge }: { badge: string }) {
  if (badge.startsWith("攻撃+")) {
    const bonus = badge.slice("攻撃".length);
    return (
      <span className="stat-badge sword-badge" aria-label={`戦闘時、攻撃値 ${bonus}`} title={`戦闘時、攻撃値 ${bonus}(ダメージは power のまま)`}>
        <span>攻</span>
        <b>{bonus}</b>
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
  const defender = game?.players[ownerIndex] ?? null;
  return defensePowerBonus(card, defender, null, { fieldDefense: true, fieldIndex: zone === "field" ? index : undefined });
}

function visibleAttackBonus(card: Card, game: GameState | undefined, ownerIndex: number, index: number): number {
  const player = game?.players[ownerIndex];
  return (attacksPlus1(card) ? 1 : 0)
    + turnAttackBonus(player, index)
    + conditionalAttackBonus(card, player);
}

function isStatBadge(badge: string): boolean {
  return badge.startsWith("攻撃+") || badge.startsWith("場防御+");
}

function addStatBadge(badges: string[], badge: string) {
  if (badge.startsWith("攻撃+")) {
    const existingAttackBadgeIndex = badges.findIndex((candidate) => candidate.startsWith("攻撃+"));
    if (existingAttackBadgeIndex === -1) {
      badges.push(badge);
    } else if (attackBadgeValue(badge) > attackBadgeValue(badges[existingAttackBadgeIndex])) {
      badges[existingAttackBadgeIndex] = badge;
    }
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

function attackBadgeValue(badge: string): number {
  const value = Number(badge.replace("攻撃+", ""));
  return Number.isFinite(value) ? value : 0;
}

function defenseBadgeValue(badge: string): number {
  const value = Number(badge.replace("場防御+", ""));
  return Number.isFinite(value) ? value : 0;
}

export function CardArtPreview({ card }: { card: Card | null }) {
  const reducedMotion = usePrefersReducedMotion();
  if (!card) return <div className="empty-preview"><span>カード選択</span></div>;

  const rarity = baseCardRarity(card);
  const foilRarity: CardRarity | null = rarity === "sr" || rarity === "ur" ? rarity : null;

  const preview = (
    <div
      className={`selected-art-preview ${cardArtClass(card)} ${foilRarity ? `preview-rarity-${foilRarity}` : ""}`}
      style={{ "--card-color": cardColor(card) } as React.CSSProperties}
      aria-label={`${card.name}のイラスト`}
    >
      <img src={cardArtAsset(card)} alt="" loading="lazy" />
      <span>{cardArtGlyph(card)}</span>
    </div>
  );

  if (reducedMotion) return <div className="selected-art-preview-frame">{preview}</div>;

  const { angle, scale, glareOpacity } = PREVIEW_TILT_SETTINGS[rarity ?? "n"];
  return (
    <div className="selected-art-preview-frame">
      <Tilt
        className={`selected-art-preview-tilt rarity-${rarity ?? "n"}`}
        tiltMaxAngleX={angle}
        tiltMaxAngleY={angle}
        perspective={900}
        scale={scale}
        transitionSpeed={800}
        glareEnable
        glareMaxOpacity={glareOpacity}
        glareColor="#ffffff"
        glarePosition="all"
        glareBorderRadius="8px"
      >
        {preview}
      </Tilt>
    </div>
  );
}
