import { ATTRIBUTES, MEMORY_COLOR, type Attribute } from "./game";

// 属性召喚/遺物配置の着地演出。「カードの上に何かを出す」のではなく、着地したカードの
// positioned 親にレイアウト座標でぴったり重なる canvas を動的に生成し、
// 「カードという素材そのものが反応する」（燃える/波紋が立つ/木の葉が舞う/崩れる/紋章が浮かぶ）
// ように描く。加算合成のグロースプライトとネイティブ stroke/fill を組み合わせ、
// パック開封演出（components/packParticles.ts）と同じ Canvas 2D の手法を使う。
// アニメーション終了後は canvas ごと DOM から自動で取り除かれる（常駐しない）。

export type SummonBurstTheme = "fire" | "water" | "wind" | "earth" | "relic";

const THEME_COLORS: Record<SummonBurstTheme, { base: string; highlight: string }> = {
  fire: { base: ATTRIBUTES.火.color, highlight: "#ff8a5c" },
  water: { base: ATTRIBUTES.水.color, highlight: "#58a6ff" },
  wind: { base: ATTRIBUTES.風.color, highlight: "#4fd8a8" },
  earth: { base: ATTRIBUTES.土.color, highlight: "#d9a05b" },
  relic: { base: MEMORY_COLOR, highlight: "#ffd166" },
};

const ATTRIBUTE_BURST_THEME: Record<Attribute, SummonBurstTheme> = {
  火: "fire",
  水: "water",
  風: "wind",
  土: "earth",
};

export function attributeBurstTheme(attribute: Attribute): SummonBurstTheme {
  return ATTRIBUTE_BURST_THEME[attribute];
}

export function summonBurstPalette(theme: SummonBurstTheme): { base: string; highlight: string } {
  return THEME_COLORS[theme];
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// innerStop が小さいほど中心の輝点が締まった「点」に、大きいほど滲んだ「霞」になる
function makeGlowSprite(inner: string, mid: string, innerStop = 0.28): HTMLCanvasElement {
  const size = 128;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(innerStop, mid);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
  rotation = 0,
) {
  if (alpha <= 0) return;
  ctx.globalAlpha = Math.min(alpha, 1);
  if (rotation === 0) {
    ctx.drawImage(sprite, x - width / 2, y - height / 2, width, height);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number): Path2D {
  const path = new Path2D();
  path.moveTo(x + r, y);
  path.arcTo(x + w, y, x + w, y + h, r);
  path.arcTo(x + w, y + h, x, y + h, r);
  path.arcTo(x, y + h, x, y, r);
  path.arcTo(x, y, x + w, y, r);
  path.closePath();
  return path;
}

// 硬い輪郭の円弧（ぼかしスプライトではないので、拡大しても輪郭がにじまない）
function drawRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  lineWidth: number,
  color: string,
  alpha: number,
  startAngle = 0,
  endAngle = Math.PI * 2,
) {
  if (alpha <= 0 || radius <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();
}

// 木の葉の形（レンズ状）。size は葉の長さ
function leafPath(size: number): Path2D {
  const path = new Path2D();
  const half = size / 2;
  const bow = size * 0.32;
  path.moveTo(-half, 0);
  path.quadraticCurveTo(0, -bow, half, 0);
  path.quadraticCurveTo(0, bow, -half, 0);
  path.closePath();
  return path;
}

// 不揃いな岩片の形（中心から放射状にランダムな頂点を結ぶ）
function rockPath(rand: (lo: number, hi: number) => number, size: number): Path2D {
  const points = 5 + Math.floor(rand(0, 3));
  const path = new Path2D();
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const r = size * rand(0.6, 1);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

type Rand = (lo: number, hi: number) => number;
type Pick = <T>(items: T[]) => T;

export type CardRect = { left: number; top: number; width: number; height: number };

// 遺物は専用canvas演出を持たない（カード枠が発光するだけの既存の汎用演出で十分という判断）。
// カード素材演出（Canvas）を持つのはこの4属性のみ。
export type CardMaterialTheme = "fire" | "water" | "wind" | "earth";

const CARD_MATERIAL_THEMES: ReadonlySet<SummonBurstTheme> = new Set(["fire", "water", "wind", "earth"]);

export function hasCardMaterialBurst(theme: SummonBurstTheme): theme is CardMaterialTheme {
  return CARD_MATERIAL_THEMES.has(theme);
}

type ThemePadding = { top: number; bottom: number; left: number; right: number };

// 各属性で canvas をどれだけカードより広げるか（カード高さ/幅に対する比率）。
// 「素材が反応する」演出が向かう方向（火・水は上、土は下、風は左右）ぶんだけ余白を持たせる。
const THEME_PADDING: Record<CardMaterialTheme, ThemePadding> = {
  fire: { top: 0.42, bottom: 0, left: 0, right: 0 },
  water: { top: 0.16, bottom: 0, left: 0, right: 0 },
  wind: { top: 0.14, bottom: 0.14, left: 0.4, right: 0.4 },
  earth: { top: 0, bottom: 0.7, left: 0.12, right: 0.12 },
};

const THEME_DURATION_MS: Record<CardMaterialTheme, number> = {
  fire: 900,
  water: 850,
  wind: 1000,
  earth: 1000,
};

// 火・水は光として素材に重なるので加算合成(screen)。風の葉と土の瓦礫は実体のある
// オブジェクトなので通常合成のまま(canvas内部では個々の描画で globalCompositeOperation を使い分ける)。
const THEME_BLEND: Record<CardMaterialTheme, "screen" | "normal"> = {
  fire: "screen",
  water: "screen",
  wind: "normal",
  earth: "normal",
};

/**
 * 着地したカードの真上にぴったり重なる canvas を動的に生成し、属性ごとの
 * 「カード自体が反応する」演出を描く。container はカードの positioned 親
 * （レイアウト座標系の基準）、cardRect はその親基準のカード位置。戻り値は中断関数。
 */
export function runCardMaterialBurst(
  container: HTMLElement,
  cardRect: CardRect,
  theme: CardMaterialTheme,
): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const padding = THEME_PADDING[theme];
  const padTop = Math.round(cardRect.height * padding.top);
  const padBottom = Math.round(cardRect.height * padding.bottom);
  const padLeft = Math.round(cardRect.width * padding.left);
  const padRight = Math.round(cardRect.width * padding.right);
  const width = cardRect.width + padLeft + padRight;
  const height = cardRect.height + padTop + padBottom;

  const canvas = document.createElement("canvas");
  canvas.className = "card-material-canvas";
  const blend = THEME_BLEND[theme];
  canvas.style.cssText = `position:absolute; left:${cardRect.left - padLeft}px; top:${cardRect.top - padTop}px; width:${width}px; height:${height}px; z-index:7; pointer-events:none;${blend === "screen" ? " mix-blend-mode:screen;" : ""}`;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cardBox = { x: padLeft, y: padTop, w: cardRect.width, h: cardRect.height };
  const durationMs = THEME_DURATION_MS[theme];
  const rand: Rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick: Pick = (items) => items[Math.floor(Math.random() * items.length)];

  const engine = createThemeEngine(theme, cardBox, rand, pick);

  let running = true;
  let startedAt = -1;
  let last = -1;
  let doneAt = -1;

  const frame = (now: number) => {
    if (!running) return;
    if (startedAt < 0) {
      startedAt = now;
      last = now;
    }
    const elapsed = now - startedAt;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = elapsed / durationMs;

    ctx.clearRect(0, 0, width, height);
    const stillActive = engine.frame(ctx, elapsed, t, dt);

    if (t >= 1 && !stillActive && doneAt < 0) doneAt = elapsed;
    if (doneAt >= 0 && elapsed - doneAt > 350) {
      running = false;
      window.clearInterval(timer);
      canvas.remove();
    }
  };

  // 非表示タブや rAF 抑制環境でも確実に進むよう setInterval で駆動する
  const timer = window.setInterval(() => frame(performance.now()), 16);

  return () => {
    if (!running) return;
    running = false;
    window.clearInterval(timer);
    canvas.remove();
  };
}

type CardBox = { x: number; y: number; w: number; h: number };
type ThemeEngine = { frame: (ctx: CanvasRenderingContext2D, elapsed: number, t: number, dt: number) => boolean };

function createThemeEngine(theme: CardMaterialTheme, cardBox: CardBox, rand: Rand, pick: Pick): ThemeEngine {
  switch (theme) {
    case "fire":
      return createFireEngine(cardBox, rand, pick);
    case "water":
      return createWaterEngine(cardBox, rand, pick);
    case "wind":
      return createWindEngine(cardBox, rand);
    case "earth":
      return createEarthEngine(cardBox, rand);
  }
}

// --- 火: 縁から燃え上がり、火の粉がカード上へ立ち上る ---
function createFireEngine(cardBox: CardBox, rand: Rand, pick: Pick): ThemeEngine {
  const palette = THEME_COLORS.fire;
  const clipPath = roundRectPath(cardBox.x, cardBox.y, cardBox.w, cardBox.h, 8);
  const emberSprites = [
    makeGlowSprite("rgba(255, 255, 255, 1)", rgba(palette.highlight, 0.9), 0.12),
    makeGlowSprite(rgba(palette.highlight, 1), rgba(palette.base, 0.5), 0.14),
  ];
  const flame = makeGlowSprite(rgba(palette.highlight, 1), rgba(palette.base, 0.55), 0.2);
  // 1点からの爆発ではなく、縁に沿った複数の発生源が面で燃え上がるようにする
  const flameLicks = Array.from({ length: 6 }, (_, i) => ({
    x: cardBox.x + ((i + 0.5) / 6) * cardBox.w,
    phase: rand(0, Math.PI * 2),
    speed: rand(3.2, 5.2),
    reach: rand(0.55, 0.95),
  }));

  type Ember = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; rotation: number };
  const embers: Ember[] = [];
  const spawnEmber = () => {
    embers.push({
      x: cardBox.x + rand(4, cardBox.w - 4),
      y: cardBox.y + rand(0, cardBox.h * 0.3),
      vx: rand(-14, 14),
      vy: -rand(50, 120),
      life: 0,
      maxLife: rand(0.5, 0.95),
      size: rand(1.6, 3.4),
      rotation: rand(0, Math.PI * 2),
    });
  };
  for (let i = 0; i < 10; i += 1) spawnEmber();

  return {
    frame(ctx, elapsed, t, dt) {
      const envelope = t < 0.09 ? t / 0.09 : t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.45) : 1;
      if (t < 0.6 && Math.random() < 0.55) spawnEmber();

      ctx.globalCompositeOperation = "lighter";
      ctx.save();
      ctx.clip(clipPath);
      const wash = ctx.createLinearGradient(0, cardBox.y + cardBox.h, 0, cardBox.y);
      wash.addColorStop(0, rgba(palette.highlight, 0.85 * envelope));
      wash.addColorStop(0.45, rgba(palette.base, 0.5 * envelope));
      wash.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = wash;
      ctx.fillRect(cardBox.x, cardBox.y, cardBox.w, cardBox.h);
      for (const lick of flameLicks) {
        const flicker = 0.5 + 0.5 * Math.sin((elapsed / 1000) * lick.speed + lick.phase);
        const h = cardBox.h * lick.reach * (0.55 + 0.45 * flicker) * envelope;
        drawSprite(ctx, flame, lick.x, cardBox.y + cardBox.h - h * 0.5, cardBox.w * 0.42, h, 0.8 * envelope);
      }
      ctx.restore();

      for (let i = embers.length - 1; i >= 0; i -= 1) {
        const e = embers[i];
        e.life += dt;
        if (e.life >= e.maxLife) {
          embers.splice(i, 1);
          continue;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy -= 40 * dt;
        const k = 1 - e.life / e.maxLife;
        const w = e.size * 5 * (0.6 + 0.4 * k);
        drawSprite(ctx, pick(emberSprites), e.x, e.y, w, w, envelope * k * 1.6, e.rotation);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      return embers.length > 0;
    },
  };
}

// --- 水: 中心から波紋が広がり、飛沫が跳ねる ---
function createWaterEngine(cardBox: CardBox, rand: Rand, pick: Pick): ThemeEngine {
  const palette = THEME_COLORS.water;
  const clipPath = roundRectPath(cardBox.x, cardBox.y, cardBox.w, cardBox.h, 8);
  const cx = cardBox.x + cardBox.w / 2;
  const cy = cardBox.y + cardBox.h / 2;
  const maxRadius = Math.hypot(cardBox.w, cardBox.h) * 0.62;
  const rings = [0, 90, 190].map((delayMs) => ({ delayMs, launched: false }));
  const dropletSprite = makeGlowSprite("rgba(255, 255, 255, 1)", rgba(palette.highlight, 0.85), 0.14);

  type Droplet = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number };
  const droplets: Droplet[] = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = rand(-Math.PI, 0);
    droplets.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * rand(30, 90),
      vy: -rand(60, 140),
      life: 0,
      maxLife: rand(0.35, 0.55),
      size: rand(1.6, 3),
    });
  }

  return {
    frame(ctx, elapsed, _t, dt) {
      ctx.globalCompositeOperation = "lighter";
      ctx.save();
      ctx.clip(clipPath);

      // 光が水面をなでる一度きりの斜めのきらめき
      const sheenT = Math.min(1, elapsed / 500);
      if (sheenT < 1) {
        const sheenX = cardBox.x - cardBox.w * 0.4 + sheenT * cardBox.w * 1.8;
        const sheen = ctx.createLinearGradient(sheenX - 26, 0, sheenX + 26, 0);
        sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
        sheen.addColorStop(0.5, rgba("#ffffff", 0.35 * (1 - sheenT)));
        sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = sheen;
        ctx.fillRect(cardBox.x, cardBox.y, cardBox.w, cardBox.h);
      }

      // 中心から広がる波紋（複数を時間差で発射。芯の強い輪＋外側にじむ輪の二重描きではっきり見せる）
      let anyRingActive = false;
      for (const ring of rings) {
        if (elapsed < ring.delayMs) {
          anyRingActive = true;
          continue;
        }
        const ringElapsed = elapsed - ring.delayMs;
        const ringT = Math.min(1, ringElapsed / 760);
        if (ringT >= 1) continue;
        anyRingActive = true;
        const eased = 1 - Math.pow(1 - ringT, 2);
        const radius = 6 + eased * maxRadius;
        const alpha = Math.pow(1 - ringT, 1.15);
        drawRing(ctx, cx, cy, radius, 6 * (1 - ringT * 0.35), rgba(palette.highlight, 1), alpha * 0.32);
        drawRing(ctx, cx, cy, radius, 2.6 * (1 - ringT * 0.4), "rgba(255, 255, 255, 1)", alpha * 0.95);
      }

      ctx.restore();

      // 中心の跳ねる飛沫（クリップ外に少しだけ逃がす）
      let anyDroplet = false;
      for (let i = droplets.length - 1; i >= 0; i -= 1) {
        const d = droplets[i];
        d.life += dt;
        if (d.life >= d.maxLife) {
          droplets.splice(i, 1);
          continue;
        }
        anyDroplet = true;
        d.vy += 420 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const k = 1 - d.life / d.maxLife;
        const w = d.size * 5 * (0.6 + 0.4 * k);
        drawSprite(ctx, dropletSprite, d.x, d.y, w, w, k * 1.3);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      return anyRingActive || anyDroplet;
    },
  };
}

// --- 風: 木の葉が回転しながらカードの前を舞う ---
function createWindEngine(cardBox: CardBox, rand: Rand): ThemeEngine {
  const palette = THEME_COLORS.wind;
  const colorA = palette.highlight;
  const colorB = palette.base;

  type Leaf = {
    startX: number; startY: number; endX: number; endY: number;
    delay: number; duration: number; rotSpeed: number; rotStart: number;
    size: number; bob: number; bobPhase: number; color: string;
  };
  const leaves: Leaf[] = Array.from({ length: 11 }, () => {
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? cardBox.x - cardBox.w * 0.32 : cardBox.x + cardBox.w * 1.32;
    const endX = fromLeft ? cardBox.x + cardBox.w * 1.32 : cardBox.x - cardBox.w * 0.32;
    const y = cardBox.y + rand(-cardBox.h * 0.1, cardBox.h * 1.1);
    return {
      startX,
      startY: y,
      endX,
      endY: y + rand(-cardBox.h * 0.25, cardBox.h * 0.35),
      delay: rand(0, 0.55),
      duration: rand(0.55, 0.85),
      rotSpeed: rand(-9, 9) || 4,
      rotStart: rand(0, Math.PI * 2),
      size: rand(9, 16),
      bob: rand(8, 18),
      bobPhase: rand(0, Math.PI * 2),
      color: Math.random() < 0.6 ? colorA : colorB,
    };
  });

  return {
    frame(ctx, elapsed) {
      ctx.globalCompositeOperation = "source-over";
      let anyActive = false;
      for (const leaf of leaves) {
        const localT = (elapsed / 1000 - leaf.delay) / leaf.duration;
        if (localT < 0 || localT > 1) continue;
        anyActive = true;
        const eased = localT;
        const x = leaf.startX + (leaf.endX - leaf.startX) * eased;
        const y = leaf.startY + (leaf.endY - leaf.startY) * eased + Math.sin(eased * Math.PI * 2 + leaf.bobPhase) * leaf.bob;
        const fade = Math.min(1, localT * 5) * Math.min(1, (1 - localT) * 5);
        const rotation = leaf.rotStart + elapsed / 1000 * leaf.rotSpeed;

        ctx.save();
        ctx.globalAlpha = 0.88 * fade;
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.fillStyle = leaf.color;
        ctx.fill(leafPath(leaf.size));
        ctx.strokeStyle = "rgba(8, 20, 16, 0.35)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-leaf.size / 2, 0);
        ctx.lineTo(leaf.size / 2, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      return anyActive;
    },
  };
}

// --- 土: カード表面にひびが走り、岩片が下へこぼれ落ちる ---
function createEarthEngine(cardBox: CardBox, rand: Rand): ThemeEngine {
  const palette = THEME_COLORS.earth;
  const clipPath = roundRectPath(cardBox.x, cardBox.y, cardBox.w, cardBox.h, 8);
  const cx = cardBox.x + cardBox.w / 2;
  const cy = cardBox.y + cardBox.h / 2;

  const cracks = Array.from({ length: 4 }, () => {
    const points: { x: number; y: number }[] = [{ x: cx + rand(-10, 10), y: cy + rand(-14, 14) }];
    let angle = rand(0, Math.PI * 2);
    for (let i = 0; i < 3; i += 1) {
      angle += rand(-0.9, 0.9);
      const last = points[points.length - 1];
      points.push({ x: last.x + Math.cos(angle) * rand(10, 20), y: last.y + Math.sin(angle) * rand(8, 16) });
    }
    return points;
  });

  type Rock = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; rotation: number; spin: number; shape: Path2D };
  const rocks: Rock[] = [];
  // 大小さまざまな岩片を混ぜる（大きい塊ほどゆっくり・重たく、小さい瓦礫は速く散る）
  const spawnRock = (size: number) => {
    const weight = size / 16;
    rocks.push({
      x: cardBox.x + rand(cardBox.w * 0.06, cardBox.w * 0.94),
      y: cardBox.y + rand(cardBox.h * 0.12, cardBox.h * 0.85),
      vx: rand(-34, 34) * (1 - weight * 0.4),
      vy: rand(-24, 34),
      life: 0,
      maxLife: rand(0.65, 1.1) + weight * 0.35,
      size,
      rotation: rand(0, Math.PI * 2),
      spin: rand(-4.5, 4.5) * (1 - weight * 0.5),
      shape: rockPath(rand, size),
    });
  };
  for (let i = 0; i < 5; i += 1) spawnRock(rand(10, 17)); // 大きな岩塊
  for (let i = 0; i < 8; i += 1) spawnRock(rand(5.5, 9)); // 中くらいの破片
  for (let i = 0; i < 16; i += 1) spawnRock(rand(1.8, 4)); // 細かい瓦礫

  return {
    frame(ctx, elapsed, _t, dt) {
      // ひびの閃光（最初の160msだけ）
      const crackT = Math.min(1, elapsed / 160);
      if (crackT < 1) {
        ctx.save();
        ctx.clip(clipPath);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - crackT) * 0.9;
        ctx.strokeStyle = rgba(palette.highlight, 1);
        ctx.lineWidth = 1.4;
        for (const crack of cracks) {
          ctx.beginPath();
          ctx.moveTo(crack[0].x, crack[0].y);
          for (const p of crack.slice(1)) ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // 崩れ落ちる岩片（クリップなし、カードの下へこぼす）
      ctx.globalCompositeOperation = "source-over";
      let anyRock = false;
      for (let i = rocks.length - 1; i >= 0; i -= 1) {
        const r = rocks[i];
        r.life += dt;
        if (r.life >= r.maxLife) {
          rocks.splice(i, 1);
          continue;
        }
        anyRock = true;
        r.vy += 340 * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.rotation += r.spin * dt;
        const k = 1 - r.life / r.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 2.2);
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rotation);
        ctx.fillStyle = rgba(palette.base, 1);
        ctx.fill(r.shape);
        ctx.fillStyle = rgba(palette.highlight, 0.4);
        ctx.beginPath();
        ctx.arc(-r.size * 0.25, -r.size * 0.25, r.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      return anyRock || crackT < 1;
    },
  };
}

