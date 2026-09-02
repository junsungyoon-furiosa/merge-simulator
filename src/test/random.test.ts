import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO, KST_HOURLY_ARRIVAL_WEIGHTS } from "../sim/model";
import { durationDistribution, inverseStandardNormalCdf, Random } from "../sim/random";
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
