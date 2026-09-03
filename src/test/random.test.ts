import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO, KST_HOURLY_ARRIVAL_WEIGHTS } from "../sim/model";
import { durationCentralInterval, durationDistribution, empiricalDurationQuantile, inverseStandardNormalCdf, Random } from "../sim/random";
import { REALITY_DEFAULTS } from "../sim/realityDefaults";
import { generateDailyArrivalTimes, generateWorld } from "../sim/world";

describe("deterministic random world", () => {
  test("same seed creates the same values", () => {
    const a = new Random("same");
    const b = new Random("same");
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  test("derives log-normal parameters from a configurable central interval", () => {
    for (const coverage of [0.9, 0.95, 0.99]) {
      const distribution = durationDistribution({ lower: 10, upper: 40, coverage });
      expect(distribution.kind).toBe("logNormal");
      if (distribution.kind !== "logNormal") continue;
      const boundaryZ = inverseStandardNormalCdf((1 + coverage) / 2);
      expect(Math.exp(Math.log(distribution.median) - boundaryZ * distribution.sigma)).toBeCloseTo(10, 8);
      expect(Math.exp(Math.log(distribution.median) + boundaryZ * distribution.sigma)).toBeCloseTo(40, 8);
    }
  });

  test("equal interval bounds produce a fixed duration", () => {
    expect(durationDistribution({ lower: 7, upper: 7, coverage: 0.95 })).toEqual({ kind: "fixed", value: 7 });
  });

  test("preserves the observed CI duration statistics in empirical defaults", () => {
    const statistics = (distribution: typeof REALITY_DEFAULTS.ciSuccessDuration) => {
      const count = distribution.observations.reduce((sum, [, weight]) => sum + weight, 0);
      const mean = distribution.observations.reduce((sum, [minutes, weight]) => sum + minutes * weight, 0) / count;
      const variance = distribution.observations.reduce((sum, [minutes, weight]) => sum + weight * (minutes - mean) ** 2, 0) / (count - 1);
      return { count, mean, standardDeviation: Math.sqrt(variance) };
    };

    expect(statistics(REALITY_DEFAULTS.ciSuccessDuration)).toEqual(expect.objectContaining({ count: 2305 }));
    expect(statistics(REALITY_DEFAULTS.ciSuccessDuration).mean).toBeCloseTo(127.317744, 6);
    expect(statistics(REALITY_DEFAULTS.ciSuccessDuration).standardDeviation).toBeCloseTo(25.526836, 6);
    expect(empiricalDurationQuantile(REALITY_DEFAULTS.ciSuccessDuration, 0.25)).toBe(114.1);
    expect(empiricalDurationQuantile(REALITY_DEFAULTS.ciSuccessDuration, 0.5)).toBe(123.8);
    expect(empiricalDurationQuantile(REALITY_DEFAULTS.ciSuccessDuration, 0.75)).toBe(134.9);

    expect(statistics(REALITY_DEFAULTS.ciFailureDuration)).toEqual(expect.objectContaining({ count: 270 }));
    expect(statistics(REALITY_DEFAULTS.ciFailureDuration).mean).toBeCloseTo(63.559259, 6);
    expect(statistics(REALITY_DEFAULTS.ciFailureDuration).standardDeviation).toBeCloseTo(97.756787, 6);
    expect(empiricalDurationQuantile(REALITY_DEFAULTS.ciFailureDuration, 0.25)).toBe(20.325);
    expect(empiricalDurationQuantile(REALITY_DEFAULTS.ciFailureDuration, 0.5)).toBe(31.6);
    expect(empiricalDurationQuantile(REALITY_DEFAULTS.ciFailureDuration, 0.75)).toBe(72.7);
    expect(durationCentralInterval(REALITY_DEFAULTS.ciFailureDuration).coverage).toBe(0.95);
  });

  test("samples empirical durations only from observed values", () => {
    const distribution = { kind: "empirical" as const, observations: [[10, 1], [20, 3]] as Array<[number, number]> };
    const rng = new Random("empirical-duration");
    const samples = Array.from({ length: 100 }, () => rng.sampleDuration(distribution));
    expect(new Set(samples)).toEqual(new Set([10, 20]));
    expect(samples.filter((value) => value === 20).length).toBeGreaterThan(60);
  });

  test("uses the supplied KST hourly profile for a variable daily count", () => {
    expect(KST_HOURLY_ARRIVAL_WEIGHTS).toHaveLength(24);
    expect(KST_HOURLY_ARRIVAL_WEIGHTS.reduce<number>((sum, value) => sum + value, 0)).toBe(3334);
    const arrivals = generateDailyArrivalTimes(DEFAULT_SCENARIO.arrival, 33_340, new Random("arrival-profile"));
    expect(arrivals[0]).toBeGreaterThan(0);
    expect(arrivals.every((time, index) => index === 0 || time >= arrivals[index - 1])).toBe(true);
    const hourlyCounts = Array(24).fill(0) as number[];
    arrivals.forEach((time) => { hourlyCounts[Math.floor(time / 60) % 24] += 1; });
    expect(hourlyCounts[4]).toBe(0);
    const observedPeakShare = hourlyCounts[17] / arrivals.length;
    expect(observedPeakShare).toBeCloseTo(316 / 3334, 2);
    const elapsedDays = Math.ceil(arrivals.at(-1)! / 1440);
    expect(arrivals.length / elapsedDays).toBeCloseTo(DEFAULT_SCENARIO.arrival.meanPerDay, -1);
  });

  test("arrival volume does not change which PRs receive individual defects", () => {
    const slow = generateWorld({ ...DEFAULT_SCENARIO, prCount: 100, arrival: { ...DEFAULT_SCENARIO.arrival, meanPerDay: 10 } }, 3);
    const fast = generateWorld({ ...DEFAULT_SCENARIO, prCount: 100, arrival: { ...DEFAULT_SCENARIO.arrival, meanPerDay: 1000 } }, 3);
    expect(slow.prs.map((pr) => pr.individualDefect)).toEqual(fast.prs.map((pr) => pr.individualDefect));
    expect(slow.prs.map((pr) => pr.arrivalTime)).not.toEqual(fast.prs.map((pr) => pr.arrivalTime));
  });

  test("world respects bounds and is reproducible", () => {
    const config = { ...DEFAULT_SCENARIO, prCount: 100 };
    const a = generateWorld(config, 2);
    const b = generateWorld(config, 2);
    expect(a).toEqual(b);
    expect(a.prs).toHaveLength(100);
    expect(a.interactions.every((item) => new Set(item.members).size === item.members.length && item.members.length >= 2 && item.members.length <= 4)).toBe(true);
  });
});
