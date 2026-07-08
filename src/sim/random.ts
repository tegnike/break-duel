// チューニングスクリプト用のシード付き決定的 RNG ヘルパー。
// Python 版の random.Random(randint / uniform / sample / choices) に相当する
// 操作を src/game.ts の makeRng（LCG）の上に実装する。
// Python の Mersenne Twister と数列は一致しないが、同一シードなら常に同じ結果になる。
import { makeRng } from "../game";

export class SimRandom {
  private readonly rng: () => number;

  constructor(seed: number) {
    this.rng = makeRng(seed);
  }

  /** [0, 1) の一様乱数 */
  random(): number {
    return this.rng();
  }

  /** a 以上 b 以下の整数（両端を含む） */
  randint(a: number, b: number): number {
    return a + Math.floor(this.rng() * (b - a + 1));
  }

  /** a 以上 b 未満の一様実数 */
  uniform(a: number, b: number): number {
    return a + (b - a) * this.rng();
  }

  /** 非復元抽出で k 個選ぶ（部分 Fisher-Yates） */
  sample<T>(items: readonly T[], k: number): T[] {
    if (k > items.length) throw new Error(`sample: k=${k} が母集団サイズ ${items.length} を超えています`);
    const pool = [...items];
    const result: T[] = [];
    for (let i = 0; i < k; i += 1) {
      const j = i + Math.floor(this.rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      result.push(pool[i]);
    }
    return result;
  }

  /** 重み付き復元抽出で 1 個選ぶ（Python の rng.choices(..., k=1)[0] 相当） */
  choiceWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) throw new Error("choiceWeighted: 候補が空です");
    if (items.length !== weights.length) throw new Error("choiceWeighted: items と weights の長さが不一致です");
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let threshold = this.rng() * total;
    for (let i = 0; i < items.length; i += 1) {
      threshold -= weights[i];
      if (threshold < 0) return items[i];
    }
    return items[items.length - 1];
  }
}
