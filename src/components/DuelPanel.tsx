import * as React from "react";
import { useEffect, useRef } from "react";
import {
  ATTRIBUTES,
  CONFIG,
  type Attribute,
  type AttackContext,
  type Card,
  type DefenseChoice,
  type GameState,
  type PlayerState,
  activePlayer,
  aiEffectText,
  attackCombatValue,
  attackDamage,
  bestUpgradeSource,
  canActivePlayerAttack,
  canChargeCard,
  canHumanAct,
  canHumanEndTurn,
  canUseAcceleratorMemory,
  canUseCharge,
  canUseFirewall,
  chooseAiDefense,
  commandBlockedReason,
  commandUsable,
  defenseCombatValue,
  defenseMathText,
  defensePowerBonus,
  legalFieldDefenders,
  legalHandDefenders,
  legalStrikeFieldDefenders,
  strikeValues,
  opponentPlayer,
  playCost,
  strikeTargets,
  upgradeCost,
} from "../game";
import { CardView } from "./CardView";
import { aiBaseRuleText, cardColor, cardTypeLabel, roleText, selectedText } from "./cardPresentation";

export function SelectedCardDetail({ card, zone, game }: { card: Card | null; zone: string | null; game: GameState }) {
  if (!card) {
    return (
      <div className="selected-card">
        <div className="detail-title">選択なし</div>
        <div className="detail-meta">残りアクション {game.actionsRemaining}</div>
      </div>
    );
  }
  const upgradeSourceIndex = zone === "hand" && card.type === "ai" ? bestUpgradeSource(game.players[0], card) : null;
  const upgradeSourceCard = upgradeSourceIndex !== null ? game.players[0].field[upgradeSourceIndex] : null;
  const selectedOwnerIndex = game.selected?.ownerIndex ?? 0;
  const selectedOwner = game.players[selectedOwnerIndex] ?? game.players[0];
  const parts = [
    cardTypeLabel(card),
    card.attribute ? `${card.attribute}属性` : null,
    card.power ? `power ${card.power}` : null,
    `${playCost(card)}アクション`,
    upgradeSourceCard ? `${upgradeSourceCard.name}からアップグレード ${upgradeCost(card, upgradeSourceCard)}アクション` : null,
    zone === "field" && selectedOwner.spentFieldIndexes.has(game.selected?.index ?? -1) ? "消耗中" : null,
  ].filter(Boolean);
  const baseRuleText = card.type === "ai"
    ? aiBaseRuleText(card)
    : roleText(card);
  return (
    <div className="selected-card">
      <div className="detail-title">{card.name}</div>
      <div className="detail-meta">{parts.join(" / ")}</div>
      {baseRuleText && <div className="detail-effect">{baseRuleText}</div>}
      {card.type === "ai" && card.attribute && (
        <div className="detail-affinity">個別効果: {aiEffectText(card)}</div>
      )}
    </div>
  );
}

export function AffinityGuide({ game, selected }: { game: GameState; selected: Card | null }) {
  const attackPreview = selected?.type === "ai" && game.selected?.zone === "field" && (game.selected.ownerIndex ?? 0) === 0
    ? <OpponentDefensePreview game={game} attackCard={selected} />
    : null;
  return (
    <div className="affinity-guide" aria-label="属性特性">
      <div className="affinity-title">召喚獣の個性</div>
      <div className="affinity-chain">
        {attributePill("火")}<span>攻撃</span>{attributePill("水")}<span>ドロー</span>{attributePill("風")}<span>テンポ</span>{attributePill("土")}<span>防御</span>
      </div>
      <div className="affinity-note">属性相性はありません。属性ごとの傾向はありますが、効果は一部の召喚獣だけが個別に持ちます。</div>
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
  const attackContext: AttackContext = { attacker: game.players[0], attackerFieldIndex: game.selected?.index ?? null };
  const rows = opponent.field
    .map((card, index) => ({ card, index }))
    .filter(({ index }) => !opponent.spentFieldIndexes.has(index));
  if (rows.length === 0) return <div className="affinity-preview">相手の未消耗召喚獣なし。攻撃は通りやすいです。</div>;
  return (
    <div className="affinity-preview">
      <div className="affinity-preview-title">相手の場の防御候補</div>
      <div className="affinity-defense-list">
        {rows.map(({ card, index }) => {
          const defenseValue = defenseCombatValue(attackCard, card, opponent, { fieldIndex: index, attackContext });
          const attackValue = attackCombatValue(attackCard, attackContext);
          const result = defenseValue > attackValue
            ? "防御側が残る"
            : defenseValue === attackValue
              ? "相打ち"
              : `差分${attackValue - defenseValue}点`;
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
  onTogglePendingCard,
  onConfirmPending,
  onConfirmCardSelection,
  onConfirmRelicThiefTrash,
  onConfirmFaceAttack,
  onStrikeTarget,
  forcedDefenseChoice,
}: {
  game: GameState;
  onResolve: (choice: DefenseChoice) => void;
  onUseCommand: (sourceIndex: number, targetIndex: number | null) => void;
  onCancelTarget: () => void;
  onTogglePendingHand: (index: number) => void;
  onTogglePendingCard: (index: number) => void;
  onConfirmPending: () => void;
  onConfirmCardSelection: () => void;
  onConfirmRelicThiefTrash: () => void;
  onConfirmFaceAttack: () => void;
  onStrikeTarget: (sourceIndex: number, targetIndex: number) => void;
  forcedDefenseChoice?: DefenseChoice | null;
}) {
  if (game.pendingTarget) {
    if (game.pendingTarget.kind === "confirm") {
      const pending = game.pendingTarget;
      return (
        <div className={`defense-panel pending-${pending.reason}`}>
          <h3>{pending.title}</h3>
          <p className="choice-prompt">{pending.prompt}</p>
          <div className="defense-actions pending-actions">
            <button type="button" onClick={onConfirmRelicThiefTrash}>{pending.confirmLabel}</button>
            {pending.cancelable !== false && <button type="button" onClick={onCancelTarget}>{pending.cancelLabel}</button>}
          </div>
        </div>
      );
    }
    if (game.pendingTarget.kind === "hand-discard") {
      const pending = game.pendingTarget;
      const player = game.players[pending.playerIndex];
      const excluded = new Set(pending.excludeIndexes);
      const selected = new Set(pending.selectedIndexes);
      return (
        <div className={`defense-panel pending-${pending.reason}`}>
          <h3>{pending.title}</h3>
          <p className="choice-prompt">{pending.prompt}</p>
          <div className="pending-card-grid">
            {player.hand.map((card, index) => excluded.has(index) ? null : (
              <PendingCardChoice
                key={`${card.id}-${index}`}
                card={card}
                ownerIndex={pending.playerIndex}
                zone="hand"
                index={index}
                selected={selected.has(index)}
                onClick={() => onTogglePendingHand(index)}
              />
            ))}
          </div>
          <div className="defense-actions pending-actions">
            <button type="button" disabled={pending.selectedIndexes.length < pending.min} onClick={onConfirmPending}>
              {pending.reason === "optimize"
                ? "トラッシュへ送って山札からカードを2枚引く"
                : pending.reason === "firewall"
                  ? pending.selectedIndexes.length > 0 ? "このカードで強化" : "竜盾の紋章を使わず防御"
                  : "このカードを送る"}
            </button>
            {pending.cancelable !== false && <button type="button" onClick={onCancelTarget}>キャンセル</button>}
          </div>
        </div>
      );
    }
    if (game.pendingTarget.kind === "card-select") {
      const pending = game.pendingTarget;
      const player = game.players[pending.playerIndex];
      const cards = pending.zone === "hand" ? player.hand : pending.zone === "field" ? player.field : player.discard;
      const excluded = new Set(pending.excludeIndexes);
      const selected = new Set(pending.selectedIndexes);
      return (
        <div className={`defense-panel pending-${pending.reason}`}>
          <h3>{pending.title}</h3>
          <p className="choice-prompt">{pending.prompt}</p>
          <div className="pending-card-grid">
            {cards.map((card, index) => excluded.has(index) ? null : (
              <PendingCardChoice
                key={`${pending.zone}-${card.id}-${index}`}
                card={card}
                ownerIndex={pending.playerIndex}
                zone={pending.zone}
                index={index}
                selected={selected.has(index)}
                spent={pending.zone === "field" && player.spentFieldIndexes.has(index)}
                onClick={() => onTogglePendingCard(index)}
              />
            ))}
          </div>
          <div className="defense-actions pending-actions">
            <button type="button" disabled={pending.selectedIndexes.length < pending.min} onClick={onConfirmCardSelection}>
              {pending.confirmLabel}
            </button>
            {pending.cancelable !== false && <button type="button" onClick={onCancelTarget}>キャンセル</button>}
          </div>
        </div>
      );
    }
    if (game.pendingTarget.kind === "strike") {
      const pending = game.pendingTarget;
      const attacker = activePlayer(game);
      const opponent = opponentPlayer(game);
      const attackCard = attacker.field[pending.sourceIndex];
      if (!attackCard) return null;
      const attackContext: AttackContext = { attacker, attackerFieldIndex: pending.sourceIndex };
      const attackValue = attackCombatValue(attackCard, attackContext);
      const targets = strikeTargets(attackCard, opponent, attackContext);
      return (
        <div className="defense-panel pending-strike" role="dialog" aria-modal="true" aria-labelledby="strike-target-title">
          <h3 id="strike-target-title">{attackCard.name}の攻撃対象を選択</h3>
          <p className="choice-prompt">相手プレイヤーへ攻撃するか、討伐できる相手召喚獣を選んでください。</p>
          <div className="defense-context">攻撃値 {attackValue} / プレイヤーへ通れば {attackDamage(attackCard)} ダメージ。召喚獣攻撃は同値なら相打ち、上回れば対象を討伐します。</div>
          <div className="pending-card-grid strike-target-grid">
            {targets.map(({ card, index, attackValue, defenseValue, trade }) => (
              <PendingCardChoice
                key={`${card.id}-${index}`}
                card={card}
                ownerIndex={1 - game.active}
                zone="field"
                index={index}
                spent={opponent.spentFieldIndexes.has(index)}
                resultText={`攻撃値 ${attackValue} vs 防御値 ${defenseValue} / ${trade ? "相打ち" : "討伐"}`}
                onClick={() => onStrikeTarget(pending.sourceIndex, index)}
              />
            ))}
          </div>
          <div className="defense-actions pending-actions">
            <button type="button" onClick={onConfirmFaceAttack}>相手プレイヤーに攻撃</button>
            <button type="button" onClick={onCancelTarget}>キャンセル</button>
          </div>
        </div>
      );
    }
    const pendingTarget = game.pendingTarget;
    const player = activePlayer(game);
    const opponent = opponentPlayer(game);
    const command = player.hand[pendingTarget.sourceIndex];
    if (!command) return null;
    // purge は消耗中の召喚獣、disrupt は未消耗の召喚獣が対象
    const isPurge = pendingTarget.kind === "purge";
    return (
      <div className="defense-panel">
        <h3>{command.name}の対象を選択</h3>
        <p className="choice-prompt">{isPurge ? "トラッシュへ送る相手の消耗中召喚獣を選んでください。" : "消耗させる相手の未消耗召喚獣を選んでください。"}</p>
        <div className="pending-card-grid">
          {opponent.field.map((card, index) => (isPurge ? !opponent.spentFieldIndexes.has(index) : opponent.spentFieldIndexes.has(index)) ? null : (
            <PendingCardChoice
              key={`${card.id}-${index}`}
              card={card}
              ownerIndex={1 - game.active}
              zone="field"
              index={index}
              spent={opponent.spentFieldIndexes.has(index)}
              onClick={() => onUseCommand(pendingTarget.sourceIndex, index)}
            />
          ))}
        </div>
        <div className="defense-actions pending-actions">
          <button type="button" onClick={onCancelTarget}>キャンセル</button>
        </div>
      </div>
    );
  }

  const pending = game.pendingAttack;
  if (!pending || !game.players[pending.defenderIndex].isHuman) return null;
  return <AttackDefensePanel game={game} forcedDefenseChoice={forcedDefenseChoice} onResolve={onResolve} />;
}

function AttackDefensePanel({ game, forcedDefenseChoice, onResolve }: { game: GameState; forcedDefenseChoice?: DefenseChoice | null; onResolve: (choice: DefenseChoice) => void }) {
  const pending = game.pendingAttack!;
  const attackCard = game.players[pending.attackerIndex].field[pending.fieldIndex];
  const attacker = game.players[pending.attackerIndex];
  const defender = game.players[pending.defenderIndex];
  const attackContext: AttackContext = { attacker, attackerFieldIndex: pending.fieldIndex };
  const strikeTarget = pending.strikeTargetIndex !== undefined ? defender.field[pending.strikeTargetIndex] : null;
  const strikeInfo = pending.strikeTargetIndex !== undefined && strikeTarget
    ? strikeValues(attackCard, defender, pending.strikeTargetIndex, attackContext)
    : null;
  const fieldOptions = pending.strikeTargetIndex !== undefined
    ? legalStrikeFieldDefenders(defender, attackCard, pending.strikeTargetIndex, attackContext)
    : legalFieldDefenders(defender, attackCard, attackContext);
  const handOptions = legalHandDefenders(defender, attackCard, attackContext);
  const unavailableHighPowerHandOptions = CONFIG.handDefenseMaxPower === null || CONFIG.setDefenseEnabled
    ? []
    : defender.hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.type === "ai" && (card.power ?? 0) > CONFIG.handDefenseMaxPower!);
  const forcedFieldOptions = forcedDefenseChoice?.type === "field"
    ? fieldOptions.filter(({ index }) => index === forcedDefenseChoice.index)
    : [];
  const forcedHandOptions = forcedDefenseChoice?.type === "hand"
    ? handOptions.filter(({ index }) => index === forcedDefenseChoice.index)
    : [];
  const effectiveForcedDefenseChoice = forcedDefenseChoice && (forcedDefenseChoice.type === "none" || forcedFieldOptions.length > 0 || forcedHandOptions.length > 0) ? forcedDefenseChoice : null;
  const forcedNoDefense = effectiveForcedDefenseChoice?.type === "none";
  const visibleFieldOptions = forcedNoDefense ? [] : effectiveForcedDefenseChoice?.type === "field" ? forcedFieldOptions : fieldOptions;
  const visibleHandOptions = forcedNoDefense ? [] : effectiveForcedDefenseChoice?.type === "hand" ? forcedHandOptions : handOptions;
  const visibleUnavailableHandOptions = forcedNoDefense || effectiveForcedDefenseChoice
    ? []
    : unavailableHighPowerHandOptions;
  const hasVisibleOptions = visibleFieldOptions.length > 0 || visibleHandOptions.length > 0;
  const attackValue = attackCombatValue(attackCard, attackContext);
  const firewallOptions = visibleFieldOptions.filter(({ card, index }) => {
    if (!canUseFirewall(defender, card, attackCard)) return false;
    const baseValue = defenseCombatValue(attackCard, card, defender, { fieldDefense: true, fieldIndex: index, attackContext });
    const paidValue = defenseCombatValue(attackCard, card, defender, { fieldDefense: true, fieldIndex: index, attackContext, firewallPaid: true });
    return paidValue > baseValue;
  });
  const defaultFirewallEnabled = firewallOptions.some(({ card, index }) => {
    const baseValue = defenseCombatValue(attackCard, card, defender, { fieldDefense: true, fieldIndex: index, attackContext });
    const paidValue = defenseCombatValue(attackCard, card, defender, { fieldDefense: true, fieldIndex: index, attackContext, firewallPaid: true });
    return baseValue < attackValue && paidValue >= attackValue;
  });
  const [firewallEnabled, setFirewallEnabled] = React.useState(defaultFirewallEnabled);
  React.useEffect(() => {
    setFirewallEnabled(defaultFirewallEnabled);
  }, [defaultFirewallEnabled, pending.attackerIndex, pending.defenderIndex, pending.fieldIndex, pending.strikeTargetIndex]);
  return (
    <div className="defense-panel">
      <h3>{strikeTarget ? `${attackCard.name}のモンスター攻撃への防御を選択` : `${attackCard.name}への防御を選択`}</h3>
      <div className="defense-context">
        {strikeTarget && strikeInfo
          ? `攻撃値 ${strikeInfo.attackValue} vs ${strikeTarget.name} 防御値 ${strikeInfo.defenseValue}。防御しなければ${strikeInfo.attackValue === strikeInfo.defenseValue ? "相打ちで両方トラッシュ" : `${strikeTarget.name}は退場`}。場の別召喚獣でかばうか、power ${CONFIG.handDefenseMaxPower} 以下の手札ブロックで止めれば${strikeTarget.name}は場に残ります。`
          : `攻撃値 ${attackCombatValue(attackCard, attackContext)} / 防御しなければ ${attackDamage(attackCard)} ダメージ(power分)。場防御は不足でも選べます。不足なら防御召喚獣をトラッシュし、攻撃値との差分ダメージを受けます。手札ブロックは power ${CONFIG.handDefenseMaxPower} 以下・使い切りです。`}
      </div>
      {firewallOptions.length > 0 && (
        <div className="firewall-toggle-panel" role="group" aria-label="竜盾の紋章を使うか">
          <span>竜盾の紋章</span>
          <div className="firewall-toggle-buttons">
            <button type="button" className={!firewallEnabled ? "active" : ""} aria-pressed={!firewallEnabled} onClick={() => setFirewallEnabled(false)}>使用しない</button>
            <button type="button" className={firewallEnabled ? "active" : ""} aria-pressed={firewallEnabled} onClick={() => setFirewallEnabled(true)}>使用する</button>
          </div>
        </div>
      )}
      <div className="defense-choice-grid">
        {visibleFieldOptions.map(({ card, index }) => <DefenseChoiceButton key={`field-${index}`} source="場" card={card} cardIndex={index} attackCard={attackCard} attackContext={attackContext} defender={defender} fieldIndex={index} strikeGuard={Boolean(strikeTarget)} firewallEnabled={firewallEnabled} onResolve={onResolve} />)}
        {visibleHandOptions.map(({ card, index }) => <DefenseChoiceButton key={`hand-${index}`} source="手札" card={card} cardIndex={index} attackCard={attackCard} attackContext={attackContext} defender={defender} hand firewallEnabled={false} onResolve={onResolve} />)}
        {visibleUnavailableHandOptions.map(({ card, index }) => <UnavailableHandDefenseCard key={`hand-unavailable-${index}`} card={card} cardIndex={index} />)}
        {!hasVisibleOptions && !forcedNoDefense && <div className="defense-context">使用できる防御カードはありません。</div>}
        {(!effectiveForcedDefenseChoice || forcedNoDefense) && <button type="button" className="defense-pass" onClick={() => onResolve({ type: "none" })}>防御しない</button>}
      </div>
    </div>
  );
}

function UnavailableHandDefenseCard({ card, cardIndex }: { card: Card; cardIndex: number }) {
  return (
    <div
      className="defense-choice defense-choice-disabled"
      style={{ "--card-color": cardColor(card) } as React.CSSProperties}
      aria-disabled="true"
      title={`手札防御は power ${CONFIG.handDefenseMaxPower} 以下のみ使用できます`}
    >
      <div className="defense-choice-select">
        <div className="defense-choice-card">
          <span className="defense-source">手札</span>
          <CardView card={card} ownerIndex={0} zone="hand" index={cardIndex} showCost={false} showSetBadge={false} />
        </div>
        <div className="defense-choice-info">
          <div className="defense-choice-name">{card.name}</div>
          <div className="defense-choice-body">
            <span>{card.attribute} / power {card.power}</span>
            <span className="defense-choice-result">使用不可 / 手札防御は power {CONFIG.handDefenseMaxPower} 以下</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingCardChoice({
  card,
  ownerIndex,
  zone,
  index,
  selected = false,
  spent = false,
  resultText,
  onClick,
}: {
  card: Card;
  ownerIndex: number;
  zone: "hand" | "field" | "discard";
  index: number;
  selected?: boolean;
  spent?: boolean;
  resultText?: string;
  onClick: () => void;
}) {
  const meta = [
    cardTypeLabel(card),
    card.attribute ? `${card.attribute} / power ${card.power}` : null,
    `${playCost(card)}アクション`,
  ].filter(Boolean);

  return (
    <button
      type="button"
      className={`pending-card-choice ${selected ? "selected" : ""}`}
      style={{ "--card-color": cardColor(card) } as React.CSSProperties}
      onClick={onClick}
    >
      <CardView
        card={card}
        ownerIndex={ownerIndex}
        zone={zone}
        index={index}
        selected={selected}
        spent={spent}
        showCost={false}
        showSetBadge={false}
      />
      <span className="pending-card-copy">
        <span className="pending-card-title">{card.name}</span>
        <span className="pending-card-meta">{meta.join(" / ")}</span>
        {resultText && <span className="pending-card-meta">{resultText}</span>}
        <span className="pending-card-effect">{selectedText(card)}</span>
      </span>
    </button>
  );
}

function DefenseChoiceButton({ source, card, cardIndex, attackCard, attackContext, defender, hand = false, fieldIndex, strikeGuard = false, firewallEnabled, onResolve }: { source: string; card: Card; cardIndex: number; attackCard: Card; attackContext: AttackContext; defender: PlayerState; hand?: boolean; fieldIndex?: number; strikeGuard?: boolean; firewallEnabled: boolean; onResolve: (choice: DefenseChoice) => void }) {
  const defenseOptions = { fieldDefense: !hand, fieldIndex, attackContext };
  const baseDefenseValue = defenseCombatValue(attackCard, card, defender, defenseOptions);
  const paidDefenseValue = canUseFirewall(defender, card, attackCard)
    ? defenseCombatValue(attackCard, card, defender, { firewallPaid: true, ...defenseOptions })
    : baseDefenseValue;
  const attackValue = attackCombatValue(attackCard, attackContext);
  const firewallAvailable = !hand && paidDefenseValue > baseDefenseValue;
  const defenseValue = firewallAvailable && firewallEnabled ? paidDefenseValue : baseDefenseValue;
  const traitBonus = !hand && (
    card.effect === "defense_plus_1"
    || card.effect === "defense_plus_1_enters_spent"
    || card.effect === "recover_memory_on_play_defense_plus_1"
    || (card.effect === "defense_plus_1_with_memory" && defender.memory)
  ) ? 1 : 0;
  const result = hand
    ? "防御成功 / このカードをトラッシュ"
    : firewallAvailable && firewallEnabled && baseDefenseValue < attackValue && paidDefenseValue >= attackValue
      ? `竜盾の紋章使用で${paidDefenseValue === attackValue ? "相打ち" : "防御成功"}`
    : defenseValue < attackValue
      ? strikeGuard ? "防御失敗 / 対象は守る" : `防御失敗 / 差分${Math.max(0, attackValue - defenseValue)}点`
      : defenseValue === attackValue
      ? "相打ち / 両方トラッシュ"
      : "防御側が残る / 攻撃側退場";
  const firewallText = firewallAvailable ? ` / 竜盾の紋章使用時 ${paidDefenseValue}` : "";
  const visibleDefenseBonus = hand ? 0 : defensePowerBonus(card, defender, attackCard, defenseOptions);
  const extraBadges = visibleDefenseBonus > 0 ? [`場防御+${visibleDefenseBonus}`] : [];
  const resolveChoice = () => {
    if (hand) {
      onResolve({ type: "hand", index: cardIndex });
      return;
    }
    if (firewallAvailable && !firewallEnabled) {
      onResolve({ type: "field", index: cardIndex, firewallDiscardIndex: null });
      return;
    }
    onResolve({ type: "field", index: cardIndex });
  };
  return (
    <div className="defense-choice" style={{ "--card-color": cardColor(card) } as React.CSSProperties} title={`${source}: ${card.name} / ${defenseMathText(attackCard, card, defender, { ...defenseOptions, firewallPaid: firewallEnabled })}`}>
      <button type="button" className="defense-choice-select" onClick={resolveChoice}>
        <div className="defense-choice-card">
          <span className="defense-source">{source}</span>
          <CardView card={card} ownerIndex={0} zone={hand ? "hand" : "field"} index={cardIndex} showCost={false} showSetBadge={false} extraBadges={extraBadges} />
        </div>
        <div className="defense-choice-info">
          <div className="defense-choice-name">{card.name}</div>
          <div className="defense-choice-body">
            <span>{card.attribute} / power {card.power}</span>
            <span>防御値 {baseDefenseValue} = {card.power} + {defensePowerBonus(card, defender, attackCard, defenseOptions) - traitBonus} + {traitBonus}{firewallText}</span>
            <span className="defense-choice-result">{result}</span>
          </div>
        </div>
      </button>
    </div>
  );
}

export function LogList({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length]);
  return (
    <ol className="log" ref={ref}>
      {entries.map((entry, index) => {
        const event = logEventMeta(entry);
        return (
          <li key={`${index}-${entry}`} className={`${index === entries.length - 1 ? "log-latest" : ""} log-event-${event.kind}`}>
            <span className="log-event-icon" aria-hidden="true">{event.icon}</span>
            <span className="log-event-text">{entry}</span>
          </li>
        );
      })}
    </ol>
  );
}

function logEventMeta(entry: string): { kind: string; icon: string } {
  if (entry.includes("攻撃")) return { kind: "attack", icon: "ATK" };
  if (entry.includes("防御") || entry.includes("相打ち")) return { kind: "block", icon: "DEF" };
  if (entry.includes("ダメージ") || entry.includes("ライフ")) return { kind: "damage", icon: "DMG" };
  if (entry.includes("術式") || entry.includes("術") || entry.includes("発動")) return { kind: "command", icon: "CMD" };
  if (entry.includes("トラッシュ") || entry.includes("捨て")) return { kind: "trash", icon: "TRS" };
  if (entry.includes("ターン") || entry.includes("手番")) return { kind: "turn", icon: "TRN" };
  if (entry.includes("勝利") || entry.includes("敗北") || entry.includes("引き分け")) return { kind: "result", icon: "END" };
  return { kind: "system", icon: "LOG" };
}

export function actionHintText(game: GameState, card: Card | null, zone: string | null): string {
  if (canHumanEndTurn(game) && game.actionsRemaining <= 0 && !canUseCharge(game, game.players[0])) return "できることが無くなりました。ターン終了してください。";
  if (!card) return canHumanAct(game) ? "手札と場の明るい枠が、いま使える候補です。" : "ライバルの行動中です。";
  if (!canHumanAct(game) && !(zone === "hand" && canUseCharge(game, game.players[0]))) return selectedText(card);
  const human = game.players[0];
  const opponent = game.players[1];
  if (zone === "hand") {
    if (card.type === "event") {
      return commandUsable(game, card, human, opponent)
        ? `${card.name}を発動できます。`
        : `${card.name}はまだ発動できません。${commandBlockedReason(game, card, human, opponent)}`;
    }
    if (card.type === "memory") return human.memory ? "配置すると現在の遺物はトラッシュされます。" : "遺物枠に配置できます。";
    if (canUseCharge(game, human) && canChargeCard(card)) return "チャージで手札からトラッシュし、このターンのアクションを1増やせます。このターンは攻撃できません。";
    const sourceIndex = bestUpgradeSource(human, card);
    const source = sourceIndex === null ? null : human.field[sourceIndex];
    if (source && upgradeCost(card, source) <= game.actionsRemaining) return `${source.name}を元に${upgradeCost(card, source)}アクションでアップグレードできます。`;
    if (human.field.length < 3 && playCost(card, game) <= game.actionsRemaining) return "場に出せます。";
    if (human.field.length >= 3) return "場が埋まっています。アップグレード元があれば入れ替えられます。";
    return "残りアクションが足りません。";
  }
  if (zone === "field") {
    if ((game.selected?.ownerIndex ?? 0) !== 0) return selectedText(card);
    if (!canActivePlayerAttack(game)) return human.chargeUsed ? "チャージしたターンは攻撃できません。" : "先攻初ターンは攻撃できません。";
    if (human.spentFieldIndexes.has(game.selected?.index ?? -1)) return "消耗中のため行動できません。";
    const defense = chooseAiDefense(opponent, card);
    return defense.type === "none" ? "攻撃するとダメージが通る見込みです。" : "攻撃すると防御される可能性があります。";
  }
  if (zone === "memory") {
    if ((game.selected?.ownerIndex ?? 0) !== 0) return selectedText(card);
    if (card.effect === "accelerator") {
      return canUseAcceleratorMemory(game, human)
        ? "場の召喚獣1体をトラッシュしてもよい。その場合、残りアクションを1増やせます。"
        : "このターン使用済み、場に召喚獣がない、または残りアクションが上限です。";
    }
  }
  return selectedText(card);
}

function attributePill(attribute: Attribute) {
  return <span className="attribute-pill" style={{ "--pill-color": ATTRIBUTES[attribute].color } as React.CSSProperties}>{attribute}</span>;
}
