import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Card } from "../game";
import { CardView } from "./CardView";
import { CardInspector } from "./DeckWorkshop";
import { runPackBurst, runUrCutinBurst } from "./packParticles";
import { PACK_COST, addToCollection, loadCollection } from "../collection";
import { RARITY_LABELS, type CardRarity } from "../rarity";
import {
  PACK_CARD_POOL,
  PACK_SIZE,
  TEN_PACK_COUNT,
  cardIdsFromPacks,
  collectionCountsAfterPacks,
  markNewCards,
  packRevealCompletion,
  rollPackBatch,
  type PackCard,
  type PackPurchaseCount,
} from "../pack";
import cardBackImage from "../assets/card-back.webp";
import packArtImage from "../assets/pack-set2-echoes.png";
import brandMark from "../assets/mark.svg";

// UR 確定時の全画面カットイン。.stitch-shell と同様に祖先が overflow:hidden の
// stacking context を持つため、fixed 演出は body へ Portal して確実に画面全体を覆う。
// 線画の魔法陣ではなく、Canvas 2D で生成した発光雲・粒子・プリズム片を重ねる。
// DOM/CSS 側は中央のレアリティ表記と短い発光だけに留める。
function PackUrCutIn() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 紋章（UR 本体）は keyframe animation だけに頼ると、タブが一瞬でも
  // バックグラウンド化した際などにタイムラインが 0% のまま進まず不透明度 0 で
  // 固まってしまうことがある（カードめくりで踏んだのと同じ不具合）。
  // 装飾以上に「見えないと成立しない」要素なので、確実に最終状態へ収束する
  // transition で表示を担保する。
  const [active, setActive] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const center = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    return runUrCutinBurst(canvas, center, 1700);
  }, []);
  return createPortal(
    <div className={`pack-ur-cutin ${active ? "is-active" : ""}`} aria-hidden="true">
      <span className="pack-ur-cutin-flash" />
      <canvas ref={canvasRef} className="pack-ur-cutin-canvas" />
      <span className="pack-ur-cutin-seal">
        <strong>UR</strong>
      </span>
    </div>,
    document.body,
  );
}

const PACK_SET_LABEL = "残響の胎動";
const TEAR_COMPLETE_THRESHOLD = 0.6;
const TEAR_SETTLE_MS = 720;
const TEAR_SETTLE_OMEN_MS = 1750;
const RESULT_REVEAL_DELAY_MS = 650;

type PackPhase = "sealed" | "torn" | "opened";
type PackOmen = "none" | "sr" | "ur";
type RevealCallout = { token: number; rarity: CardRarity; label: string; isNew: boolean };
type PlaySfx = (kind: string) => void;

const RARITY_POWER: Record<CardRarity, number> = { n: 0, r: 1, sr: 2, ur: 3 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function omenOf(cards: PackCard[] | null): PackOmen {
  if (!cards) return "none";
  if (cards.some((entry) => entry.rarity === "ur")) return "ur";
  if (cards.some((entry) => entry.rarity === "sr")) return "sr";
  return "none";
}

function calloutLabelFor(entry: PackCard): string | null {
  if (entry.rarity === "ur") return "UR";
  if (entry.rarity === "sr") return "SR";
  // 通常Rはカード自体で判別できるため、連続で引いた際の「R」連打は出さない。
  // 新規入手だけはレアリティではなく獲得情報として知らせる。
  if (entry.isNew) return "NEW";
  return null;
}

export function PackBatchResults({
  packs,
  focusedKey,
  focusedCard,
  owned,
  collectionPctBefore,
  collectionPctAfter,
  ownedAfter,
  collectionTotal,
  onFocus,
  onRestart,
  playSfx,
}: {
  packs: PackCard[][];
  focusedKey: number | null;
  focusedCard: Card | null;
  owned: Record<string, number>;
  collectionPctBefore: number;
  collectionPctAfter: number;
  ownedAfter: number;
  collectionTotal: number;
  onFocus: (key: number) => void;
  onRestart: () => void;
  playSfx: PlaySfx;
}) {
  const entries = packs.flat();
  const newCount = entries.filter((entry) => entry.isNew).length;
  const srCount = entries.filter((entry) => entry.rarity === "sr").length;
  const urCount = entries.filter((entry) => entry.rarity === "ur").length;

  return (
    <div className="pack-batch-results">
      <header className="pack-batch-results-header">
        <div>
          <span>10 PACK COMPLETE</span>
          <h3>10連パック開封結果</h3>
          <p>全 {entries.length} 枚をパック単位でまとめて表示しています。</p>
        </div>
        <div className="pack-batch-result-stats" aria-label="10連パック集計">
          <span>NEW <strong>{newCount}</strong></span>
          <span>SR <strong>{srCount}</strong></span>
          <span>UR <strong>{urCount}</strong></span>
        </div>
      </header>
      <div className="pack-batch-results-layout">
        <div className="pack-batch-scroll" tabIndex={0} aria-label="10連パック全50枚の一覧">
          {packs.map((batchPack, packIndex) => (
            <section key={packIndex} className="pack-batch-group" aria-label={`${packIndex + 1}パック目`}>
              <ul>
                {batchPack.map((entry, cardIndex) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      className={`pack-batch-card rarity-${entry.rarity} ${focusedKey === entry.key ? "focused" : ""}`}
                      onClick={() => onFocus(entry.key)}
                      onMouseEnter={() => playSfx("hover")}
                      aria-label={`${packIndex + 1}パック目 ${entry.card.name} ${RARITY_LABELS[entry.rarity]}${entry.isNew ? " NEW" : ""}`}
                    >
                      <CardView
                        card={entry.card}
                        ownerIndex={0}
                        zone="hand"
                        index={packIndex * PACK_SIZE + cardIndex}
                        showCost={false}
                        showRarityBadge={false}
                      />
                      <span className="pack-batch-card-rarity">{RARITY_LABELS[entry.rarity]}</span>
                      {entry.isNew && <span className="pack-batch-card-new">NEW</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <CardInspector card={focusedCard ?? packs[0]?.[0]?.card ?? null} owned={owned} />
      </div>
      <footer className="pack-batch-results-footer">
        <div className="pack-progress">
          <div className="pack-progress-bar">
            <div className="pack-progress-fill" style={{ width: `${collectionPctAfter}%` }} />
          </div>
          <span className="pack-progress-label">
            第2弾コレクション {collectionPctBefore}%
            {collectionPctAfter !== collectionPctBefore ? ` → ${collectionPctAfter}%` : ""}
            （{ownedAfter}/{collectionTotal} 種）
          </span>
        </div>
        <button type="button" onClick={onRestart}>もう一度10連</button>
      </footer>
    </div>
  );
}

export function PackOpeningPage({
  coins,
  onSpendPacks,
  playSfx = () => undefined,
}: {
  coins: number;
  onSpendPacks: (count: PackPurchaseCount) => boolean;
  playSfx?: PlaySfx;
}) {
  const [purchaseCount, setPurchaseCount] = useState<PackPurchaseCount>(1);
  const [packBatch, setPackBatch] = useState<PackCard[][] | null>(null);
  const [activePackIndex, setActivePackIndex] = useState(0);
  const [ownedBeforeBatch, setOwnedBeforeBatch] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<PackPhase>("sealed");
  const [tearProgress, setTearProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flippedKeys, setFlippedKeys] = useState<Set<number>>(() => new Set());
  const [revealFocus, setRevealFocus] = useState<PackOmen>("none");
  const [focusedKey, setFocusedKey] = useState<number | null>(null);
  const [resultReady, setResultReady] = useState(false);
  const [revealCallout, setRevealCallout] = useState<RevealCallout | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const tearBusyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const burstCanvasRef = useRef<HTMLCanvasElement>(null);
  const revealCanvasRef = useRef<HTMLCanvasElement>(null);
  const flipAllTimersRef = useRef<number[]>([]);
  const flipFxTimersRef = useRef<number[]>([]);
  const flipBurstCancelRef = useRef<(() => void) | null>(null);
  const calloutTimerRef = useRef<number | null>(null);
  const calloutTokenRef = useRef(0);
  const pack = packBatch?.[activePackIndex] ?? null;
  const batchSize = packBatch?.length ?? purchaseCount;

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
      flipAllTimersRef.current.forEach((id) => window.clearTimeout(id));
      flipFxTimersRef.current.forEach((id) => window.clearTimeout(id));
      flipBurstCancelRef.current?.();
      if (calloutTimerRef.current !== null) window.clearTimeout(calloutTimerRef.current);
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

  // 購入（開封）の瞬間に全パックを独立抽選し、まとめてコレクションへ記録する。
  function purchaseAndRollPacks(): boolean {
    if (!onSpendPacks(purchaseCount)) return false;
    tearBusyRef.current = true;
    const ownedBefore = loadCollection();
    const rolled = markNewCards(rollPackBatch(purchaseCount), ownedBefore);
    addToCollection(cardIdsFromPacks(rolled));
    setOwnedBeforeBatch(ownedBefore);
    setPackBatch(rolled);
    setActivePackIndex(0);
    const firstPackOmen = omenOf(rolled[0] ?? null);
    setTearProgress(1);
    setDragging(false);
    setPhase("torn");
    const settleMs = firstPackOmen === "none" ? TEAR_SETTLE_MS : TEAR_SETTLE_OMEN_MS;
    settleTimerRef.current = window.setTimeout(() => setPhase("opened"), settleMs);
    return true;
  }

  function completeTear() {
    if (phase !== "sealed" || tearBusyRef.current) return;
    if (!purchaseAndRollPacks()) {
      playSfx("select");
      setTearProgress(0);
      setDragging(false);
    }
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
    if (entry) setFocusedKey(key);
    if (isFresh) playSfx("card-flip");
    setFlippedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (!isFresh) return;
    const calloutLabel = calloutLabelFor(entry);
    if (calloutLabel) {
      flipFxTimersRef.current.push(
        window.setTimeout(() => {
          calloutTokenRef.current += 1;
          setRevealCallout({
            token: calloutTokenRef.current,
            rarity: entry.rarity,
            label: calloutLabel,
            isNew: entry.isNew === true,
          });
          if (calloutTimerRef.current !== null) window.clearTimeout(calloutTimerRef.current);
          calloutTimerRef.current = window.setTimeout(() => setRevealCallout(null), entry.rarity === "ur" ? 1250 : 900);
        }, 330),
      );
    }
    if (entry.rarity === "r") scheduleSfx("draw", 330);
    if (entry.rarity !== "sr" && entry.rarity !== "ur") return;
    // キラカード確定: ステージ暗転 + カード背面からのバースト
    const rarity = entry.rarity;
    setRevealFocus(rarity);
    flipFxTimersRef.current.push(
      window.setTimeout(() => setRevealFocus("none"), 2100),
      // カードが表を向く瞬間（フリップ中間点の少し後）に光を噴かせる
      window.setTimeout(() => {
        playSfx("rare-reveal");
        // UR は同時に全画面カットインが走るため、カード位置の Canvas バーストを
        // 重ねると見えない描画へ負荷だけを二重に払う。局所バーストは SR のみにする。
        if (rarity === "ur") return;
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
          "sr",
          1450,
        );
      }, 360),
    );
  }

  function revealCard(key: number) {
    const entry = pack?.find((item) => item.key === key);
    if (!entry) return;
    if (flippedKeys.has(key)) {
      // 公開済みのカードは選び直すだけ（大きなプレビューを差し替える）
      setFocusedKey(key);
      return;
    }
    // どの並び順・どの位置でめくっても挙動が同じになるよう、レアリティに関わらず即めくる
    flipCard(key);
  }

  function flipAll() {
    if (!pack) return;
    flipAllTimersRef.current.forEach((id) => window.clearTimeout(id));
    // 一括開示は低レアから高レアへ。配置自体はシャッフルしたままなので、
    // 「右端が必ず当たり」にはせず、短い連打の最後だけを明確な山場にする。
    const unflipped = pack
      .filter((entry) => !flippedKeys.has(entry.key))
      .sort((a, b) => RARITY_POWER[a.rarity] - RARITY_POWER[b.rarity]);
    flipAllTimersRef.current = unflipped.map((entry, order) =>
      window.setTimeout(
        () => flipCard(entry.key),
        order * 170 + (entry.rarity === "sr" || entry.rarity === "ur" ? 300 : 0),
      ),
    );
  }

  function resetRevealState() {
    if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
    flipAllTimersRef.current.forEach((id) => window.clearTimeout(id));
    flipAllTimersRef.current = [];
    flipFxTimersRef.current.forEach((id) => window.clearTimeout(id));
    flipFxTimersRef.current = [];
    flipBurstCancelRef.current?.();
    flipBurstCancelRef.current = null;
    if (calloutTimerRef.current !== null) window.clearTimeout(calloutTimerRef.current);
    calloutTimerRef.current = null;
    dragRef.current = null;
    setDragging(false);
    setFlippedKeys(new Set());
    setRevealFocus("none");
    setFocusedKey(null);
    setResultReady(false);
    setRevealCallout(null);
  }

  function resetPackState() {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    resetRevealState();
    tearBusyRef.current = false;
    setPackBatch(null);
    setActivePackIndex(0);
    setOwnedBeforeBatch({});
    setPhase("sealed");
    setTearProgress(0);
  }

  function advanceToNextPurchasedPack() {
    if (!packBatch || activePackIndex >= packBatch.length - 1) return;
    resetRevealState();
    setActivePackIndex((current) => current + 1);
    setPhase("opened");
  }

  function continuePackOpening() {
    playSfx("select");
    if (packBatch && activePackIndex < packBatch.length - 1) {
      advanceToNextPurchasedPack();
      return;
    }
    resetPackState();
  }

  const purchaseCost = PACK_COST * purchaseCount;
  const canAfford = coins >= purchaseCost;
  const allFlipped = pack !== null && flippedKeys.size === pack.length;
  const packOmen = omenOf(pack);
  const finalPackInBatch = activePackIndex === batchSize - 1;
  const revealCompletion = packRevealCompletion(batchSize, activePackIndex);
  const flippedEntries = Array.from(flippedKeys)
    .map((key) => pack?.find((entry) => entry.key === key))
    .filter((entry): entry is PackCard => entry !== undefined);
  const focusedCard = packBatch?.flat().find((entry) => entry.key === focusedKey)?.card ?? null;
  // 1枚めくるたびに大判プレビューへ切り替わると忙しないので、全部めくり切って
  // 結果が出るタイミング（SR/UR演出後の一拍を含む）まではプレビューを出さない
  const showInspector = batchSize === 1 && allFlipped && resultReady && focusedCard !== null;
  const showBatchResults = revealCompletion === "batch-results" && allFlipped && resultReady;

  // 第2弾コレクションの充実度。10連は購入時点のスナップショットを保持し、
  // 最終パックの結果でまとめて開封前→開封後を表示する。
  const collectionTotal2 = PACK_CARD_POOL.length;
  const ownedCounts2 = allFlipped && packBatch
    ? collectionCountsAfterPacks(packBatch, ownedBeforeBatch, activePackIndex + 1)
    : null;
  const ownedAfter2 = ownedCounts2
    ? PACK_CARD_POOL.filter((card) => (ownedCounts2[card.id] ?? 0) > 0).length
    : 0;
  const ownedBefore2 = PACK_CARD_POOL.filter((card) => (ownedBeforeBatch[card.id] ?? 0) > 0).length;
  const collectionPctBefore = collectionTotal2 > 0 ? Math.round((ownedBefore2 / collectionTotal2) * 100) : 0;
  const collectionPctAfter = collectionTotal2 > 0 ? Math.round((ownedAfter2 / collectionTotal2) * 100) : 0;

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

  useEffect(() => {
    // SR/UR の確定演出（暗転・カットイン等）が続いている間は revealFocus が "none" に
    // 戻らない。10連の中間パックは公開済みの5枚を見返せるようその場で止め、
    // 最終パックだけ全50枚の一覧表示へ切り替える。
    if (!allFlipped || revealFocus !== "none") {
      setResultReady(false);
      return;
    }
    if (revealCompletion === "next-pack") {
      setResultReady(false);
      return;
    }
    resultTimerRef.current = window.setTimeout(() => {
      setResultReady(true);
    }, RESULT_REVEAL_DELAY_MS);
    return () => {
      if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
    };
  }, [allFlipped, revealFocus, revealCompletion]);

  return (
    <section className="workshop-page pack-page">
      <div className="workshop-heading">
        <div>
          <h2>パック開封</h2>
          <p>1 パック {PACK_COST} コイン。単発または10連を選び、封を左から右へドラッグして開封します。コインは対戦で獲得（勝利 +10 ／ 敗北 +5）。</p>
        </div>
        <div className="pack-heading-actions">
          {phase === "sealed" ? (
            <div className="pack-purchase-options" aria-label="開封するパック数">
              <button
                type="button"
                className={purchaseCount === 1 ? "active" : ""}
                aria-pressed={purchaseCount === 1}
                onClick={() => setPurchaseCount(1)}
              >
                1パック <small>{PACK_COST}コイン</small>
              </button>
              <button
                type="button"
                className={purchaseCount === TEN_PACK_COUNT ? "active" : ""}
                aria-pressed={purchaseCount === TEN_PACK_COUNT}
                onClick={() => setPurchaseCount(TEN_PACK_COUNT)}
              >
                10連 <small>{PACK_COST * TEN_PACK_COUNT}コイン</small>
              </button>
            </div>
          ) : phase === "opened" && allFlipped && resultReady ? (
            <button type="button" onClick={continuePackOpening}>
              {finalPackInBatch ? (batchSize === TEN_PACK_COUNT ? "もう一度10連" : "次のパックへ") : `次のパックへ（${activePackIndex + 2}/${batchSize}）`}
            </button>
          ) : null}
        </div>
      </div>
      <div
        ref={stageRef}
        className={`pack-stage phase-${phase}${phase === "torn" && packOmen !== "none" ? ` stage-omen-${packOmen}` : ""}${revealFocus !== "none" ? ` stage-flip-${revealFocus}` : ""}`}
      >
        {revealFocus === "ur" && <PackUrCutIn />}
        {phase === "torn" && packOmen !== "none" && (
          <span className={`pack-omen omen-${packOmen}`} aria-hidden="true">
            <span className="pack-omen-rays" />
          </span>
        )}
        {phase !== "opened" && (
          <div
            ref={packRef}
            className={`booster-pack omen-${packOmen} ${phase === "torn" ? "torn" : ""} ${dragging ? "dragging" : ""} ${canAfford ? "" : "locked"}`}
            style={{ "--tear": tearProgress } as CSSProperties}
          >
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
                  if (phase !== "sealed" || !canAfford) return;
                  playSfx("pack-tear");
                  completeTear();
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
              <div className="pack-set-count">
                {purchaseCount === TEN_PACK_COUNT ? `カード ${PACK_SIZE} 枚 × ${TEN_PACK_COUNT} パック` : `カード ${PACK_SIZE} 枚入り`}
              </div>
            </div>
          </div>
        )}
        {phase === "sealed" && (
          <div className="pack-cost-line">
            <span>{purchaseCount === TEN_PACK_COUNT ? "10連" : "1パック"}開封コスト {purchaseCost} コイン ／ 所持 {coins} コイン</span>
            {!canAfford && <em>コインが足りません。対戦で獲得できます（勝利 +10 ／ 敗北 +5）</em>}
          </div>
        )}
        {phase === "torn" && packOmen !== "none" && (
          <>
            <canvas ref={burstCanvasRef} className="pack-omen-canvas" aria-hidden="true" />
            <span className="pack-impact-flash" aria-hidden="true" />
          </>
        )}
        <div aria-live="polite">
          {revealCallout && (
            <div key={revealCallout.token} className={`pack-reveal-callout rarity-${revealCallout.rarity}`}>
              <span>{revealCallout.label}</span>
              {revealCallout.isNew && (revealCallout.rarity === "sr" || revealCallout.rarity === "ur") && <em>NEW</em>}
            </div>
          )}
        </div>
        {phase === "opened" && pack && (
          showBatchResults && packBatch ? (
            <PackBatchResults
              packs={packBatch}
              focusedKey={focusedKey}
              focusedCard={focusedCard}
              owned={ownedCounts2 ?? {}}
              collectionPctBefore={collectionPctBefore}
              collectionPctAfter={collectionPctAfter}
              ownedAfter={ownedAfter2}
              collectionTotal={collectionTotal2}
              onFocus={setFocusedKey}
              onRestart={continuePackOpening}
              playSfx={playSfx}
            />
          ) : (
            <div className="pack-reveal">
            <span
              className={`pack-reveal-dim ${revealFocus !== "none" ? `dim-${revealFocus}` : ""}`}
              aria-hidden="true"
            />
            <canvas ref={revealCanvasRef} className="pack-reveal-canvas" aria-hidden="true" />
            <div className="pack-hype-strip">
              <div className="pack-hype-copy">
                <span>{batchSize > 1 ? `${activePackIndex + 1}/${batchSize} PACK` : "公開済み"}</span>
                <strong>{flippedKeys.size}<small>/{PACK_SIZE}</small></strong>
              </div>
              <div className="pack-hype-meter" aria-label={`${PACK_SIZE}枚中${flippedKeys.size}枚を公開`}>
                {Array.from({ length: PACK_SIZE }, (_, index) => {
                  const revealed = flippedEntries[index];
                  return (
                    <i
                      key={index}
                      className={revealed ? `is-lit rarity-${revealed.rarity}` : ""}
                      aria-hidden="true"
                    />
                  );
                })}
              </div>
            </div>
            <div className={`pack-reveal-layout ${showInspector ? "with-inspector" : ""}`}>
              <div className="pack-reveal-main">
                <ul className="pack-card-row">
                  {pack.map((entry, index) => {
                    const flipped = flippedKeys.has(entry.key);
                    return (
                      <li key={entry.key} style={{ "--deal-index": index } as CSSProperties}>
                        <button
                          type="button"
                          data-pack-key={entry.key}
                          className={`pack-card rarity-${entry.rarity} ${flipped ? "flipped" : ""} ${focusedKey === entry.key ? "focused" : ""}`}
                          onClick={() => revealCard(entry.key)}
                          onMouseEnter={() => playSfx("hover")}
                          aria-label={flipped ? `${entry.card.name}（公開済み）` : `${index + 1} 枚目のカードをめくる`}
                        >
                          {(entry.rarity === "sr" || entry.rarity === "ur") && (
                            <span className={`pack-card-rays rays-${entry.rarity}`} aria-hidden="true" />
                          )}
                          <span className="pack-card-inner">
                            <span className="pack-card-face pack-card-front">
                              <img src={cardBackImage} alt="" draggable={false} />
                            </span>
                            <span className="pack-card-face pack-card-back">
                              <CardView card={entry.card} ownerIndex={0} zone="hand" index={index} showCost={false} showRarityBadge={false} />
                            </span>
                          </span>
                          <span className={`pack-rarity-chip ${flipped ? "shown" : ""}`}>{RARITY_LABELS[entry.rarity]}</span>
                          {entry.isNew && <span className={`pack-new-chip ${flipped ? "shown" : ""}`}>NEW</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {allFlipped && resultReady ? (
                  <div className="pack-summary">
                    <div className="pack-progress">
                      <div className="pack-progress-bar">
                        <div className="pack-progress-fill" style={{ width: `${collectionPctAfter}%` }} />
                      </div>
                      <span className="pack-progress-label">
                        第2弾コレクション {collectionPctBefore}%
                        {collectionPctAfter !== collectionPctBefore ? ` → ${collectionPctAfter}%` : ""}
                        （{ownedAfter2}/{collectionTotal2} 種）
                      </span>
                    </div>
                    <div className="pack-summary-actions">
                      <button type="button" onClick={continuePackOpening}>次のパックへ</button>
                    </div>
                  </div>
                ) : (
                  <div className="pack-reveal-controls">
                    <p className="pack-reveal-hint">
                      カードをタップしてめくる（残り {pack.length - flippedKeys.size} 枚）
                    </p>
                    <button
                      type="button"
                      className="pack-flip-all"
                      onClick={revealCompletion === "next-pack" && allFlipped ? continuePackOpening : flipAll}
                      disabled={allFlipped && (revealCompletion !== "next-pack" || revealFocus !== "none")}
                    >
                      {revealCompletion === "next-pack" && allFlipped ? "次を開封する" : "すべてめくる"}
                    </button>
                  </div>
                )}
              </div>
              {showInspector && (
                <CardInspector card={focusedCard} owned={ownedCounts2 ?? undefined} />
              )}
            </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}
