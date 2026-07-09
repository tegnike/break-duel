// パック開封の確定演出用 Canvas 2D エンジン。
// SR は金色の発光雲、UR はプリズム状の光と結晶片で構成する。
// 直線・真円・ワイヤーフレームに頼らず、生成テクスチャの重なりで密度を作る。

export type OmenTheme = "sr" | "ur";

type GlowParticle = {
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

type ShardParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  life: number;
  maxLife: number;
  length: number;
  width: number;
  angle: number;
  spin: number;
  color: string;
};

type SpriteSet = {
  core: HTMLCanvasElement;
  sparks: HTMLCanvasElement[];
  clouds: HTMLCanvasElement[];
};

const SR_COLORS = ["#fff3ad", "#ffd34e", "#ff9f1c"];
const UR_COLORS = ["#ffffff", "#67e8f9", "#60a5fa", "#c084fc", "#f472b6", "#facc15"];
type Rgb = readonly [number, number, number];
const SR_CLOUD_COLORS: readonly Rgb[] = [[255, 245, 194], [251, 191, 36], [234, 88, 12]];
const UR_CLOUD_COLORS: readonly Rgb[] = [[165, 243, 252], [96, 165, 250], [192, 132, 252], [244, 114, 182]];

function makeGlowSprite(inner: string, mid: string): HTMLCanvasElement {
  // 常に小さくぼかして描く素材なので64pxで十分。粒子ごとの転送量を抑える。
  const size = 64;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.22, mid);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// 画像生成パーツの代わりに、起動時に一度だけ作る半透明の発光雲テクスチャ。
// 複数の楕円グラデーションを重ねることで、直線や真円が見えない有機的な光にする。
function makeEnergyCloudSprite(colors: readonly Rgb[], seed: number): HTMLCanvasElement {
  // 雲自体がぼけた素材なので、高解像度にしても見た目はほぼ変わらない。
  // 元画像を小さくして、全画面へ拡大合成するときのテクスチャ転送量を抑える。
  const size = 256;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d")!;
  const random = seededRandom(seed);
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < 18; i += 1) {
    const color = colors[Math.floor(random() * colors.length)];
    const [r, g, b] = color;
    const x = size * (0.26 + random() * 0.48);
    const y = size * (0.3 + random() * 0.4);
    const radius = size * (0.08 + random() * 0.19);
    const stretchX = 0.7 + random() * 1.8;
    const stretchY = 0.45 + random() * 1.05;
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.12 + random() * 0.12})`);
    gradient.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, ${0.045 + random() * 0.06})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((random() - 0.5) * Math.PI);
    ctx.scale(stretchX, stretchY);
    ctx.fillStyle = gradient;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }
  return sprite;
}

const spriteCache: Partial<Record<OmenTheme, SpriteSet>> = {};

function buildSprites(theme: OmenTheme): SpriteSet {
  const cached = spriteCache[theme];
  if (cached) return cached;
  const sprites: SpriteSet = theme === "ur"
    ? {
        // 白飛びを抑え、青紫のエッジが残るコア
        core: makeGlowSprite("rgba(255, 255, 255, 0.86)", "rgba(103, 232, 249, 0.28)"),
        sparks: [
          makeGlowSprite("rgba(255, 255, 255, 0.96)", "rgba(255, 255, 255, 0.34)"),
          makeGlowSprite("rgba(165, 243, 252, 0.96)", "rgba(34, 211, 238, 0.42)"),
          makeGlowSprite("rgba(191, 219, 254, 0.96)", "rgba(59, 130, 246, 0.4)"),
          makeGlowSprite("rgba(233, 213, 255, 0.96)", "rgba(168, 85, 247, 0.4)"),
          makeGlowSprite("rgba(251, 207, 232, 0.96)", "rgba(236, 72, 153, 0.38)"),
        ],
        clouds: [
          makeEnergyCloudSprite(UR_CLOUD_COLORS, 0x2a7f31),
          makeEnergyCloudSprite(UR_CLOUD_COLORS, 0x96d4c3),
          makeEnergyCloudSprite(UR_CLOUD_COLORS, 0xf173ae),
        ],
      }
    : {
        // 黄一色の面光源ではなく、琥珀色の芯を持つ金属的な金光
        core: makeGlowSprite("rgba(255, 249, 214, 0.9)", "rgba(245, 158, 11, 0.3)"),
        sparks: [
          makeGlowSprite("rgba(255, 251, 235, 0.96)", "rgba(253, 224, 71, 0.4)"),
          makeGlowSprite("rgba(254, 240, 138, 0.96)", "rgba(245, 158, 11, 0.38)"),
          makeGlowSprite("rgba(253, 186, 116, 0.92)", "rgba(234, 88, 12, 0.3)"),
        ],
        clouds: [
          makeEnergyCloudSprite(SR_CLOUD_COLORS, 0x51a921),
          makeEnergyCloudSprite(SR_CLOUD_COLORS, 0xb48317),
          makeEnergyCloudSprite(SR_CLOUD_COLORS, 0xe0912b),
        ],
      };
  spriteCache[theme] = sprites;
  return sprites;
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

function drawRotatedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
  rotation: number,
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = Math.min(alpha, 1);
  ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawShard(ctx: CanvasRenderingContext2D, shard: ShardParticle, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(shard.x, shard.y);
  ctx.rotate(shard.angle);
  ctx.globalAlpha = Math.min(alpha, 1);
  ctx.fillStyle = shard.color;
  // 破片ごとの shadowBlur は再ラスタライズ負荷が大きい。
  // 呼び出し側の lighter 合成で輝度を確保する。
  ctx.beginPath();
  ctx.moveTo(-shard.length * 0.5, 0);
  ctx.lineTo(0, -shard.width * 0.5);
  ctx.lineTo(shard.length * 0.5, 0);
  ctx.lineTo(0, shard.width * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEnergyBloom(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  theme: OmenTheme,
  sprites: SpriteSet,
  envelope: number,
  elapsed: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const baseWidth = theme === "sr" ? 330 : 410;
  const baseHeight = theme === "sr" ? 220 : 300;
  const pulse = 1 + Math.sin(elapsed / 180) * 0.055;
  drawRotatedSprite(ctx, sprites.clouds[0], origin.x, origin.y - 12, baseWidth * pulse, baseHeight * pulse, envelope * 0.72, elapsed / 5200);
  drawRotatedSprite(ctx, sprites.clouds[1], origin.x - 16, origin.y + 8, baseWidth * 0.82, baseHeight * 1.12, envelope * 0.52, -elapsed / 6400 + 0.7);
  ctx.restore();
}

// origin はキャンバス要素内のローカル座標（パックの開け口、またはカード中心）。
export function runPackBurst(
  canvas: HTMLCanvasElement,
  origin: { x: number; y: number },
  theme: OmenTheme,
  durationMs: number,
): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return () => {};

  // 発光・ぼかし中心の演出なので高DPI化しても差が小さい。
  // DPR 2時に4倍あった描画ピクセルをCSSピクセル等倍へ固定する。
  const dpr = Math.min(window.devicePixelRatio || 1, 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const sprites = buildSprites(theme);
  const glows: GlowParticle[] = [];
  const shards: ShardParticle[] = [];
  const palette = theme === "sr" ? SR_COLORS : UR_COLORS;
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

  const sparkCount = theme === "sr" ? 48 : 64;
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = -Math.PI / 2 + rand(-1.45, 1.45);
    const speed = rand(110, theme === "sr" ? 520 : 720);
    glows.push({
      x: origin.x + rand(-12, 12),
      y: origin.y + rand(-6, 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: rand(0.86, 0.94),
      life: 0,
      maxLife: rand(0.38, 0.95),
      size: rand(2, theme === "sr" ? 6.5 : 8),
      stretch: rand(1, theme === "sr" ? 2.4 : 3.6),
      sprite: pick(sprites.sparks),
    });
  }

  const shardCount = theme === "sr" ? 14 : 26;
  for (let i = 0; i < shardCount; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(100, theme === "sr" ? 430 : 650);
    shards.push({
      x: origin.x + rand(-8, 8),
      y: origin.y + rand(-6, 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: rand(0.88, 0.95),
      life: 0,
      maxLife: rand(0.45, 1.15),
      length: rand(8, theme === "sr" ? 24 : 34),
      width: rand(2, theme === "sr" ? 6 : 8),
      angle: rand(0, Math.PI * 2),
      spin: rand(-7, 7),
      color: pick(palette),
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
    const envelope = t < 0.055 ? t / 0.055 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;

    if (t < 0.62) {
      const emission = theme === "sr" ? 1 : 2;
      for (let i = 0; i < emission; i += 1) {
        glows.push({
          x: origin.x + rand(-28, 28),
          y: origin.y + rand(-2, 14),
          vx: rand(-35, 35),
          vy: -rand(180, theme === "sr" ? 540 : 760),
          drag: 0.98,
          life: 0,
          maxLife: rand(0.3, 0.72),
          size: rand(2, 6),
          stretch: rand(2.5, 5),
          sprite: pick(sprites.sparks),
        });
      }
    }

    ctx.clearRect(0, 0, width, height);
    drawEnergyBloom(ctx, origin, theme, sprites, envelope, elapsed);
    ctx.globalCompositeOperation = "lighter";

    const pulse = 1 + Math.sin(elapsed / 95) * 0.08;
    const coreWidth = theme === "sr" ? 160 : 184;
    drawSprite(ctx, sprites.core, origin.x, origin.y, coreWidth * pulse, 72 * pulse, envelope * 0.72);
    drawSprite(ctx, sprites.core, origin.x, origin.y, coreWidth * 1.75 * pulse, 126 * pulse, envelope * 0.2);

    for (let i = glows.length - 1; i >= 0; i -= 1) {
      const p = glows[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        glows.splice(i, 1);
        continue;
      }
      const dragStep = Math.pow(p.drag, dt * 60);
      p.vx *= dragStep;
      p.vy *= dragStep;
      p.vy -= 25 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.maxLife;
      const w = p.size * 3.4 * (0.62 + 0.38 * k);
      drawSprite(ctx, p.sprite, p.x, p.y, w, w * p.stretch, envelope * k * 0.9);
    }

    for (let i = shards.length - 1; i >= 0; i -= 1) {
      const shard = shards[i];
      shard.life += dt;
      if (shard.life >= shard.maxLife) {
        shards.splice(i, 1);
        continue;
      }
      const dragStep = Math.pow(shard.drag, dt * 60);
      shard.vx *= dragStep;
      shard.vy *= dragStep;
      shard.vy += 26 * dt;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.angle += shard.spin * dt;
      const k = 1 - shard.life / shard.maxLife;
      drawShard(ctx, shard, envelope * k * (theme === "sr" ? 0.62 : 0.82));
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (elapsed >= durationMs + 650 || (elapsed >= durationMs && glows.length === 0 && shards.length === 0)) {
      ctx.clearRect(0, 0, width, height);
      running = false;
      window.clearInterval(timer);
    }
  };

  // パック・カード背面の短い発光は30fpsで十分滑らか。
  const timer = window.setInterval(() => frame(performance.now()), 1000 / 30);
  return () => {
    running = false;
    window.clearInterval(timer);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
  };
}

// UR 確定カットイン。発光雲が膨張し、中心からプリズム片が弾ける演出。
export function runUrCutinBurst(
  canvas: HTMLCanvasElement,
  center: { x: number; y: number },
  durationMs: number,
): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return () => {};

  // 全画面の発光雲は低解像度をCSSで拡大しても視覚差が小さい。
  // 0.75倍なら等倍からさらに約44%ピクセルを削減できる。
  const dpr = 0.75;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const sprites = buildSprites("ur");
  const glows: GlowParticle[] = [];
  const shards: ShardParticle[] = [];
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

  for (let i = 0; i < 42; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(120, 680);
    glows.push({
      x: center.x,
      y: center.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: rand(0.88, 0.95),
      life: 0,
      maxLife: rand(0.45, 1.1),
      size: rand(2, 7),
      stretch: rand(1.5, 4),
      sprite: pick(sprites.sparks),
    });
  }
  for (let i = 0; i < 26; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(180, 820);
    shards.push({
      x: center.x,
      y: center.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: rand(0.88, 0.95),
      life: 0,
      maxLife: rand(0.55, 1.35),
      length: rand(10, 42),
      width: rand(2.5, 9),
      angle: rand(0, Math.PI * 2),
      spin: rand(-8, 8),
      color: pick(UR_COLORS),
    });
  }

  let running = true;
  let startedAt = -1;
  let last = -1;
  const vignette = ctx.createRadialGradient(
    center.x,
    center.y,
    40,
    center.x,
    center.y,
    Math.max(width, height) * 0.62,
  );
  vignette.addColorStop(0, "rgba(15, 43, 64, 0.2)");
  vignette.addColorStop(0.5, "rgba(12, 18, 40, 0.28)");
  vignette.addColorStop(1, "rgba(0, 0, 8, 0.72)");

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
    const envelope = t < 0.045 ? t / 0.045 : t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(2, 6, 18, ${0.76 * envelope})`;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = envelope;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "lighter";
    const pulse = 1 + Math.sin(elapsed / 90) * 0.055;
    for (let wave = 0; wave < 1; wave += 1) {
      const waveT = Math.min(1, Math.max(0, (t - wave * 0.08) / 0.58));
      if (waveT <= 0 || waveT >= 1) continue;
      const waveWidth = 260 + waveT * Math.min(720, Math.max(width, height) * 0.72);
      const waveHeight = 190 + waveT * Math.min(520, Math.max(width, height) * 0.52);
      drawRotatedSprite(
        ctx,
        sprites.clouds[wave],
        center.x,
        center.y,
        waveWidth,
        waveHeight,
        (1 - waveT) * envelope * 0.38,
        elapsed / (5400 + wave * 900) + wave * 0.8,
      );
    }

    drawRotatedSprite(ctx, sprites.clouds[0], center.x, center.y, 620 * pulse, 440 * pulse, envelope * 0.58, elapsed / 6200);
    drawRotatedSprite(ctx, sprites.clouds[1], center.x - 34, center.y + 18, 480 * pulse, 560 * pulse, envelope * 0.42, -elapsed / 7600 + 0.8);
    drawSprite(ctx, sprites.core, center.x, center.y, 190 * pulse, 100 * pulse, envelope * 0.44);

    for (let i = glows.length - 1; i >= 0; i -= 1) {
      const p = glows[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        glows.splice(i, 1);
        continue;
      }
      const dragStep = Math.pow(p.drag, dt * 60);
      p.vx *= dragStep;
      p.vy *= dragStep;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.maxLife;
      const w = p.size * 3.2 * (0.6 + 0.4 * k);
      drawSprite(ctx, p.sprite, p.x, p.y, w, w * p.stretch, envelope * k * 0.72);
    }

    for (let i = shards.length - 1; i >= 0; i -= 1) {
      const shard = shards[i];
      shard.life += dt;
      if (shard.life >= shard.maxLife) {
        shards.splice(i, 1);
        continue;
      }
      const dragStep = Math.pow(shard.drag, dt * 60);
      shard.vx *= dragStep;
      shard.vy *= dragStep;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.angle += shard.spin * dt;
      const k = 1 - shard.life / shard.maxLife;
      drawShard(ctx, shard, envelope * k * 0.8);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (elapsed >= durationMs + 500 || (elapsed >= durationMs && glows.length === 0 && shards.length === 0)) {
      ctx.clearRect(0, 0, width, height);
      running = false;
      window.clearInterval(timer);
    }
  };

  // 全画面の雲は24fpsでも動きが連続して見える。UI側へ描画時間を返す。
  const timer = window.setInterval(() => frame(performance.now()), 1000 / 24);
  return () => {
    running = false;
    window.clearInterval(timer);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
  };
}
