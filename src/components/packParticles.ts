// パック開封の確定演出用 Canvas 2D エンジン。
// SR は金色の収束光、UR はプリズム破砕光、UR カットインは Break Duel 固有の
// 六角形・回路・亀裂で構成し、汎用的な白い魔法陣に見えないようにする。

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
};

const SR_COLORS = ["#fff3ad", "#ffd34e", "#ff9f1c"];
const UR_COLORS = ["#ffffff", "#67e8f9", "#60a5fa", "#c084fc", "#f472b6", "#facc15"];

function makeGlowSprite(inner: string, mid: string): HTMLCanvasElement {
  const size = 128;
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

function buildSprites(theme: OmenTheme): SpriteSet {
  if (theme === "ur") {
    return {
      // 白飛びを抑え、青紫のエッジが残るコア
      core: makeGlowSprite("rgba(255, 255, 255, 0.86)", "rgba(103, 232, 249, 0.28)"),
      sparks: [
        makeGlowSprite("rgba(255, 255, 255, 0.96)", "rgba(255, 255, 255, 0.34)"),
        makeGlowSprite("rgba(165, 243, 252, 0.96)", "rgba(34, 211, 238, 0.42)"),
        makeGlowSprite("rgba(191, 219, 254, 0.96)", "rgba(59, 130, 246, 0.4)"),
        makeGlowSprite("rgba(233, 213, 255, 0.96)", "rgba(168, 85, 247, 0.4)"),
        makeGlowSprite("rgba(251, 207, 232, 0.96)", "rgba(236, 72, 153, 0.38)"),
      ],
    };
  }
  return {
    // 黄一色の面光源ではなく、琥珀色の芯を持つ金属的な金光
    core: makeGlowSprite("rgba(255, 249, 214, 0.9)", "rgba(245, 158, 11, 0.3)"),
    sparks: [
      makeGlowSprite("rgba(255, 251, 235, 0.96)", "rgba(253, 224, 71, 0.4)"),
      makeGlowSprite("rgba(254, 240, 138, 0.96)", "rgba(245, 158, 11, 0.38)"),
      makeGlowSprite("rgba(253, 186, 116, 0.92)", "rgba(234, 88, 12, 0.3)"),
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

function drawShard(ctx: CanvasRenderingContext2D, shard: ShardParticle, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(shard.x, shard.y);
  ctx.rotate(shard.angle);
  ctx.globalAlpha = Math.min(alpha, 1);
  ctx.fillStyle = shard.color;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
  ctx.lineWidth = 0.7;
  ctx.shadowColor = shard.color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(-shard.length * 0.5, 0);
  ctx.lineTo(0, -shard.width * 0.5);
  ctx.lineTo(shard.length * 0.5, 0);
  ctx.lineTo(0, shard.width * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation: number,
) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function drawConvergingLight(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  theme: OmenTheme,
  width: number,
  envelope: number,
  elapsed: number,
) {
  const colors = theme === "sr" ? SR_COLORS : UR_COLORS.slice(1);
  const beamCount = theme === "sr" ? 3 : 5;
  const spread = theme === "sr" ? 190 : 300;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < beamCount; i += 1) {
    const ratio = i / (beamCount - 1);
    const topX = origin.x + (ratio - 0.5) * spread + Math.sin(elapsed / 240 + i) * 12;
    const color = colors[i % colors.length];
    const gradient = ctx.createLinearGradient(topX, 0, origin.x, origin.y);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.58, color);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.08)");
    ctx.globalAlpha = envelope * (theme === "sr" ? 0.09 : 0.075);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(topX - 18, 0);
    ctx.lineTo(topX + 18, 0);
    ctx.lineTo(origin.x + 10, origin.y);
    ctx.lineTo(origin.x - 10, origin.y);
    ctx.closePath();
    ctx.fill();
  }

  // カード位置へ焦点を作る細い十字フレア。UR は斜めにも割れてプリズム感を出す。
  const flare = (0.72 + Math.sin(elapsed / 75) * 0.16) * envelope;
  ctx.globalAlpha = flare;
  ctx.lineCap = "round";
  ctx.strokeStyle = theme === "sr" ? "rgba(255, 226, 115, 0.88)" : "rgba(186, 230, 253, 0.82)";
  ctx.shadowColor = theme === "sr" ? "#f59e0b" : "#67e8f9";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(origin.x - Math.min(150, width * 0.18), origin.y);
  ctx.lineTo(origin.x + Math.min(150, width * 0.18), origin.y);
  ctx.moveTo(origin.x, origin.y - 120);
  ctx.lineTo(origin.x, origin.y + 90);
  if (theme === "ur") {
    ctx.moveTo(origin.x - 105, origin.y + 80);
    ctx.lineTo(origin.x + 105, origin.y - 80);
  }
  ctx.stroke();
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
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  const sparkCount = theme === "sr" ? 76 : 112;
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

  const shardCount = theme === "sr" ? 24 : 58;
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
      const emission = theme === "sr" ? 3 : 5;
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
    drawConvergingLight(ctx, origin, theme, width, envelope, elapsed);
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

function drawHexCircuit(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
  rotation: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 1.6;
  tracePolygon(ctx, center.x, center.y, radius, 6, rotation);
  ctx.stroke();

  // 各頂点から伸びる短い回路と終端ノード
  for (let i = 0; i < 6; i += 1) {
    const angle = rotation + (i / 6) * Math.PI * 2;
    const inner = radius + 8;
    const outer = radius + (i % 2 === 0 ? 34 : 22);
    const x1 = center.x + Math.cos(angle) * inner;
    const y1 = center.y + Math.sin(angle) * inner;
    const x2 = center.x + Math.cos(angle) * outer;
    const y2 = center.y + Math.sin(angle) * outer;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillRect(x2 - 2, y2 - 2, 4, 4);
  }
  ctx.restore();
}

// UR 確定カットイン。円形ルーンではなく、六角ゲートが解錠されて亀裂が走る演出。
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
  const glows: GlowParticle[] = [];
  const shards: ShardParticle[] = [];
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

  for (let i = 0; i < 120; i += 1) {
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
  for (let i = 0; i < 96; i += 1) {
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

    const vignette = ctx.createRadialGradient(center.x, center.y, 40, center.x, center.y, Math.max(width, height) * 0.62);
    vignette.addColorStop(0, `rgba(15, 43, 64, ${0.2 * envelope})`);
    vignette.addColorStop(0.5, `rgba(12, 18, 40, ${0.28 * envelope})`);
    vignette.addColorStop(1, `rgba(0, 0, 8, ${0.72 * envelope})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "lighter";
    const pulse = 1 + Math.sin(elapsed / 90) * 0.055;
    drawSprite(ctx, sprites.core, center.x, center.y, 200 * pulse, 104 * pulse, envelope * 0.52);

    // 解錠時に外へ走る六角ショックウェーブ
    for (let ring = 0; ring < 3; ring += 1) {
      const ringT = clamp01(t * 1.5 - ring * 0.15);
      if (ringT <= 0 || ringT >= 1) continue;
      const radius = 34 + ringT * Math.min(440, Math.max(width, height) * 0.46);
      const color = UR_COLORS[(ring + 1) % UR_COLORS.length];
      ctx.save();
      ctx.globalAlpha = (1 - ringT) * 0.7 * envelope;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2;
      tracePolygon(ctx, center.x, center.y, radius, 6, -Math.PI / 6 + ringT * 0.2);
      ctx.stroke();
      ctx.restore();
    }

    // 中央の六角ゲート。3層を逆回転させて機械的な解錠感を出す。
    const gateIn = Math.min(1, t / 0.24);
    const gateScale = 0.72 + gateIn * 0.28;
    drawHexCircuit(ctx, center, 112 * gateScale, -Math.PI / 6 + elapsed / 5200, "#67e8f9", envelope * 0.86);
    drawHexCircuit(ctx, center, 148 * gateScale, -Math.PI / 6 - elapsed / 6900, "#c084fc", envelope * 0.62);
    drawHexCircuit(ctx, center, 182 * gateScale, -Math.PI / 6 + elapsed / 8800, "#f472b6", envelope * 0.38);

    // 画面を切り裂く2本の色収差スラッシュ
    const slashT = clamp01((t - 0.08) / 0.34);
    if (slashT > 0 && slashT < 1) {
      const travel = (slashT - 0.5) * Math.max(width, height) * 1.45;
      const slashAlpha = Math.sin(slashT * Math.PI) * envelope;
      ctx.save();
      ctx.translate(center.x + travel, center.y);
      ctx.rotate(-0.68);
      ctx.globalAlpha = slashAlpha;
      ctx.lineCap = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#67e8f9";
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -360);
      ctx.lineTo(0, 360);
      ctx.stroke();
      ctx.translate(12, 0);
      ctx.strokeStyle = "#f472b6";
      ctx.shadowColor = "#ec4899";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -320);
      ctx.lineTo(0, 320);
      ctx.stroke();
      ctx.restore();
    }

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

  const timer = window.setInterval(() => frame(performance.now()), 16);
  return () => {
    running = false;
    window.clearInterval(timer);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
  };
}
