import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { activeCardPool, type Card } from "../game";
import { CardView } from "./CardView";
import { runPackBurst } from "./packParticles";
import cardBackImage from "../assets/card-back.webp";
import packArtImage from "../assets/battlefield-fantasy-arena.webp";
import brandMark from "../assets/mark.svg";

// テスト実装: 新弾お披露目用のパック開封演出。
// カードは既存プールからのダミー抽選で、新弾カード実装後に差し替える。

const PACK_SET_LABEL = "拡張パック 第2弾（仮）";
const PACK_SIZE = 5;
const SR_RATE = 0.4;
const SECRET_UPGRADE_RATE = 0.25;
const TEAR_COMPLETE_THRESHOLD = 0.6;
const TEAR_SETTLE_MS = 720;
const TEAR_SETTLE_OMEN_MS = 1750;

type Rarity = "n" | "r" | "sr" | "sec";
type PackPhase = "sealed" | "torn" | "opened";
type PackCard = { key: number; card: Card; rarity: Rarity };

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
  const pool = activeCardPool();
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

export function PackOpeningPage() {
  const [pack, setPack] = useState<PackCard[]>(() => rollPack());
  const [phase, setPhase] = useState<PackPhase>("sealed");
  const [tearProgress, setTearProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flippedKeys, setFlippedKeys] = useState<Set<number>>(() => new Set());
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const burstCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  function tearRatioFor(clientX: number): number {
    const drag = dragRef.current;
    if (!drag) return 0;
    const stripWidth = stripRef.current?.offsetWidth ?? 280;
    return clamp01((clientX - drag.startX) / (stripWidth * 0.8));
  }

  function completeTear() {
    setTearProgress(1);
    setDragging(false);
    setPhase("torn");
    const settleMs = packOmen === "none" ? TEAR_SETTLE_MS : TEAR_SETTLE_OMEN_MS;
    settleTimerRef.current = window.setTimeout(() => setPhase("opened"), settleMs);
  }

  function handleTearPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "sealed") return;
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
    setFlippedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function openNextPack() {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    dragRef.current = null;
    setPack(rollPack());
    setPhase("sealed");
    setTearProgress(0);
    setDragging(false);
    setFlippedKeys(new Set());
  }

  const allFlipped = flippedKeys.size === pack.length;
  const bestRarity: Rarity = pack.some((entry) => entry.rarity === "sec")
    ? "sec"
    : pack.some((entry) => entry.rarity === "sr")
      ? "sr"
      : "r";
  const packOmen: "none" | "sr" | "sec" = bestRarity === "sec" || bestRarity === "sr" ? bestRarity : "none";

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
          <h2>パック開封（テスト実装）</h2>
          <p>新弾お披露目演出の試作。封を左から右へドラッグして剥き、配られたカードをめくってください。</p>
        </div>
        <div className="pack-heading-actions">
          <button type="button" onClick={openNextPack}>
            {phase === "sealed" ? "パックを引き直す" : "次のパックを剥く"}
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className={`pack-stage phase-${phase}${phase === "torn" && packOmen !== "none" ? ` stage-omen-${packOmen}` : ""}`}
      >
        {phase !== "opened" && (
          <div
            ref={packRef}
            className={`booster-pack omen-${packOmen} ${phase === "torn" ? "torn" : ""} ${dragging ? "dragging" : ""}`}
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
                  if (phase === "sealed") completeTear();
                }
              }}
            >
              <span className="pack-lid-foil" aria-hidden="true" />
              <span className="pack-tear-line" aria-hidden="true" />
              <span className="pack-lid-hint">ここをドラッグして剥く →</span>
            </div>
            <div className="pack-body">
              <div className="pack-brand">
                <img src={brandMark} alt="" draggable={false} />
                <span>BREAK DUEL</span>
              </div>
              <div className="pack-art">
                <img src={packArtImage} alt="" draggable={false} />
              </div>
              <div className="pack-set-name">{PACK_SET_LABEL}</div>
              <div className="pack-set-count">カード {PACK_SIZE} 枚入り</div>
            </div>
          </div>
        )}
        {phase === "torn" && packOmen !== "none" && (
          <>
            <canvas ref={burstCanvasRef} className="pack-omen-canvas" aria-hidden="true" />
            <span className="pack-impact-flash" aria-hidden="true" />
          </>
        )}
        {phase === "opened" && (
          <div className="pack-reveal">
            <ul className="pack-card-row">
              {pack.map((entry, index) => {
                const flipped = flippedKeys.has(entry.key);
                return (
                  <li key={entry.key} style={{ "--deal-index": index } as CSSProperties}>
                    <button
                      type="button"
                      className={`pack-card rarity-${entry.rarity} ${flipped ? "flipped" : ""}`}
                      onClick={() => flipCard(entry.key)}
                      aria-label={flipped ? `${entry.card.name}（公開済み）` : `${index + 1} 枚目のカードをめくる`}
                    >
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
                <span>
                  {pack.map((entry) => entry.card.name).join(" / ")}
                </span>
                <button type="button" onClick={openNextPack}>次のパックを剥く</button>
              </div>
            ) : (
              <p className="pack-reveal-hint">カードをタップしてめくる（残り {pack.length - flippedKeys.size} 枚）</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
