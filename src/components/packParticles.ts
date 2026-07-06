// パック開封の確定演出用 Canvas 2D パーティクルエンジン。
// 加算合成（lighter）でグロースプライトを重ね、光の蓄積による白飛びを再現する。

export type OmenTheme = "sr" | "sec";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  stretch: number;
  sprite: HTMLCanvasElement;
};

type SpriteSet = {
  core: HTMLCanvasElement;
  sparks: HTMLCanvasElement[];
};

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

function buildSprites(theme: OmenTheme): SpriteSet {
  if (theme === "sec") {
    return {
      core: makeGlowSprite("rgba(255, 255, 255, 0.95)", "rgba(254, 0, 254, 0.4)"),
      sparks: [
        makeGlowSprite("rgba(255, 255, 255, 1)", "rgba(254, 0, 254, 0.55)"),
        makeGlowSprite("rgba(255, 255, 255, 1)", "rgba(0, 240, 255, 0.5)"),
        makeGlowSprite("rgba(255, 231, 254, 1)", "rgba(216, 117, 255, 0.5)"),
      ],
    };
  }
  return {
    core: makeGlowSprite("rgba(255, 250, 235, 0.95)", "rgba(255, 198, 96, 0.42)"),
    sparks: [
      makeGlowSprite("rgba(255, 252, 240, 1)", "rgba(255, 206, 112, 0.55)"),
      makeGlowSprite("rgba(255, 240, 200, 1)", "rgba(245, 158, 11, 0.5)"),
      makeGlowSprite("rgba(255, 248, 225, 1)", "rgba(255, 176, 32, 0.5)"),
    ],
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
) {
  if (alpha <= 0) return;
  ctx.globalAlpha = Math.min(alpha, 1);
  ctx.drawImage(sprite, x - width / 2, y - height / 2, width, height);
}

// origin はキャンバス要素内のローカル座標（パックの開け口）。戻り値は中断関数。
export function runPackBurst(
  canvas: HTMLCanvasElement,
  origin: { x: number; y: number },
  theme: OmenTheme,
  durationMs: number,
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

  const sprites = buildSprites(theme);
  const particles: Particle[] = [];
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

  // 開幕バースト: 開け口から放射状に散る火花
  for (let i = 0; i < 120; i += 1) {
    const angle = -Math.PI / 2 + rand(-1.3, 1.3);
    const speed = rand(90, 640);
    particles.push({
      x: origin.x + rand(-14, 14),
      y: origin.y + rand(-6, 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: rand(0.86, 0.94),
      life: 0,
      maxLife: rand(0.45, 1.1),
      size: rand(2.5, 9),
      stretch: 1,
      sprite: pick(sprites.sparks),
    });
  }

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
    // 全体の明るさ包絡線: 立ち上がり6%、終盤28%でフェードアウト
    const envelope = t < 0.06 ? t / 0.06 : t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1;

    if (t < 0.75) {
      // 中央ビームを構成する縦伸びストリーク
      for (let i = 0; i < 7; i += 1) {
        particles.push({
          x: origin.x + rand(-24, 24),
          y: origin.y + rand(-4, 10),
          vx: rand(-14, 14),
          vy: -rand(520, 1080),
          drag: 1,
          life: 0,
          maxLife: rand(0.35, 0.62),
          size: rand(4, 10),
          stretch: rand(3.2, 6.5),
          sprite: pick(sprites.sparks),
        });
      }
      // ふわっと漂い上がる光の粒
      for (let i = 0; i < 3; i += 1) {
        particles.push({
          x: origin.x + rand(-135, 135),
          y: origin.y + rand(-10, 28),
          vx: rand(-22, 22),
          vy: -rand(50, 175),
          drag: 1,
          life: 0,
          maxLife: rand(0.8, 1.5),
          size: rand(2, 7),
          stretch: 1,
          sprite: pick(sprites.sparks),
        });
      }
    }

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    // 光源コアの脈動（近景と遠景の2枚重ね）と中央ビームの土台
    const pulse = 1 + Math.sin(elapsed / 90) * 0.12;
    drawSprite(ctx, sprites.core, origin.x, origin.y, 200 * pulse, 96 * pulse, envelope * 0.95);
    drawSprite(ctx, sprites.core, origin.x, origin.y, 430 * pulse, 240 * pulse, envelope * 0.35);
    drawSprite(ctx, sprites.core, origin.x, origin.y - 180, 140, 460, envelope * 0.5);

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
      p.vy -= 30 * dt; // 光の浮力: わずかに上向きへ加速
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.maxLife;
      const w = p.size * 4 * (0.6 + 0.4 * k);
      drawSprite(ctx, p.sprite, p.x, p.y, w, w * p.stretch, envelope * k);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (elapsed >= durationMs + 800 || (elapsed >= durationMs && particles.length === 0)) {
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
