import * as React from "react";
import { useEffect, useRef } from "react";
import {
  ATTRIBUTES,
  type Attribute,
  type Card,
  type DefenseChoice,
  type GameState,
  type PlayerState,
  activePlayer,
  aiEffectText,
  attackCombatValue,
  bestUpgradeSource,
  canActivePlayerAttack,
  canHumanAct,
  chooseAiDefense,
  commandUsable,
  defenseCombatValue,
  defenseMathText,
  defensePowerBonus,
  legalFieldDefenders,
  legalHandDefenders,
  opponentPlayer,
  playCost,
  upgradeCost,
} from "../game";
import { CardView } from "./CardView";
import { cardColor, cardTypeLabel, roleText, selectedText } from "./cardPresentation";

export function SelectedCardDetail({ card, zone, game }: { card: Card | null; zone: string | null; game: GameState }) {
  if (!card) {
    return (
      <div className="selected-card">
        <div className="detail-title">選択なし</div>
        <div className="detail-meta">残りアクション {game.actionsRemaining}</div>
      </div>
    );
  }
  const canShowUpgradeCost = zone === "hand" && card.type === "ai" && bestUpgradeSource(game.players[0], card) !== null;
  const parts = [
    cardTypeLabel(card),
    card.attribute ? `${card.attribute}属性` : null,
    card.power ? `power ${card.power}` : null,
    `${playCost(card)}アクション`,
    canShowUpgradeCost ? `アップグレード ${upgradeCost(card)}アクション` : null,
    zone === "field" && game.players[0].spentFieldIndexes.has(game.selected?.index ?? -1) ? "消耗中" : null,
  ].filter(Boolean);
  return (
    <div className="selected-card">
      <div className="detail-title">{card.name}</div>
      <div className="detail-meta">{parts.join(" / ")}</div>
      <div className="detail-effect">{roleText(card)}</div>
      {card.type === "ai" && card.attribute && (
        <div className="detail-affinity">AI効果: {aiEffectText(card)}</div>
      )}
    </div>
  );
}

export function AffinityGuide({ game, selected }: { game: GameState; selected: Card | null }) {
  const attackPreview = selected?.type === "ai" && game.selected?.zone === "field"
    ? <OpponentDefensePreview game={game} attackCard={selected} />
    : null;
  return (
    <div className="affinity-guide" aria-label="属性特性">
      <div className="affinity-title">AI効果</div>
      <div className="affinity-chain">
        {attributePill("火")}<span>攻撃</span>{attributePill("水")}<span>ドロー</span>{attributePill("風")}<span>テンポ</span>{attributePill("土")}<span>防御</span>
      </div>
      <div className="affinity-note">属性相性はありません。属性ごとの傾向はありますが、効果は一部AIカードだけが個別に持ちます。</div>
      {selected?.type === "ai" && selected.attribute && (
        <span className="affinity-selected">
          {attributePill(selected.attribute)}
          {aiEffectText(selected)}
        </span>
      )}
      {attackPreview}
    </div>
  );
}

function OpponentDefensePreview({ game, attackCard }: { game: GameState; attackCard: Card }) {
  const opponent = game.players[1];
  const rows = opponent.field
    .map((card, index) => ({ card, index }))
    .filter(({ index }) => !opponent.spentFieldIndexes.has(index));
  if (rows.length === 0) return <div className="affinity-preview">相手の未消耗AIなし。攻撃は通りやすいです。</div>;
  return (
    <div className="affinity-preview">
      <div className="affinity-preview-title">相手の場の防御候補</div>
      <div className="affinity-defense-list">
        {rows.map(({ card }) => {
          const defenseValue = defenseCombatValue(attackCard, card, opponent);
          const attackValue = attackCombatValue(attackCard);
          const result = defenseValue > attackValue ? "防御側が残る" : defenseValue === attackValue ? "相打ち" : "防御不可";
          return (
            <div className="affinity-defense-row" style={{ "--card-color": cardColor(card) } as React.CSSProperties} key={card.id}>
              <div className="affinity-defense-main">{card.name} / {card.attribute} / power {card.power}</div>
              <div className="affinity-defense-sub">防御値 {defenseValue} vs 攻撃値 {attackValue} / {result}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DefensePanel({
  game,
  onResolve,
  onUseCommand,
  onCancelTarget,
  onTogglePendingHand,
  onConfirmPending,
}: {
  game: GameState;
  onResolve: (choice: DefenseChoice) => void;
  onUseCommand: (sourceIndex: number, targetIndex: number | null) => void;
  onCancelTarget: () => void;
  onTogglePendingHand: (index: number) => void;
  onConfirmPending: () => void;
}) {
  if (game.pendingTarget) {
    if (game.pendingTarget.kind === "hand-discard") {
      const pending = game.pendingTarget;
      const player = game.players[pending.playerIndex];
      const excluded = new Set(pending.excludeIndexes);
      const selected = new Set(pending.selectedIndexes);
      return (
        <div className="defense-panel">
          <h3>{pending.title}</h3>
          <p className="choice-prompt">{pending.prompt}</p>
          <div className="defense-actions">
            {player.hand.map((card, index) => excluded.has(index) ? null : (
              <button type="button" key={`${card.id}-${index}`} className={selected.has(index) ? "action-ready" : ""} onClick={() => onTogglePendingHand(index)}>
                {selected.has(index) ? "選択中: " : ""}{card.name}
              </button>
            ))}
            <button type="button" disabled={pending.selectedIndexes.length < pending.min} onClick={onConfirmPending}>
              {pending.reason === "optimize" ? "捨てて2枚引く" : pending.reason === "firewall" ? "このカードで強化" : "このカードを捨てる"}
            </button>
            <button type="button" onClick={onCancelTarget}>キャンセル</button>
          </div>
        </div>
      );
    }
    const pendingTarget = game.pendingTarget;
    const player = activePlayer(game);
    const opponent = opponentPlayer(game);
    const command = player.hand[pendingTarget.sourceIndex];
    return (
      <div className="defense-panel">
        <h3>{command.name}の対象を選択</h3>
        <div className="defense-actions">
          {opponent.field.map((card, index) => opponent.spentFieldIndexes.has(index) ? null : (
            <button type="button" key={`${card.id}-${index}`} onClick={() => onUseCommand(pendingTarget.sourceIndex, index)}>{card.name}</button>
          ))}
          <button type="button" onClick={onCancelTarget}>キャンセル</button>
        </div>
      </div>
    );
  }

  const pending = game.pendingAttack;
  if (!pending || !game.players[pending.defenderIndex].isHuman) return null;
  const attackCard = game.players[pending.attackerIndex].field[pending.fieldIndex];
  const defender = game.players[pending.defenderIndex];
  const fieldOptions = legalFieldDefenders(defender, attackCard);
  const handOptions = legalHandDefenders(defender, attackCard);
  return (
    <div className="defense-panel">
      <h3>{attackCard.name}への防御を選択</h3>
      <div className="defense-context">攻撃値 {attackCombatValue(attackCard)} / 場ブロックは同値なら相打ち、上回れば防御AIが残ります。手札ブロックは使い切りです。</div>
      <div className="defense-choice-grid">
        {fieldOptions.map(({ card, index }) => <DefenseChoiceButton key={`field-${index}`} source="場" card={card} attackCard={attackCard} defender={defender} onClick={() => onResolve({ type: "field", index })} />)}
        {handOptions.map(({ card, index }) => <DefenseChoiceButton key={`hand-${index}`} source="手札" card={card} attackCard={attackCard} defender={defender} hand onClick={() => onResolve({ type: "hand", index })} />)}
        {fieldOptions.length === 0 && handOptions.length === 0 && <div className="defense-context">防御できるカードはありません。</div>}
        <button type="button" className="defense-pass" onClick={() => onResolve({ type: "none" })}>防御しない</button>
      </div>
    </div>
  );
}

function DefenseChoiceButton({ source, card, attackCard, defender, hand = false, onClick }: { source: string; card: Card; attackCard: Card; defender: PlayerState; hand?: boolean; onClick: () => void }) {
  const defenseValue = defenseCombatValue(attackCard, card, defender);
  const traitBonus = card.effect === "defense_plus_1" ? 1 : 0;
  const attackValue = attackCombatValue(attackCard);
  const result = hand
    ? "防御成功 / このカードをトラッシュ"
    : defenseValue === attackValue
      ? "相打ち / 両方トラッシュ"
      : "防御AIが残る / 攻撃AI退場";
  return (
    <button type="button" className="defense-choice" style={{ "--card-color": cardColor(card) } as React.CSSProperties} title={`${source}: ${card.name} / ${defenseMathText(attackCard, card, defender)}`} onClick={onClick}>
      <div className="defense-choice-head">
        <span className="defense-source">{source}</span>
        <span className="defense-choice-name">{card.name}</span>
      </div>
      <div className="defense-choice-body">
        <span>{card.attribute} / power {card.power}</span>
        <span>防御値 {defenseValue} = {card.power} + {defensePowerBonus(card, defender, attackCard) - traitBonus} + {traitBonus}</span>
        <span className="defense-choice-result">{result}</span>
      </div>
    </button>
  );
}

export function LogList({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length]);
  return (
    <ol className="log" ref={ref}>
      {entries.map((entry, index) => (
        <li key={`${index}-${entry}`} className={index === entries.length - 1 ? "log-latest" : ""}>{entry}</li>
      ))}
    </ol>
  );
}

export function actionHintText(game: GameState, card: Card | null, zone: string | null): string {
  if (!card) return canHumanAct(game) ? "手札と場の明るい枠が、いま使える候補です。" : "相手AIの行動中です。";
  if (!canHumanAct(game)) return "相手AIの行動中です。";
  const human = game.players[0];
  const opponent = game.players[1];
  if (zone === "hand") {
    if (card.type === "event") return commandUsable(game, card, human, opponent) ? `${card.name}を使用できます。` : `${card.name}は条件を満たすと使用できます。`;
    if (card.type === "memory") return human.memory ? "配置すると現在のメモリーはトラッシュされます。" : "メモリー枠に配置できます。";
    const sourceIndex = bestUpgradeSource(human, card);
    if (sourceIndex !== null && upgradeCost(card) <= game.actionsRemaining) return `${human.field[sourceIndex].name}を元に${upgradeCost(card)}アクションでアップグレードできます。`;
    if (human.field.length < 3 && playCost(card) <= game.actionsRemaining) return "場に出せます。";
    if (human.field.length >= 3) return "場が埋まっています。アップグレード元があれば入れ替えられます。";
    return "残りアクションが足りません。";
  }
  if (zone === "field") {
    if (!canActivePlayerAttack(game)) return "先攻初ターンは攻撃できません。";
    if (human.spentFieldIndexes.has(game.selected?.index ?? -1)) return "消耗中のため行動できません。";
    const defense = chooseAiDefense(opponent, card);
    return defense.type === "none" ? "攻撃するとダメージが通る見込みです。" : "攻撃すると防御される可能性があります。";
  }
  return selectedText(card);
}

function attributePill(attribute: Attribute) {
  return <span className="attribute-pill" style={{ "--pill-color": ATTRIBUTES[attribute].color } as React.CSSProperties}>{attribute}</span>;
}
