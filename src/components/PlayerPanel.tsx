import * as React from "react";
import {
  CONFIG,
  type Card,
  type GameState,
  type PlayerState,
  bestUpgradeSource,
  canActivePlayerAttack,
  canChargeCard,
  canHumanAct,
  canUseCharge,
  canUpgrade,
  commandUsable,
  playCost,
  upgradeCost,
} from "../game";
import { CardView } from "./CardView";
import { cardColor, selectedText } from "./cardPresentation";

export function PlayerPanel({
  player,
  ownerIndex,
  isOpponent = false,
  game,
  onOpenDiscard,
  onSelectHand,
  onSelectField,
}: {
  player: PlayerState;
  ownerIndex: number;
  isOpponent?: boolean;
  game: GameState;
  onOpenDiscard: (ownerIndex: number) => void;
  onSelectHand?: (index: number) => void;
  onSelectField?: (index: number) => void;
}) {
  return (
    <section className={`player-panel ${isOpponent ? "opponent-panel" : ""}`} aria-label={player.name}>
      <div className="player-head">
        <div>
          <h2>{player.name}</h2>
          <p>{player.deckName} / 手札 {player.hand.length} / 山札 {player.deck.length} / トラッシュ {player.discard.length}</p>
          <DiscardTray player={player} ownerIndex={ownerIndex} onOpen={onOpenDiscard} />
        </div>
        <Life life={player.life} />
      </div>
      <div className="zone-label deck-label">山札</div>
      <div className="deck-row">
        <DeckPile player={player} ownerIndex={ownerIndex} />
      </div>
      <div className="zone-label memory-label">遺物</div>
      <div className="memory-row">
        {player.memory ? <CardView card={player.memory} ownerIndex={ownerIndex} zone="memory" index={0} showCost={false} showSetBadge={false} /> : <div className="empty-slot memory-slot">{isOpponent ? "相手遺物" : "遺物枠"}</div>}
      </div>
      <div className="zone-label field-label">場</div>
      <div className="field-row">
        {player.field.map((card, index) => (
          <CardView
            key={`${card.id}-${index}`}
            card={card}
            ownerIndex={ownerIndex}
            zone="field"
            index={index}
            selected={ownerIndex === 0 && game.selected?.zone === "field" && game.selected.index === index}
            selectable={ownerIndex === 0}
            spent={player.spentFieldIndexes.has(index)}
            actionState={ownerIndex === 0 ? fieldCardActionState(game, player, index) : "idle"}
            game={game}
            showCost={false}
            showSetBadge={false}
            onClick={() => onSelectField?.(index)}
          />
        ))}
        {Array.from({ length: CONFIG.fieldLimit - player.field.length }).map((_, index) => (
          <div className="empty-slot" key={`empty-${index}`}>空き</div>
        ))}
      </div>
      {!isOpponent && (
        <>
          <div className="zone-label hand-label">手札</div>
          <div className="hand-row">
            {player.hand.map((card, index) => {
              const actionState = handCardActionState(game, player, game.players[1], card);
              const sourceIndex = actionState === "upgradeable" ? bestUpgradeSource(player, card) : null;
              return (
                <CardView
                  key={`${card.id}-${index}`}
                  card={card}
                  ownerIndex={ownerIndex}
                  zone="hand"
                  index={index}
                  selected={game.selected?.zone === "hand" && game.selected.index === index}
                  selectable
                  actionState={actionState}
                  upgradeSource={sourceIndex === null ? null : player.field[sourceIndex]}
                  game={game}
                  showCost={false}
                  showSetBadge={false}
                  onClick={() => onSelectHand?.(index)}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Life({ life }: { life: number }) {
  return (
    <div className="life">
      {Array.from({ length: CONFIG.life }).map((_, index) => (
        <span key={index} className={`life-dot ${index >= life ? "empty" : ""}`} />
      ))}
    </div>
  );
}

function DeckPile({ player, ownerIndex }: { player: PlayerState; ownerIndex: number }) {
  return (
    <div className={`deck-pile ${player.deck.length === 0 ? "empty" : ""}`} data-owner={ownerIndex} data-zone="deck" data-index="0" title={`${player.name}の山札 ${player.deck.length}枚`}>
      <span className="deck-count">{player.deck.length}</span>
      <span className="deck-caption">山札</span>
    </div>
  );
}

function DiscardTray({ player, ownerIndex, onOpen }: { player: PlayerState; ownerIndex: number; onOpen: (ownerIndex: number) => void }) {
  const recent = player.discard.slice(-3).reverse();
  return (
    <div className="discard-tray" role="button" tabIndex={0} onClick={() => onOpen(ownerIndex)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onOpen(ownerIndex);
    }}>
      <span className="discard-label">トラッシュ</span>
      {recent.length === 0 ? <span className="discard-empty">なし</span> : recent.map((card, index) => (
        <span className="discard-chip" style={{ "--card-color": cardColor(card) } as React.CSSProperties} title={selectedText(card)} key={`${card.id}-${index}`}>{card.name}</span>
      ))}
      {player.discard.length > recent.length && <span className="discard-more">+{player.discard.length - recent.length}</span>}
    </div>
  );
}

function handCardActionState(game: GameState, player: PlayerState, opponent: PlayerState, card: Card): string {
  if (!canHumanAct(game) || !card) return "idle";
  const canCharge = canUseCharge(game, player) && canChargeCard(card);
  if (card.type === "event") return commandUsable(game, card, player, opponent) ? "usable" : canCharge ? "chargeable" : "blocked";
  if (card.type === "memory") return "usable";
  if (card.type === "ai") {
    const sourceIndex = bestUpgradeSource(player, card);
    const source = sourceIndex === null ? null : player.field[sourceIndex];
    const canPlay = player.field.length < CONFIG.fieldLimit && playCost(card, game) <= game.actionsRemaining;
    const canUpgradeCard = source !== null && upgradeCost(card, source) <= game.actionsRemaining;
    if (canPlay || canUpgradeCard) return canUpgradeCard ? "upgradeable" : "usable";
  }
  return canCharge ? "chargeable" : "blocked";
}

function fieldCardActionState(game: GameState, player: PlayerState, index: number): string {
  if (!canHumanAct(game)) return "idle";
  if (game.selected?.zone === "hand") {
    const target = player.hand[game.selected.index];
    if (canUpgrade(player.field[index], target)) return "upgrade-source";
  }
  if (!player.spentFieldIndexes.has(index) && canActivePlayerAttack(game)) return "usable";
  return "blocked";
}
