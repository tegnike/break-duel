import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { activeCardPool, cardSet, type Card } from "../game";
import { CardView } from "./CardView";
import { runPackBurst } from "./packParticles";
import { PACK_COST, addToCollection } from "../collection";
import cardBackImage from "../assets/card-back.webp";
import packArtImage from "../assets/pack-set2-echoes.png";
import brandMark from "../assets/mark.svg";

const PACK_SET_LABEL = "残響の胎動";
const PACK_SIZE = 5;
const SR_RATE = 0.4;
const SECRET_UPGRADE_RATE = 0.25;
const TEAR_COMPLETE_THRESHOLD = 0.6;
const TEAR_SETTLE_MS = 720;
const TEAR_SETTLE_OMEN_MS = 1750;

type Rarity = "n" | "r" | "sr" | "sec";
type PackPhase = "sealed" | "torn" | "opened";
type PackCard = { key: number; card: Card; rarity: Rarity; isNew?: boolean };
type PackOmen = "none" | "sr" | "sec";
type PlaySfx = (kind: string) => void;

const RARITY_LABELS: Record<Rarity, string> = {
  n: "N",
  r: "R",
  sr: "SR",
  sec: "SECRET",
};

function baseRarity(card: Card): Rarity {
  if (card.type === "ai") {
    if ((card.power ?? 0) >= 4) return "sr";
    if ((card.power ?? 0) === 3) return "r";
    return "n";
  }
  return card.type === "memory" ? "r" : "n";
}

function drawFrom(pool: Card[], usedIds: Set<string>): Card {
  const candidates = pool.filter((card) => !usedIds.has(card.id));
  const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
  usedIds.add(picked.id);
  return picked;
}

function rollPack(): PackCard[] {
  // 第2弾パック: 収録は set 2 のカードのみ
  const pool = activeCardPool().filter((card) => cardSet(card) === 2);
  const commons = pool.filter((card) => baseRarity(card) === "n");
  const rares = pool.filter((card) => baseRarity(card) === "r");
  const supers = pool.filter((card) => baseRarity(card) === "sr");
  const usedIds = new Set<string>();
  const cards: PackCard[] = [];
  for (let slot = 0; slot < PACK_SIZE; slot += 1) {
    if (slot < 3) {
      cards.push({ key: slot, card: drawFrom(commons, usedIds), rarity: "n" });
    } else if (slot === 3) {
      cards.push({ key: slot, card: drawFrom(rares, usedIds), rarity: "r" });
    } else if (Math.random() < SR_RATE) {
      const secret = Math.random() < SECRET_UPGRADE_RATE;
      cards.push({ key: slot, card: drawFrom(supers, usedIds), rarity: secret ? "sec" : "sr" });
    } else {
      cards.push({ key: slot, card: drawFrom(rares, usedIds), rarity: "r" });
    }
  }
  return cards;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function omenOf(cards: PackCard[] | null): PackOmen {
  if (!cards) return "none";
  if (cards.some((entry) => entry.rarity === "sec")) return "sec";
  if (cards.some((entry) => entry.rarity === "sr")) return "sr";
  return "none";
}

export function PackOpeningPage({
  coins,
  onSpendPack,
  playSfx = () => undefined,
}: {
  coins: number;
  onSpendPack: () => boolean;
  playSfx?: PlaySfx;
}) {
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [phase, setPhase] = useState<PackPhase>("sealed");
  const [tearProgress, setTearProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flippedKeys, setFlippedKeys] = useState<Set<number>>(() => new Set());
  const [revealFocus, setRevealFocus] = useState<PackOmen>("none");
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const tearBusyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const burstCanvasRef = useRef<HTMLCanvasElement>(null);
  const revealCanvasRef = useRef<HTMLCanvasElement>(null);
  const flipAllTimersRef = useRef<number[]>([]);
  const flipFxTimersRef = useRef<number[]>([]);
  const flipBurstCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      flipAllTimersRef.current.forEach((id) => window.clearTimeout(id));
      flipFxTimersRef.current.forEach((id) => window.clearTimeout(id));
      flipBurstCancelRef.current?.();
    };
  }, []);

  function tearRatioFor(clientX: number): number {
    const drag = dragRef.current;
    if (!drag) return 0;
    const stripWidth = stripRef.current?.offsetWidth ?? 280;
    return clamp01((clientX - drag.startX) / (stripWidth * 0.8));
  }

  function scheduleSfx(kind: string, delayMs: number) {
    if (delayMs <= 0) {
      playSfx(kind);
      return;
    }
    flipFxTimersRef.current.push(window.setTimeout(() => playSfx(kind), delayMs));
  }

  function completeTear() {
    if (phase !== "sealed" || tearBusyRef.current) return;
    if (!onSpendPack()) {
      playSfx("select");
      setTearProgress(0);
      setDragging(false);
      return;
    }
    tearBusyRef.current = true;
    // 中身は購入（開封）の瞬間に抽選してコレクションへ記録する
    const rolled = rollPack();
    const { newIds } = addToCollection(rolled.map((entry) => entry.card.id));
    const marked = rolled.map((entry) => ({ ...entry, isNew: newIds.includes(entry.card.id) }));
    const packOmen = omenOf(marked);
    setPack(marked);
    setTearProgress(1);
    setDragging(false);
    setPhase("torn");
    const settleMs = packOmen === "none" ? TEAR_SETTLE_MS : TEAR_SETTLE_OMEN_MS;
    settleTimerRef.current = window.setTimeout(() => setPhase("opened"), settleMs);
  }

  function handleTearPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "sealed" || !canAfford) return;
    playSfx("pack-tear");
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 合成ポインターイベント（テスト等）ではキャプチャできない場合がある
    }
    setDragging(true);
  }

  function handleTearPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "sealed") return;
    if (dragRef.current?.pointerId !== event.pointerId) return;
    setTearProgress(tearRatioFor(event.clientX));
  }

  function handleTearPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const ratio = tearRatioFor(event.clientX);
    dragRef.current = null;
    setDragging(false);
    if (phase !== "sealed") return;
    if (ratio >= TEAR_COMPLETE_THRESHOLD) {
      completeTear();
    } else {
      setTearProgress(0);
    }
  }

  function flipCard(key: number) {
    const entry = pack?.find((item) => item.key === key);
    const isFresh = entry !== undefined && !flippedKeys.has(key);
    if (isFresh) playSfx("card-flip");
    setFlippedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (!isFresh || (entry.rarity !== "sr" && entry.rarity !== "sec")) return;
    // キラカード確定: ステージ暗転 + カード背面からのバースト
    const rarity = entry.rarity;
    setRevealFocus(rarity);
    flipFxTimersRef.current.push(
      window.setTimeout(() => setRevealFocus("none"), 2100),
      // カードが表を向く瞬間（フリップ中間点の少し後）に光を噴かせる
      window.setTimeout(() => {
        playSfx("rare-reveal");
        const stage = stageRef.current;
        const canvas = revealCanvasRef.current;
        const cardEl = stage?.querySelector(`[data-pack-key="${key}"]`);
        if (!stage || !canvas || !cardEl) return;
        const stageRect = stage.getBoundingClientRect();
        const cardRect = cardEl.getBoundingClientRect();
        flipBurstCancelRef.current?.();
        flipBurstCancelRef.current = runPackBurst(
          canvas,
          {
            x: cardRect.left + cardRect.width / 2 - stageRect.left,
            y: cardRect.top + cardRect.height * 0.3 - stageRect.top,
          },
          rarity,
          1450,
        );
      }, 360),
    );
  }

  function flipAll() {
    if (!pack) return;
    flipAllTimersRef.current.forEach((id) => window.clearTimeout(id));
    flipAllTimersRef.current = pack
      .filter((entry) => !flippedKeys.has(entry.key))
      .map((entry, order) => window.setTimeout(() => flipCard(entry.key), order * 140));
  }

  function openNextPack() {
    playSfx("select");
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    flipAllTimersRef.current.forEach((id) => window.clearTimeout(id));
    flipAllTimersRef.current = [];
    flipFxTimersRef.current.forEach((id) => window.clearTimeout(id));
    flipFxTimersRef.current = [];
    flipBurstCancelRef.current?.();
    flipBurstCancelRef.current = null;
    dragRef.current = null;
    tearBusyRef.current = false;
    setPack(null);
    setPhase("sealed");
    setTearProgress(0);
    setDragging(false);
    setFlippedKeys(new Set());
    setRevealFocus("none");
  }

  const canAfford = coins >= PACK_COST;
  const allFlipped = pack !== null && flippedKeys.size === pack.length;
  const packOmen = omenOf(pack);
  const bestRarity: Rarity = packOmen === "none" ? "r" : packOmen;
  const newCount = pack?.filter((entry) => entry.isNew).length ?? 0;

  useEffect(() => {
    if (phase !== "torn" || packOmen === "none") return;
    const canvas = burstCanvasRef.current;
    const stage = stageRef.current;
    const pack = packRef.current;
    if (!canvas || !stage || !pack) return;
    const stageRect = stage.getBoundingClientRect();
    const packRect = pack.getBoundingClientRect();
    const origin = {
      x: packRect.left + packRect.width / 2 - stageRect.left,
      y: packRect.top + 66 - stageRect.top,
    };
    const cancel = runPackBurst(canvas, origin, packOmen, 1550);
    return cancel;
  }, [phase, packOmen]);

  return (
    <section className="workshop-page pack-page">
      <div className="workshop-heading">
        <div>
          <h2>パック開封</h2>
          <p>1 パック {PACK_COST} コイン。封を左から右へドラッグして剥くと中身が決まります。コインは対戦で獲得（勝利 +10 ／ 敗北 +5）。</p>
        </div>
        <div className="pack-heading-actions">
          {phase === "opened" && (
            <button type="button" onClick={openNextPack}>次のパックへ</button>
          )}
        </div>
      </div>
      <div
        ref={stageRef}
        className={`pack-stage phase-${phase}${phase === "torn" && packOmen !== "none" ? ` stage-omen-${packOmen}` : ""}`}
      >
        {phase !== "opened" && (
          <div
            ref={packRef}
            className={`booster-pack omen-${packOmen} ${phase === "torn" ? "torn" : ""} ${dragging ? "dragging" : ""} ${canAfford ? "" : "locked"}`}
            style={{ "--tear": tearProgress } as CSSProperties}
          >
            {phase === "torn" && packOmen !== "none" && (
              <span className="pack-omen" aria-hidden="true">
                <span className="pack-omen-rays" />
              </span>
            )}
            <div
              ref={stripRef}
              className="pack-lid"
              role="button"
              aria-label="封を剥いてパックを開ける"
              tabIndex={0}
              onPointerDown={handleTearPointerDown}
              onPointerMove={handleTearPointerMove}
              onPointerUp={handleTearPointerEnd}
              onPointerCancel={handleTearPointerEnd}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  playSfx("pack-tear");
                  if (phase === "sealed") completeTear();
                }
              }}
            >
              <img className="pack-lid-art" src={packArtImage} alt="" draggable={false} />
              <span className="pack-tear-line" aria-hidden="true" />
              {canAfford && (
                <span className="pack-lid-grip" aria-hidden="true">
                  <span className="pack-lid-grip-chevron" />
                  <span className="pack-lid-grip-chevron" />
                  <span className="pack-lid-grip-chevron" />
                </span>
              )}
            </div>
            <div className="pack-body">
              <img className="pack-wrapper-art" src={packArtImage} alt="" draggable={false} />
              <div className="pack-brand">
                <img src={brandMark} alt="" draggable={false} />
                <span>BREAK DUEL</span>
              </div>
              <div className="pack-title-lockup">
                <span>BOOSTER PACK</span>
                <strong>{PACK_SET_LABEL}</strong>
                <em>第2弾</em>
              </div>
              <div className="pack-set-count">カード {PACK_SIZE} 枚入り</div>
            </div>
          </div>
        )}
        {phase === "sealed" && (
          <div className="pack-cost-line">
            <span>開封コスト {PACK_COST} コイン ／ 所持 {coins} コイン</span>
            {!canAfford && <em>コインが足りません。対戦で獲得できます（勝利 +10 ／ 敗北 +5）</em>}
          </div>
        )}
        {phase === "torn" && packOmen !== "none" && (
          <>
            <canvas ref={burstCanvasRef} className="pack-omen-canvas" aria-hidden="true" />
            <span className="pack-impact-flash" aria-hidden="true" />
          </>
        )}
        {phase === "opened" && pack && (
          <div className="pack-reveal">
            <span className={`pack-reveal-dim ${revealFocus !== "none" ? `dim-${revealFocus}` : ""}`} aria-hidden="true" />
            <canvas ref={revealCanvasRef} className="pack-reveal-canvas" aria-hidden="true" />
            <ul className="pack-card-row">
              {pack.map((entry, index) => {
                const flipped = flippedKeys.has(entry.key);
                return (
                  <li key={entry.key} style={{ "--deal-index": index } as CSSProperties}>
                    <button
                      type="button"
                      data-pack-key={entry.key}
                      className={`pack-card rarity-${entry.rarity} ${flipped ? "flipped" : ""}`}
                      onClick={() => flipCard(entry.key)}
                      onMouseEnter={() => playSfx("hover")}
                      aria-label={flipped ? `${entry.card.name}（公開済み）` : `${index + 1} 枚目のカードをめくる`}
                    >
                      {(entry.rarity === "sr" || entry.rarity === "sec") && (
                        <span className={`pack-card-rays rays-${entry.rarity}`} aria-hidden="true" />
                      )}
                      <span className="pack-card-inner">
                        <span className="pack-card-face pack-card-front">
                          <img src={cardBackImage} alt="" draggable={false} />
                        </span>
                        <span className="pack-card-face pack-card-back">
                          <CardView card={entry.card} ownerIndex={0} zone="hand" index={index} showCost={false} />
                          {entry.rarity === "sec" && <span className="pack-holo-overlay" aria-hidden="true" />}
                        </span>
                      </span>
                      <span className={`pack-rarity-chip ${flipped ? "shown" : ""}`}>{RARITY_LABELS[entry.rarity]}</span>
                      {entry.isNew && <span className={`pack-new-chip ${flipped ? "shown" : ""}`}>NEW</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {allFlipped ? (
              <div className={`pack-summary best-${bestRarity}`}>
                <strong>
                  {bestRarity === "sec" ? "シークレット出現！！" : bestRarity === "sr" ? "スーパーレア確保！" : "開封完了"}
                </strong>
                <ul className="pack-summary-cards">
                  {pack.map((entry) => (
                    <li key={entry.key} className={`rarity-${entry.rarity}`}>
                      <span className="pack-summary-card-name">{entry.card.name}</span>
                      <span className="pack-summary-card-rarity">{RARITY_LABELS[entry.rarity]}</span>
                    </li>
                  ))}
                </ul>
                <span className="pack-summary-meta">NEW {newCount} 種 ／ 所持コイン {coins}</span>
                <button type="button" onClick={openNextPack}>次のパックへ</button>
              </div>
            ) : (
              <div className="pack-reveal-controls">
                <p className="pack-reveal-hint">カードをタップしてめくる（残り {pack.length - flippedKeys.size} 枚）</p>
                <button type="button" className="pack-flip-all" onClick={flipAll}>
                  すべてめくる
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
