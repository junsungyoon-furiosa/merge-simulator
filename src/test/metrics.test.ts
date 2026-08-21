import { expect, test } from "vitest";
import { describe } from "../sim/metrics";

test("distribution statistics include interpolated percentiles", () => {
  const stats = describe([1, 2, 3, 4]);
  expect(stats.mean).toBe(2.5);
  expect(stats.variance).toBe(1.25);
  expect(stats.p50).toBe(2.5);
  expect(stats.p95).toBeCloseTo(3.85);
});
