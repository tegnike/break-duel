import { ATTRIBUTES, MEMORY_COLOR, type Attribute } from "./game";

// 属性召喚/遺物配置の着地演出用 Canvas 2D パーティクルエンジン。
// パック開封の確定演出（components/packParticles.ts）と同じ手法で、加算合成
// （lighter）のグロースプライトを物理挙動つきの粒として飛ばす。CSS図形（box-shadow等）
// より光の重なりと自然な減衰を表現でき、DOM要素も1枚のcanvasのみで済むため描画も軽い。

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

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  stretch: number;
  rotation: number;
  spin: number;
  sprite: HTMLCanvasElement;
};

type SpriteSet = { core: HTMLCanvasElement; sparks: HTMLCanvasElement[]; flash: HTMLCanvasElement };

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

function makeGlowSprite(inner: string, mid: string): HTMLCanvasElement {
  const size = 128;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.28, mid);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

function buildSprites(theme: SummonBurstTheme, secondaryTheme?: SummonBurstTheme | null): SpriteSet {
  const primary = THEME_COLORS[theme];
  const sparks = [
    makeGlowSprite(rgba(primary.highlight, 1), rgba(primary.highlight, 0.5)),
    makeGlowSprite(rgba(primary.highlight, 1), rgba(primary.base, 0.42)),
    makeGlowSprite(rgba(primary.base, 1), rgba(primary.base, 0.3)),
  ];
  // デュアル属性は副属性色のスプライトも混ぜて、粒がおよそ半々で2色に分かれるようにする
  if (secondaryTheme && secondaryTheme !== theme) {
    const secondary = THEME_COLORS[secondaryTheme];
    sparks.push(
      makeGlowSprite(rgba(secondary.highlight, 1), rgba(secondary.highlight, 0.5)),
      makeGlowSprite(rgba(secondary.highlight, 1), rgba(secondary.base, 0.42)),
      makeGlowSprite(rgba(secondary.base, 1), rgba(secondary.base, 0.3)),
    );
  }
  return {
    core: makeGlowSprite(rgba(primary.highlight, 1), rgba(primary.base, 0.55)),
    // 着火の瞬間だけ光らせる白熱フラッシュ。中心は白、中間は属性ハイライト色
    flash: makeGlowSprite("rgba(255, 255, 255, 1)", rgba(primary.highlight, 0.75)),
    sparks,
  };
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

type Rand = (lo: number, hi: number) => number;
type Pick = <T>(items: T[]) => T;

// 初期バースト: テーマごとに勢いの向きと量を変える
function spawnInitial(theme: SummonBurstTheme, origin: { x: number; y: number }, rand: Rand, pick: Pick, sprites: SpriteSet, particles: Particle[]) {
  const base = (count: number, build: (index: number) => Particle) => {
    for (let i = 0; i < count; i += 1) particles.push(build(i));
  };
  switch (theme) {
    case "fire":
      // 上向きの円錐で吹き上がる火の粉
      base(42, () => {
        const angle = -Math.PI / 2 + rand(-0.85, 0.85);
        const speed = rand(70, 320);
        return {
          x: origin.x + rand(-8, 8),
          y: origin.y + rand(-4, 4),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          drag: rand(0.88, 0.95),
          gravity: -170,
          life: 0,
          maxLife: rand(0.5, 1.05),
          size: rand(2.5, 7),
          stretch: 1,
          rotation: 0,
          spin: 0,
          sprite: pick(sprites.sparks),
        };
      });
      break;
    case "water":
      // 全方位に飛び散る雫。上がった後は重力で落ちる
      base(38, () => {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(60, 260);
        return {
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.55 - rand(20, 80),
          drag: rand(0.9, 0.96),
          gravity: 520,
          life: 0,
          maxLife: rand(0.42, 0.8),
          size: rand(2, 5.5),
          stretch: 1,
          rotation: 0,
          spin: 0,
          sprite: pick(sprites.sparks),
        };
      });
      break;
    case "wind":
      // 左右2方向へ吹き抜ける筋
      for (const side of [-1, 1]) {
        base(20, () => {
          const speed = rand(260, 600);
          return {
            x: origin.x,
            y: origin.y + rand(-16, 16),
            vx: side * speed,
            vy: rand(-36, 36),
            drag: rand(0.82, 0.9),
            gravity: 0,
            life: 0,
            maxLife: rand(0.3, 0.55),
            size: rand(2, 4.2),
            stretch: rand(4, 7.5),
            rotation: 0,
            spin: 0,
            sprite: pick(sprites.sparks),
          };
        });
      }
      break;
    case "earth":
      // 下方向へ砕け散る岩片
      base(36, () => {
        const angle = Math.PI / 2 + rand(-1.05, 1.05);
        const speed = rand(80, 290);
        return {
          x: origin.x + rand(-10, 10),
          y: origin.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.5 - rand(30, 130),
          drag: rand(0.86, 0.93),
          gravity: 660,
          life: 0,
          maxLife: rand(0.38, 0.72),
          size: rand(2.5, 6.2),
          stretch: 1,
          rotation: rand(0, Math.PI * 2),
          spin: rand(-6, 6),
          sprite: pick(sprites.sparks),
        };
      });
      break;
    case "relic":
      // ゆっくり回転しながら漂う煌めき
      base(16, (i) => {
        const angle = (i / 16) * Math.PI * 2;
        const speed = rand(35, 85);
        return {
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - rand(10, 35),
          drag: 0.97,
          gravity: -28,
          life: 0,
          maxLife: rand(0.9, 1.3),
          size: rand(3, 6),
          stretch: 1,
          rotation: angle,
          spin: rand(-1.3, 1.3),
          sprite: pick(sprites.sparks),
        };
      });
      break;
  }
}

// 継続エミッション: テーマごとの余韻（t は 0〜1 の経過率）
function spawnContinuous(theme: SummonBurstTheme, t: number, origin: { x: number; y: number }, rand: Rand, pick: Pick, sprites: SpriteSet, particles: Particle[]) {
  if (t >= 0.68) return;
  if (theme === "fire" && rand(0, 1) < 0.7) {
    particles.push({
      x: origin.x + rand(-28, 28),
      y: origin.y + rand(-6, 10),
      vx: rand(-16, 16),
      vy: -rand(60, 150),
      drag: 1,
      gravity: -90,
      life: 0,
      maxLife: rand(0.5, 0.9),
      size: rand(2, 5),
      stretch: 1,
      rotation: 0,
      spin: 0,
      sprite: pick(sprites.sparks),
    });
  } else if (theme === "water" && rand(0, 1) < 0.45) {
    particles.push({
      x: origin.x + rand(-36, 36),
      y: origin.y + rand(-4, 4),
      vx: rand(-36, 36),
      vy: -rand(70, 160),
      drag: 0.92,
      gravity: 520,
      life: 0,
      maxLife: rand(0.3, 0.5),
      size: rand(1.5, 3.5),
      stretch: 1,
      rotation: 0,
      spin: 0,
      sprite: pick(sprites.sparks),
    });
  } else if (theme === "relic" && rand(0, 1) < 0.32) {
    const angle = rand(0, Math.PI * 2);
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * rand(20, 46),
      vy: Math.sin(angle) * rand(20, 46) - rand(8, 26),
      drag: 0.97,
      gravity: -18,
      life: 0,
      maxLife: rand(0.55, 0.95),
      size: rand(2, 4),
      stretch: 1,
      rotation: angle,
      spin: rand(-1, 1),
      sprite: pick(sprites.sparks),
    });
  }
}

// 一撃の主張（ワンショットのアクセント）: テーマごとの特徴的な形をコア用グロー1枚で表現する
function drawAccent(ctx: CanvasRenderingContext2D, theme: SummonBurstTheme, origin: { x: number; y: number }, elapsed: number, sprites: SpriteSet) {
  const t = Math.min(1, elapsed / 260);
  if (t >= 1) return;
  const alpha = (1 - t) * 0.95;
  switch (theme) {
    case "fire":
      drawSprite(ctx, sprites.core, origin.x, origin.y - 90 * t, 130, 340 + 160 * t, alpha);
      break;
    case "water":
      drawSprite(ctx, sprites.core, origin.x, origin.y, 320 + 220 * t, 100, alpha * 0.9);
      break;
    case "wind":
      drawSprite(ctx, sprites.core, origin.x - 110 * t, origin.y, 280, 60, alpha * 0.85);
      drawSprite(ctx, sprites.core, origin.x + 110 * t, origin.y, 280, 60, alpha * 0.85);
      break;
    case "earth":
      drawSprite(ctx, sprites.core, origin.x, origin.y + 22, 380 + 180 * t, 84, alpha * 0.9);
      break;
    case "relic":
      break;
  }
}

/**
 * origin はキャンバス要素内のローカル座標（着地したカードの中心）。
 * secondaryTheme を渡すとデュアル属性の2色ブレンドになる。戻り値は中断関数。
 */
export function runSummonBurst(
  canvas: HTMLCanvasElement,
  origin: { x: number; y: number },
  theme: SummonBurstTheme,
  durationMs: number,
  secondaryTheme?: SummonBurstTheme | null,
): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const sprites = buildSprites(theme, secondaryTheme);
  const particles: Particle[] = [];
  const rand: Rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick: Pick = (items) => items[Math.floor(Math.random() * items.length)];

  spawnInitial(theme, origin, rand, pick, sprites, particles);

  let running = true;
  let startedAt = -1;
  let last = -1;

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
    const envelope = t < 0.05 ? t / 0.05 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;

    spawnContinuous(theme, t, origin, rand, pick, sprites, particles);

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    // 着火の瞬間だけ強く光る白熱フラッシュ（最初の180ms、急速減衰）
    const flashT = Math.min(1, elapsed / 180);
    if (flashT < 1) {
      const flashAlpha = Math.pow(1 - flashT, 2.2);
      const flashSize = 130 + 260 * flashT;
      drawSprite(ctx, sprites.flash, origin.x, origin.y, flashSize, flashSize, flashAlpha);
    }

    const pulse = 1 + Math.sin(elapsed / 90) * 0.14;
    const coreSize = theme === "relic" ? 150 : 190;
    drawSprite(ctx, sprites.core, origin.x, origin.y, coreSize * pulse, coreSize * pulse, envelope);
    drawSprite(ctx, sprites.core, origin.x, origin.y, coreSize * 2.3 * pulse, coreSize * 2.3 * pulse, envelope * 0.5);
    drawAccent(ctx, theme, origin, elapsed, sprites);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      const dragStep = Math.pow(p.drag, dt * 60);
      p.vx *= dragStep;
      p.vy *= dragStep;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      const k = 1 - p.life / p.maxLife;
      // 粒のサイズと明るさを底上げ（*4→*7、頭打ちはdrawSprite側でMath.min(alpha,1)）
      const w = p.size * 7 * (0.6 + 0.4 * k);
      drawSprite(ctx, p.sprite, p.x, p.y, w, w * p.stretch, envelope * k * 1.7, p.rotation);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (elapsed >= durationMs + 500 || (elapsed >= durationMs && particles.length === 0)) {
      ctx.clearRect(0, 0, width, height);
      running = false;
      window.clearInterval(timer);
    }
  };

  // 非表示タブや rAF 抑制環境でも確実に進むよう setInterval で駆動する
  const timer = window.setInterval(() => frame(performance.now()), 16);

  return () => {
    running = false;
    window.clearInterval(timer);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
  };
}
