import { ATTRIBUTES, type Attribute, type Card } from "./game";

// 召喚獣/遺物の着地演出（属性バースト+属性SFX）のための共有定義。
// 効果音は音声アセットを追加せず、WebAudio 用のサンプル列をその場で合成する。

export type SummonSfxKind =
  | "summon-fire"
  | "summon-water"
  | "summon-wind"
  | "summon-earth"
  | "relic-place";

export type SummonArrival = {
  kind: "summon" | "relic";
  attribute?: Attribute;
  subAttribute?: Attribute;
};

/** SFX_ASSETS の src がこの接頭辞のときはファイル取得ではなく合成でバッファを作る */
export const SYNTH_SFX_PREFIX = "synth:";

/** 場/遺物への配置で着地演出を出すカードなら arrival 情報を返す */
export function summonArrivalForCard(card: Card): SummonArrival | null {
  if (card.type === "memory") return { kind: "relic" };
  if (card.type !== "ai") return null;
  return { kind: "summon", attribute: card.attribute, subAttribute: card.subAttribute };
}

const ATTRIBUTE_SFX_KIND: Record<Attribute, SummonSfxKind> = {
  火: "summon-fire",
  水: "summon-water",
  風: "summon-wind",
  土: "summon-earth",
};

export function summonSfxKind(arrival: SummonArrival): SummonSfxKind | null {
  if (arrival.kind === "relic") return "relic-place";
  return arrival.attribute ? ATTRIBUTE_SFX_KIND[arrival.attribute] : null;
}

/** バースト/オーラで使う発光色。ATTRIBUTES の基調色より明るいハイライト */
export const ATTRIBUTE_FX_HIGHLIGHT: Record<Attribute, string> = {
  火: "#ff8a5c",
  水: "#58a6ff",
  風: "#4fd8a8",
  土: "#d9a05b",
};

export const RELIC_FX_HIGHLIGHT = "#ffd166";

export function summonAuraColor(arrival: SummonArrival): string | null {
  if (arrival.kind === "relic") return RELIC_FX_HIGHLIGHT;
  return arrival.attribute ? ATTRIBUTE_FX_HIGHLIGHT[arrival.attribute] : null;
}

export function attributeBurstColor(attribute: Attribute): string {
  return ATTRIBUTES[attribute].color;
}

// --- 効果音の合成 ---

const SFX_PEAK = 0.88;
const FADE_OUT_SECONDS = 0.015;

/** 決定的な乱数（テストと再現性のため Math.random は使わない） */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function onePoleCoefficient(cutoffHz: number, sampleRate: number) {
  return 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
}

/**
 * 属性別の召喚効果音サンプルを合成する純粋関数。
 * 火=低い炸裂とパチパチ、水=水滴と飛沫、風=吹き抜ける風切り、
 * 土=地響きの一撃、遺物=鐘のような倍音の煌めき。
 */
export function renderSummonSfxSamples(kind: SummonSfxKind, sampleRate: number): Float32Array<ArrayBuffer> {
  switch (kind) {
    case "summon-fire":
      return renderFire(sampleRate);
    case "summon-water":
      return renderWater(sampleRate);
    case "summon-wind":
      return renderWind(sampleRate);
    case "summon-earth":
      return renderEarth(sampleRate);
    case "relic-place":
      return renderRelic(sampleRate);
  }
}

/**
 * 簡易残響。フィードバック付きマルチタップディレイで、
 * ドライな合成音に空間の奥行きを足して安っぽさを消す。
 */
function applyEcho(samples: Float32Array<ArrayBuffer>, sampleRate: number, amount: number) {
  const taps: { delaySeconds: number; gain: number }[] = [
    { delaySeconds: 0.041, gain: 0.34 },
    { delaySeconds: 0.067, gain: 0.27 },
    { delaySeconds: 0.097, gain: 0.21 },
  ];
  for (const tap of taps) {
    const delaySamples = Math.floor(tap.delaySeconds * sampleRate);
    const gain = tap.gain * amount;
    for (let i = delaySamples; i < samples.length; i += 1) {
      samples[i] += samples[i - delaySamples] * gain;
    }
  }
}

function finalize(samples: Float32Array<ArrayBuffer>, sampleRate: number): Float32Array<ArrayBuffer> {
  // レイヤーの重なりを軽くサチュレーションさせて一体感を出す
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.tanh(samples[i] * 1.2);
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const magnitude = Math.abs(samples[i]);
    if (magnitude > peak) peak = magnitude;
  }
  const scale = peak > 0 ? SFX_PEAK / peak : 0;
  const fadeSamples = Math.min(samples.length, Math.floor(FADE_OUT_SECONDS * sampleRate));
  for (let i = 0; i < samples.length; i += 1) {
    let value = samples[i] * scale;
    const remaining = samples.length - i;
    if (remaining < fadeSamples) value *= remaining / fadeSamples;
    samples[i] = value;
  }
  return samples;
}

function renderFire(sampleRate: number): Float32Array<ArrayBuffer> {
  const duration = 1.0;
  const impactAt = 0.12;
  const length = Math.floor(duration * sampleRate);
  const samples = new Float32Array(length);
  const random = mulberry32(0xf17e);
  const swellLpCoefficient = onePoleCoefficient(900, sampleRate);
  const crackleLpCoefficient = onePoleCoefficient(2100, sampleRate);
  let phase = 0;
  let subPhase = 0;
  let swellLp = 0;
  let crackleLp = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const noise = random() * 2 - 1;
    // 着火前の吸い込むような吹き上がり（リバースウーッシュ）
    swellLp += swellLpCoefficient * (noise - swellLp);
    const swellEnvelope = t < impactAt ? Math.pow(t / impactAt, 2.2) : Math.exp(-(t - impactAt) / 0.05);
    let value = swellLp * swellEnvelope * 1.5;
    if (t >= impactAt) {
      const tau = t - impactAt;
      // 沈み込む炎の轟き + 1オクターブ下のサブ
      const frequency = 44 + 76 * Math.exp(-tau * 7);
      phase += (2 * Math.PI * frequency) / sampleRate;
      subPhase += (Math.PI * frequency) / sampleRate;
      const boomEnvelope = Math.min(1, tau / 0.006) * Math.exp(-tau / 0.28);
      value += (Math.sin(phase) + Math.sin(subPhase) * 0.6) * boomEnvelope * 1.1;
      // 火の粉の爆ぜ（こもらせたパチパチ）
      const crackleDensity = 0.02 * Math.exp(-tau / 0.42);
      const tick = random() < crackleDensity ? (random() * 2 - 1) : 0;
      crackleLp += crackleLpCoefficient * (tick * 2.4 - crackleLp);
      value += crackleLp * 0.55;
    }
    samples[i] = value;
  }
  applyEcho(samples, sampleRate, 1);
  return finalize(samples, sampleRate);
}

function renderWater(sampleRate: number): Float32Array<ArrayBuffer> {
  const duration = 0.95;
  const length = Math.floor(duration * sampleRate);
  const samples = new Float32Array(length);
  const random = mulberry32(0x7a7e2);
  const splashLpCoefficient = onePoleCoefficient(1300, sampleRate);
  const splashHpCoefficient = onePoleCoefficient(380, sampleRate);
  // 深い水面へ落ちる雫の連なり（音程と間隔をずらして機械的な印象を消す）
  const drips = [
    { at: 0.02, detune: 1, gain: 1 },
    { at: 0.11, detune: 0.88, gain: 0.66 },
    { at: 0.22, detune: 1.14, gain: 0.5 },
  ];
  const dripPhases = drips.map(() => 0);
  let lowPhase = 0;
  let splashLp = 0;
  let splashHpState = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let value = 0;
    drips.forEach((drip, dripIndex) => {
      if (t < drip.at) return;
      const tau = t - drip.at;
      const frequency = (250 + 340 * Math.min(1, tau / 0.09)) * drip.detune;
      dripPhases[dripIndex] += (2 * Math.PI * frequency) / sampleRate;
      const envelope = Math.min(1, tau / 0.008) * Math.exp(-tau / 0.1);
      value += Math.sin(dripPhases[dripIndex]) * envelope * drip.gain * 0.75;
    });
    // 水面のうねりと飛沫
    const noise = random() * 2 - 1;
    splashLp += splashLpCoefficient * (noise - splashLp);
    splashHpState += splashHpCoefficient * (splashLp - splashHpState);
    const band = splashLp - splashHpState;
    const tremolo = 1 + 0.25 * Math.sin(2 * Math.PI * 6.5 * t);
    value += band * Math.min(1, t / 0.03) * Math.exp(-t / 0.3) * tremolo * 1.3;
    // 深みを出す低い水鳴り
    lowPhase += (2 * Math.PI * 84) / sampleRate;
    value += Math.sin(lowPhase) * Math.min(1, t / 0.02) * Math.exp(-t / 0.22) * 0.35;
    samples[i] = value;
  }
  applyEcho(samples, sampleRate, 1.1);
  return finalize(samples, sampleRate);
}

function renderWind(sampleRate: number): Float32Array<ArrayBuffer> {
  const duration = 1.05;
  const length = Math.floor(duration * sampleRate);
  const samples = new Float32Array(length);
  const random = mulberry32(0x717d);
  let fastLpA = 0;
  let slowLpA = 0;
  let fastLpB = 0;
  let slowLpB = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const progress = t / duration;
    const noise = random() * 2 - 1;
    // 二層の風切り帯域を少しずらして重ね、単調なノイズ感を消す
    const sweepA = Math.sin(Math.PI * progress);
    const centerA = 350 + 1550 * sweepA;
    fastLpA += onePoleCoefficient(centerA, sampleRate) * (noise - fastLpA);
    slowLpA += onePoleCoefficient(centerA * 0.4, sampleRate) * (noise - slowLpA);
    const sweepB = Math.sin(Math.PI * Math.pow(progress, 0.72));
    const centerB = 520 + 1900 * sweepB;
    fastLpB += onePoleCoefficient(centerB, sampleRate) * (noise - fastLpB);
    slowLpB += onePoleCoefficient(centerB * 0.45, sampleRate) * (noise - slowLpB);
    // 息づくような揺らぎ
    const flutter = 1 + 0.18 * Math.sin(2 * Math.PI * 5.3 * t);
    const value = ((fastLpA - slowLpA) * Math.pow(sweepA, 1.3) + (fastLpB - slowLpB) * Math.pow(sweepB, 1.5) * 0.8) * flutter;
    samples[i] = value * 2.2;
  }
  applyEcho(samples, sampleRate, 0.9);
  return finalize(samples, sampleRate);
}

function renderEarth(sampleRate: number): Float32Array<ArrayBuffer> {
  const duration = 1.15;
  const length = Math.floor(duration * sampleRate);
  const samples = new Float32Array(length);
  const random = mulberry32(0xea27);
  const rumbleCoefficient = onePoleCoefficient(95, sampleRate);
  const debrisCoefficient = onePoleCoefficient(950, sampleRate);
  // 落着後にパラパラと崩れる岩片
  const debrisHits = [
    { at: 0.1, gain: 0.5 },
    { at: 0.18, gain: 0.4 },
    { at: 0.29, gain: 0.3 },
    { at: 0.41, gain: 0.22 },
  ];
  let phase = 0;
  let subPhase = 0;
  let rumbleLp = 0;
  let debrisLp = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const noise = random() * 2 - 1;
    // 地面を割る重低音の一撃 + サブベース
    const frequency = 36 + 52 * Math.exp(-t * 9);
    phase += (2 * Math.PI * frequency) / sampleRate;
    subPhase += (Math.PI * frequency) / sampleRate;
    const thudEnvelope = Math.min(1, t / 0.004) * Math.exp(-t / 0.32);
    let value = (Math.sin(phase) * 1.2 + Math.sin(subPhase) * 0.7) * thudEnvelope;
    // 地響きの尾
    rumbleLp += rumbleCoefficient * (noise - rumbleLp);
    value += rumbleLp * Math.exp(-t / 0.5) * 1.6;
    // 岩片の崩落
    let debris = 0;
    for (const hit of debrisHits) {
      if (t >= hit.at && t < hit.at + 0.05) debris += noise * hit.gain * Math.exp(-(t - hit.at) / 0.02);
    }
    debrisLp += debrisCoefficient * (debris * 2 - debrisLp);
    value += debrisLp * 0.7;
    samples[i] = value;
  }
  applyEcho(samples, sampleRate, 1.05);
  return finalize(samples, sampleRate);
}

function renderRelic(sampleRate: number): Float32Array<ArrayBuffer> {
  const duration = 1.35;
  const length = Math.floor(duration * sampleRate);
  const samples = new Float32Array(length);
  // 神秘的なパッド（デチューンした和音の重なり）+ 鐘 + 高音の煌めき
  const pad: { frequency: number; gain: number; decay: number }[] = [
    { frequency: 392, gain: 0.8, decay: 0.55 },
    { frequency: 392 * 1.004, gain: 0.55, decay: 0.5 },
    { frequency: 587, gain: 0.5, decay: 0.42 },
    { frequency: 587 * 0.996, gain: 0.35, decay: 0.4 },
    { frequency: 784, gain: 0.38, decay: 0.34 },
  ];
  const bell = { frequency: 1568, gain: 0.24, decay: 0.26 };
  const glitters = [
    { at: 0.18, frequency: 3136, gain: 0.14 },
    { at: 0.36, frequency: 2637, gain: 0.12 },
    { at: 0.55, frequency: 3520, gain: 0.1 },
    { at: 0.76, frequency: 2093, gain: 0.09 },
  ];
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const padAttack = Math.min(1, t / 0.11);
    let value = 0;
    for (const partial of pad) {
      value += Math.sin(2 * Math.PI * partial.frequency * t) * partial.gain * padAttack * Math.exp(-t / partial.decay);
    }
    value += Math.sin(2 * Math.PI * bell.frequency * t) * bell.gain * Math.min(1, t / 0.004) * Math.exp(-t / bell.decay);
    for (const glitter of glitters) {
      if (t < glitter.at) continue;
      const tau = t - glitter.at;
      value += Math.sin(2 * Math.PI * glitter.frequency * tau) * glitter.gain * Math.min(1, tau / 0.005) * Math.exp(-tau / 0.07);
    }
    samples[i] = value * 0.55;
  }
  applyEcho(samples, sampleRate, 1.35);
  return finalize(samples, sampleRate);
}
