import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO } from "../sim/model";
import { durationDistribution, inverseStandardNormalCdf, Random } from "../sim/random";
import { generateWorld } from "../sim/world";

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

  test("world respects bounds and is reproducible", () => {
    const config = { ...DEFAULT_SCENARIO, prCount: 100 };
    const a = generateWorld(config, 2);
    const b = generateWorld(config, 2);
    expect(a).toEqual(b);
    expect(a.prs).toHaveLength(100);
    expect(a.interactions.every((item) => new Set(item.members).size === item.members.length && item.members.length >= 2 && item.members.length <= 4)).toBe(true);
  });
});
