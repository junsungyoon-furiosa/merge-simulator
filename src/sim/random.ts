import type { Distribution } from "./model";

function xmur3(value: string): () => number {
  let h = 1779033703 ^ value.length;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Random {
  private state: number;
  private spareNormal: number | undefined;

  constructor(seed: string) {
    this.state = xmur3(seed)() || 1;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  bool(probability: number): boolean {
    return this.next() < probability;
  }

  integer(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  normal(): number {
    if (this.spareNormal !== undefined) {
      const spare = this.spareNormal;
      this.spareNormal = undefined;
      return spare;
    }
    const u = Math.max(Number.EPSILON, this.next());
    const v = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    this.spareNormal = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  }

  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()));
    const limit = Math.exp(-lambda);
    let product = 1;
    let count = 0;
    do { count += 1; product *= this.next(); } while (product > limit);
    return count - 1;
  }

  sample(distribution: Distribution): number {
    if (distribution.kind === "fixed") return distribution.value;
    if (distribution.kind === "uniform") return distribution.min + this.next() * (distribution.max - distribution.min);
    if (distribution.kind === "exponential") return -Math.log(Math.max(Number.EPSILON, 1 - this.next())) * distribution.mean;
    return Math.exp(Math.log(distribution.median) + distribution.sigma * this.normal());
  }
}

export function deriveSeed(base: string, ...parts: Array<string | number>): string {
  return [base, ...parts].join("::");
}
