// パック開封の確定演出用 Canvas 2D パーティクルエンジン。
// 加算合成（lighter）でグロースプライトを重ね、光の蓄積による白飛びを再現する。

export type OmenTheme = "sr" | "ur";

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
  if (theme === "ur") {
    // UR は虹（プリズム）: 白熱コアに多色の火花を混ぜて「最高レア」を一目で伝える
    return {
      core: makeGlowSprite("rgba(255, 255, 255, 0.98)", "rgba(199, 210, 254, 0.44)"),
      sparks: [
        makeGlowSprite("rgba(255, 255, 255, 1)", "rgba(255, 255, 255, 0.5)"),
        makeGlowSprite("rgba(255, 190, 214, 1)", "rgba(244, 114, 182, 0.5)"),
        makeGlowSprite("rgba(186, 230, 253, 1)", "rgba(56, 189, 248, 0.5)"),
        makeGlowSprite("rgba(221, 214, 254, 1)", "rgba(139, 92, 246, 0.5)"),
        makeGlowSprite("rgba(187, 247, 208, 1)", "rgba(74, 222, 128, 0.46)"),
        makeGlowSprite("rgba(254, 240, 138, 1)", "rgba(250, 204, 21, 0.48)"),
      ],
    };
  }
  // SR は金: 温かい金色の火花で「当たり」を示す
  return {
    core: makeGlowSprite("rgba(255, 247, 222, 0.96)", "rgba(250, 204, 21, 0.36)"),
    sparks: [
      makeGlowSprite("rgba(255, 251, 235, 1)", "rgba(253, 224, 71, 0.48)"),
      makeGlowSprite("rgba(254, 240, 170, 1)", "rgba(251, 191, 36, 0.44)"),
      makeGlowSprite("rgba(253, 230, 138, 1)", "rgba(245, 158, 11, 0.4)"),
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// UR カットイン用の虹色ルーンティック。光条・ホロ箔・破片と同じパレットで統一する
const UR_TICK_COLORS = [
  "rgba(255, 255, 255, 0.95)",
  "rgba(255, 153, 204, 0.9)",
  "rgba(153, 221, 255, 0.9)",
  "rgba(216, 180, 254, 0.9)",
  "rgba(163, 255, 191, 0.85)",
  "rgba(255, 214, 130, 0.9)",
];

// UR 確定の全画面カットイン用バースト。DOM/CSS の手描き形状ではなく、
// runPackBurst と同じ加算合成グロースプライト＋物理演算パーティクルで
// 「魔法陣が起動する」同心円・ルーンティック・水晶片の飛散を描画する。
// setInterval 駆動のため、タブのバックグラウンド化等で CSS animation の
// タイムラインが進まなくなる不具合の影響も受けない。
export function runUrCutinBurst(
  canvas: HTMLCanvasElement,
  center: { x: number; y: number },
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

  const sprites = buildSprites("ur");
  const particles: Particle[] = [];
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

  // 紋章から飛び散る水晶片
  for (let i = 0; i < 170; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(140, 760);
    particles.push({
      x: center.x,
      y: center.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: rand(0.88, 0.95),
      life: 0,
      maxLife: rand(0.6, 1.4),
      size: rand(3, 10),
      stretch: rand(1, 2.4),
      sprite: pick(sprites.sparks),
    });
  }

  const RING_COUNT = 3;
  const TICK_COUNT = 28;
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

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    // 中心コアの脈動
    const pulse = 1 + Math.sin(elapsed / 100) * 0.1;
    drawSprite(ctx, sprites.core, center.x, center.y, 260 * pulse, 160 * pulse, envelope * 0.8);

    // 起動時に広がる同心円のショックウェーブ
    for (let r = 0; r < RING_COUNT; r += 1) {
      const ringT = clamp01(t * 1.4 - r * 0.16);
      if (ringT <= 0 || ringT >= 1) continue;
      const radius = 20 + ringT * 360;
      const ringAlpha = (1 - ringT) * 0.85 * envelope;
      if (ringAlpha <= 0) continue;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = "rgba(190, 130, 255, 0.85)";
      ctx.shadowBlur = 18;
      ctx.stroke();
    }

    // 回転するルーンティック（紋章の縁取り）
    const spin = elapsed / 3600;
    const tickRadius = 150 + Math.sin(elapsed / 500) * 4;
    ctx.lineCap = "round";
    for (let i = 0; i < TICK_COUNT; i += 1) {
      const angle = spin + (i / TICK_COUNT) * Math.PI * 2;
      const isMajor = i % 4 === 0;
      const len = isMajor ? 20 : 10;
      const inner = tickRadius - len / 2;
      const outer = tickRadius + len / 2;
      const x1 = center.x + Math.cos(angle) * inner;
      const y1 = center.y + Math.sin(angle) * inner;
      const x2 = center.x + Math.cos(angle) * outer;
      const y2 = center.y + Math.sin(angle) * outer;
      const color = UR_TICK_COLORS[i % UR_TICK_COLORS.length];
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = isMajor ? 2.6 : 1.6;
      ctx.shadowColor = color;
      ctx.shadowBlur = isMajor ? 10 : 5;
      ctx.globalAlpha = envelope * (isMajor ? 0.95 : 0.55);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";

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
      p.vy -= 40 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.maxLife;
      const w = p.size * 4 * (0.6 + 0.4 * k);
      drawSprite(ctx, p.sprite, p.x, p.y, w, w * p.stretch, envelope * k);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (elapsed >= durationMs + 500 || (elapsed >= durationMs && particles.length === 0)) {
      ctx.clearRect(0, 0, width, height);
      running = false;
      window.clearInterval(timer);
    }
  };

  const timer = window.setInterval(() => frame(performance.now()), 16);

  return () => {
    running = false;
    window.clearInterval(timer);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
  };
}
