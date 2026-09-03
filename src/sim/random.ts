import type { Distribution, DurationInterval, DurationModel, EmpiricalDurationDistribution } from "./model";

// Rational approximation of the standard normal quantile.
export function inverseStandardNormalCdf(probability: number): number {
  if (!(probability > 0 && probability < 1)) throw new RangeError("Probability must be between 0 and 1");
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (probability > high) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = probability - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function durationDistribution(interval: DurationInterval): Distribution {
  if (interval.lower === interval.upper) return { kind: "fixed", value: interval.lower };
  const boundaryZ = inverseStandardNormalCdf((1 + interval.coverage) / 2);
  return {
    kind: "logNormal",
    median: Math.sqrt(interval.lower * interval.upper),
    sigma: Math.log(interval.upper / interval.lower) / (2 * boundaryZ),
  };
}

export function isEmpiricalDuration(value: DurationModel): value is EmpiricalDurationDistribution {
  return "kind" in value && value.kind === "empirical";
}

export function empiricalDurationQuantile(distribution: EmpiricalDurationDistribution, probability: number): number {
  if (!(probability >= 0 && probability <= 1)) throw new RangeError("Probability must be between 0 and 1");
  const observations = [...distribution.observations].sort((left, right) => left[0] - right[0]);
  const total = observations.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0) throw new RangeError("Empirical duration distribution must not be empty");
  const valueAt = (index: number) => {
    let cursor = index;
    for (const [minutes, count] of observations) {
      if (cursor < count) return minutes;
      cursor -= count;
    }
    return observations.at(-1)![0];
  };
  const position = (total - 1) * probability;
  const lowerIndex = Math.floor(position);
  const fraction = position - lowerIndex;
  const lower = valueAt(lowerIndex);
  const upper = valueAt(Math.min(lowerIndex + 1, total - 1));
  return Number((lower + (upper - lower) * fraction).toFixed(10));
}

export function durationCentralInterval(model: DurationModel, coverage = 0.95): DurationInterval {
  if (!isEmpiricalDuration(model)) return model;
  const tail = (1 - coverage) / 2;
  return { lower: empiricalDurationQuantile(model, tail), upper: empiricalDurationQuantile(model, 1 - tail), coverage };
}

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

  sampleDuration(model: DurationModel): number {
    if (!isEmpiricalDuration(model)) return this.sample(durationDistribution(model));
    const total = model.observations.reduce((sum, [, count]) => sum + count, 0);
    if (total <= 0) throw new RangeError("Empirical duration distribution must not be empty");
    let cursor = this.next() * total;
    for (const [minutes, count] of model.observations) {
      cursor -= count;
      if (cursor < 0) return minutes;
    }
    return model.observations.at(-1)![0];
  }
}

export function deriveSeed(base: string, ...parts: Array<string | number>): string {
  return [base, ...parts].join("::");
}
