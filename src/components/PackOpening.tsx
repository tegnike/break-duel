import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { activeCardPool, cardSet, type Card } from "../game";
import { CardView } from "./CardView";
import { CardInspector } from "./DeckWorkshop";
import { runPackBurst, runUrCutinBurst } from "./packParticles";
import { PACK_COST, addToCollection, loadCollection } from "../collection";
import { RARITY_LABELS, baseCardRarity, type CardRarity } from "../rarity";
import cardBackImage from "../assets/card-back.webp";
import packArtImage from "../assets/pack-set2-echoes.png";
import brandMark from "../assets/mark.svg";

// UR 確定時の全画面カットイン。.stitch-shell と同様に祖先が overflow:hidden の
// stacking context を持つため、fixed 演出は body へ Portal して確実に画面全体を覆う。
// 紙吹雪＋斜めバナーという汎用ソシャゲ演出や CSS の手描き形状は「手作り感」が出やすいため、
// 同心円・ルーンティック・水晶片の飛散は runPackBurst と同じ加算合成の Canvas 2D
// パーティクルエンジン（runUrCutinBurst）に任せ、DOM/CSS 側はテキストと簡単なフラッシュだけにする。
function PackUrCutIn() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 紋章（ULTRA RARE 本体）は keyframe animation だけに頼ると、タブが一瞬でも
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
        <strong>ULTRA RARE</strong>
      </span>
    </div>,
    document.body,
  );
}

const PACK_SET_LABEL = "残響の胎動";
const PACK_SIZE = 5;
const FIFTH_SLOT_UR_RATE = 0.1;
const FIFTH_SLOT_SR_RATE = 0.3;
const TEAR_COMPLETE_THRESHOLD = 0.6;
const TEAR_SETTLE_MS = 720;
const TEAR_SETTLE_OMEN_MS = 1750;
const RESULT_REVEAL_DELAY_MS = 650;

type PackPhase = "sealed" | "torn" | "opened";
type PackCard = { key: number; card: Card; rarity: CardRarity; isNew?: boolean };
type PackOmen = "none" | "sr" | "ur";
type RevealCallout = { token: number; rarity: CardRarity; label: string; isNew: boolean };
type PlaySfx = (kind: string) => void;

const RARITY_POWER: Record<CardRarity, number> = { n: 0, r: 1, sr: 2, ur: 3 };
const RESULT_COPY: Record<CardRarity, { kicker: string; title: string }> = {
  n: { kicker: "PACK COMPLETE", title: "COLLECTION GET" },
  r: { kicker: "RARE OR BETTER", title: "RARE PULL" },
  sr: { kicker: "GOLD SIGNAL", title: "SUPER RARE HIT" },
  ur: { kicker: "PRISM SIGNAL", title: "ULTRA RARE JACKPOT" },
};

function drawFrom(pool: Card[], usedIds: Set<string>): Card {
  const candidates = pool.filter((card) => !usedIds.has(card.id));
  const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
  usedIds.add(picked.id);
  return picked;
}

// Fisher-Yates。最高レアリティが常に右端に固まらないよう、枠内の並び順をシャッフルする
function shuffled<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function rollHighSlotRarity(): CardRarity {
  const highRoll = Math.random();
  if (highRoll < FIFTH_SLOT_UR_RATE) return "ur";
  if (highRoll < FIFTH_SLOT_UR_RATE + FIFTH_SLOT_SR_RATE) return "sr";
  return "r";
}

function rollPack(): PackCard[] {
  // 第2弾パック: 収録は set 2 のカードのみ
  const pool = activeCardPool().filter((card) => cardSet(card) === 2);
  const poolByRarity: Record<CardRarity, Card[]> = {
    n: pool.filter((card) => baseCardRarity(card) === "n"),
    r: pool.filter((card) => baseCardRarity(card) === "r"),
    sr: pool.filter((card) => baseCardRarity(card) === "sr"),
    ur: pool.filter((card) => baseCardRarity(card) === "ur"),
  };
  const rarities = shuffled<CardRarity>(["n", "n", "n", "r", rollHighSlotRarity()]);
  const usedIds = new Set<string>();
  return rarities.map((rarity, slot) => ({
    key: slot,
    card: drawFrom(poolByRarity[rarity], usedIds),
    rarity,
  }));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function omenOf(cards: PackCard[] | null): PackOmen {
  if (!cards) return "none";
  if (cards.some((entry) => entry.rarity === "ur")) return "ur";
  if (cards.some((entry) => entry.rarity === "sr")) return "sr";
  return "none";
}

function bestRarityOf(cards: PackCard[] | null): CardRarity {
  return cards?.reduce<CardRarity>(
    (best, entry) => (RARITY_POWER[entry.rarity] > RARITY_POWER[best] ? entry.rarity : best),
    "n",
  ) ?? "n";
}

function calloutLabelFor(entry: PackCard): string | null {
  if (entry.rarity === "ur") return "JACKPOT";
  if (entry.rarity === "sr") return "SUPER RARE";
  if (entry.rarity === "r") return "RARE PULL";
  if (entry.isNew) return "NEW CARD";
  return null;
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
  const [focusedKey, setFocusedKey] = useState<number | null>(null);
  const [resultReady, setResultReady] = useState(false);
  const [revealCallout, setRevealCallout] = useState<RevealCallout | null>(null);
  const [sessionPackCount, setSessionPackCount] = useState(0);
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

  // 購入（開封）の瞬間に抽選してコレクションへ記録する。成功したら true を返す
  function purchaseAndRollPack(): boolean {
    if (!onSpendPack()) return false;
    tearBusyRef.current = true;
    const rolled = rollPack();
    const { newIds } = addToCollection(rolled.map((entry) => entry.card.id));
    const marked = rolled.map((entry) => ({ ...entry, isNew: newIds.includes(entry.card.id) }));
    const packOmen = omenOf(marked);
    setPack(marked);
    setSessionPackCount((count) => count + 1);
    setTearProgress(1);
    setDragging(false);
    setPhase("torn");
    const settleMs = packOmen === "none" ? TEAR_SETTLE_MS : TEAR_SETTLE_OMEN_MS;
    settleTimerRef.current = window.setTimeout(() => setPhase("opened"), settleMs);
    return true;
  }

  function completeTear() {
    if (phase !== "sealed" || tearBusyRef.current) return;
    if (!purchaseAndRollPack()) {
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

  function resetPackState() {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
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
    tearBusyRef.current = false;
    setPack(null);
    setPhase("sealed");
    setTearProgress(0);
    setDragging(false);
    setFlippedKeys(new Set());
    setRevealFocus("none");
    setFocusedKey(null);
    setResultReady(false);
    setRevealCallout(null);
  }

  function openNextPack() {
    playSfx("select");
    resetPackState();
  }

  const canAfford = coins >= PACK_COST;
  const allFlipped = pack !== null && flippedKeys.size === pack.length;
  const packOmen = omenOf(pack);
  const bestRarity = bestRarityOf(pack);
  const resultCopy = RESULT_COPY[bestRarity];
  const newCount = pack?.filter((entry) => entry.isNew).length ?? 0;
  const flippedEntries = Array.from(flippedKeys)
    .map((key) => pack?.find((entry) => entry.key === key))
    .filter((entry): entry is PackCard => entry !== undefined);
  const focusedCard = pack?.find((entry) => entry.key === focusedKey)?.card ?? null;
  // 1枚めくるたびに大判プレビューへ切り替わると忙しないので、全部めくり切って
  // 結果が出るタイミング（SR/UR演出後の一拍を含む）まではプレビューを出さない
  const showInspector = allFlipped && resultReady && focusedCard !== null;

  // 第2弾コレクションの充実度。開封直後は addToCollection 済みなので、
  // 直前の割合は今回の NEW 枚数を差し引いて逆算する
  const collectionTotal2 = activeCardPool().filter((card) => cardSet(card) === 2).length;
  const ownedCounts2 = allFlipped ? loadCollection() : null;
  const ownedAfter2 = ownedCounts2
    ? activeCardPool().filter((card) => cardSet(card) === 2 && (ownedCounts2[card.id] ?? 0) > 0).length
    : 0;
  const ownedBefore2 = Math.max(0, ownedAfter2 - newCount);
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
    // 戻らない。演出が長引く分だけ結果（進捗バー・大判プレビュー・次のパックへ）の表示を待つ
    if (!allFlipped || revealFocus !== "none") {
      setResultReady(false);
      return;
    }
    resultTimerRef.current = window.setTimeout(() => setResultReady(true), RESULT_REVEAL_DELAY_MS);
    return () => {
      if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
    };
  }, [allFlipped, revealFocus]);

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
        className={`pack-stage phase-${phase}${phase === "torn" && packOmen !== "none" ? ` stage-omen-${packOmen}` : ""}${revealFocus !== "none" ? ` stage-flip-${revealFocus}` : ""}`}
      >
        {revealFocus === "ur" && <PackUrCutIn />}
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
        {revealCallout && (
          <div
            key={revealCallout.token}
            className={`pack-reveal-callout rarity-${revealCallout.rarity}`}
            aria-live="polite"
          >
            <span>{revealCallout.label}</span>
            {revealCallout.isNew && revealCallout.rarity !== "n" && <em>NEW</em>}
          </div>
        )}
        {phase === "opened" && pack && (
          <div className="pack-reveal">
            <span
              className={`pack-reveal-dim ${revealFocus !== "none" ? `dim-${revealFocus}` : ""}`}
              aria-hidden="true"
            />
            <canvas ref={revealCanvasRef} className="pack-reveal-canvas" aria-hidden="true" />
            <div className={`pack-hype-strip rarity-${bestRarity}`}>
              <div className="pack-hype-copy">
                <span>REVEAL CHAIN</span>
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
              <div className={`pack-signal signal-${packOmen}`}>
                <span>{packOmen === "ur" ? "PRISM" : packOmen === "sr" ? "GOLD" : "STANDARD"}</span>
                <strong>SIGNAL</strong>
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
                    <div className={`pack-result-hit rarity-${bestRarity}`}>
                      <span>{resultCopy.kicker}</span>
                      <strong>{resultCopy.title}</strong>
                      <em>SESSION PACK #{String(sessionPackCount).padStart(2, "0")}{newCount > 0 ? ` / NEW ${newCount}` : ""}</em>
                    </div>
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
                      <button type="button" onClick={openNextPack}>次のパックへ</button>
                    </div>
                  </div>
                ) : (
                  <div className="pack-reveal-controls">
                    <p className="pack-reveal-hint">
                      {allFlipped ? "めくり終わりました" : `カードをタップしてめくる（残り ${pack.length - flippedKeys.size} 枚）`}
                    </p>
                    {!allFlipped && (
                      <button type="button" className="pack-flip-all" onClick={flipAll}>
                        クライマックス開示
                      </button>
                    )}
                  </div>
                )}
              </div>
              {showInspector && (
                <CardInspector card={focusedCard} owned={ownedCounts2 ?? undefined} />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
