import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  ATTRIBUTES,
  CARD_BY_ID,
  DECKS,
  type Attribute,
  type Card,
  type CardType,
  cardPool,
} from "../game";
import { CardArtPreview, CardView } from "./CardView";
import { cardColor, roleText, selectedText } from "./cardPresentation";

const DECK_SIZE = 20;
const SAME_NAME_LIMIT = 2;
export const SAVED_DECKS_STORAGE_KEY = "break-duel:saved-decks";

type TypeFilter = CardType | "all";
type AttributeFilter = Attribute | "all";

export type SavedDeck = {
  version: 1;
  id: string;
  name: string;
  cardIds: string[];
  updatedAt: string;
};

function allCards(): Card[] {
  return cardPool().sort((a, b) => {
    const typeOrder = typeRank(a.type) - typeRank(b.type);
    if (typeOrder !== 0) return typeOrder;
    const attrOrder = attributeRank(a.attribute) - attributeRank(b.attribute);
    if (attrOrder !== 0) return attrOrder;
    return (a.power ?? 0) - (b.power ?? 0) || a.id.localeCompare(b.id);
  });
}

const CARD_LIST = allCards();

export function CardLibraryPage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [attributeFilter, setAttributeFilter] = useState<AttributeFilter>("all");
  const [selectedId, setSelectedId] = useState(CARD_LIST[0]?.id ?? "");
  const selectedCard = CARD_BY_ID.get(selectedId) ?? CARD_LIST[0] ?? null;
  const visibleCards = CARD_LIST.filter((card) => {
    if (typeFilter !== "all" && card.type !== typeFilter) return false;
    if (attributeFilter !== "all" && card.attribute !== attributeFilter) return false;
    return true;
  });

  return (
    <section className="workshop-page" aria-label="カード一覧">
      <div className="workshop-heading">
        <div>
          <h2>カード一覧</h2>
          <p>{CARD_LIST.length}種類 / 召喚獣32種 / 指令6種 / 遺物4種</p>
        </div>
        <div className="workshop-filters">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
            <option value="all">すべて</option>
            <option value="ai">召喚獣</option>
            <option value="event">指令</option>
            <option value="memory">遺物</option>
          </select>
          <select value={attributeFilter} onChange={(event) => setAttributeFilter(event.target.value as AttributeFilter)}>
            <option value="all">全属性</option>
            {Object.keys(ATTRIBUTES).map((attribute) => (
              <option value={attribute} key={attribute}>{attribute}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="library-layout">
        <div className="library-grid">
          {visibleCards.map((card, index) => (
            <button
              type="button"
              className={`library-card-button ${selectedCard?.id === card.id ? "selected" : ""}`}
              key={card.id}
              onClick={() => setSelectedId(card.id)}
            >
              <CardView card={card} ownerIndex={2} zone="hand" index={index} showCost />
            </button>
          ))}
        </div>
        <CardInspector card={selectedCard} />
      </div>
    </section>
  );
}

export function DeckBuilderPage() {
  const [deckName, setDeckName] = useState("新しいデッキ");
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(CARD_LIST[0]?.id ?? "");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [attributeFilter, setAttributeFilter] = useState<AttributeFilter>("all");
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadSavedDecks());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    persistSavedDecks(savedDecks);
  }, [savedDecks]);

  const counts = useMemo(() => countCards(cardIds), [cardIds]);
  const selectedCard = CARD_BY_ID.get(selectedId) ?? CARD_LIST[0] ?? null;
  const validation = validateDeck(cardIds);
  const visibleCards = CARD_LIST.filter((card) => {
    if (typeFilter !== "all" && card.type !== typeFilter) return false;
    if (attributeFilter !== "all" && card.attribute !== attributeFilter) return false;
    return true;
  });
  const deckCards = cardIds.map((cardId) => CARD_BY_ID.get(cardId)).filter((card): card is Card => Boolean(card));

  function addCard(cardId: string) {
    if (cardIds.length >= DECK_SIZE) return;
    if ((counts.get(cardId) ?? 0) >= SAME_NAME_LIMIT) return;
    setCardIds((current) => [...current, cardId]);
    setSelectedId(cardId);
    setNotice("");
  }

  function removeCard(index: number) {
    setCardIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setNotice("");
  }

  function loadPreset(deckId: keyof typeof DECKS) {
    setDeckName(DECKS[deckId].name);
    setCardIds([...DECKS[deckId].cards]);
    setNotice(`${DECKS[deckId].name}を読み込みました`);
  }

  function clearDeck() {
    setCardIds([]);
    setNotice("編集中デッキを空にしました");
  }

  function saveDeck() {
    if (!validation.valid) {
      setNotice(validation.messages[0] ?? "保存条件を満たしていません");
      return;
    }
    const trimmedName = deckName.trim() || "無名デッキ";
    const existing = savedDecks.find((deck) => deck.name === trimmedName);
    const next: SavedDeck = {
      version: 1,
      id: existing?.id ?? `deck-${Date.now()}`,
      name: trimmedName,
      cardIds,
      updatedAt: new Date().toISOString(),
    };
    setSavedDecks((current) => [next, ...current.filter((deck) => deck.id !== next.id)]);
    setNotice(`${trimmedName}を保存しました`);
  }

  function loadDeck(deck: SavedDeck) {
    setDeckName(deck.name);
    setCardIds([...deck.cardIds]);
    setNotice(`${deck.name}を読み込みました`);
  }

  function deleteDeck(deckId: string) {
    const target = savedDecks.find((deck) => deck.id === deckId);
    setSavedDecks((current) => current.filter((deck) => deck.id !== deckId));
    setNotice(`${target?.name ?? "デッキ"}を削除しました`);
  }

  function exportDeck() {
    const payload: SavedDeck = {
      version: 1,
      id: `deck-${Date.now()}`,
      name: deckName.trim() || "無名デッキ",
      cardIds,
      updatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(payload.name)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`${payload.name}を書き出しました`);
  }

  function importDeck(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const deck = normalizeImportedDeck(parsed);
        setDeckName(deck.name);
        setCardIds(deck.cardIds);
        setNotice(`${deck.name}をインポートしました`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "JSONを読み込めませんでした");
      }
    };
    reader.readAsText(file);
  }

  return (
    <section className="workshop-page builder-page" aria-label="デッキ制作">
      <div className="workshop-heading">
        <div>
          <h2>デッキ制作</h2>
          <p>20枚 / 同名2枚まで / JSON保存</p>
        </div>
        <div className="workshop-actions">
          {(Object.keys(DECKS) as (keyof typeof DECKS)[]).map((deckId) => (
            <button type="button" key={deckId} onClick={() => loadPreset(deckId)}>{DECKS[deckId].name}</button>
          ))}
          <button type="button" onClick={clearDeck}>クリア</button>
        </div>
      </div>

      <div className="builder-layout">
        <section className="builder-pool" aria-label="カードプール">
          <div className="builder-toolbar">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
              <option value="all">すべて</option>
              <option value="ai">召喚獣</option>
              <option value="event">指令</option>
              <option value="memory">遺物</option>
            </select>
            <select value={attributeFilter} onChange={(event) => setAttributeFilter(event.target.value as AttributeFilter)}>
              <option value="all">全属性</option>
              {Object.keys(ATTRIBUTES).map((attribute) => (
                <option value={attribute} key={attribute}>{attribute}</option>
              ))}
            </select>
          </div>
          <div className="builder-card-list">
            {visibleCards.map((card, index) => {
              const count = counts.get(card.id) ?? 0;
              const disabled = cardIds.length >= DECK_SIZE || count >= SAME_NAME_LIMIT;
              return (
                <button
                  type="button"
                  className={`builder-card-row ${selectedId === card.id ? "selected" : ""}`}
                  style={{ "--card-color": cardColor(card) } as React.CSSProperties}
                  disabled={disabled}
                  key={card.id}
                  onClick={() => addCard(card.id)}
                  onMouseEnter={() => setSelectedId(card.id)}
                  title={selectedText(card)}
                >
                  <span className="builder-card-name">{card.name}</span>
                  <span className="builder-card-meta">{card.id}</span>
                  <span className="builder-card-count">{count}/{SAME_NAME_LIMIT}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="deck-editor" aria-label="編集中デッキ">
          <div className="deck-editor-head">
            <label>
              <span>デッキ名</span>
              <input value={deckName} onChange={(event) => setDeckName(event.target.value)} />
            </label>
            <div className={`deck-count-status ${validation.valid ? "valid" : ""}`}>
              {cardIds.length}/{DECK_SIZE}
            </div>
          </div>
          <DeckStats cardIds={cardIds} />
          <div className="validation-list" aria-live="polite">
            {validation.messages.length === 0 ? <span className="valid">保存できます</span> : validation.messages.map((message) => <span key={message}>{message}</span>)}
          </div>
          <div className="deck-list">
            {deckCards.length === 0 ? <div className="empty-deck">カードを追加してください</div> : deckCards.map((card, index) => (
              <button
                type="button"
                className="deck-card-item"
                style={{ "--card-color": cardColor(card) } as React.CSSProperties}
                key={`${card.id}-${index}`}
                aria-label={`${index + 1}枚目の${card.name}をデッキから外す`}
                title={`${card.name}をデッキから外す`}
                onClick={() => removeCard(index)}
                onMouseEnter={() => setSelectedId(card.id)}
              >
                <span className="deck-card-number">{index + 1}</span>
                <CardView card={card} ownerIndex={4} zone="hand" index={index} showCost />
              </button>
            ))}
          </div>
          <div className="deck-save-actions">
            <button type="button" className="primary-action" disabled={!validation.valid} onClick={saveDeck}>保存</button>
            <button type="button" disabled={cardIds.length === 0} onClick={exportDeck}>JSON書き出し</button>
            <label className="file-button">
              JSON読み込み
              <input type="file" accept="application/json,.json" onChange={importDeck} />
            </label>
          </div>
          {notice && <div className="builder-notice">{notice}</div>}
        </section>

        <aside className="builder-side" aria-label="カード詳細と保存済みデッキ">
          <CardInspector card={selectedCard} compact />
          <section className="saved-decks">
            <h3>保存済み</h3>
            {savedDecks.length === 0 ? <p>まだ保存されていません</p> : savedDecks.map((deck) => (
              <div className="saved-deck-row" key={deck.id}>
                <button type="button" onClick={() => loadDeck(deck)}>
                  <strong>{deck.name}</strong>
                  <span>{deck.cardIds.length}枚 / {formatDate(deck.updatedAt)}</span>
                </button>
                <button type="button" onClick={() => deleteDeck(deck.id)}>削除</button>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}

function CardInspector({ card, compact = false }: { card: Card | null; compact?: boolean }) {
  if (!card) return null;
  return (
    <aside className={`card-inspector ${compact ? "compact" : ""}`} style={{ "--card-color": cardColor(card) } as React.CSSProperties}>
      {compact
        ? <CardView card={card} ownerIndex={3} zone="hand" index={0} showCost />
        : <CardArtPreview card={card} />}
      <div className="inspector-copy">
        <h3>{card.name}</h3>
        <p>{selectedText(card)}</p>
        <dl>
          <div><dt>ID</dt><dd>{card.id}</dd></div>
          <div><dt>種別</dt><dd>{card.type === "ai" ? "召喚獣" : card.type === "event" ? "指令" : "遺物"}</dd></div>
          {card.attribute && <div><dt>属性</dt><dd>{card.attribute}</dd></div>}
          {card.power && <div><dt>power</dt><dd>{card.power}</dd></div>}
        </dl>
        <p className="inspector-effect">{roleText(card)}</p>
      </div>
    </aside>
  );
}

function DeckStats({ cardIds }: { cardIds: string[] }) {
  const cards = cardIds.map((cardId) => CARD_BY_ID.get(cardId)).filter((card): card is Card => Boolean(card));
  const aiCount = cards.filter((card) => card.type === "ai").length;
  const eventCount = cards.filter((card) => card.type === "event").length;
  const memoryCount = cards.filter((card) => card.type === "memory").length;
  const powerCounts = [1, 2, 3, 4].map((power) => cards.filter((card) => card.power === power).length);
  return (
    <div className="deck-stats">
      <StatChip label="召喚獣" value={aiCount} />
      <StatChip label="指令" value={eventCount} />
      <StatChip label="遺物" value={memoryCount} />
      {powerCounts.map((count, index) => <StatChip label={`P${index + 1}`} value={count} key={index} />)}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="stat-chip">
      <em>{label}</em>
      <strong>{value}</strong>
    </span>
  );
}

export function validateDeck(cardIds: string[]): { valid: boolean; messages: string[] } {
  const messages: string[] = [];
  if (cardIds.length !== DECK_SIZE) messages.push(`${DECK_SIZE}枚ちょうどにしてください`);
  const counts = countCards(cardIds);
  const exceeded = [...counts.entries()].filter(([, count]) => count > SAME_NAME_LIMIT);
  if (exceeded.length > 0) messages.push(`同名${SAME_NAME_LIMIT}枚を超えています`);
  const unknown = cardIds.filter((cardId) => !CARD_BY_ID.has(cardId));
  if (unknown.length > 0) messages.push("不明なカードが含まれています");
  return { valid: messages.length === 0, messages };
}

function countCards(cardIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  cardIds.forEach((cardId) => counts.set(cardId, (counts.get(cardId) ?? 0) + 1));
  return counts;
}

export function loadSavedDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(SAVED_DECKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeImportedDeck);
  } catch {
    return [];
  }
}

function persistSavedDecks(decks: SavedDeck[]) {
  localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(decks));
}

function normalizeImportedDeck(input: unknown): SavedDeck {
  if (!input || typeof input !== "object") throw new Error("デッキJSONの形式が不正です");
  const item = input as Partial<SavedDeck>;
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "読み込みデッキ";
  if (!Array.isArray(item.cardIds) || !item.cardIds.every((cardId) => typeof cardId === "string")) {
    throw new Error("cardIds が見つかりません");
  }
  const validation = validateDeck(item.cardIds);
  if (validation.messages.some((message) => message.includes("不明"))) {
    throw new Error("不明なカードIDが含まれています");
  }
  return {
    version: 1,
    id: typeof item.id === "string" ? item.id : `deck-${Date.now()}`,
    name,
    cardIds: [...item.cardIds],
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
  };
}

function safeFileName(name: string): string {
  return name.trim().replace(/[^\w.-]+/g, "_") || "break-duel-deck";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function typeRank(type: CardType): number {
  if (type === "ai") return 0;
  if (type === "event") return 1;
  return 2;
}

function attributeRank(attribute: Attribute | undefined): number {
  if (!attribute) return 99;
  return Object.keys(ATTRIBUTES).indexOf(attribute);
}
