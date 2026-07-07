import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  cardPool,
  CONFIG,
  isCardActive,
  type Card,
  type CardType,
  type GameState,
  type PlayerState,
} from "../game";
import {
  devAddCard,
  devCardLabel,
  devRemoveCard,
  devResetTurnFlags,
  devSetMatchResult,
  devToggleFieldSpent,
  devTriggerRivalAttack,
  type DevCardZone,
  type DevRemovableZone,
  type DevResultTone,
} from "../game/devTools";

// 開発ビルド限定の盤面編集パネル。App 側で import.meta.env.DEV のときだけマウントされる。

type DevPanelProps = {
  game: GameState;
  busy: boolean;
  onMutate: (mutator: (draft: GameState) => void) => void;
};

const TYPE_LABELS: Record<CardType, string> = {
  ai: "AI（召喚獣）",
  event: "コマンド",
  memory: "メモリー",
};

const RESULT_TONES: { tone: DevResultTone; label: string }[] = [
  { tone: "win", label: "勝利" },
  { tone: "lose", label: "敗北" },
  { tone: "draw", label: "引き分け" },
];

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function DevPanel({ game, busy, onMutate }: DevPanelProps) {
  const [open, setOpen] = useState(false);
  const [ownerIndex, setOwnerIndex] = useState(0);
  const cardsByType = useMemo(() => {
    const groups = new Map<CardType, Card[]>([["ai", []], ["event", []], ["memory", []]]);
    for (const card of cardPool()) groups.get(card.type)?.push(card);
    return groups;
  }, []);
  const [selectedCardId, setSelectedCardId] = useState(() => cardsByType.get("ai")?.[0]?.id ?? "");

  // .stitch-shell 直下は高詳細度の position: relative 指定を受けるため、
  // body 直下へポータルして fixed 配置を成立させる
  if (!open) {
    return createPortal(
      <button type="button" className="dev-panel-toggle" onClick={() => setOpen(true)}>
        DEV
      </button>,
      document.body,
    );
  }

  const player = game.players[ownerIndex];
  const rival = game.players[1];
  const selectedCard = cardPool().find((card) => card.id === selectedCardId) ?? null;
  const resolved = game.winner !== null || game.draw;

  const addCard = (zone: DevCardZone) => {
    onMutate((draft) => { devAddCard(draft, ownerIndex, zone, selectedCardId); });
  };
  const removeCard = (zone: DevRemovableZone, index: number) => {
    onMutate((draft) => { devRemoveCard(draft, ownerIndex, zone, index); });
  };
  const addDisabled = (zone: DevCardZone): boolean => {
    if (busy || !selectedCard) return true;
    if (zone === "field") return selectedCard.type !== "ai" || player.field.length >= CONFIG.fieldLimit;
    if (zone === "memory") return selectedCard.type !== "memory";
    return false;
  };

  const renderCardRows = (cards: Card[], zone: DevRemovableZone, options: { spentToggle?: boolean; reversed?: boolean } = {}) => {
    const entries = cards.map((card, index) => ({ card, index }));
    if (options.reversed) entries.reverse();
    if (entries.length === 0) return <p className="dev-panel-empty">（なし）</p>;
    return (
      <ul className="dev-panel-cards">
        {entries.map(({ card, index }) => (
          <li key={`${zone}-${index}-${card.id}`}>
            <span>{devCardLabel(card)}</span>
            {options.spentToggle && (
              <button
                type="button"
                disabled={busy}
                title="行動済み/未行動を切り替え"
                onClick={() => onMutate((draft) => { devToggleFieldSpent(draft.players[ownerIndex], index); })}
              >
                {player.spentFieldIndexes.has(index) ? "済" : "可"}
              </button>
            )}
            <button type="button" disabled={busy} title="取り除く" onClick={() => removeCard(zone, index)}>×</button>
          </li>
        ))}
      </ul>
    );
  };

  return createPortal(
    <aside className="dev-panel" aria-label="開発用パネル">
      <header className="dev-panel-header">
        <strong>DEV 盤面エディタ</strong>
        <button type="button" onClick={() => setOpen(false)}>閉じる</button>
      </header>

      <section>
        <h3>ゲーム全体</h3>
        <div className="dev-panel-grid">
          <label>
            ターン
            <input
              type="number"
              min={1}
              max={CONFIG.maxTurns}
              value={game.turn}
              disabled={busy}
              onChange={(event) => {
                const value = clampInt(event.target.value, 1, CONFIG.maxTurns, game.turn);
                onMutate((draft) => { draft.turn = value; });
              }}
            />
          </label>
          <label>
            残りアクション
            <input
              type="number"
              min={0}
              max={9}
              value={game.actionsRemaining}
              disabled={busy}
              onChange={(event) => {
                const value = clampInt(event.target.value, 0, 9, game.actionsRemaining);
                onMutate((draft) => { draft.actionsRemaining = value; });
              }}
            />
          </label>
          <label>
            チャージ
            <input
              type="number"
              min={0}
              max={9}
              value={game.chargedActionsRemaining}
              disabled={busy}
              onChange={(event) => {
                const value = clampInt(event.target.value, 0, 9, game.chargedActionsRemaining);
                onMutate((draft) => { draft.chargedActionsRemaining = value; });
              }}
            />
          </label>
          <label>
            手番
            <select
              value={game.active}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value === "1" ? 1 : 0;
                onMutate((draft) => { draft.active = value; });
              }}
            >
              <option value={0}>あなた</option>
              <option value={1}>ライバル</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <h3>状況トリガー</h3>
        <p className="dev-panel-note">ライバルの場の召喚獣で即時攻撃（防御選択UIが開きます）</p>
        <div className="dev-panel-actions">
          {rival.field.length === 0 && <p className="dev-panel-empty">（ライバルの場が空です）</p>}
          {rival.field.map((card, index) => (
            <button
              key={`attack-${index}-${card.id}`}
              type="button"
              disabled={busy || resolved || Boolean(game.pendingAttack)}
              onClick={() => onMutate((draft) => { devTriggerRivalAttack(draft, index); })}
            >
              {devCardLabel(card)}で攻撃
            </button>
          ))}
        </div>
        <p className="dev-panel-note">決着演出</p>
        <div className="dev-panel-actions">
          {RESULT_TONES.map(({ tone, label }) => (
            <button
              key={tone}
              type="button"
              disabled={busy}
              onClick={() => onMutate((draft) => { devSetMatchResult(draft, tone); })}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || !resolved}
            onClick={() => onMutate((draft) => { devSetMatchResult(draft, null); })}
          >
            解除
          </button>
        </div>
      </section>

      <section>
        <h3>プレイヤー編集</h3>
        <div className="dev-panel-tabs">
          {game.players.map((target: PlayerState, index: number) => (
            <button
              key={target.name}
              type="button"
              className={ownerIndex === index ? "active" : ""}
              onClick={() => setOwnerIndex(index)}
            >
              {target.name}
            </button>
          ))}
        </div>

        <div className="dev-panel-grid">
          <label>
            ライフ
            <input
              type="number"
              min={0}
              max={99}
              value={player.life}
              disabled={busy}
              onChange={(event) => {
                const value = clampInt(event.target.value, 0, 99, player.life);
                onMutate((draft) => { draft.players[ownerIndex].life = value; });
              }}
            />
          </label>
          <button
            type="button"
            className="dev-panel-flag-reset"
            disabled={busy}
            title="召喚済み・チャージ済み・手札防御回数などのターン内フラグをリセット"
            onClick={() => onMutate((draft) => { devResetTurnFlags(draft.players[ownerIndex]); })}
          >
            ターン内フラグをリセット
          </button>
        </div>

        <p className="dev-panel-note">カード追加</p>
        <select
          className="dev-panel-card-select"
          value={selectedCardId}
          disabled={busy}
          onChange={(event) => setSelectedCardId(event.target.value)}
        >
          {(["ai", "event", "memory"] as CardType[]).map((type) => (
            <optgroup key={type} label={TYPE_LABELS[type]}>
              {(cardsByType.get(type) ?? []).map((card) => (
                <option key={card.id} value={card.id}>
                  {devCardLabel(card)}{isCardActive(card) ? "" : "（無効）"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="dev-panel-actions">
          <button type="button" disabled={addDisabled("hand")} onClick={() => addCard("hand")}>手札へ</button>
          <button type="button" disabled={addDisabled("field")} onClick={() => addCard("field")}>場へ</button>
          <button type="button" disabled={addDisabled("memory")} onClick={() => addCard("memory")}>メモリーへ</button>
          <button type="button" disabled={addDisabled("deckTop")} onClick={() => addCard("deckTop")}>山札の上へ</button>
          <button type="button" disabled={addDisabled("deckBottom")} onClick={() => addCard("deckBottom")}>山札の下へ</button>
          <button type="button" disabled={addDisabled("discard")} onClick={() => addCard("discard")}>トラッシュへ</button>
        </div>

        <p className="dev-panel-note">手札（{player.hand.length}枚）</p>
        {renderCardRows(player.hand, "hand")}

        <p className="dev-panel-note">場（{player.field.length}/{CONFIG.fieldLimit}体・「済」=行動済み）</p>
        {renderCardRows(player.field, "field", { spentToggle: true })}

        <p className="dev-panel-note">メモリー</p>
        {renderCardRows(player.memory ? [player.memory] : [], "memory")}

        <details>
          <summary>山札（{player.deck.length}枚・上から順）</summary>
          {renderCardRows(player.deck, "deck", { reversed: true })}
        </details>

        <details>
          <summary>トラッシュ（{player.discard.length}枚）</summary>
          {renderCardRows(player.discard, "discard")}
        </details>
      </section>
    </aside>,
    document.body,
  );
}
